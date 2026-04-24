from odoo import models


# Labels de estado centralizados — evita dict() por linha no QWeb
STATE_LABELS = {
    'ready':      'Pronto',
    'progress':   'Em Andamento',
    'paused':     'Pausado',
    'pending_cq': 'Aguardando CQ',
    'done':       'Concluído',
    'cancel':     'Cancelado',
}


class ReportRepairMachineSchedule(models.AbstractModel):
    """
    Prepara os dados para o relatório de Programação por Máquina.
    Resolve o problema de N+1 queries carregando tudo em memória antes
    de passar ao template QWeb.
    """
    _name = 'report.cylinder_repair_os.report_machine_schedule_document'
    _description = 'Relatório Programação por Máquina'

    def _get_report_values(self, docids, data=None):
        wizard = self.env['repair.machine.report.wizard'].browse(docids)

        # Uma única query com todos os campos necessários
        processes = wizard._get_processes()

        # Prefetch explícito para evitar N+1 no template
        processes.mapped('repair_id.partner_id')
        processes.mapped('repair_id.cylinder_id')
        processes.mapped('machine_id')
        processes.mapped('operator_id')
        processes.mapped('component_type_id')

        # Agrupa por OS em memória — sem queries adicionais
        os_map = {}
        for proc in processes:
            repair = proc.repair_id
            rid = repair.id
            if rid not in os_map:
                os_map[rid] = {
                    'os_number': repair.os_number or repair.name or '—',
                    'partner':   repair.partner_id.name if repair.partner_id else '',
                    'product':   repair.cylinder_id.name if repair.cylinder_id else '',
                    'processes': [],
                }
            # Monta dict leve em vez de passar o recordset completo
            os_map[rid]['processes'].append({
                'sequence':        proc.sequence,
                'name':            proc.name or '',
                'machine':         proc.machine_id.name if proc.machine_id else '—',
                'operator':        proc.operator_id.name if proc.operator_id else '—',
                'component':       proc.component_type_id.name if proc.component_type_id else '',
                'state_label':     STATE_LABELS.get(proc.state, proc.state),
                'state':           proc.state,
                'duration_planned': proc.duration_planned or 0.0,
                'duration_display': proc.duration_display or '00:00:00',
                'date_planned':    proc.date_planned.strftime('%d/%m/%Y') if proc.date_planned else '—',
                'date_start':      proc.date_start_orig.strftime('%d/%m %H:%M') if proc.date_start_orig else '—',
                'date_finished':   proc.date_finished.strftime('%d/%m %H:%M') if proc.date_finished else '—',
                'has_deviation':   proc.has_deviation,
                'deviation_notes': proc.deviation_notes or '',
                'pause_count':     proc.pause_count or 0,
            })

        os_groups = list(os_map.values())

        return {
            'doc_ids':   docids,
            'doc_model': 'repair.machine.report.wizard',
            'docs':      wizard,
            'os_groups': os_groups,
            'state_labels': STATE_LABELS,
        }
