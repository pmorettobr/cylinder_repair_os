from odoo import models, fields


class RepairProcessTemplate(models.Model):
    """
    Catálogo de Processos Padrão.
    Alimenta o wizard de carregamento em lote.
    A sequência define a ordem de execução padrão dentro do componente.
    """
    _name = 'repair.process.template'
    _description = 'Catálogo de Processos Padrão'
    _order = 'component_type_id, sequence, id'

    name = fields.Char(
        string='Operação',
        required=True,
        help='Ex: Brunimento Interno, Cromo Externo, Retífica de Face...',
    )
    sequence = fields.Integer(
        string='Ordem de Execução',
        default=10,
        help='Define a ordem padrão de execução dentro do componente.',
    )
    active = fields.Boolean(default=True)

    component_type_id = fields.Many2one(
        comodel_name='repair.component.type',
        string='Componente',
        required=True,
        index=True,
    )
    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Máquina Padrão',
        help='Máquina normalmente usada neste processo.',
    )
    service_description = fields.Text(string='Descrição Detalhada')
    notes = fields.Char(string='Observação')

    requires_cq = fields.Boolean(
        string='Requer Inspeção de Qualidade?',
        default=True,
        help='Se marcado, ao concluir o processo vai para Aguardando CQ.',
    )
    duration_planned = fields.Float(
        string='Tempo Previsto (min)',
        default=0.0,
        help='Tempo padrão de execução em minutos. Copiado automaticamente para a OS ao carregar.',
    )

    def name_get(self):
        result = []
        for rec in self:
            name = '%s — %s' % (rec.component_type_id.name, rec.name) if rec.component_type_id else rec.name
            result.append((rec.id, name))
        return result
