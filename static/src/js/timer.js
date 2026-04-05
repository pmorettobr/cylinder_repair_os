/**
 * cylinder_repair_os — timer.js
 */
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

    // ── Cronômetro ───────────────────────────────────────────────────────
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

    // ── RPC direto sem navegação ──────────────────────────────────────────
    function callMethod(model, method, recordId, callback) {
        fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: model,
                    method: method,
                    args: [[recordId]],
                    kwargs: {},
                }
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) {
                var msg = (data.error.data && data.error.data.message) || data.error.message || 'Erro';
                alert(msg);
            }
            if (callback) callback();
        })
        .catch(function(e) {
            console.error('[repair] RPC error:', e);
            if (callback) callback();
        });
    }

    // ── Obtém record ID de uma linha da grid ──────────────────────────────
    function getRecordId(row) {
        if (row.dataset.id) return parseInt(row.dataset.id);
        // Fallback: busca via atributo interno do Odoo
        var idEl = row.querySelector('[name="id"]');
        if (idEl) return parseInt(idEl.textContent);
        return null;
    }

    // ── Intercepta botões de ação na grid de processos ────────────────────
    var INTERCEPT_BUTTONS = ['action_start', 'action_pause', 'action_finish', 'action_cancel'];

    function interceptButtons(wrapper) {
        wrapper.querySelectorAll('button[name]').forEach(function(btn) {
            var name = btn.getAttribute('name');
            if (INTERCEPT_BUTTONS.indexOf(name) === -1) return;
            if (btn.dataset.intercepted) return;
            btn.dataset.intercepted = '1';

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var row = btn.closest('tr.o_data_row');
                if (!row) return;
                var recordId = getRecordId(row);
                if (!recordId) return;

                // Desabilita botão durante a chamada
                btn.disabled = true;

                callMethod('repair.os.process', name, recordId, function() {
                    btn.disabled = false;
                    // Força reload apenas da grid via hash reset
                    _lastHash = '';
                    // Dispara evento de change no Odoo para recarregar o One2many
                    // sem recarregar o form inteiro
                    var listRenderer = wrapper.querySelector('.o_list_renderer');
                    if (listRenderer) {
                        // Simula uma pequena mudança para forçar Odoo a recarregar a lista
                        var reloadEvent = new CustomEvent('o_reload', { bubbles: true });
                        listRenderer.dispatchEvent(reloadEvent);
                    }
                    // Aguarda e reaplica agrupamento
                    setTimeout(function() {
                        _lastHash = '';
                        applyGrouping();
                    }, 500);
                    setTimeout(function() {
                        _lastHash = '';
                        applyGrouping();
                    }, 1200);
                });
            }, true); // capture phase — antes do Odoo
        });
    }

    // ── Lê componente da linha ────────────────────────────────────────────
    function getComponentName(row) {
        var cell = row.querySelector('[name="component_name"]');
        if (!cell) return '(Sem Componente)';
        return cell.textContent.trim() || '(Sem Componente)';
    }

    // ── Cabeçalho de grupo ────────────────────────────────────────────────
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
        var allCollapsed = Array.from(headers).every(function(h) { return h.dataset.collapsed === '1'; });
        thead.style.display = allCollapsed ? 'none' : '';
    }

    // ── Agrupamento ───────────────────────────────────────────────────────
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
        if (currentUrl !== _lastUrl) {
            _lastHash = '';
            _lastUrl = currentUrl;
        }

        var hash = rows.map(function(r) {
            return (r.dataset.id || '') + ':' + getComponentName(r);
        }).join('|');
        if (hash === _lastHash) return;
        _lastHash = hash;

        Array.from(tbody.querySelectorAll('.o_repair_group_header')).forEach(function(h) { h.remove(); });

        var groups = [];
        var cur = null;
        rows.forEach(function(row) {
            var comp = getComponentName(row);
            if (!cur || cur.name !== comp) {
                cur = { name: comp, rows: [] };
                groups.push(cur);
            }
            cur.rows.push(row);
        });

        // Consolida grupos com mesmo nome
        var consolidated = [];
        var seen = {};
        groups.forEach(function(g) {
            if (seen[g.name]) {
                seen[g.name].rows = seen[g.name].rows.concat(g.rows);
            } else {
                seen[g.name] = { name: g.name, rows: g.rows.slice() };
                consolidated.push(seen[g.name]);
            }
        });

        consolidated.forEach(function(group, idx) {
            var color = COLORS[idx % COLORS.length];
            var colspan = group.rows[0].querySelectorAll('td').length || 20;
            var header = makeGroupHeader(group.name, group.rows.length, colspan);
            tbody.appendChild(header);
            group.rows.forEach(function(row) {
                row.style.backgroundColor = color;
                tbody.appendChild(row);
            });
        });

        updateTheadVisibility();

        // Intercepta botões após reagrupamento
        interceptButtons(wrapper);
    }

    // ── Classe CSS na página de processos ────────────────────────────────
    function applyPageClass() {
        var hasProcessIds = !!document.querySelector('.o_form_view [name="process_ids"]');
        var action = document.querySelector('.o_action');
        if (action) action.classList.toggle('o_repair_process_page', hasProcessIds);
    }

    // ── Observer ─────────────────────────────────────────────────────────
    var _debounce = null;

    var obs = new MutationObserver(function(mutations) {
        var onlyOurs = mutations.every(function(m) {
            return Array.from(m.addedNodes).concat(Array.from(m.removedNodes))
                .every(function(n) {
                    return n.nodeType !== 1 || n.classList.contains('o_repair_group_header');
                });
        });
        if (onlyOurs) return;
        tick();
        applyPageClass();
        clearTimeout(_debounce);
        _debounce = setTimeout(applyGrouping, 250);
    });

    function init() {
        obs.observe(document.body, { childList: true, subtree: true });
        tick();
        setTimeout(applyGrouping, 600);
        setTimeout(applyPageClass, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
