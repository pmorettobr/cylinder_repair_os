from odoo import models, fields


class RepairCylinder(models.Model):
    """Cadastro de cilindros/produtos com template de processos opcional."""
    _name = 'repair.cylinder'
    _description = 'Cilindro'
    _order = 'name'

    name = fields.Char(string='Descrição', required=True)
    code = fields.Char(string='Código')
    process_set_id = fields.Many2one(
        comodel_name='repair.process.set',
        string='Template de Processos',
        ondelete='set null',
        help='Template padrão carregado ao selecionar este cilindro numa OS.',
    )
    notes = fields.Text(string='Observações')
    active = fields.Boolean(default=True)

    os_count = fields.Integer(
        string='OSs',
        compute='_compute_os_count',
    )

    def _compute_os_count(self):
        for rec in self:
            rec.os_count = self.env['repair.order'].search_count(
                [('cylinder_id', '=', rec.id)]
            )
