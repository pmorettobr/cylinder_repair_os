/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
const { Component, useState, onWillStart, onMounted, onPatched } = owl;

class RepairSchedule extends Component {

    setup() {
        this.orm    = useService("orm");
        this.action = useService("action");
        this.notif  = useService("notification");

        this.state = useState({
            repairInfo:      {},
            processes:       [],
            loading:         true,
            loadingId:       null,
            editDateId:      null,
            editOperatorId:  null,
            operatorOptions: [],
            collapsed:       {},
            dragSrcId:       null,
            dragOverId:      null,
        });

        const ctx = this.props.action.context || {};
        this.repairId = ctx.active_repair_id || ctx.default_repair_id || ctx.repair_id || false;

        onWillStart(async () => { await this._loadData(); });

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
                     "duration_acc", "duration_display", "state",
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

    // ── Colapso de grupos ─────────────────────────────────────────────

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

    // ── Timer display ─────────────────────────────────────────────────

    /*
     * Calcula o display do timer para renderização.
     * - Em andamento (progress): acumulado + tempo desde date_start
     * - Pausado / outro: só o acumulado (duration_acc em minutos)
     * O timer.js continua atualizando os elementos .o_repair_timer_running
     * no DOM via setInterval — aqui só garantimos o valor inicial correto.
     */
    timerDisplay(rec) {
        if (rec.duration_display) return rec.duration_display;
        const acc = rec.duration_acc || 0;
        const totalSec = Math.round(acc * 60);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
    }

    // ── Redimensionamento de colunas ──────────────────────────────────

    _initColResize(tableEl) {
        if (!tableEl || tableEl._resizeInited) return;
        tableEl._resizeInited = true;

        const STORE_KEY = "cyl_col_widths";
        const ths = Array.from(tableEl.querySelectorAll("thead th"));

        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
            ths.forEach((th, i) => {
                if (saved[i]) th.style.width = saved[i] + "px";
            });
        } catch (_) {}

        ths.slice(0, -1).forEach((th, i) => {
            const handle = document.createElement("div");
            handle.className = "o_repair_col_resizer";
            th.appendChild(handle);

            let startX, startW;

            handle.addEventListener("mousedown", (ev) => {
                ev.preventDefault();
                startX = ev.pageX;
                startW = th.offsetWidth;
                handle.classList.add("resizing");

                const onMove = (e) => {
                    const newW = Math.max(40, startW + (e.pageX - startX));
                    th.style.width = newW + "px";
                };
                const onUp = () => {
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
            const dp = parts[0].split("-");
            const tp = parts[1].split(":");
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
