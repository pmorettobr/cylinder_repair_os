/**
 * cylinder_repair_os — Timer em tempo real (HH:MM:SS)
 *
 * Atualiza todos os elementos com classe .o_repair_timer_running a cada segundo.
 * Lê data-start (ISO datetime do servidor) e data-acc (minutos acumulados).
 */

(function () {
    'use strict';

    // Intervalo global — evita múltiplos setInterval empilhados
    let _timerInterval = null;

    function parseServerDatetime(dtStr) {
        if (!dtStr) return null;
        // Formato do Odoo: "2024-01-15 10:30:00" (UTC)
        const clean = dtStr.replace(' ', 'T') + 'Z';
        const d = new Date(clean);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatHMS(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return (
            String(h).padStart(2, '0') + ':' +
            String(m).padStart(2, '0') + ':' +
            String(sec).padStart(2, '0')
        );
    }

    function updateTimers() {
        const els = document.querySelectorAll('.o_repair_timer_running');
        if (!els.length) return;

        const now = new Date();

        els.forEach(function (el) {
            const startStr = el.dataset.start;
            const accMin = parseFloat(el.dataset.acc || '0');

            if (!startStr) {
                // Só acumulado (pausado)
                el.textContent = formatHMS(accMin * 60);
                return;
            }

            const startDate = parseServerDatetime(startStr);
            if (!startDate) return;

            const elapsedSec = (now - startDate) / 1000;
            const totalSec = accMin * 60 + elapsedSec;
            el.textContent = formatHMS(totalSec);
        });
    }

    function startTimerLoop() {
        if (_timerInterval) clearInterval(_timerInterval);
        _timerInterval = setInterval(updateTimers, 1000);
        updateTimers(); // Atualiza imediatamente ao iniciar
    }

    function stopTimerLoop() {
        if (_timerInterval) {
            clearInterval(_timerInterval);
            _timerInterval = null;
        }
    }

    // Inicia quando o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', function () {
        startTimerLoop();
    });

    // Re-inicia quando o Odoo navega entre views (SPA)
    // O Odoo 16 usa eventos no owl bus — escuta mudanças no DOM
    const observer = new MutationObserver(function (mutations) {
        const hasTimers = document.querySelector('.o_repair_timer_running');
        if (hasTimers && !_timerInterval) {
            startTimerLoop();
        } else if (!hasTimers && _timerInterval) {
            stopTimerLoop();
        }
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
    });

    // Expõe para debug no console
    window._repairTimer = { start: startTimerLoop, stop: stopTimerLoop };

})();
