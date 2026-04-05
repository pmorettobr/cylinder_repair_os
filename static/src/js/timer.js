(function () {
    'use strict';

    var COLORS = [
        'rgba(219,234,254,0.5)',
        'rgba(220,252,231,0.5)',
        'rgba(254,249,195,0.5)',
        'rgba(237,233,254,0.5)',
        'rgba(255,237,213,0.5)',
        'rgba(204,251,241,0.5)',
        'rgba(252,231,243,0.5)',
        'rgba(241,245,249,0.5)',
    ];

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

    function getComponentName(row) {
        var cell = row.querySelector('[name="component_name"]');
        if (!cell) return '(Sem Componente)';
        return cell.textContent.trim() || '(Sem Componente)';
    }

    function makeGroupHeader(name, count, colspan) {
        var tr = document.createElement('tr');
        tr.className = 'o_repair_group_header';
        tr.dataset.collapsed = '0';
        tr.style.cssText = 'background:#e8edf2;border-top:2px solid #cbd5e1;cursor:pointer;user-select:none;';
        var td = document.createElement('td');
        td.colSpan = colspan || 20;
        td.style.cssText = 'padding:5px 12px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#334155;';
        td.innerHTML =
            '<span class="o_repair_arrow" style="display:inline-block;margin-right:8px;transition:transform .15s;">▼</span>' +
            '<span>' + name + '</span>' +
            '<span style="margin-left:10px;background:#475569;color:#fff;border-radius:10px;padding:1px 9px;font-size:11px;font-weight:600;">' + count + '</span>';
        tr.appendChild(td);
        tr.addEventListener('click', function(e) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            var collapsed = tr.dataset.collapsed === '1';
            tr.dataset.collapsed = collapsed ? '0' : '1';
            var arrow = tr.querySelector('.o_repair_arrow');
            if (arrow) arrow.style.transform = collapsed ? '' : 'rotate(-90deg)';
            var next = tr.nextElementSibling;
            while (next && !next.classList.contains('o_repair_group_header')) {
                next.style.display = collapsed ? '' : 'none';
                next = next.nextElementSibling;
            }
            updateTheadVisibility();
        });
        return tr;
    }

    function updateTheadVisibility() {
        var wrapper = document.querySelector('.o_form_view [name="process_ids"] .o_list_renderer');
        if (!wrapper) return;
        var thead = wrapper.querySelector('thead');
        if (!thead) return;
        var headers = wrapper.querySelectorAll('.o_repair_group_header');
        if (!headers.length) return;
        thead.style.display = Array.from(headers).every(function(h) { return h.dataset.collapsed === '1'; }) ? 'none' : '';
    }

    var _lastHash = '';
    var _lastUrl = '';

    function applyGrouping() {
        var wrapper = document.querySelector('.o_form_view [name="process_ids"] .o_list_renderer');
        if (!wrapper) return;
        var tbody = wrapper.querySelector('tbody');
        if (!tbody) return;
        var rows = Array.from(tbody.querySelectorAll('tr.o_data_row'));
        if (!rows.length) return;

        var currentUrl = window.location.href;
        if (currentUrl !== _lastUrl) { _lastHash = ''; _lastUrl = currentUrl; }

        var hash = rows.map(function(r) { return (r.dataset.id||'') + ':' + getComponentName(r); }).join('|');
        if (hash === _lastHash) return;
        _lastHash = hash;

        Array.from(tbody.querySelectorAll('.o_repair_group_header')).forEach(function(h) { h.remove(); });

        var groups = [], cur = null;
        rows.forEach(function(row) {
            var comp = getComponentName(row);
            if (!cur || cur.name !== comp) { cur = {name: comp, rows: []}; groups.push(cur); }
            cur.rows.push(row);
        });

        var consolidated = [], seen = {};
        groups.forEach(function(g) {
            if (seen[g.name]) { seen[g.name].rows = seen[g.name].rows.concat(g.rows); }
            else { seen[g.name] = {name: g.name, rows: g.rows.slice()}; consolidated.push(seen[g.name]); }
        });

        consolidated.forEach(function(group, idx) {
            var color = COLORS[idx % COLORS.length];
            var colspan = group.rows[0].querySelectorAll('td').length || 20;
            tbody.appendChild(makeGroupHeader(group.name, group.rows.length, colspan));
            group.rows.forEach(function(row) { row.style.backgroundColor = color; tbody.appendChild(row); });
        });

        updateTheadVisibility();
    }

    function applyPageClass() {
        var has = !!document.querySelector('.o_form_view [name="process_ids"]');
        var el = document.querySelector('.o_action');
        if (el) el.classList.toggle('o_repair_process_page', has);
    }

    var _debounce = null;
    var obs = new MutationObserver(function(mutations) {
        var onlyOurs = mutations.every(function(m) {
            return Array.from(m.addedNodes).concat(Array.from(m.removedNodes))
                .every(function(n) { return n.nodeType !== 1 || n.classList.contains('o_repair_group_header'); });
        });
        if (onlyOurs) return;
        tick();
        applyPageClass();
        clearTimeout(_debounce);
        _debounce = setTimeout(applyGrouping, 250);
    });

    function init() {
        obs.observe(document.body, {childList: true, subtree: true});
        tick();
        setTimeout(applyGrouping, 600);
        setTimeout(applyPageClass, 300);
    }

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init)
        : init();
})();
