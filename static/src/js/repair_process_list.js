/** @odoo-module **/
/**
 * cylinder_repair_os — RepairProcessListWidget
 *
 * Widget OWL para exibir e interagir com os processos de uma OS,
 * agrupados por Componente com colapso/expansão.
 *
 * Registrado como field widget "repair_process_list" para One2many.
 */

import { Component, useState, useRef, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class RepairProcessListWidget extends Component {
    static template = "cylinder_repair_os.RepairProcessList";

    // Aceita todos os props que o Odoo passa para field widgets
    static props = { "*": true };

    // ── Setup ──────────────────────────────────────────────────────────────

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");

        this.state = useState({
            collapsed: {},  // { [component_type_id]: true/false }
        });

        // ID do processo sendo editado (data_planned inline)
        this.editingDate = null;
        this.loading = null;

        // Ref para focar o input de data ao abrir
        this.dateInputRef = useRef("dateInput");

        onMounted(() => {
            this._restoreCollapseState();
        });
    }

    // ── Dados agrupados ────────────────────────────────────────────────────

    get records() {
        return this.props.value?.records || [];
    }

    get groupedProcesses() {
        const groups = new Map();

        // Ordena por component_type_id e sequence
        const sorted = [...this.records].sort((a, b) => {
            const ctA = a.data.component_type_id?.[0] || 0;
            const ctB = b.data.component_type_id?.[0] || 0;
            if (ctA !== ctB) return ctA - ctB;
            return (a.data.sequence || 0) - (b.data.sequence || 0);
        });

        for (const rec of sorted) {
            const ctId = rec.data.component_type_id?.[0] || 0;
            const ctName = rec.data.component_type_id?.[1] || "(Sem Componente)";

            if (!groups.has(ctId)) {
                groups.set(ctId, {
                    id: ctId,
                    name: ctName,
                    records: [],
                    inProgress: 0,
                    done: 0,
                });
            }

            const g = groups.get(ctId);
            g.records.push(rec);
            if (rec.data.state === "progress") g.inProgress++;
            if (rec.data.state === "done") g.done++;
        }

        return [...groups.values()];
    }

    // ── Colapso / Expansão ─────────────────────────────────────────────────

    toggleGroup(groupId) {
        this.state.collapsed[groupId] = !this.state.collapsed[groupId];
        this._saveCollapseState();
    }

    isCollapsed(groupId) {
        return !!this.state.collapsed[groupId];
    }

    _collapseKey() {
        const osId = this.props.record?.resId || "new";
        return `repair_collapse_${osId}`;
    }

    _saveCollapseState() {
        try {
            localStorage.setItem(this._collapseKey(), JSON.stringify(this.state.collapsed));
        } catch (_) {}
    }

    _restoreCollapseState() {
        try {
            const saved = localStorage.getItem(this._collapseKey());
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(this.state.collapsed, parsed);
            }
        } catch (_) {}
    }

    // ── Helpers visuais ────────────────────────────────────────────────────

    getRowClass(state) {
        const base = "o_data_row o_repair_proc_row";
        const map = {
            done: base + " o_repair_row_done",
            progress: base + " o_repair_row_progress",
            paused: base + " o_repair_row_paused",
            cancel: base + " o_repair_row_cancel",
        };
        return map[state] || base;
    }

    getStateBadgeClass(state) {
        const map = {
            ready:    "badge o_repair_state_ready",
            progress: "badge o_repair_state_progress",
            paused:   "badge o_repair_state_paused",
            done:     "badge o_repair_state_done",
            cancel:   "badge o_repair_state_cancel",
        };
        return map[state] || "badge bg-secondary";
    }

    getStateLabel(state) {
        const map = {
            ready:    "Pronto",
            progress: "Em Andamento",
            paused:   "Pausado",
            done:     "Concluído",
            cancel:   "Cancelado",
        };
        return map[state] || state;
    }

    formatDate(dateStr) {
        if (!dateStr) return "—";
        try {
            const [y, m, d] = dateStr.split("-");
            return `${d}/${m}/${y}`;
        } catch (_) {
            return dateStr;
        }
    }

    formatDatetime(datetimeStr) {
        if (!datetimeStr) return "—";
        try {
            // Odoo returns "2024-03-28 14:30:00"
            const [date, time] = datetimeStr.split(" ");
            const [y, m, d] = date.split("-");
            const [h, min] = time.split(":");
            return `${d}/${m} ${h}:${min}`;
        } catch (_) {
            return "—";
        }
    }

    // ── Edição inline de Data Programada ──────────────────────────────────

    startEditDate(recordId) {
        if (this.props.readonly) return;
        this.editingDate = recordId;
    }

    cancelEditDate() {
        this.editingDate = null;
    }

    async saveDatePlanned(rec, ev) {
        const newDate = ev.target.value; // "YYYY-MM-DD" or ""
        this.editingDate = null;

        if (newDate === (rec.data.date_planned || "")) return;

        try {
            await this.orm.write("repair.os.process", [rec.id], {
                date_planned: newDate || false,
            });
            await this._reload();
        } catch (error) {
            this.notification.add(
                error.message || "Erro ao salvar Data Programada",
                { type: "danger" }
            );
        }
    }

    // ── Ações nos processos ────────────────────────────────────────────────

    async _callAndReload(model, method, ids) {
        this.loading = ids[0];
        try {
            const result = await this.orm.call(model, method, [ids]);
            // Se o método retornou uma action (ex: popup QC), executa
            if (result && result.type === "ir.actions.act_window") {
                await this.action.doAction(result, {
                    onClose: async () => { await this._reload(); },
                });
            } else {
                await this._reload();
            }
        } catch (error) {
            this.notification.add(
                error.data?.message || error.message || "Erro ao executar ação",
                { type: "danger" }
            );
        } finally {
            this.loading = null;
        }
    }

    async _reload() {
        await this.props.record.load();
        // Força re-render do componente pai
        this.props.record.model.notify();
    }

    async onStart(id)  { await this._callAndReload("repair.os.process", "action_start",  [id]); }
    async onPause(id)  { await this._callAndReload("repair.os.process", "action_pause",  [id]); }
    async onFinish(id) { await this._callAndReload("repair.os.process", "action_finish", [id]); }
    async onCancel(id) { await this._callAndReload("repair.os.process", "action_cancel", [id]); }

    async openDeviationPopup(id) {
        await this._callAndReload("repair.os.process", "action_open_deviation_popup", [id]);
    }
}

// Registra o widget para o tipo One2many
registry.category("fields").add("repair_process_list", {
    component: RepairProcessListWidget,
    supportedTypes: ["one2many"],
});
