/** @odoo-module **/

import { Component, useState, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";

// Safer import — useService is definitely in core/utils/hooks in Odoo 16
// but we guard against it just in case
let useService;
try {
    useService = require("@web/core/utils/hooks").useService;
} catch(_) {
    // fallback for older builds
    useService = require("@web/core/service_hook").useService;
}

class RepairProcessListWidget extends Component {

    setup() {
        this.orm       = useService("orm");
        this.action    = useService("action");
        this.notif     = useService("notification");
        this.collapsed = useState({});
        this.loading   = useState({ id: null });
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
            const cid  = ct ? ct[0] : 0;
            const name = ct ? ct[1] : "(Sem Componente)";
            if (!map.has(cid)) map.set(cid, { id: cid, name, records: [], prog: 0, done: 0 });
            const g = map.get(cid);
            g.records.push(r);
            if (r.data.state === "progress") g.prog++;
            if (r.data.state === "done")     g.done++;
        }
        return [...map.values()];
    }

    toggle(id) {
        this.collapsed[id] = !this.collapsed[id];
        try { localStorage.setItem("cyl_col_" + (this.props.record.resId || 0), JSON.stringify({...this.collapsed})); } catch(_) {}
    }

    _restoreCollapse() {
        try {
            const s = localStorage.getItem("cyl_col_" + (this.props.record.resId || 0));
            if (s) Object.assign(this.collapsed, JSON.parse(s));
        } catch(_) {}
    }

    fmtDate(v) {
        if (!v) return "";
        const p = v.split("-");
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
    }

    fmtDatetime(v) {
        if (!v) return "";
        try {
            const [d, t] = v.split(" ");
            const [,m,dd] = d.split("-");
            const [h,mi] = t.split(":");
            return `${dd}/${m} ${h}:${mi}`;
        } catch(_) { return ""; }
    }

    stateLabel(s) {
        return {ready:"Pronto",progress:"Em Andamento",paused:"Pausado",
                done:"Concluido",cancel:"Cancelado"}[s] || s;
    }

    stateCls(s) {
        const m = {ready:"o_repair_state_ready",progress:"o_repair_state_progress",
                   paused:"o_repair_state_paused",done:"o_repair_state_done",
                   cancel:"o_repair_state_cancel"};
        return `badge ${m[s] || "bg-secondary"}`;
    }

    rowCls(s) {
        const m = {done:"o_repair_row_done",progress:"o_repair_row_progress",
                   paused:"o_repair_row_paused",cancel:"o_repair_row_cancel"};
        return `o_repair_proc_row ${m[s] || ""}`;
    }

    startEdit(id)  { this.editDate.id = id; }
    cancelEdit()   { this.editDate.id = null; }

    async saveDate(id, ev) {
        this.editDate.id = null;
        try {
            await this.orm.write("repair.os.process", [id], { date_planned: ev.target.value || false });
            await this._reload();
        } catch(e) {
            this.notif.add((e.data && e.data.message) || "Erro", { type: "danger" });
        }
    }

    async _run(method, id) {
        this.loading.id = id;
        try {
            const res = await this.orm.call("repair.os.process", method, [[id]]);
            if (res && res.type === "ir.actions.act_window") {
                await this.action.doAction(res, { onClose: () => this._reload() });
            } else {
                await this._reload();
            }
        } catch(e) {
            this.notif.add((e.data && e.data.message) || e.message || "Erro", { type: "danger" });
        } finally {
            this.loading.id = null;
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
RepairProcessListWidget.props    = { record: Object, name: String, readonly: { type: Boolean, optional: true } };

registry.category("fields").add("repair_process_list", {
    component: RepairProcessListWidget,
    supportedTypes: ["one2many"],
});
