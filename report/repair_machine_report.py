from odoo import models


class RepairMachineReport(models.AbstractModel):
    _name = 'report.cylinder_repair_os.report_machine_schedule_document'
    _description = 'Relatório Programação por Máquina'

    def _get_report_values(self, docids, data=None):
        wizard = self.env['repair.machine.report.wizard'].browse(docids)
        processes = wizard._get_processes()

        # Agrupa por OS
        os_map = {}
        os_order = []
        for proc in processes:
            key = proc.repair_id.id if proc.repair_id else 0
            if key not in os_map:
                os_map[key] = {
                    'os_number': proc.repair_id.os_number if proc.repair_id else '—',
                    'partner':   proc.repair_id.partner_id.name if proc.repair_id and proc.repair_id.partner_id else '',
                    'product':   proc.repair_id.product_name if proc.repair_id else '',
                    'processes': [],
                }
                os_order.append(key)
            os_map[key]['processes'].append(proc)

        return {
            'doc_ids':   docids,
            'doc_model': 'repair.machine.report.wizard',
            'docs':      wizard,
            'os_groups': [os_map[k] for k in os_order],
        }
