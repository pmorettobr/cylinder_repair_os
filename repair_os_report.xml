from odoo import models, fields


class RepairSubComponent(models.Model):
    """
    Sub-componentes do cilindro.
    Ex: Camisa → Êmbolo, Haste Interna, Anel de Vedação...
    """
    _name = 'repair.sub.component'
    _description = 'Sub-componente de Cilindro'
    _order = 'component_type_id, sequence, name'

    name = fields.Char(string='Nome do Sub-componente', required=True)
    component_type_id = fields.Many2one(
        comodel_name='repair.component.type',
        string='Componente Pai',
        help='Deixe vazio para aparecer em todos os componentes.',
    )
    sequence = fields.Integer(string='Sequência', default=10)
    active = fields.Boolean(default=True)
    notes = fields.Char(string='Observação')
