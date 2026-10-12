/**
 * 手机桌面首页 (Home Screen)
 * 设计语言：白纸极简（参考 mochi）—— 白底图标 + 单色线条 + 细边框 + 极淡阴影
 * - 顶部问候时钟 / 可增删小组件 / 应用图标网格 / 底部纯图标导航栏
 * - 纪念日大卡：双人头像 + 在一起多少天 + 可自定义背景
 * - 状态卡：同时显示「我」与「对方」的状态，可就地编辑并同步到聊天页
 * - 音乐小组件真实控制现有播放器（上一首 / 播放暂停 / 下一首）
 * - 图标与小组件均可自定义，持久化到 localStorage
 */
(function () {
    var WKEY = 'homeWidgets';      // 启用的小组件
    var AKEY = 'homeApps';         // 启用的图标
    var SKEY = 'homeLastScreen';   // 上次停留界面
    var BKEY = 'homeAnniBg';       // 纪念日卡自定义背景（dataURL）

    /* ============ 基础工具 ============ */
    function ls(k, v) {
        try {
            if (v === undefined) return localStorage.getItem(k);
            localStorage.setItem(k, v);
            return true;
        } catch (e) { return v === undefined ? null : false; }
    }
    function arr(k, def) {
        var raw = ls(k);
        if (!raw) return def.slice();
        try { var a = JSON.parse(raw); return Array.isArray(a) ? a : def.slice(); } catch (e) { return def.slice(); }
    }
    function save(k, a) { ls(k, JSON.stringify(a)); }
    var AMP = '&';
    var ESC_MAP = { '&': AMP + 'amp;', '<': AMP + 'lt;', '>': AMP + 'gt;', '"': AMP + 'quot;', "'": AMP + '#39;' };
    function esc(s) {
        return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
    }
    function notify(msg, type) { try { if (typeof showNotification === 'function') showNotification(msg, type || 'info', 1400); } catch (e) {} }
    function persist() { try { if (typeof throttledSaveData === 'function') throttledSaveData(); } catch (e) {} }

    function setVal(path, v) { try { if (typeof settings === 'object' && settings) settings[path] = v; } catch (e) {} }
    function getVal(path, dft) {
        try { if (typeof settings === 'object' && settings && settings[path]) return settings[path]; } catch (e) {}
        return dft;
    }

    /* ============ 聊天页真实数据 ============ */
    function avatarHTML(which, cls) {
        var radius = '50%', src = '';
        try {
            var shape = getVal(which === 'me' ? 'myAvatarShape' : 'partnerAvatarShape', 'circle');
            radius = shape === 'square' ? '14px' : (shape === 'rounded' ? '26px' : '50%');
            var box = document.getElementById(which === 'me' ? 'my-avatar' : 'partner-avatar');
            var img = box && box.querySelector('img');
            if (img && img.getAttribute('src')) src = img.getAttribute('src');
        } catch (e) {}
        return '<div class="hs-av ' + (cls || '') + '" style="border-radius:' + radius + '">' +
            (src ? '<img src="' + esc(src) + '" alt="" style="border-radius:' + radius + '">' : '<i class="fas fa-user"></i>') +
            '</div>';
    }
    function whoName(which) {
        try {
            var el = document.getElementById(which === 'me' ? 'my-name' : 'partner-name');
            if (el && el.textContent.trim()) return el.textContent.trim();
        } catch (e) {}
        return getVal(which === 'me' ? 'myName' : 'partnerName', which === 'me' ? '我' : '对方');
    }
    function statusOf(which) {
        try {
            var el = which === 'me'
                ? document.getElementById('my-status-text')
                : document.querySelector('#partner-status span');
            if (el && el.textContent.trim()) return el.textContent.trim();
        } catch (e) {}
        return getVal(which === 'me' ? 'myStatus' : 'partnerStatus', '在线');
    }

    /* ============ 纪念日 ============ */
    function pickAnniversary() {
        try {
            var list = (typeof anniversaries !== 'undefined' && Array.isArray(anniversaries)) ? anniversaries : [];
            if (!list.length) return null;
            var past = list.filter(function (x) { return x.type !== 'countdown'; });
            return past[0] || list[0] || null;
        } catch (e) { return null; }
    }
    function fmtDate(s) {
        if (!s) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { var p = s.split('-'); return (+p[1]) + '月' + (+p[2]) + '日 ' + p[0]; }
        var d = new Date(s);
        return isNaN(d.getTime()) ? String(s) : (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + d.getFullYear();
    }
    function annDays(a) {
        if (!a || !a.date) return null;
        var st = new Date(a.date);
        if (isNaN(st.getTime())) return null;
        var s = new Date(st.getFullYear(), st.getMonth(), st.getDate());
        var n = new Date();
        var n0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
        var diff = Math.round((n0 - s) / 86400000);
        if (a.type === 'countdown') {
            return { label: diff > 0 ? '还有' : '就是今天', days: Math.max(0, diff), future: true };
        }
        if (diff < 0) return { label: '距离', days: -diff, future: true };
        return { label: '在一起', days: diff + 1, future: false };
    }

    /* ============ 音乐 ============
       优先用 <audio id="audio"> 的真实播放状态（原来读 #icon-pause 的 computed
       style，播放器折叠时会误判）；外链失效时可以用 + 选本地音乐直接喂给 audio。 */
    var localAudioUrl = '';
    function audioEl() { return document.getElementById('audio'); }
    function playerEl() { return document.getElementById('player'); }
    function muTitle() {
        try {
            var t = document.getElementById('music-title');
            if (t && t.textContent) {
                var s = t.textContent.trim();
                if (s && s !== 'Loading...') return s;
            }
        } catch (e) {}
        return '';
    }
    function muPlaying() {
        var a = audioEl();
        if (a) return !!a.currentSrc && !a.paused && !a.ended;
        try {
            var p = document.getElementById('icon-pause');
            return !!(p && p.style.display !== 'none');
        } catch (e) { return false; }
    }
    function isLocalTrack() { var a = audioEl(); return !!(a && a.dataset && a.dataset.hsLocal === '1'); }
    function setTrackName(t, sub) {
        try {
            var el = document.getElementById('music-title'); if (el) el.textContent = t;
            var sb = document.getElementById('music-subtitle'); if (sb) sb.textContent = sub || '';
        } catch (e) {}
    }
    function muPlayPause() {
        var a = audioEl();
        var p = playerEl();
        if (p) p.classList.add('visible');          // 让悬浮播放器露出来，点了有反馈
        if (!a) { tap('#play-btn'); return; }
        if (isLocalTrack()) {                        // 本地歌：直接控制，别被原播放器重置
            if (a.paused) a.play().catch(function () { notify('播放失败', 'error'); });
            else a.pause();
            return;
        }
        tap('#play-btn');
    }
    function muSkip(dir) {
        if (isLocalTrack()) { notify('本地单曲，切歌请先关掉本地音乐', 'info'); return; }
        tap(dir === 'prev' ? '#prev-btn' : '#next-btn');
    }
    function pickLocalAudio() {
        var inp = document.getElementById('hs-audio-input');
        if (inp) { inp.value = ''; inp.click(); }
    }
    function onLocalAudio(e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var a = audioEl();
        if (!a) { notify('播放器未就绪', 'error'); return; }
        try { if (localAudioUrl) URL.revokeObjectURL(localAudioUrl); } catch (err) {}
        localAudioUrl = URL.createObjectURL(f);
        a.dataset.hsLocal = '1';
        a.src = localAudioUrl;
        setTrackName(f.name.replace(/\.[^.]+$/, ''), '本地音乐');
        var p = playerEl(); if (p) p.classList.add('visible');
        a.play().then(function () { notify('正在播放本地音乐', 'success'); })
                .catch(function () { notify('播放失败，换一个文件试试', 'error'); });
        renderCards();
    }

    /* ============ 小组件 ============ */
    function anniHTML() {
        var a = pickAnniversary(), d = annDays(a);
        var bg = ls(BKEY) || '';
        var label = d ? d.label : '在一起';
        var days = d ? d.days : '—';
        var unit = d ? '<span class="un">天</span>' : '';
        var foot = a ? (esc(a.name || (a.type === 'countdown' ? '倒数日' : '纪念日')) + ' · ' + esc(fmtDate(a.date))) : '点此记录你们的起点';

        return '<div class="hs-anni' + (bg ? ' hasbg' : '') + '">' +
            (bg ? '<div class="hs-anni-fill" style="background-image:url(\'' + bg + '\')"></div><div class="hs-anni-shade"></div>' : '') +
            '<div class="hs-anni-tools">' +
                '<span class="hs-anni-tool" data-anni="bg" title="换背景"><i class="fas fa-image"></i></span>' +
                (bg ? '<span class="hs-anni-tool" data-anni="rm" title="恢复默认"><i class="fas fa-rotate-left"></i></span>' : '') +
            '</div>' +
            '<div class="hs-anni-body">' +
                '<div class="hs-anni-row">' +
                    '<div class="hs-av-wrap" data-av="me" title="更换我的头像">' + avatarHTML('me') + '<span class="hs-av-nm">' + esc(whoName('me')) + '</span></div>' +
                    '<i class="fas fa-heart hs-anni-heart"></i>' +
                    '<div class="hs-av-wrap" data-av="partner" title="更换对方头像">' + avatarHTML('partner') + '<span class="hs-av-nm">' + esc(whoName('partner')) + '</span></div>' +
                '</div>' +
                '<div class="hs-anni-days">' +
                    '<span class="lb">' + esc(label) + '</span><b>' + days + '</b>' + unit +
                '</div>' +
                '<div class="hs-anni-foot">' + foot + '</div>' +
            '</div>' +
        '</div>';
    }

    /* 状态卡：紧凑半格。内容直接取聊天页双方头像下方那行状态，聊天页一改这里就跟着变 */
    function statusHTML() {
        function row(which) {
            return '<div class="hs-st-row" data-srow="' + which + '" title="点击修改' + (which === 'me' ? '我的' : '对方的') + '状态">' +
                avatarHTML(which, 'sm') +
                '<div class="hs-st-txt">' +
                    '<div class="hs-st-v">' + esc(statusOf(which)) + '</div>' +
                '</div>' +
                '<i class="fas fa-pen hs-st-pen"></i>' +
            '</div>';
        }
        return '<div class="hs-status compact">' +
            '<div class="hs-card-top"><i class="fas fa-feather-alt"></i>状态</div>' +
            '<div class="hs-st-list">' + row('me') + row('partner') + '</div>' +
        '</div>';
    }

    var WIDGETS = {
        anniversary: {
            name: '纪念日', desc: '双人头像 · 在一起多少天 · 自定义背景', icon: 'fa-heart', wide: true, custom: true,
            html: anniHTML,
            tap: openAnniversary
        },
        status: {
            name: '状态', desc: '同步聊天页双方头像下的状态', icon: 'fa-feather-alt', wide: false, custom: true,
            html: statusHTML
        },
        music: {
            name: '音乐', desc: '正在播放与控制', icon: 'fa-music', wide: true, custom: true,
            tap: function () { openVinyl(); },
            html: function () {
                var name = muTitle() || '暂无歌曲';
                var playing = muPlaying();
                return '<div class="hs-music">' +
                    '<div class="hs-mu-info">' +
                        '<div class="hs-mu-name">' + esc(name) + '</div>' +
                        '<div class="hs-mu-sub">' + (playing ? '正在播放' : '已暂停') + '</div>' +
                    '</div>' +
                    '<div class="hs-bars' + (playing ? ' playing' : '') + '"><i></i><i></i><i></i><i></i></div>' +
                    '<div class="hs-mu-ctl">' +
                        '<div class="hs-mu-btn" data-m="prev-btn"><i class="fas fa-backward-step"></i></div>' +
                        '<div class="hs-mu-btn main" data-m="play-btn"><i class="fas ' + (playing ? 'fa-pause' : 'fa-play') + '"></i></div>' +
                        '<div class="hs-mu-btn" data-m="next-btn"><i class="fas fa-forward-step"></i></div>' +
                        '<div class="hs-mu-btn small" data-mact="local" title="播放本地音乐"><i class="fas fa-plus"></i></div>' +
                    '</div>' +
                '</div>';
            }
        },
        stats: {
            name: '消息统计', desc: '累计消息条数', icon: 'fa-chart-simple',
            render: function () {
                var n = 0;
                try { if (typeof messages !== 'undefined' && messages.length) n = messages.length; } catch (e) {}
                return { top: '消息', main: n + ' 条', sub: '一路走来的对话' };
            }
        }
    };
    var DEFAULT_W = ['anniversary', 'status', 'music'];

    /* ============ 应用图标（全部复用现有入口，保证真能打开） ============ */
    function tap(sel) {
        var el = document.querySelector(sel);
        if (el) el.click();
        else notify('该入口暂不可用', 'info');
    }
    // 打开全屏黑胶播放器（js/features/music-vinyl.js）
    function openVinyl() {
        try {
            if (window.MusicVinyl && window.MusicVinyl.open) { window.MusicVinyl.open(); return; }
        } catch (e) {}
        tap('#list-btn');
    }
    function openM(id) {
        var el = document.getElementById(id);
        if (!el) { notify('该入口暂不可用', 'info'); return; }
        try { if (typeof showModal === 'function') showModal(el); else el.style.display = 'flex'; }
        catch (e) { el.style.display = 'flex'; }
    }
    // 纪念日弹窗的列表要手动刷一次，否则直接 showModal 会是一片空白
    function openAnniversary() {
        openM('anniversary-modal');
        try { if (typeof renderAnniversariesList === 'function') renderAnniversariesList(); } catch (e) {}
    }
    function enterChat() {
        // 直接进入聊天界面，不再经过「会话列表 / 新联系人 / 创建群聊」那一层
        try {
            if (window.WxSessions && typeof window.WxSessions.enterCurrent === 'function') { window.WxSessions.enterCurrent(); return; }
        } catch (e) {}
        hideHome();
    }

    var APPS = [
        { id: 'chat',      name: '传讯',   icon: 'fa-comment-dots',        act: enterChat },
        { id: 'moments',   name: '朋友圈', icon: 'fa-camera-retro',        act: function () { try { window.Moments.open('all'); } catch (e) {} } },
        { id: 'music',     name: '音乐',   icon: 'fa-music',               act: function () { openVinyl(); } },
        { id: 'envelope',  name: '信封',   icon: 'fa-envelope-open-text',  act: function () {
            /* 先从存储读到最新信件（含到点的回信），再打开整页 */
            (async function () {
                try { if (typeof loadEnvelopeData === 'function') await loadEnvelopeData(); } catch (e) {}
                try { if (typeof checkEnvelopeStatus === 'function') await checkEnvelopeStatus(); } catch (e) {}
                openM('envelope-modal');
                try { if (typeof switchEnvTab === 'function') switchEnvTab('inbox'); } catch (e) {}
            })();
        } },
        { id: 'anni',      name: '纪念日', icon: 'fa-heart',               act: function () { try { if (window.MiscScreens && window.MiscScreens.anniversary) { window.MiscScreens.anniversary.open(); return; } } catch (e) {} openAnniversary(); } },
        { id: 'album',     name: '相册',   icon: 'fa-images',              act: function () { try { window.Album.open(); } catch (e) {} } },
        { id: 'period',    name: '经期',   icon: 'fa-calendar-days',       act: function () { try { window.Period.open(); } catch (e) {} } },
        { id: 'tarot',     name: '塔罗',   icon: 'fa-star-and-crescent',   act: function () { try { if (window.TarotScreen) { window.TarotScreen.open('fortune'); return; } } catch (e) {} try { if (typeof generateFortune === 'function') generateFortune(); if (typeof switchFLTab === 'function') switchFLTab('fortune'); var m = document.getElementById('fortune-lenormand-modal'); if (m && typeof showModal === 'function') showModal(m); } catch (e) {} } },
        { id: 'diary',     name: '日记',   icon: 'fa-book',                 act: function () { try { if (window.Diary) window.Diary.open(); } catch (e) {} } },
        { id: 'stats',     name: '统计',   icon: 'fa-chart-simple',        act: function () { try { if (window.MiscScreens && window.MiscScreens.stats) { window.MiscScreens.stats.open(); return; } } catch (e) {} openM('stats-modal'); } },
        { id: 'look',      name: '装扮',   icon: 'fa-palette',             act: function () { try { if (window.AppearanceScreen) { window.AppearanceScreen.open('theme'); return; } } catch (e) {} openM('appearance-modal'); } },
        /* —— 以下默认不显示，可在编辑里添加 —— */
        { id: 'replies',   name: '字卡库', icon: 'fa-note-sticky',         act: function () { try { if (window.CardManager) { window.CardManager.open(); return; } } catch (e) {} openM('custom-replies-modal'); } },
        { id: 'group',     name: '群聊',   icon: 'fa-users',               act: function () { tap('#group-chat-btn'); } },
        { id: 'settings',  name: '数据',   icon: 'fa-database',           act: function () { try { if (window.MiscScreens && window.MiscScreens.data) { window.MiscScreens.data.open(); return; } } catch (e) {} openM('data-modal'); } },
        { id: 'mood',      name: '心情',   icon: 'fa-face-smile',          act: function () { try { if (window.MiscScreens && window.MiscScreens.mood) { window.MiscScreens.mood.open(); return; } } catch (e) {} openM('mood-modal'); } },
        { id: 'news',      name: '公告',   icon: 'fa-newspaper',           act: function () { tap('#daily-greeting-btn'); } },
        { id: 'call',      name: '通话',   icon: 'fa-phone',               act: function () { tap('#collapsed-call-btn'); } },
        { id: 'data',      name: '数据',   icon: 'fa-database',            act: function () { try { if (window.MiscScreens && window.MiscScreens.data) { window.MiscScreens.data.open(); return; } } catch (e) {} openM('data-modal'); } },
        { id: 'decision',  name: '决策',   icon: 'fa-list-check',          act: function () { try { if (window.MiscScreens && window.MiscScreens.decision) { window.MiscScreens.decision.open(); return; } } catch (e) {} openM('decision-menu-modal'); } },
        { id: 'wheel',     name: '转盘',   icon: 'fa-dharmachakra',        act: function () { try { if (window.MiscScreens && window.MiscScreens.wheel) { window.MiscScreens.wheel.open(); return; } } catch (e) {} openM('wheel-modal'); } },
        { id: 'voice',     name: '语音',   icon: 'fa-microphone-lines',    act: function () { try { if (window.MiscScreens && window.MiscScreens.voice) { window.MiscScreens.voice.open(); return; } } catch (e) {} openM('voice-clone-modal'); } }
    ];
    var DEFAULT_A = ['chat', 'moments', 'music', 'envelope', 'anni', 'album', 'period', 'tarot', 'diary', 'stats', 'look'];

    /* ============ 底部导航 ============ */
    var TABS = [
        { id: 'chat',    name: '主界面', icon: 'fa-comment-dots', act: enterChat },
        { id: 'replies', name: '字卡库', icon: 'fa-note-sticky',  act: function () { try { if (window.CardManager) { window.CardManager.open(); return; } } catch (e) {} openM('custom-replies-modal'); } },
        { id: 'music',   name: '音乐',   icon: 'fa-music',        act: function () { openVinyl(); } },
        { id: 'settings',name: '数据',   icon: 'fa-database',     act: function () { try { if (window.MiscScreens && window.MiscScreens.data) { window.MiscScreens.data.open(); return; } } catch (e) {} openM('data-modal'); } }
    ];

    /* ============ 构建 ============ */
    var home = null, cardEl = null, gridEl = null, tabEl = null, floatBtn = null, maskEl = null, sheetList = null, bgInput = null;
    var editing = false;

    function greet() {
        var h = new Date().getHours();
        if (h < 5) return '夜深了';
        if (h < 9) return '早上好';
        if (h < 12) return '上午好';
        if (h < 14) return '午安';
        if (h < 18) return '下午好';
        if (h < 23) return '晚上好';
        return '夜深了';
    }

    function build() {
        home = document.createElement('div');
        home.id = 'home-screen';
        home.innerHTML =
            '<div class="hs-bg"></div>' +
            '<div class="hs-inner">' +
                '<div class="hs-head">' +
                    '<div style="display:flex;align-items:flex-start;justify-content:space-between;">' +
                        '<div>' +
                            '<div class="hs-greet">' + greet() + '</div>' +
                            '<div class="hs-clock"><span class="hs-time" id="hs-time">--:--</span>' +
                            '<span class="hs-date" id="hs-date"></span></div>' +
                        '</div>' +
                        '<span id="hs-edit-toggle" style="font-size:11.5px;font-weight:600;opacity:.5;' +
                        'color:var(--text-primary,#333);cursor:pointer;padding:4px 9px;border-radius:9px;' +
                        'background:rgba(127,127,127,.12);">编辑</span>' +
                    '</div>' +
                '</div>' +
                '<div class="hs-pages" id="hs-grid" style="overflow-x:auto;"></div>' +
                '<div class="hs-dots" id="hs-dots"></div>' +
                '<div class="hs-editbar">' +
                    '<div class="hs-ebtn" id="hs-add">+ 添加</div>' +
                    '<div class="hs-ebtn" id="hs-done">完成</div>' +
                '</div>' +
            '</div>' +
            '<div class="hs-dock"><div class="hs-tabbar" id="hs-tabbar"></div></div>';

        document.body.appendChild(home);
        gridEl = home.querySelector('#hs-grid');
        tabEl = home.querySelector('#hs-tabbar');

        // 翻页：原生横向滚动（scroll-snap）+ 圆点点按（参考 mochi desktop-slider.js）
        if (gridEl) {
            gridEl.addEventListener('scroll', function () {
                clearTimeout(pageScrollTimer);
                pageScrollTimer = setTimeout(syncDots, 120);
            }, { passive: true });
            var dotsBox = home.querySelector('#hs-dots');
            if (dotsBox) dotsBox.addEventListener('click', function (e) {
                var dot = e.target.closest('.hs-dot');
                if (!dot) return;
                goPage(Array.prototype.indexOf.call(dotsBox.children, dot));
            });
        }

        bgInput = document.createElement('input');
        bgInput.type = 'file';
        bgInput.accept = 'image/*';
        bgInput.style.display = 'none';
        bgInput.addEventListener('change', onBgPick);
        document.body.appendChild(bgInput);

        var auInput = document.createElement('input');
        auInput.type = 'file';
        auInput.id = 'hs-audio-input';
        auInput.accept = 'audio/*';
        auInput.style.display = 'none';
        auInput.addEventListener('change', onLocalAudio);
        document.body.appendChild(auInput);

        // 回到桌面：聊天界面不再挂浮动「房子」按钮
        // （之前没有 .header-actions 时会 fallback 到 body.appendChild，变成一个
        //  游离在右下角的房子图标；现在返回键已能回到会话列表，会话列表左上角可回桌面）
        floatBtn = null;

        maskEl = document.createElement('div');
        maskEl.className = 'hs-mask';
        maskEl.innerHTML = '<div class="hs-sheet"><div class="hs-sheet-title" id="hs-sheet-title">添加</div><div id="hs-sheet-list"></div></div>';
        maskEl.addEventListener('click', function (e) { if (e.target === maskEl) maskEl.classList.remove('show'); });
        document.body.appendChild(maskEl);
        sheetList = maskEl.querySelector('#hs-sheet-list');

        home.querySelector('#hs-edit-toggle').addEventListener('click', function () { setEditing(!editing); });
        home.querySelector('#hs-add').addEventListener('click', openSheet);
        home.querySelector('#hs-done').addEventListener('click', function () { setEditing(false); });

        renderTabs();
        renderCards();
        renderGrid();
        watchLive();
        bindAudio();
        tick();
        setInterval(tick, 1000 * 20);
        setInterval(function () { if (home.classList.contains('show')) renderCards(); }, 4000);
    }

    function tick() {
        if (!home) return;
        var d = new Date(), hh = d.getHours(), mm = d.getMinutes();
        var t = home.querySelector('#hs-time'), dt = home.querySelector('#hs-date');
        if (t) t.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
        if (dt) dt.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    }

    /* ---------- 纪念日卡自定义背景 ---------- */
    function readRaw(file, cb) {
        var r = new FileReader();
        r.onload = function (e) { cb(e.target.result); };
        r.onerror = function () { notify('图片读取失败', 'error'); };
        r.readAsDataURL(file);
    }
    function onBgPick() {
        var f = bgInput.files && bgInput.files[0];
        bgInput.value = '';
        if (!f) return;
        var done = function (url) {
            if (ls(BKEY, url) === false) { notify('空间不足，换张小一点的图', 'error'); return; }
            renderCards();
            notify('背景已更换', 'success');
        };
        if (typeof compressImageSmart === 'function') {
            compressImageSmart(f, 0.8, 1280).then(done).catch(function () { readRaw(f, done); });
        } else {
            readRaw(f, done);
        }
    }

    /* ---------- 头像：点桌面头像 = 调起聊天页那套改头像的弹窗 ---------- */
    function openAvatarEditor(which) {
        var modal = document.getElementById('avatar-modal');
        var el = document.getElementById(which === 'me' ? 'my-avatar' : 'partner-avatar');
        if (!el) { notify('头像入口暂不可用', 'info'); return; }
        try { el.click(); } catch (e) {}
        setTimeout(function () {
            if (modal && modal.style.display === 'flex') { renderCards(); return; }
            notify('请回聊天界面，点顶部头像修改', 'info');
        }, 320);
    }

    /* ---------- 聊天页一动，桌面立刻跟着动 ---------- */
    function liveRefresh() { if (home && home.classList.contains('show')) renderCards(); }
    // 幂等：同一个节点只绑一次，重复调用安全（聊天页重渲染后新节点会自动补上）
    function watchLive() {
        if (typeof MutationObserver !== 'function') return;
        var targets = [];
        ['my-avatar', 'partner-avatar', 'my-status-text', 'my-name', 'partner-name'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) targets.push(el);
        });
        var ps = document.querySelector('#partner-status span');
        if (ps) targets.push(ps);
        // 状态容器本身也盯着（有些路径是整段 innerHTML 替换，span 节点会换掉）
        var psc = document.getElementById('partner-status');
        if (psc) targets.push(psc);
        targets.forEach(function (el) {
            if (el.__hsWatched) return;
            el.__hsWatched = true;
            new MutationObserver(liveRefresh).observe(el, { childList: true, subtree: true, characterData: true });
            if (typeof el.addEventListener === 'function' && !el.__hsInput) {
                el.__hsInput = true;
                el.addEventListener('input', liveRefresh);   // 状态在 input 里编辑时也能跟上
            }
        });
    }
    function bindAudio() {
        var a = audioEl();
        if (!a) return;
        ['play', 'pause', 'ended', 'loadedmetadata'].forEach(function (ev) {
            a.addEventListener(ev, liveRefresh);
        });
    }

    /* ---------- 状态就地编辑 ---------- */
    function applyStatusToApp(which, v) {
        setVal(which === 'me' ? 'myStatus' : 'partnerStatus', v);
        try {
            if (which === 'me') {
                var t = document.getElementById('my-status-text');
                if (t) t.textContent = v;
            } else {
                var s = document.querySelector('#partner-status span');
                if (s) s.textContent = v;
            }
        } catch (e) {}
        persist();
        notify('状态已更新', 'success');
    }
    function editStatus(which) {
        if (editing) return;
        var row = cardEl && cardEl.querySelector('[data-srow="' + which + '"]');
        if (!row || row.querySelector('input')) return;
        var valEl = row.querySelector('.hs-st-v');
        if (!valEl) return;
        var inp = document.createElement('input');
        inp.className = 'hs-st-edit';
        inp.type = 'text';
        inp.maxLength = 40;
        inp.value = valEl.textContent;
        valEl.style.display = 'none';
        row.appendChild(inp);
        inp.focus();
        var done = function () {
            var v = inp.value.trim() || '在线';
            valEl.textContent = v;
            valEl.style.display = '';
            if (inp.parentNode) inp.parentNode.removeChild(inp);
            applyStatusToApp(which, v);
        };
        inp.addEventListener('blur', done);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
    }

    /* ---------- 渲染 ---------- */
    function renderCards() {
        if (!cardEl) return;
        if (cardEl.querySelector('.hs-st-edit')) return;   // 正在编辑状态，别打断
        var list = arr(WKEY, DEFAULT_W);
        cardEl.innerHTML = '';
        list.forEach(function (id, i) {
            var w = WIDGETS[id];
            if (!w) return;
            var card = document.createElement('div');
            card.className = 'hs-card' + (w.wide ? ' wide' : '') + (id === 'anniversary' ? ' anni' : '');
            card.style.animationDelay = (i * 40) + 'ms';
            var body;
            if (w.custom) {
                body = '';
            } else {
                var d = {};
                try { d = w.render() || {}; } catch (e) { d = {}; }
                body = '<div class="hs-card-top"><i class="fas ' + w.icon + '"></i>' + esc(d.top || w.name) + '</div>' +
                       '<div><div class="hs-card-main">' + esc(d.main || '') + '</div>' +
                       (d.sub ? '<div class="hs-card-sub">' + esc(d.sub) + '</div>' : '') + '</div>';
            }
            card.innerHTML = '<div class="hs-del" data-w="' + id + '"><i class="fas fa-minus"></i></div>' + body;
            if (w.custom) {
                var tmp = document.createElement('div');
                tmp.innerHTML = w.html();
                while (tmp.firstElementChild) card.appendChild(tmp.firstElementChild);
            }
            card.addEventListener('click', function (e) {
                if (e.target.closest('.hs-del')) {
                    save(WKEY, arr(WKEY, DEFAULT_W).filter(function (x) { return x !== id; }));
                    renderCards(); return;
                }
                if (editing) return;
                var tool = e.target.closest('[data-anni]');
                if (tool) {
                    var act = tool.getAttribute('data-anni');
                    if (act === 'bg') bgInput.click();
                    else if (act === 'rm') { ls(BKEY, ''); renderCards(); notify('已恢复默认背景', 'info'); }
                    return;
                }
                if (e.target.closest('[data-mact]')) { pickLocalAudio(); return; }
                var av = e.target.closest('[data-av]');
                if (av) { openAvatarEditor(av.getAttribute('data-av')); return; }
                var mu = e.target.closest('[data-m]');
                if (mu) {
                    var m = mu.getAttribute('data-m');
                    if (m === 'play-btn') muPlayPause();
                    else if (m === 'prev-btn') muSkip('prev');
                    else if (m === 'next-btn') muSkip('next');
                    setTimeout(renderCards, 260);
                    return;
                }
                var srow = e.target.closest('[data-srow]');
                if (srow) { editStatus(srow.getAttribute('data-srow')); return; }
                if (w.tap) w.tap();
            });
            cardEl.appendChild(card);
        });
    }

    function renderGrid() {
        if (!gridEl) return;
        var on = arr(AKEY, DEFAULT_A);
        gridEl.innerHTML = '';
        var items = APPS.filter(function (a) { return on.indexOf(a.id) >= 0; });

        // 每页放置图标数：4 列 × 2 行 = 8（最后半空也允许）
        var PER_PAGE = 8;
        var pageCount = Math.max(1, Math.ceil(items.length / PER_PAGE));
        var n = 0;
        for (var p = 0; p < pageCount; p++) {
            var page = document.createElement('div');
            page.className = 'hs-page';
            // 第一页顶部放小组件卡片，与图标一起整页翻动（mochi 式整页）
            if (p === 0) {
                var cards = document.createElement('div');
                cards.className = 'hs-cards';
                cards.id = 'hs-cards';
                page.appendChild(cards);
            }
            var grid = document.createElement('div');
            grid.className = 'hs-grid';
            items.slice(p * PER_PAGE, (p + 1) * PER_PAGE).forEach(function (a) {
                var el = document.createElement('div');
                el.className = 'hs-app';
                el.style.animationDelay = (n * 30) + 'ms';
                el.innerHTML =
                    '<div class="hs-app-ico">' +
                        '<div class="hs-del" data-a="' + a.id + '"><i class="fas fa-minus"></i></div>' +
                        '<i class="fas ' + a.icon + '"></i>' +
                    '</div>' +
                    '<span class="hs-app-name">' + a.name + '</span>';
                el.addEventListener('click', function (e) {
                    if (e.target.closest('.hs-del')) {
                        save(AKEY, arr(AKEY, DEFAULT_A).filter(function (x) { return x !== a.id; }));
                        renderGrid(); return;
                    }
                    if (editing) return;
                    if (a.act) a.act();
                });
                grid.appendChild(el);
                n++;
            });
            page.appendChild(grid);
            gridEl.appendChild(page);
        }
        // 重新指向第一页里的小组件容器，并补渲染
        cardEl = gridEl.querySelector('#hs-cards');
        renderCards();
        renderDots(pageCount);
    }

    // 翻页圆点 + 滚动联动（参考 mochi desktop-slider.js 的 scroll-snap 思路）
    var pageScrollTimer = null;
    function renderDots(count) {
        var dots = home.querySelector('#hs-dots');
        if (!dots) return;
        dots.innerHTML = '';
        for (var i = 0; i < count; i++) {
            var d = document.createElement('span');
            d.className = 'hs-dot' + (i === 0 ? ' active' : '');
            dots.appendChild(d);
        }
        if (count <= 1) { dots.style.display = 'none'; } else { dots.style.display = ''; }
    }
    function syncDots() {
        var dots = home && home.querySelector('#hs-dots');
        if (!gridEl || !dots || !gridEl.clientWidth) return;
        var idx = Math.round(gridEl.scrollLeft / gridEl.clientWidth);
        Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('active', k === idx); });
    }
    function goPage(i) {
        if (!gridEl || !gridEl.clientWidth) return;
        var pages = gridEl.querySelectorAll('.hs-page').length;
        i = Math.max(0, Math.min(pages - 1, i));
        gridEl.scrollLeft = i * gridEl.clientWidth;
    }

    function renderTabs() {
        if (!tabEl) return;
        tabEl.innerHTML = '';
        TABS.forEach(function (t, i) {
            var el = document.createElement('div');
            el.className = 'hs-tab' + (i === 0 ? ' active' : '');
            el.title = t.name;
            el.innerHTML = '<i class="fas ' + t.icon + '"></i>';
            el.addEventListener('click', function () {
                Array.prototype.forEach.call(tabEl.children, function (c) { c.classList.remove('active'); });
                el.classList.add('active');
                t.act();
            });
            tabEl.appendChild(el);
        });
    }

    function setEditing(on) {
        editing = on;
        home.classList.toggle('editing', on);
        var b = home.querySelector('#hs-edit-toggle');
        if (b) { b.textContent = on ? '完成' : '编辑'; b.style.background = on ? 'rgba(127,127,127,.26)' : 'rgba(127,127,127,.12)'; }
    }

    function openSheet() {
        var curW = arr(WKEY, DEFAULT_W), curA = arr(AKEY, DEFAULT_A);
        sheetList.innerHTML = '';
        Object.keys(WIDGETS).forEach(function (id) {
            var w = WIDGETS[id], on = curW.indexOf(id) >= 0;
            var row = document.createElement('div');
            row.className = 'hs-srow';
            row.innerHTML = '<div class="ic"><i class="fas ' + w.icon + '"></i></div>' +
                '<div><div class="t">' + w.name + '</div><div class="d">' + w.desc + '</div></div>' +
                '<div class="st">' + (on ? '已添加' : '+ 添加') + '</div>';
            row.addEventListener('click', function () {
                var a = arr(WKEY, DEFAULT_W), i = a.indexOf(id);
                if (i >= 0) a.splice(i, 1); else a.push(id);
                save(WKEY, a); renderCards(); openSheet();
            });
            sheetList.appendChild(row);
        });
        APPS.forEach(function (a) {
            if (curA.indexOf(a.id) >= 0) return;
            var row = document.createElement('div');
            row.className = 'hs-srow';
            row.innerHTML = '<div class="ic"><i class="fas ' + a.icon + '"></i></div>' +
                '<div><div class="t">' + a.name + '</div><div class="d">桌面图标</div></div>' +
                '<div class="st">+ 添加</div>';
            row.addEventListener('click', function () {
                var list = arr(AKEY, DEFAULT_A); list.push(a.id);
                save(AKEY, list); renderGrid(); openSheet();
            });
            sheetList.appendChild(row);
        });
        maskEl.classList.add('show');
    }

    /* ============ 显示 / 隐藏 ============ */
    function showHome() {
        if (!home) return;
        watchLive();                  // 每次进桌面都重绑一次：聊天页的状态/头像节点可能已被重新渲染
        renderCards(); renderGrid();
        home.classList.add('show');
        if (floatBtn) floatBtn.classList.remove('show');
        ls(SKEY, 'home');
    }
    function hideHome() {
        if (!home) return;
        home.classList.remove('show');
        setEditing(false);
        if (floatBtn) floatBtn.classList.add('show');
        ls(SKEY, 'chat');
    }

    /* 一次性布局迁移：清掉已并入导航栏的图标与重复的时钟小组件，并把顺序理顺 */
    function migrateOnce() {
        if (ls('homeLayoutVer') === '3') return;
        try {
            var order = DEFAULT_W.slice();
            var w = arr(WKEY, DEFAULT_W).filter(function (x) { return x !== 'clock' && WIDGETS[x]; });
            if (!w.length) w = DEFAULT_W.slice();
            save(WKEY, order.filter(function (x) { return w.indexOf(x) >= 0; })
                .concat(w.filter(function (x) { return order.indexOf(x) < 0; })));

            var dead = ['settings', 'group'];   // 导航栏已有，桌面不再重复
            var ids = APPS.map(function (x) { return x.id; });
            var base = arr(AKEY, DEFAULT_A).filter(function (x) { return dead.indexOf(x) < 0 && ids.indexOf(x) >= 0; });
            // v3：把新功能补进桌面，没排过的按默认顺序追加
            DEFAULT_A.forEach(function (id) { if (base.indexOf(id) < 0) base.push(id); });
            save(AKEY, base);
            ls('homeLayoutVer', '3');
        } catch (e) {}
    }

    function boot() {
        build();
        migrateOnce();
        renderCards(); renderGrid();
        if (floatBtn && ls(SKEY) === 'chat') { floatBtn.classList.add('show'); return; }
        showHome();
    }

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot);

    window.HomeScreen = {
        show: showHome, hide: hideHome,
        refresh: function () { renderCards(); renderGrid(); },
        // 供自检脚本用：按 id 触发某个应用（也是给将来「桌面图标长按重排」预留的入口）
        launch: function (id) {
            try { var a = APPS.filter(function (x) { return x.id === id; })[0]; if (a && a.act) { a.act(); return true; } } catch (e) {}
            return false;
        },
        list: function () { return APPS.map(function (a) { return { id: a.id, name: a.name }; }); }
    };
})();
