from odoo import models, fields, api
from odoo.exceptions import UserError, ValidationError


class RepairOrder(models.Model):
    _inherit = 'repair.order'

    # ── Campos nativos — tornar opcionais ─────────────────────────────────────
    product_id = fields.Many2one(
        comodel_name='product.product',
        string='Produto (opcional)',
        required=False,
    )
    product_uom = fields.Many2one(
        comodel_name='uom.uom',
        string='Unidade de Medida',
        required=False,
    )

    # ── Número da OS do cliente — campo principal ─────────────────────────────
    cylinder_id = fields.Many2one(
        comodel_name='repair.cylinder',
        string='Cilindro',
        ondelete='set null',
        help='Cilindro em reparo. Ao selecionar, carrega o template de processos vinculado.',
    )
    process_set_id = fields.Many2one(
        comodel_name='repair.process.set',
        string='Template de Processos',
        ondelete='set null',
    )

    os_number = fields.Char(
        string='Nº OS',
        required=True,
        copy=False,
        index=True,
        help='Número sequencial da OS conforme controle do cliente.',
    )

    # ── Tipo de Ordem ─────────────────────────────────────────────────────────
    order_type = fields.Selection(
        selection=[
            ('repair', 'Reparo'),
            ('fabrication', 'Fabricação'),
        ],
        string='Tipo de Ordem',
        default='repair',
        required=True,
        tracking=True,
    )

    # ── Identificação do Cilindro ─────────────────────────────────────────────
    product_name = fields.Char(
        string='Produto / Cilindro',
        compute='_compute_product_name',
        store=True,
        readonly=False,
    )
    serial_code = fields.Char(
        string='Nº de Série / TAG',
        copy=False,
        index=True,
    )
    equipment_description = fields.Char(string='Descrição Adicional')

    # ── Prazo ─────────────────────────────────────────────────────────────────
    deadline_date = fields.Date(
        string='Prazo (Dead Line)',
        help='Data limite para entrega da OS.',
    )

    # ── Responsável ───────────────────────────────────────────────────────────
    responsible_id = fields.Many2one(
        comodel_name='res.users',
        string='Responsável',
        default=lambda self: self.env.user,
    )

    # ── Estado próprio da OS ──────────────────────────────────────────────────
    os_state = fields.Selection(
        selection=[
            ('draft', 'Rascunho'),
            ('confirmed', 'Confirmada'),
            ('in_progress', 'Em Andamento'),
            ('done', 'Concluída'),
            ('cancel', 'Cancelada'),
        ],
        string='Estado OS',
        default='draft',
        tracking=True,
    )

    # ── Processos da OS ───────────────────────────────────────────────────────
    process_ids = fields.One2many(
        comodel_name='repair.os.process',
        inverse_name='repair_id',
        string='Processos',
    )

    # ── Estatísticas de progresso ─────────────────────────────────────────────
    process_count = fields.Integer(
        string='Total de Processos',
        compute='_compute_progress',
        store=False,
    )
    process_done_count = fields.Integer(
        string='Concluídos',
        compute='_compute_progress',
        store=False,
    )
    process_progress_count = fields.Integer(
        string='Em Andamento',
        compute='_compute_progress',
        store=False,
    )
    progress_percent = fields.Float(
        string='Progresso (%)',
        compute='_compute_progress',
        store=False,
        digits=(5, 1),
    )
    is_overdue = fields.Boolean(
        string='Atrasada',
        compute='_compute_progress',
        store=False,
    )

    # ── Campos display (evitam totalização no agrupamento) ───────────────────
    process_done_display = fields.Char(
        compute='_compute_display_fields', store=False)
    process_total_display = fields.Char(
        compute='_compute_display_fields', store=False)
    progress_display = fields.Char(
        compute='_compute_display_fields', store=False)

    # ── Computes ──────────────────────────────────────────────────────────────

    @api.depends(
        'process_ids',
        'process_ids.state',
        'deadline_date',
        'os_state',
    )
    def _compute_progress(self):
        for rec in self:
            procs = rec.process_ids
            total = len(procs)
            done = len(procs.filtered(lambda p: p.state == 'done'))
            in_prog = len(procs.filtered(lambda p: p.state == 'progress'))
            rec.process_count = total
            rec.process_done_count = done
            rec.process_progress_count = in_prog
            rec.progress_percent = (done / total * 100.0) if total else 0.0
            today = fields.Date.today()
            rec.is_overdue = bool(
                rec.deadline_date
                and rec.deadline_date < today
                and rec.os_state not in ('done', 'cancel')
            )

    @api.depends('process_done_count', 'process_count', 'progress_percent')
    def _compute_display_fields(self):
        for rec in self:
            rec.process_done_display = str(rec.process_done_count or 0)
            rec.process_total_display = str(rec.process_count or 0)
            rec.progress_display = '%s%%' % int(rec.progress_percent or 0)

    # ── Constraint unicidade Nº OS ────────────────────────────────────────────

    _sql_constraints = [
        ('os_number_unique', 'unique(os_number)',
         'Já existe uma OS com este número. O Nº OS deve ser único.'),
    ]

    @api.onchange('os_number')
    def _onchange_os_number_check(self):
        if self.os_number:
            existing = self.search([
                ('os_number', '=', self.os_number),
                ('id', '!=', self._origin.id or 0),
            ], limit=1)
            if existing:
                return {
                    'warning': {
                        'title': 'Nº OS duplicado',
                        'message': 'Já existe uma OS com o número "%s". Verifique antes de salvar.' % existing.os_number,
                    }
                }

    # ── name_get — usa os_number como identificador principal ─────────────────

    def name_get(self):
        result = []
        for rec in self:
            name = rec.os_number or rec.name or '(sem número)'
            if rec.product_name:
                name = '%s — %s' % (name, rec.product_name)
            result.append((rec.id, name))
        return result

    # ── Ações de estado ───────────────────────────────────────────────────────

    def action_confirm_os(self):
        for rec in self:
            if not rec.os_number:
                raise UserError('Informe o Nº OS antes de confirmar.')
        self.write({'os_state': 'confirmed'})

    def action_start_os(self):
        self.write({'os_state': 'in_progress'})

    def _set_os_state_silent(self, new_state):
        """
        Atualiza os_state via SQL direto, SEM passar pelo ORM.

        Por que SQL direto aqui:
        O ORM write() atualiza write_date/__last_update no repair.order.
        O cliente web do Odoo 16 monitora __last_update do registro exibido
        no form; quando detecta mudança, recarrega o form — mas sem o contexto
        do Form Wrapper, resolvendo para a view padrão de repair.order.

        Usando SQL direto, os_state é gravado no banco sem alterar write_date,
        tornando a atualização invisível para o cliente nessa request.
        O valor fica disponível para reads subsequentes após invalidate_recordset.

        Uso exclusivo: chamado por repair.os.process.action_start() quando a OS
        ainda está em 'confirmed' e precisa avançar para 'in_progress' de forma
        transparente ao form wrapper.

        Rastreamento de chatter: propositalmente omitido neste caminho para evitar
        o reload. Caso necessite, adicione manualmente via message_post após a
        chamada, em contexto que não envolva o form wrapper.
        """
        valid_states = ('draft', 'confirmed', 'in_progress', 'done', 'cancel')
        if new_state not in valid_states:
            raise ValueError('os_state inválido: %s' % new_state)
        ids = self.ids
        if not ids:
            return
        self.env.cr.execute(
            "UPDATE repair_order SET os_state = %s WHERE id = ANY(%s)",
            (new_state, ids)
        )
        self.invalidate_recordset(['os_state'])

    def action_done_os(self):
        for rec in self:
            if rec.process_ids:
                pending = rec.process_ids.filtered(
                    lambda p: p.state not in ('done', 'cancel')
                )
                if pending:
                    raise UserError(
                        'Existem %d processo(s) não concluídos. '
                        'Conclua ou cancele todos os processos antes de fechar a OS.'
                        % len(pending)
                    )
        self.write({'os_state': 'done'})

    def action_done_os_empty(self):
        """Conclui OS mesmo sem processos carregados."""
        self.ensure_one()
        self.write({'os_state': 'done'})

    def action_cancel_os(self):
        for rec in self:
            active_procs = rec.process_ids.filtered(
                lambda p: p.state == 'progress'
            )
            if active_procs:
                raise UserError(
                    'Existe(m) %d processo(s) em andamento. '
                    'Pause ou conclua os processos antes de cancelar a OS.'
                    % len(active_procs)
                )
        self.write({'os_state': 'cancel'})

    def action_draft_os(self):
        """Volta para rascunho se ainda não iniciada."""
        self.filtered(lambda r: r.os_state == 'confirmed').write({'os_state': 'draft'})

    # ── Abrir processos (Shop Floor) ──────────────────────────────────────────

    def action_open_processes(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Processos — %s' % (self.os_number or self.name),
            'res_model': 'repair.os.process',
            'view_mode': 'tree,form',
            'domain': [('repair_id', '=', self.id)],
            'context': {'default_repair_id': self.id},
            'target': 'current',
        }

    # ── Carregador de processos em lote ───────────────────────────────────────

    @api.depends('cylinder_id')
    def _compute_product_name(self):
        for rec in self:
            if rec.cylinder_id:
                rec.product_name = rec.cylinder_id.name
            elif not rec.product_name:
                rec.product_name = False

    @api.onchange('cylinder_id')
    def _onchange_cylinder_id(self):
        """Ao selecionar cilindro, preenche template e tipo automaticamente."""
        if self.cylinder_id:
            if self.cylinder_id.process_set_id:
                self.process_set_id = self.cylinder_id.process_set_id
            if self.cylinder_id.repair_type:
                self.type = self.cylinder_id.repair_type

    def action_load_from_set(self):
        """Carrega processos do template na OS. Chamado pela tela de OS."""
        self.ensure_one()
        if not self.process_set_id:
            return False

        # Coleta IDs dos templates do set
        template_ids = self.process_set_id.line_ids.mapped('template_id').ids
        if not template_ids:
            return False

        # Limpa processos existentes não cancelados
        self.process_ids.filtered(
            lambda p: p.state not in ('cancel',)
        ).unlink()

        # Carrega novos processos
        self.action_load_from_catalog(template_ids)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Template Carregado',
                'message': '%d processo(s) carregado(s) do template "%s".' % (
                    len(template_ids), self.process_set_id.name
                ),
                'type': 'success',
                'sticky': False,
            }
        }

    def action_confirm_and_start(self):
        """Confirma e inicia a OS em um único clique."""
        self.ensure_one()
        if self.os_state == 'draft':
            self.action_confirm_os()
        self.action_start_os()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'OS Confirmada',
                'message': 'OS %s confirmada com sucesso.' % (self.os_number or ''),
                'type': 'success',
                'sticky': False,
            }
        }

    def action_open_process_loader_add_more(self):
        """Abre o carregador para adicionar mais processos (já carregados aparecem desmarcados)."""
        self.ensure_one()
        # Same as normal loader but context signals "add more" mode
        return self.action_open_process_loader()

    def action_open_processes_grouped(self):
        """Abre tela OWL de programação como client action."""
        self.ensure_one()
        action = self.env.ref('cylinder_repair_os.action_repair_schedule').read()[0]
        action['name'] = 'Programação — %s' % (self.os_number or self.name or '')
        action['context'] = {
            'active_repair_id': self.id,
            'default_repair_id': self.id,
            'repair_id': self.id,
        }
        return action

    def action_open_os_form(self):
        """Volta para o form padrão da OS."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'OS %s' % (self.os_number or self.name or ''),
            'res_model': 'repair.order',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'self',
        }

    def action_get_catalog_for_owl(self):
        """Retorna templates do catálogo filtrados — exclui processos já carregados
        (exceto cancelados). Usado pelo wizard OWL de seleção."""
        self.ensure_one()

        # IDs de processos já na OS que NÃO estão cancelados
        # formato: (template_id ou name+component) para comparação
        active_processes = self.env['repair.os.process'].search([
            ('repair_id', '=', self.id),
            ('state', '!=', 'cancel'),
        ])

        # Chave de exclusão: (component_type_id, name)
        excluded = set()
        for proc in active_processes:
            ct = proc.component_type_id.id or 0
            excluded.add((ct, proc.name))

        # Busca todos os templates ativos
        templates = self.env['repair.process.template'].search(
            [('active', '=', True)],
            order='component_type_id, sequence'
        )

        result = []
        for tmpl in templates:
            ct_id = tmpl.component_type_id.id or 0
            key = (ct_id, tmpl.name)
            if key in excluded:
                continue
            result.append({
                'id':                   tmpl.id,
                'sequence':             tmpl.sequence,
                'component_type_id':    [ct_id, tmpl.component_type_id.name] if tmpl.component_type_id else [0, ''],
                'name':                 tmpl.name,
                'machine_id':           [tmpl.machine_id.id, tmpl.machine_id.name] if tmpl.machine_id else False,
                'duration_planned':     tmpl.duration_planned or 0.0,
                'requires_cq':          tmpl.requires_cq,
            })

        return result

    def action_load_from_catalog(self, template_ids):
        """Carrega processos do catálogo na OS. Chamado pelo wizard OWL."""
        self.ensure_one()
        if not template_ids:
            return False

        templates = self.env['repair.process.template'].browse(template_ids)

        # Calcula próxima sequência por componente
        existing_seqs = {}
        for proc in self.process_ids:
            ct = proc.component_type_id.id or 0
            existing_seqs[ct] = max(existing_seqs.get(ct, 0), proc.sequence)

        for tmpl in templates:
            ct_id = tmpl.component_type_id.id or 0
            next_seq = existing_seqs.get(ct_id, 0) + 10
            existing_seqs[ct_id] = next_seq

            self.env['repair.os.process'].create({
                'repair_id':           self.id,
                'sequence':            next_seq,
                'name':                tmpl.name,
                'service_description': tmpl.service_description or False,
                'component_type_id':   tmpl.component_type_id.id if tmpl.component_type_id else False,
                'machine_id':          tmpl.machine_id.id if tmpl.machine_id else False,
                'requires_cq':         tmpl.requires_cq,
                'duration_planned':    tmpl.duration_planned or 0.0,
                'state':               'ready',
            })

        return True

    def action_open_process_loader(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Carregar Processos',
            'res_model': 'repair.process.loader',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_repair_id': self.id},
        }
