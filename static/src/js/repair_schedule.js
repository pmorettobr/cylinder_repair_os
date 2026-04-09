/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
const { Component, useState, onWillStart, onMounted, onPatched, onWillUnmount } = owl;

class RepairSchedule extends Component {

    setup() {
        this.orm        = useService("orm");
        this.action     = useService("action");
        this.notif      = useService("notification");
        this.busService = useService("bus_service");

        this.state = useState({
            repairInfo:         {},
            processes:          [],
            loading:            true,
            loadingId:          null,
            editDateId:         null,
            editOperatorId:     null,
            editPlannedId:      null,
            operatorOptions:    [],
            collapsed:          {},
            dragSrcId:          null,
            dragOverId:         null,
        });

        // Resolve repair_id: context → localStorage (F5 recovery)
        const ctx = this.props.action.context || {};
        const LS_KEY = "cyl_repair_schedule_id";
        let fromCtx = ctx.active_repair_id || ctx.default_repair_id || ctx.repair_id || false;

        if (fromCtx) {
            this.repairId = fromCtx;
            // Salva para F5
            try { localStorage.setItem(LS_KEY, String(fromCtx)); } catch (_) {}
        } else {
            // F5: recupera do localStorage
            try {
                const saved = localStorage.getItem(LS_KEY);
                const parsed = saved ? parseInt(saved, 10) : NaN;
                this.repairId = isNaN(parsed) ? false : parsed;
            } catch (_) {
                this.repairId = false;
            }
        }

        onWillStart(async () => { await this._loadData(); });

        // Bus: subscreve ao canal específico desta OS para receber
        // atualizações do mobile em tempo real
        if (this.repairId) {
            const busChannel = "repair_os_" + this.repairId + "_processes";
            const busHandler = (payload) => {
                // Ignora eventos originados no próprio backend (source=backend)
                // para não duplicar reloads ao usar pelo desktop
                if (payload && payload.source !== "backend_desktop") {
                    this._loadData();
                }
            };
            this.busService.addChannel(busChannel);
            this.busService.subscribe("process_state_changed", busHandler);
            this.busService.start();

            onWillUnmount(() => {
                this.busService.unsubscribe("process_state_changed", busHandler);
                this.busService.deleteChannel(busChannel);
            });
        }

        const initResize = () => {
            document.querySelectorAll(".o_repair_proc_table").forEach(t => this._initColResize(t));
        };
        onMounted(initResize);
        onPatched(initResize);
    }

    // ── Dados ─────────────────────────────────────────────────────────

    async _loadData() {
        if (!this.repairId) { this.state.loading = false; return; }
        try {
            const [repairs, procs] = await Promise.all([
                this.orm.searchRead(
                    "repair.order",
                    [["id", "=", this.repairId]],
                    ["os_number", "product_name", "partner_id", "os_state", "deadline_date"]
                ),
                this.orm.searchRead(
                    "repair.os.process",
                    [["repair_id", "=", this.repairId]],
                    ["sequence", "name", "component_type_id", "machine_id",
                     "operator_id", "date_planned", "date_start_orig", "date_start",
                     "duration_acc", "duration_planned", "duration_display", "state",
                     "has_deviation", "deviation_notes"]
                ),
            ]);
            this.state.repairInfo = repairs[0] || {};
            this.state.processes  = Array.isArray(procs) ? procs : [];
        } catch (e) {
            this.notif.add("Erro ao carregar dados", { type: "danger" });
            this.state.processes = [];
        } finally {
            this.state.loading = false;
        }
    }

    get grouped() {
        const procs = this.state.processes;
        if (!Array.isArray(procs)) return [];
        const map = new Map();
        const sorted = [...procs].sort((a, b) => {
            const ca = (a.component_type_id || [0])[0];
            const cb = (b.component_type_id || [0])[0];
            if (ca !== cb) return ca - cb;
            return (a.sequence || 0) - (b.sequence || 0);
        });
        for (const r of sorted) {
            const ct   = r.component_type_id;
            const id   = ct ? ct[0] : 0;
            const name = ct ? ct[1] : "(Sem Componente)";
            if (!map.has(id)) map.set(id, { id, name, records: [], prog: 0, done: 0 });
            const g = map.get(id);
            g.records.push(r);
            if (r.state === "progress") g.prog++;
            if (r.state === "done")     g.done++;
        }
        return [...map.values()];
    }

    // ── Progresso geral ────────────────────────────────────────────────

    get totalDone() {
        return this.state.processes.filter(p => p.state === "done").length;
    }

    get totalProgress() {
        const total = this.state.processes.length;
        if (!total) return 0;
        return Math.round((this.totalDone / total) * 100);
    }

    // ── Ações de processo ─────────────────────────────────────────────

    async _run(method, id) {
        this.state.loadingId = id;
        try {
            const res = await this.orm.call("repair.os.process", method, [[id]]);
            if (res && res.type) {
                if (!res.views) {
                    const vmode = res.view_mode || "form";
                    res.views = [[res.view_id || false, vmode.split(",")[0]]];
                }
                this.action.doAction(res, { onClose: () => this._loadData() });
            } else {
                await this._loadData();
            }
        } catch (e) {
            this.notif.add((e.data && e.data.message) || e.message || "Erro", { type: "danger" });
        } finally {
            this.state.loadingId = null;
        }
    }

    onStart(id)     { return this._run("action_start",  id); }
    onPause(id)     { return this._run("action_pause",  id); }
    onFinish(id)    { return this._run("action_finish", id); }
    onCancel(id)    { return this._run("action_cancel", id); }
    onDeviation(id) { return this._run("action_open_deviation_popup", id); }

    async onDelete(id) {
        if (!confirm("Excluir este processo?")) return;
        try {
            await this.orm.unlink("repair.os.process", [id]);
            await this._loadData();
        } catch (e) {
            this.notif.add((e.data && e.data.message) || "Erro ao excluir", { type: "danger" });
        }
    }

    // ── Edição inline — Data ──────────────────────────────────────────

    startEditDate(id) {
        this.state.editDateId = id;
        this.state.editOperatorId = null;
        this.state.editPlannedId  = null;
    }
    cancelEditDate() { this.state.editDateId = null; }

    async saveDate(id, ev) {
        const val = ev.target.value || false;
        this.state.editDateId = null;
        try {
            await this.orm.write("repair.os.process", [id], { date_planned: val });
            await this._loadData();
        } catch (e) {
            this.notif.add((e.data && e.data.message) || "Erro ao salvar data", { type: "danger" });
        }
    }

    // ── Edição inline — Operador ──────────────────────────────────────

    async startEditOperator(rec) {
        this.state.editOperatorId = rec.id;
        this.state.editDateId     = null;
        this.state.editPlannedId  = null;
        this.state.operatorOptions = [];
        try {
            const domain = rec.machine_id ? [["machine_id", "=", rec.machine_id[0]]] : [];
            const ops = await this.orm.searchRead(
                "repair.machine.operator", domain, ["id", "name"]
            );
            this.state.operatorOptions = Array.isArray(ops) ? ops : [];
        } catch (_) {
            this.state.operatorOptions = [];
        }
    }
    cancelEditOperator() { this.state.editOperatorId = null; }

    async saveOperator(id, ev) {
        const val = ev.target.value ? parseInt(ev.target.value) : false;
        this.state.editOperatorId = null;
        try {
            await this.orm.write("repair.os.process", [id], { operator_id: val });
            await this._loadData();
        } catch (e) {
            this.notif.add((e.data && e.data.message) || "Erro ao salvar operador", { type: "danger" });
        }
    }

    // ── Edição inline — Tempo Previsto (timepicker) ───────────────────

    startEditPlanned(id) {
        this.state.editPlannedId  = id;
        this.state.editDateId     = null;
        this.state.editOperatorId = null;
    }
    cancelEditPlanned() { this.state.editPlannedId = null; }

    async savePlanned(id, ev) {
        const raw = ev.target.value || "00:00";
        this.state.editPlannedId = null;
        const minutes = this._hhmm2min(raw);
        try {
            await this.orm.write("repair.os.process", [id], { duration_planned: minutes });
            await this._loadData();
        } catch (e) {
            this.notif.add((e.data && e.data.message) || "Erro ao salvar tempo previsto", { type: "danger" });
        }
    }

    // ── Navegação ─────────────────────────────────────────────────────

    goBackToOs() { this.action.restore(); }

    async openProcessLoader() {
        try {
            this.action.doAction({
                type: "ir.actions.act_window",
                name: "Carregar Processos",
                res_model: "repair.process.loader",
                view_mode: "form",
                views: [[false, "form"]],
                target: "new",
                context: { default_repair_id: this.repairId },
            }, { onClose: () => this._loadData() });
        } catch (e) {
            this.notif.add((e.data && e.data.message) || "Erro ao abrir carregador", { type: "danger" });
        }
    }

    // ── Colapso ───────────────────────────────────────────────────────

    toggleGroup(id) { this.state.collapsed[id] = !this.state.collapsed[id]; }

    // ── Drag and drop ─────────────────────────────────────────────────

    onDragStart(ev, id) {
        this.state.dragSrcId = id;
        ev.dataTransfer.effectAllowed = "move";
    }
    onDragOver(ev, id) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        if (this.state.dragOverId !== id) this.state.dragOverId = id;
    }
    onDragLeave(ev) {
        if (!ev.currentTarget.contains(ev.relatedTarget)) this.state.dragOverId = null;
    }
    onDragEnd() {
        this.state.dragSrcId  = null;
        this.state.dragOverId = null;
    }
    async onDrop(ev, groupId, targetId) {
        ev.preventDefault();
        const srcId = this.state.dragSrcId;
        this.state.dragSrcId  = null;
        this.state.dragOverId = null;
        if (!srcId || srcId === targetId) return;
        const group = this.grouped.find(g => g.id === groupId);
        if (!group || !Array.isArray(group.records)) return;
        const ids    = group.records.map(r => r.id);
        const srcIdx = ids.indexOf(srcId);
        const tgtIdx = ids.indexOf(targetId);
        if (srcIdx === -1 || tgtIdx === -1) return;
        const reordered = [...ids];
        reordered.splice(srcIdx, 1);
        reordered.splice(tgtIdx, 0, srcId);
        try {
            await Promise.all(
                reordered.map((id, idx) =>
                    this.orm.write("repair.os.process", [id], { sequence: (idx + 1) * 10 })
                )
            );
            await this._loadData();
        } catch (e) {
            this.notif.add("Erro ao reordenar", { type: "danger" });
        }
    }

    // ── HH:MM ↔ minutos ──────────────────────────────────────────────

    _min2hhmm(minutes) {
        if (!minutes && minutes !== 0) return "00:00";
        const total = Math.round(minutes);
        const h = Math.floor(total / 60);
        const m = total % 60;
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    }

    _hhmm2min(str) {
        if (!str) return 0;
        const parts = String(str).split(":");
        const h = parseInt(parts[0]) || 0;
        const m = parseInt(parts[1]) || 0;
        return h * 60 + m;
    }

    // ── Timer display ─────────────────────────────────────────────────

    timerDisplay(rec) {
        if (rec.duration_display) return rec.duration_display;
        const totalSec = Math.round((rec.duration_acc || 0) * 60);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
    }

    // ── Cores e progresso dos grupos ──────────────────────────────────

    // Retorna objeto com bg, border, gradStart, gradEnd
    _groupPalette(idx) {
        const p = [
            { bg:"#eff6ff", border:"#3b82f6", g1:"#60a5fa", g2:"#2563eb" },
            { bg:"#f0fdf4", border:"#22c55e", g1:"#4ade80", g2:"#16a34a" },
            { bg:"#fefce8", border:"#eab308", g1:"#facc15", g2:"#ca8a04" },
            { bg:"#faf5ff", border:"#a855f7", g1:"#c084fc", g2:"#7c3aed" },
            { bg:"#fff7ed", border:"#f97316", g1:"#fb923c", g2:"#ea580c" },
            { bg:"#ecfdf5", border:"#10b981", g1:"#34d399", g2:"#059669" },
            { bg:"#fdf2f8", border:"#ec4899", g1:"#f472b6", g2:"#db2777" },
            { bg:"#f0f9ff", border:"#0ea5e9", g1:"#38bdf8", g2:"#0284c7" },
        ];
        return p[idx % p.length];
    }

    // Retorna style string completo para o cabeçalho do grupo
    groupHeaderStyle(idx) {
        const c = this._groupPalette(idx);
        return `border-left: 4px solid ${c.border}; background: ${c.bg};`;
    }

    // Retorna style string para a barra de progresso com degradê
    groupBarStyle(idx, pct) {
        const c = this._groupPalette(idx);
        return `width: ${pct}%; height: 5px; background: linear-gradient(90deg, ${c.g1}, ${c.g2}); transition: width 0.4s ease; border-radius: 0;`;
    }

    groupWrapStyle() {
        return "height: 5px; background: #e5e7eb; border-radius: 0; overflow: hidden;";
    }

    groupProgress(group) {
        const total = group.records.length;
        if (!total) return 0;
        return Math.round((group.done / total) * 100);
    }

    // ── Barra de progresso geral — style string ───────────────────────

    globalBarStyle() {
        const pct = this.totalProgress;
        return `width: ${pct}%; height: 100%; background: linear-gradient(90deg, #60a5fa, #4f46e5); transition: width 0.4s ease; border-radius: 4px;`;
    }

    // ── Resize de colunas ─────────────────────────────────────────────

    _initColResize(tableEl) {
        if (!tableEl || tableEl._resizeInited) return;
        tableEl._resizeInited = true;
        const STORE_KEY = "cyl_col_widths";
        const ths = Array.from(tableEl.querySelectorAll("thead th"));
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
            ths.forEach((th, i) => { if (saved[i]) th.style.width = saved[i] + "px"; });
        } catch (_) {}
        ths.slice(0, -1).forEach((th, i) => {
            const handle = document.createElement("div");
            handle.className = "o_repair_col_resizer";
            th.appendChild(handle);
            let startX, startW;
            handle.addEventListener("mousedown", (ev) => {
                ev.preventDefault();
                startX = ev.pageX; startW = th.offsetWidth;
                handle.classList.add("resizing");
                const onMove = (e) => { th.style.width = Math.max(40, startW + (e.pageX - startX)) + "px"; };
                const onUp   = () => {
                    handle.classList.remove("resizing");
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                    try {
                        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
                        saved[i] = th.offsetWidth;
                        localStorage.setItem(STORE_KEY, JSON.stringify(saved));
                    } catch (_) {}
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
            });
        });
    }

    // ── Formatação ────────────────────────────────────────────────────

    fmtDate(v) {
        if (!v) return "";
        const p = v.split("-");
        return p.length === 3 ? (p[2] + "/" + p[1] + "/" + p[0]) : v;
    }
    fmtDatetime(v) {
        if (!v) return "";
        try {
            const parts = v.split(" ");
            const dp = parts[0].split("-"); const tp = parts[1].split(":");
            return dp[2] + "/" + dp[1] + " " + tp[0] + ":" + tp[1];
        } catch (_) { return ""; }
    }
    osStateLabel(s) {
        return { draft:"Rascunho", confirmed:"Confirmada",
                 in_progress:"Em Andamento", done:"Concluída",
                 cancel:"Cancelada" }[s] || (s || "");
    }
    osStateBadge(s) {
        return { draft:"bg-secondary", confirmed:"text-bg-primary",
                 in_progress:"text-bg-warning", done:"bg-success",
                 cancel:"bg-danger" }[s] || "bg-secondary";
    }
    stateLabel(s) {
        return { ready:"Pronto", progress:"Em Andamento", paused:"Pausado",
                 done:"Concluído", cancel:"Cancelado" }[s] || (s || "");
    }
    stateBadge(s) {
        return { ready:"bg-secondary", progress:"text-bg-warning",
                 paused:"text-bg-info", done:"bg-success",
                 cancel:"bg-secondary" }[s] || "bg-secondary";
    }
    rowCls(s, isDragOver) {
        const base = { done:"o_repair_row_done", progress:"o_repair_row_progress",
                       paused:"o_repair_row_paused", cancel:"o_repair_row_cancel" }[s] || "";
        return "o_repair_proc_row " + base + (isDragOver ? " o_repair_drag_over" : "");
    }
}

RepairSchedule.template = "cylinder_repair_os.RepairSchedule";
registry.category("actions").add("cylinder_repair_os.schedule", RepairSchedule);
