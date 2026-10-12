/* ============================================================
   朋友圈  moments.js   （Twitter / X 风格 · 重写版）
   ------------------------------------------------------------
   结构：
     · 顶栏：返回 · X 标 · 设置
     · 身份页签：动态（混排首页） / 我 / TA
     · 主页头部（Twitter profile header）：
         封面 → 大头像 → 昵称 + @handle → 简介 → 地点·加入时间
         → 动态数 / 获赞数 → 「编辑资料 / 发帖」
     · 粘性 Tab：帖子 · 媒体 · 喜欢 · 收藏 （我的主页多一个 访客）
     · 推文卡片：头像 / 昵称 · @handle · 时间 / 正文 / 媒体 /
         聊天截图引用卡 / 操作条（回复 · 转推 · 喜欢 · 浏览 · 收藏）
         / 展开后的回复串（线程线 + 内联回复框）
     · 全屏发布页（字数计数 280）· 编辑资料页 · 设置页 · 图片查看器
   数据：moments / momentsCfg / momentsProf / momentsVisits / momentsNext
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'moments', CFGK = 'momentsCfg', PROFK = 'momentsProf',
        VISK = 'momentsVisits', NEXTK = 'momentsNext', SEEDK = 'momentsSeeded';

    var list = [];
    var owner = 'all';              // 'all' | 'me' | 'ta'
    var tab = 'posts';              // 'posts' | 'media' | 'likes' | 'favs' | 'visits'
    var openIds = {};               // 展开回复的帖子
    var replyTo = null;             // 正在回复的帖子 id
    var draft = { imgs: [], stickers: [], text: '', who: 'me' };
    var cfg = null, prof = null, visits = [];
    var nextPostAt = 0;

    var modal = null, scrollEl = null, feedEl = null, headEl = null, tabEl = null,
        barTitle = null, segEl = null, fabEl = null;
    var composeEl = null, cTa = null, cPrev = null, cCnt = null, cWhoLbl = null;
    var editEl = null, cfgEl = null, viewerEl = null, built = false, tickTimer = null;

    var AMP = '&';
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, AMP + 'amp;').replace(/</g, AMP + 'lt;')
            .replace(/>/g, AMP + 'gt;').replace(/"/g, AMP + 'quot;')
            .replace(/'/g, '&#39;');
    }
    function notify(m, t) {
        try { if (typeof showNotification === 'function') showNotification(m, t || 'info', 1700); } catch (e) {}
    }
    function skey(k) {
        try { return (typeof getStorageKey === 'function') ? getStorageKey(k) : (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX + k : k); } catch (e) { return k; }
    }
    function rnd(a, b) { a = +a || 0; b = +b || 0; if (a > b) { var t = a; a = b; b = t; } return a + Math.floor(Math.random() * (b - a + 1)); }
    function chance(p) { return Math.random() * 100 < (+p || 0); }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function byTsDesc(a, b) { return (b.ts || 0) - (a.ts || 0); }

    /* ---------------- 身份 ---------------- */
    function myName() {
        try { var e = document.getElementById('my-name'); if (e && e.textContent.trim()) return e.textContent.trim(); } catch (x) {}
        try { return settings.myName || '我'; } catch (x) { return '我'; }
    }
    function taName() {
        try { var e = document.getElementById('partner-name'); if (e && e.textContent.trim()) return e.textContent.trim(); } catch (x) {}
        try { return settings.partnerName || '对方'; } catch (x) { return '对方'; }
    }
    function nameOf(who) { return who === 'me' ? myName() : taName(); }

    /* @handle：默认由昵称推出，可在「编辑资料」改 */
    function defHandle(who) {
        var n = nameOf(who);
        var a = (String(n).match(/[A-Za-z0-9_]+/g) || []).join('');
        if (a) return '@' + a.toLowerCase();
        var h = 0;
        for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
        return '@' + (who === 'me' ? 'me' : 'ta') + h.toString(36).slice(0, 4);
    }
    function handleOf(who) {
        if (prof && prof[who] && prof[who].handle) return prof[who].handle;
        return defHandle(who);
    }

    /* 头像多源回退：DOM → chatSettings.conv → settings */
    function avOf(who) {
        var key = who === 'me' ? 'myAvatar' : 'partnerAvatar';
        try {
            var el = document.getElementById(who === 'me' ? 'my-avatar' : 'partner-avatar');
            if (el) {
                var bg = getComputedStyle(el).backgroundImage || '';
                var m = bg.match(/url\(["']?(.*?)["']?\)/);
                if (m && m[1] && m[1] !== 'none') return m[1];
                var im = el.querySelector('img');
                if (im && im.src) return im.src;
            }
        } catch (e) {}
        try { if (window.settings && settings.conv && settings.conv[key]) return settings.conv[key]; } catch (e) {}
        try { if (window.settings && settings[key]) return settings[key]; } catch (e) {}
        return '';
    }
    function avHtml(who, cls, override) {
        var a = override || avOf(who);
        return '<div class="tw-av ' + (cls || '') + '"' + (a ? ' style="background-image:url(' + esc(a) + ')"' : '') + '>' +
               (a ? '' : '<i class="fas fa-user"></i>') + '</div>';
    }

    /* ---------------- 素材池 ---------------- */
    function cards() {
        try {
            if (typeof customReplies !== 'undefined' && customReplies && customReplies.length) {
                return customReplies.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
            }
        } catch (e) {}
        try { if (window._customReplies && window._customReplies.length) return window._customReplies.map(String).filter(Boolean); } catch (e) {}
        return ['今天也想你多一点', '刚刚看到一朵很像你的云', '天气很好，适合想你', '在忙，但心里给你留了位置'];
    }
    function stickers() {
        var out = [];
        try { if (typeof stickerLibrary !== 'undefined' && stickerLibrary && stickerLibrary.length) out = out.concat(stickerLibrary); } catch (e) {}
        try { if (typeof myStickerLibrary !== 'undefined' && myStickerLibrary && myStickerLibrary.length) out = out.concat(myStickerLibrary); } catch (e) {}
        return out;
    }
    var KAOMOJI = ['(｡･ω･｡)ﾉ♡', '(๑>ᴗ<๑)', '(*/ω＼*)', '( ˘ ³˘)♥', '(灬ºωº灬)', '(´･ω･`)', '(つ´ω`)つ', '(*´∀`)~♥', '(｡♥‿♥｡)', 'ヽ(♡‿♡)ノ'];
    var EMOJI = ['💗', '🌙', '☁️', '🍓', '🐰', '✨', '🌷', '🍮', '🧸', '💌', '🌈', '🫧'];
    var PLACES = ['家里', '公司', '路上', '窗外', '咖啡店', '公园', '海边', '图书馆'];

    /* ---------------- 存储 ---------------- */
    function norm(p) {
        p.likes = Array.isArray(p.likes) ? p.likes : [];
        p.comments = Array.isArray(p.comments) ? p.comments : [];
        p.rt = Array.isArray(p.rt) ? p.rt : [];
        p.imgs = Array.isArray(p.imgs) ? p.imgs : [];
        p.stickers = Array.isArray(p.stickers) ? p.stickers : [];
        p.myFav = !!p.myFav; p.taFav = !!p.taFav;
        if (typeof p.views !== 'number') p.views = rnd(3, 40);
        return p;
    }
    function load() {
        try {
            var v = localforage.getItem(skey(KEY));
            if (v && v.then) v.then(function (r) {
                if (Array.isArray(r)) { list = r.map(norm); }
                seedIfEmpty();
                render();
            }).catch(function () {});
        } catch (e) {}
    }
    function save() { try { localforage.setItem(skey(KEY), list).catch(function () {}); } catch (e) {} }

    function loadCfg() {
        var d = {
            en: 1,
            gapMin: 60, gapMax: 720,
            dailyMin: 1, dailyMax: 5,
            cardMin: 1, cardMax: 3,
            likeProb: 70, likeMin: 30, likeMax: 300,
            cmtProb: 55, cmtMin: 60, cmtMax: 600,
            replyProb: 85, replyMin: 20, replyMax: 180,
            rtProb: 45,
            favProb: 25, rejectProb: 30, signProb: 25,
            swCut: 1, swImage: 1, swSticker: 0, swKaomoji: 1, swEmoji: 1
        };
        try {
            var raw = localStorage.getItem(skey(CFGK));
            if (raw) {
                var o = JSON.parse(raw);
                if (o && typeof o === 'object') {
                    for (var k in d) if (o[k] !== undefined) d[k] = o[k];
                    if (o.swEmoji === undefined && o.emoji !== undefined) d.swEmoji = o.emoji > 0 ? 1 : 0;
                    if (o.swKaomoji === undefined && o.kaomoji !== undefined) d.swKaomoji = o.kaomoji > 0 ? 1 : 0;
                    if (o.swSticker === undefined && o.sticker !== undefined) d.swSticker = o.sticker > 0 ? 1 : 0;
                    if (o.swImage === undefined && o.image !== undefined) d.swImage = o.image > 0 ? 1 : 0;
                    if (o.swCut === undefined && o.cutProb !== undefined) d.swCut = o.cutProb > 0 ? 1 : 0;
                }
            }
        } catch (e) {}
        cfg = d;
        return d;
    }
    function saveCfg() { try { localStorage.setItem(skey(CFGK), JSON.stringify(cfg)); } catch (e) {} }

    function loadProf() {
        var d = {
            me: { banner: '', sign: '', handle: '', loc: '', join: 0, pool: [] },
            ta: { banner: '', sign: '', handle: '', loc: '', join: 0, pool: ['今天也想你多一点', '我在呢', '别熬夜', '想和你一起吃饭'] }
        };
        try {
            var raw = localStorage.getItem(skey(PROFK));
            if (raw) {
                var o = JSON.parse(raw);
                if (o && o.me) for (var k in d.me) if (o.me[k] !== undefined) d.me[k] = o.me[k];
                if (o && o.ta) for (var k2 in d.ta) if (o.ta[k2] !== undefined) d.ta[k2] = o.ta[k2];
            }
        } catch (e) {}
        if (!d.me.join) d.me.join = Date.now() - rnd(200, 900) * 86400000;
        if (!d.ta.join) d.ta.join = Date.now() - rnd(120, 800) * 86400000;
        if (!d.me.loc) d.me.loc = '家里';
        if (!d.ta.loc) d.ta.loc = '窗外';
        prof = d;
        return d;
    }
    function saveProf() { try { localStorage.setItem(skey(PROFK), JSON.stringify(prof)); } catch (e) {} }
    window.renderProf = function () { try { loadProf(); if (modal) { renderHead(); render(); } } catch (e) {} };

    function loadVisits() {
        visits = [];
        try { var raw = localStorage.getItem(skey(VISK)); if (raw) { var a = JSON.parse(raw); if (Array.isArray(a)) visits = a; } } catch (e) {}
    }
    function saveVisits() { try { localStorage.setItem(skey(VISK), JSON.stringify(visits.slice(-200))); } catch (e) {} }
    function addVisit(who, target, action, sneak) {
        if (who !== 'ta') return;
        visits.push({ who: who, name: nameOf(who), ts: Date.now(), target: target, action: action || 'view', sneak: !!sneak });
        saveVisits();
    }
    function loadNext() { nextPostAt = 0; try { nextPostAt = +(localStorage.getItem(skey(NEXTK)) || 0) || 0; } catch (e) {} }
    function saveNext() { try { localStorage.setItem(skey(NEXTK), String(nextPostAt)); } catch (e) {} }

    /* ---------------- 时间 ---------------- */
    function fmtTime(ts) {
        var d = new Date(ts), now = new Date();
        var s = Math.floor((now - d) / 1000);
        if (s < 60) return '刚刚';
        if (s < 3600) return Math.floor(s / 60) + ' 分钟';
        if (s < 86400) return Math.floor(s / 3600) + ' 小时';
        if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
    function fmtFull(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
            ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    function fmtJoin(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
    }
    function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

    /* ---------------- 内容生成 ---------------- */
    function genText() {
        var pool = cards();
        var n = rnd(cfg.cardMin, cfg.cardMax);
        var out = [];
        for (var i = 0; i < n && pool.length; i++) out.push(pick(pool));
        var t = out.join('\n');
        if (cfg.swEmoji && chance(60)) t += ' ' + pick(EMOJI);
        if (cfg.swKaomoji && chance(50)) t += ' ' + pick(KAOMOJI);
        return t.trim();
    }
    function genMedia() {
        var imgs = [], stk = [];
        if (window.Album && cfg.swImage && chance(60)) { try { imgs = window.Album.random(rnd(1, 3)); } catch (e) {} }
        var sp = stickers();
        if (sp.length && cfg.swSticker && chance(50)) {
            var k = rnd(1, 2);
            while (stk.length < k && sp.length) stk.push(pick(sp));
        }
        return { imgs: imgs, stickers: stk };
    }
    function chatCut() {
        var lines = [];
        try {
            var ms = (typeof messages !== 'undefined' && messages) ? messages : [];
            var recent = ms.slice(-14).filter(function (m) { return m && (m.content || m.text); });
            if (!recent.length) return null;
            var start = Math.max(0, recent.length - rnd(2, 4));
            recent.slice(start).forEach(function (m) {
                var who = (m.role === 'user' || m.isMe || m.sender === 'me') ? 'me' : 'ta';
                var tx = String(m.content || m.text || '');
                if (tx && tx.length > 60) tx = tx.slice(0, 60) + '…';
                lines.push({ who: who, name: nameOf(who), avatar: avOf(who), text: tx });
            });
        } catch (e) {}
        return lines.length ? lines : null;
    }
    function mkPost(o) {
        return norm({
            id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            who: o.who, name: nameOf(o.who), avatar: avOf(o.who),
            text: o.text || '', imgs: o.imgs || [], stickers: o.stickers || [],
            vid: o.vid || null, cut: o.cut || null, ts: Date.now(),
            loc: o.loc || '', likes: [], comments: [], rt: [],
            myFav: false, taFav: false, views: rnd(3, 40)
        });
    }
    function taPost(forceCut) {
        var cut = null;
        if (forceCut || (cfg.swCut && chance(25))) cut = chatCut();
        var text = cut ? '' : genText();
        if (!text && !cut) text = genText() || '今天也很想你';
        var md = genMedia();
        var p = mkPost({ who: 'ta', text: text, imgs: md.imgs, stickers: md.stickers, vid: null, cut: cut, loc: chance(40) ? pick(PLACES) : '' });
        list.push(p);
        save();
        if (isOpen()) render();
        notify(taName() + ' 发了一条动态', 'info');
        return p;
    }
    function seedIfEmpty() {
        try {
            if (localStorage.getItem(skey(SEEDK))) return;
            localStorage.setItem(skey(SEEDK), '1');
        } catch (e) {}
        if (list.length) return;
        var now = Date.now();
        var H = 3600000;
        var seeds = [
            { who: 'ta', text: genText(), ts: now - H * 5, loc: '家里' },
            { who: 'me', text: '今天也要好好吃饭', ts: now - H * 9, loc: '' },
            { who: 'ta', text: genText(), ts: now - H * 26, loc: '窗外' }
        ];
        var sp = stickers();
        seeds.forEach(function (s, i) {
            var p = mkPost({ who: s.who, text: s.text, loc: s.loc });
            p.id = 'seed_' + i;
            p.ts = s.ts;
            try { p.imgs = (window.Album && chance(70)) ? window.Album.random(i === 2 ? 2 : 1) : []; } catch (e) { p.imgs = []; }
            p.views = rnd(5, 60);
            if (i === 1) p.likes = [{ who: 'ta', name: taName(), ts: s.ts + 60000 }];
            if (s.who === 'ta' && chance(50)) p.comments = [{ id: 'sc_' + i, who: 'me', name: myName(), text: '嗯嗯', ts: s.ts + 90000 }];
            list.push(p);
        });
        if (sp.length && list[0]) list[0].stickers = [pick(sp)];
        save();
    }

    /* ---------------- 自动互动 ---------------- */
    function taLike(p) {
        if (!p) return;
        p.likes = p.likes || [];
        if (p.likes.some(function (l) { return l.who === 'ta'; })) return;
        p.likes.push({ who: 'ta', name: taName(), ts: Date.now() });
        addVisit('ta', 'me', 'like');
        save(); if (isOpen()) render();
    }
    function taComment(p, text) {
        if (!p) return;
        p.comments = p.comments || [];
        p.comments.push({
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            who: 'ta', name: taName(), text: text || genText().split('\n')[0], ts: Date.now()
        });
        addVisit('ta', 'me', 'comment');
        save(); if (isOpen()) render();
    }
    function taRetweet(p) {
        if (!p) return;
        p.rt = p.rt || [];
        if (p.rt.some(function (r) { return r.who === 'ta'; })) return;
        p.rt.push({ who: 'ta', name: taName(), ts: Date.now() });
        addVisit('ta', 'me', 'rt');
        save(); if (isOpen()) render();
        notify(taName() + ' 转推了你的动态', 'info');
    }
    function taFav(p) {
        if (!p || p.taFav) return;
        p.taFav = true; save(); if (isOpen()) render();
        notify(taName() + ' 收藏了你的动态', 'info');
    }
    function onMyNewPost(p) {
        if (!cfg.en) return;
        if (chance(cfg.likeProb)) setTimeout(function () { taLike(p); }, rnd(cfg.likeMin, cfg.likeMax) * 1000);
        if (chance(cfg.rtProb)) setTimeout(function () { taRetweet(p); }, rnd(cfg.likeMin, cfg.likeMax) * 1000);
        if (chance(cfg.cmtProb)) {
            setTimeout(function () {
                taComment(p);
                if (chance(cfg.favProb)) setTimeout(function () { taFav(p); }, rnd(30, 300) * 1000);
            }, rnd(cfg.cmtMin, cfg.cmtMax) * 1000);
        } else if (chance(cfg.favProb)) {
            setTimeout(function () { taFav(p); }, rnd(cfg.likeMin, cfg.likeMax) * 1000);
        }
    }
    function onMyComment(p) {
        if (!cfg.en || !p) return;
        if (!chance(cfg.replyProb)) return;
        var chain = (p.comments || []).filter(function (c) { return c.who === 'ta'; }).length;
        if (chain >= 10) return;
        setTimeout(function () { taComment(p); }, rnd(cfg.replyMin, cfg.replyMax) * 1000);
    }

    /* ---------------- 调度 ---------------- */
    function dailyCount(who) {
        var k = dayKey(Date.now());
        return list.filter(function (p) { return p.who === who && dayKey(p.ts) === k; }).length;
    }
    function scheduleNext() { nextPostAt = Date.now() + rnd(cfg.gapMin, cfg.gapMax) * 60000; saveNext(); }
    function tomorrowStart() {
        var d = new Date(); d.setHours(24, 0, 0, 0);
        return d.getTime() + rnd(cfg.gapMin, Math.max(cfg.gapMin, 120)) * 60000;
    }
    function tick() {
        if (!cfg || !cfg.en) return;
        var now = Date.now();
        if (!nextPostAt) { scheduleNext(); return; }
        if (now < nextPostAt) return;
        if (dailyCount('ta') >= cfg.dailyMax) { nextPostAt = tomorrowStart(); saveNext(); return; }
        var need = rnd(cfg.dailyMin, cfg.dailyMax);
        if (dailyCount('ta') < need) taPost();
        nextPostAt = now + rnd(cfg.gapMin, cfg.gapMax) * 60000;
        saveNext();
        if (prof.ta.pool.length && chance(cfg.signProb)) {
            prof.ta.sign = pick(prof.ta.pool);
            saveProf(); if (isOpen()) renderHead();
        }
        if (chance(40)) addVisit('ta', 'me', 'view', Math.random() < 0.03);
    }

    /* ============================================================
       视图
       ============================================================ */
    function isOpen() { return !!(modal && modal.style.display !== 'none'); }
    function find(id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
    function hasMedia(p) { return !!(p.imgs.length || p.stickers.length || p.vid || p.cut); }

    function tabsFor() {
        if (owner === 'me') return [['posts', '帖子'], ['media', '媒体'], ['likes', '喜欢'], ['favs', '收藏'], ['visits', '访客']];
        return [['posts', '帖子'], ['media', '媒体'], ['likes', '喜欢'], ['favs', '收藏']];
    }
    function items() {
        var arr = list.slice().sort(byTsDesc);
        if (tab === 'visits') return [];
        var likedBy = function (p, w) { return (p.likes || []).some(function (l) { return l.who === w; }); };
        var favedBy = function (p, w) { return w === 'me' ? !!p.myFav : !!p.taFav; };
        if (owner === 'all') {
            if (tab === 'posts') return arr;
            if (tab === 'media') return arr.filter(hasMedia);
            if (tab === 'likes') return arr.filter(function (p) { return (p.likes || []).length; });
            return arr.filter(function (p) { return p.myFav || p.taFav; });
        }
        var w = owner;
        if (tab === 'posts') return arr.filter(function (p) { return p.who === w; });
        if (tab === 'media') return arr.filter(function (p) { return p.who === w && hasMedia(p); });
        if (tab === 'likes') return arr.filter(function (p) { return likedBy(p, w); });
        return arr.filter(function (p) { return favedBy(p, w); });
    }
    function counterOf(who) {
        var mine = list.filter(function (p) { return p.who === who; });
        var likes = 0;
        mine.forEach(function (p) { likes += (p.likes || []).length + (p.rt || []).length; });
        return { posts: mine.length, likes: likes };
    }

    /* ---------- 主页头部 ---------- */
    function renderHead() {
        if (!headEl) return;
        var h = '';
        if (owner === 'all') {
            var c1 = counterOf('me'), c2 = counterOf('ta');
            h =
                '<div class="tw-homehead">' +
                    '<div class="tw-homehead-hi">朋友圈</div>' +
                    '<div class="tw-homehead-sub">' + esc(myName()) + ' &amp; ' + esc(taName()) + ' 的动态</div>' +
                    '<div class="tw-homehead-stats">' +
                        '<span><b>' + (c1.posts + c2.posts) + '</b> 条动态</span>' +
                        '<span><b>' + (c1.likes + c2.likes) + '</b> 次喜欢</span>' +
                    '</div>' +
                '</div>';
        } else {
            var who = owner;
            var p = prof[who];
            var c = counterOf(who);
            var banner = p.banner
                ? ' style="background-image:url(' + esc(p.banner) + ')"'
                : '';
            h =
                '<div class="tw-hero">' +
                    '<div class="tw-banner' + (p.banner ? ' has' : '') + '"' + banner + '>' +
                        '<button class="tw-banner-btn" data-banner="1" title="更换封面"><i class="fas fa-image"></i></button>' +
                    '</div>' +
                    '<div class="tw-hero-row">' +
                        '<div class="tw-hero-av">' + avHtml(who, 'xl') + '</div>' +
                        '<div class="tw-hero-btns">' +
                            '<button class="tw-btn ghost" data-editprof="1"><i class="fas fa-pen"></i> 编辑资料</button>' +
                            '<button class="tw-btn solid" data-new="' + who + '"><i class="fas fa-feather-pointed"></i> 发帖</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tw-hero-info">' +
                        '<div class="tw-hero-name">' + esc(nameOf(who)) + '</div>' +
                        '<div class="tw-hero-handle" data-edithandle="1" title="点击修改">' + esc(handleOf(who)) + '</div>' +
                        (p.sign ? '<div class="tw-hero-bio" data-editsign="1">' + esc(p.sign) + '</div>'
                                : '<div class="tw-hero-bio empty" data-editsign="1">点击添加简介</div>') +
                        '<div class="tw-hero-meta">' +
                            '<span><i class="fas fa-location-dot"></i>' + esc(p.loc || '未知') + '</span>' +
                            '<span><i class="fas fa-calendar"></i>' + fmtJoin(p.join) + ' 加入</span>' +
                        '</div>' +
                        '<div class="tw-hero-counts">' +
                            '<span><b>' + c.posts + '</b> 动态</span>' +
                            '<span><b>' + c.likes + '</b> 获赞</span>' +
                            (who === 'me' ? '<span><b>' + visits.length + '</b> 访客</span>' : '') +
                        '</div>' +
                    '</div>' +
                '</div>';
        }
        headEl.innerHTML = h;
        if (barTitle) barTitle.textContent = owner === 'all' ? '朋友圈' : nameOf(owner);
    }

    function renderTabs() {
        if (!tabEl) return;
        var ts = tabsFor();
        if (!ts.some(function (x) { return x[0] === tab; })) tab = 'posts';
        tabEl.innerHTML = ts.map(function (t) {
            return '<button class="tw-tab' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('');
    }

    /* ---------- 媒体 / 聊天截图 ---------- */
    function mediaHtml(p) {
        var all = [];
        (p.imgs || []).forEach(function (s) { all.push({ src: s, kind: 'img' }); });
        (p.stickers || []).forEach(function (s) { all.push({ src: s, kind: 'stk' }); });
        if (p.vid) all.push({ src: '', kind: 'vid', url: p.vid.url || '' });
        if (!all.length) return '';
        var n = Math.min(all.length, 4);
        var h = '<div class="tw-media n' + n + '">';
        for (var i = 0; i < n; i++) {
            var m = all[i];
            var more = (i === n - 1 && all.length > 4) ? '<span class="tw-media-more">+' + (all.length - 4) + '</span>' : '';
            if (m.kind === 'vid') h += '<div class="tw-mi vid"><video src="' + esc(m.url) + '" muted></video>' + more + '</div>';
            else h += '<div class="tw-mi' + (m.kind === 'stk' ? ' stk' : '') + '" data-pv="' + esc(m.src) + '" style="background-image:url(' + esc(m.src) + ')">' + more + '</div>';
        }
        return h + '</div>';
    }
    function cutHtml(cut) {
        if (!cut || !cut.length) return '';
        return '<div class="tw-quote">' +
            '<div class="tw-quote-hd"><i class="fas fa-comment-dots"></i>聊天记录</div>' +
            '<div class="tw-quote-bd">' + cut.map(function (l) {
                return '<div class="tw-ql ' + l.who + '">' +
                    '<span class="tw-ql-av" ' + (l.avatar ? 'style="background-image:url(' + esc(l.avatar) + ')"' : '') + '></span>' +
                    '<span class="tw-ql-t">' + esc(l.text) + '</span></div>';
            }).join('') + '</div></div>';
    }

    /* ---------- 回复串 ---------- */
    function repliesHtml(p) {
        var cs = p.comments || [];
        var w = (owner === 'all') ? p.who : owner;
        var h = '<div class="tw-thread">';
        cs.forEach(function (c) {
            h += '<div class="tw-reply">' +
                '<div class="tw-thread-line"></div>' +
                avHtml(c.who, 'sm') +
                '<div class="tw-reply-main">' +
                    '<div class="tw-hd">' +
                        '<span class="tw-name">' + esc(c.name || nameOf(c.who)) + '</span>' +
                        '<span class="tw-hd-handle">' + esc(handleOf(c.who)) + '</span>' +
                        '<span class="tw-dot">·</span><span class="tw-time">' + esc(fmtTime(c.ts)) + '</span>' +
                    '</div>' +
                    '<div class="tw-text sm">' + esc(c.text) + '</div>' +
                '</div></div>';
        });
        h += '<div class="tw-replybox">' +
                '<div class="tw-thread-line"></div>' +
                avHtml(w, 'sm') +
                '<input class="tw-reply-input" data-replyinput="' + p.id + '" placeholder="发布你的回复" value="' +
                    (replyTo === p.id ? esc(draft.text) : '') + '">' +
                '<button class="tw-reply-send' + (replyTo === p.id && draft.text.trim() ? ' on' : '') + '" data-replysend="' + p.id + '">回复</button>' +
             '</div>';
        return h + '</div>';
    }

    /* ---------- 单条推文 ---------- */
    function postHtml(p) {
        var viewAs = (owner === 'all') ? null : owner;
        var liked = viewAs ? (p.likes || []).some(function (l) { return l.who === viewAs; }) : false;
        var rted = viewAs ? (p.rt || []).some(function (r) { return r.who === viewAs; }) : false;
        var faved = viewAs === 'me' ? !!p.myFav : (viewAs === 'ta' ? !!p.taFav : (p.myFav || p.taFav));
        var open = !!openIds[p.id];
        var isMine = p.who === 'me';
        var rl = (p.rt || []);
        var h = '<article class="tw-post' + (open ? ' open' : '') + '" data-post="' + p.id + '">';
        if (rl.length) {
            h += '<div class="tw-rtline"><i class="fas fa-retweet"></i>' +
                (viewAs && rl.some(function (r) { return r.who === viewAs; }) ? '你转推了' : esc(rl[rl.length - 1].name) + ' 转推了') +
                '</div>';
        }
        h += '<div class="tw-pg">' + avHtml(p.who) +
            '<div class="tw-main">' +
                '<div class="tw-hd">' +
                    '<span class="tw-name">' + esc(p.name || nameOf(p.who)) + '</span>' +
                    '<span class="tw-hd-handle">' + esc(handleOf(p.who)) + '</span>' +
                    (p.loc ? '<span class="tw-pass">· ' + esc(p.loc) + '</span>' : '') +
                    '<span class="tw-dot">·</span><span class="tw-time" title="' + esc(fmtFull(p.ts)) + '">' + esc(fmtTime(p.ts)) + '</span>' +
                    (isMine ? '<span class="tw-more" data-del="' + p.id + '" title="删除"><i class="fas fa-ellipsis"></i></span>' : '') +
                '</div>' +
                (p.text ? '<div class="tw-text">' + esc(p.text).replace(/\n/g, '<br>') + '</div>' : '') +
                mediaHtml(p) +
                cutHtml(p.cut) +
                '<div class="tw-acts">' +
                    '<span class="tw-act" data-reply="' + p.id + '" title="回复"><i class="far fa-comment"></i><b>' + (p.comments || []).length + '</b></span>' +
                    '<span class="tw-act rt' + (rted ? ' on' : '') + '" data-rt="' + p.id + '" title="转推"><i class="fas fa-retweet"></i><b>' + rl.length + '</b></span>' +
                    '<span class="tw-act like' + (liked ? ' on' : '') + '" data-like="' + p.id + '" title="喜欢"><i class="' + (liked ? 'fas' : 'far') + ' fa-heart"></i><b>' + (p.likes || []).length + '</b></span>' +
                    '<span class="tw-act views" title="浏览"><i class="fas fa-chart-simple"></i><b>' + (p.views || 0) + '</b></span>' +
                    '<span class="tw-act bm' + (faved ? ' on' : '') + '" data-fav="' + p.id + '" title="收藏"><i class="' + (faved ? 'fas' : 'far') + ' fa-bookmark"></i></span>' +
                '</div>' +
                (open ? repliesHtml(p) : '') +
            '</div></div></article>';
        return h;
    }

    function visitsHtml() {
        if (!visits.length) return emptyHtml('fa-eye', '还没有访客记录', 'TA 来看你的时候会记在这里');
        return '<div class="tw-visits">' + visits.slice().reverse().map(function (v) {
            var act = v.action === 'like' ? '喜欢了你的动态' : v.action === 'comment' ? '评论了你的动态' : v.action === 'rt' ? '转推了你的动态' : '看了你的主页';
            var ic = v.action === 'like' ? 'fa-heart' : v.action === 'comment' ? 'fa-comment' : v.action === 'rt' ? 'fa-retweet' : 'fa-eye';
            return '<div class="tw-visit' + (v.sneak ? ' sneak' : '') + '">' +
                '<i class="fas ' + ic + '"></i>' +
                '<div class="tw-visit-main"><b>' + esc(v.name || taName()) + '</b> ' + act +
                    (v.sneak ? '<span class="tw-sneak">悄悄</span>' : '') + '</div>' +
                '<span class="tw-visit-t">' + esc(fmtTime(v.ts)) + '</span></div>';
        }).join('') + '</div>';
    }
    function emptyHtml(ic, t, s) {
        return '<div class="tw-empty"><i class="fas ' + ic + '"></i><div class="tw-empty-t">' + esc(t) + '</div>' +
            (s ? '<div class="tw-empty-s">' + esc(s) + '</div>' : '') + '</div>';
    }

    function renderFeed() {
        if (!feedEl) return;
        var h;
        if (tab === 'visits') h = visitsHtml();
        else {
            var arr = items();
            if (arr.length) h = arr.map(postHtml).join('');
            else {
                var em = {
                    posts: ['fa-feather-pointed', '还没有动态', owner === 'all' ? '点右下角，写下第一条' : '要不要给 TA 留一句？'],
                    media: ['fa-image', '还没有媒体', '带图片或表情包的动态会出现在这里'],
                    likes: ['fa-heart', '还没有喜欢', '点亮的红心会收集在这里'],
                    favs: ['fa-bookmark', '还没有收藏', '书签过的动态会出现在这里']
                }[tab] || ['fa-inbox', '这里还没有内容', ''];
                h = emptyHtml(em[0], em[1], em[2]);
            }
        }
        feedEl.innerHTML = h;
        if (segEl) Array.prototype.forEach.call(segEl.querySelectorAll('[data-owner]'), function (b) {
            b.classList.toggle('on', b.getAttribute('data-owner') === owner);
        });
        if (fabEl) fabEl.style.display = (tab === 'visits') ? 'none' : '';
    }

    function render() {
        if (!modal) return;
        if (segEl) {
            var bA = segEl.querySelector('[data-owner="all"]'),
                bM = segEl.querySelector('[data-owner="me"]'),
                bT = segEl.querySelector('[data-owner="ta"]');
            if (bA) bA.textContent = '动态';
            if (bM) bM.textContent = myName();
            if (bT) bT.textContent = taName();
        }
        renderHead(); renderTabs(); renderFeed();
    }

    /* ============================================================
       互动
       ============================================================ */
    function toggleLike(id, el) {
        var p = find(id); if (!p) return;
        var who = (owner === 'all') ? 'me' : owner;
        p.likes = p.likes || [];
        var i = -1;
        for (var k = 0; k < p.likes.length; k++) if (p.likes[k].who === who) { i = k; break; }
        if (i >= 0) p.likes.splice(i, 1);
        else p.likes.push({ who: who, name: nameOf(who), ts: Date.now() });
        save();
        if (el) el.classList.add('pop');
        render();
    }
    function toggleRt(id) {
        var p = find(id); if (!p) return;
        var who = (owner === 'all') ? 'me' : owner;
        p.rt = p.rt || [];
        var i = -1;
        for (var k = 0; k < p.rt.length; k++) if (p.rt[k].who === who) { i = k; break; }
        if (i >= 0) p.rt.splice(i, 1);
        else p.rt.push({ who: who, name: nameOf(who), ts: Date.now() });
        save(); render();
    }
    function toggleFav(id) {
        var p = find(id); if (!p) return;
        var who = (owner === 'all') ? 'me' : owner;
        if (who === 'me') p.myFav = !p.myFav; else p.taFav = !p.taFav;
        save(); render();
        notify((who === 'me' ? p.myFav : p.taFav) ? '已加入收藏' : '已取消收藏', 'info');
    }
    function addComment(id, text) {
        var p = find(id); if (!p || !text.trim()) return;
        var who = (owner === 'all') ? 'me' : owner;
        p.comments = p.comments || [];
        p.comments.push({
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            who: who, name: nameOf(who), text: text.trim(), ts: Date.now()
        });
        openIds[id] = true;
        replyTo = null; draft.text = '';
        save(); render();
        if (p.who === 'ta' && who === 'me') onMyComment(p);
    }
    function del(id) {
        var p = find(id); if (!p) return;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) { list.splice(i, 1); break; }
        save(); render();
        notify('已删除', 'info');
    }

    /* ============================================================
       发布页
       ============================================================ */
    function openCompose(who) {
        draft = { imgs: [], stickers: [], text: '', who: who === 'ta' ? 'ta' : 'me' };
        if (cWhoLbl) cWhoLbl.textContent = draft.who === 'me' ? '我的主页' : (taName() + ' 的主页');
        var cav = composeEl && composeEl.querySelector('.tw-cav');
        if (cav) {
            var a = avOf(draft.who);
            cav.style.backgroundImage = a ? 'url(' + a + ')' : '';
            cav.innerHTML = a ? '' : '<i class="fas fa-user"></i>';
        }
        if (cTa) cTa.value = '';
        renderCPrev();
        if (composeEl) composeEl.classList.add('show');
        setTimeout(function () { if (cTa) cTa.focus(); }, 160);
    }
    function closeCompose() { if (composeEl) composeEl.classList.remove('show'); }
    function renderCPrev() {
        if (!cPrev) return;
        var h = '';
        draft.imgs.forEach(function (src, i) {
            h += '<div class="tw-cpi" style="background-image:url(' + esc(src) + ')"><span data-rmi="' + i + '"><i class="fas fa-xmark"></i></span></div>';
        });
        draft.stickers.forEach(function (src, i) {
            h += '<div class="tw-cpi" style="background-image:url(' + esc(src) + ')"><span data-rms="' + i + '"><i class="fas fa-xmark"></i></span></div>';
        });
        cPrev.innerHTML = h;
        cPrev.style.display = h ? '' : 'none';
        if (cCnt) {
            var n = (cTa ? cTa.value.length : 0);
            cCnt.textContent = n + '/280';
            cCnt.classList.toggle('over', n > 280);
        }
        var btn = composeEl && composeEl.querySelector('[data-pub]');
        if (btn) btn.classList.toggle('off', !draft.text.trim() && !draft.imgs.length && !draft.stickers.length);
    }
    function publish() {
        var text = cTa ? cTa.value.trim() : '';
        if (!text && !draft.imgs.length && !draft.stickers.length) { notify('写点什么或选张图', 'warning'); return; }
        if (text.length > 280) { notify('超出 280 字了', 'warning'); return; }
        var p = mkPost({ who: draft.who, text: text, imgs: draft.imgs.slice(), stickers: draft.stickers.slice() });
        list.push(p);
        save();
        closeCompose();
        owner = p.who; tab = 'posts';
        render();
        if (scrollEl) scrollEl.scrollTop = 0;
        notify('已发布', 'success');
        if (p.who === 'me') onMyNewPost(p);
    }
    function insertText(s) {
        if (!cTa) return;
        cTa.value = cTa.value ? (cTa.value.replace(/\s*$/, '') + ' ' + s) : s;
        renderCPrev();
    }
    function pickSticker() {
        var sp = stickers();
        if (!sp.length) { notify('表情库是空的，先去字卡库添加', 'info'); return; }
        var box = document.createElement('div');
        box.className = 'tw-stkpick';
        box.innerHTML = '<div class="tw-stkbox"><div class="tw-stkhd">选表情包<span class="tw-stkx"><i class="fas fa-xmark"></i></span></div>' +
            '<div class="tw-stkgrid">' + sp.slice(0, 120).map(function (s, i) {
                return '<div class="tw-stk" data-sk="' + i + '"><img src="' + esc(s) + '" alt=""></div>';
            }).join('') + '</div></div>';
        document.body.appendChild(box);
        box.addEventListener('click', function (e) {
            if (e.target === box || e.target.closest('.tw-stkx')) { box.remove(); return; }
            var c = e.target.closest('[data-sk]');
            if (c) { draft.stickers.push(sp[+c.getAttribute('data-sk')]); renderCPrev(); box.remove(); }
        });
    }
    function pickImage() {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.addEventListener('change', function (e) {
            var fs = Array.prototype.slice.call(e.target.files || []);
            if (!fs.length) { inp.remove(); return; }
            var left = fs.length;
            fs.forEach(function (f) {
                var done = function (src) {
                    if (src) draft.imgs.push(src);
                    if (--left <= 0) { renderCPrev(); inp.remove(); }
                };
                try {
                    if (typeof compressImageSmart === 'function') compressImageSmart(f, 0.7, 1400).then(done).catch(function () { done(''); });
                    else {
                        var r = new FileReader();
                        r.onload = function (ev) { done(ev.target.result); };
                        r.onerror = function () { done(''); };
                        r.readAsDataURL(f);
                    }
                } catch (x) { done(''); }
            });
        });
        inp.click();
    }

    /* ============================================================
       编辑资料页
       ============================================================ */
    function openEdit() {
        var who = owner === 'ta' ? 'ta' : 'me';
        var p = prof[who];
        if (!editEl) return;
        editEl.dataset.who = who;
        var b = editEl.querySelector('#tw-eb-banner');
        b.style.backgroundImage = p.banner ? 'url(' + p.banner + ')' : '';
        b.classList.toggle('has', !!p.banner);
        editEl.querySelector('#tw-eb-name').textContent = nameOf(who);
        editEl.querySelector('#tw-eb-av').innerHTML = avHtml(who);
        editEl.querySelector('#tw-eb-handle').value = handleOf(who);
        editEl.querySelector('#tw-eb-sign').value = p.sign || '';
        editEl.querySelector('#tw-eb-loc').value = p.loc || '';
        editEl.classList.add('show');
    }
    function closeEdit() { if (editEl) editEl.classList.remove('show'); }
    function saveEdit() {
        var who = editEl.dataset.who || 'me';
        var h = editEl.querySelector('#tw-eb-handle').value.trim();
        var s = editEl.querySelector('#tw-eb-sign').value.trim();
        var l = editEl.querySelector('#tw-eb-loc').value.trim();
        if (who === 'ta' && s !== (prof.ta.sign || '') && chance(cfg.rejectProb)) {
            notify(taName() + ' 拒绝了：「' + (prof.ta.sign || '现在这个') + '」挺好的，不改～', 'warning');
            return;
        }
        prof[who].handle = h ? (h.charAt(0) === '@' ? h : '@' + h) : '';
        prof[who].sign = s;
        prof[who].loc = l;
        saveProf();
        closeEdit(); render();
        notify('资料已更新', 'success');
    }
    function changeBanner(who) {
        who = who === 'ta' ? 'ta' : 'me';
        if (who === 'ta') {
            if (window.Album) {
                try {
                    var pool = window.Album.random(1);
                    if (pool && pool.length) {
                        prof.ta.banner = pool[0]; saveProf(); renderHead();
                        notify('给 TA 换了张封面', 'success');
                        return;
                    }
                } catch (e) {}
            }
            notify('相册还没加载', 'info');
            return;
        }
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.addEventListener('change', function (e) {
            var f = (e.target.files || [])[0];
            if (!f) { inp.remove(); return; }
            var done = function (src) {
                prof.me.banner = src; saveProf(); renderHead();
                var b = editEl && editEl.querySelector('#tw-eb-banner');
                if (b) { b.style.backgroundImage = 'url(' + src + ')'; b.classList.add('has'); }
                notify('已更换封面', 'success');
                inp.remove();
            };
            try {
                if (typeof compressImageSmart === 'function') compressImageSmart(f, 0.7, 1500).then(done).catch(function () { inp.remove(); });
                else { var r = new FileReader(); r.onload = function (ev) { done(ev.target.result); }; r.readAsDataURL(f); }
            } catch (x) { inp.remove(); }
        });
        inp.click();
    }
    function changeAvatar(who) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.addEventListener('change', function (e) {
            var f = (e.target.files || [])[0];
            if (!f) { inp.remove(); return; }
            var done = function (src) {
                if (src) {
                    try {
                        if (window.ChatConvSettings && window.ChatConvSettings.setAvatar) window.ChatConvSettings.setAvatar(who, src);
                    } catch (x) {}
                }
                var a = editEl && editEl.querySelector('#tw-eb-av');
                if (a) a.innerHTML = avHtml(who, '', src);
                notify('已更换头像', 'success');
                inp.remove();
            };
            try {
                if (typeof compressImageSmart === 'function') compressImageSmart(f, 0.7, 600).then(done).catch(function () { inp.remove(); });
                else { var r = new FileReader(); r.onload = function (ev) { done(ev.target.result); }; r.readAsDataURL(f); }
            } catch (x) { inp.remove(); }
        });
        inp.click();
    }

    /* ============================================================
       设置页
       ============================================================ */
    function unitOf(k) {
        if (k.indexOf('Prob') > 0) return '%';
        if (k.indexOf('gap') === 0) return '分';
        if (k.indexOf('daily') === 0 || k.indexOf('card') === 0) return '条';
        return '秒';
    }
    function row(key, label, min, max) {
        return '<label class="tw-cfgrow"><span class="k">' + esc(label) + '</span>' +
            '<input type="number" class="v" data-cfg="' + key + '" min="' + min + '" max="' + max + '" value="' + cfg[key] + '">' +
            '<span class="u">' + esc(unitOf(key)) + '</span></label>';
    }
    function sw(key, label) {
        return '<label class="tw-cfgrow"><span class="k">' + esc(label) + '</span>' +
            '<span class="tw-sw"><input type="checkbox" data-cfgc="' + key + '"' + (cfg[key] ? ' checked' : '') + '><i></i></span></label>';
    }
    function openCfg() {
        if (!cfgEl) return;
        var pn = taName();
        cfgEl.querySelector('.tw-cfgbody').innerHTML =
            '<div class="tw-cfgsec">' + esc(pn) + ' 发动态</div>' +
            sw('en', '自动发帖') +
            row('gapMin', '最短间隔', 1, 720) +
            row('gapMax', '最长间隔', 1, 1440) +
            row('dailyMin', '每天最少', 0, 20) +
            row('dailyMax', '每天最多', 1, 20) +
            row('cardMin', '最少字卡', 1, 10) +
            row('cardMax', '最多字卡', 1, 20) +
            '<div class="tw-cfgsec">内容搭配</div>' +
            sw('swEmoji', 'emoji') +
            sw('swKaomoji', '颜文字') +
            sw('swSticker', '表情包') +
            sw('swImage', '相册图片') +
            sw('swCut', '截取聊天') +
            '<div class="tw-cfgsec">' + esc(pn) + ' 喜欢 / 回复 / 转推</div>' +
            row('likeProb', '喜欢概率', 0, 100) +
            row('likeMin', '喜欢最快', 1, 600) +
            row('likeMax', '喜欢最慢', 1, 1800) +
            row('rtProb', '转推概率', 0, 100) +
            row('cmtProb', '回复概率', 0, 100) +
            row('cmtMin', '回复最快', 1, 900) +
            row('cmtMax', '回复最慢', 1, 3600) +
            row('replyProb', '回复我的评论', 0, 100) +
            row('replyMin', '回评论最快', 1, 600) +
            row('replyMax', '回评论最慢', 1, 1800) +
            '<div class="tw-cfgsec">其它</div>' +
            row('favProb', '收藏我的动态', 0, 100) +
            row('rejectProb', '我改 TA 资料被拒绝', 0, 100) +
            row('signProb', 'TA 自己换简介', 0, 100) +
            '<div class="tw-cfgsec">' + esc(pn) + ' 的简介库</div>' +
            '<div class="tw-cfgrow"><span class="k">简介库</span><span class="tw-cfgbtn" data-pool="1">编辑（' + (prof.ta.pool || []).length + ' 句）</span></div>';
        cfgEl.classList.add('show');
    }
    function closeCfg() { if (cfgEl) cfgEl.classList.remove('show'); }
    function openPool() {
        var p = prof.ta;
        if (!p.pool) p.pool = [];
        var cur = p.pool.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n');
        var v = window.prompt('TA 的简介库（每行一句，会随机挑一句当简介）', cur);
        if (v === null) return;
        p.pool = v.split('\n').map(function (x) { return x.replace(/^\s*\d+\.\s*/, '').trim(); }).filter(Boolean);
        saveProf();
        notify('简介库已保存（' + p.pool.length + ' 句）', 'success');
        openCfg();
    }

    /* ============================================================
       构建
       ============================================================ */
    var XLOGO = '<svg class="tw-logo" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">' +
        '<path d="M18.9 2H22l-6.8 7.8L23 22h-6.3l-4.9-6.4L5.9 22H2.8l7.2-8.3L2 2h6.5l4.4 5.8L18.9 2Zm-1.1 18h1.7L7.3 3.7H5.5L17.8 20Z" fill="currentColor"/></svg>';

    function build() {
        if (built) return;
        built = true;

        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'moments-modal';

        modal.innerHTML =
            '<div class="modal-content tw-root">' +
                '<div class="tw-bar">' +
                    '<button class="tw-bar-btn" data-close="1"><i class="fas fa-arrow-left"></i></button>' +
                    '<div class="tw-bar-mid">' + XLOGO + '<span class="tw-bar-title">朋友圈</span></div>' +
                    '<button class="tw-bar-btn" data-cfg="1"><i class="fas fa-gear"></i></button>' +
                '</div>' +
                '<div class="tw-seg" data-seg="1">' +
                    '<button data-owner="all">动态</button>' +
                    '<button data-owner="me">我</button>' +
                    '<button data-owner="ta">TA</button>' +
                '</div>' +
                '<div class="tw-scroll">' +
                    '<div class="tw-head"></div>' +
                    '<div class="tw-tabbar"></div>' +
                    '<div class="tw-feed"></div>' +
                '</div>' +
                '<button class="tw-fab" data-new="me"><i class="fas fa-feather-pointed"></i></button>' +
            '</div>' +
            /* ---------- 发布页 ---------- */
            '<div class="tw-sheet tw-compose">' +
                '<div class="tw-bar">' +
                    '<button class="tw-bar-btn" data-closecompose="1"><i class="fas fa-xmark"></i></button>' +
                    '<div class="tw-bar-mid"><span class="tw-bar-title">发布动态</span></div>' +
                    '<button class="tw-btn solid" data-pub="1">发布</button>' +
                '</div>' +
                '<div class="tw-cbody">' +
                    '<div class="tw-crow"><div class="tw-cav"></div>' +
                        '<div class="tw-cmain"><div class="tw-cwho">发布到 <b>?</b></div>' +
                        '<textarea class="tw-cta" placeholder="有什么新鲜事？" maxlength="400"></textarea></div></div>' +
                    '<div class="tw-cprev"></div>' +
                '</div>' +
                '<div class="tw-ctools">' +
                    '<button data-tool="img" title="图片"><i class="far fa-image"></i></button>' +
                    '<button data-tool="stk" title="表情包"><i class="far fa-face-smile"></i></button>' +
                    '<button data-tool="kao" title="颜文字">(˶‾᷄ ⁻̫ ‾᷅˵)</button>' +
                    '<button data-tool="emo" title="emoji"><i class="far fa-heart"></i></button>' +
                    '<span class="tw-ccount">0/280</span>' +
                '</div>' +
            '</div>' +
            /* ---------- 编辑资料页 ---------- */
            '<div class="tw-sheet tw-edit">' +
                '<div class="tw-bar">' +
                    '<button class="tw-bar-btn" data-closeedit="1"><i class="fas fa-arrow-left"></i></button>' +
                    '<div class="tw-bar-mid"><span class="tw-bar-title">编辑资料</span></div>' +
                    '<button class="tw-btn solid" data-saveedit="1">保存</button>' +
                '</div>' +
                '<div class="tw-scroll">' +
                    '<div class="tw-eb-banner" id="tw-eb-banner" data-banner="me"><span>更换封面</span></div>' +
                    '<div class="tw-eb-avrow"><div id="tw-eb-av" data-changav="1"></div>' +
                        '<span class="tw-eb-avtip">点右上角相机可换头像</span>' +
                        '<button class="tw-cam" data-changav="1"><i class="fas fa-camera"></i></button></div>' +
                    '<label class="tw-field"><span class="l">昵称</span><b id="tw-eb-name"></b></label>' +
                    '<label class="tw-field"><span class="l">@ 用户名</span><input id="tw-eb-handle" maxlength="20" placeholder="@handle"></label>' +
                    '<label class="tw-field"><span class="l">简介</span><textarea id="tw-eb-sign" maxlength="80" placeholder="介绍一下自己"></textarea></label>' +
                    '<label class="tw-field"><span class="l">所在地</span><input id="tw-eb-loc" maxlength="20" placeholder="家里"></label>' +
                '</div>' +
            '</div>' +
            /* ---------- 设置页 ---------- */
            '<div class="tw-sheet tw-cfg">' +
                '<div class="tw-bar">' +
                    '<button class="tw-bar-btn" data-closecfg="1"><i class="fas fa-arrow-left"></i></button>' +
                    '<div class="tw-bar-mid"><span class="tw-bar-title">朋友圈设置</span></div>' +
                    '<span class="tw-bar-btn ghost"></span>' +
                '</div>' +
                '<div class="tw-scroll"><div class="tw-cfgbody"></div></div>' +
            '</div>' +
            /* ---------- 图片查看器 ---------- */
            '<div class="tw-viewer" data-viewer="1"><img alt=""></div>';

        document.body.appendChild(modal);

        scrollEl = modal.querySelector('.tw-scroll');
        headEl = modal.querySelector('.tw-head');
        tabEl = modal.querySelector('.tw-tabbar');
        feedEl = modal.querySelector('.tw-feed');
        barTitle = modal.querySelector('.tw-bar-title');
        segEl = modal.querySelector('.tw-seg');
        fabEl = modal.querySelector('.tw-fab');
        composeEl = modal.querySelector('.tw-compose');
        cTa = modal.querySelector('.tw-cta');
        cPrev = modal.querySelector('.tw-cprev');
        cCnt = modal.querySelector('.tw-ccount');
        cWhoLbl = modal.querySelector('.tw-cwho b');
        editEl = modal.querySelector('.tw-edit');
        cfgEl = modal.querySelector('.tw-cfg');
        viewerEl = modal.querySelector('.tw-viewer');
        if (cTa) cTa.addEventListener('input', renderCPrev);

        modal.addEventListener('click', onClick);
        modal.addEventListener('keydown', onKey);
        modal.addEventListener('input', onInput);
    }

    function onClick(e) {
        var t;
        if (!e.target || !e.target.closest) return;

        if ((t = e.target.closest('[data-close]'))) { close(); return; }
        if ((t = e.target.closest('[data-cfg]'))) { openCfg(); return; }
        if ((t = e.target.closest('[data-closecfg]'))) { closeCfg(); return; }
        if ((t = e.target.closest('[data-new]'))) { openCompose(t.getAttribute('data-new')); return; }
        if ((t = e.target.closest('[data-closecompose]'))) { closeCompose(); return; }
        if ((t = e.target.closest('[data-pub]'))) { publish(); return; }
        if ((t = e.target.closest('[data-closeedit]'))) { closeEdit(); return; }
        if ((t = e.target.closest('[data-saveedit]'))) { saveEdit(); return; }
        if ((t = e.target.closest('[data-banner]'))) { changeBanner(t.getAttribute('data-banner')); return; }
        if ((t = e.target.closest('[data-changav]'))) { changeAvatar(editEl.dataset.who || owner); return; }
        if ((t = e.target.closest('[data-editprof]'))) { openEdit(); return; }
        if ((t = e.target.closest('[data-edithandle]'))) { openEdit(); return; }
        if ((t = e.target.closest('[data-editsign]'))) { openEdit(); return; }
        if ((t = e.target.closest('[data-pool]'))) { openPool(); return; }
        if ((t = e.target.closest('[data-owner]'))) { owner = t.getAttribute('data-owner'); tab = 'posts'; render(); scrollTop(); return; }
        if ((t = e.target.closest('[data-tab]'))) { tab = t.getAttribute('data-tab'); render(); scrollTop(); return; }

        /* 工具条 */
        if ((t = e.target.closest('[data-tool]'))) {
            var k = t.getAttribute('data-tool');
            if (k === 'img') pickImage();
            else if (k === 'stk') pickSticker();
            else if (k === 'kao') insertText(pick(KAOMOJI));
            else if (k === 'emo') insertText(pick(EMOJI));
            return;
        }
        /* 预览删除 */
        if ((t = e.target.closest('[data-rmi]'))) { draft.imgs.splice(+t.getAttribute('data-rmi'), 1); renderCPrev(); return; }
        if ((t = e.target.closest('[data-rms]'))) { draft.stickers.splice(+t.getAttribute('data-rms'), 1); renderCPrev(); return; }
        /* 图片查看 */
        if ((t = e.target.closest('[data-pv]'))) {
            var im = viewerEl.querySelector('img');
            im.src = t.getAttribute('data-pv');
            viewerEl.classList.add('show');
            return;
        }
        if (e.target === viewerEl) { viewerEl.classList.remove('show'); return; }
        /* 互动 */
        if ((t = e.target.closest('[data-reply]'))) {
            var id1 = t.getAttribute('data-reply');
            openIds[id1] = !openIds[id1];
            if (openIds[id1]) { replyTo = id1; draft.text = ''; }
            render();
            if (openIds[id1]) { var inp = feedEl.querySelector('[data-replyinput="' + id1 + '"]'); if (inp) inp.focus(); }
            return;
        }
        if ((t = e.target.closest('[data-replysend]'))) {
            var id2 = t.getAttribute('data-replysend');
            var box = feedEl.querySelector('[data-replyinput="' + id2 + '"]');
            addComment(id2, box ? box.value : (replyTo === id2 ? draft.text : ''));
            return;
        }
        if ((t = e.target.closest('[data-like]'))) { toggleLike(t.getAttribute('data-like'), t); return; }
        if ((t = e.target.closest('[data-rt]'))) { toggleRt(t.getAttribute('data-rt')); return; }
        if ((t = e.target.closest('[data-fav]'))) { toggleFav(t.getAttribute('data-fav')); return; }
        if ((t = e.target.closest('[data-del]'))) { del(t.getAttribute('data-del')); return; }
    }

    function onKey(e) {
        if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-replyinput') && e.key === 'Enter') {
            e.preventDefault();
            addComment(e.target.getAttribute('data-replyinput'), e.target.value);
            return;
        }
        if (e.key === 'Escape') {
            if (viewerEl && viewerEl.classList.contains('show')) { viewerEl.classList.remove('show'); return; }
            if (composeEl && composeEl.classList.contains('show')) { closeCompose(); return; }
            if (cfgEl && cfgEl.classList.contains('show')) { closeCfg(); return; }
            if (editEl && editEl.classList.contains('show')) { closeEdit(); return; }
        }
    }

    function onInput(e) {
        var t = e.target;
        if (!t) return;
        if (t.hasAttribute && t.hasAttribute('data-replyinput')) {
            replyTo = t.getAttribute('data-replyinput');
            draft.text = t.value;
            var btn = feedEl.querySelector('[data-replysend="' + replyTo + '"]');
            if (btn) btn.classList.toggle('on', !!t.value.trim());
            return;
        }
        if (t.hasAttribute && t.hasAttribute('data-cfg')) {
            var key = t.getAttribute('data-cfg');
            var v = parseInt(t.value, 10);
            if (isNaN(v)) return;
            var mn = parseInt(t.getAttribute('min'), 10), mx = parseInt(t.getAttribute('max'), 10);
            if (!isNaN(mn) && v < mn) v = mn;
            if (!isNaN(mx) && v > mx) v = mx;
            cfg[key] = v; saveCfg(); scheduleNext();
            return;
        }
    }
    /* 设置页开关（change 事件） */
    document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !t.hasAttribute || !t.hasAttribute('data-cfgc')) return;
        cfg[t.getAttribute('data-cfgc')] = t.checked ? 1 : 0;
        saveCfg();
    });

    function scrollTop() { if (scrollEl) scrollEl.scrollTop = 0; }

    /* ============================================================
       出入口
       ============================================================ */
    function open(startOwner, startTab) {
        if (!modal) build();
        loadCfg(); loadProf(); loadVisits();
        owner = startOwner || 'all';
        tab = startTab || 'posts';
        render();
        try { if (typeof showModal === 'function') showModal(modal); else modal.style.display = 'flex'; }
        catch (e) { modal.style.display = 'flex'; }
        load();
        addVisit('ta', 'me', 'view', Math.random() < 0.05);
    }
    function close() {
        if (!modal) return;
        closeCompose(); closeCfg(); closeEdit();
        if (viewerEl) viewerEl.classList.remove('show');
        try { if (typeof hideModal === 'function') hideModal(modal); else modal.style.display = 'none'; }
        catch (e) { modal.style.display = 'none'; }
    }

    window.Moments = {
        open: open,
        close: close,
        count: function () { return list.length; },
        taPost: function () { return taPost(); },
        openSettings: function () { if (!modal) build(); openCfg(); },
        openCompose: function (who) { if (!modal) build(); openCompose(who); },
        addVisit: addVisit,
        openTaPool: function () { if (!modal) build(); openPool(); }
    };

    function boot() {
        loadCfg(); loadProf(); loadVisits(); loadNext(); load();
        clearInterval(tickTimer);
        tickTimer = setInterval(tick, 30000);
        setTimeout(tick, 3000);
    }
    if (window.whenSessionReady) window.whenSessionReady(boot); else document.addEventListener('DOMContentLoaded', boot);
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
})();
