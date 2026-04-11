from odoo import models, fields, api
from odoo.exceptions import UserError


class RepairMachineReportWizard(models.TransientModel):
    _name = 'repair.machine.report.wizard'
    _description = 'Wizard — Relatórios de OS'

    # ── Filtros de estado ─────────────────────────────────────────────

    state_ready = fields.Boolean(string='Pronto', default=True)
    state_progress = fields.Boolean(string='Em Andamento', default=True)
    state_paused = fields.Boolean(string='Pausado', default=False)
    state_done = fields.Boolean(string='Concluído', default=False)
    state_cancel = fields.Boolean(string='Cancelado', default=False)

    # ── Filtros opcionais ─────────────────────────────────────────────

    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Máquina',
        help='Deixe vazio para todas as máquinas.',
    )
    os_id = fields.Many2one(
        comodel_name='repair.order',
        string='Nº OS',
        help='Opcional para Programação. Obrigatório para Imprimir OS completa.',
        domain=[('os_state', 'not in', ['cancel'])],
    )

    # ── Filtro de período (secundário, opcional) ──────────────────────

    use_date_filter = fields.Boolean(string='Filtrar por período?', default=False)
    date_from = fields.Date(string='De', default=fields.Date.today)
    date_to = fields.Date(string='Até', default=fields.Date.today)

    # ── Validação ─────────────────────────────────────────────────────

    @api.constrains('date_from', 'date_to')
    def _check_dates(self):
        for rec in self:
            if rec.use_date_filter and rec.date_from and rec.date_to:
                if rec.date_from > rec.date_to:
                    raise UserError('A Data Inicial não pode ser maior que a Data Final.')

    # ── Ações ─────────────────────────────────────────────────────────

    def action_print_report(self):
        self.ensure_one()
        states = self._get_selected_states()
        if not states:
            raise UserError('Selecione pelo menos um Estado para o relatório.')
        return self.env.ref(
            'cylinder_repair_os.action_report_machine_schedule'
        ).report_action(self)

    def action_print_os(self):
        self.ensure_one()
        if not self.os_id:
            raise UserError('Selecione um Nº OS para imprimir.')
        return self.env.ref(
            'cylinder_repair_os.action_report_os'
        ).report_action(self.os_id)

    # ── Helpers ───────────────────────────────────────────────────────

    def _get_selected_states(self):
        states = []
        if self.state_ready:    states.append('ready')
        if self.state_progress: states.append('progress')
        if self.state_paused:   states.append('paused')
        if self.state_done:     states.append('done')
        if self.state_cancel:   states.append('cancel')
        return states

    def _get_processes(self):
        self.ensure_one()
        states = self._get_selected_states()

        domain = [('state', 'in', states)] if states else [('id', '=', False)]

        if self.machine_id:
            domain.append(('machine_id', '=', self.machine_id.id))
        if self.os_id:
            domain.append(('repair_id', '=', self.os_id.id))

        if self.use_date_filter and self.date_from and self.date_to:
            date_from_str = str(self.date_from)
            date_to_str   = str(self.date_to)
            domain += [
                '|',
                '&',
                ('date_planned', '>=', date_from_str),
                ('date_planned', '<=', date_to_str),
                '&',
                ('date_start_orig', '>=', '%s 00:00:00' % date_from_str),
                ('date_start_orig', '<=', '%s 23:59:59' % date_to_str),
            ]

        return self.env['repair.os.process'].search(
            domain,
            order='repair_id, component_type_id, sequence',
        )
