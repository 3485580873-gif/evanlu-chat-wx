/* ============================================================
   字卡管理（全屏界面，参考 mochi：点开就是一个新界面，不是弹窗）
   窗口：window.CardManager.open(tabId?) / close()

   分类：
     主字卡 customReplies      （支持 公用 / 专属联系人）
     TA签名库 prof.ta.pool     （逐条添加，不再是 prompt 一堆文本）
     拍一拍 customPokes
     对方状态 customStatuses
     顶部格言 customMottos
     开场动画 customIntros
     我的表情 myStickerLibrary
     TA的表情 stickerLibrary

   专属 / 公用：replyScope[文本] = 'public' | [联系人id, ...]
     存 CHAT_APP_V3_replyScope（全局，不随会话切换），
     core.js 抽回复时会按当前 SESSION_ID 过滤。
   ============================================================ */
(function () {
    'use strict';

    var root = null, built = false;
    var curTab = 'replies';
    var scopeFilter = 'all';       // all | public | private
    var groupFilter = '';          // 表情分组
    var rootScope = null;          // { text: 'public' | [ids] }
    var batchSel = {};             // 批量选择：{ text: true }
    var batchMode = false;         // 是否开启批量选择

    function P() { return (typeof APP_PREFIX !== 'undefined' && APP_PREFIX) ? APP_PREFIX : 'CHAT_APP_V3_'; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function notify(m, t) {
        try { if (typeof showNotification === 'function') { showNotification(m, t || 'info', 1600); return; } } catch (e) {}
    }
    function storeKey(base, global) {
        try {
            if (!global && typeof getStorageKey === 'function' && typeof SESSION_ID !== 'undefined' && SESSION_ID) return getStorageKey(base);
        } catch (e) {}
        return P() + base;
    }
    function lfSet(k, v) { try { localforage.setItem(k, v); } catch (e) {} }

    /* ---------- 分类定义 ---------- */
    var CATS = [
        {
            id: 'replies', name: '主字卡', mode: 'list', scope: true, groupKey: 'customReplyGroups',
            get: function () { return (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) ? customReplies : []; },
            set: function (v) { try { customReplies = v; } catch (e) {} lfSet(storeKey('customReplies'), v); }
        },
        {
            id: 'tapool', name: 'TA签名库', mode: 'list',
            get: function () {
                try {
                    var raw = localStorage.getItem(storeKey('momentsProf'));
                    if (!raw) return [];
                    var o = JSON.parse(raw);
                    return (o && o.ta && Array.isArray(o.ta.pool)) ? o.ta.pool : [];
                } catch (e) { return []; }
            },
            set: function (v) {
                try {
                    var o = { me: { banner: '', sign: '', pool: [] }, ta: { banner: '', sign: '', pool: [] } };
                    var raw = localStorage.getItem(storeKey('momentsProf'));
                    if (raw) { var p = JSON.parse(raw); if (p && p.me) o.me = p.me; if (p && p.ta) o.ta = p.ta; }
                    o.ta = o.ta || {}; o.ta.pool = v;
                    localStorage.setItem(storeKey('momentsProf'), JSON.stringify(o));
                } catch (e) {}
                try { if (typeof renderProf === 'function') renderProf(); } catch (e) {}
            }
        },
        {
            id: 'pokes', name: '拍一拍', mode: 'list', groupKey: 'customPokeGroups',
            get: function () { return (typeof customPokes !== 'undefined' && Array.isArray(customPokes)) ? customPokes : []; },
            set: function (v) { try { customPokes = v; } catch (e) {} lfSet(storeKey('customPokes'), v); }
        },
        {
            id: 'statuses', name: '对方状态', mode: 'list', groupKey: 'customStatusGroups',
            get: function () { return (typeof customStatuses !== 'undefined' && Array.isArray(customStatuses)) ? customStatuses : []; },
            set: function (v) { try { customStatuses = v; } catch (e) {} lfSet(storeKey('customStatuses'), v); }
        },
        {
            id: 'mottos', name: '顶部格言', mode: 'list',
            get: function () { return (typeof customMottos !== 'undefined' && Array.isArray(customMottos)) ? customMottos : []; },
            set: function (v) { try { customMottos = v; } catch (e) {} lfSet(storeKey('customMottos'), v); }
        },
        {
            id: 'intros', name: '开场动画', mode: 'list',
            get: function () { return (typeof customIntros !== 'undefined' && Array.isArray(customIntros)) ? customIntros : []; },
            set: function (v) { try { customIntros = v; } catch (e) {} lfSet(storeKey('customIntros'), v); }
        },
        {
            id: 'mystickers', name: '我的表情', mode: 'grid', groupKey: 'myStickerGroups', globalGroup: true,
            get: function () { return (typeof myStickerLibrary !== 'undefined' && Array.isArray(myStickerLibrary)) ? myStickerLibrary : []; },
            set: function (v) { try { myStickerLibrary = v; } catch (e) {} lfSet(storeKey('myStickerLibrary'), v); }
        },
        {
            id: 'stickers', name: 'TA的表情', mode: 'grid', groupKey: 'stickerGroups', globalGroup: true,
            get: function () { return (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) ? stickerLibrary : []; },
            set: function (v) { try { stickerLibrary = v; } catch (e) {} lfSet(storeKey('stickerLibrary'), v); }
        }
    ];

    function cat(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return CATS[0]; }

    /* ---------- 分组 ----------
       文本类分组沿用 reply-library 的 window.customReplyGroups / customPokeGroups / customStatusGroups（g.items 存原文）
       表情分组改为「全局 + 存完整 src」，聊天界面（games.js）才能按同样结构筛出来。
       旧的 reply-library 表情分组是按会话存、用 base64 前 64 位做指纹的，这里做一次迁移，避免用户已有的分组消失。 */
    var STK_COLORS = ['#ff7aa2', '#7b7bff', '#ffb454', '#4ecdc4', '#a06bff', '#ff8f6b', '#5fb8e6', '#8ed06c'];
    var stkLoaded = false;

    function loadStickerGroups() {
        ['myStickerGroups', 'stickerGroups'].forEach(function (k) { if (!Array.isArray(window[k])) window[k] = []; });
        if (stkLoaded) return;
        stkLoaded = true;
        var done = 0;
        ['myStickerGroups', 'stickerGroups'].forEach(function (k) {
            try {
                localforage.getItem(P() + k).then(function (v) {
                    if (Array.isArray(v) && v.length) window[k] = v;
                    else migrateLegacyStickerGroups();
                    if (++done >= 2) fireStkGroups();
                }).catch(function () { migrateLegacyStickerGroups(); if (++done >= 2) fireStkGroups(); });
            } catch (e) { migrateLegacyStickerGroups(); if (++done >= 2) fireStkGroups(); }
        });
    }
    function fireStkGroups() {
        try { window.dispatchEvent(new CustomEvent('cm:stkgroups')); } catch (e) {}
    }

    function migrateLegacyStickerGroups() {
        try {
            var keys = [];
            try { if (typeof getStorageKey === 'function') keys.push(getStorageKey('stickerGroups')); } catch (e) {}
            keys.push(P() + 'stickerGroups');
            var legacy = [];
            keys.forEach(function (kk) {
                var raw = null;
                try { raw = localStorage.getItem(kk); } catch (e) {}
                if (!raw) return;
                try { var arr = JSON.parse(raw); if (Array.isArray(arr)) legacy = legacy.concat(arr); } catch (e) {}
            });
            if (!legacy.length) return;
            var myLib = (typeof myStickerLibrary !== 'undefined' && Array.isArray(myStickerLibrary)) ? myStickerLibrary : [];
            var taLib = (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) ? stickerLibrary : [];
            var myG = [], taG = [];
            legacy.forEach(function (g, i) {
                if (!g) return;
                var fps = Array.isArray(g.fps) ? g.fps : [];
                if (!fps.length) return;
                var myItems = [], taItems = [];
                fps.forEach(function (fp) {
                    myLib.forEach(function (s) { if (String(s).slice(0, 64) === fp && myItems.indexOf(s) < 0) myItems.push(s); });
                    taLib.forEach(function (s) { if (String(s).slice(0, 64) === fp && taItems.indexOf(s) < 0) taItems.push(s); });
                });
                var base = { name: g.name || '分组', color: g.color || STK_COLORS[i % STK_COLORS.length] };
                if (myItems.length) myG.push({ id: 'my_' + (g.id || i), name: base.name, color: base.color, items: myItems });
                if (taItems.length) taG.push({ id: 'ta_' + (g.id || i), name: base.name, color: base.color, items: taItems });
            });
            if (myG.length) { window.myStickerGroups = myG; lfSet(P() + 'myStickerGroups', myG); }
            if (taG.length) { window.stickerGroups = taG; lfSet(P() + 'stickerGroups', taG); }
        } catch (e) {}
    }

    function groupsOf(c) {
        if (!c.groupKey) return [];
        if (c.mode === 'grid') loadStickerGroups();
        var g = window[c.groupKey];
        return Array.isArray(g) ? g : [];
    }
    function saveGroups(c, arr) {
        if (!c.groupKey) return;
        window[c.groupKey] = arr;
        lfSet(c.globalGroup ? (P() + c.groupKey) : storeKey(c.groupKey), arr);
        try { if (typeof saveData === 'function') saveData(); } catch (e) {}
    }
    function groupOfItem(c, item) {
        var gs = groupsOf(c);
        for (var i = 0; i < gs.length; i++) {
            if (gs[i] && Array.isArray(gs[i].items) && gs[i].items.indexOf(item) >= 0) return gs[i];
        }
        return null;
    }

    /* ---------- 专属 / 公用 ---------- */
    function loadScope() {
        if (rootScope) return Promise.resolve(rootScope);
        return Promise.resolve()
            .then(function () { return localforage.getItem(P() + 'replyScope'); })
            .then(function (v) { rootScope = (v && typeof v === 'object') ? v : {}; return rootScope; })
            .catch(function () { rootScope = {}; return rootScope; });
    }
    function saveScope() {
        window.replyScope = rootScope;
        lfSet(P() + 'replyScope', rootScope);
    }
    function scopeOf(text) {
        if (!rootScope) return 'public';
        var v = rootScope[text];
        if (v === undefined || v === null) return 'public';
        return v;
    }
    function scopeLabel(text) {
        var v = scopeOf(text);
        if (v === 'public') return '公用';
        if (Array.isArray(v) && v.length) return '专属·' + v.length + '人';
        return '公用';
    }
    /* core.js 会调用：判断某条字卡在当前会话是否可用 */
    function isUsable(text) {
        var v = scopeOf(text);
        if (v === 'public') return true;
        if (!Array.isArray(v)) return true;
        if (!v.length) return true;
        try {
            if (v.indexOf(SESSION_ID) >= 0) return true;
            // 群聊：任一群成员的专属字卡在群里同样生效
            // （群会话的 SESSION_ID 是群 id，而专属卡绑的是成员联系人 id）
            var s = null;
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) {
                for (var i = 0; i < sessionList.length; i++) if (sessionList[i].id === SESSION_ID) { s = sessionList[i]; break; }
            }
            if (s && s.kind === 'group' && Array.isArray(s.members)) {
                for (var j = 0; j < s.members.length; j++) {
                    if (v.indexOf(s.members[j]) >= 0) return true;
                }
            }
            return false;
        } catch (e) { return true; }
    }

    /* ---------- 联系人 ---------- */
    function contacts() {
        try {
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) {
                return sessionList.map(function (s) { return { id: s.id, name: s.name || '未命名' }; });
            }
        } catch (e) {}
        return [];
    }

    /* ---------- UI ---------- */
    function build() {
        if (built) return; built = true;
        root = document.createElement('div');
        root.id = 'cm-root';
        root.innerHTML =
            '<div class="cm-head">' +
                '<button class="cm-back" id="cm-back"><i class="fas fa-chevron-left"></i></button>' +
                '<div class="cm-title"><i class="fas fa-note-sticky"></i> 字卡管理</div>' +
                '<button class="cm-add" id="cm-export" title="导出"><i class="fas fa-file-export"></i></button>' +
                '<button class="cm-add" id="cm-import" title="导入"><i class="fas fa-file-import"></i></button>' +
                '<button class="cm-add" id="cm-add"><i class="fas fa-plus"></i></button>' +
            '</div>' +
            '<div class="cm-tabs" id="cm-tabs"></div>' +
            '<div class="cm-filters" id="cm-filters"></div>' +
            '<div class="cm-batchbar" id="cm-batchbar"></div>' +
            '<div class="cm-body" id="cm-body"></div>' +
            '<div class="cm-mask" id="cm-sheet-mask">' +
                '<div class="cm-sheet" id="cm-sheet"></div>' +
            '</div>';
        document.body.appendChild(root);

        root.querySelector('#cm-back').addEventListener('click', close);
        root.querySelector('#cm-add').addEventListener('click', function () { openAddSheet(); });
        root.querySelector('#cm-export').addEventListener('click', exportCurrent);
        root.querySelector('#cm-import').addEventListener('click', importCurrent);
        root.querySelector('#cm-sheet-mask').addEventListener('click', function (e) {
            if (e.target === root.querySelector('#cm-sheet-mask')) closeSheet();
        });

        var tabsEl = root.querySelector('#cm-tabs');
        CATS.forEach(function (c) {
            var b = document.createElement('button');
            b.className = 'cm-tab'; b.setAttribute('data-cat', c.id); b.textContent = c.name;
            b.addEventListener('click', function () { curTab = c.id; scopeFilter = 'all'; groupFilter = ''; resetBatch(); render(); });
            tabsEl.appendChild(b);
        });
    }

    function render() {
        build();
        var c = cat(curTab);
        root.querySelectorAll('.cm-tab').forEach(function (b) {
            b.classList.toggle('on', b.getAttribute('data-cat') === curTab);
        });

        /* 过滤条 */
        var f = root.querySelector('#cm-filters');
        var fh = '';
        if (c.scope) {
            fh += '<div class="cm-chip' + (scopeFilter === 'all' ? ' on' : '') + '" data-scope="all">全部</div>' +
                  '<div class="cm-chip' + (scopeFilter === 'public' ? ' on' : '') + '" data-scope="public">公用</div>' +
                  '<div class="cm-chip' + (scopeFilter === 'private' ? ' on' : '') + '" data-scope="private">专属</div>';
        }
        var gs = groupsOf(c);
        if (gs.length) {
            fh += '<div class="cm-chip' + (groupFilter === '' ? ' on' : '') + '" data-group="">全部</div>';
            gs.forEach(function (g) {
                var gid = String(g.id || g.name || '');
                fh += '<div class="cm-chip' + (groupFilter === gid ? ' on' : '') + '" data-group="' + esc(gid) + '">' +
                      esc(g.name || '分组') + '</div>';
            });
            fh += '<div class="cm-chip cm-chip-mgr" data-mgr="1"><i class="fas fa-gear"></i> 管理分组</div>';
        }
        if (c.mode === 'list') {
            fh += '<div class="cm-chip cm-chip-batch' + (batchMode ? ' on' : '') + '" data-batch="1"><i class="fas fa-check-square"></i> 批量</div>';
        }
        f.innerHTML = fh;
        f.style.display = fh ? '' : 'none';
        f.onclick = function (e) {
            var chip = e.target.closest('.cm-chip'); if (!chip) return;
            if (chip.hasAttribute('data-batch')) { batchMode = !batchMode; if (!batchMode) resetBatch(); render(); return; }
            if (chip.hasAttribute('data-mgr')) { openGroupManageSheet(); return; }
            if (chip.hasAttribute('data-scope')) { scopeFilter = chip.getAttribute('data-scope'); }
            if (chip.hasAttribute('data-group')) { groupFilter = chip.getAttribute('data-group'); }
            render();
        };

        /* 批量操作栏 */
        renderBatchBar(c);

        /* 列表 / 网格 */
        var body = root.querySelector('#cm-body');
        var items = c.get().slice();

        if (c.scope) {
            items = items.filter(function (t) {
                var v = scopeOf(t);
                var isPub = (v === 'public' || !Array.isArray(v) || !v.length);
                if (scopeFilter === 'public') return isPub;
                if (scopeFilter === 'private') return !isPub;
                return true;
            });
        }
        if (groupFilter) {
            items = items.filter(function (t) {
                var g = groupOfItem(c, t);
                return g && String(g.id || g.name || '') === groupFilter;
            });
        }

        if (!items.length) {
            body.innerHTML = '<div class="cm-empty"><i class="fas fa-inbox"></i><div>这里还没有内容</div>' +
                '<div class="cm-empty-sub">点右上角 ＋ 添加' + (c.mode === 'grid' ? '（图片请到聊天里的头像库/表情面板添加）' : '') + '</div></div>';
            return;
        }

        if (c.mode === 'grid') {
            body.innerHTML = '<div class="cm-grid">' + items.map(function (src, i) {
                var g = groupOfItem(c, src);
                return '<div class="cm-grid-item" data-i="' + i + '" data-src="' + esc(src) + '">' +
                    '<img src="' + esc(src) + '" loading="lazy">' +
                    '<button class="cm-grid-del" data-i="' + i + '" title="删除"><i class="fas fa-times"></i></button>' +
                    '<button class="cm-grid-grp" data-i="' + i + '" title="设置分组"><i class="fas fa-folder"></i> ' +
                        esc(g ? (g.name || '分组') : '分组') + '</button>' +
                    '</div>';
            }).join('') + '</div>';
            body.querySelectorAll('.cm-grid-del').forEach(function (b) {
                b.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var i = parseInt(b.getAttribute('data-i'), 10);
                    var arr = c.get().slice();
                    var gone = arr.splice(i, 1)[0];
                    c.set(arr);
                    // 同步清掉分组里的引用
                    if (c.groupKey) {
                        var gs2 = groupsOf(c).map(function (g) {
                            if (g && Array.isArray(g.items)) g.items = g.items.filter(function (x) { return x !== gone; });
                            return g;
                        });
                        saveGroups(c, gs2);
                    }
                    notify('已删除'); render();
                });
            });
            body.querySelectorAll('.cm-grid-grp').forEach(function (b) {
                b.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var i = parseInt(b.getAttribute('data-i'), 10);
                    openGroupSheet(c, items[i]);
                });
            });
            return;
        }

        /* 列表模式：「全部」视图按分组折叠呈现，未分组归入「未分组」块；
           选了具体分组则仍平铺（该视图下只有一组，折叠没有意义） */
        function cmItemHTML(t, i) {
            var g = groupOfItem(c, t);
            var gName = g ? (g.name || '分组') : '';
            var badge = c.scope ? '<span class="cm-badge cm-badge-' + (scopeOf(t) === 'public' ? 'pub' : 'pri') + '">' + esc(scopeLabel(t)) + '</span>' : '';
            var gBadge = gName ? '<span class="cm-badge cm-badge-grp">' + esc(gName) + '</span>' : '';
            var checked = batchMode && batchSel[t] ? ' checked' : '';
            return '<div class="cm-item' + (batchMode && batchSel[t] ? ' cm-item-sel' : '') + '" data-i="' + i + '">' +
                (batchMode ? '<label class="cm-check"><input type="checkbox" data-bt="' + esc(t) + '"' + checked + '></label>' : '') +
                '<div class="cm-item-head">' +
                    '<div class="cm-item-text">' + esc(t) + '</div>' +
                    (batchMode ? '' :
                    '<div class="cm-item-acts">' +
                        (c.scope ? '<button class="cm-act" data-a="scope" data-i="' + i + '" title="设置归属"><i class="fas fa-user-tag"></i></button>' : '') +
                        (c.groupKey ? '<button class="cm-act" data-a="group" data-i="' + i + '" title="设置分组"><i class="fas fa-layer-group"></i></button>' : '') +
                        '<button class="cm-act" data-a="edit" data-i="' + i + '" title="编辑"><i class="fas fa-pen"></i></button>' +
                        '<button class="cm-act cm-act-danger" data-a="del" data-i="' + i + '" title="删除"><i class="fas fa-trash-alt"></i></button>' +
                    '</div>') +
                '</div>' +
                '<div class="cm-item-meta">' + badge + gBadge + '</div>' +
            '</div>';
        }
        function bindCMItemEvents() {
            body.querySelectorAll('.cm-check input').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    var t = cb.getAttribute('data-bt');
                    if (cb.checked) batchSel[t] = true; else delete batchSel[t];
                    renderBatchBar(c);
                });
            });
        }

        var showFolded = !groupFilter && gs.length > 0;
        if (showFolded) {
            /* 折叠视图：按分组聚合，折叠状态记 sessionStorage（渲染顺序变了也能对上） */
            var foldState = (function () {
                try { return JSON.parse(sessionStorage.getItem('cmFold_' + c.id) || '{}'); } catch (e) { return {}; }
            })();
            var buckets = [];
            var groupedMap = {};
            gs.forEach(function (g) {
                var gid = String(g.id || g.name || '');
                var arr = [];
                items.forEach(function (t, i) {
                    var gi = groupOfItem(c, t);
                    if (gi && String(gi.id || gi.name || '') === gid) { arr.push({ t: t, i: i }); groupedMap[t] = true; }
                });
                if (arr.length) buckets.push({ g: g, gid: gid, items: arr });
            });
            var loose = [];
            items.forEach(function (t, i) { if (!groupedMap[t]) loose.push({ t: t, i: i }); });

            function grpSecHTML(name, key, arr) {
                var col = foldState[key] === true;
                return '<div class="cm-grp-sec' + (col ? ' collapsed' : '') + '">' +
                    '<div class="cm-grp-hdr" data-gkey="' + esc(key) + '">' +
                        '<i class="fas fa-chevron-down cm-grp-chevron"' + (col ? ' style="transform:rotate(-90deg)"' : '') + '></i>' +
                        '<span class="cm-grp-name">' + esc(name) + '</span>' +
                        '<span class="cm-grp-count">' + arr.length + '</span>' +
                    '</div>' +
                    '<div class="cm-grp-body"' + (col ? ' style="display:none"' : '') + '>' +
                        arr.map(function (o) { return cmItemHTML(o.t, o.i); }).join('') +
                    '</div></div>';
            }
            var html = '<div class="cm-list">';
            buckets.forEach(function (b) { html += grpSecHTML(b.g.name || '分组', b.g.name || b.gid, b.items); });
            if (loose.length) html += grpSecHTML('未分组', '__none', loose);
            html += '</div>';
            body.innerHTML = html;

            body.querySelectorAll('.cm-grp-hdr').forEach(function (hdr) {
                hdr.addEventListener('click', function () {
                    var sec = hdr.parentNode;
                    var bd = sec.querySelector('.cm-grp-body');
                    var col = sec.classList.toggle('collapsed');
                    if (bd) bd.style.display = col ? 'none' : '';
                    var ch = hdr.querySelector('.cm-grp-chevron');
                    if (ch) ch.style.transform = col ? 'rotate(-90deg)' : '';
                    try {
                        var all = JSON.parse(sessionStorage.getItem('cmFold_' + c.id) || '{}');
                        all[hdr.getAttribute('data-gkey') || ''] = col;
                        sessionStorage.setItem('cmFold_' + c.id, JSON.stringify(all));
                    } catch (e) {}
                });
            });
            bindCMItemEvents();
            return;
        }

        body.innerHTML = '<div class="cm-list">' + items.map(function (t, i) {
            return cmItemHTML(t, i);
        }).join('') + '</div>';

        bindCMItemEvents();

        body.querySelectorAll('.cm-act').forEach(function (b) {
            b.addEventListener('click', function () {
                var a = b.getAttribute('data-a');
                var i = parseInt(b.getAttribute('data-i'), 10);
                var text = items[i];
                if (a === 'del') {
                    var arr = c.get().slice();
                    var idx = arr.indexOf(text);
                    if (idx >= 0) arr.splice(idx, 1);
                    c.set(arr);
                    if (c.scope && rootScope) { delete rootScope[text]; saveScope(); }
                    notify('已删除'); render();
                } else if (a === 'edit') { openEditSheet(text); }
                else if (a === 'scope') { openScopeSheet(text); }
                else if (a === 'group') { openGroupSheet(c, text); }
            });
        });
    }

    /* ---------- 批量选择 ---------- */
    function resetBatch() { batchSel = {}; batchMode = false; }

    function renderBatchBar(c) {
        var bar = root.querySelector('#cm-batchbar');
        if (!bar) return;
        var keys = Object.keys(batchSel);
        if (!batchMode || !keys.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        bar.style.display = 'flex';
        bar.innerHTML =
            '<span class="cm-batch-count">已选 ' + keys.length + ' 条</span>' +
            '<button class="cm-btn cm-btn-sm" id="cm-batch-all">全选</button>' +
            (c.groupKey ? '<button class="cm-btn cm-btn-sm" id="cm-batch-group"><i class="fas fa-folder"></i> 分组</button>' : '') +
            '<button class="cm-btn cm-btn-sm cm-btn-danger" id="cm-batch-del"><i class="fas fa-trash"></i> 删除</button>' +
            '<button class="cm-btn cm-btn-sm" id="cm-batch-cancel">取消</button>';
        bar.querySelector('#cm-batch-cancel').addEventListener('click', function () { resetBatch(); render(); });
        bar.querySelector('#cm-batch-del').addEventListener('click', function () { batchDelete(c); });
        bar.querySelector('#cm-batch-all').addEventListener('click', function () {
            var all = c.get().slice();
            if (c.scope) all = all.filter(function (t) {
                var v = scopeOf(t); var isPub = (v === 'public' || !Array.isArray(v) || !v.length);
                if (scopeFilter === 'public') return isPub;
                if (scopeFilter === 'private') return !isPub;
                return true;
            });
            var n = 0;
            all.forEach(function (t) { if (!batchSel[t]) { batchSel[t] = true; n++; } });
            render();
        });
        if (c.groupKey) {
            bar.querySelector('#cm-batch-group').addEventListener('click', function () { batchGroup(c); });
        }
    }

    function batchDelete(c) {
        var keys = Object.keys(batchSel);
        if (!keys.length) return;
        var arr = c.get().slice();
        keys.forEach(function (t) {
            var i = arr.indexOf(t);
            if (i >= 0) arr.splice(i, 1);
            if (c.scope && rootScope) { delete rootScope[t]; }
        });
        c.set(arr);
        if (c.scope) saveScope();
        // 分组引用同步清掉
        if (c.groupKey) {
            var gs2 = groupsOf(c).map(function (g) {
                if (g && Array.isArray(g.items)) g.items = g.items.filter(function (x) { return keys.indexOf(x) < 0; });
                return g;
            });
            saveGroups(c, gs2);
        }
        resetBatch();
        notify('已删除 ' + keys.length + ' 条'); render();
    }

    function batchGroup(c) {
        var keys = Object.keys(batchSel);
        if (!keys.length) return;
        var gs = groupsOf(c).slice();
        var sheet = root.querySelector('#cm-sheet');
        sheet.innerHTML =
            '<div class="cm-sheet-title">批量分组（' + keys.length + ' 条）</div>' +
            '<div class="cm-sheet-desc">把这些内容统一放进一个分组</div>' +
            '<div class="cm-contact-list">' +
                gs.map(function (g) {
                    var gid = String(g.id || g.name || '');
                    return '<label class="cm-contact"><input type="radio" name="cm-bgrp" value="' + esc(gid) + '"> ' + esc(g.name || '分组') + '</label>';
                }).join('') +
            '</div>' +
            '<div class="cm-newgrp"><input class="cm-input" id="cm-newgrp-input" placeholder="新建分组名"><button class="cm-btn" id="cm-newgrp-btn">新建</button></div>' +
            '<div class="cm-sheet-btns">' +
                '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">保存</button>' +
            '</div>';
        root.querySelector('#cm-sheet-mask').classList.add('show');
        root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);
        root.querySelector('#cm-newgrp-btn').addEventListener('click', function () {
            var v = String(root.querySelector('#cm-newgrp-input').value || '').trim();
            if (!v) return;
            var id = 'g' + Date.now().toString(36);
            gs.push({ id: id, name: v, items: [] });
            saveGroups(c, gs);
            batchGroup(c);
        });
        root.querySelector('#cm-sheet-save').addEventListener('click', function () {
            var gid = (root.querySelector('input[name="cm-bgrp"]:checked') || {}).value || '';
            if (!gid) { notify('请先选一个分组或新建分组'); return; }
            gs = groupsOf(c).map(function (g) {
                if (!Array.isArray(g.items)) g.items = [];
                g.items = g.items.filter(function (x) { return keys.indexOf(x) < 0; });
                if (String(g.id || g.name || '') === gid) {
                    g.items = g.items.concat(keys);
                }
                return g;
            });
            saveGroups(c, gs);
            resetBatch(); closeSheet(); render(); notify('已分组 ' + keys.length + ' 条');
        });
    }

    /* ---------- 导入 / 导出 ---------- */
    function exportCurrent() {
        var c = cat(curTab);
        var arr = c.get().slice();
        if (!arr.length) { notify('当前分类没有内容可导出'); return; }
        if (c.mode === 'grid') {
            // 表情导出为 JSON（含分组）
            var payload = { type: c.id, name: c.name, items: arr, groups: groupsOf(c) };
            downloadText(c.id + '.json', JSON.stringify(payload, null, 2));
        } else {
            // 文本类导出为纯文本，一行一条（含归属标记注释）
            var lines = arr.map(function (t) {
                var scope = scopeOf(t);
                var tag = (scope === 'public') ? '' : ('[专属]');
                return tag + t;
            });
            downloadText(c.id + '.txt', lines.join('\n'));
        }
        notify('已导出 ' + arr.length + ' 条');
    }

    function importCurrent() {
        var c = cat(curTab);
        var sheet = root.querySelector('#cm-sheet');
        sheet.innerHTML =
            '<div class="cm-sheet-title">导入到「' + esc(c.name) + '」</div>' +
            '<div class="cm-sheet-desc">粘贴文本（一行一条）或粘贴导出的 JSON，也可以选文件</div>' +
            '<input type="file" id="cm-import-file" accept=".txt,.json,text/plain,application/json" style="display:none">' +
            '<div class="cm-add-row">' +
                '<button class="cm-btn" id="cm-import-pick"><i class="fas fa-folder-open"></i> 选文件</button>' +
            '</div>' +
            '<textarea class="cm-sheet-ta" id="cm-import-ta" rows="8" placeholder="一行一条字卡，或直接粘贴 JSON"></textarea>' +
            '<div class="cm-sheet-btns">' +
                '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">导入</button>' +
            '</div>';
        root.querySelector('#cm-sheet-mask').classList.add('show');
        root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);
        root.querySelector('#cm-import-pick').addEventListener('click', function () {
            root.querySelector('#cm-import-file').click();
        });
        root.querySelector('#cm-import-file').addEventListener('change', function () {
            var f = this.files && this.files[0];
            if (!f) return;
            var fr = new FileReader();
            fr.onload = function () { root.querySelector('#cm-import-ta').value = String(fr.result || ''); };
            fr.readAsText(f);
        });
        root.querySelector('#cm-sheet-save').addEventListener('click', function () {
            var raw = String(root.querySelector('#cm-import-ta').value || '').trim();
            if (!raw) { notify('请粘贴内容或选文件'); return; }
            doImport(c, raw);
        });
    }

    function doImport(c, raw) {
        var arr = c.get().slice();
        var added = 0;
        var first = raw.trim().charAt(0);
        if (first === '{' || first === '[') {
            // JSON 导入（表情导出格式）
            try {
                var o = JSON.parse(raw);
                var items = o.items || o;
                if (!Array.isArray(items)) { notify('JSON 格式不对'); return; }
                items.forEach(function (s) { if (typeof s === 'string' && arr.indexOf(s) < 0) { arr.push(s); added++; } });
                if (Array.isArray(o.groups) && c.groupKey) {
                    var merged = groupsOf(c).slice();
                    o.groups.forEach(function (g) {
                        if (!g || !g.name) return;
                        var exist = merged.filter(function (x) { return x && x.name === g.name; })[0];
                        if (exist) {
                            (g.items || []).forEach(function (it) { if (exist.items.indexOf(it) < 0) exist.items.push(it); });
                        } else {
                            merged.push({ id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: g.name, color: g.color || STK_COLORS[merged.length % STK_COLORS.length], items: (g.items || []).slice() });
                        }
                    });
                    saveGroups(c, merged);
                }
            } catch (e) { notify('JSON 解析失败'); return; }
        } else {
            // 文本导入，一行一条
            var lines = raw.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
            lines.forEach(function (l) {
                // 去掉 [专属] 标记，保留原文
                var txt = l.replace(/^\[专属\]/, '').trim();
                if (txt && arr.indexOf(txt) < 0) { arr.push(txt); added++; }
            });
        }
        if (!added) { notify('没有新增内容（可能已存在）'); return; }
        c.set(arr);
        try { if (typeof saveData === 'function') saveData(); } catch (e) {}
        closeSheet(); render(); notify('已导入 ' + added + ' 条');
    }

    function downloadText(filename, text) {
        try {
            var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        } catch (e) { notify('导出失败'); }
    }

    /* ---------- 抽屉 ---------- */
    function closeSheet() { var m = root.querySelector('#cm-sheet-mask'); if (m) m.classList.remove('show'); }

    var pendingImgs = [];

    function openAddSheet() {
        var c = cat(curTab);
        var sheet = root.querySelector('#cm-sheet');
        pendingImgs = [];

        if (c.mode === 'grid') {
            sheet.innerHTML =
                '<div class="cm-sheet-title">添加' + esc(c.name) + '</div>' +
                '<div class="cm-sheet-desc">一次可以选多张图，也可以直接填图片链接</div>' +
                '<input type="file" id="cm-file-input" accept="image/*" multiple style="display:none">' +
                '<div class="cm-add-row">' +
                    '<button class="cm-btn cm-btn-primary" id="cm-pick-img"><i class="fas fa-image"></i> 选择图片</button>' +
                    '<span class="cm-sheet-desc" id="cm-pick-count" style="margin:0;">未选择</span>' +
                '</div>' +
                '<div class="cm-grid cm-grid-preview" id="cm-preview-grid"></div>' +
                '<input class="cm-input" id="cm-add-url" placeholder="或粘贴图片链接 https://…">' +
                '<button class="cm-btn" id="cm-add-url-btn">用链接添加</button>' +
                '<div class="cm-sheet-btns">' +
                    '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                    '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">保存</button>' +
                '</div>';
            root.querySelector('#cm-sheet-mask').classList.add('show');
            root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);

            var fileInput = root.querySelector('#cm-file-input');
            root.querySelector('#cm-pick-img').addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function () {
                var files = Array.prototype.slice.call(fileInput.files || []);
                if (!files.length) return;
                var left = files.length;
                files.forEach(function (f) {
                    var fr = new FileReader();
                    fr.onload = function () {
                        var d = String(fr.result || '');
                        if (d && pendingImgs.indexOf(d) < 0) pendingImgs.push(d);
                        left--; if (!left) renderPreview();
                    };
                    fr.onerror = function () { left--; if (!left) renderPreview(); };
                    fr.readAsDataURL(f);
                });
                fileInput.value = '';
            });

            function renderPreview() {
                var g = root.querySelector('#cm-preview-grid');
                var cnt = root.querySelector('#cm-pick-count');
                if (cnt) cnt.textContent = pendingImgs.length ? ('已选 ' + pendingImgs.length + ' 张') : '未选择';
                if (!g) return;
                g.innerHTML = pendingImgs.map(function (src, i) {
                    return '<div class="cm-grid-item"><img src="' + esc(src) + '">' +
                        '<button class="cm-grid-del" data-pi="' + i + '"><i class="fas fa-times"></i></button></div>';
                }).join('');
                g.querySelectorAll('.cm-grid-del').forEach(function (b) {
                    b.addEventListener('click', function (e) {
                        e.stopPropagation();
                        pendingImgs.splice(parseInt(b.getAttribute('data-pi'), 10), 1);
                        renderPreview();
                    });
                });
            }
            renderPreview();

            root.querySelector('#cm-add-url-btn').addEventListener('click', function () {
                var v = String(root.querySelector('#cm-add-url').value || '').trim();
                if (!v) { notify('请填链接'); return; }
                if (pendingImgs.indexOf(v) < 0) pendingImgs.push(v);
                root.querySelector('#cm-add-url').value = '';
                renderPreview();
            });

            root.querySelector('#cm-sheet-save').addEventListener('click', function () {
                if (!pendingImgs.length) { notify('先选图片或填链接'); return; }
                var arr = c.get().slice();
                var n = 0;
                pendingImgs.forEach(function (s) { if (arr.indexOf(s) < 0) { arr.push(s); n++; } });
                c.set(arr);
                try { if (typeof saveData === 'function') saveData(); } catch (e) {}
                closeSheet(); render(); notify('已添加 ' + n + ' 张');
            });
            return;
        }

        sheet.innerHTML =
            '<div class="cm-sheet-title">添加' + esc(c.name) + '</div>' +
            '<div class="cm-sheet-desc">每行一条，可一次添加多条</div>' +
            '<textarea class="cm-sheet-ta" id="cm-add-ta" rows="7" placeholder="第一行字卡&#10;第二行字卡"></textarea>' +
            '<div class="cm-sheet-btns">' +
                '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">保存</button>' +
            '</div>';
        root.querySelector('#cm-sheet-mask').classList.add('show');
        root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);
        root.querySelector('#cm-sheet-save').addEventListener('click', function () {
            var ta = root.querySelector('#cm-add-ta');
            var lines = String(ta.value || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
            if (!lines.length) { notify('请输入内容'); return; }
            var arr = c.get().slice();
            lines.forEach(function (l) { if (arr.indexOf(l) < 0) arr.push(l); });
            c.set(arr);
            try { if (typeof saveData === 'function') saveData(); } catch (e) {}
            closeSheet(); render();
            notify('已添加 ' + lines.length + ' 条');
        });
        var ta2 = root.querySelector('#cm-add-ta'); if (ta2) setTimeout(function () { ta2.focus(); }, 120);
    }

    /* 管理分组：新建 / 重命名 / 删除 */
    function openGroupManageSheet() {
        var c = cat(curTab);
        var gs = groupsOf(c).slice();
        var sheet = root.querySelector('#cm-sheet');
        sheet.innerHTML =
            '<div class="cm-sheet-title">管理分组</div>' +
            '<div class="cm-contact-list" id="cm-mgr-list">' +
                (gs.length ? gs.map(function (g, i) {
                    return '<div class="cm-mgr-row">' +
                        '<input class="cm-input" data-gi="' + i + '" value="' + esc(g.name || '') + '">' +
                        '<button class="cm-btn cm-btn-danger" data-del="' + i + '">删除</button>' +
                        '</div>';
                }).join('') : '<div class="cm-sheet-desc">还没有分组</div>') +
            '</div>' +
            '<div class="cm-newgrp"><input class="cm-input" id="cm-newgrp-input" placeholder="新分组名"><button class="cm-btn" id="cm-newgrp-btn">新建</button></div>' +
            '<div class="cm-sheet-btns">' +
                '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">保存</button>' +
            '</div>';
        root.querySelector('#cm-sheet-mask').classList.add('show');
        root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);
        root.querySelector('#cm-newgrp-btn').addEventListener('click', function () {
            var v = String(root.querySelector('#cm-newgrp-input').value || '').trim();
            if (!v) return;
            gs.push({ id: 'g' + Date.now().toString(36), name: v, color: STK_COLORS[gs.length % STK_COLORS.length], items: [] });
            saveGroups(c, gs);
            openGroupManageSheet();
        });
        sheet.querySelectorAll('#cm-mgr-list [data-del]').forEach(function (b) {
            b.addEventListener('click', function () {
                gs.splice(parseInt(b.getAttribute('data-del'), 10), 1);
                saveGroups(c, gs); openGroupManageSheet();
            });
        });
        root.querySelector('#cm-sheet-save').addEventListener('click', function () {
            sheet.querySelectorAll('#cm-mgr-list input[data-gi]').forEach(function (inp) {
                var i = parseInt(inp.getAttribute('data-gi'), 10);
                if (gs[i]) gs[i].name = String(inp.value || '').trim() || gs[i].name;
            });
            saveGroups(c, gs); closeSheet(); render(); notify('分组已保存');
        });
    }

    function openEditSheet(oldText) {
        var c = cat(curTab);
        var sheet = root.querySelector('#cm-sheet');
        sheet.innerHTML =
            '<div class="cm-sheet-title">编辑</div>' +
            '<textarea class="cm-sheet-ta" id="cm-edit-ta" rows="5">' + esc(oldText) + '</textarea>' +
            '<div class="cm-sheet-btns">' +
                '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">保存</button>' +
            '</div>';
        root.querySelector('#cm-sheet-mask').classList.add('show');
        root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);
        root.querySelector('#cm-sheet-save').addEventListener('click', function () {
            var v = String(root.querySelector('#cm-edit-ta').value || '').trim();
            if (!v) { notify('内容不能为空'); return; }
            var arr = c.get().slice();
            var i = arr.indexOf(oldText);
            if (i >= 0) arr[i] = v; else arr.push(v);
            c.set(arr);
            // 归属 / 分组里的引用同步改名
            if (c.scope && rootScope && rootScope[oldText] !== undefined) { rootScope[v] = rootScope[oldText]; delete rootScope[oldText]; saveScope(); }
            if (c.groupKey) {
                var gs = groupsOf(c).map(function (g) {
                    if (g && Array.isArray(g.items)) g.items = g.items.map(function (x) { return x === oldText ? v : x; });
                    return g;
                });
                saveGroups(c, gs);
            }
            try { if (typeof saveData === 'function') saveData(); } catch (e) {}
            closeSheet(); render(); notify('已保存');
        });
    }

    /* 归属：公用 / 专属（可多选联系人） */
    function openScopeSheet(text) {
        var cons = contacts();
        var cur = scopeOf(text);
        var isPub = (cur === 'public' || !Array.isArray(cur) || !cur.length);
        var sel = isPub ? [] : cur.slice();
        var sheet = root.querySelector('#cm-sheet');
        sheet.innerHTML =
            '<div class="cm-sheet-title">字卡归属</div>' +
            '<div class="cm-sheet-desc">「公用」所有人都能用；「专属」只有勾选的联系人会用到这条字卡</div>' +
            '<div class="cm-opt-row"><label class="cm-opt"><input type="radio" name="cm-scope-mode" value="public"' + (isPub ? ' checked' : '') + '> 公用（所有人）</label></div>' +
            '<div class="cm-opt-row"><label class="cm-opt"><input type="radio" name="cm-scope-mode" value="private"' + (isPub ? '' : ' checked') + '> 专属（指定联系人）</label></div>' +
            '<div class="cm-contact-list" id="cm-contact-list">' +
                (cons.length ? cons.map(function (s) {
                    return '<label class="cm-contact"><input type="checkbox" data-id="' + esc(s.id) + '"' + (sel.indexOf(s.id) >= 0 ? ' checked' : '') + '> ' + esc(s.name) + '</label>';
                }).join('') : '<div class="cm-sheet-desc">还没有联系人，先去传讯里添加好友</div>') +
            '</div>' +
            '<div class="cm-sheet-btns">' +
                '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">保存</button>' +
            '</div>';
        root.querySelector('#cm-sheet-mask').classList.add('show');
        root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);
        root.querySelector('#cm-sheet-save').addEventListener('click', function () {
            var mode = (root.querySelector('input[name="cm-scope-mode"]:checked') || {}).value || 'public';
            if (mode === 'public') {
                rootScope[text] = 'public';
            } else {
                var ids = [];
                root.querySelectorAll('#cm-contact-list input[type="checkbox"]').forEach(function (cb) {
                    if (cb.checked) ids.push(cb.getAttribute('data-id'));
                });
                if (!ids.length) { notify('至少勾选一个联系人'); return; }
                rootScope[text] = ids;
            }
            saveScope();
            closeSheet(); render();
            notify('已设为' + (mode === 'public' ? '公用' : '专属'));
        });
    }

    /* 分组：把这条内容放进某个分组 */
    function openGroupSheet(c, text) {
        var gs = groupsOf(c).slice();
        var cur = groupOfItem(c, text);
        var sheet = root.querySelector('#cm-sheet');
        sheet.innerHTML =
            '<div class="cm-sheet-title">设置分组</div>' +
            '<div class="cm-sheet-desc">分组会同步显示在聊天界面的表情面板里</div>' +
            '<div class="cm-contact-list">' +
                '<label class="cm-contact"><input type="radio" name="cm-grp" value=""' + (cur ? '' : ' checked') + '> 不分组</label>' +
                gs.map(function (g) {
                    var gid = String(g.id || g.name || '');
                    return '<label class="cm-contact"><input type="radio" name="cm-grp" value="' + esc(gid) + '"' + (cur && String(cur.id || cur.name || '') === gid ? ' checked' : '') + '> ' + esc(g.name || '分组') + '</label>';
                }).join('') +
            '</div>' +
            '<div class="cm-newgrp"><input class="cm-input" id="cm-newgrp-input" placeholder="新建分组名"><button class="cm-btn" id="cm-newgrp-btn">新建</button></div>' +
            '<div class="cm-sheet-btns">' +
                '<button class="cm-btn" id="cm-sheet-cancel">取消</button>' +
                '<button class="cm-btn cm-btn-primary" id="cm-sheet-save">保存</button>' +
            '</div>';
        root.querySelector('#cm-sheet-mask').classList.add('show');
        root.querySelector('#cm-sheet-cancel').addEventListener('click', closeSheet);
        root.querySelector('#cm-newgrp-btn').addEventListener('click', function () {
            var v = String(root.querySelector('#cm-newgrp-input').value || '').trim();
            if (!v) return;
            var id = 'g' + Date.now().toString(36);
            gs.push({ id: id, name: v, items: [] });
            saveGroups(c, gs);
            openGroupSheet(c, text);
        });
        root.querySelector('#cm-sheet-save').addEventListener('click', function () {
            var gid = (root.querySelector('input[name="cm-grp"]:checked') || {}).value || '';
            gs = groupsOf(c).map(function (g) {
                if (!Array.isArray(g.items)) g.items = [];
                g.items = g.items.filter(function (x) { return x !== text; });
                return g;
            });
            if (gid) {
                gs.forEach(function (g) {
                    if (String(g.id || g.name || '') === gid) {
                        g.items = (g.items || []).concat([text]);
                    }
                });
            }
            saveGroups(c, gs);
            closeSheet(); render(); notify('分组已保存');
        });
    }

    /* ---------- 打开 / 关闭 ---------- */
    /* ---------- 首次进入的种子数据 ----------
       空库点进去是「这里还没有内容」，用户不知道能干什么。
       只在所有分类都还没建过任何内容时灌一次示例，之后用户删光了也不再来。 */
    var SEED_FLAG = '_cmSeededV1';
    function seedIfEmpty() {
        try {
            if (localStorage.getItem(P() + SEED_FLAG)) return;
            var empties = CATS.filter(function (c) {
                try { var v = c.get(); return !Array.isArray(v) || v.length === 0; } catch (e) { return true; }
            });
            if (!empties.length) { localStorage.setItem(P() + SEED_FLAG, '1'); return; }

            var seed = {
                replies: ['在忙吗？', '刚刚在想你', '今天也要好好吃饭', '等你忙完来找我'],
                pokes: ['戳了戳你的脑袋', '轻轻碰了一下你的手', '拍了拍你的肩膀'],
                statuses: ['在忙', '有点困', '刚刚睡醒', '在想你'],
                mottos: ['今天也是想你的一天', '慢慢来比较快'],
                intros: ['ねえ，说话呀', '好久不见'],
                tapool: ['今天也要元气满满', '月亮很亮，像你', '想把这一刻留给你']
            };
            empties.forEach(function (c) {
                var list = seed[c.id];
                if (!list || !list.length) return;
                c.set(list.slice());
            });
            // TA签名库走 momentsProf.ta.pool，上面 c.set 已处理
            localStorage.setItem(P() + SEED_FLAG, '1');
        } catch (e) {}
    }

    function open(tabId) {
        build();
        if (tabId) curTab = tabId;
        seedIfEmpty();
        loadStickerGroups();
        loadScope().then(function () { render(); });
        root.classList.add('show');
        try { document.body.style.overflow = 'hidden'; } catch (e) {}
    }
    function close() {
        if (!root) return;
        root.classList.remove('show');
        closeSheet();
        try { document.body.style.overflow = ''; } catch (e) {}
    }

    /* 数据加载完成后再刷新一次，避免拿到空数组（须等会话就绪，否则存储键被拒） */
    if (window.whenSessionReady) {
        window.whenSessionReady(function () {
            loadScope();
            loadStickerGroups();
        });
    } else {
        loadScope();
        loadStickerGroups();
    }
    setTimeout(function () {
        loadScope();
        loadStickerGroups();
        try { if (root && root.classList.contains('show')) render(); } catch (e) {}
    }, 1500);

    /* core.js 抽回复时调用：判断这条字卡在当前会话能不能用 */
    window.__convReplyUsable = isUsable;

    window.CardManager = {
        open: open, close: close,
        isUsable: isUsable,
        scopeOf: scopeOf,
        groupsOf: groupsOf,
        loadStickerGroups: loadStickerGroups,
        openGroupManage: openGroupManageSheet,
        isOpen: function () { return !!(root && root.classList.contains('show')); }
    };
})();
