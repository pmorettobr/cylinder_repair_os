/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

import { Component, useState, onMounted } from "@odoo/owl";

class RepairProcessListWidget extends Component {

    setup() {
        this.notif     = useService("notification");
        this.collapsed = useState({});
        onMounted(() => this._restoreCollapse());
        console.log("[RepairProcessList] mounted ok — Component:", typeof Component);
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
        try {
            localStorage.setItem(
                "cyl_col_" + (this.props.record.resId || "new"),
                JSON.stringify(Object.assign({}, this.collapsed))
            );
        } catch (_) {}
    }

    _restoreCollapse() {
        try {
            const s = localStorage.getItem("cyl_col_" + (this.props.record.resId || "new"));
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
        return { ready:"Pronto", progress:"Em Andamento", paused:"Pausado",
                 done:"Concluído", cancel:"Cancelado" }[s] || s;
    }

    stateCls(s) {
        return "badge " + ({ ready:"bg-secondary", progress:"o_repair_state_progress",
                              paused:"o_repair_state_paused", done:"bg-success",
                              cancel:"bg-secondary" }[s] || "bg-secondary");
    }

    rowCls(s) {
        return "o_repair_proc_row " + ({ done:"o_repair_row_done",
            progress:"o_repair_row_progress", paused:"o_repair_row_paused",
            cancel:"o_repair_row_cancel" }[s] || "");
    }
}

RepairProcessListWidget.template = "cylinder_repair_os.RepairProcessList";
RepairProcessListWidget.props    = ["record", "name", "*"];

const FIELDS = [
    { name: "sequence",          type: "integer" },
    { name: "component_type_id", type: "many2one", relation: "repair.component.type" },
    { name: "name",              type: "char" },
    { name: "machine_id",        type: "many2one", relation: "repair.machine" },
    { name: "operator_id",       type: "many2one", relation: "repair.machine.operator" },
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
