/**
 * cylinder_repair_os — timer.js
 * 1. Cronômetro em tempo real (1s)
 * 2. Agrupamento visual por componente na grid de processos (One2many)
 */
(function () {
    'use strict';

    // ── Paleta de cores suaves por componente ────────────────────────────
    var COLORS = [
        'rgba(219,234,254,0.5)',   // azul
        'rgba(220,252,231,0.5)',   // verde
        'rgba(254,249,195,0.5)',   // amarelo
        'rgba(237,233,254,0.5)',   // roxo
        'rgba(255,237,213,0.5)',   // laranja
        'rgba(204,251,241,0.5)',   // teal
        'rgba(252,231,243,0.5)',   // rosa
        'rgba(241,245,249,0.5)',   // cinza
    ];

    // ── Cronômetro 1 segundo ─────────────────────────────────────────────
    function hms(s) {
        s = Math.max(0, Math.floor(s));
        return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
            .map(function(n){ return String(n).padStart(2,'0'); }).join(':');
    }

    function tick() {
        try {
            var now = Date.now() / 1000;
            document.querySelectorAll('.o_repair_timer.o_repair_timer_running').forEach(function(el) {
                var s = el.dataset.start;
                var acc = parseFloat(el.dataset.acc) || 0;
                if (!s) return;
                var t = new Date(s.replace(' ','T')+'Z').getTime() / 1000;
                if (!isNaN(t)) el.textContent = hms(now - t + acc);
            });
        } catch(e) {}
    }
    setInterval(tick, 1000);

    // ── Agrupamento visual por componente ────────────────────────────────

    // Detecta se estamos na tela de programação (form wrapper)
    function isProcessWrapper() {
        return !!document.querySelector('.o_form_view [name="process_ids"] .o_list_renderer');
    }

    // Extrai o nome do componente de uma linha da grid
    function getComponentName(row) {
        // Busca o campo component_type_id (invisible) na linha
        var cell = row.querySelector('[name="component_type_id"]');
        if (cell) return cell.textContent.trim();
        return null;
    }

    // Cria linha de cabeçalho de grupo
    function makeGroupHeader(name, count, colorIdx, colspan) {
        var tr = document.createElement('tr');
        tr.className = 'o_repair_group_header';
        tr.dataset.groupName = name;
        tr.dataset.collapsed = '0';
        tr.style.cssText = 'background:#f1f5f9;border-top:2px solid #e2e8f0;cursor:pointer;';

        var td = document.createElement('td');
        td.colSpan = colspan || 20;
        td.style.cssText = 'padding:6px 12px;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#475569;';
        td.innerHTML = '<span class="o_repair_toggle" style="margin-right:8px;display:inline-block;transition:transform .2s;">▼</span>' +
            '<span style="color:#1e293b;">' + name + '</span>' +
            '<span style="margin-left:8px;background:#64748b;color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;">' + count + '</span>';

        tr.appendChild(td);

        // Toggle collapse ao clicar
        tr.addEventListener('click', function() {
            var collapsed = tr.dataset.collapsed === '1';
            tr.dataset.collapsed = collapsed ? '0' : '1';
            var arrow = tr.querySelector('.o_repair_toggle');
            if (arrow) arrow.style.transform = collapsed ? '' : 'rotate(-90deg)';

            // Mostra/esconde linhas do grupo
            var next = tr.nextElementSibling;
            while (next && !next.classList.contains('o_repair_group_header')) {
                next.style.display = collapsed ? '' : 'none';
                next = next.nextElementSibling;
            }
        });

        return tr;
    }

    var _lastGroupHash = '';

    function applyGrouping() {
        if (!isProcessWrapper()) return;

        var tbody = document.querySelector('.o_form_view [name="process_ids"] .o_list_renderer tbody');
        if (!tbody) return;

        var rows = Array.from(tbody.querySelectorAll('tr.o_data_row'));
        if (!rows.length) return;

        // Calcula hash dos componentes para evitar reprocessar sem mudança
        var hash = rows.map(function(r) {
            return getComponentName(r) || '';
        }).join('|');

        if (hash === _lastGroupHash) return;
        _lastGroupHash = hash;

        // Remove cabeçalhos anteriores
        Array.from(tbody.querySelectorAll('.o_repair_group_header')).forEach(function(h) {
            h.remove();
        });

        // Agrupa linhas por componente
        var groups = [];
        var currentGroup = null;

        rows.forEach(function(row) {
            var comp = getComponentName(row) || '(Sem Componente)';
            if (!currentGroup || currentGroup.name !== comp) {
                currentGroup = { name: comp, rows: [] };
                groups.push(currentGroup);
            }
            currentGroup.rows.push(row);
        });

        // Injeta cabeçalhos e aplica cores
        groups.forEach(function(group, idx) {
            var color = COLORS[idx % COLORS.length];
            var firstRow = group.rows[0];
            var colspan = firstRow.querySelectorAll('td').length;

            // Insere cabeçalho antes da primeira linha do grupo
            var header = makeGroupHeader(group.name, group.rows.length, idx, colspan);
            tbody.insertBefore(header, firstRow);

            // Aplica cor de fundo nas linhas do grupo
            group.rows.forEach(function(row) {
                row.style.backgroundColor = color;
            });
        });
    }

    // ── Observer ─────────────────────────────────────────────────────────
    var obs = new MutationObserver(function() {
        tick();
        applyGrouping();
    });

    function init() {
        obs.observe(document.body, { childList: true, subtree: true });
        tick();
        applyGrouping();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
