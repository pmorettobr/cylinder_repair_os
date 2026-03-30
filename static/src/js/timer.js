/**
 * cylinder_repair_os — timer.js
 * Cronômetro real-time + UI da tela de processos agrupados
 */
(function () {
    'use strict';

    var COLORS = [
        'rgba(219,234,254,0.45)', 'rgba(220,252,231,0.45)',
        'rgba(254,249,195,0.45)', 'rgba(237,233,254,0.45)',
        'rgba(255,237,213,0.45)', 'rgba(204,251,241,0.45)',
        'rgba(252,231,243,0.45)', 'rgba(241,245,249,0.45)',
    ];

    // ── Cronômetro 1 segundo ─────────────────────────────────────────────
    function hms(s) {
        s = Math.max(0, Math.floor(s));
        return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
            .map(function(n){ return String(n).padStart(2,'0'); }).join(':');
    }

    function tick() {
        var now = Date.now() / 1000;
        document.querySelectorAll('.o_repair_timer.o_repair_timer_running').forEach(function(el) {
            var s = el.dataset.start;
            var acc = parseFloat(el.dataset.acc) || 0;
            if (!s) return;
            var t = new Date(s.replace(' ','T')+'Z').getTime()/1000;
            if (!isNaN(t)) el.textContent = hms(now - t + acc);
        });
    }
    setInterval(tick, 1000);

    // ── Detecta a tela de processos agrupados ────────────────────────────
    function isGroupedView() {
        return !!document.querySelector('.o_repair_grouped_proc_tree');
    }

    // ── Extrai repair_id do breadcrumb ───────────────────────────────────
    function getRepairId() {
        var items = document.querySelectorAll('.o_breadcrumb .o_breadcrumb_item, .o_breadcrumb span');
        for (var i = 0; i < items.length; i++) {
            var m = items[i].textContent.match(/Programação\s*[—–-]\s*(\d+)/);
            if (m) return parseInt(m[1]);
        }
        // tenta pelo título da página
        var title = document.title || '';
        var m2 = title.match(/(\d+)/);
        return m2 ? parseInt(m2[1]) : null;
    }

    // ── Botão "Adicionar Processos" ──────────────────────────────────────
    function injectBtn() {
        if (!isGroupedView()) return;
        if (document.querySelector('.o_repair_add_btn')) return;

        // Encontra onde injetar — botões do control panel esquerdo
        var target =
            document.querySelector('.o_control_panel_breadcrumbs_actions') ||
            document.querySelector('.o_control_panel .o_cp_top_left') ||
            document.querySelector('.o_control_panel_main_buttons');

        if (!target) return;

        var btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm o_repair_add_btn';
        btn.innerHTML = '<i class="fa fa-cog"></i> Adicionar Processos';
        btn.style.cssText = 'margin-left:8px;font-weight:600;';

        btn.addEventListener('click', function() {
            var repairId = getRepairId();
            fetch('/web/dataset/call_kw', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1, method: 'call',
                    params: {
                        model: 'repair.os.process',
                        method: 'action_open_loader_from_list',
                        args: [[]],
                        kwargs: {
                            context: {
                                active_repair_id: repairId,
                                repair_id: repairId,
                                default_repair_id: repairId,
                            }
                        }
                    }
                })
            })
            .then(function(r){ return r.json(); })
            .then(function(data) {
                var action = data && data.result;
                if (!action || !action.type) return;
                // Dispara a action pelo mecanismo do Odoo
                var ev = new CustomEvent('do_action', { bubbles: true, detail: { action: action }});
                btn.dispatchEvent(ev);
                // Fallback: tenta via owl env
                try {
                    var env = document.querySelector('.o_web_client').__owl__.component.env;
                    env.services.action.doAction(action);
                } catch(e) {
                    // último fallback: clicar no item do menu Ação
                    var menuItems = document.querySelectorAll('.o_menu_item, .dropdown-item');
                    menuItems.forEach(function(item) {
                        if (item.textContent.indexOf('Adicionar') !== -1) item.click();
                    });
                }
            });
        });

        target.appendChild(btn);
    }

    // ── Estilos por componente + sem checkbox ────────────────────────────
    function applyStyles() {
        if (!isGroupedView()) return;
        var colorMap = {}, idx = 0, curColor = null;

        document.querySelectorAll('.o_repair_grouped_proc_tree tr').forEach(function(row) {
            if (row.classList.contains('o_group_header')) {
                var key = (row.querySelector('.o_group_name') || row).textContent.trim().slice(0,30);
                if (!colorMap[key]) colorMap[key] = COLORS[idx++ % COLORS.length];
                curColor = colorMap[key];
            } else if (row.classList.contains('o_data_row') && curColor) {
                row.style.backgroundColor = curColor;
            }
        });

        // Oculta checkboxes SOMENTE na nossa tree
        document.querySelectorAll(
            '.o_repair_grouped_proc_tree .o_list_record_selector,' +
            '.o_repair_grouped_proc_tree thead .o_list_record_selector'
        ).forEach(function(el) {
            el.style.cssText = 'display:none!important;width:0!important;padding:0!important;';
        });

        // Tooltips de desvio
        document.querySelectorAll('.o_repair_grouped_proc_tree .o_repair_deviation_alert').forEach(function(el) {
            var row = el.closest('tr');
            if (!row) return;
            var cell = row.querySelector('[name="deviation_tooltip"]');
            if (cell && cell.textContent.trim()) el.title = cell.textContent.trim();
        });
    }

    // ── Observer ─────────────────────────────────────────────────────────
    var obs = new MutationObserver(function() {
        tick();
        applyStyles();
        injectBtn();
    });

    function init() {
        obs.observe(document.body, {childList:true, subtree:true});
        tick();
        applyStyles();
        injectBtn();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
