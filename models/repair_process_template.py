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
    sub_component_id = fields.Many2one(
        comodel_name='repair.sub.component',
        string='Sub-componente',
        domain="[('component_type_id', 'in', [component_type_id, False])]",
    )
    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Máquina Padrão',
        help='Máquina normalmente usada neste processo.',
    )
    service_description = fields.Text(string='Descrição Detalhada')
    notes = fields.Char(string='Observação')

    # Vínculo com template de qualidade padrão para este processo
    quality_template_id = fields.Many2one(
        comodel_name='repair.quality.template',
        string='Template de Qualidade',
        help='Checklist de qualidade aplicado automaticamente ao concluir este processo.',
    )
    block_on_quality_fail = fields.Boolean(
        string='Bloquear se Reprovar?',
        default=False,
        help='Se marcado, o processo não pode ser concluído enquanto houver itens reprovados.',
    )

    def name_get(self):
        result = []
        for rec in self:
            name = '%s — %s' % (rec.component_type_id.name, rec.name)
            if rec.sub_component_id:
                name = '%s › %s — %s' % (
                    rec.component_type_id.name,
                    rec.sub_component_id.name,
                    rec.name,
                )
            result.append((rec.id, name))
        return result
