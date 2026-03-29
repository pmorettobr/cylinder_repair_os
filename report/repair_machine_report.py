from odoo import models


class RepairMachineReport(models.AbstractModel):
    _name = 'report.cylinder_repair_os.report_machine_schedule'
    _description = 'Relatório Programação por Máquina'

    def _get_report_values(self, docids, data=None):
        from datetime import date, datetime
        wizard = self.env['repair.machine.report.wizard'].browse(docids)
        processes = wizard._get_processes()

        # Agrupa por máquina
        machines = {}
        for proc in processes:
            key = proc.machine_id.id or 0
            label = proc.machine_id.name if proc.machine_id else 'Sem Máquina'
            if key not in machines:
                machines[key] = {'machine': proc.machine_id, 'label': label, 'processes': []}
            machines[key]['processes'].append(proc)

        # Garante que report_date é um objeto date com strftime
        raw_date = wizard.report_date
        if isinstance(raw_date, str):
            try:
                report_date = datetime.strptime(raw_date, '%Y-%m-%d').date()
            except Exception:
                report_date = date.today()
        elif raw_date:
            report_date = raw_date
        else:
            report_date = date.today()

        return {
            'doc_ids': docids,
            'doc_model': 'repair.machine.report.wizard',
            'docs': wizard,
            'machines': list(machines.values()),
            'report_date': report_date,
        }
