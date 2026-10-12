/* ============================================================
   全局：把 <input type=range> 换成数字步进器
   ------------------------------------------------------------
   为什么：手机上滑杆精度低、难点中、单手操作几乎没法用。
   做法：不改任何业务 JS —— 保留原 input（隐藏），
        在它前面插一个 .stp 步进器，读写同一个 input 的 value，
        同步派发 input / change 事件，原有监听器照常触发。
   范围与步长完全沿用原 input 的 min/max/step。
   ============================================================ */
(function () {
    'use strict';

    var UNIT = {
        'font-size-slider': 'px',
        'tts-speed': 'x',
        'conv-font-range': 'px'
    };

    function fmt(v, step) {
        var n = parseFloat(v);
        if (isNaN(n)) return String(v);
        // 小数步长保留对应位数（0.01 之类）
        var s = String(step || '1');
        var dot = s.indexOf('.');
        var dec = dot >= 0 ? s.length - dot - 1 : 0;
        return n.toFixed(dec);
    }

    // 毫秒类滑杆：显示成人看得懂的单位，步长也换算
    var MS_IDS = {
        'reply-delay-min-slider': 1000,
        'reply-delay-max-slider': 1000,
        'auto-send-slider': 60000,   // 分钟
        'tts-speed': 0
    };

    function normalize(inp) {
        // 返回 { div, mult }：div=显示单位，mult=换算系数
        var div = 1;
        var id = inp.id || '';
        if (MS_IDS[id]) div = MS_IDS[id];
        return div;
    }

    function pretty(v, div) {
        var n = parseFloat(v);
        if (isNaN(n)) return String(v);
        if (div === 1000) {
            if (n >= 60000) return (n / 60000).toFixed(n % 60000 === 0 ? 0 : 1) + '分';
            return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 's';
        }
        if (div === 60000) return n + '分';
        return n;
    }
    function labelOf(input) {
        // 优先取旁边已有的数值显示（很多滑杆右侧就有 xxx px）
        var wrap = input.parentNode;
        if (!wrap) return '';
        var sibs = wrap.querySelectorAll('span, .value, .val, output');
        for (var i = 0; i < sibs.length; i++) {
            var t = (sibs[i].textContent || '').trim();
            if (/^[-−]?\d+(\.\d+)?\s*[a-zA-Z%]*$/.test(t) && sibs[i] !== input) {
                return t.replace(/^[-−]?\d+(\.\d+)?/, '') || '';
            }
        }
        var id = input.id || '';
        var cls = input.className || '';
        if (/font-size|font-range/.test(id + cls)) return 'px';
        if (/avatar.*size|frame-size/.test(id)) return 'px';
        if (/radius/.test(id)) return 'px';
        if (/tts-speed/.test(id)) return 'x';
        return '';
    }

    function build(input) {
        var min = input.min !== '' ? parseFloat(input.min) : 0;
        var max = input.max !== '' ? parseFloat(input.max) : 100;
        var step = input.step !== '' ? parseFloat(input.step) : 1;
        var div = normalize(input);
        var unit = UNIT[input.id] || (div > 1 ? '' : labelOf(input));

        var box = document.createElement('span');
        box.className = 'stp';
        box.innerHTML =
            '<button type="button" data-d="-1"><i class="fas fa-minus"></i></button>' +
            '<b>' + pretty(input.value, div) + (unit || '') + '</b>' +
            '<button type="button" data-d="1"><i class="fas fa-plus"></i></button>';

        function apply(nv) {
            nv = Math.min(max, Math.max(min, nv));
            input.value = fmt(nv, step);
            box.querySelector('b').textContent = pretty(nv, div) + (unit || '');
            try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
            try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        }

        box.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-d]');
            if (!btn) return;
            e.preventDefault();
            // ms/分 这类按显示单位走（回复延迟 ±1s、自动发送 ±1分），其余按 step
            var d = div === 1000 ? 1000 : (div === 60000 ? 60000 : step);
            apply((parseFloat(input.value) || 0) + (+btn.getAttribute('data-d')) * d);
        });

        // 滚轮微调
        box.addEventListener('wheel', function (e) {
            if (Math.abs(e.deltaY) < 1) return;
            e.preventDefault();
            var d = div === 1000 ? 1000 : (div === 60000 ? 60000 : step);
            apply((parseFloat(input.value) || 0) + (e.deltaY > 0 ? -d : d));
        }, { passive: false });

        input.classList.add('stp-hidden');
        if (input.parentNode) input.parentNode.insertBefore(box, input);

        // 隐藏紧邻的旧数值显示（步进器已经带了），但保留元素让业务 JS 继续更新它
        try {
            var nxt = input.nextElementSibling;
            if (nxt && /^SPAN$/i.test(nxt.tagName)) {
                var t = (nxt.textContent || '').trim();
                if (/^[-−]?\d+(\.\d+)?\s*[a-zA-Z%分秒]*$/.test(t) || t === '') {
                    nxt.classList.add('stp-dup');
                }
            }
        } catch (e) {}

        return box;
    }

    function scan() {
        document.querySelectorAll('input[type=range]').forEach(function (i) {
            if (i.dataset.stpDone === '1') return;
            i.dataset.stpDone = '1';
            try { build(i); } catch (e) { /* 单个失败不影响其它 */ }
        });
    }

    // 动态插入的（编辑弹窗、分组管理等）由 MutationObserver 兜住
    function observe() {
        var mo = new MutationObserver(function () { scan(); });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { scan(); observe(); });
    } else {
        scan(); observe();
    }

    // 供其它模块在插入动态 DOM 后主动调一次
    window.__refreshSteppers = scan;
})();
