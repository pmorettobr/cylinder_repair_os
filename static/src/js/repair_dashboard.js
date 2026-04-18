/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
const { Component, useState, onWillStart, onMounted, onWillUnmount, onPatched } = owl;

// ── Paleta de cores por estado ────────────────────────────────────────
const STATE_COLOR = {
    ready:    "#6366f1",
    progress: "#f59e0b",
    paused:   "#3b82f6",
    done:     "#10b981",
    cancel:   "#9ca3af",
};
const STATE_LABEL = {
    ready:"Pronto", progress:"Em Andamento",
    paused:"Pausado", done:"Concluído", cancel:"Cancelado",
};


// ── Carrega vis-timeline do CDN se não estiver disponível ────────────
function loadVisCss() {
    if (document.querySelector('#vis-timeline-css')) return;
    const link = document.createElement('link');
    link.id = 'vis-timeline-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.css';
    document.head.appendChild(link);
}
function loadVisJS() {
    return new Promise((resolve) => {
        if (typeof vis !== 'undefined') { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

class RepairDashboard extends Component {

    setup() {
        this.orm        = useService("orm");
        this.action     = useService("action");
        this.busService = useService("bus_service");
        this.notif      = useService("notification");

        this.state = useState({
            view:              "dashboard",   // "dashboard" | "timeline" | "machines"
            loading:           true,
            counts:            { ready:0, progress:0, paused:0, done:0, cancel:0 },
            machines:          [],
            orders:            [],
            processes:         [],
            // Item 12 — Fila por máquina
            selectedMachineId: null,
            mqFilterState:     "",   // "" = todos | "ready" | "progress" | "paused"
            mqFilterComponent: 0,    // 0 = todos
            compLocations:     {},   // { [component_type_id]: {location_text, location_status} }
            // Dashboard principal — filtro por prazo
            dateFilter:        "all", // "all" | "today" | "week" | "month"
        });

        this._pollInterval = null;
        this._timelineInst = null;

        onWillStart(async () => { await this._loadData(); });

        onMounted(() => {
            this._startPolling();
            this._initBus();
            if (this.state.view === "timeline") this._renderTimeline();
        });

        onPatched(() => {
            if (this.state.view === "timeline" && !this._timelineInst) {
                this._renderTimeline();
            }
        });

        onWillUnmount(() => {
            clearInterval(this._pollInterval);
            this._destroyTimeline();
            this.busService.removeEventListener("notification", this._busHandler);
        });
    }

    // ── Dados ─────────────────────────────────────────────────────────

    async _loadData() {
        try {
            const [orders, processes, machines, comps] = await Promise.all([
                this.orm.searchRead(
                    "repair.order",
                    [["os_state", "not in", ["cancel", "done"]]],
                    ["os_number", "partner_id", "cylinder_id", "os_state",
                     "deadline_date", "progress_percent", "process_count",
                     "process_done_count", "is_overdue"]
                ),
                this.orm.searchRead(
                    "repair.os.process",
                    [["state", "in", ["ready", "progress", "paused", "pending_cq"]]],
                    ["name", "state", "machine_id", "repair_id",
                     "date_start_orig", "date_start", "date_finished",
                     "duration_acc", "duration_planned", "component_type_id",
                     "operator_id", "has_deviation", "sequence"],
                    { limit: 500 }
                ),
                this.orm.searchRead(
                    "repair.machine",
                    [["active", "=", true]],
                    ["name", "code"]
                ),
                this.orm.searchRead(
                    "repair.component.type",
                    [["active", "=", true]],
                    ["id", "location_text", "location_status"]
                ),
            ]);

            // Contagens por estado dos processos de OSs abertas
            const counts = { ready:0, progress:0, paused:0, done:0, cancel:0 };
            for (const p of processes) {
                if (counts[p.state] !== undefined) counts[p.state]++;
            }

            // Grid de máquinas: qual processo está em andamento + fila
            const machineMap = {};
            for (const m of machines) {
                machineMap[m.id] = { ...m, current: null, queue: 0 };
            }
            for (const p of processes) {
                if (!p.machine_id) continue;
                const mid = p.machine_id[0];
                if (!machineMap[mid]) continue;
                if (p.state === "progress") {
                    machineMap[mid].current = p;
                }
                if (["ready", "progress", "paused", "pending_cq"].includes(p.state)) {
                    machineMap[mid].queue++;
                }
            }

            this.state.counts    = counts;
            this.state.machines  = Object.values(machineMap);
            this.state.orders    = orders;
            this.state.processes = processes;
            // Localização dos componentes
            const locMap = {};
            for (const c of (comps || [])) locMap[c.id] = c;
            this.state.compLocations = locMap;
            this.state.loading   = false;

            // Atualiza timeline se estiver visível
            if (this.state.view === "timeline" && this._timelineInst) {
                this._updateTimeline();
            }
        } catch (e) {
            this.state.loading = false;
        }
    }

    // ── Polling + Bus ─────────────────────────────────────────────────

    _startPolling() {
        this._pollInterval = setInterval(() => {
            if (!document.hidden) this._loadData();
        }, 10000);
    }

    _initBus() {
        this._busHandler = ({ detail: notifications }) => {
            const relevant = (notifications || []).some(n =>
                n.type === "process_state_changed"
            );
            if (relevant) this._loadData();
        };
        this.busService.addEventListener("notification", this._busHandler);
        this.busService.start();
    }

    // ── Item 12 — Fila por Máquina ────────────────────────────────────

    get filteredOrders() {
        const f = this.state.dateFilter;
        if (f === 'all') return this.state.orders;
        const now = new Date();
        return this.state.orders.filter(os => {
            if (!os.deadline_date) return true;
            const d = new Date(os.deadline_date + 'T23:59:59');
            if (f === 'today') { const e = new Date(now); e.setHours(23,59,59,999); return d <= e; }
            if (f === 'week')  { const e = new Date(now); e.setDate(e.getDate()+7); e.setHours(23,59,59,999); return d <= e; }
            if (f === 'month') { const e = new Date(now); e.setDate(e.getDate()+30); e.setHours(23,59,59,999); return d <= e; }
            return true;
        });
    }

    get machineQueue() {
        const mid = this.state.selectedMachineId;
        if (!mid) return [];
        return this.state.processes
            .filter(p =>
                p.machine_id && p.machine_id[0] === mid &&
                p.state !== 'cancel' && p.state !== 'done' &&
                (!this.state.mqFilterState || p.state === this.state.mqFilterState)
            )
            .sort((a, b) => {
                const ca = (a.component_type_id || [0])[0];
                const cb = (b.component_type_id || [0])[0];
                if (ca !== cb) return ca - cb;
                return (a.sequence || 0) - (b.sequence || 0);
            });
    }

    get machineQueueGrouped() {
        const map = new Map();
        for (const p of this.machineQueue) {
            if (this.state.mqFilterComponent &&
                (!p.component_type_id || p.component_type_id[0] !== this.state.mqFilterComponent)) continue;
            const osId   = p.repair_id ? p.repair_id[0] : 0;
            const osName = p.repair_id ? p.repair_id[1] : '—';
            if (!map.has(osId)) map.set(osId, { id: osId, name: osName, items: [] });
            map.get(osId).items.push(p);
        }
        return [...map.values()];
    }

    get machineQueueComponents() {
        const mid = this.state.selectedMachineId;
        if (!mid) return [];
        const comps = new Map();
        for (const p of this.state.processes) {
            if (p.machine_id && p.machine_id[0] === mid && p.component_type_id) {
                const [id, name] = p.component_type_id;
                if (!comps.has(id)) comps.set(id, name);
            }
        }
        return [...comps.entries()].map(([id, name]) => ({id, name}));
    }

    selectMachine(id) {
        this.state.selectedMachineId = id;
        this.state.mqFilterState     = "";
        this.state.mqFilterComponent = 0;
    }

    mqStateBadge(s) {
        return {
            ready:      "text-bg-secondary",
            progress:   "text-bg-warning",
            paused:     "text-bg-info",
            pending_cq: "text-bg-primary",
        }[s] || "text-bg-secondary";
    }

    mqStateLabel(s) {
        return { ready:"Pronto", progress:"Em Andamento", paused:"Pausado", pending_cq:"Aguardando CQ" }[s] || s;
    }

    locText(compId) {
        const loc = this.state.compLocations[compId];
        return loc && loc.location_text ? loc.location_text : '';
    }

    locCls(compId) {
        const loc = this.state.compLocations[compId];
        if (!loc || !loc.location_text) return 'text-muted';
        return loc.location_status === 'available' ? 'text-success' : 'text-danger';
    }

    // ── Navegação ─────────────────────────────────────────────────────

    async setView(v) {
        this.state.view = v;
        this._destroyTimeline();
        if (v === "timeline") {
            loadVisCss();
            await loadVisJS();
            // renderiza no próximo onPatched
        }
    }

    openOS(repairId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "repair.order",
            res_id: repairId,
            view_mode: "form",
            views: [[false, "form"]],
            target: "current",
        });
    }

    openSchedule(repairId) {
        this.action.doAction({
            type: "ir.actions.client",
            tag: "cylinder_repair_os.schedule",
            name: "Programação",
            context: { active_repair_id: repairId },
        });
    }

    // ── Timeline vis-timeline ─────────────────────────────────────────

    _getTimelineItems() {
        const now = new Date();
        const items = [];
        for (const p of this.state.processes) {
            if (!p.machine_id) continue;
            if (p.state === "cancel") continue;

            let start, end;

            if (p.date_start_orig) {
                start = new Date(p.date_start_orig.replace(" ", "T") + "Z");
            } else if (p.date_start) {
                start = new Date(p.date_start.replace(" ", "T") + "Z");
            } else {
                continue; // sem data, não mostra na timeline
            }

            if (p.date_finished) {
                end = new Date(p.date_finished.replace(" ", "T") + "Z");
            } else if (p.state === "progress") {
                end = now;
            } else if (p.duration_planned) {
                end = new Date(start.getTime() + p.duration_planned * 60000);
            } else {
                end = new Date(start.getTime() + 60 * 60000); // 1h padrão
            }

            const os = p.repair_id ? p.repair_id[1] : "";
            const comp = p.component_type_id ? p.component_type_id[1] : "";

            items.push({
                id: p.id,
                group: p.machine_id[0],
                start,
                end,
                content: `<span title="${comp}">${os} — ${p.name}</span>`,
                style: `background:${STATE_COLOR[p.state]};color:#fff;border-color:${STATE_COLOR[p.state]};border-radius:4px;font-size:11px;`,
                title: `${os} | ${comp} | ${p.name} | ${STATE_LABEL[p.state]}`,
            });
        }
        return items;
    }

    _getTimelineGroups() {
        return this.state.machines.map(m => ({
            id: m.id,
            content: `<span style="font-size:12px;font-weight:600;">${m.name}</span>`,
        }));
    }

    _renderTimeline() {
        const container = document.getElementById("repair_timeline_container");
        if (!container) return;
        if (typeof vis === "undefined") return;

        const items  = new vis.DataSet(this._getTimelineItems());
        const groups = new vis.DataSet(this._getTimelineGroups());

        const now = new Date();
        const options = {
            start:       new Date(now.getTime() - 4 * 3600000),
            end:         new Date(now.getTime() + 8 * 3600000),
            min:         new Date(now.getTime() - 7 * 24 * 3600000),
            max:         new Date(now.getTime() + 7 * 24 * 3600000),
            editable:    false,
            selectable:  true,
            stack:       false,
            groupOrder:  "content",
            orientation: { axis: "top" },
            locale:      "pt",
            zoomKey:     "ctrlKey",
            height:      "100%",
        };

        this._timelineInst = new vis.Timeline(container, items, groups, options);

        this._timelineInst.on("select", (props) => {
            if (props.items.length) {
                const proc = this.state.processes.find(p => p.id === props.items[0]);
                if (proc && proc.repair_id) {
                    this.openSchedule(proc.repair_id[0]);
                }
            }
        });
    }

    _updateTimeline() {
        if (!this._timelineInst) return;
        // Atualiza itens mantendo a posição do zoom
        const container = document.getElementById("repair_timeline_container");
        if (!container) return;
        this._destroyTimeline();
        this._renderTimeline();
    }

    _destroyTimeline() {
        if (this._timelineInst) {
            this._timelineInst.destroy();
            this._timelineInst = null;
        }
    }

    // ── Formatação ────────────────────────────────────────────────────

    fmtDate(v) {
        if (!v) return "";
        const p = v.split("-");
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
    }

    stateBadge(s) {
        return {
            ready:"bg-secondary", progress:"text-bg-warning",
            paused:"text-bg-info", done:"bg-success", cancel:"bg-secondary",
        }[s] || "bg-secondary";
    }

    osStateBadge(s) {
        return {
            draft:"bg-secondary", confirmed:"text-bg-primary",
            in_progress:"text-bg-warning", done:"bg-success", cancel:"bg-danger",
        }[s] || "bg-secondary";
    }
    osStateLabel(s) {
        return { draft:"Rascunho", confirmed:"Confirmada",
                 in_progress:"Em Andamento", done:"Concluída",
                 cancel:"Cancelada" }[s] || (s || "");
    }

    machineStatusCls(m) {
        if (m.current) return "o_dash_machine_busy";
        if (m.queue > 0) return "o_dash_machine_queue";
        return "o_dash_machine_idle";
    }
    machineStatusLabel(m) {
        if (m.current) return `${m.current.repair_id ? m.current.repair_id[1] : "—"}`;
        if (m.queue > 0) return `${m.queue} na fila`;
        return "Livre";
    }
}

RepairDashboard.template = "cylinder_repair_os.RepairDashboard";
registry.category("actions").add("cylinder_repair_os.dashboard", RepairDashboard);
