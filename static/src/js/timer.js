/**
 * cylinder_repair_os — timer.js
 * Cronômetro real-time + estilos da tela de processos agrupados
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

    // ── Estilos por componente + sem checkbox ────────────────────────────
    function applyStyles() {
        if (!isGroupedView()) return;
        var colorMap = {}, idx = 0, curColor = null;

        document.querySelectorAll('.o_repair_grouped_proc_tree tr').forEach(function(row) {
            if (row.classList.contains('o_group_header')) {
                var key = (row.querySelector('.o_group_name') || row)
                    .textContent.trim().slice(0,30);
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
        document.querySelectorAll(
            '.o_repair_grouped_proc_tree .o_repair_deviation_alert'
        ).forEach(function(el) {
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
    });

    function init() {
        obs.observe(document.body, {childList:true, subtree:true});
        tick();
        applyStyles();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// Esconde botão "Novo" nativo quando na tela de programação
(function hideNewBtn() {
    function check() {
        var hasTree = !!document.querySelector('.o_repair_grouped_proc_tree');
        var action = document.querySelector('.o_action');
        if (action) {
            action.classList.toggle('o_repair_hide_new', hasTree);
        }
    }
    var obs2 = new MutationObserver(check);
    obs2.observe(document.body, {childList: true, subtree: true});
    check();
})();
