from odoo import models, fields


class RepairQualityTemplate(models.Model):
    """
    Template de Controle de Qualidade.
    Define o checklist padrão que será copiado para cada processo
    quando for concluído.
    """
    _name = 'repair.quality.template'
    _description = 'Template de Controle de Qualidade'
    _order = 'name'

    name = fields.Char(string='Nome do Template', required=True)
    active = fields.Boolean(default=True)
    block_on_fail = fields.Boolean(
        string='Bloquear Conclusão se Reprovar?',
        default=False,
        help='Se marcado, o processo não pode ser concluído enquanto houver itens reprovados.',
    )
    notes = fields.Text(string='Observações')

    check_ids = fields.One2many(
        comodel_name='repair.quality.template.line',
        inverse_name='template_id',
        string='Itens de Verificação',
    )
    check_count = fields.Integer(
        string='Itens',
        compute='_compute_check_count',
    )

    def _compute_check_count(self):
        for rec in self:
            rec.check_count = len(rec.check_ids)


class RepairQualityTemplateLine(models.Model):
    """Linha do checklist de qualidade (template)."""
    _name = 'repair.quality.template.line'
    _description = 'Item de Verificação — Template'
    _order = 'sequence, id'

    template_id = fields.Many2one(
        comodel_name='repair.quality.template',
        string='Template',
        required=True,
        ondelete='cascade',
        index=True,
    )
    sequence = fields.Integer(string='Seq.', default=10)
    name = fields.Char(string='Verificação', required=True,
                       help='Ex: Acabamento superficial OK, Dimensional conforme...')
    is_required = fields.Boolean(
        string='Obrigatório?',
        default=True,
        help='Se marcado, este item precisa ser aprovado para concluir o processo.',
    )


class RepairQualityCheck(models.Model):
    """
    Checklist de qualidade vinculado a um processo específico da OS.
    Criado automaticamente a partir do template quando o processo é concluído.
    """
    _name = 'repair.quality.check'
    _description = 'Controle de Qualidade do Processo'
    _order = 'sequence, id'

    process_id = fields.Many2one(
        comodel_name='repair.os.process',
        string='Processo',
        required=True,
        ondelete='cascade',
        index=True,
    )
    sequence = fields.Integer(string='Seq.', default=10)
    name = fields.Char(string='Verificação', required=True)
    is_required = fields.Boolean(string='Obrigatório?', default=True)
    result = fields.Selection(
        selection=[
            ('pending', 'Pendente'),
            ('pass', 'Aprovado'),
            ('fail', 'Reprovado'),
        ],
        string='Resultado',
        default='pending',
        required=True,
    )
    notes = fields.Text(string='Observação')
