/** @odoo-module **/

import { useState, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { X2ManyField, x2ManyField } from "@web/views/fields/x2many/x2many_field";

/**
 * RepairProcessListWidget
 * Extends the native X2ManyField to add grouped/collapsible rendering
 * for repair.os.process records grouped by component_type_id.
 */
export class RepairProcessListWidget extends X2ManyField {
    static template = "cylinder_repair_os.RepairProcessList";
    static components = {
        ...X2ManyField.components,
    };

    setup() {
        super.setup();
        this.orm = useService("orm");
        this.actionService = useService("action");
        this.notificationService = useService("notification");

        this.groupState = useState({ collapsed: {} });
        this.loadingId = useState({ id: null });
        this.editingDateId = useState({ id: null });

        onMounted(() => this._restoreCollapse());
    }

    // ── Grouped data ──────────────────────────────────────────────────────

    get processRecords() {
        return this.props.record.data[this.props.name]?.records || [];
    }

    get groupedProcesses() {
        const groups = new Map();
        const sorted = [...this.processRecords].sort((a, b) => {
            const ca = a.data.component_type_id?.[0] ?? 0;
            const cb = b.data.component_type_id?.[0] ?? 0;
            if (ca !== cb) return ca - cb;
            return (a.data.sequence ?? 0) - (b.data.sequence ?? 0);
        });
        for (const rec of sorted) {
            const ctId   = rec.data.component_type_id?.[0] ?? 0;
            const ctName = rec.data.component_type_id?.[1] ?? "(Sem Componente)";
            if (!groups.has(ctId)) {
                groups.set(ctId, { id: ctId, name: ctName, records: [], inProgress: 0, done: 0 });
            }
            const g = groups.get(ctId);
            g.records.push(rec);
            if (rec.data.state === "progress") g.inProgress++;
            if (rec.data.state === "done")     g.done++;
        }
        return [...groups.values()];
    }

    // ── Collapse ──────────────────────────────────────────────────────────

    toggleGroup(id) {
        this.groupState.collapsed[id] = !this.groupState.collapsed[id];
        this._saveCollapse();
    }

    isCollapsed(id) { return !!this.groupState.collapsed[id]; }

    _key() {
        const rid = this.props.record.resId || "new";
        return `cyl_collapse_${rid}`;
    }

    _saveCollapse() {
        try { localStorage.setItem(this._key(), JSON.stringify(this.groupState.collapsed)); } catch (_) {}
    }

    _restoreCollapse() {
        try {
            const s = localStorage.getItem(this._key());
            if (s) Object.assign(this.groupState.collapsed, JSON.parse(s));
        } catch (_) {}
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    getRowClass(state) {
        const map = { done: "o_repair_row_done", progress: "o_repair_row_progress",
                      paused: "o_repair_row_paused", cancel: "o_repair_row_cancel" };
        return "o_repair_proc_row " + (map[state] || "");
    }

    getStateBadgeClass(state) {
        const map = { ready: "o_repair_state_ready", progress: "o_repair_state_progress",
                      paused: "o_repair_state_paused", done: "o_repair_state_done",
                      cancel: "o_repair_state_cancel" };
        return "badge " + (map[state] || "bg-secondary");
    }

    getStateLabel(state) {
        const map = { ready: "Pronto", progress: "Em Andamento", paused: "Pausado",
                      done: "Concluído", cancel: "Cancelado" };
        return map[state] || state;
    }

    formatDate(v) {
        if (!v) return "—";
        try { const [y,m,d] = v.split("-"); return `${d}/${m}/${y}`; } catch (_) { return v; }
    }

    formatDatetime(v) {
        if (!v) return "—";
        try {
            const [date, time] = v.split(" ");
            const [y,m,d] = date.split("-");
            const [h,mi]  = time.split(":");
            return `${d}/${m} ${h}:${mi}`;
        } catch (_) { return "—"; }
    }

    // ── Inline date edit ──────────────────────────────────────────────────

    startEditDate(id)  { this.editingDateId.id = id; }
    cancelEditDate()   { this.editingDateId.id = null; }

    async saveDatePlanned(recId, ev) {
        const val = ev.target.value || false;
        this.editingDateId.id = null;
        try {
            await this.orm.write("repair.os.process", [recId], { date_planned: val });
            await this._reload();
        } catch (e) {
            this.notificationService.add(e.data?.message || "Erro ao salvar data", { type: "danger" });
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────

    async _run(method, id) {
        this.loadingId.id = id;
        try {
            const result = await this.orm.call("repair.os.process", method, [[id]]);
            if (result && result.type === "ir.actions.act_window") {
                await this.actionService.doAction(result, { onClose: () => this._reload() });
            } else {
                await this._reload();
            }
        } catch (e) {
            this.notificationService.add(e.data?.message || e.message || "Erro", { type: "danger" });
        } finally {
            this.loadingId.id = null;
        }
    }

    async _reload() {
        await this.props.record.load();
        this.props.record.model.notify();
    }

    onStart(id)         { return this._run("action_start", id); }
    onPause(id)         { return this._run("action_pause", id); }
    onFinish(id)        { return this._run("action_finish", id); }
    onCancel(id)        { return this._run("action_cancel", id); }
    onDeviation(id)     { return this._run("action_open_deviation_popup", id); }
}

// Register extending x2ManyField descriptor
export const repairProcessListWidget = {
    ...x2ManyField,
    component: RepairProcessListWidget,
};

registry.category("fields").add("repair_process_list", repairProcessListWidget);
