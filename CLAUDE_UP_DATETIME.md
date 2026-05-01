# cylinder_repair_os — CLAUDE.md (Versão 16.0.1.0.1)

## Contexto do Projeto
**Status:** Produção com 4 correções críticas aplicadas  
**Data última atualização:** 29 de Abril de 2026  
**Módulo principal:** `/opt/odoo16/custom-addons/cylinder_repair_os/`  
**Banco:** `db_repair_v1`  
**Versão:** 16.0.1.0.1

## Ambiente
| Item | Valor |
|---|---|
| Odoo | 16 Community, self-hosted |
| Servidor | `paulmarwtt.dyndns.org:8069` / `192.168.1.243` |
| venv | `source /opt/odoo16/venv/bin/activate` |
| Addons path | `/opt/odoo16/odoo/odoo/addons,/opt/odoo16/odoo/addons,/opt/odoo16/custom-addons` |
| Update | `sudo -u odoo /opt/odoo16/odoo-bin -d db_repair_v1 -u cylinder_repair_os --addons-path ... --stop-after-init` |

## Módulos Relacionados
| Módulo | Status | Sincronização |
|---|---|---|
| `cylinder_repair_mobile` | ✅ Ativo | JSON-RPC — UTC agora sincronizado |
| `cylinder_repair_cq` | ✅ Ativo | Zero impacto das correções |
| `cylinder_repair_cq_mobile` | ✅ Ativo | Zero impacto das correções |

## Decisões Críticas — Sessão 29/04/2026

### **FIX 1: Timezone UTC — `datetime.now()` → `fields.Datetime.now()`**
- **Problema:** `datetime.now()` retorna local SO; Odoo quer UTC → 3h de erro
- **Solução:** 7 substituições em `repair_os_process.py`
- **Impacto:** `duration_acc`, `lead_time_minutes`, `efficiency_pct` corretos
- **Regra:** NUNCA `datetime.now()` em repair_os_process.py

### **FIX 2: Batch Create — Loop eliminado**
- **Problema:** 52 processos = 52 inserts (10s)
- **Solução:** `create(vals_list)` em vez de loop (1s)
- **Arquivos:** `repair_order_extension.py`, `repair_process_loader.py`

### **FIX 3 & 4: N+1 Máquinas eliminadas**
- **Problema:** 5 máquinas = 5 queries cada operação
- **Solução:** Batch query + mapear em memória
- **Arquivo:** `repair_machine.py` — 2 métodos
- **Impacto:** 10x mais rápido, suporta 300 OS

### **FIX 5: Campo novo `is_near_deadline`**
- **Campo:** Boolean computed em `repair.order`
- **Lógica:** TRUE se deadline ≤7 dias, não vencido
- **UI:** Decoração laranja em lista + kanban

---

## Arquivos Modificados Esta Sessão
```
✅ models/repair_os_process.py (7x datetime.now())
✅ models/repair_order_extension.py (batch + is_near_deadline)
✅ models/repair_machine.py (2x N+1 removidas)
✅ wizard/repair_process_loader.py (batch create)
```

## Regras NUNCA (adicionadas 29/04/2026)
- `datetime.now()` em repair_os_process.py → `fields.Datetime.now()` ✅
- Loop `for rec in self: search()` em machine → batch query ✅
- Loop `for tmpl: create()` → `create(vals_list)` ✅
- (Mantém todas as demais regras anteriores)

## Próximas Prioridades
1. Vis-timeline: CDN → local
2. Relatórios: lead_time + efficiency_pct
3. Cache Redis se > 20 máquinas
4. Documentação API JSON-RPC

---

Para detalhes completos: ver RESUMO_SESSAO_PERFORMANCE.md
Próximo desenvolvedor: leia ambos os arquivos antes de alterações.
