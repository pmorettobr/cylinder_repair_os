from odoo import models, fields, api


class RepairProcessLoaderLine(models.TransientModel):
    _name = 'repair.process.loader.line'
    _description = 'Linha do Carregador de Processos'
    _order = 'component_type_id, sequence'

    wizard_id         = fields.Many2one('repair.process.loader', ondelete='cascade')
    sequence          = fields.Integer(default=10)
    selected          = fields.Boolean(string='✓', default=True)
    template_id       = fields.Many2one('repair.process.template', string='Template')
    component_type_id = fields.Many2one('repair.component.type', string='Componente')
    name              = fields.Char(string='Operação', required=True)
    service_description = fields.Text(string='Descrição Detalhada')
    machine_id        = fields.Many2one('repair.machine', string='Máquina')
    duration_planned  = fields.Float(string='Tempo Previsto (min)', default=0.0)
    requires_cq       = fields.Boolean(string='Requer Inspeção de Qualidade?', default=False)


class RepairProcessLoader(models.TransientModel):
    _name = 'repair.process.loader'
    _description = 'Carregador de Processos em Lote'

    repair_id = fields.Many2one('repair.order', required=True, readonly=True)
    filter_component_id = fields.Many2one(
        'repair.component.type',
        string='Filtrar por Componente',
        help='Deixe vazio para ver todos.',
    )
    line_ids = fields.One2many(
        'repair.process.loader.line', 'wizard_id', string='Processos',
    )
    catalog_empty = fields.Boolean(
        compute='_compute_catalog_empty',
    )

    @api.depends('line_ids')
    def _compute_catalog_empty(self):
        for rec in self:
            total = self.env['repair.process.template'].search_count(
                [('active', '=', True)]
            )
            rec.catalog_empty = total == 0

    def _build_lines(self, component_id=False):
        domain = [('active', '=', True)]
        if component_id:
            domain.append(('component_type_id', '=', component_id))
        templates = self.env['repair.process.template'].search(
            domain, order='component_type_id, sequence'
        )
        lines = []
        for tmpl in templates:
            lines.append((0, 0, {
                'template_id':       tmpl.id,
                'sequence':          tmpl.sequence,
                'selected':          True,
                'component_type_id': tmpl.component_type_id.id,
                'name':              tmpl.name,
                'service_description': tmpl.service_description or False,
                'machine_id':        tmpl.machine_id.id if tmpl.machine_id else False,
                'duration_planned':  tmpl.duration_planned or 0.0,
                'requires_cq':       tmpl.requires_cq,
            }))
        return lines

    @api.model
    def default_get(self, fields_list):
        vals = super().default_get(fields_list)
        vals['line_ids'] = self._build_lines()
        return vals

    @api.onchange('filter_component_id')
    def _onchange_filter_component(self):
        self.line_ids = [(5, 0, 0)]
        self.line_ids = self._build_lines(
            self.filter_component_id.id if self.filter_component_id else False
        )

    def action_select_all(self):
        self.line_ids.write({'selected': True})
        return self._reopen()

    def action_deselect_all(self):
        self.line_ids.write({'selected': False})
        return self._reopen()

    def _reopen(self):
        return {
            'type': 'ir.actions.act_window',
            'res_model': self._name,
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
            'flags': {'mode': 'edit'},
        }

    def action_load_processes(self):
        self.ensure_one()
        selected = self.line_ids.filtered(lambda l: l.selected and l.name)
        if not selected:
            return {'type': 'ir.actions.act_window_close'}

        repair = self.repair_id
        existing_seqs = {}
        for proc in repair.process_ids:
            ct = proc.component_type_id.id or 0
            existing_seqs[ct] = max(existing_seqs.get(ct, 0), proc.sequence)

        for line in selected:
            ct_id = line.component_type_id.id or 0
            next_seq = existing_seqs.get(ct_id, 0) + 10
            existing_seqs[ct_id] = next_seq

            self.env['repair.os.process'].create({
                'repair_id':          repair.id,
                'sequence':           next_seq,
                'name':               line.name,
                'service_description': line.service_description or False,
                'component_type_id':  line.component_type_id.id if line.component_type_id else False,
                'machine_id':         line.machine_id.id if line.machine_id else False,
                'requires_cq':        line.requires_cq,
                'duration_planned':   line.duration_planned or 0.0,
                'state':              'ready',
            })

        return {'type': 'ir.actions.act_window_close'}
