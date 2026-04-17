from odoo import models, fields


class RepairProcessSet(models.Model):
    """Template de processos — agrupa processos do catálogo."""
    _name = 'repair.process.set'
    _description = 'Template de Processos'
    _order = 'name'

    name = fields.Char(string='Nome do Template', required=True)
    notes = fields.Text(string='Observações')
    active = fields.Boolean(default=True)

    line_ids = fields.One2many(
        comodel_name='repair.process.set.line',
        inverse_name='set_id',
        string='Processos',
    )
    line_count = fields.Integer(
        string='Qtd. Processos',
        compute='_compute_line_count',
    )
    cylinder_count = fields.Integer(
        string='Cilindros',
        compute='_compute_cylinder_count',
    )

    def _compute_line_count(self):
        for rec in self:
            rec.line_count = len(rec.line_ids)

    def _compute_cylinder_count(self):
        for rec in self:
            rec.cylinder_count = self.env['repair.cylinder'].search_count(
                [('process_set_id', '=', rec.id)]
            )


class RepairProcessSetLine(models.Model):
    """Linha do template — vínculo com processo do catálogo."""
    _name = 'repair.process.set.line'
    _description = 'Linha do Template de Processos'
    _order = 'set_id, template_id'

    set_id = fields.Many2one(
        comodel_name='repair.process.set',
        string='Template',
        required=True,
        ondelete='cascade',
    )
    template_id = fields.Many2one(
        comodel_name='repair.process.template',
        string='Processo do Catálogo',
        required=True,
        ondelete='cascade',
    )
    # Campos computados do template para exibição
    component_type_id = fields.Many2one(
        related='template_id.component_type_id',
        string='Componente',
        store=True,
    )
    sequence = fields.Integer(
        related='template_id.sequence',
        string='Seq.',
        store=True,
    )
    machine_id = fields.Many2one(
        related='template_id.machine_id',
        string='Centro de Trabalho',
        store=True,
    )
    requires_cq = fields.Boolean(
        related='template_id.requires_cq',
        string='Requer CQ?',
        store=True,
    )
