from odoo import models, fields, api
from odoo.exceptions import UserError


class RepairMachineReportWizard(models.TransientModel):
    _name = 'repair.machine.report.wizard'
    _description = 'Wizard — Programação por Máquina'

    report_date = fields.Date(
        string='Data',
        required=True,
        default=fields.Date.today,
    )
    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Máquina',
        help='Deixe vazio para gerar relatório de todas as máquinas.',
    )
    include_done = fields.Boolean(
        string='Incluir Concluídos?',
        default=False,
    )

    def action_print_report(self):
        self.ensure_one()
        return self.env.ref(
            'cylinder_repair_os.action_report_machine_schedule'
        ).report_action(self)

    def _get_processes(self):
        """Retorna os processos para o relatório."""
        self.ensure_one()
        domain = [
            '|',
            # Processos com Data Prog. na data pesquisada
            '&',
            ('date_planned', '>=', '%s 00:00:00' % self.report_date),
            ('date_planned', '<=', '%s 23:59:59' % self.report_date),
            # Processos com Data Início na data pesquisada
            '&',
            ('date_start_orig', '>=', '%s 00:00:00' % self.report_date),
            ('date_start_orig', '<=', '%s 23:59:59' % self.report_date),
        ]
        if self.machine_id:
            domain = [('machine_id', '=', self.machine_id.id)] + domain
        if not self.include_done:
            domain.append(('state', '!=', 'cancel'))

        return self.env['repair.os.process'].search(
            domain, order='machine_id, date_planned, date_start_orig'
        )
