/** @odoo-module **/

import { Component, useState, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class RepairProcessListWidget extends Component {

    setup() {
        this.orm       = useService("orm");
        this.action    = useService("action");
        this.notif     = useService("notification");
        this.collapsed = useState({});
        this.loadingId = useState({ val: null });
        this.editDate  = useState({ id: null });
        onMounted(() => this._restoreCollapse());
    }

    get records() {
        try { return this.props.record.data[this.props.name].records || []; }
        catch (_) { return []; }
    }

    get grouped() {
        const map = new Map();
        const sorted = [...this.records].sort((a, b) => {
            const ca = (a.data.component_type_id || [0])[0];
            const cb = (b.data.component_type_id || [0])[0];
            if (ca !== cb) return ca - cb;
            return (a.data.sequence || 0) - (b.data.sequence || 0);
        });
        for (const r of sorted) {
            const ct   = r.data.component_type_id;
            const id   = ct ? ct[0] : 0;
            const name = ct ? ct[1] : "(Sem Componente)";
            if (!map.has(id)) map.set(id, { id, name, records: [], prog: 0, done: 0 });
            const g = map.get(id);
            g.records.push(r);
            if (r.data.state === "progress") g.prog++;
            if (r.data.state === "done")     g.done++;
        }
        return [...map.values()];
    }

    toggle(id) {
        this.collapsed[id] = !this.collapsed[id];
        try { localStorage.setItem(this._lsKey(), JSON.stringify(Object.assign({}, this.collapsed))); } catch (_) {}
    }

    _lsKey() { return "cyl_col_" + (this.props.record.resId || "new"); }

    _restoreCollapse() {
        try {
            const s = localStorage.getItem(this._lsKey());
            if (s) Object.assign(this.collapsed, JSON.parse(s));
        } catch (_) {}
    }

    fmtDate(v) {
        if (!v) return "";
        const p = v.split("-");
        return p.length === 3 ? (p[2] + "/" + p[1] + "/" + p[0]) : v;
    }

    fmtDatetime(v) {
        if (!v) return "";
        try {
            const parts = v.split(" ");
            const dp = parts[0].split("-");
            const tp = parts[1].split(":");
            return dp[2] + "/" + dp[1] + " " + tp[0] + ":" + tp[1];
        } catch (_) { return ""; }
    }

    stateLabel(s) {
        const m = { ready:"Pronto", progress:"Em Andamento", paused:"Pausado",
                    done:"Concluido", cancel:"Cancelado" };
        return m[s] || s;
    }

    stateCls(s) {
        const m = { ready:"o_repair_state_ready", progress:"o_repair_state_progress",
                    paused:"o_repair_state_paused", done:"o_repair_state_done",
                    cancel:"o_repair_state_cancel" };
        return "badge " + (m[s] || "bg-secondary");
    }

    rowCls(s) {
        const m = { done:"o_repair_row_done", progress:"o_repair_row_progress",
                    paused:"o_repair_row_paused", cancel:"o_repair_row_cancel" };
        return "o_repair_proc_row " + (m[s] || "");
    }

    startEdit(id)  { this.editDate.id = id; }
    cancelEdit()   { this.editDate.id = null; }

    async saveDate(id, ev) {
        this.editDate.id = null;
        const val = ev.target.value || false;
        try {
            await this.orm.write("repair.os.process", [id], { date_planned: val });
            await this._reload();
        } catch (e) {
            this.notif.add((e.data && e.data.message) || "Erro ao salvar data", { type: "danger" });
        }
    }

    async _run(method, id) {
        this.loadingId.val = id;
        try {
            const res = await this.orm.call("repair.os.process", method, [[id]]);
            if (res && res.type === "ir.actions.act_window") {
                await this.action.doAction(res, { onClose: () => this._reload() });
            } else {
                await this._reload();
            }
        } catch (e) {
            this.notif.add((e.data && e.data.message) || e.message || "Erro", { type: "danger" });
        } finally {
            this.loadingId.val = null;
        }
    }

    async _reload() {
        await this.props.record.load();
        this.props.record.model.notify();
    }

    onStart(id)     { return this._run("action_start",  id); }
    onPause(id)     { return this._run("action_pause",  id); }
    onFinish(id)    { return this._run("action_finish", id); }
    onCancel(id)    { return this._run("action_cancel", id); }
    onDeviation(id) { return this._run("action_open_deviation_popup", id); }
}

RepairProcessListWidget.template = "cylinder_repair_os.RepairProcessList";
RepairProcessListWidget.props    = ["record", "name", "*"];

// relatedFields: lista TODOS os campos que o template usa
// Sem isso o Odoo não os inclui no fetch e ficam undefined
const FIELDS = [
    { name: "sequence",          type: "integer" },
    { name: "component_type_id", type: "many2one", relation: "repair.component.type" },
    { name: "name",              type: "char" },
    { name: "machine_id",        type: "many2one", relation: "repair.machine" },
    { name: "date_planned",      type: "date" },
    { name: "date_start_orig",   type: "datetime" },
    { name: "date_start",        type: "datetime" },
    { name: "duration_acc",      type: "float" },
    { name: "duration_display",  type: "char" },
    { name: "state",             type: "selection" },
    { name: "has_deviation",     type: "boolean" },
    { name: "deviation_tooltip", type: "char" },
];

registry.category("fields").add("repair_process_list", {
    component: RepairProcessListWidget,
    supportedTypes: ["one2many"],
    relatedFields: () => FIELDS,
});
