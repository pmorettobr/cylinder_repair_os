/**
 * cylinder_repair_os — Timer em tempo real (HH:MM:SS) + Barra de progresso dinâmica
 */
(function () {
    'use strict';

    let _timerInterval = null;

    function parseServerDatetime(dtStr) {
        if (!dtStr) return null;
        const clean = dtStr.replace(' ', 'T') + 'Z';
        const d = new Date(clean);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatHMS(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return String(h).padStart(2, '0') + ':' +
               String(m).padStart(2, '0') + ':' +
               String(sec).padStart(2, '0');
    }

    function updateTimers() {
        // ── Cronômetro HH:MM:SS ──────────────────────────────────
        const timers = document.querySelectorAll('.o_repair_timer_running');
        const now = new Date();
        timers.forEach(function (el) {
            const startStr = el.dataset.start;
            const accMin = parseFloat(el.dataset.acc || '0');
            if (!startStr) {
                el.textContent = formatHMS(accMin * 60);
                return;
            }
            const startDate = parseServerDatetime(startStr);
            if (!startDate) return;
            const totalSec = accMin * 60 + (now - startDate) / 1000;
            el.textContent = formatHMS(totalSec);
        });

        // ── Barra de progresso dinâmica ──────────────────────────
        // Lê o campo hidden .o_repair_progress_value e aplica ao fill
        document.querySelectorAll('.o_repair_progress_fill_dynamic').forEach(function (bar) {
            const form = bar.closest('.o_form_view');
            if (!form) return;
            // O campo progress_percent fica num input hidden com class o_repair_progress_value
            const input = form.querySelector('.o_repair_progress_value input, .o_repair_progress_value .o_field_widget');
            let pct = 0;
            if (input) {
                pct = parseFloat(input.value || input.textContent || '0') || 0;
            }
            bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
        });
    }

    function startTimerLoop() {
        if (_timerInterval) clearInterval(_timerInterval);
        _timerInterval = setInterval(updateTimers, 1000);
        updateTimers();
    }

    function stopTimerLoop() {
        if (_timerInterval) {
            clearInterval(_timerInterval);
            _timerInterval = null;
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        startTimerLoop();
    });

    // Re-inicia quando Odoo navega entre views (SPA)
    const observer = new MutationObserver(function () {
        const hasTimers = document.querySelector('.o_repair_timer_running');
        const hasBars = document.querySelector('.o_repair_progress_fill_dynamic');
        if ((hasTimers || hasBars) && !_timerInterval) {
            startTimerLoop();
        } else if (!hasTimers && !hasBars && _timerInterval) {
            stopTimerLoop();
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    window._repairTimer = { start: startTimerLoop, stop: stopTimerLoop };
})();
