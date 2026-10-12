/* ============================================================
   头像库  avatar-vault.js
   · 分别存「我的头像库」和「TA 的头像库」
   · TA 会在设置的小时区间内随机换自己的头像
   · TA 也可能换我的头像（可设置先询问我 / 直接换）
   ============================================================ */
(function () {
    'use strict';

    var VK = 'avatarVault';      // { me:[{id,src,ts}], ta:[{id,src,ts}] }
    var CK = 'avatarVaultCfg';   // 设置
    var NK = 'avatarVaultNext';  // 下次换头像时间
    var HK = 'avatarVaultLog';   // 记录
    var vault = { me: [], ta: [] };
    var cfgc = null, nextAt = 0, logs = [];
    var _stepBound = false, _clickBound = false;
    var modal = null, bodyEl = null, side = 'ta', timer = null, input = null;
    var built = false;

    var AMP = '&';
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, AMP + 'amp;').replace(/</g, AMP + 'lt;')
            .replace(/>/g, AMP + 'gt;').replace(/"/g, AMP + 'quot;')
            .replace(/'/g, '&#39;');
    }
    function notify(m, t) { try { if (typeof showNotification === 'function') showNotification(m, t || 'info', 1800); } catch (e) {} }
    function skey(k) {
        try { return (typeof getStorageKey === 'function') ? getStorageKey(k) : (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX + k : k); } catch (e) { return k; }
    }
    function rnd(a, b) { a = +a || 0; b = +b || 0; if (a > b) { var t = a; a = b; b = t; } return a + Math.floor(Math.random() * (b - a + 1)); }

    // 内联 SVG 种子头像（避免占外部图床，也避免空库）
    function seedAvatar(bg1, bg2, ch) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/>' +
            '</linearGradient></defs>' +
            '<rect width="200" height="200" fill="url(#g)"/>' +
            '<circle cx="100" cy="78" r="34" fill="rgba(255,255,255,.9)"/>' +
            '<path d="M40 176c0-33 27-56 60-56s60 23 60 56z" fill="rgba(255,255,255,.9)"/>' +
            '<text x="100" y="118" font-size="40" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="' + bg2 + '">' + ch + '</text>' +
            '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    function seedVault() {
        var now = Date.now();
        var taSpec = [['#f7b2b9', '#c98bb0', '梦'], ['#a8d5f2', '#7aa8d8', '角'], ['#ffd6a5', '#e8a87c', '她'], ['#c3e8d5', '#8fc9ad', '星'], ['#e8d5f5', '#b79ad8', '月'], ['#fbd6d6', '#e39b9b', '光']];
        var meSpec = [['#ffd9e0', '#f2a6b8', '我'], ['#d9e8ff', '#a3c1f0', '洋'], ['#fff0c9', '#f0cf94', '铭'], ['#d6f0e0', '#9ad4b4', '宁'], ['#ede0ff', '#c3a8f0', '夏'], ['#ffe8cc', '#f0bd8a', '秋']];
        function mk(spec, n, t0) {
            return spec.slice(0, n).map(function (s, i) {
                return { id: 'vseed_' + t0 + '_' + i, src: seedAvatar(s[0], s[1], s[2]), ts: now - i * 3600000 * 7 };
            });
        }
        vault.me = mk(meSpec, 5, 'me');
        vault.ta = mk(taSpec, 6, 'ta');
        logs = [
            { who: 'ta', way: 'TA 自己换的', src: vault.ta[0].src, ts: now - 3600000 * 5 },
            { who: 'me', way: '你手动换的', src: vault.me[0].src, ts: now - 3600000 * 26 },
            { who: 'ta', way: 'TA 自己换的', src: vault.ta[1].src, ts: now - 3600000 * 54 }
        ];
        saveV(); saveL();
    }

    function load() {
        try {
            var raw = localStorage.getItem(skey(VK));
            if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') { vault.me = o.me || []; vault.ta = o.ta || []; } }
        } catch (e) {}
        // 首次进入给种子数据，避免两个空库
        if (!localStorage.getItem(skey(VK) + '_seeded')) {
            seedVault();
            try { localStorage.setItem(skey(VK) + '_seeded', '1'); } catch (e) {}
        }
        var d = { on: 1, minH: 2, maxH: 8, mineOn: 1, askMe: 1, mineProb: 40 };
        try {
            var r2 = localStorage.getItem(skey(CK));
            if (r2) { var c = JSON.parse(r2); if (c && typeof c === 'object') for (var k in d) if (c[k] !== undefined) d[k] = c[k]; }
        } catch (e) {}
        cfgc = d;
        try { nextAt = +(localStorage.getItem(skey(NK)) || 0) || 0; } catch (e) { nextAt = 0; }
        try { var r3 = localStorage.getItem(skey(HK)); if (r3) { var a = JSON.parse(r3); if (Array.isArray(a)) logs = a; } } catch (e) {}
    }
    function saveV() { try { localStorage.setItem(skey(VK), JSON.stringify(vault)); } catch (e) {} }
    function saveC() { try { localStorage.setItem(skey(CK), JSON.stringify(cfgc)); } catch (e) {} }
    function saveN() { try { localStorage.setItem(skey(NK), String(nextAt)); } catch (e) {} }
    function saveL() { try { localStorage.setItem(skey(HK), JSON.stringify(logs.slice(-60))); } catch (e) {} }

    /* ---------- 应用头像 ----------
       统一写 chatSettings.conv（唯一数据源）：
       · 顶栏 #wx-title-avatar / 消息气泡头像都由 ChatConvSettings.apply 渲染
       · 换完立即全界面同步（旧实现只改隐藏 DOM，顶栏永远不变——已废弃）
       · conv 状态按会话分桶，联系人之间互不影响 */
    function applyAvatar(who, src) {
        try {
            if (window.ChatConvSettings && typeof window.ChatConvSettings.setAvatar === 'function') {
                window.ChatConvSettings.setAvatar(who === 'me' ? 'me' : 'ta', src);
                return true;
            }
        } catch (e) {}
        /* 兜底：旧路径（设置页尚未就绪时） */
        var el = document.getElementById(who === 'me' ? 'my-avatar' : 'partner-avatar');
        if (!el) return false;
        try {
            var img = el.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                el.innerHTML = '';
                el.appendChild(img);
            }
            img.src = src;
            el.style.backgroundImage = 'url(' + src + ')';
        } catch (e) { return false; }
        try { if (typeof saveData === 'function') saveData(); } catch (e) {}
        return true;
    }
    function currentAvatar(who) {
        var sideKey = who === 'me' ? 'me' : 'ta';
        // 唯一数据源是 ChatConvSettings（applyAvatar 写的就是它），先从它读
        try {
            if (window.ChatConvSettings && typeof window.ChatConvSettings.getAvatar === 'function') {
                var v = window.ChatConvSettings.getAvatar(sideKey);
                if (v) return v;
            }
        } catch (e) {}
        // 兜底：读隐藏 DOM
        try {
            var el = document.getElementById(who === 'me' ? 'my-avatar' : 'partner-avatar');
            var im = el && el.querySelector('img');
            if (im && im.src) return im.src;
            var bg = el ? getComputedStyle(el).backgroundImage : '';
            var m = String(bg).match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1]) return m[1];
        } catch (e) {}
        return '';
    }

    function log(who, src, way) {
        logs.unshift({ who: who, src: src, ts: Date.now(), way: way || '' });
        saveL();
    }

    /* ---------- TA 自动换 ---------- */
    function tick() {
        if (!cfgc || !cfgc.on) return;
        var now = Date.now();
        if (!nextAt) { nextAt = now + rnd(cfgc.minH, cfgc.maxH) * 3600000; saveN(); return; }
        if (now < nextAt) return;
        // 换 TA 自己的
        if (vault.ta.length) {
            var pick = vault.ta[Math.floor(Math.random() * vault.ta.length)].src;
            if (pick && applyAvatar('ta', pick)) {
                log('ta', pick, 'TA 自己换的');
                notify(taName() + ' 换了个头像', 'info');
            }
        }
        // 换我的
        if (cfgc.mineOn && vault.me.length && Math.random() * 100 < cfgc.mineProb) {
            var pick2 = vault.me[Math.floor(Math.random() * vault.me.length)].src;
            var ok = true;
            if (cfgc.askMe) ok = window.confirm(taName() + ' 想给你换这个头像，同意吗？');
            if (ok && pick2 && applyAvatar('me', pick2)) {
                log('me', pick2, cfgc.askMe ? '你同意了' : 'TA 直接换的');
                notify('头像已更换', 'success');
            } else if (!ok) {
                notify('你拒绝了这次换头像', 'info');
            }
        }
        nextAt = now + rnd(cfgc.minH, cfgc.maxH) * 3600000;
        saveN();
        if (modal && modal.style.display !== 'none') render();
    }
    function taName() {
        try { var e = document.getElementById('partner-name'); if (e && e.textContent.trim()) return e.textContent.trim(); } catch (x) {}
        try { return settings.partnerName || '对方'; } catch (x) { return '对方'; }
    }

    /* ---------- UI ---------- */
    // 数字步进器（不用滑杆：手机上滑杆难点中、精度低）
    function stepper(key, val, min, max, unit, step) {
        step = step || 1;
        return '<span class="va-step" data-vs="' + key + '" data-min="' + min + '" data-max="' + max + '" data-step="' + step + '">' +
            '<button type="button" data-vsd="-1"><i class="fas fa-minus"></i></button>' +
            '<b>' + val + unit + '</b>' +
            '<button type="button" data-vsd="1"><i class="fas fa-plus"></i></button>' +
        '</span>';
    }

    function render() {
        if (!bodyEl) return;
        var arr = vault[side] || [];
        var h =
            '<div class="va-side">' +
                '<span class="va-st' + (side === 'me' ? ' on' : '') + '" data-side="me">我的头像库 ' + vault.me.length + '</span>' +
                '<span class="va-st' + (side === 'ta' ? ' on' : '') + '" data-side="ta">TA的头像库 ' + vault.ta.length + '</span>' +
                '<div class="ab-sp"></div>' +
                '<div class="ab-btn" data-va-now><i class="fas fa-shuffle"></i> 现在换一张</div>' +
                '<div class="ab-btn" data-va-add><i class="fas fa-plus"></i> 添加</div>' +
            '</div>' +
            '<div class="va-cur">当前' + (side === 'me' ? '我的' : 'TA的') + '头像：' +
                (currentAvatar(side) ? '<img src="' + esc(currentAvatar(side)) + '" alt="">' : '<span class="va-none">未设置</span>') +
            '</div>';

        if (!arr.length) {
            h += '<div class="ab-empty"><i class="fas fa-user-circle"></i><p>这个库还是空的</p>' +
                 '<p style="opacity:.7;font-size:12px">点「添加」往里放几张，TA 会随机挑</p></div>';
        } else {
            h += '<div class="va-grid">';
            arr.forEach(function (it) {
                h += '<div class="va-cell' + (currentAvatar(side) === it.src ? ' cur' : '') + '" data-va="' + esc(it.id) + '">' +
                        '<img src="' + esc(it.src) + '" alt="" loading="lazy">' +
                        '<div class="va-use">用这张</div>' +
                        '<div class="va-x" data-vax="' + esc(it.id) + '"><i class="fas fa-xmark"></i></div>' +
                     '</div>';
            });
            h += '</div>';
        }

        h += '<div class="va-sec">自动换头像</div>' +
            '<div class="va-row"><span class="k">TA 自己换头像</span>' +
                '<label class="mts-sw"><input type="checkbox" data-vc="on"' + (cfgc.on ? ' checked' : '') + '><i></i></label></div>' +
            '<div class="va-row"><span class="k">间隔最短</span>' +
                stepper('minH', cfgc.minH, 1, 48, 'h') + '</div>' +
            '<div class="va-row"><span class="k">间隔最长</span>' +
                stepper('maxH', cfgc.maxH, 1, 72, 'h') + '</div>' +
            '<div class="va-row"><span class="k">TA 也换我的头像</span>' +
                '<label class="mts-sw"><input type="checkbox" data-vc="mineOn"' + (cfgc.mineOn ? ' checked' : '') + '><i></i></label></div>' +
            '<div class="va-row"><span class="k">换我头像前先问我</span>' +
                '<label class="mts-sw"><input type="checkbox" data-vc="askMe"' + (cfgc.askMe ? ' checked' : '') + '><i></i></label></div>' +
            '<div class="va-row"><span class="k">换我头像概率</span>' +
                stepper('mineProb', cfgc.mineProb, 0, 100, '%', 5) + '</div>';

        if (logs.length) {
            h += '<div class="va-sec">换头像记录</div><div class="va-logs">';
            logs.slice(0, 12).forEach(function (l) {
                var d = new Date(l.ts);
                h += '<div class="va-log"><img src="' + esc(l.src) + '" alt="">' +
                     '<div class="va-lb"><b>' + (l.who === 'me' ? '我的' : 'TA的') + '</b>' + esc(l.way) + '</div>' +
                     '<span class="va-lt">' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
                     ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</span></div>';
            });
            h += '</div>';
        }
        bodyEl.innerHTML = h;
    }

    function addFiles(files) {
        var fs = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//i.test(f.type); });
        if (!fs.length) return;
        var done = 0;
        fs.forEach(function (f) {
            var push = function (url) {
                if (url) vault[side].push({ id: 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), src: url, ts: Date.now() });
                done++;
                if (done === fs.length) { saveV(); render(); notify('已添加 ' + fs.length + ' 张', 'success'); }
            };
            if (typeof compressImageSmart === 'function' && !/gif$/i.test(f.type)) compressImageSmart(f, 0.4, 640).then(push).catch(function () { readRaw(f, push); });
            else readRaw(f, push);
        });
    }
    function readRaw(f, cb) {
        var r = new FileReader();
        r.onload = function (e) { cb(e.target.result); };
        r.onerror = function () { cb(''); };
        r.readAsDataURL(f);
    }

    function build() {
        if (built) return;
        built = true;
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'avatar-vault-modal';
        modal.innerHTML =
            '<div class="modal-content ab-box">' +
                '<div class="ab-bar">' +
                    '<div class="ab-title"><i class="fas fa-user-circle"></i> 头像库</div>' +
                    '<div class="ab-sp"></div>' +
                    '<div class="ab-btn" data-va-x><i class="fas fa-xmark"></i></div>' +
                '</div>' +
                '<div class="va-body" id="va-body"></div>' +
            '</div>';
        document.body.appendChild(modal);
        bodyEl = modal.querySelector('#va-body');

        input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', function (e) { addFiles(e.target.files); input.value = ''; });
        document.body.appendChild(input);

        // 内容可能被搬进 FSPage（#fs-avatars），事件冒泡不到 #avatar-vault-modal，
        // 所以交互全部用 document 级委托。
        if (!_clickBound) {
            _clickBound = true;
            document.addEventListener('click', function (e) {
                // 只处理头像库自己的元素
                var inVault = e.target.closest('#avatar-vault-modal, #fs-avatars');
                if (!inVault) return;
                if (e.target === modal) { close(); return; }
                if (e.target.closest('[data-va-x]')) { close(); return; }
                if (e.target.closest('[data-va-add]')) { input.click(); return; }
                var s = e.target.closest('[data-side]');
                if (s) { side = s.getAttribute('data-side'); render(); return; }
                if (e.target.closest('[data-va-now]')) {
                    var arr = vault[side] || [];
                    if (!arr.length) { notify('这个库是空的', 'warning'); return; }
                    var pp = arr[Math.floor(Math.random() * arr.length)].src;
                    if (applyAvatar(side, pp)) { log(side, pp, '你手动换的'); notify('已换上', 'success'); }
                    render();
                    return;
                }
                var x = e.target.closest('[data-vax]');
                if (x) {
                    e.stopPropagation();
                    var id = x.getAttribute('data-vax');
                    vault[side] = vault[side].filter(function (o) { return o.id !== id; });
                    saveV(); render();
                    return;
                }
                var c = e.target.closest('[data-va]');
                if (c) {
                    var it = (vault[side] || []).filter(function (o) { return o.id === c.getAttribute('data-va'); })[0];
                    if (it && applyAvatar(side, it.src)) { log(side, it.src, '你手动换的'); notify('已换上', 'success'); }
                    render();
                }
            });
            document.addEventListener('input', function (e) {
                if (!e.target.closest('#avatar-vault-modal, #fs-avatars')) return;
                var c = e.target.getAttribute && e.target.getAttribute('data-vc');
                if (c) { cfgc[c] = e.target.checked ? 1 : 0; saveC(); }
            });
        }
        // 数字步进器：+/- 改数值。
        // 注意内容可能被搬进 FSPage（#fs-avatars），事件冒泡不到 #avatar-vault-modal，
        // 所以用 document 级委托。
        if (!_stepBound) {
            _stepBound = true;
            document.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-vsd]');
                if (!btn) return;
                var box = btn.closest('[data-vs]');
                if (!box) return;
                var k = box.getAttribute('data-vs');
                var min = +box.getAttribute('data-min'), max = +box.getAttribute('data-max'), st = +box.getAttribute('data-step');
                var d = +btn.getAttribute('data-vsd');
                var unit = k === 'mineProb' ? '%' : 'h';
                var nv = Math.min(max, Math.max(min, (+cfgc[k] || 0) + d * st));
                if (nv === cfgc[k]) return;
                cfgc[k] = nv;
                var bb = box.querySelector('b');
                if (bb) bb.textContent = nv + unit;
                saveC();
            });
        }
        }

    var fsPage = null;

    function open(s) {
        build();
        if (s) side = s;
        render();
        // 主页面点进来 = 打开一个全新界面（与音乐 / 字卡管理一致），不再用弹窗
        try {
            if (window.FSPage && !document.body.classList.contains('va-inline')) {
                fsPage = window.FSPage.get('avatars');
                if (!fsPage) {
                    fsPage = window.FSPage.create({
                        id: 'avatars',
                        title: '头像库',
                        icon: 'fas fa-user-circle',
                        onRender: function (pane) {
                            if (pane.getAttribute('data-hosted')) return;
                            pane.innerHTML = '<div class="va-host"></div>';
                            pane.setAttribute('data-hosted', '1');
                            var box = modal && modal.querySelector('.ab-box');
                            if (box) { pane.firstChild.appendChild(box); modal.style.setProperty('display', 'none', 'important'); }
                        },
                        onClose: function () {
                            var box = modal && modal.querySelector('.ab-box');
                            if (box && !modal.contains(box)) modal.appendChild(box);
                        }
                    });
                }
                fsPage.open();
                return;
            }
        } catch (e) {}
        try { if (typeof showModal === 'function') showModal(modal); else modal.style.display = 'flex'; }
        catch (e) { modal.style.display = 'flex'; }
    }
    function close() {
        if (fsPage && fsPage.isOpen()) { fsPage.close(); return; }
        try { if (typeof hideModal === 'function') hideModal(modal); else modal.style.display = 'none'; }
        catch (e) { modal.style.display = 'none'; }
    }

    window.AvatarVault = {
        open: open, close: close,
        apply: applyAvatar,
        count: function (w) { return (vault[w || 'ta'] || []).length; },
        random: function (w) {
            var a = vault[w || 'ta'] || [];
            return a.length ? a[Math.floor(Math.random() * a.length)].src : '';
        }
    };

    function boot() {
        load();
        clearInterval(timer);
        timer = setInterval(tick, 60000);
        setTimeout(tick, 5000);
    }
    if (window.whenSessionReady) window.whenSessionReady(boot); else document.addEventListener('DOMContentLoaded', boot);
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
})();
