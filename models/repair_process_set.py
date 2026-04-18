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

    def action_open_catalog_modal(self):
        """Abre o modal OWL de seleção de processos no contexto do template."""
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
            'params': {
                'action': 'open_set_catalog',
                'set_id': self.id,
            }
        }

    def action_get_catalog_for_set(self):
        """Retorna templates do catálogo excluindo os já no set. Usado pelo modal OWL."""
        self.ensure_one()

        # IDs de templates já no set
        existing_template_ids = set(self.line_ids.mapped('template_id').ids)

        templates = self.env['repair.process.template'].search(
            [('active', '=', True)],
            order='component_type_id, sequence'
        )

        result = []
        for tmpl in templates:
            if tmpl.id in existing_template_ids:
                continue
            ct_id = tmpl.component_type_id.id or 0
            result.append({
                'id':               tmpl.id,
                'sequence':         tmpl.sequence,
                'component_type_id': [ct_id, tmpl.component_type_id.name] if tmpl.component_type_id else [0, ''],
                'name':             tmpl.name,
                'machine_id':       [tmpl.machine_id.id, tmpl.machine_id.name] if tmpl.machine_id else False,
                'duration_planned': tmpl.duration_planned or 0.0,
                'requires_cq':      tmpl.requires_cq,
            })
        return result

    def action_load_from_catalog_to_set(self, template_ids):
        """Adiciona templates ao set. Chamado pelo modal OWL."""
        self.ensure_one()
        if not template_ids:
            return False

        existing = set(self.line_ids.mapped('template_id').ids)
        for tmpl_id in template_ids:
            if tmpl_id not in existing:
                self.env['repair.process.set.line'].create({
                    'set_id':      self.id,
                    'template_id': tmpl_id,
                })
        return True

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
