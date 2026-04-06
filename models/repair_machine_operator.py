from odoo import models, fields


class RepairMachineOperator(models.Model):
    """
    Operadores vinculados a um Centro de Trabalho.
    Não precisa ser usuário do sistema — apenas nome.
    """
    _name = 'repair.machine.operator'
    _description = 'Operador de Centro de Trabalho'
    _order = 'name'

    name = fields.Char(
        string='Nome',
        required=True,
    )
    machine_id = fields.Many2one(
        comodel_name='repair.machine',
        string='Centro de Trabalho',
        required=True,
        ondelete='cascade',
        index=True,
    )
    active = fields.Boolean(default=True)
    notes = fields.Char(string='Observação')
