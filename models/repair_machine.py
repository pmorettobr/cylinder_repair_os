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
    active = fields.Boolean(default=True)

    allow_parallel = fields.Boolean(
        string='Permite Paralelo',
        default=False,
        help='Se marcado, este centro aceita múltiplos processos simultâneos mesmo estando ocupado.',
    )
    bypass_sequence = fields.Boolean(
        string='Libera Sequência',
        default=False,
        help='Se marcado, processos neste centro podem ser iniciados '
             'independente da ordem de sequência.',
    )
    operator_count = fields.Integer(
        string='Operadores',
        compute='_compute_operator_count',
        store=False,
    )

    def _compute_operator_count(self):
        for rec in self:
            rec.operator_count = self.env['repair.machine.operator'].search_count([
                ('machine_id', '=', rec.id)
            ])

    # is_busy store=True para permitir uso em filtros/domain de busca.
    # Recomputado explicitamente pelos métodos do repair.os.process.
    is_busy = fields.Boolean(
        string='Ocupada?',
        default=False,
        index=True,
    )

    # current_process_id store=False — sempre ao vivo, só para exibição
    current_process_id = fields.Many2one(
        comodel_name='repair.os.process',
        string='Processo em Andamento',
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

    def _update_busy_status(self):
        """
        Atualiza is_busy baseado nos processos em andamento.
        Chamado pelos métodos action_start / action_pause / action_finish
        do repair.os.process após mudança de estado.
        """
        for rec in self:
            has_active = self.env['repair.os.process'].search_count([
                ('machine_id', '=', rec.id),
                ('state', '=', 'progress'),
            ]) > 0
            if rec.is_busy != has_active:
                rec.is_busy = has_active

    _sql_constraints = [
        ('code_unique', 'unique(code)', 'Já existe uma máquina com este código.'),
    ]

    def action_view_operators(self):
        """Abre a lista de operadores deste centro de trabalho."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Operadores — %s' % self.name,
            'res_model': 'repair.machine.operator',
            'view_mode': 'list,form',
            'domain': [('machine_id', '=', self.id)],
            'context': {'default_machine_id': self.id},
            'target': 'current',
        }

    def name_get(self):
        result = []
        for rec in self:
            # Exibe apenas o nome — sem código prefix
            result.append((rec.id, rec.name))
        return result

    @api.model
    def _name_search(self, name, args=None, operator='ilike', limit=100, name_get_uid=None):
        args = args or []
        if name:
            # Busca por código OU nome para facilitar localização
            domain = ['|', ('code', operator, name), ('name', operator, name)]
            return self._search(domain + args, limit=limit, access_rights_uid=name_get_uid)
        return super()._name_search(name, args, operator, limit, name_get_uid)
