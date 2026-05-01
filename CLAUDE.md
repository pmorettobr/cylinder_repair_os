# cylinder_repair_os — CLAUDE.md
Versão: 16.0.1.0.2 | Leia antes de qualquer alteração.

## Ambiente
| Item | Valor |
|---|---|
| Odoo | 16 Community, self-hosted |
| Módulo | `/opt/odoo16/custom-addons/cylinder_repair_os/` |
| Banco | `db_repair_v1` |
| Servidor | `paulmarwtt.dyndns.org:8069` / `192.168.1.243` |
| venv | `source /opt/odoo16/venv/bin/activate` |
| Addons path | `/opt/odoo16/odoo/odoo/addons,/opt/odoo16/odoo/addons,/opt/odoo16/custom-addons` |
| Update | `sudo -u odoo /opt/odoo16/odoo-bin -d db_repair_v1 -u cylinder_repair_os --addons-path ... --stop-after-init` |

## Módulos relacionados
| Módulo | Status | Obs |
|---|---|---|
| `cylinder_repair_mobile` | ✅ Ativo | PWA operador |
| `cylinder_repair_cq` | ✅ Ativo | — |
| `cylinder_repair_cq_mobile` | ✅ Ativo | PWA inspetor CQ |

## Modelos
| Arquivo | Model | Destaques |
|---|---|---|
| `repair_os_process.py` | `repair.os.process` | model principal + RepairPauseHistory |
| `repair_order_extension.py` | `repair.order` | cylinder_id, process_set_id, os_state, os_number |
| `repair_cylinder.py` | `repair.cylinder` | produto/cilindro |
| `repair_machine.py` | `repair.machine` | is_busy, allow_parallel, bypass_sequence |
| `repair_machine_operator.py` | `repair.machine.operator` | — |
| `repair_component_type.py` | `repair.component.type` | location_text, location_status |
| `repair_process_set.py` | `repair.process.set` | templates de produto + wizard seleção |
| `repair_process_template.py` | `repair.process.template` | catálogo de processos |
| `repair_quality_template.py` | `repair.quality.template` | em desenvolvimento |
| `repair_sub_component.py` | `repair.sub.component` | — |

## Fields — repair.os.process
```
# Cronômetro
duration_acc        Float  — minutos efetivos acumulados
duration_planned    Float  — minutos previstos
duration_display    Char computed — HH:MM:SS

# Datas (UTC garantido via fields.Datetime.now())
date_start_orig     Datetime — 1º início (imutável)
date_start          Datetime — início sessão atual
date_finished       Datetime

# Lead time (computed+stored)
lead_time_minutes   Float — início→fim incl. pausas
wait_time_minutes   Float — tempo em pausa
efficiency_pct      Float — % tempo efetivo

# Pausa
pause_count         Integer
pause_reason        Selection: setup/waiting_material/waiting_operator/problem/other
pause_notes         Text — obrigatório só para 'other'
pause_history_ids   One2many → repair.pause.history

# Estado
state               ready/progress/paused/pending_cq/done/cancel
requires_cq         Boolean (default True)
cq_result           pending/approved/rejected
cq_rejection_count  Integer
cq_notes            Text

# Desvio
has_deviation       Boolean
deviation_notes     Text
deviation_action    Selection: pause/cancel
```

## Fields — repair.order (campos customizados)
```
os_number           Char — Nº OS (único, index=True)
os_state            Selection: draft/confirmed/in_progress/done/cancel
cylinder_id         Many2one repair.cylinder
process_set_id      Many2one repair.process.set
order_type          Selection: repair/fabrication
deadline_date       Date
responsible_id      Many2one res.users
is_overdue          Boolean computed — vencida
is_near_deadline    Boolean computed — prazo ≤ 7 dias, não vencida
process_ids         One2many repair.os.process
progress_percent    Float computed
```

## Fluxo de estados — repair.os.process
```
ready → progress → paused → progress → pending_cq → done (aprovado)
                                                   → ready (reprovado)
                                     → done (direto se requires_cq=False)
cancel: de ready ou paused
```

## Lógica de máquinas
```
allow_parallel = True  → bypass total: sem validação de sequência nem de disponibilidade
                         vale para qualquer OS, componente, situação
bypass_sequence = True → bypass só de sequência numérica (mantém validação de disponibilidade)
allow_parallel = False → validação completa de sequência e disponibilidade
```

## Telas OWL
- **repair_schedule** — tag: `cylinder_repair_os.schedule`
  - Edição inline: Operação, Máquina, Operador, Data Prog., Previsto
  - Bloqueio de edição: states `progress`, `pending_cq`, `done`, `cancel`
  - Header componente verde + "Liberado para Montagem" quando todos terminais (done+cancel)
  - Progresso: terminal (done+cancel) / total — cancel conta como encerrado
  - isEditLocked(rec) — helper para bloquear edição por estado
- **repair_dashboard** — tag: `cylinder_repair_os.dashboard`
  - Views: dashboard / timeline / machines

## Segurança
```
group_repair_operator   → Operador (herda base.group_user)
group_repair_cq         → Inspetor CQ (herda operator)
group_repair_supervisor → Supervisor (herda cq)
```
- `hide_menus.xml`: oculta `mail.menu_root_discuss`
- `hooks.py` post_init_hook: oculta board, base.menu_module_top, link_tracker e outros

## Decisões arquiteturais
- Sistema de serviço — sem movimentação de estoque, sem `mrp.workorder`
- `duration_acc` (Float) acumula tempo entre pausas sem side effects MRP
- `repair_date_planned` no lugar de `date_planned_start` (evita crash sem calendário)
- `state_label` (Char computed) para labels localizados
- `cylinder_id` (Many2one repair.cylinder) substituiu `product_name`
- `_set_os_state_silent`: SQL direto intencional — evita reload do form wrapper (NÃO trocar por ORM)

## Performance — fixes aplicados (29/04/2026)
- `fields.Datetime.now()` em 7 lugares em repair_os_process.py (UTC garantido)
- `create(vals_list)` em action_load_from_catalog e action_load_processes (batch)
- `_compute_current_process` e `_update_busy_status`: 1 query batch (sem N+1)
- Resultado: 10x mais rápido em carregamento de processos e dashboard de máquinas

## Workarounds ativos
| Problema | Solução |
|---|---|
| Filtrar One2many em wizard | `unlink()` + `create()` no método, não em onchange |
| Views stale no banco | deletar via shell + update |
| Cache .pyc | `find ... -name "*.pyc" -delete` + restart |
| Assets JS/XML/CSS | só Ctrl+Shift+R, sem update (exceto views XML backend) |
| Bus OWL 16 | `bus_service.addChannel()` antes de `.start()` |

## Regras — NUNCA
- `datetime.now()` → sempre `fields.Datetime.now()` ❌
- `super().button_pending()` ou métodos MRP nativos ❌
- `store=True` em computados dependentes de `process_ids.state` ❌
- `groups_id` com `ref()` em `ir.actions.client` ❌
- `special="cancel"` em popup com Many2many ❌
- `if` inline em `t-on-*` OWL → extrair para método JS ❌
- `parseInt`, `Math`, `Number` em expressões OWL → método JS ❌
- `domain` em One2many de form view para filtrar registros já carregados ❌
- `t-att-style` misturado com `style` estático no mesmo elemento ❌
- Loop `for rec: create()` → usar `create(vals_list)` ❌
- Loop `for rec in self: search()` em máquinas → batch query ❌
- `search([])` sem domain em relatórios ❌

## Issues abertas
- [ ] Desktop auto-refresh (Mobile→Desktop sync) — tentativas anteriores causam navegação fora da view
- [ ] Vis-timeline CDN → incluir localmente em `/static/lib/vis-timeline/`
- [ ] Validação de business logic do desktop não aplicada no mobile

## Próximas etapas
- [ ] Relatórios PDF: incluir `lead_time_minutes`, `wait_time_minutes`, `efficiency_pct`, `pause_count`
- [ ] Localização fase 2: remover Disponível/Indisponível, manter só descrição
- [ ] Nível 3 CQ: histórico de reprovações com model dedicado
- [ ] `cylinder_repair_theme`: novo módulo para customização da tela de login (chat separado)

## Paleta de cores
| Uso | Cor |
|---|---|
| Brand | #4f46e5 |
| Concluído | #059669 |
| Em Andamento | #d97706 |
| Danger | #dc2626 |
| Near Deadline | #f59e0b |
| Liberado para Montagem | #d1fae5 → #a7f3d0 (degradê) |
UI: `modern_ux_theme` branch 16.0 (pmorettobr) — não instalado no momento

## Relatórios PDF
- Motor: wkhtmltopdf (padrão Odoo 16) — manter até pós-produção
- Evitar imagens base64 grandes nos templates QWeb
- Todo relatório DEVE filtrar por `machine_ids`, `date_from/date_to`, `operator_id`, `state`
- NUNCA: `search([])` sem domain, negação em campos não indexados

## Instrução para o Claude
Arquitetura antes de código. Se tomar decisão nova, avise para atualizar este arquivo.
Não gerar documentação, manuais ou diagramas salvo quando explicitamente solicitado.
Arquivos entregues sempre via `present_files`.
Sessões longas (> 50 trocas): escrever scope document e iniciar novo chat.