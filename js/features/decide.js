/* ============================================================
   抉择助手 Decide —— 内嵌抛硬币 + 随机抽签，同页切换
   挂到 #decision-menu-modal 的整页壳里；不改动原有
   handleCoinToss / picker 那套独立 overlay 逻辑。
   ============================================================ */
(function () {
    'use strict';

    var LOG_KEY = 'decideLog';
    var log = [];
    var mode = 'coin';
    var bet = '正面';
    var flipping = false;

    function skey(k) {
        try { return (typeof getStorageKey === 'function') ? getStorageKey(k) : (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX + k : k); }
        catch (e) { return k; }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function notify(m, t) { try { if (typeof showNotification === 'function') showNotification(m, t || 'info', 1600); } catch (e) {} }

    function loadLog() {
        try { var v = JSON.parse(localStorage.getItem(skey(LOG_KEY)) || '[]'); log = Array.isArray(v) ? v : []; } catch (e) { log = []; }
    }
    function saveLog() {
        try { localStorage.setItem(skey(LOG_KEY), JSON.stringify(log.slice(0, 30))); } catch (e) {}
    }
    function pushLog(item) {
        log.unshift(item);
        if (log.length > 30) log.length = 30;
        saveLog();
    }

    function el(id) { return document.getElementById(id); }

    /* ---------------- 抛硬币 ---------------- */
    function tossCoin() {
        if (flipping) return;
        var q = (el('coin-question').value || '').trim();
        var face = Math.random() < 0.5 ? '正面' : '反面';
        var win = face === bet;
        flipping = true;

        var coin = el('coin-face');
        var hint = el('coin-hint');
        coin.style.transform = '';
        // 强制重排以重启动画
        void coin.offsetWidth;
        coin.classList.add('spinning');
        hint.textContent = '抛…';

        setTimeout(function () {
            coin.classList.remove('spinning');
            coin.classList.add(face === '正面' ? 'show-heads' : 'show-tails');
            coin.style.transform = '';
            flipping = false;
            var line = (q ? q + ' → ' : '') + face + (win ? ' · 你赢了' : ' · 输了');
            hint.innerHTML = '<b class="' + (win ? 'win' : 'lose') + '">' + esc(face) + '</b><span>' + (win ? ' 你赢了' : ' 输了') + '</span>';
            pushLog({ k: 'coin', face: face, bet: bet, q: q, win: win, t: Date.now() });
            renderLog();
            if (q) notify('「' + q + '」→ ' + face);
        }, 1100);
    }

    /* ---------------- 历史 ---------------- */
    function sc(a, b) {
        return '<div class="coin-sum"><div class="coin-sum-a">' + esc(a) + '</div><div class="coin-sum-b">' + esc(b) + '</div></div>';
    }
    function fmtT(ts) {
        var d = new Date(ts);
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function renderLog() {
        var box = el('coin-log');
        if (!box) return;
        // 顶部统计条：即使只有一两条记录，下半屏也不至于空一大片
        var head = '';
        if (log.length) {
            var coins = log.filter(function (r) { return r.k === 'coin'; });
            var wins = coins.filter(function (r) { return r.win; }).length;
            var rate = coins.length ? Math.round(wins / coins.length * 100) : 0;
            head = '<div class="coin-summary">' +
                sc(log.length, '次决定') + sc(coins.length, '次抛币') + sc(wins + ' / ' + coins.length, '胜负') + sc(rate + '%', '胜率') +
            '</div>';
        }
        if (!log.length) {
            box.innerHTML = head + '<div class="coin-log-empty">还没有记录，抛几次看看</div>';
            return;
        }
        box.innerHTML = head + log.slice(0, 8).map(function (r) {
            if (r.k === 'coin') {
                return '<div class="coin-log-row">' +
                    '<span class="coin-log-face ' + (r.face === '正面' ? 'heads' : 'tails') + '">' + r.face + '</span>' +
                    '<span class="coin-log-q">' + (r.q ? esc(r.q) : '（没写赌注）') + '</span>' +
                    '<span class="coin-log-r ' + (r.win ? 'win' : 'lose') + '">' + (r.win ? '赢' : '输') + '</span>' +
                    '<span class="coin-log-t">' + fmtT(r.t) + '</span>' +
                '</div>';
            }
            return '<div class="coin-log-row">' +
                '<span class="coin-log-face wheel"><i class="fas fa-magic"></i></span>' +
                '<span class="coin-log-q">抽到「' + esc(r.v) + '」</span>' +
                '<span class="coin-log-t">' + fmtT(r.t) + '</span>' +
            '</div>';
        }).join('');
    }

    /* ---------------- 切换 ---------------- */
    function setMode(m) {
        mode = m;
        Array.prototype.forEach.call(document.querySelectorAll('#decision-menu-modal [data-dtab]'), function (b) {
            b.classList.toggle('active', b.getAttribute('data-dtab') === m);
        });
        el('dec-pane-coin').classList.toggle('hidden', m !== 'coin');
        el('dec-pane-wheel').classList.toggle('hidden', m !== 'wheel');
        var go = el('dec-go');
        go.innerHTML = m === 'coin'
            ? '<i class="fas fa-coins"></i> 抛硬币'
            : '<i class="fas fa-magic"></i> 开始抽签';
        el('dec-sub').textContent = m === 'coin'
            ? '二元选择，让硬币替你决定'
            : (wheelOptionsLen() + ' 个选项，随机抽一个');
        if (m === 'wheel' && typeof initPicker === 'function') {
            try { initPicker(); } catch (e) {}
        }
    }
    function wheelOptionsLen() {
        try { return (typeof wheelOptions !== 'undefined' && wheelOptions.length) ? wheelOptions.length : 0; }
        catch (e) { return 0; }
    }

    /* ---------------- 发给 TA ---------------- */
    function sendToPartner() {
        if (mode === 'coin') {
            var latest = log.filter(function (r) { return r.k === 'coin'; })[0];
            if (!latest) { notify('先抛一次'); return; }
            sendMessage('🪙 硬币说「' + latest.face + '」' + (latest.q ? '（' + latest.q + '）' : '') + '，' + (latest.win ? '我赢了' : '我输了'), 'normal');
        } else {
            if (typeof wheelResultText !== 'undefined' && wheelResultText) {
                sendMessage('✨ 随机抽签结果：' + wheelResultText, 'normal');
                pushLog({ k: 'wheel', v: wheelResultText, t: Date.now() });
                renderLog();
                wheelResultText = '';
                var rb = el('wheel-result');
                if (rb) { rb.textContent = ''; rb.classList.remove('show'); }
            } else {
                notify('先抽一次'); return;
            }
        }
        notify('已发给 TA', 'success');
    }

    /* ---------------- 初始化 ---------------- */
    var bound = false;
    function init() {
        if (bound) return;
        var root = el('decision-menu-modal');
        if (!root) return;
        bound = true;

        // 保留旧 ID（其它脚本可能 getElementById），但不显示
        ['open-coin-toss', 'open-wheel', 'close-decision-menu'].forEach(function (id) {
            if (!el(id)) {
                var d = document.createElement('div');
                d.id = id; d.style.display = 'none';
                root.appendChild(d);
            }
        });

        el('dec-back').addEventListener('click', function () {
            try { hideModal(root); } catch (e) { root.style.display = 'none'; }
        });
        el('dec-clear').addEventListener('click', function () {
            if (!log.length) { notify('没有历史'); return; }
            log = []; saveLog(); renderLog(); notify('已清空');
        });
        el('dec-send').addEventListener('click', sendToPartner);
        el('dec-go').addEventListener('click', function () {
            if (mode === 'coin') tossCoin();
            else if (typeof doPick === 'function') {
                try { doPick(); } catch (e) {}
                // 抽完记一条
                setTimeout(function () {
                    try {
                        if (typeof wheelResultText !== 'undefined' && wheelResultText) {
                            pushLog({ k: 'wheel', v: wheelResultText, t: Date.now() });
                            renderLog();
                        }
                    } catch (e) {}
                }, 3600);
            }
        });

        el('coin-face').addEventListener('click', tossCoin);

        Array.prototype.forEach.call(root.querySelectorAll('[data-dtab]'), function (b) {
            b.addEventListener('click', function () { setMode(b.getAttribute('data-dtab')); });
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-bet]'), function (b) {
            b.addEventListener('click', function () {
                bet = b.getAttribute('data-bet');
                Array.prototype.forEach.call(root.querySelectorAll('[data-bet]'), function (x) {
                    x.classList.toggle('on', x.getAttribute('data-bet') === bet);
                });
            });
        });

        loadLog();
        renderLog();
        setMode('coin');
    }

    // 每次打开都刷新一下副标题与历史
    window.__decideRefresh = function () {
        loadLog(); renderLog();
        var s = el('dec-sub');
        if (s) s.textContent = mode === 'coin' ? '二元选择，让硬币替你决定' : (wheelOptionsLen() + ' 个选项，随机抽一个');
    };

    if (window.whenSessionReady) window.whenSessionReady(init);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
