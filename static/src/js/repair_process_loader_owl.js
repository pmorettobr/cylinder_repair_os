/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
const { Component, useState, onWillStart } = owl;

class RepairProcessLoaderModal extends Component {

    setup() {
        this.orm    = useService("orm");
        this.notif  = useService("notification");

        this.state = useState({
            loading:      true,
            search:       "",
            collapsed:    {},   // component_id → bool
            selectedIds:  [],   // template ids selected
            groups:       [],   // [{id, name, templates:[]}]
        });

        this.repairId = this.props.repairId;

        onWillStart(async () => { await this._loadCatalog(); });
    }

    // ── Dados ─────────────────────────────────────────────────────────

    async _loadCatalog() {
        try {
            const templates = await this.orm.call(
                "repair.order",
                "action_get_catalog_for_owl",
                [[this.repairId]]
            );

            // Agrupa por componente
            const map = new Map();
            for (const t of (templates || [])) {
                const cid  = t.component_type_id ? t.component_type_id[0] : 0;
                const cname = t.component_type_id ? t.component_type_id[1] : "(Sem Componente)";
                if (!map.has(cid)) map.set(cid, { id: cid, name: cname, templates: [] });
                map.get(cid).templates.push(t);
            }
            this.state.groups   = [...map.values()];
            this.state.loading  = false;
        } catch (e) {
            this.notif.add("Erro ao carregar catálogo", { type: "danger" });
            this.state.loading = false;
        }
    }

    // ── Filtro de busca ───────────────────────────────────────────────

    get filteredGroups() {
        const q = this.state.search.toLowerCase().trim();
        if (!q) return this.state.groups;
        return this.state.groups.map(g => ({
            ...g,
            templates: g.templates.filter(t =>
                t.name.toLowerCase().includes(q) ||
                g.name.toLowerCase().includes(q)
            ),
        })).filter(g => g.templates.length > 0);
    }

    // ── Seleção ───────────────────────────────────────────────────────

    isSelected(id) { return this.state.selectedIds.includes(id); }

    toggleSelect(id) {
        if (this.isSelected(id)) {
            this.state.selectedIds = this.state.selectedIds.filter(x => x !== id);
        } else {
            this.state.selectedIds = [...this.state.selectedIds, id];
        }
    }

    selectAll() {
        const ids = this.filteredGroups.flatMap(g => g.templates.map(t => t.id));
        const current = new Set(this.state.selectedIds);
        for (const id of ids) current.add(id);
        this.state.selectedIds = [...current];
    }

    deselectAll() {
        const ids = new Set(this.filteredGroups.flatMap(g => g.templates.map(t => t.id)));
        this.state.selectedIds = this.state.selectedIds.filter(id => !ids.has(id));
    }

    toggleGroup(gid) {
        this.state.collapsed[gid] = !this.state.collapsed[gid];
    }

    collapseAll() {
        for (const g of this.state.groups) {
            this.state.collapsed[g.id] = true;
        }
    }

    expandAll() {
        for (const g of this.state.groups) {
            this.state.collapsed[g.id] = false;
        }
    }

    get selectedCount() { return this.state.selectedIds.length; }

    // ── Confirmar ─────────────────────────────────────────────────────

    async onConfirm() {
        if (!this.state.selectedIds.length) {
            this.notif.add("Selecione pelo menos um processo.", { type: "warning" });
            return;
        }
        try {
            await this.orm.call(
                "repair.order",
                "action_load_from_catalog",
                [[this.repairId], this.state.selectedIds]
            );
            this.props.onClose(true); // true = reload
        } catch (e) {
            this.notif.add(
                (e.data && e.data.message) || "Erro ao carregar processos",
                { type: "danger" }
            );
        }
    }

    onCancel() { this.props.onClose(false); }

    // ── Formatação ────────────────────────────────────────────────────

    fmtTime(minutes) {
        if (!minutes) return "—";
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    }
}

RepairProcessLoaderModal.template = "cylinder_repair_os.RepairProcessLoaderModal";
RepairProcessLoaderModal.props = {
    repairId: Number,
    onClose:  Function,
};

export { RepairProcessLoaderModal };
