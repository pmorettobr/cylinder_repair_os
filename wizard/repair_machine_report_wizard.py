from odoo import models, fields, api
from odoo.exceptions import UserError


class RepairMachineReportWizard(models.TransientModel):
    _name = 'repair.machine.report.wizard'
    _description = 'Wizard — Relatórios de OS'

    # ── Seção 1: Programação por Máquina ─────────────────────────────

    report_date = fields.Date(
        string='Data',
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
        help='Opcional — filtra processos de uma OS específica.',
    )
    include_done = fields.Boolean(
        string='Incluir Concluídos?',
        default=False,
    )

    # ── Ações ─────────────────────────────────────────────────────────

    def action_print_report(self):
        """Gera PDF de Programação por Máquina."""
        self.ensure_one()
        return self.env.ref(
            'cylinder_repair_os.action_report_machine_schedule'
        ).report_action(self)

    def action_print_os(self):
        """Gera PDF completo da OS selecionada."""
        self.ensure_one()
        if not self.os_id:
            raise UserError('Selecione uma OS para imprimir.')
        return self.env.ref(
            'cylinder_repair_os.action_report_os'
        ).report_action(self.os_id)

    # ── Dados para o relatório por máquina ───────────────────────────

    def _get_processes(self):
        self.ensure_one()
        domain = [
            '|',
            ('date_planned', '=', self.report_date),
            '&',
            ('date_start_orig', '>=', '%s 00:00:00' % self.report_date),
            ('date_start_orig', '<=', '%s 23:59:59' % self.report_date),
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
