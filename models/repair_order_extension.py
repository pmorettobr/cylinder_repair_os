from odoo import models, fields, api
from odoo.exceptions import UserError, ValidationError


class RepairOrder(models.Model):
    _inherit = 'repair.order'

    # ── Campos nativos — tornar opcionais ─────────────────────────────────────
    product_id = fields.Many2one(
        comodel_name='product.product',
        string='Produto (opcional)',
        required=False,
    )
    product_uom = fields.Many2one(
        comodel_name='uom.uom',
        string='Unidade de Medida',
        required=False,
    )

    # ── Número da OS do cliente — campo principal ─────────────────────────────
    os_number = fields.Char(
        string='Nº OS',
        required=True,
        copy=False,
        index=True,
        help='Número sequencial da OS conforme controle do cliente.',
    )

    # ── Tipo de Ordem ─────────────────────────────────────────────────────────
    order_type = fields.Selection(
        selection=[
            ('repair', 'Reparo'),
            ('fabrication', 'Fabricação'),
        ],
        string='Tipo de Ordem',
        default='repair',
        required=True,
        tracking=True,
    )

    # ── Identificação do Cilindro ─────────────────────────────────────────────
    product_name = fields.Char(string='Produto / Cilindro')
    serial_code = fields.Char(
        string='Nº de Série / TAG',
        copy=False,
        index=True,
    )
    equipment_description = fields.Char(string='Descrição Adicional')

    # ── Prazo ─────────────────────────────────────────────────────────────────
    deadline_date = fields.Date(
        string='Prazo (Dead Line)',
        help='Data limite para entrega da OS.',
    )

    # ── Responsável ───────────────────────────────────────────────────────────
    responsible_id = fields.Many2one(
        comodel_name='res.users',
        string='Responsável',
        default=lambda self: self.env.user,
    )

    # ── Estado próprio da OS ──────────────────────────────────────────────────
    os_state = fields.Selection(
        selection=[
            ('draft', 'Rascunho'),
            ('confirmed', 'Confirmada'),
            ('in_progress', 'Em Andamento'),
            ('done', 'Concluída'),
            ('cancel', 'Cancelada'),
        ],
        string='Estado OS',
        default='draft',
        tracking=True,
    )

    # ── Processos da OS ───────────────────────────────────────────────────────
    process_ids = fields.One2many(
        comodel_name='repair.os.process',
        inverse_name='repair_id',
        string='Processos',
    )

    # ── Estatísticas de progresso ─────────────────────────────────────────────
    process_count = fields.Integer(
        string='Total de Processos',
        compute='_compute_progress',
        store=False,
    )
    process_done_count = fields.Integer(
        string='Concluídos',
        compute='_compute_progress',
        store=False,
    )
    process_progress_count = fields.Integer(
        string='Em Andamento',
        compute='_compute_progress',
        store=False,
    )
    progress_percent = fields.Float(
        string='Progresso (%)',
        compute='_compute_progress',
        store=False,
        digits=(5, 1),
    )
    is_overdue = fields.Boolean(
        string='Atrasada',
        compute='_compute_progress',
        store=True,
    )

    # ── Campos display (evitam totalização no agrupamento) ───────────────────
    process_done_display = fields.Char(
        compute='_compute_display_fields', store=False)
    process_total_display = fields.Char(
        compute='_compute_display_fields', store=False)
    progress_display = fields.Char(
        compute='_compute_display_fields', store=False)

    # ── Computes ──────────────────────────────────────────────────────────────

    @api.depends(
        'process_ids',
        'process_ids.state',
        'deadline_date',
        'os_state',
    )
    def _compute_progress(self):
        for rec in self:
            procs = rec.process_ids
            total = len(procs)
            done = len(procs.filtered(lambda p: p.state == 'done'))
            in_prog = len(procs.filtered(lambda p: p.state == 'progress'))
            rec.process_count = total
            rec.process_done_count = done
            rec.process_progress_count = in_prog
            rec.progress_percent = (done / total * 100.0) if total else 0.0
            today = fields.Date.today()
            rec.is_overdue = bool(
                rec.deadline_date
                and rec.deadline_date < today
                and rec.os_state not in ('done', 'cancel')
            )

    @api.depends('process_done_count', 'process_count', 'progress_percent')
    def _compute_display_fields(self):
        for rec in self:
            rec.process_done_display = str(rec.process_done_count or 0)
            rec.process_total_display = str(rec.process_count or 0)
            rec.progress_display = '%s%%' % int(rec.progress_percent or 0)

    # ── Constraint unicidade Nº OS ────────────────────────────────────────────

    _sql_constraints = [
        ('os_number_unique', 'unique(os_number)',
         'Já existe uma OS com este número. O Nº OS deve ser único.'),
    ]

    @api.onchange('os_number')
    def _onchange_os_number_check(self):
        if self.os_number:
            existing = self.search([
                ('os_number', '=', self.os_number),
                ('id', '!=', self._origin.id or 0),
            ], limit=1)
            if existing:
                return {
                    'warning': {
                        'title': 'Nº OS duplicado',
                        'message': 'Já existe uma OS com o número "%s". Verifique antes de salvar.' % existing.os_number,
                    }
                }

    # ── name_get — usa os_number como identificador principal ─────────────────

    def name_get(self):
        result = []
        for rec in self:
            name = rec.os_number or rec.name or '(sem número)'
            if rec.product_name:
                name = '%s — %s' % (name, rec.product_name)
            result.append((rec.id, name))
        return result

    # ── Ações de estado ───────────────────────────────────────────────────────

    def action_confirm_os(self):
        for rec in self:
            if not rec.os_number:
                raise UserError('Informe o Nº OS antes de confirmar.')
        self.write({'os_state': 'confirmed'})

    def action_start_os(self):
        self.write({'os_state': 'in_progress'})

    def action_done_os(self):
        for rec in self:
            pending = rec.process_ids.filtered(
                lambda p: p.state not in ('done', 'cancel')
            )
            if pending:
                raise UserError(
                    'Existem %d processo(s) não concluídos. '
                    'Conclua ou cancele todos os processos antes de fechar a OS.'
                    % len(pending)
                )
        self.write({'os_state': 'done'})

    def action_cancel_os(self):
        for rec in self:
            active_procs = rec.process_ids.filtered(
                lambda p: p.state == 'progress'
            )
            if active_procs:
                raise UserError(
                    'Existe(m) %d processo(s) em andamento. '
                    'Pause ou conclua os processos antes de cancelar a OS.'
                    % len(active_procs)
                )
        self.write({'os_state': 'cancel'})

    def action_draft_os(self):
        """Volta para rascunho se ainda não iniciada."""
        self.filtered(lambda r: r.os_state == 'confirmed').write({'os_state': 'draft'})

    # ── Abrir processos (Shop Floor) ──────────────────────────────────────────

    def action_open_processes(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Processos — %s' % (self.os_number or self.name),
            'res_model': 'repair.os.process',
            'view_mode': 'tree,form',
            'domain': [('repair_id', '=', self.id)],
            'context': {'default_repair_id': self.id},
            'target': 'current',
        }

    # ── Carregador de processos em lote ───────────────────────────────────────

    def action_confirm_and_start(self):
        """Confirma e inicia a OS em um único clique."""
        self.ensure_one()
        if self.os_state == 'draft':
            self.action_confirm_os()
        self.action_start_os()
        return False

    def action_open_process_loader_add_more(self):
        """Abre o carregador para adicionar mais processos (já carregados aparecem desmarcados)."""
        self.ensure_one()
        # Same as normal loader but context signals "add more" mode
        return self.action_open_process_loader()

    def action_open_processes_grouped(self):
        """Abre form wrapper de processos agrupados com smart buttons."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Programação — %s' % (self.os_number or self.name or ''),
            'res_model': 'repair.order',
            'res_id': self.id,
            'view_mode': 'form',
            'views': [(self.env.ref('cylinder_repair_os.view_repair_order_process_wrapper').id, 'form')],
            'context': {
                'default_repair_id': self.id,
                'active_repair_id': self.id,
                'repair_id': self.id,
            },
            'target': 'current',
        }

    def action_open_process_loader(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Carregar Processos',
            'res_model': 'repair.process.loader',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_repair_id': self.id},
        }
