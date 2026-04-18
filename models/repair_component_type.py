from odoo import models, fields, api


class RepairComponentType(models.Model):
    """
    Tipos de componente de cilindro.
    Ex: Camisa, Haste Tubular, Êmbolo, Cabeçote Traseiro...
    """
    _name = 'repair.component.type'
    _description = 'Tipo de Componente de Cilindro'
    _order = 'sequence, name'

    name = fields.Char(string='Nome', required=True)
    code = fields.Char(string='Código', help='Código interno. Ex: CAMISA, HASTE')
    sequence = fields.Integer(string='Sequência', default=10)
    active = fields.Boolean(default=True)
    notes = fields.Char(string='Observação')

    # ── Item 11 — Localização física do componente ────────────────────
    location_text = fields.Char(
        string='Localização',
        help='Onde a peça está fisicamente. Ex: Estoque, Bancada 2, Torno CNC',
    )
    location_status = fields.Selection(
        selection=[
            ('available', 'Disponível'),
            ('unavailable', 'Indisponível'),
        ],
        string='Status',
        default='available',
    )

    def name_get(self):
        result = []
        for rec in self:
            name = '[%s] %s' % (rec.code, rec.name) if rec.code else rec.name
            result.append((rec.id, name))
        return result
