from odoo import models, fields, api


class RepairMachine(models.Model):
    """
    Cadastro de Máquinas / Centros de Trabalho.
    Substitui mrp.workcenter — modelo próprio sem dependência MRP.
    """
    _name = 'repair.machine'
    _description = 'Máquina / Centro de Trabalho'
    _order = 'code, name'

    code = fields.Char(
        string='Código',
        required=True,
        index=True,
        copy=False,
    )
    name = fields.Char(
        string='Máquina',
        required=True,
    )
    operator_name = fields.Char(
        string='Operador Padrão',
        help='Nome do operador responsável por esta máquina.',
    )
    active = fields.Boolean(default=True)
    notes = fields.Text(string='Observações')

    # Campo computado: processo em andamento nesta máquina
    current_process_id = fields.Many2one(
        comodel_name='repair.os.process',
        string='Processo em Andamento',
        compute='_compute_current_process',
        store=False,
    )
    is_busy = fields.Boolean(
        string='Ocupada?',
        compute='_compute_current_process',
        store=False,
    )

    def _compute_current_process(self):
        for rec in self:
            process = self.env['repair.os.process'].search([
                ('machine_id', '=', rec.id),
                ('state', '=', 'progress'),
            ], limit=1)
            rec.current_process_id = process
            rec.is_busy = bool(process)

    _sql_constraints = [
        ('code_unique', 'unique(code)', 'Já existe uma máquina com este código.'),
    ]

    def name_get(self):
        result = []
        for rec in self:
            name = '[%s] %s' % (rec.code, rec.name) if rec.code else rec.name
            result.append((rec.id, name))
        return result

    @api.model
    def _name_search(self, name, args=None, operator='ilike', limit=100, name_get_uid=None):
        args = args or []
        if name:
            domain = ['|', ('code', operator, name), ('name', operator, name)]
            return self._search(domain + args, limit=limit, access_rights_uid=name_get_uid)
        return super()._name_search(name, args, operator, limit, name_get_uid)
