from odoo import models, fields, api


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

    def action_open_catalog_for_set_wizard(self):
        """Abre wizard para adicionar processos do catálogo ao template."""
        self.ensure_one()
        # Returns wizard action to select processes
        templates = self.env['repair.process.template'].search(
            [('active', '=', True)],
            order='component_type_id, sequence'
        )
        # Exclude already in set
        existing_ids = set(self.line_ids.mapped('template_id').ids)

        wizard = self.env['repair.process.set.wizard'].create({
            'set_id': self.id,
        })
        # Create wizard lines for templates not in set
        for tmpl in templates:
            if tmpl.id not in existing_ids:
                self.env['repair.process.set.wizard.line'].create({
                    'wizard_id': wizard.id,
                    'template_id': tmpl.id,
                    'selected': False,
                })

        return {
            'type': 'ir.actions.act_window',
            'name': 'Adicionar Processos ao Template',
            'res_model': 'repair.process.set.wizard',
            'res_id': wizard.id,
            'view_mode': 'form',
            'target': 'new',
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


class RepairProcessSetWizard(models.TransientModel):
    """Wizard para seleção de processos do catálogo para um template."""
    _name = 'repair.process.set.wizard'
    _description = 'Wizard — Adicionar Processos ao Template'

    set_id      = fields.Many2one('repair.process.set', required=True, ondelete='cascade')
    search_term = fields.Char(string='Buscar', default='')
    line_ids    = fields.One2many('repair.process.set.wizard.line', 'wizard_id', string='Processos')

    def action_search(self):
        """Filtra a lista — chamado pelo botão Buscar."""
        self._onchange_search_term()
        return {
            'type': 'ir.actions.act_window',
            'res_model': self._name,
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    @api.onchange('search_term')
    def _onchange_search_term(self):
        """Reconstrói line_ids filtrando pelo termo buscado."""
        term = (self.search_term or '').strip()

        # Preserva os IDs já selecionados antes de reconstruir
        selected_tmpl_ids = set(
            line.template_id.id for line in self.line_ids if line.selected
        )

        # Templates já no set (excluir da lista)
        existing_in_set = set(self.set_id.line_ids.mapped('template_id').ids)

        # Domínio de busca
        domain = [('active', '=', True)]
        if term:
            domain += ['|',
                ('component_type_id.name', 'ilike', term),
                ('name', 'ilike', term),
            ]

        templates = self.env['repair.process.template'].search(
            domain, order='component_type_id, sequence'
        )

        # Reconstrói line_ids mantendo estado de seleção
        new_lines = []
        for tmpl in templates:
            if tmpl.id not in existing_in_set:
                new_lines.append((0, 0, {
                    'template_id': tmpl.id,
                    'selected':    tmpl.id in selected_tmpl_ids,
                }))

        self.line_ids = [(5, 0, 0)] + new_lines

    def action_select_all(self):
        self.line_ids.write({'selected': True})
        return {'type': 'ir.actions.act_window', 'res_model': self._name,
                'res_id': self.id, 'view_mode': 'form', 'target': 'new'}

    def action_deselect_all(self):
        self.line_ids.write({'selected': False})
        return {'type': 'ir.actions.act_window', 'res_model': self._name,
                'res_id': self.id, 'view_mode': 'form', 'target': 'new'}

    def action_confirm(self):
        self.ensure_one()
        selected = self.line_ids.filtered(lambda l: l.selected)
        for line in selected:
            self.env['repair.process.set.line'].create({
                'set_id':      self.set_id.id,
                'template_id': line.template_id.id,
            })
        return {'type': 'ir.actions.act_window_close'}


class RepairProcessSetWizardLine(models.TransientModel):
    """Linha do wizard de seleção."""
    _name = 'repair.process.set.wizard.line'
    _description = 'Linha do Wizard de Template'
    _order = 'component_type_id, sequence'

    wizard_id         = fields.Many2one('repair.process.set.wizard', ondelete='cascade')
    template_id       = fields.Many2one('repair.process.template', string='Processo', required=True)
    selected          = fields.Boolean(string='✓', default=False)
    component_type_id = fields.Many2one(related='template_id.component_type_id', string='Componente', store=True)
    sequence          = fields.Integer(related='template_id.sequence', string='Seq.', store=True)
    machine_id        = fields.Many2one(related='template_id.machine_id', string='Centro de Trabalho', store=True)
    requires_cq       = fields.Boolean(related='template_id.requires_cq', string='CQ?', store=True)
