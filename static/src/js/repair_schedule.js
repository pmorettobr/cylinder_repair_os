/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
const { Component, useState, onWillStart } = owl;

class RepairSchedule extends Component {

    setup() {
        this.orm   = useService("orm");
        this.state = useState({
            repairInfo: {},
            processes: [],
            loading: true,
        });

        const ctx = this.props.action.context || {};
        this.repairId = ctx.active_repair_id || ctx.default_repair_id || ctx.repair_id || false;

        onWillStart(async () => {
            await this._loadData();
        });
    }

    async _loadData() {
        if (!this.repairId) {
            this.state.loading = false;
            return;
        }

        // Busca dados da OS
        const repairs = await this.orm.searchRead(
            "repair.order",
            [["id", "=", this.repairId]],
            ["os_number", "product_name", "partner_id", "os_state"]
        );
        this.state.repairInfo = repairs[0] || {};

        // Busca processos
        const procs = await this.orm.searchRead(
            "repair.os.process",
            [["repair_id", "=", this.repairId]],
            ["sequence", "name", "component_type_id", "machine_id",
             "operator_id", "date_planned", "date_start_orig", "date_start",
             "duration_acc", "duration_display", "state",
             "has_deviation", "deviation_tooltip"]
        );
        this.state.processes = procs;
        this.state.loading = false;
    }

    get grouped() {
        const map = new Map();
        const sorted = [...this.state.processes].sort((a, b) => {
            const ca = (a.component_type_id || [0])[0];
            const cb = (b.component_type_id || [0])[0];
            if (ca !== cb) return ca - cb;
            return (a.sequence || 0) - (b.sequence || 0);
        });
        for (const r of sorted) {
            const ct   = r.component_type_id;
            const id   = ct ? ct[0] : 0;
            const name = ct ? ct[1] : "(Sem Componente)";
            if (!map.has(id)) map.set(id, { id, name, records: [] });
            map.get(id).records.push(r);
        }
        return [...map.values()];
    }

    fmtDate(v) {
        if (!v) return "—";
        const p = v.split("-");
        return p.length === 3 ? (p[2] + "/" + p[1] + "/" + p[0]) : v;
    }

    fmtDatetime(v) {
        if (!v) return "—";
        try {
            const parts = v.split(" ");
            const dp = parts[0].split("-");
            const tp = parts[1].split(":");
            return dp[2] + "/" + dp[1] + " " + tp[0] + ":" + tp[1];
        } catch (_) { return "—"; }
    }

    stateLabel(s) {
        return { ready:"Pronto", progress:"Em Andamento", paused:"Pausado",
                 done:"Concluído", cancel:"Cancelado" }[s] || s;
    }

    stateBadge(s) {
        const cls = { ready:"bg-secondary", progress:"text-bg-warning",
                      paused:"text-bg-info", done:"bg-success", cancel:"bg-secondary" };
        return "badge " + (cls[s] || "bg-secondary");
    }

    rowCls(s) {
        return { done:"table-success", progress:"table-warning",
                 paused:"table-info", cancel:"text-muted" }[s] || "";
    }
}

RepairSchedule.template = "cylinder_repair_os.RepairSchedule";
registry.category("actions").add("cylinder_repair_os.schedule", RepairSchedule);
