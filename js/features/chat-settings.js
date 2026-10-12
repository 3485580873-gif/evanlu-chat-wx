/* ============================================================
   聊天「本场对话」设置（per-conversation settings）
   入口：聊天顶栏右上角 三个点（#chat-more-btn）

   ★ 重要（曾踩坑）：存储键必须和 core.js 用同一个
     core.js  loadData() 读  getStorageKey('chatSettings')
             saveData() 写  getStorageKey('chatSettings')
     之前这里写的是裸键 'chatSettings'，两边对不上，
     于是「上传的背景/头像刷新后全没了 / 设置不生效」。
     现在：把本模块的数据挂在核心 settings 对象的 .conv 字段上，
     既不会覆盖 core 的字段，又能被 saveData 一起带出去。

   分区：美化 / 功能 / 数据
   ============================================================ */
(function () {
    'use strict';

    var CONV_ID = 'main';

    var BG_PRESETS = [
        { key: 'none', label: '默认', val: '' },
        { key: 'cream', label: '奶油', val: '#fff6ef' },
        { key: 'mint', label: '薄荷', val: '#eef7f1' },
        { key: 'sky', label: '晴空', val: '#edf3fc' },
        { key: 'lav', label: '薰衣', val: '#f2eefb' },
        { key: 'rose', label: '玫瑰', val: '#fbeef3' },
        { key: 'night', label: '暗夜', val: '#1b1d24' }
    ];

    var BG_SWATCHES = ['#ffffff', '#fff6ef', '#eef7f1', '#edf3fc', '#f2eefb', '#fbeef3', '#3a3a3a', '#111111', '#ffd6e0'];
    var INK_SWATCHES = ['#111111', '#444444', '#ffffff', '#d6336c', '#1a56db', '#1e8e5a', '#9a6b00', '#7048e8', '#b3540a'];

    var BUBBLE_PADS = [
        { label: '紧凑', val: '7px 10px' }, { label: '标准', val: '11px 14px' }, { label: '宽松', val: '15px 19px' }
    ];

    var DEFAULTS = {
        convId: CONV_ID,
        myNickname: '', taNickname: '',
        background: '',
        fontFamily: '', fontSizePx: 0,
        bubbleRadius: 14,
        bubblePad: '11px 14px',
        avatarShape: 'circle', avatarRound: 50,
        outBg: '', outInk: '', inBg: '', inInk: '',
        bubbleCss: '',
        showAvatar: true, headerAvatar: true, autoScroll: true,
        enterSend: true, batchSend: false, voiceEnabled: true, hideTaSticker: false,
        partnerAvatar: '', myAvatar: '', myAvatarFrame: '', partnerAvatarFrame: ''
    };

    function def() { try { return JSON.parse(JSON.stringify(DEFAULTS)); } catch (e) { return Object.assign({}, DEFAULTS); } }

    /* ---------- 存储键：与 core.js 完全一致 ---------- */
    function storeKey() {
        try {
            if (typeof getStorageKey === 'function' && typeof SESSION_ID !== 'undefined' && SESSION_ID) {
                return getStorageKey('chatSettings');
            }
        } catch (e) {}
        var p = (typeof APP_PREFIX !== 'undefined' && APP_PREFIX) ? APP_PREFIX : 'CHAT_APP_V3_';
        var sid = (typeof SESSION_ID !== 'undefined' && SESSION_ID) ? SESSION_ID : CONV_ID;
        return p + sid + '_chatSettings';
    }

    /* 内存缓存：避免每次读都走 IndexedDB，也避免并发写互相覆盖 */
    var cache = null;

    function fromRaw(full) {
        var c = (full && typeof full === 'object' && full.conv && typeof full.conv === 'object') ? full.conv : {};
        return Object.assign(def(), c);
    }

    function load() {
        // 1) 核心 settings 已经在内存里（loadData 跑过）就直接用
        try {
            if (typeof settings !== 'undefined' && settings && settings.conv && settings.conv.__conv === true) {
                cache = fromRaw(settings);
                return Promise.resolve(cache);
            }
        } catch (e) {}
        if (cache) return Promise.resolve(cache);
        var k = storeKey();
        return Promise.resolve()
            .then(function () { return localforage.getItem(k); })
            .then(function (full) { cache = fromRaw(full); return cache; })
            .catch(function () { cache = cache || def(); return cache; });
    }

    function save(s) {
        s.__conv = true;
        cache = s;
        // 挂到核心 settings 上，让 saveData() 一起落盘
        try {
            if (typeof settings !== 'undefined' && settings && typeof settings === 'object') settings.conv = s;
        } catch (e) {}
        var k = storeKey();
        try {
            localforage.getItem(k).then(function (full) {
                var base = (full && typeof full === 'object') ? full : {};
                base.conv = s;
                return localforage.setItem(k, base);
            }).catch(function () {
                try { localforage.setItem(k, { conv: s }); } catch (e2) {}
            });
        } catch (e) {}
        // 保险：core.js 的 loadData() 是异步的，如果它在我们写完之后才跑，
        // 会把 settings 换成新对象、我们挂的 .conv 就没了，之后 saveData() 落盘时也就丢了。
        // 延迟几次再挂一次，确保无论如何都在内存里。
        [200, 800, 2000, 5000].forEach(function (ms) {
            setTimeout(function () {
                try { if (typeof settings !== 'undefined' && settings && typeof settings === 'object') settings.conv = s; } catch (e) {}
            }, ms);
        });
    }

    /* ---------- 核心 settings（回复速度 / 已读不回 / 主动发消息 等） ---------- */
    function coreGet(k, d) {
        try { return (typeof settings !== 'undefined' && settings && settings[k] !== undefined) ? settings[k] : d; }
        catch (e) { return d; }
    }
    function coreSet(obj) {
        try { if (typeof settings !== 'undefined' && settings && typeof settings === 'object') Object.assign(settings, obj); } catch (e) {}
        try { if (typeof saveData === 'function') saveData(); } catch (e) {}
    }

    /* ---------- 联系人级（置顶 / 免打扰 / 拉黑） ---------- */
    function curSession() {
        try {
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList) && typeof SESSION_ID !== 'undefined') {
                for (var i = 0; i < sessionList.length; i++) if (sessionList[i].id === SESSION_ID) return sessionList[i];
            }
        } catch (e) {}
        return null;
    }
    function saveSessionList() {
        try {
            var p = (typeof APP_PREFIX !== 'undefined' && APP_PREFIX) ? APP_PREFIX : 'CHAT_APP_V3_';
            localforage.setItem(p + 'sessionList', sessionList);
        } catch (e) {}
        try { if (window.WxSessions && window.WxSessions.render) window.WxSessions.render(); } catch (e) {}
        try { if (typeof renderSessionList === 'function') renderSessionList(); } catch (e) {}
    }

    /* ---------- 应用 ---------- */
    function apply(s) {
        s = s || def();
        var body = document.body; if (!body) return;
        body.classList.toggle('conv-show-avatar', !!s.showAvatar);
        body.classList.toggle('conv-header-avatar', !!s.headerAvatar);
        body.classList.toggle('conv-no-autoscroll', s.autoScroll === false);
        applyNicknames(s);
        applyBackground(s);
        applyFont(s);
        applyColors(s);
        applyAvatars(s);
        applyInputBar(s);
        injectLiveCss(s);
        applyAvatarFrames(s);
        setupAutoScroll(s);
        applyBlocked();
    }

    function applyNicknames(s) {
        var p = document.getElementById('partner-name');
        var m = document.getElementById('my-name');
        if (p) p.textContent = (s.taNickname || '').trim() || (p.getAttribute('data-default') || p.textContent);
        if (m) m.textContent = (s.myNickname || '').trim() || (m.getAttribute('data-default') || m.textContent);
        var tv = document.getElementById('wx-title-avatar');
        // mochi 风：只要设了头像就一直在顶栏显示，不再依赖 headerAvatar 开关
        if (tv && !s.partnerAvatar) {
            var nm = (p && p.textContent) ? p.textContent : '?';
            tv.textContent = String(nm).charAt(0);
        }
    }

    function applyBackground(s) {
        var c = document.getElementById('chat-container');
        if (!c) return;
        c.style.backgroundImage = '';
        c.style.backgroundColor = '';
        c.classList.remove('conv-has-bg');
        if (!s.background) return;
        if (/^(data:)|^(https?:)/.test(s.background)) {
            c.style.backgroundImage = 'url("' + s.background + '")';
            c.style.backgroundSize = 'cover'; c.style.backgroundPosition = 'center'; c.style.backgroundRepeat = 'no-repeat';
            c.classList.add('conv-has-bg');
        } else { c.style.backgroundColor = s.background; }
    }

    function applyFont(s) {
        var chat = document.getElementById('chat-container');
        var area = document.querySelector('.main-chat-area');
        var targets = [chat, area].filter(Boolean);
        var px = parseInt(s.fontSizePx, 10);
        var fam = (s.fontFamily || '').trim();
        targets.forEach(function (t) {
            t.style.fontSize = (px >= 12 && px <= 30) ? (px + 'px') : '';
            t.style.fontFamily = fam || '';
        });
    }

    function applyColors(s) {
        var c = document.getElementById('chat-container');
        if (!c) return;
        var map = { outBg: '--message-sent-bg', outInk: '--message-sent-text', inBg: '--message-received-bg', inInk: '--message-received-text' };
        ['outBg', 'outInk', 'inBg', 'inInk'].forEach(function (k) {
            if (s[k]) c.style.setProperty(map[k], s[k]);
            else c.style.removeProperty(map[k]);
        });
    }

    /* 顶栏默认只显示名字；打开「顶栏头像」且传了头像才显示小头像
       【统一】头像 DOM 一律由 Avatars.applyToDom() 写（唯一数据源），
       这里只在 Avatars 缺席时走旧逻辑兜底 */
    function applyAvatars(s) {
        if (window.Avatars && typeof window.Avatars.applyToDom === 'function') {
            window.Avatars.applyToDom();
            return;
        }
        var av = (s.partnerAvatar || '').trim();
        var titleAv = document.getElementById('wx-title-avatar');
        var headAv = document.getElementById('partner-avatar');
        var showHead = !!s.headerAvatar;
        if (titleAv) {
            if (av && showHead) titleAv.innerHTML = '<img src="' + av + '" alt="">';
            else {
                var nm = (document.getElementById('partner-name') || {}).textContent || '?';
                titleAv.textContent = String(nm || '?').charAt(0);
            }
            titleAv.style.display = (av && showHead) ? '' : 'none';
        }
        if (headAv) {
            if (av) headAv.innerHTML = '<img src="' + av + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">';
            else headAv.innerHTML = '<i class="fas fa-user"></i>';
        }
        // 我的头像
        var my = (s.myAvatar || '').trim();
        var myEl = document.getElementById('my-avatar');
        if (myEl) {
            if (my) myEl.innerHTML = '<img src="' + my + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">';
            else if (!myEl.getAttribute('data-keep')) myEl.innerHTML = '<i class="fas fa-user"></i>';
        }
        // 消息里我方头像
        var style = document.getElementById('conv-my-avatar-style');
        if (style) style.remove();
        if (my) {
            var st = document.createElement('style');
            st.id = 'conv-my-avatar-style';
            st.textContent =
                '.message-sent .message-avatar,.message.sent .message-avatar,.message-sent .avatar{background-image:url("' + my + '");background-size:cover;background-position:center;}' +
                '.message-sent .message-avatar i,.message.sent .message-avatar i{visibility:hidden;}';
            document.head.appendChild(st);
        }
    }

    function applyInputBar(s) {
        try {
            var v = document.getElementById('wx-voice-btn');
            if (v) v.style.display = (s.voiceEnabled === false) ? 'none' : '';
            var b = document.getElementById('batch-btn');
            if (b) b.classList.toggle('conv-show', !!s.batchSend);
        } catch (e) {}
    }

    /* 自定义 CSS 加权器：把用户写的规则加上作用域前缀和 !important，
       否则会被皮肤/主题里带 !important 的规则压住，表现为"填了 CSS 没效果"。
       只处理 selector{decls} 形态；@media 等块级规则原样保留。
       scopeSel: 已包含 #chat-container 的选择器不再重复加前缀。 */
    function boostUserCss(css, scopeSel) {
        if (!css || !String(css).trim()) return '';
        var extra = [];
        var rest = String(css).replace(/([^{}]+)\{([^{}]*)\}/g, function (whole, sel, decls) {
            sel = sel.trim();
            if (!sel || sel.charAt(0) === '@') return whole; // @规则原样
            var parts = decls.split(';').map(function (d) {
                d = d.trim();
                if (!d) return '';
                if (!/!important\s*$/.test(d)) d += ' !important';
                return d;
            }).filter(Boolean).join('; ');
            if (!parts) return '';
            var scoped = sel.split(',').map(function (s0) {
                s0 = s0.trim();
                if (!s0) return '';
                /* 已经写了 #chat-container / #conv-bubble-preview 的不再加前缀 */
                if (s0.indexOf('#chat-container') >= 0 || s0.indexOf('#conv-bubble-preview') >= 0 || s0.indexOf('body') === 0) return s0;
                return scopeSel + ' ' + s0;
            }).filter(Boolean).join(',');
            if (scoped) extra.push(scoped + '{' + parts + '}');
            return '';
        });
        /* rest 里剩下的是 @media 等块级规则，原样附在后面 */
        return extra.join('\n') + (rest.trim() ? '\n' + rest.trim() : '');
    }

    function injectLiveCss(s) {
        var old = document.getElementById('conv-live-style');
        if (old) old.remove();
        var rules = [];
        var r = parseInt(s.bubbleRadius, 10);
        if (!isNaN(r)) rules.push('#chat-container .message-sent, #chat-container .message-received{border-radius:' + r + 'px !important;}');
        if (s.bubblePad) rules.push('#chat-container .message-sent, #chat-container .message-received{padding:' + s.bubblePad + ' !important;}');
        var round = parseInt(s.avatarRound, 10); if (isNaN(round)) round = 50;
        rules.push('#chat-container .message-avatar,.message .avatar,.message-avatar img{border-radius:' + round + '% !important;}');
        if (s.hideTaSticker) rules.push('.combo-tab-btn[data-tab="partner-sticker"]{display:none !important;}');
        /* 用户 CSS 注入两份：原文（尊重用户自己的优先级意图）+ 加权版（保证一定生效） */
        if (s.bubbleCss && String(s.bubbleCss).trim()) {
            rules.push(String(s.bubbleCss));
            rules.push(boostUserCss(String(s.bubbleCss), '#chat-container'));
        }
        if (!rules.length) return;
        var st = document.createElement('style');
        st.id = 'conv-live-style';
        st.textContent = rules.join('\n');
        document.head.appendChild(st);
    }

    /* 头像框：叠加在头像外圈（对方 / 我），用 ::after 蒙版 */
    function applyAvatarFrames(s) {
        var style = document.getElementById('conv-avatar-frame-style');
        if (style) style.remove();
        var my = (s.myAvatarFrame || '').trim();
        var ta = (s.partnerAvatarFrame || '').trim();
        if (!my && !ta) return;
        var rules = [];
        function ov(sel, url) {
            rules.push(sel + '{position:relative;}');
            rules.push(sel + '::after{content:"";position:absolute;inset:0;background:url("' + url + '") center/100% 100% no-repeat;border-radius:inherit;pointer-events:none;z-index:2;}');
        }
        if (ta) { ov('#partner-avatar', ta); ov('#wx-title-avatar', ta); ov('.message-received .message-avatar', ta); }
        if (my) { ov('#my-avatar', my); ov('.message-sent .message-avatar', my); }
        var st = document.createElement('style');
        st.id = 'conv-avatar-frame-style';
        st.textContent = rules.join('\n');
        document.head.appendChild(st);
    }

    /* 气泡实时预览：把当前圆角/边距/配色/自定义 CSS 作用到预览框（不污染真实聊天） */
    function updateBubblePreview(s) {
        var box = document.getElementById('conv-bubble-preview');
        if (!box) return;
        var old = document.getElementById('conv-bubble-preview-style');
        if (old) old.remove();
        var rules = [];
        var r = parseInt(s.bubbleRadius, 10); if (!isNaN(r)) rules.push('#conv-bubble-preview .message-sent,#conv-bubble-preview .message-received{border-radius:' + r + 'px !important;}');
        if (s.bubblePad) rules.push('#conv-bubble-preview .message-sent,#conv-bubble-preview .message-received{padding:' + s.bubblePad + ' !important;}');
        if (s.outBg) rules.push('#conv-bubble-preview .message-sent{background:' + s.outBg + ' !important;}');
        if (s.outInk) rules.push('#conv-bubble-preview .message-sent{color:' + s.outInk + ' !important;}');
        if (s.inBg) rules.push('#conv-bubble-preview .message-received{background:' + s.inBg + ' !important;}');
        if (s.inInk) rules.push('#conv-bubble-preview .message-received{color:' + s.inInk + ' !important;}');
        if (s.bubbleCss && String(s.bubbleCss).trim()) {
            var userCss = String(s.bubbleCss).replace(/#chat-container/g, '#conv-bubble-preview');
            rules.push(userCss);
            rules.push(boostUserCss(userCss, '#conv-bubble-preview'));
        }
        if (!rules.length) return;
        var st = document.createElement('style');
        st.id = 'conv-bubble-preview-style';
        st.textContent = rules.join('\n');
        document.head.appendChild(st);
    }

    var anchorTop = 0, scrollObs = null;
    function onUserScroll(e) {
        var c = e.target;
        if (!c || !c.classList || !(c.id === 'chat-container' || c.classList.contains('main-chat-area'))) return;
        if (e.isTrusted) anchorTop = c.scrollTop;
    }
    function setupAutoScroll(s) {
        var c = document.getElementById('chat-container') || document.querySelector('.main-chat-area');
        if (!c) return;
        if (scrollObs) { scrollObs.disconnect(); scrollObs = null; }
        c.removeEventListener('scroll', onUserScroll, true);
        if (s.autoScroll === false) {
            c.addEventListener('scroll', onUserScroll, true);
            scrollObs = new MutationObserver(function () {
                if (document.body.classList.contains('conv-no-autoscroll')) c.scrollTop = anchorTop;
            });
            anchorTop = c.scrollTop;
            scrollObs.observe(c, { childList: true, subtree: false });
        }
    }

    function setupEnterSend(s) {
        var inp = document.getElementById('message-input');
        if (!inp || inp._convEnterBound) return;
        inp._convEnterBound = true;
        inp.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            if (inp._convEnterSend === false) { e.stopPropagation(); return; }
            e.preventDefault(); e.stopPropagation();
            var btn = document.getElementById('send-btn');
            if (btn) btn.click();
        }, true);
    }

    /* 拉黑：置全局标志，core.js 的 addMessage 会据此拦截对方消息 */
    function applyBlocked() {
        var s = curSession();
        window.__CONV_BLOCKED__ = !!(s && s.blocked);
    }

    /* ---------- 面板 UI ---------- */
    var built = false, bgInput = null, avInput = null, myAvInput = null, fontInput = null, importInput = null, taFrameInput = null, myFrameInput = null;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

    function swatchesHTML(kind, name) {
        var arr = kind === 'ink' ? INK_SWATCHES : BG_SWATCHES;
        var h = '<div class="conv-swatches" data-kind="' + kind + '" data-name="' + name + '">';
        arr.forEach(function (c) {
            h += '<button class="conv-swatch" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
        });
        h += '<input type="color" class="conv-color" data-kind="' + kind + '" data-name="' + name + '" title="自定义">';
        h += '</div>';
        return h;
    }

    function build() {
        if (built) return; built = true;

        var p = document.getElementById('partner-name');
        var m = document.getElementById('my-name');
        if (p && !p.getAttribute('data-default')) p.setAttribute('data-default', (p.textContent || '').trim());
        if (m && !m.getAttribute('data-default')) m.setAttribute('data-default', (m.textContent || '').trim());

        var more = document.getElementById('chat-more-btn');
        if (more) more.addEventListener('click', openPanel);

        function mkFile(accept, handler) {
            var i = document.createElement('input');
            i.type = 'file'; i.accept = accept; i.style.display = 'none';
            i.addEventListener('change', function (e) {
                var f = e.target.files && e.target.files[0]; e.target.value = '';
                if (!f) return;
                var r = new FileReader();
                r.onload = function () { handler(r.result); };
                r.readAsDataURL(f);
            });
            document.body.appendChild(i);
            return i;
        }
        bgInput = mkFile('image/*', function (url) { getStateThen(function (st) { st.background = url; save(st); apply(st); syncUI(st); toast('背景已更新'); }); });
        /* 头像上传：唯一数据源走 Avatars，同时镜像一份到 conv（预览/导出兼容）。
           之前这里只写 st.partnerAvatar + apply()，被 Avatars 覆盖，聊天界面看不到 —— 已修。 */
        avInput = mkFile('image/*', function (url) {
            getStateThen(function (st) {
                st.partnerAvatar = url; st.headerAvatar = true;
                save(st);
                if (window.Avatars && typeof window.Avatars.set === 'function') window.Avatars.set('ta', url);
                apply(st); syncUI(st); toast('对方头像已更新');
            });
        });
        myAvInput = mkFile('image/*', function (url) {
            getStateThen(function (st) {
                st.myAvatar = url; st.showAvatar = true;
                save(st);
                if (window.Avatars && typeof window.Avatars.set === 'function') window.Avatars.set('me', url);
                apply(st); syncUI(st); toast('我的头像已更新');
            });
        });
        taFrameInput = mkFile('image/*', function (url) { getStateThen(function (st) { st.partnerAvatarFrame = url; save(st); apply(st); syncUI(st); toast('对方头像框已更新'); }); });
        myFrameInput = mkFile('image/*', function (url) { getStateThen(function (st) { st.myAvatarFrame = url; save(st); apply(st); syncUI(st); toast('我的头像框已更新'); }); });
        fontInput = mkFile('.ttf,.otf,.woff,.woff2', function (url) {
            var old = document.getElementById('wx-custom-font-style');
            if (old) old.remove();
            var stl = document.createElement('style');
            stl.id = 'wx-custom-font-style';
            stl.textContent = '@font-face{font-family:"wx-custom-font";src:url("' + url + '");font-display:swap;}';
            document.head.appendChild(stl);
            getStateThen(function (st) { st.fontFamily = 'wx-custom-font'; save(st); apply(st); syncUI(st); toast('本地字体已应用'); });
        });
        importInput = mkFile('.json,application/json', function (text) { doImport(text); });

        var mask = document.createElement('div');
        mask.id = 'conv-settings-mask';
        mask.className = 'conv-settings-mask';
        mask.innerHTML =
            '<div class="conv-settings-panel">' +
                '<div class="conv-settings-head">' +
                    '<div class="conv-settings-title"><i class="fas fa-gear"></i> 聊天设置</div>' +
                    '<div class="conv-settings-sub">仅作用于当前对话</div>' +
                    '<button class="conv-settings-close" id="conv-settings-close"><i class="fas fa-xmark"></i></button>' +
                '</div>' +
                '<div class="conv-tabs" id="conv-tabs">' +
                    '<button class="conv-tab on" data-tab="beauty">美化</button>' +
                    '<button class="conv-tab" data-tab="func">功能</button>' +
                    '<button class="conv-tab" data-tab="data">数据</button>' +
                '</div>' +
                '<div class="conv-settings-body">' +

                /* =============== 美化 =============== */
                '<div class="conv-sec" data-sec="beauty">' +
                    '<div class="conv-sec-title">头像与昵称</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">对方头像</div><div class="conv-row-desc">上传后右侧即时预览</div></div>' +
                        '<div class="conv-av-line">' +
                            '<div class="conv-av-preview" id="conv-av-preview"><i class="fas fa-user"></i></div>' +
                            '<div class="conv-bg-actions">' +
                                '<button class="conv-bg-btn" id="conv-av-up"><i class="fas fa-upload"></i> 上传</button>' +
                                '<button class="conv-bg-btn" id="conv-av-clear"><i class="fas fa-rotate-left"></i> 清除</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">我的头像</div><div class="conv-row-desc">上传后右侧即时预览</div></div>' +
                        '<div class="conv-av-line">' +
                            '<div class="conv-av-preview" id="conv-myav-preview"><i class="fas fa-user"></i></div>' +
                            '<div class="conv-bg-actions">' +
                                '<button class="conv-bg-btn" id="conv-myav-up"><i class="fas fa-upload"></i> 上传</button>' +
                                '<button class="conv-bg-btn" id="conv-myav-clear"><i class="fas fa-rotate-left"></i> 清除</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">我的头像框</div><div class="conv-row-desc">叠加在「我」的头像外圈</div></div>' +
                        '<div class="conv-bg-actions">' +
                            '<button class="conv-bg-btn" id="conv-myframe-up"><i class="fas fa-upload"></i> 上传</button>' +
                            '<button class="conv-bg-btn" id="conv-myframe-clear"><i class="fas fa-rotate-left"></i> 清除</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">对方头像框</div><div class="conv-row-desc">叠加在对方头像外圈</div></div>' +
                        '<div class="conv-bg-actions">' +
                            '<button class="conv-bg-btn" id="conv-taframe-up"><i class="fas fa-upload"></i> 上传</button>' +
                            '<button class="conv-bg-btn" id="conv-taframe-clear"><i class="fas fa-rotate-left"></i> 清除</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">备注名（对方）</div><div class="conv-row-desc">留空则使用默认昵称</div></div>' +
                        '<input class="conv-input" id="conv-ta-nick" maxlength="12" placeholder="例如：梦角">' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">我的昵称</div><div class="conv-row-desc">聊天里显示的我方名字</div></div>' +
                        '<input class="conv-input" id="conv-my-nick" maxlength="12" placeholder="例如：我">' +
                    '</div>' +

                    '<div class="conv-sec-title">背景与字体</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">聊天背景</div><div class="conv-row-desc">纯色，或本地图片</div></div>' +
                        '<div class="conv-bg-swatches" id="conv-bg-swatches"></div>' +
                        '<div class="conv-bg-actions">' +
                            '<button class="conv-bg-btn" id="conv-bg-file"><i class="fas fa-folder-open"></i> 本地图片</button>' +
                            '<button class="conv-bg-btn" id="conv-bg-clear"><i class="fas fa-rotate-left"></i> 清除</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">字体</div><div class="conv-row-desc">系统默认，或上传本地字体文件</div></div>' +
                        '<div class="conv-two-col">' +
                            '<button class="conv-box-btn" id="conv-font-default"><i class="fas fa-font"></i><span>系统默认</span></button>' +
                            '<button class="conv-box-btn" id="conv-font-up"><i class="fas fa-upload"></i><span>本地字体文件</span></button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">字号<span class="conv-font-val" id="conv-font-val">跟随系统</span></div><div class="conv-row-desc">拖动调节聊天文字大小</div></div>' +
                        '<input type="range" min="12" max="26" step="1" class="conv-font-range" id="conv-font-range">' +
                    '</div>' +

                    '<div class="conv-sec-title">气泡</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">气泡圆角<span class="conv-font-val" id="conv-radius-val">14px</span></div><div class="conv-row-desc">拖动微调</div></div>' +
                        '<input type="range" min="0" max="40" step="1" class="conv-font-range" id="conv-radius-range">' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">气泡边距</div><div class="conv-row-desc">气泡内文字的留白</div></div>' +
                        '<div class="conv-font-pills" id="conv-pad-pills"></div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">气泡与文字颜色</div><div class="conv-row-desc">四种配色收纳在此，点开后选色</div></div>' +
                        '<button class="conv-fold-btn" id="conv-color-toggle"><i class="fas fa-palette"></i> 展开选色<i class="fas fa-chevron-down conv-fold-arrow"></i></button>' +
                        '<div class="conv-color-box" id="conv-color-box" style="display:none">' +
                            '<div class="conv-color-line"><span>我的气泡</span>' + swatchesHTML('bg', 'outBg') + '</div>' +
                            '<div class="conv-color-line"><span>我的文字</span>' + swatchesHTML('ink', 'outInk') + '</div>' +
                            '<div class="conv-color-line"><span>对方气泡</span>' + swatchesHTML('bg', 'inBg') + '</div>' +
                            '<div class="conv-color-line"><span>对方文字</span>' + swatchesHTML('ink', 'inInk') + '</div>' +
                            '<div class="conv-bg-actions"><button class="conv-bg-btn" id="conv-color-reset"><i class="fas fa-rotate-left"></i> 恢复默认配色</button></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">头像形状</div><div class="conv-row-desc">下方滑块可自由调节圆角</div></div>' +
                        '<div class="conv-seg" id="conv-avshape-seg">' +
                            '<button data-v="circle" class="on">圆形</button>' +
                            '<button data-v="square">方形</button>' +
                        '</div>' +
                        '<input type="range" min="0" max="50" step="1" class="conv-font-range" id="conv-avround-range">' +
                        '<div class="conv-range-hint">圆角 <span class="conv-font-val" id="conv-avround-val">50%</span></div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">自定义气泡 CSS</div><div class="conv-row-desc">边写边看效果（实时预览）</div></div>' +
                        '<textarea class="conv-textarea" id="conv-bubble-css" rows="4" placeholder="例：#chat-container .message-sent{box-shadow:none;}"></textarea>' +
                        '<div class="conv-bg-actions">' +
                            '<button class="conv-bg-btn" id="conv-css-apply"><i class="fas fa-check"></i> 应用</button>' +
                            '<button class="conv-bg-btn" id="conv-css-clear"><i class="fas fa-eraser"></i> 清除</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="conv-sec-title">实时预览</div>' +
                    '<div class="conv-bubble-preview" id="conv-bubble-preview">' +
                        '<div class="bp-row"><div class="bp-bubble message-received">在干嘛呀？刚看到你发的朋友圈～</div></div>' +
                        '<div class="bp-row me"><div class="bp-bubble message-sent">我也刚想找你！要不要一起听首歌 🎵</div></div>' +
                    '</div>' +
                '</div>' +

                /* =============== 功能 =============== */
                '<div class="conv-sec" data-sec="func" style="display:none">' +
                    '<div class="conv-sec-title">消息显示</div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">显示头像</div><div class="conv-row-desc">对方消息左侧显示头像</div></div>' +
                        '<div class="conv-switch" id="conv-avatar-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">顶栏头像</div><div class="conv-row-desc">开启后顶栏才显示对方头像，默认只显示名字</div></div>' +
                        '<div class="conv-switch" id="conv-header-avatar-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">自动滚动</div><div class="conv-row-desc">收到新消息时自动滚到底部</div></div>' +
                        '<div class="conv-switch" id="conv-scroll-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-sec-title">输入与发送</div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">回车发送</div><div class="conv-row-desc">关闭后回车用于换行</div></div>' +
                        '<div class="conv-switch" id="conv-enter-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">批量发送</div><div class="conv-row-desc">在输入栏显示批量发送按钮</div></div>' +
                        '<div class="conv-switch" id="conv-batch-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">语音输入</div><div class="conv-row-desc">在输入栏显示语音按钮</div></div>' +
                        '<div class="conv-switch" id="conv-voice-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">隐藏对方表情包</div><div class="conv-row-desc">表情面板只显示我的表情包</div></div>' +
                        '<div class="conv-switch" id="conv-tasticker-sw"><div class="conv-knob"></div></div></div>' +
                '</div>' +

                /* =============== 数据 =============== */
                '<div class="conv-sec" data-sec="data" style="display:none">' +
                    '<div class="conv-sec-title">对方回复速度</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">最快回复</div><div class="conv-row-desc">1–600 秒</div></div>' +
                        '<div class="conv-num-row"><input type="number" class="conv-num" id="conv-delay-min" min="1" max="600" step="1" inputmode="numeric" placeholder="3"><span class="conv-num-unit">秒</span></div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">最慢回复</div><div class="conv-row-desc">1–600 秒，需大于最快</div></div>' +
                        '<div class="conv-num-row"><input type="number" class="conv-num" id="conv-delay-max" min="1" max="600" step="1" inputmode="numeric" placeholder="7"><span class="conv-num-unit">秒</span></div>' +
                    '</div>' +

                    '<div class="conv-sec-title">已读不回</div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">开启已读不回</div><div class="conv-row-desc">对方有一定概率看了不回</div></div>' +
                        '<div class="conv-switch" id="conv-rnr-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">不回概率</div></div>' +
                        '<div class="conv-num-row"><input type="number" class="conv-num" id="conv-rnr-range" min="0" max="100" step="1" inputmode="numeric" placeholder="20"><span class="conv-num-unit">%</span></div>' +
                    '</div>' +

                    '<div class="conv-sec-title">主动发消息</div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">对方主动发消息</div><div class="conv-row-desc">开启后对方会定时主动来找你</div></div>' +
                        '<div class="conv-switch" id="conv-auto-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">最短发信息间隔</div><div class="conv-row-desc">分钟，随机区间下限</div></div>' +
                        '<div class="conv-num-row"><input type="number" class="conv-num" id="conv-auto-min" min="1" max="1440" step="1" inputmode="numeric" placeholder="3"><span class="conv-num-unit">分钟</span></div>' +
                    '</div>' +
                    '<div class="conv-row conv-row-col">' +
                        '<div class="conv-row-main"><div class="conv-row-title">最长发信息间隔</div><div class="conv-row-desc">分钟，随机区间上限</div></div>' +
                        '<div class="conv-num-row"><input type="number" class="conv-num" id="conv-auto-max" min="1" max="1440" step="1" inputmode="numeric" placeholder="10"><span class="conv-num-unit">分钟</span></div>' +
                    '</div>' +

                    '<div class="conv-sec-title">输入中提示</div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">显示「对方正在输入」</div><div class="conv-row-desc">对方回复前在语音键上方滚动三点提示</div></div>' +
                        '<div class="conv-switch" id="conv-typing-sw"><div class="conv-knob"></div></div></div>' +

                    '<div class="conv-sec-title">联系人</div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">置顶聊天</div></div>' +
                        '<div class="conv-switch" id="conv-pin-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">消息免打扰</div></div>' +
                        '<div class="conv-switch" id="conv-mute-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">拉黑联系人</div><div class="conv-row-desc">拉黑后对方无法再发消息给你</div></div>' +
                        '<div class="conv-switch" id="conv-block-sw"><div class="conv-knob"></div></div></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title conv-danger">删除联系人</div><div class="conv-row-desc">连同该会话的聊天记录一起删除</div></div>' +
                        '<button class="conv-bg-btn conv-danger" id="conv-del-contact"><i class="fas fa-user-slash"></i> 删除</button></div>' +

                    '<div class="conv-sec-title">聊天记录</div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">导出聊天记录</div><div class="conv-row-desc">导出为 JSON 文件</div></div>' +
                        '<button class="conv-bg-btn" id="conv-export"><i class="fas fa-download"></i> 导出</button></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title">导入聊天记录</div><div class="conv-row-desc">选择之前导出的 JSON</div></div>' +
                        '<button class="conv-bg-btn" id="conv-import"><i class="fas fa-upload"></i> 导入</button></div>' +
                    '<div class="conv-row"><div class="conv-row-main"><div class="conv-row-title conv-danger">删除全部聊天记录</div><div class="conv-row-desc">不可恢复，请先导出备份</div></div>' +
                        '<button class="conv-bg-btn conv-danger" id="conv-clear-msgs"><i class="fas fa-trash"></i> 删除</button></div>' +
                '</div>' +

                '</div>' +
                '<div class="conv-settings-foot"><button class="conv-reset" id="conv-settings-reset">恢复默认</button></div>' +
            '</div>';
        document.body.appendChild(mask);

        /* ---- 动态生成的小控件 ---- */
        var sw = mask.querySelector('#conv-bg-swatches');
        BG_PRESETS.forEach(function (preset) {
            var b = document.createElement('button');
            b.className = 'conv-bg-dot'; b.setAttribute('data-v', preset.key); b.title = preset.label;
            if (preset.val) b.style.background = preset.val; else b.classList.add('conv-bg-dot-none');
            sw.appendChild(b);
        });
        var ppp = mask.querySelector('#conv-pad-pills');
        BUBBLE_PADS.forEach(function (o) {
            var b = document.createElement('button');
            b.className = 'conv-font-pill'; b.setAttribute('data-p', o.val); b.textContent = o.label;
            b.addEventListener('click', function () { getStateThen(function (st) { st.bubblePad = o.val; save(st); apply(st); syncUI(st); }); });
            ppp.appendChild(b);
        });

        /* ---- tab 切换 ---- */
        mask.querySelector('#conv-tabs').addEventListener('click', function (e) {
            var t = e.target.closest('.conv-tab'); if (!t) return;
            mask.querySelectorAll('.conv-tab').forEach(function (x) { x.classList.remove('on'); });
            t.classList.add('on');
            var name = t.getAttribute('data-tab');
            mask.querySelectorAll('.conv-sec').forEach(function (sec) {
                sec.style.display = (sec.getAttribute('data-sec') === name) ? '' : 'none';
            });
        });

        mask.querySelector('#conv-settings-close').addEventListener('click', closePanel);
        mask.addEventListener('click', function (e) { if (e.target === mask) closePanel(); });

        /* ---- 美化：头像 / 背景 / 字体 ---- */
        mask.querySelector('#conv-av-up').addEventListener('click', function () { avInput.click(); });
        mask.querySelector('#conv-myav-up').addEventListener('click', function () { myAvInput.click(); });
        mask.querySelector('#conv-av-clear').addEventListener('click', function () {
            getStateThen(function (st) { st.partnerAvatar = ''; save(st); if (window.Avatars) window.Avatars.set('ta', ''); apply(st); syncUI(st); });
        });
        mask.querySelector('#conv-myav-clear').addEventListener('click', function () {
            getStateThen(function (st) { st.myAvatar = ''; save(st); if (window.Avatars) window.Avatars.set('me', ''); apply(st); syncUI(st); });
        });
        /* 头像框：上传 / 清除 */
        mask.querySelector('#conv-myframe-up').addEventListener('click', function () { myFrameInput.click(); });
        mask.querySelector('#conv-taframe-up').addEventListener('click', function () { taFrameInput.click(); });
        mask.querySelector('#conv-myframe-clear').addEventListener('click', function () {
            getStateThen(function (st) { st.myAvatarFrame = ''; save(st); apply(st); syncUI(st); });
        });
        mask.querySelector('#conv-taframe-clear').addEventListener('click', function () {
            getStateThen(function (st) { st.partnerAvatarFrame = ''; save(st); apply(st); syncUI(st); });
        });

        mask.querySelector('#conv-bg-swatches').addEventListener('click', function (e) {
            var d = e.target.closest('.conv-bg-dot'); if (!d) return;
            var key = d.getAttribute('data-v');
            var preset = BG_PRESETS.filter(function (x) { return x.key === key; })[0];
            getStateThen(function (st) { st.background = preset ? preset.val : ''; save(st); apply(st); syncUI(st); });
        });
        mask.querySelector('#conv-bg-file').addEventListener('click', function () { bgInput.click(); });
        mask.querySelector('#conv-bg-clear').addEventListener('click', function () {
            getStateThen(function (s) { s.background = ''; save(s); apply(s); syncUI(s); });
        });

        /* 字体：两个等宽框 */
        mask.querySelector('#conv-font-default').addEventListener('click', function () {
            var old = document.getElementById('wx-custom-font-style'); if (old) old.remove();
            getStateThen(function (st) { st.fontFamily = ''; save(st); apply(st); syncUI(st); toast('已恢复系统默认字体'); });
        });
        mask.querySelector('#conv-font-up').addEventListener('click', function () { fontInput.click(); });

        /* 滑块：字号 / 圆角 / 头像圆角 */
        mask.querySelector('#conv-font-range').addEventListener('input', function () {
            var v = parseInt(this.value, 10);
            getStateThen(function (st) { st.fontSizePx = v; save(st); apply(st); syncUI(st); });
        });
        mask.querySelector('#conv-radius-range').addEventListener('input', function () {
            var v = parseInt(this.value, 10);
            getStateThen(function (st) { st.bubbleRadius = v; save(st); apply(st); syncUI(st); });
        });
        mask.querySelector('#conv-avround-range').addEventListener('input', function () {
            var v = parseInt(this.value, 10);
            getStateThen(function (st) {
                st.avatarRound = v;
                st.avatarShape = v >= 45 ? 'circle' : 'square';
                save(st); apply(st); syncUI(st);
            });
        });

        /* 头像形状 */
        mask.querySelector('#conv-avshape-seg').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            var v = b.getAttribute('data-v');
            getStateThen(function (st) {
                st.avatarShape = v;
                st.avatarRound = (v === 'circle') ? 50 : 8;
                save(st); apply(st); syncUI(st);
            });
        });

        /* 配色收纳：展开 / 收起 + 选色 */
        mask.querySelector('#conv-color-toggle').addEventListener('click', function () {
            var box = mask.querySelector('#conv-color-box');
            if (!box) return;
            var on = box.style.display !== 'none';
            box.style.display = on ? 'none' : '';
            this.classList.toggle('open', !on);
        });
        mask.querySelectorAll('.conv-swatches').forEach(function (wrap) {
            var name = wrap.getAttribute('data-name');
            wrap.addEventListener('click', function (e) {
                var b = e.target.closest('.conv-swatch'); if (!b) return;
                var c = b.getAttribute('data-c');
                getStateThen(function (st) { st[name] = c; save(st); apply(st); syncUI(st); });
            });
            var ci = wrap.querySelector('.conv-color');
            if (ci) ci.addEventListener('input', function () {
                var c = ci.value;
                getStateThen(function (st) { st[name] = c; save(st); apply(st); syncUI(st); });
            });
        });
        mask.querySelector('#conv-color-reset').addEventListener('click', function () {
            getStateThen(function (st) { st.outBg = ''; st.outInk = ''; st.inBg = ''; st.inInk = ''; save(st); apply(st); syncUI(st); toast('配色已恢复默认'); });
        });

        /* 自定义 CSS：实时预览 + 应用 / 清除 */
        var cssTa = mask.querySelector('#conv-bubble-css');
        var cssTimer = null;
        cssTa.addEventListener('input', function () {
            var v = this.value;
            clearTimeout(cssTimer);
            cssTimer = setTimeout(function () {
                getStateThen(function (st) { st.bubbleCss = v; save(st); apply(st); updateBubblePreview(st); });
            }, 250);
        });
        mask.querySelector('#conv-css-apply').addEventListener('click', function () {
            var v = cssTa.value;
            getStateThen(function (st) { st.bubbleCss = v; save(st); apply(st); updateBubblePreview(st); toast('自定义 CSS 已应用'); });
        });
        mask.querySelector('#conv-css-clear').addEventListener('click', function () {
            cssTa.value = '';
            getStateThen(function (st) { st.bubbleCss = ''; save(st); apply(st); updateBubblePreview(st); toast('自定义 CSS 已清除'); });
        });

        /* 昵称 */
        function bindInput(id, key) {
            var inp = mask.querySelector(id);
            var t = null;
            inp.addEventListener('input', function () {
                var v = this.value;
                clearTimeout(t);
                t = setTimeout(function () { getStateThen(function (s) { s[key] = v.trim(); save(s); apply(s); }); }, 300);
            });
        }
        bindInput('#conv-ta-nick', 'taNickname');
        bindInput('#conv-my-nick', 'myNickname');

        /* ---- 功能：开关 ---- */
        var toggles = [
            ['#conv-avatar-sw', 'showAvatar'], ['#conv-header-avatar-sw', 'headerAvatar'],
            ['#conv-scroll-sw', 'autoScroll'], ['#conv-enter-sw', 'enterSend'],
            ['#conv-batch-sw', 'batchSend'], ['#conv-voice-sw', 'voiceEnabled'],
            ['#conv-tasticker-sw', 'hideTaSticker']
        ];
        toggles.forEach(function (t) {
            var el = mask.querySelector(t[0]); if (!el) return;
            el.addEventListener('click', function () {
                getStateThen(function (s) {
                    s[t[1]] = !s[t[1]];
                    save(s); apply(s); syncUI(s);
                    if (t[1] === 'enterSend') {
                        var inp = document.getElementById('message-input');
                        if (inp) inp._convEnterSend = (s.enterSend !== false);
                    }
                });
            });
        });

        /* ---- 数据：回复速度 / 已读不回 / 主动发消息 / 输入中 ---- */
        var dMin = mask.querySelector('#conv-delay-min');
        var dMax = mask.querySelector('#conv-delay-max');
        function clampDelayInput(inp) {
            var v = parseInt(inp.value, 10);
            if (isNaN(v)) return;
            v = Math.max(1, Math.min(600, v));
            inp.value = v;
        }
        function pushDelay() {
            clampDelayInput(dMin); clampDelayInput(dMax);
            var a = parseInt(dMin.value, 10) || 1;
            var b = parseInt(dMax.value, 10) || a;
            if (a > b) { b = a; dMax.value = b; }
            coreSet({ replyDelayMin: a * 1000, replyDelayMax: b * 1000 });
        }
        dMin.addEventListener('change', pushDelay);
        dMax.addEventListener('change', pushDelay);

        var rnrRange = mask.querySelector('#conv-rnr-range');
        rnrRange.addEventListener('change', function () {
            var v = parseInt(this.value, 10);
            if (isNaN(v)) v = 0;
            v = Math.max(0, Math.min(100, v));
            this.value = v;
            coreSet({ readNoReplyChance: v / 100 });
        });
        mask.querySelector('#conv-rnr-sw').addEventListener('click', function () {
            var on = !coreGet('allowReadNoReply', false);
            coreSet({ allowReadNoReply: on });
            this.classList.toggle('on', on);
            toast(on ? '已读不回已开启' : '已读不回已关闭');
        });

        var autoMin = mask.querySelector('#conv-auto-min');
        var autoMax = mask.querySelector('#conv-auto-max');
        function pushAuto() {
            var a = parseInt(autoMin.value, 10) || 1;
            var b = parseInt(autoMax.value, 10) || a;
            if (a > b) { b = a; autoMax.value = b; }
            // 区间随机：存 min/max，同时保留旧 autoSendInterval 兼容
            coreSet({ autoSendIntervalMin: a, autoSendIntervalMax: b, autoSendInterval: a });
            if (typeof setupAutoSend === 'function') { try { setupAutoSend(); } catch (e) {} }
        }
        autoMin.addEventListener('change', pushAuto);
        autoMax.addEventListener('change', pushAuto);
        mask.querySelector('#conv-auto-sw').addEventListener('click', function () {
            var on = !coreGet('autoSendEnabled', false);
            coreSet({ autoSendEnabled: on });
            this.classList.toggle('on', on);
            if (typeof setupAutoSend === 'function') { try { setupAutoSend(); } catch (e) {} }
            toast(on ? '对方会主动找你聊天' : '已关闭主动发消息');
        });

        mask.querySelector('#conv-typing-sw').addEventListener('click', function () {
            var on = !coreGet('typingIndicatorEnabled', true);
            coreSet({ typingIndicatorEnabled: on });
            this.classList.toggle('on', on);
            toast(on ? '对方输入中提示已开启' : '对方输入中提示已关闭');
        });

        /* ---- 数据：联系人操作 ---- */
        function toggleSessionField(field, label) {
            var s = curSession();
            if (!s) { toast('当前会话不在列表里'); return; }
            s[field] = !s[field];
            saveSessionList();
            if (field === 'blocked') applyBlocked();
            syncUI(cache || def());
            toast(label + (s[field] ? '已开启' : '已关闭'));
        }
        mask.querySelector('#conv-pin-sw').addEventListener('click', function () { toggleSessionField('pinned', '置顶'); });
        mask.querySelector('#conv-mute-sw').addEventListener('click', function () { toggleSessionField('muted', '免打扰'); });
        mask.querySelector('#conv-block-sw').addEventListener('click', function () { toggleSessionField('blocked', '拉黑'); });
        mask.querySelector('#conv-del-contact').addEventListener('click', function () {
            var s = curSession();
            if (!s) { toast('当前会话不在列表里'); return; }
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList) && sessionList.length <= 1) { toast('至少保留一个联系人'); return; }
            if (!confirm('删除联系人「' + (s.name || '未命名') + '」及其全部聊天记录？不可恢复')) return;
            var id = s.id;
            (async function () {
                try {
                    sessionList = sessionList.filter(function (x) { return x.id !== id; });
                    var p = (typeof APP_PREFIX !== 'undefined' && APP_PREFIX) ? APP_PREFIX : 'CHAT_APP_V3_';
                    var keys = await localforage.keys();
                    await Promise.all(keys.filter(function (k) { return k.indexOf(p + id + '_') === 0; }).map(function (k) { return localforage.removeItem(k); }));
                    await localforage.setItem(p + 'sessionList', sessionList);
                    var next = sessionList[0].id;
                    SESSION_ID = next;
                    await localforage.setItem(p + 'lastSessionId', next);
                    history.replaceState(null, '', '#' + next);
                    if (typeof loadData === 'function') await loadData();
                    try { displayedMessageCount = 20; } catch (e) {}
                    if (typeof renderMessages === 'function') renderMessages();
                    saveSessionList();
                    apply(cache || def());
                    closePanel();
                    toast('联系人已删除');
                } catch (e) { toast('删除失败'); }
            })();
        });

        /* ---- 数据：导出 / 导入 / 清空 ---- */
        mask.querySelector('#conv-export').addEventListener('click', doExport);
        mask.querySelector('#conv-import').addEventListener('click', function () { importInput.click(); });
        mask.querySelector('#conv-clear-msgs').addEventListener('click', function () {
            if (!confirm('删除当前对话的全部聊天记录？不可恢复')) return;
            try {
                messages = [];
                if (typeof saveData === 'function') saveData();
                if (typeof renderMessages === 'function') renderMessages();
                toast('聊天记录已清空');
            } catch (e) { toast('清空失败'); }
        });

        /* ---- 恢复默认 ---- */
        mask.querySelector('#conv-settings-reset').addEventListener('click', function () {
            if (!confirm('把当前对话的所有聊天设置恢复默认？')) return;
            var s = def(); save(s); apply(s); syncUI(s); toast('已恢复默认');
        });

        /* 初值 */
        getStateThen(syncUI);
    }

    function doExport() {
        try {
            var list = (typeof messages !== 'undefined' && Array.isArray(messages)) ? messages : [];
            var payload = { exportedAt: Date.now(), sessionId: (typeof SESSION_ID !== 'undefined' ? SESSION_ID : ''), messages: list };
            var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'chat-' + (payload.sessionId || 'export') + '-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            toast('已导出 ' + list.length + ' 条消息');
        } catch (e) { toast('导出失败'); }
    }

    function doImport(text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { toast('文件不是合法 JSON'); return; }
        var list = Array.isArray(data) ? data : (data && Array.isArray(data.messages) ? data.messages : null);
        if (!list) { toast('文件里没有消息数据'); return; }
        if (!confirm('导入 ' + list.length + ' 条消息并覆盖当前对话？')) return;
        try {
            messages = list.map(function (m) { return Object.assign({}, m, { timestamp: new Date(m.timestamp) }); });
            if (typeof saveData === 'function') saveData();
            if (typeof renderMessages === 'function') renderMessages();
            toast('已导入 ' + list.length + ' 条消息');
        } catch (e) { toast('导入失败'); }
    }

    function getStateThen(cb) {
        var r = load();
        if (r && typeof r.then === 'function') r.then(cb).catch(function () { cb(def()); });
        else cb(r || def());
    }

    function syncUI(s) {
        var mask = document.getElementById('conv-settings-mask');
        if (!mask) return;
        s = s || def();

        /* 头像预览 */
        function setPrev(id, url) {
            var box = document.getElementById(id); if (!box) return;
            if (url) box.innerHTML = '<img src="' + url + '" alt="">';
            else box.innerHTML = '<i class="fas fa-user"></i>';
        }
        setPrev('conv-av-preview', s.partnerAvatar);
        setPrev('conv-myav-preview', s.myAvatar);

        mask.querySelectorAll('#conv-avshape-seg button').forEach(function (b) {
            b.classList.toggle('on', b.getAttribute('data-v') === (s.avatarShape || 'circle'));
        });
        mask.querySelector('#conv-avatar-sw').classList.toggle('on', !!s.showAvatar);
        mask.querySelector('#conv-header-avatar-sw').classList.toggle('on', !!s.headerAvatar);
        mask.querySelector('#conv-scroll-sw').classList.toggle('on', s.autoScroll !== false);
        mask.querySelector('#conv-enter-sw').classList.toggle('on', s.enterSend !== false);
        mask.querySelector('#conv-batch-sw').classList.toggle('on', !!s.batchSend);
        mask.querySelector('#conv-voice-sw').classList.toggle('on', s.voiceEnabled !== false);
        mask.querySelector('#conv-tasticker-sw').classList.toggle('on', !!s.hideTaSticker);
        var taN = mask.querySelector('#conv-ta-nick'); if (taN && document.activeElement !== taN) taN.value = s.taNickname || '';
        var myN = mask.querySelector('#conv-my-nick'); if (myN && document.activeElement !== myN) myN.value = s.myNickname || '';
        var cssTa = mask.querySelector('#conv-bubble-css'); if (cssTa && document.activeElement !== cssTa) cssTa.value = s.bubbleCss || '';
        updateBubblePreview(s);

        var px = parseInt(s.fontSizePx, 10);
        var range = mask.querySelector('#conv-font-range');
        var valEl = document.getElementById('conv-font-val');
        if (range) range.value = (px >= 12 && px <= 26) ? px : 15;
        if (valEl) valEl.textContent = (px >= 12 && px <= 30) ? (px + 'px') : '跟随系统';

        var r = parseInt(s.bubbleRadius, 10); if (isNaN(r)) r = 14;
        var rrange = mask.querySelector('#conv-radius-range');
        var rval = document.getElementById('conv-radius-val');
        if (rrange) rrange.value = r;
        if (rval) rval.textContent = r + 'px';
        mask.querySelectorAll('#conv-pad-pills button').forEach(function (b) {
            b.classList.toggle('on', b.getAttribute('data-p') === (s.bubblePad || '11px 14px'));
        });

        var round = parseInt(s.avatarRound, 10); if (isNaN(round)) round = 50;
        var ar = mask.querySelector('#conv-avround-range'); if (ar) ar.value = round;
        var arv = document.getElementById('conv-avround-val'); if (arv) arv.textContent = round + '%';

        mask.querySelectorAll('#conv-bg-swatches .conv-bg-dot').forEach(function (dot) {
            var key = dot.getAttribute('data-v');
            var preset = BG_PRESETS.filter(function (x) { return x.key === key; })[0];
            dot.classList.toggle('on', (s.background || '') === (preset ? preset.val : ''));
        });
        mask.querySelectorAll('.conv-swatches').forEach(function (wrap) {
            var name = wrap.getAttribute('data-name');
            var cur = s[name] || '';
            wrap.querySelectorAll('.conv-swatch').forEach(function (b) {
                b.classList.toggle('on', (b.getAttribute('data-c') || '').toLowerCase() === String(cur).toLowerCase());
            });
            var ci = wrap.querySelector('.conv-color');
            if (ci && /^#[0-9a-f]{6}$/i.test(cur)) ci.value = cur;
        });

        /* 数据区：核心设置 */
        var dMin = mask.querySelector('#conv-delay-min'), dMax = mask.querySelector('#conv-delay-max');
        var mn = Math.round(coreGet('replyDelayMin', 3000) / 1000), mx = Math.round(coreGet('replyDelayMax', 7000) / 1000);
        if (mn < 1) mn = 1; if (mx < mn) mx = mn;
        if (dMin) dMin.value = mn;
        if (dMax) dMax.value = mx;

        var rnrOn = !!coreGet('allowReadNoReply', false);
        var rnrSw = mask.querySelector('#conv-rnr-sw'); if (rnrSw) rnrSw.classList.toggle('on', rnrOn);
        var chance = Math.round((coreGet('readNoReplyChance', 0.2) || 0) * 100);
        var rr = mask.querySelector('#conv-rnr-range'); if (rr) rr.value = chance;

        var autoOn = !!coreGet('autoSendEnabled', false);
        var as = mask.querySelector('#conv-auto-sw'); if (as) as.classList.toggle('on', autoOn);
        var aMin = coreGet('autoSendIntervalMin', coreGet('autoSendInterval', 5) || 5);
        var aMax = coreGet('autoSendIntervalMax', aMin);
        var amin = mask.querySelector('#conv-auto-min'); if (amin) amin.value = aMin;
        var amax = mask.querySelector('#conv-auto-max'); if (amax) amax.value = aMax;

        var typeOn = coreGet('typingIndicatorEnabled', true);
        var tsw = mask.querySelector('#conv-typing-sw'); if (tsw) tsw.classList.toggle('on', !!typeOn);

        /* 联系人 */
        var cs = curSession();
        var pin = mask.querySelector('#conv-pin-sw'); if (pin) pin.classList.toggle('on', !!(cs && cs.pinned));
        var mute = mask.querySelector('#conv-mute-sw'); if (mute) mute.classList.toggle('on', !!(cs && cs.muted));
        var blk = mask.querySelector('#conv-block-sw'); if (blk) blk.classList.toggle('on', !!(cs && cs.blocked));
    }

    function openPanel() {
        build();
        cache = null;                 // 打开前强制重读，避免拿到过期缓存
        getStateThen(function (s) {
            apply(s); syncUI(s);
            var mask = document.getElementById('conv-settings-mask');
            if (mask) mask.classList.add('show');
        });
    }
    function closePanel() { var mask = document.getElementById('conv-settings-mask'); if (mask) mask.classList.remove('show'); }

    function toast(msg) {
        try { if (typeof showNotification === 'function') { showNotification(msg, 'info', 1200); return; } } catch (e) {}
        var t = document.getElementById('cc-toast');
        if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
        t.textContent = msg; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
        clearTimeout(t._timer); t._timer = setTimeout(function () { t.className = 'cc-toast'; }, 1500);
    }

    function boot() {
        build();
        getStateThen(function (s) {
            apply(s);
            setupEnterSend(s);
            var inp = document.getElementById('message-input');
            if (inp) inp._convEnterSend = (s.enterSend !== false);
        });
        // core.js 的 loadData() 是异步的，跑完后再套用一次，避免被核心默认值覆盖
        var retries = [400, 1200, 2500];
        retries.forEach(function (ms) {
            setTimeout(function () {
                cache = null;
                getStateThen(function (s) { apply(s); setupEnterSend(s); });
            }, ms);
        });
    }
    if (window.whenSessionReady) window.whenSessionReady(boot);
    else if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot);

    window.ChatConvSettings = {
        open: openPanel, close: closePanel,
        apply: function () { cache = null; getStateThen(apply); },
        setTaNick: function (name) {
            getStateThen(function (s) { s.taNickname = (name || '').trim(); save(s); apply(s); });
        },
        /* 头像唯一写入口：全部委托给 Avatars（全局唯一数据源）。
           「我」的头像全局唯一；「对方」头像挂联系人（sessionList）条目上，
           天然按联系人隔离。conv 字段仅作镜像保留（导出/备份兼容）。 */
        getAvatar: function (who) {
            try { if (window.Avatars) { var v = window.Avatars.get(who === 'me' ? 'me' : 'ta'); if (v) return v; } } catch (e) {}
            var s = cache;
            if (!s) {
                try {
                    if (typeof settings !== 'undefined' && settings && settings.conv && settings.conv.__conv === true) {
                        s = fromRaw(settings);
                        cache = s;
                    }
                } catch (e) {}
            }
            if (!s) return '';
            return who === 'me' ? (s.myAvatar || '') : (s.partnerAvatar || '');
        },
        setAvatar: function (who, src) {
            try {
                if (window.Avatars && typeof window.Avatars.set === 'function') {
                    window.Avatars.set(who === 'me' ? 'me' : 'ta', src);
                }
            } catch (e) {}
            /* conv 镜像同步写一份，旧数据链路（导出/恢复默认等）不炸 */
            try {
                var s = cache;
                if (!s) {
                    if (typeof settings !== 'undefined' && settings && settings.conv && settings.conv.__conv === true) {
                        s = fromRaw(settings);
                    } else {
                        s = def();
                    }
                }
                if (who === 'me') { s.myAvatar = src || ''; if (src) s.showAvatar = true; }
                else { s.partnerAvatar = src || ''; if (src) s.headerAvatar = true; }
                cache = s;
                save(s);
                /* 注意：不要再调 apply()——applyAvatars 会走 Avatars.applyToDom 重画，
                   这里只同步 UI 面板；真实 DOM 已由 Avatars.refresh() 刷过 */
                try { if (typeof syncUI === 'function') syncUI(s); } catch (e) {}
            } catch (e) {}
        },
        isBlocked: function () { return !!window.__CONV_BLOCKED__; }
    };
})();
