from odoo import models, fields, api
from odoo.exceptions import UserError
from datetime import datetime, date


class RepairOsProcess(models.Model):
    """
    Processo de Reparo / Fabricação vinculado a uma OS.

    Estados:
      ready       → Pronto para iniciar
      progress    → Em andamento (cronômetro rodando)
      paused      → Pausado (cronômetro acumulado)
      pending_cq  → Aguardando inspeção de qualidade
      done        → Concluído e aprovado
      cancel      → Cancelado
    """
    _name = 'repair.os.process'
    _description = 'Processo da OS'
    _order = 'repair_id, component_type_id, sequence, id'
    _inherit = ['mail.thread']

    # ── Vínculo com a OS ──────────────────────────────────────────────

    repair_id = fields.Many2one(
        comodel_name='repair.order',
        string='Ordem de Serviço',
        required=True,
        ondelete='cascade',
        index=True,
    )

    # ── Sequência e identificação ─────────────────────────────────────

    sequence = fields.Integer(string='Seq.', default=10)
    component_type_id = fields.Many2one(
        comodel_name='repair.component.type',
        string='Componente',
        index=True,
    )
    name = fields.Char(string='Operação', required=True)
    service_description = fields.Text(string='Descrição Detalhada')

    # ── Máquina e Operador ────────────────────────────────────────────

    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Máquina',
        index=True,
    )
    operator_id = fields.Many2one(
        'repair.machine.operator',
        string='Operador',
        domain="[('machine_id', '=', machine_id)]",
        ondelete='set null',
    )

    # ── Datas ─────────────────────────────────────────────────────────

    date_planned = fields.Date(string='Data Programada')
    date_start = fields.Datetime(string='Data Início', readonly=True, copy=False)
    date_start_orig = fields.Datetime(
        string='Início Original', readonly=True, copy=False,
        help='Data do primeiro início — não muda com pausas.',
    )
    date_finished = fields.Datetime(string='Data Conclusão', readonly=True, copy=False)

    # ── Cronômetro ────────────────────────────────────────────────────

    duration_acc = fields.Float(
        string='Duração Acumulada (min)', default=0.0, copy=False,
        help='Tempo acumulado de todas as sessões em minutos.',
    )
    duration_planned = fields.Float(string='Tempo Previsto (min)', default=0.0)
    duration_display = fields.Char(
        string='Tempo', compute='_compute_duration_display', store=False,
    )

    # ── Estado ────────────────────────────────────────────────────────

    state = fields.Selection(
        selection=[
            ('ready',      'Pronto'),
            ('progress',   'Em Andamento'),
            ('paused',     'Pausado'),
            ('pending_cq', 'Aguardando CQ'),
            ('done',       'Concluído'),
            ('cancel',     'Cancelado'),
        ],
        string='Situação',
        default='ready',
        required=True,
        tracking=True,
        index=True,
    )

    # ── Controle de Qualidade ─────────────────────────────────────────

    requires_cq = fields.Boolean(
        string='Requer Inspeção de Qualidade?',
        default=False,
        help='Se marcado, ao concluir o processo vai para Aguardando CQ '
             'antes de ser marcado como Concluído.',
    )


    cq_result = fields.Selection(
        selection=[
            ('pending',  'Pendente'),
            ('approved', 'Aprovado'),
            ('rejected', 'Reprovado'),
        ],
        string='Resultado CQ',
        default='pending',
        tracking=True,
    )
    cq_rejection_count = fields.Integer(
        string='Nº de Reprovações',
        default=0,
        copy=False,
        help='Contador de quantas vezes este processo foi reprovado no CQ.',
    )
    cq_notes = fields.Text(
        string='Observações CQ',
        copy=False,
        help='Última observação do inspetor de qualidade.',
    )

    # ── Desvio ────────────────────────────────────────────────────────

    has_deviation = fields.Boolean(string='Desvio?', default=False, tracking=True)
    deviation_notes = fields.Text(string='Descrição do Desvio')
    deviation_action = fields.Selection(
        selection=[
            ('pause',  'Pausar'),
            ('cancel', 'Cancelar e recriar como Pronto'),
        ],
        string='Ação após Desvio',
        default='pause',
    )
    deviation_icon = fields.Char(
        compute='_compute_deviation_icon', store=False,
    )
    deviation_tooltip = fields.Char(
        compute='_compute_deviation_icon', store=False,
    )
    attachment_ids = fields.Many2many(
        comodel_name='ir.attachment',
        relation='repair_process_attachment_rel',
        column1='process_id',
        column2='attachment_id',
        string='Anexos / Desenhos',
    )

    # ── Labels computados ─────────────────────────────────────────────

    component_name = fields.Char(
        compute='_compute_component_name', store=False,
    )
    operation_label = fields.Char(
        compute='_compute_operation_label', store=True,
    )

    # ── Computes ──────────────────────────────────────────────────────

    @api.depends('component_type_id')
    def _compute_component_name(self):
        for rec in self:
            rec.component_name = rec.component_type_id.name or ''

    @api.depends('component_type_id.name', 'name')
    def _compute_operation_label(self):
        for rec in self:
            parts = []
            if rec.component_type_id:
                parts.append(rec.component_type_id.name)
            if rec.name:
                parts.append(rec.name)
            rec.operation_label = ' — '.join(filter(None, parts))

    @api.depends('duration_acc', 'state', 'date_start')
    def _compute_duration_display(self):
        for rec in self:
            if rec.state == 'progress' and rec.date_start:
                delta = datetime.now() - rec.date_start.replace(tzinfo=None)
                minutes = (rec.duration_acc or 0.0) + delta.total_seconds() / 60
            else:
                minutes = rec.duration_acc or 0.0
            total_sec = int(minutes * 60)
            h = total_sec // 3600
            m = (total_sec % 3600) // 60
            s = total_sec % 60
            rec.duration_display = '%02d:%02d:%02d' % (h, m, s)


    @api.depends('has_deviation', 'deviation_notes')
    def _compute_deviation_icon(self):
        for rec in self:
            rec.deviation_icon = '⚠' if rec.has_deviation else '○'
            if rec.has_deviation and rec.deviation_notes:
                rec.deviation_tooltip = rec.deviation_notes[:120]
            elif rec.has_deviation:
                rec.deviation_tooltip = 'Desvio registrado (sem descrição)'
            else:
                rec.deviation_tooltip = 'Sem desvio'

    # ── Validações ────────────────────────────────────────────────────

    def _validate_os_started(self):
        for rec in self:
            if rec.repair_id and rec.repair_id.os_state not in ('confirmed', 'in_progress'):
                raise UserError(
                    'A OS "%s" precisa estar CONFIRMADA ou EM ANDAMENTO para iniciar processos.'
                    % (rec.repair_id.os_number or rec.repair_id.name)
                )

    def _validate_sequence(self):
        """
        Valida se o processo pode iniciar.

        Prioridade:
        1. Se bypass_sequence na máquina → ignora sequência numérica
        2. Senão → valida sequência numérica dentro do componente
        """
        for rec in self:
            # 1. Bypass por máquina
            if rec.machine_id and rec.machine_id.bypass_sequence:
                continue

            # 4. Sem componente definido — sem validação de sequência
            if not rec.component_type_id:
                continue

            # 5. Sequência numérica normal
            prev = self.search([
                ('repair_id', '=', rec.repair_id.id),
                ('component_type_id', '=', rec.component_type_id.id),
                ('sequence', '<', rec.sequence),
                ('id', '!=', rec.id),
                ('state', 'not in', ('done', 'pending_cq', 'cancel')),
            ], limit=1, order='sequence desc')
            if prev:
                raise UserError(
                    'Processo "%s" (seq. %d) aguardando conclusão de "%s" (seq. %d).'
                    % (rec.operation_label, rec.sequence,
                       prev.operation_label, prev.sequence)
                )

    def _validate_machine_available(self):
        for rec in self:
            if not rec.machine_id:
                continue
            if rec.machine_id.allow_parallel:
                continue
            busy = self.search([
                ('machine_id', '=', rec.machine_id.id),
                ('state', '=', 'progress'),
                ('id', '!=', rec.id),
            ], limit=1)
            if busy:
                raise UserError(
                    '⚠ %s em uso na OS %s — Operação: %s.\n'
                    'Aguarde a conclusão antes de iniciar nesta máquina.'
                    % (rec.machine_id.name,
                       busy.repair_id.os_number or busy.repair_id.name,
                       busy.operation_label)
                )

    # ── Ações do Operador ─────────────────────────────────────────────

    def action_start(self):
        """Iniciar processo — primeiro início ou retomada após pausa."""
        self._validate_os_started()
        self._validate_sequence()
        self._validate_machine_available()

        now = datetime.now()
        machines = self.env['repair.machine']
        for rec in self:
            if rec.state not in ('ready', 'paused'):
                continue
            vals = {'state': 'progress', 'date_start': now}
            if not rec.date_start_orig:
                vals['date_start_orig'] = now
            rec.write(vals)
            if rec.machine_id:
                machines |= rec.machine_id
        machines._update_busy_status()
        for rec in self:
            rec._notify_process_update('progress')
        return False

    def action_pause(self):
        """Pausar processo — acumula tempo decorrido."""
        machines = self.env['repair.machine']
        for rec in self:
            if rec.state != 'progress':
                continue
            elapsed = 0.0
            if rec.date_start:
                elapsed = (datetime.now() - rec.date_start.replace(tzinfo=None)).total_seconds() / 60
            rec.write({
                'state': 'paused',
                'duration_acc': (rec.duration_acc or 0.0) + elapsed,
                'date_start': False,
            })
            if rec.machine_id:
                machines |= rec.machine_id
        machines._update_busy_status()
        for rec in self:
            rec._notify_process_update('paused')
        return False

    def action_finish(self):
        """
        Concluir processo.
        Se requires_cq → vai para pending_cq aguardando inspeção.
        Caso contrário → vai direto para done.
        """
        for rec in self:
            if rec.state not in ('progress', 'paused'):
                raise UserError(
                    'Apenas processos Em Andamento ou Pausados podem ser concluídos.'
                )
            # Acumula tempo se estava em andamento
            elapsed = 0.0
            if rec.state == 'progress' and rec.date_start:
                elapsed = (datetime.now() - rec.date_start.replace(tzinfo=None)).total_seconds() / 60

            if rec.requires_cq:
                # Vai para inspeção de qualidade
                rec.write({
                    'state': 'pending_cq',
                    'duration_acc': (rec.duration_acc or 0.0) + elapsed,
                    'date_start': False,
                })
                if rec.machine_id:
                    rec.machine_id._update_busy_status()
                rec._notify_process_update('pending_cq')
            else:
                # Conclui direto
                rec._do_finish(elapsed)
        return False

    def _do_finish(self, elapsed=0.0):
        """Finalização efetiva — chamada pelo action_finish ou pelo módulo CQ."""
        now = datetime.now()
        for rec in self:
            extra = elapsed
            # Se ainda estava em andamento (chamada direta do CQ)
            if rec.state == 'progress' and rec.date_start and not elapsed:
                extra = (now - rec.date_start.replace(tzinfo=None)).total_seconds() / 60
            rec.write({
                'state': 'done',
                'date_finished': now,
                'duration_acc': (rec.duration_acc or 0.0) + extra,
                'date_start': False,
                'cq_result': 'approved' if rec.requires_cq else 'pending',
            })
            if rec.machine_id:
                rec.machine_id._update_busy_status()
            rec._notify_process_update('done')

    def action_cancel(self):
        """Cancelar processo."""
        machines = self.env['repair.machine']
        for rec in self:
            if rec.state == 'progress' and rec.date_start:
                elapsed = (datetime.now() - rec.date_start.replace(tzinfo=None)).total_seconds() / 60
                rec.duration_acc = (rec.duration_acc or 0.0) + elapsed
            if rec.machine_id and rec.state in ('progress',):
                machines |= rec.machine_id
            rec.write({'state': 'cancel', 'date_start': False})
        machines._update_busy_status()
        return False

    def action_reset_to_ready(self):
        """Volta processo cancelado/pausado para Pronto."""
        for rec in self:
            if rec.state in ('cancel', 'paused'):
                rec.write({'state': 'ready', 'date_start': False})

    # ── Bus ───────────────────────────────────────────────────────────

    def _notify_process_update(self, state):
        """Dispara notificação bus para desktop e mobile."""
        for rec in self:
            channel = 'repair_os_%d_processes' % rec.repair_id.id
            self.env['bus.bus']._sendone(channel, 'process_state_changed', {
                'process_id': rec.id,
                'state': state,
                'repair_id': rec.repair_id.id,
                'component_type_id': rec.component_type_id.id,
                'sequence': rec.sequence,
                'skip_navigation': True,
                'source': 'backend',
            })

    # ── Popups ────────────────────────────────────────────────────────



    def action_confirm_deviation(self):
        """Confirma registro de desvio e executa ação escolhida."""
        self.ensure_one()
        if not self.has_deviation:
            return {'type': 'ir.actions.act_window_close'}

        if self.deviation_action == 'pause':
            if self.state == 'progress':
                self.action_pause()
        elif self.deviation_action == 'cancel':
            self.action_cancel()
            self.env['repair.os.process'].create({
                'repair_id':           self.repair_id.id,
                'sequence':            self.sequence,
                'component_type_id':   self.component_type_id.id if self.component_type_id else False,
                'name':                self.name,
                'service_description': self.service_description or False,
                'machine_id':          self.machine_id.id if self.machine_id else False,
                'operator_id':         self.operator_id.id if self.operator_id else False,
                'date_planned':        self.date_planned or False,
                'duration_planned':    self.duration_planned or 0.0,
                'requires_cq':         self.requires_cq,
                'state':               'ready',
            })

        return {'type': 'ir.actions.act_window_close'}

    def action_open_deviation_popup(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': self.operation_label or self.name or 'Desvio',
            'res_model': 'repair.os.process',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': self.env.ref('cylinder_repair_os.view_repair_process_deviation_popup').id,
            'target': 'new',
        }

    def action_open_actions_popup(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': self.operation_label or self.name or 'Processo',
            'res_model': 'repair.os.process',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': self.env.ref('cylinder_repair_os.view_repair_process_actions_popup').id,
            'target': 'new',
        }

    def action_open_details_popup(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Detalhes — %s' % (self.operation_label or self.name),
            'res_model': 'repair.os.process',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': self.env.ref('cylinder_repair_os.view_repair_process_details_popup').id,
            'target': 'new',
            'context': {'default_repair_id': self.repair_id.id},
        }

    def action_open_loader_from_list(self):
        ctx = self.env.context
        repair_id = (
            ctx.get('active_repair_id') or
            ctx.get('default_repair_id') or
            ctx.get('repair_id') or
            (self[0].repair_id.id if self else False)
        )
        if not repair_id:
            domain = ctx.get('active_domain') or []
            for clause in domain:
                if isinstance(clause, (list, tuple)) and len(clause) == 3:
                    if clause[0] == 'repair_id' and clause[1] == '=':
                        repair_id = clause[2]
                        break
        if not repair_id:
            return {'type': 'ir.actions.act_window_close'}
        return self.env['repair.order'].browse(repair_id).action_open_process_loader()

    def action_open_parent_os(self):
        self.ensure_one()
        if not self.repair_id:
            return
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'repair.order',
            'res_id': self.repair_id.id,
            'view_mode': 'form',
            'view_id': self.env.ref('cylinder_repair_os.view_repair_order_os_form').id,
            'target': 'current',
        }

    # ── Reordenação ───────────────────────────────────────────────────

    def action_move_up(self):
        self.ensure_one()
        siblings = self.search([
            ('repair_id', '=', self.repair_id.id),
            ('component_type_id', '=', self.component_type_id.id),
            ('id', '!=', self.id),
            ('sequence', '<=', self.sequence),
        ], order='sequence desc', limit=1)
        if siblings:
            self.sequence, siblings.sequence = siblings.sequence, self.sequence

    def action_move_down(self):
        self.ensure_one()
        siblings = self.search([
            ('repair_id', '=', self.repair_id.id),
            ('component_type_id', '=', self.component_type_id.id),
            ('id', '!=', self.id),
            ('sequence', '>=', self.sequence),
        ], order='sequence asc', limit=1)
        if siblings:
            self.sequence, siblings.sequence = siblings.sequence, self.sequence
