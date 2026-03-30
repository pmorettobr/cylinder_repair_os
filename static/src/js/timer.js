/**
 * cylinder_repair_os — timer.js
 * Cronômetro em tempo real para processos Em Andamento
 */
(function () {
    'use strict';

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
                var t = new Date(s.replace(' ','T')+'Z').getTime()/1000;
                if (!isNaN(t)) el.textContent = hms(now - t + acc);
            });
        } catch(e) {}
    }

    setInterval(tick, 1000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tick);
    } else {
        tick();
    }
})();
