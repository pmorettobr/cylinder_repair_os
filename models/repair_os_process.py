from odoo import models, fields, api
from odoo.exceptions import UserError
from datetime import datetime, date


class RepairOsProcess(models.Model):
    """
    Processo de Reparo / Fabricação vinculado a uma OS.
    Model próprio — sem dependência de mrp.workorder.

    Estados:
      ready    → Pronto para iniciar
      progress → Em andamento (cronômetro rodando)
      paused   → Pausado (cronômetro acumulado, aguardando retomada)
      done     → Concluído
      cancel   → Cancelado
    """
    _name = 'repair.os.process'
    _description = 'Processo da OS'
    _order = 'repair_id, component_type_id, sequence, id'
    _inherit = ['mail.thread']

    # ── Vínculo com a OS ──────────────────────────────────────────────────────
    repair_id = fields.Many2one(
        comodel_name='repair.order',
        string='Ordem de Serviço',
        required=True,
        ondelete='cascade',
        index=True,
    )

    # ── Sequência de execução ─────────────────────────────────────────────────
    sequence = fields.Integer(
        string='Seq.',
        default=10,
        help='Ordem de execução dentro do componente. '
             'Processo de seq. maior só pode iniciar após o anterior estar Concluído.',
    )

    # ── Componente e Operação ─────────────────────────────────────────────────
    component_type_id = fields.Many2one(
        comodel_name='repair.component.type',
        string='Componente',
        index=True,
    )
    name = fields.Char(
        string='Operação',
        required=True,
    )
    service_description = fields.Text(string='Descrição Detalhada')

    # ── Máquina ───────────────────────────────────────────────────────────────
    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Máquina',
        index=True,
    )

    # ── Datas ─────────────────────────────────────────────────────────────────
    date_planned = fields.Date(
        string='Data Programada',
        help='Data prevista para início deste processo.',
    )
    date_start = fields.Datetime(
        string='Data Início',
        readonly=True,
        copy=False,
    )
    date_start_orig = fields.Datetime(
        string='Início Original',
        readonly=True,
        copy=False,
        help='Data do primeiro início — não muda com pausas.',
    )
    date_finished = fields.Datetime(
        string='Data Conclusão',
        readonly=True,
        copy=False,
    )

    # ── Cronômetro ────────────────────────────────────────────────────────────
    duration_acc = fields.Float(
        string='Duração Acumulada (min)',
        default=0.0,
        copy=False,
        help='Tempo acumulado de todas as sessões de trabalho em minutos.',
    )
    duration_display = fields.Char(
        string='Tempo',
        compute='_compute_duration_display',
        store=False,
    )

    # ── Estado ────────────────────────────────────────────────────────────────
    state = fields.Selection(
        selection=[
            ('ready', 'Pronto'),
            ('progress', 'Em Andamento'),
            ('paused', 'Pausado'),
            ('done', 'Concluído'),
            ('cancel', 'Cancelado'),
        ],
        string='Situação',
        default='ready',
        required=True,
        tracking=True,
        index=True,
    )

    # ── Operador e Tempo Previsto ─────────────────────────────────────────

    operator_id = fields.Many2one(
        'res.users',
        string='Operador',
        help='Operador responsável por este processo.',
    )
    duration_planned = fields.Float(
        string='Tempo Previsto (min)',
        default=0.0,
        help='Tempo previsto para execução do processo em minutos.',
    )
    duration_planned_display = fields.Char(
        string='Tempo Previsto',
        compute='_compute_duration_planned_display',
        inverse='_inverse_duration_planned_display',
        help='Tempo previsto no formato HH:MM',
    )

    @api.depends('duration_planned')
    def _compute_duration_planned_display(self):
        for rec in self:
            if rec.duration_planned:
                h = int(rec.duration_planned // 60)
                m = int(rec.duration_planned % 60)
                rec.duration_planned_display = '%02d:%02d' % (h, m)
            else:
                rec.duration_planned_display = '00:00'

    def _inverse_duration_planned_display(self):
        for rec in self:
            val = rec.duration_planned_display or '00:00'
            try:
                parts = val.split(':')
                h = int(parts[0]) if len(parts) > 0 else 0
                m = int(parts[1]) if len(parts) > 1 else 0
                rec.duration_planned = h * 60 + m
            except Exception:
                rec.duration_planned = 0.0

    # ── Desvio ────────────────────────────────────────────────────────────────
    has_deviation = fields.Boolean(
        string='Desvio?',
        default=False,
        tracking=True,
    )
    deviation_icon = fields.Char(
        string='Desvio',
        compute='_compute_deviation_icon',
        store=False,
    )
    deviation_tooltip = fields.Char(
        string='Tooltip Desvio',
        compute='_compute_deviation_icon',
        store=False,
    )

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

    deviation_notes = fields.Text(string='Descrição do Desvio')
    attachment_ids = fields.Many2many(
        comodel_name='ir.attachment',
        relation='repair_process_attachment_rel',
        column1='process_id',
        column2='attachment_id',
        string='Anexos / Desenhos',
    )

    # ── Controle de Qualidade ─────────────────────────────────────────────────
    quality_check_ids = fields.One2many(
        comodel_name='repair.quality.check',
        inverse_name='process_id',
        string='Checklist de Qualidade',
    )
    quality_result = fields.Selection(
        selection=[
            ('pending', 'Pendente'),
            ('passed', 'Aprovado'),
            ('failed', 'Reprovado'),
            ('flagged', 'Concluído com Ressalvas'),
        ],
        string='Resultado QC',
        default='pending',
        tracking=True,
    )
    block_on_quality_fail = fields.Boolean(
        string='Bloquear se Reprovar?',
        default=False,
        help='Se marcado, não permite concluir o processo com itens reprovados.',
    )
    has_quality_checks = fields.Boolean(
        string='Tem Checklist?',
        compute='_compute_has_quality',
        store=False,
    )

    # ── Label de operação completa ────────────────────────────────────────────
    operation_label = fields.Char(
        string='Operação Completa',
        compute='_compute_operation_label',
        store=True,
    )

    # ── Computes ──────────────────────────────────────────────────────────────

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

    def _compute_has_quality(self):
        for rec in self:
            rec.has_quality_checks = bool(rec.quality_check_ids)

    # ── Validações ────────────────────────────────────────────────────────────

    def _validate_date_planned(self):
        """Valida que date_planned não está em branco nem é retroativa ao dia atual."""
        for rec in self:
            if not rec.date_planned:
                raise UserError(
                    'Processo "%s": preencha a Data Programada antes de iniciar.'
                    % rec.operation_label
                )
            today = date.today()
            if rec.date_planned < today:
                raise UserError(
                    'Processo "%s": a Data Programada (%s) não pode ser anterior a hoje (%s).'
                    % (
                        rec.operation_label,
                        rec.date_planned.strftime('%d/%m/%Y'),
                        today.strftime('%d/%m/%Y'),
                    )
                )

    def _validate_os_started(self):
        """Valida que a OS está em andamento."""
        for rec in self:
            if rec.repair_id and rec.repair_id.os_state not in ('confirmed', 'in_progress'):
                raise UserError(
                    'A Ordem de Serviço "%s" precisa estar CONFIRMADA ou EM ANDAMENTO '
                    'para iniciar processos.'
                    % (rec.repair_id.os_number or rec.repair_id.name)
                )

    def _validate_sequence(self):
        """
        Valida sequência de processos dentro do componente.

        Regra:
        - Processos com a MESMA sequência rodam em paralelo (sem bloqueio).
        - Um processo só pode iniciar se TODOS os processos com sequência
          ESTRITAMENTE MENOR estiverem concluídos (done) ou cancelados.
        """
        for rec in self:
            if not rec.component_type_id:
                continue
            # Busca processos com sequência ESTRITAMENTE menor que a atual
            # que ainda não estejam concluídos ou cancelados
            prev = self.search([
                ('repair_id', '=', rec.repair_id.id),
                ('component_type_id', '=', rec.component_type_id.id),
                ('sequence', '<', rec.sequence),
                ('id', '!=', rec.id),
                ('state', 'not in', ('done', 'cancel')),
            ], limit=1, order='sequence desc')
            if prev:
                raise UserError(
                    'Processo "%s" (seq. %d): o processo anterior "%s" '
                    '(seq. %d) ainda não foi concluído. '
                    'Processos com a mesma sequência podem ser iniciados em paralelo.'
                    % (
                        rec.operation_label,
                        rec.sequence,
                        prev.operation_label,
                        prev.sequence,
                    )
                )

    def _validate_machine_available(self):
        """Valida que a máquina não está ocupada em outro processo."""
        for rec in self:
            if not rec.machine_id:
                continue
            busy = self.search([
                ('machine_id', '=', rec.machine_id.id),
                ('state', '=', 'progress'),
                ('id', '!=', rec.id),
            ], limit=1)
            if busy:
                raise UserError(
                    '⚠ %s em uso na OS %s — Operação: %s.\n'
                    'Aguarde a conclusão do processo em andamento antes de iniciar nesta máquina.'
                    % (
                        rec.machine_id.name,
                        busy.repair_id.os_number or busy.repair_id.name,
                        busy.operation_label,
                    )
                )

    # ── Ações de controle ─────────────────────────────────────────────────────

    def action_start(self):
        """Iniciar processo — primeiro início ou retomada após pausa."""
        self._validate_os_started()
        self._validate_date_planned()
        self._validate_sequence()
        self._validate_machine_available()

        now = datetime.now()
        machines = self.env['repair.machine']
        for rec in self:
            vals = {
                'state': 'progress',
                'date_start': now,
            }
            if not rec.date_start_orig:
                vals['date_start_orig'] = now
                # Inicia a OS automaticamente se ainda estiver só confirmada
                if rec.repair_id.os_state == 'confirmed':
                    rec.repair_id.action_start_os()
            rec.write(vals)
            if rec.machine_id:
                machines |= rec.machine_id
        machines._update_busy_status()

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

    def action_finish(self):
        """
        Concluir processo.
        Se há checklist de qualidade pendente, abre popup de QC antes de concluir.
        """
        for rec in self:
            if rec.state not in ('progress', 'paused'):
                raise UserError('Apenas processos Em Andamento ou Pausados podem ser concluídos.')

            # Verifica checklist de qualidade
            if rec.quality_check_ids:
                pending_required = rec.quality_check_ids.filtered(
                    lambda c: c.result == 'pending' and c.is_required
                )
                failed_required = rec.quality_check_ids.filtered(
                    lambda c: c.result == 'fail' and c.is_required
                )
                if pending_required or failed_required:
                    if rec.block_on_quality_fail and failed_required:
                        raise UserError(
                            'Processo "%s": existem %d item(ns) obrigatório(s) REPROVADO(S) no checklist. '
                            'Corrija-os antes de concluir.'
                            % (rec.operation_label, len(failed_required))
                        )
                    elif pending_required:
                        # Redireciona para o popup de QC
                        return rec._open_quality_popup()

            rec._do_finish()

    def _do_finish(self):
        """Finalização efetiva do processo."""
        now = datetime.now()
        for rec in self:
            elapsed = 0.0
            if rec.state == 'progress' and rec.date_start:
                elapsed = (now - rec.date_start.replace(tzinfo=None)).total_seconds() / 60

            # Determina resultado de qualidade
            if rec.quality_check_ids:
                failed = rec.quality_check_ids.filtered(lambda c: c.result == 'fail')
                quality_result = 'flagged' if failed else 'passed'
            else:
                quality_result = 'pending'

            rec.write({
                'state': 'done',
                'date_finished': now,
                'duration_acc': (rec.duration_acc or 0.0) + elapsed,
                'date_start': False,
                'quality_result': quality_result,
            })
            if rec.machine_id:
                rec.machine_id._update_busy_status()

    def action_cancel(self):
        """Cancelar processo."""
        machines = self.env['repair.machine']
        for rec in self:
            if rec.state == 'progress':
                # Acumula tempo antes de cancelar
                if rec.date_start:
                    elapsed = (datetime.now() - rec.date_start.replace(tzinfo=None)).total_seconds() / 60
                    rec.duration_acc = (rec.duration_acc or 0.0) + elapsed
                if rec.machine_id:
                    machines |= rec.machine_id
            rec.state = 'cancel'
            rec.date_start = False
        machines._update_busy_status()

    def action_reset_to_ready(self):
        """Volta processo cancelado/pausado para Pronto."""
        for rec in self:
            if rec.state in ('cancel', 'paused'):
                rec.write({'state': 'ready', 'date_start': False})

    # ── Popup de Ações (Iniciar / Pausar / Concluir) ──────────────────────────

    def action_open_actions_popup(self):
        """Abre popup com ações do processo + desvio."""
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

    # ── Popup de Desvio / Detalhes ────────────────────────────────────────────

    def action_open_details_popup(self):
        """Abre popup de desvio, descrição e anexos."""
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
        """Abre o carregador de processos a partir da lista agrupada.
        Funciona mesmo sem registros selecionados, usando active_repair_id do contexto."""
        repair_id = (
            self.env.context.get('active_repair_id') or
            self.env.context.get('default_repair_id') or
            (self and self[0].repair_id.id if self else False)
        )
        if not repair_id:
            return {'type': 'ir.actions.act_window_close'}
        repair = self.env['repair.order'].browse(repair_id)
        return repair.action_open_process_loader()

    def action_open_deviation_popup(self):
        """Abre popup simples de desvio (ícone na coluna Desvio)."""
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

    # ── Popup de Qualidade ────────────────────────────────────────────────────

    def _open_quality_popup(self):
        """Redireciona para o popup de checklist de qualidade."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Controle de Qualidade — %s' % (self.operation_label or self.name),
            'res_model': 'repair.os.process',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': self.env.ref('cylinder_repair_os.view_repair_process_quality_popup').id,
            'target': 'new',
        }

    def action_open_quality_popup(self):
        """Abre popup de qualidade manualmente."""
        self.ensure_one()
        return self._open_quality_popup()

    def action_finish_with_flag(self):
        """Conclui processo mesmo com itens reprovados (flag)."""
        for rec in self:
            failed = rec.quality_check_ids.filtered(lambda c: c.result == 'fail')
            if failed:
                rec.quality_result = 'flagged'
            rec._do_finish()

    # ── Carrega checklist a partir do template ────────────────────────────────

    def action_load_quality_template(self, template_id):
        """Carrega itens do template de qualidade no processo."""
        self.ensure_one()
        template = self.env['repair.quality.template'].browse(template_id)
        if not template.exists():
            return
        # Remove checks pendentes existentes
        self.quality_check_ids.filtered(lambda c: c.result == 'pending').unlink()
        # Cria novos a partir do template
        for line in template.check_ids:
            self.env['repair.quality.check'].create({
                'process_id': self.id,
                'sequence': line.sequence,
                'name': line.name,
                'is_required': line.is_required,
                'result': 'pending',
            })
        self.block_on_quality_fail = template.block_on_fail

    # ── Relatório: abre OS de origem ──────────────────────────────────────────

    def action_open_parent_os(self):
        self.ensure_one()
        if not self.repair_id:
            return
        return {
            'type': 'ir.actions.act_window',
            'name': 'Ordem de Serviço',
            'res_model': 'repair.order',
            'res_id': self.repair_id.id,
            'view_mode': 'form',
            'view_id': self.env.ref('cylinder_repair_os.view_repair_order_os_form').id,
            'target': 'current',
        }
