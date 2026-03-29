/**
 * cylinder_repair_os — timer.js
 *
 * 1. Cronômetro em tempo real (atualiza a cada 1 segundo)
 * 2. Cores alternadas por componente no grid agrupado
 * 3. Tooltips dinâmicos para desvio
 * 4. Remove checkboxes da lista agrupada
 * 5. Garante que grupos abrem expandidos
 */
(function () {
    'use strict';

    // ── Paleta de cores suaves por componente (alternando) ──────────────
    const COMPONENT_COLORS = [
        'rgba(219, 234, 254, 0.5)',  // azul suave
        'rgba(220, 252, 231, 0.5)',  // verde suave
        'rgba(254, 249, 195, 0.5)',  // amarelo suave
        'rgba(237, 233, 254, 0.5)',  // roxo suave
        'rgba(255, 237, 213, 0.5)',  // laranja suave
        'rgba(204, 251, 241, 0.5)',  // teal suave
        'rgba(252, 231, 243, 0.5)',  // rosa suave
        'rgba(241, 245, 249, 0.5)',  // cinza suave
    ];

    // ── Cronômetro em tempo real ─────────────────────────────────────────

    function parseAccSecs(val) {
        const n = parseFloat(val);
        return isNaN(n) ? 0 : n;
    }

    function secsToHMS(total) {
        total = Math.max(0, Math.floor(total));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return (
            String(h).padStart(2, '0') + ':' +
            String(m).padStart(2, '0') + ':' +
            String(s).padStart(2, '0')
        );
    }

    function updateTimers() {
        const now = Date.now() / 1000;
        document.querySelectorAll('.o_repair_timer.o_repair_timer_running').forEach(function (el) {
            const startStr = el.dataset.start || '';
            const acc = parseAccSecs(el.dataset.acc);
            if (!startStr) return;
            // Odoo stores datetime as "YYYY-MM-DD HH:MM:SS" UTC
            const start = new Date(startStr.replace(' ', 'T') + 'Z').getTime() / 1000;
            if (isNaN(start)) return;
            const elapsed = now - start + acc;
            el.textContent = secsToHMS(elapsed);
        });
    }

    // Inicia o intervalo do cronômetro (1 segundo)
    setInterval(updateTimers, 1000);

    // ── Aplicar cores por componente + remover checkboxes ───────────────

    function applyGroupedStyles() {
        // Verifica se estamos numa tela de processos agrupados
        const groupRows = document.querySelectorAll(
            '.o_list_renderer .o_group_header'
        );
        if (!groupRows.length) return;

        // Mapear grupos → cor
        const colorMap = new Map();
        let colorIdx = 0;

        groupRows.forEach(function (groupRow) {
            const key = groupRow.dataset.groupId || colorIdx;
            if (!colorMap.has(key)) {
                colorMap.set(key, COMPONENT_COLORS[colorIdx % COMPONENT_COLORS.length]);
                colorIdx++;
            }
        });

        // Aplicar cor nas linhas de cada grupo
        let currentColor = null;
        let currentGroup = null;
        document.querySelectorAll('.o_list_renderer tr').forEach(function (row) {
            if (row.classList.contains('o_group_header')) {
                // Nova linha de grupo — próxima cor
                currentGroup = row;
                colorIdx = Array.from(groupRows).indexOf(row);
                currentColor = COMPONENT_COLORS[colorIdx % COMPONENT_COLORS.length];
                row.style.backgroundColor = 'rgba(0,0,0,0.04)';
            } else if (row.classList.contains('o_data_row') && currentColor) {
                row.style.backgroundColor = currentColor;
            }
        });

        // Remover checkboxes (coluna de seleção)
        document.querySelectorAll(
            '.o_list_renderer .o_list_record_selector, ' +
            '.o_list_renderer th.o_list_record_selector'
        ).forEach(function (el) {
            el.style.display = 'none';
        });

        // Aplicar tooltips de desvio
        document.querySelectorAll('.o_repair_deviation_alert').forEach(function (btn) {
            const row = btn.closest('tr');
            if (!row) return;
            // Procura o campo deviation_tooltip na linha (campo invisible)
            const tooltipCell = row.querySelector('[name="deviation_tooltip"]');
            if (tooltipCell) {
                const text = (tooltipCell.textContent || '').trim();
                if (text) btn.title = text;
            }
        });

        // Expandir todos os grupos se ainda não foram expandidos
        document.querySelectorAll(
            '.o_group_header .o_group_name'
        ).forEach(function (nameEl) {
            const header = nameEl.closest('tr');
            if (!header) return;
            // Verifica se o grupo está colapsado (ícone de seta)
            const toggle = header.querySelector('.o_group_header_cell');
            if (toggle && header.dataset.groupFolded === '1') {
                toggle.click();
            }
        });
    }

    // Roda sempre que o DOM muda
    const observer = new MutationObserver(function () {
        applyGroupedStyles();
    });

    document.addEventListener('DOMContentLoaded', function () {
        observer.observe(document.body, { childList: true, subtree: true });
        applyGroupedStyles();
        updateTimers();
    });

    // Fallback se DOMContentLoaded já disparou
    if (document.readyState !== 'loading') {
        observer.observe(document.body, { childList: true, subtree: true });
        applyGroupedStyles();
        updateTimers();
    }

})();
