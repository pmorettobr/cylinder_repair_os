from odoo import models, fields, api
from odoo.exceptions import UserError


class RepairMachineReportWizard(models.TransientModel):
    _name = 'repair.machine.report.wizard'
    _description = 'Wizard — Relatórios de OS'

    # ── Seção 1: Programação por Máquina ─────────────────────────────

    date_from = fields.Date(
        string='Data Inicial',
        required=True,
        default=fields.Date.today,
    )
    date_to = fields.Date(
        string='Data Final',
        required=True,
        default=fields.Date.today,
    )
    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Máquina',
        help='Deixe vazio para todas as máquinas.',
    )
    os_id = fields.Many2one(
        comodel_name='repair.order',
        string='Nº OS',
        help='Opcional para Programação por Máquina. Obrigatório para Imprimir OS.',
    )
    include_done = fields.Boolean(
        string='Incluir Concluídos?',
        default=False,
    )

    # ── Validação ─────────────────────────────────────────────────────

    @api.constrains('date_from', 'date_to')
    def _check_dates(self):
        for rec in self:
            if rec.date_from and rec.date_to and rec.date_from > rec.date_to:
                raise UserError('A Data Inicial não pode ser maior que a Data Final.')

    # ── Ações ─────────────────────────────────────────────────────────

    def action_print_report(self):
        """Gera PDF de Programação por Máquina."""
        self.ensure_one()
        return self.env.ref(
            'cylinder_repair_os.action_report_machine_schedule'
        ).report_action(self)

    def action_print_os(self):
        """Gera PDF completo da OS selecionada — ignora filtros de data/máquina."""
        self.ensure_one()
        if not self.os_id:
            raise UserError('Selecione um Nº OS para imprimir.')
        return self.env.ref(
            'cylinder_repair_os.action_report_os'
        ).report_action(self.os_id)

    # ── Dados para o relatório por máquina ───────────────────────────

    def _get_processes(self):
        """Retorna processos para o relatório de Programação por Máquina."""
        self.ensure_one()
        date_from_str = str(self.date_from)
        date_to_str   = str(self.date_to)

        domain = [
            '|',
            # date_planned dentro do período
            '&',
            ('date_planned', '>=', date_from_str),
            ('date_planned', '<=', date_to_str),
            # date_start_orig dentro do período
            '&',
            ('date_start_orig', '>=', '%s 00:00:00' % date_from_str),
            ('date_start_orig', '<=', '%s 23:59:59' % date_to_str),
        ]
        if self.machine_id:
            domain = [('machine_id', '=', self.machine_id.id)] + domain
        if self.os_id:
            domain = [('repair_id', '=', self.os_id.id)] + domain
        if not self.include_done:
            domain.append(('state', '!=', 'cancel'))

        return self.env['repair.os.process'].search(
            domain, order='machine_id, date_planned, date_start_orig'
        )
