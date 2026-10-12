/* ============================================================
   日记 Diary —— 整页应用重做
   结构：顶栏 / 按月分组时间线 / 底部操作条
   子页：全屏编辑器（dy-editor）、全屏阅读页（dy-reader）
   数据：localforage 键 diary  [{id,date,text,mood,photo}]
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'diary';
    var MOODS = [
        { e: '😊', n: '开心' }, { e: '🥰', n: '心动' }, { e: '😌', n: '平静' },
        { e: '😐', n: '一般' }, { e: '😢', n: '难过' }, { e: '😡', n: '生气' },
        { e: '😴', n: '好困' }, { e: '💪', n: '加油' }, { e: '🌟', n: '闪耀' },
        { e: '🍀', n: '幸运' }, { e: '🥺', n: '想TA' }, { e: '☕', n: '慢下来' }
    ];

    var data = [];
    var editingId = null;
    var pickedMood = '';
    var pickedPhoto = '';
    var keyword = '';
    var curMonth = '';

    /* ---------------- 工具 ---------------- */
    function skey(k) {
        try { return (typeof getStorageKey === 'function') ? getStorageKey(k) : (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX + k : k); }
        catch (e) { return k; }
    }
    function esc(s) {
        return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function notify(m, t) {
        try { if (typeof showNotification === 'function') { showNotification(m, t || 'info', 1600); return; } } catch (e) {}
        var t2 = document.getElementById('cc-toast');
        if (!t2) { t2 = document.createElement('div'); t2.id = 'cc-toast'; document.body.appendChild(t2); }
        t2.textContent = m; t2.className = 'cc-toast'; void t2.offsetWidth; t2.className = 'cc-toast show';
        clearTimeout(t2._timer); t2._timer = setTimeout(function () { t2.className = 'cc-toast'; }, 1500);
    }
    var WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    function pad(n) { return String(n).padStart(2, '0'); }
    function monthKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
    function monthLabel(key) {
        var p = key.split('-');
        return p[0] + '年' + Number(p[1]) + '月';
    }
    function dayLabel(ts) {
        var d = new Date(ts);
        return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD[d.getDay()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fullLabel(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD[d.getDay()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function uid() { return 'd_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

    /* ---------------- 种子数据 ---------------- */
    function seed() {
        var now = Date.now();
        return [
            {
                id: uid(), date: now - 3600000 * 3, mood: '🌟',
                text: '今天把整个聊天应用重新翻了一遍。\n\n之前总觉得界面"哪里怪怪的"，今天终于知道怪在哪了 —— 不是配色不对，是每一页都被切成了两截，上半截能点，下半截像死了。后来把它们全改成整页，顶栏、内容、底部操作条各归各位，页面才终于像个"应用"。\n\n原来"截半"比"丑"更劝退。'
            },
            {
                id: uid(), date: now - 3600000 * 30, mood: '🥰',
                text: '路过花店，买了三支洋桔梗，一支白两支紫。\n\n插好之后整个房间都是香的，坐在桌前发了很久的呆，什么也没干，但心情莫名其妙地好。\n\n有些日子不需要做什么，记住它好闻就够了。'
            },
            {
                id: uid(), date: now - 3600000 * 74, mood: '😌',
                text: '把聊天记录导出了一份备份，换手机的时候不用从头翻。\n\n顺便删掉了 800 多张重复的截图。断舍离的第一步往往不是扔东西，是先知道自己有什么。'
            },
            {
                id: uid(), date: now - 3600000 * 120, mood: '☕',
                text: '雨天，窗外的雨声很大。\n\n煮了壶热咖啡，忽然想起以前说过"下雨天最适合发呆"，现在真下雨了，反而想找个人说说话。'
            }
        ];
    }

    function load() {
        return localforage.getItem(skey(KEY)).then(function (v) {
            if (Array.isArray(v) && v.length) { data = v; return data; }
            if (Array.isArray(v) && !v.length) { data = []; return data; }
            data = seed();
            persist();
            return data;
        }).catch(function () {
            try {
                var raw = localStorage.getItem(skey(KEY));
                if (raw) { data = JSON.parse(raw); }
            } catch (e) {}
            if (!data.length) { data = seed(); persist(); }
            return data;
        });
    }
    function persist() {
        try { localforage.setItem(skey(KEY), data); } catch (e) {}
        try { localStorage.setItem(skey(KEY), JSON.stringify(data)); } catch (e) {}
    }

    /* ---------------- DOM ---------------- */
    var built = false;
    function build() {
        if (built) return;
        built = true;

        var root = document.createElement('div');
        root.id = 'diary-root';
        root.className = 'dy-root';
        root.innerHTML =
            '<div class="dy-page" id="dy-page">' +
                '<header class="dy-bar">' +
                    '<button class="dy-bar-btn" id="dy-back"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="dy-bar-mid">' +
                        '<div class="dy-bar-title">日记</div>' +
                        '<div class="dy-bar-sub" id="dy-sub">正在读取…</div>' +
                    '</div>' +
                    '<button class="dy-bar-btn" id="dy-search"><i class="fas fa-magnifying-glass"></i></button>' +
                '</header>' +

                '<div class="dy-search" id="dy-searchbar">' +
                    '<i class="fas fa-magnifying-glass"></i>' +
                    '<input type="text" id="dy-kw" placeholder="搜索日记内容或心情">' +
                    '<button id="dy-kw-clear"><i class="fas fa-circle-xmark"></i></button>' +
                '</div>' +

                '<div class="dy-stats" id="dy-stats"></div>' +
                '<div class="dy-scroll" id="dy-scroll"><div id="dy-list"></div></div>' +

                '<div class="dy-foot">' +
                    '<button class="dy-foot-btn" id="dy-random"><i class="fas fa-shuffle"></i><span>随机回顾</span></button>' +
                    '<button class="dy-foot-main" id="dy-new"><i class="fas fa-feather-pointed"></i> 写一篇</button>' +
                    '<button class="dy-foot-btn" id="dy-month-jump"><i class="fas fa-calendar"></i><span>按月</span></button>' +
                '</div>' +
            '</div>' +

            /* 写作 / 编辑 全屏子页 */
            '<div class="dy-sub" id="dy-editor">' +
                '<header class="dy-bar dy-bar-sub">' +
                    '<button class="dy-bar-btn" id="dy-cancel">取消</button>' +
                    '<div class="dy-bar-mid"><div class="dy-bar-title" id="dy-editor-title">写日记</div>' +
                    '<div class="dy-bar-sub" id="dy-editor-date"></div></div>' +
                    '<button class="dy-bar-btn dy-bar-ok" id="dy-save">保存</button>' +
                '</header>' +
                '<div class="dy-editor-body">' +
                    '<textarea id="dy-text" placeholder="今天发生了什么？" maxlength="5000"></textarea>' +
                    '<div class="dy-editor-photo" id="dy-photo-wrap">' +
                        '<img id="dy-photo" alt="">' +
                        '<button id="dy-photo-rm"><i class="fas fa-trash-can"></i></button>' +
                    '</div>' +
                '</div>' +
                '<div class="dy-editor-foot">' +
                    '<div class="dy-mood-row" id="dy-moods"></div>' +
                    '<button class="dy-icon-btn" id="dy-pick"><i class="fas fa-image"></i></button>' +
                '</div>' +
            '</div>' +

            /* 阅读 全屏子页 */
            '<div class="dy-sub" id="dy-reader">' +
                '<header class="dy-bar dy-bar-sub">' +
                    '<button class="dy-bar-btn" id="dy-r-close"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="dy-bar-mid"><div class="dy-bar-title" id="dy-r-date"></div>' +
                    '<div class="dy-bar-sub" id="dy-r-mood"></div></div>' +
                    '<button class="dy-bar-btn" id="dy-r-edit"><i class="fas fa-pen"></i></button>' +
                    '<button class="dy-bar-btn" id="dy-r-del"><i class="fas fa-trash-can"></i></button>' +
                '</header>' +
                '<div class="dy-reader-body">' +
                    '<div class="dy-reader-photo" id="dy-r-photo-wrap"><img id="dy-r-photo" alt=""></div>' +
                    '<div class="dy-reader-text" id="dy-r-text"></div>' +
                '</div>' +
            '</div>' +

            /* 月份选择 */
            '<div class="dy-sub dy-sub-sheet" id="dy-months">' +
                '<header class="dy-bar dy-bar-sub">' +
                    '<button class="dy-bar-btn" id="dy-mo-close"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="dy-bar-mid"><div class="dy-bar-title">按月浏览</div></div>' +
                    '<span style="width:38px"></span>' +
                '</header>' +
                '<div class="dy-scroll"><div class="dy-month-list" id="dy-month-list"></div></div>' +
            '</div>';

        document.body.appendChild(root);

        var photoInput = document.createElement('input');
        photoInput.type = 'file'; photoInput.accept = 'image/*'; photoInput.id = 'dy-file';
        photoInput.style.display = 'none';
        photoInput.addEventListener('change', onFile);
        document.body.appendChild(photoInput);

        bind(root, photoInput);
    }

    function el(id) { return document.getElementById(id); }

    function bind(root) {
        el('dy-back').addEventListener('click', close);
        el('dy-search').addEventListener('click', function () {
            var b = el('dy-searchbar');
            var on = b.classList.toggle('on');
            if (on) { el('dy-kw').focus(); } else { keyword = ''; el('dy-kw').value = ''; render(); }
        });
        el('dy-kw').addEventListener('input', function (e) { keyword = e.target.value.trim(); render(); });
        el('dy-kw-clear').addEventListener('click', function () { keyword = ''; el('dy-kw').value = ''; render(); });

        el('dy-new').addEventListener('click', function () { openEditor(null); });
        el('dy-random').addEventListener('click', randomRecall);
        el('dy-month-jump').addEventListener('click', openMonths);

        el('dy-cancel').addEventListener('click', closeEditor);
        el('dy-save').addEventListener('click', saveEntry);
        el('dy-pick').addEventListener('click', pickPhoto);
        el('dy-photo-rm').addEventListener('click', function () {
            pickedPhoto = ''; el('dy-photo-wrap').classList.remove('on'); el('dy-photo').src = '';
        });

        el('dy-r-close').addEventListener('click', closeReader);
        el('dy-r-edit').addEventListener('click', function () {
            var id = el('dy-reader').getAttribute('data-id');
            closeReader(); openEditor(id);
        });
        el('dy-r-del').addEventListener('click', function () {
            var id = el('dy-reader').getAttribute('data-id');
            if (!id) return;
            if (!confirm('删除这篇日记？')) return;
            data = data.filter(function (x) { return x.id !== id; });
            persist(); closeReader(); renderStats(); render(); notify('已删除');
        });

        el('dy-mo-close').addEventListener('click', function () { el('dy-months').classList.remove('on'); });

        // 心情
        var box = el('dy-moods');
        MOODS.forEach(function (m) {
            var b = document.createElement('button');
            b.className = 'dy-mood'; b.type = 'button';
            b.setAttribute('data-e', m.e);
            b.innerHTML = '<span class="dy-mood-e">' + m.e + '</span><span class="dy-mood-n">' + m.n + '</span>';
            b.addEventListener('click', function () {
                pickedMood = (pickedMood === m.e) ? '' : m.e;
                syncMoods();
            });
            box.appendChild(b);
        });
    }

    function syncMoods() {
        Array.prototype.forEach.call(el('dy-moods').children, function (c) {
            c.classList.toggle('on', c.getAttribute('data-e') === pickedMood);
        });
    }

    function onFile(e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        var r = new FileReader();
        r.onload = function () { setPhoto(r.result); };
        r.readAsDataURL(f);
    }
    function setPhoto(url) {
        pickedPhoto = url;
        el('dy-photo-wrap').classList.add('on');
        el('dy-photo').src = url;
    }
    function pickPhoto() {
        if (window.Album && typeof window.Album.pickImage === 'function') {
            try { window.Album.pickImage(function (url) { if (url) setPhoto(url); }); return; } catch (e) {}
        }
        el('dy-file').click();
    }

    /* ---------------- 统计 ---------------- */
    function renderStats() {
        var box = el('dy-stats');
        if (!box) return;
        if (!data.length) { box.style.display = 'none'; return; }
        box.style.display = 'grid';

        var words = 0, photos = 0;
        data.forEach(function (it) {
            words += String(it.text || '').length;
            if (it.photo) photos++;
        });
        var days = {};
        data.forEach(function (it) { var k = monthKey(it.date); days[k] = (days[k] || 0) + 1; });

        var span = data.length > 1
            ? Math.max(1, Math.round((Math.max.apply(null, data.map(function (d) { return d.date; })) -
                Math.min.apply(null, data.map(function (d) { return d.date; }))) / 86400000))
            : 0;

        box.innerHTML =
            cell('共 ' + data.length, '篇日记') +
            cell(String(words), '个字') +
            cell(String(Object.keys(days).length), '个月') +
            cell(String(span), '天跨度') +
            cell(String(photos), '张照片');
    }
    function cell(a, b) {
        return '<div class="dy-stat"><div class="dy-stat-a">' + esc(a) + '</div><div class="dy-stat-b">' + esc(b) + '</div></div>';
    }

    /* ---------------- 列表 ---------------- */
    function filtered() {
        var arr = data.slice().sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
        if (keyword) {
            var k = keyword.toLowerCase();
            arr = arr.filter(function (it) {
                return String(it.text || '').toLowerCase().indexOf(k) >= 0
                    || String(it.mood || '').indexOf(keyword) >= 0;
            });
        }
        if (curMonth) arr = arr.filter(function (it) { return monthKey(it.date) === curMonth; });
        return arr;
    }

    function render() {
        var list = el('dy-list');
        if (!list) return;

        var total = data.length;
        var arr = filtered();

        var sub = el('dy-sub');
        if (sub) {
            var s = total ? ('共 ' + total + ' 篇') : '还没有日记';
            if (keyword) s = '找到 ' + arr.length + ' 篇';
            if (curMonth) s = monthLabel(curMonth) + ' · ' + arr.length + ' 篇';
            sub.textContent = s;
        }

        if (!arr.length) {
            list.innerHTML =
                '<div class="dy-empty">' +
                    '<div class="dy-empty-ico"><i class="fas fa-feather-pointed"></i></div>' +
                    '<div class="dy-empty-t">' + (keyword || curMonth ? '没有符合条件的日记' : '从今天开始记下来') + '</div>' +
                    '<div class="dy-empty-s">' + (keyword || curMonth ? '换个关键词或月份试试' : '写一句也算，不必长篇大论') + '</div>' +
                    (keyword || curMonth ? '<button class="dy-empty-btn" id="dy-clear-filter">清除筛选</button>' : '<button class="dy-empty-btn" id="dy-empty-new">写第一篇</button>') +
                '</div>';
            var cb = el('dy-clear-filter');
            if (cb) cb.addEventListener('click', function () {
                keyword = ''; curMonth = ''; el('dy-kw').value = ''; render();
            });
            var nb = el('dy-empty-new');
            if (nb) nb.addEventListener('click', function () { openEditor(null); });
            return;
        }

        // 按月分组
        var groups = [], idx = {};
        arr.forEach(function (it) {
            var k = monthKey(it.date);
            if (!idx[k]) { idx[k] = { key: k, list: [] }; groups.push(idx[k]); }
            idx[k].list.push(it);
        });

        list.innerHTML = groups.map(function (g) {
            var words = g.list.reduce(function (s, it) { return s + String(it.text || '').length; }, 0);
            return '<div class="dy-group">' +
                '<div class="dy-group-hd" data-month="' + g.key + '">' +
                    '<span class="dy-group-t">' + esc(monthLabel(g.key)) + '</span>' +
                    '<span class="dy-group-c">' + g.list.length + ' 篇 · ' + words + ' 字</span>' +
                '</div>' +
                g.list.map(card).join('') +
            '</div>';
        }).join('');

        Array.prototype.forEach.call(list.querySelectorAll('.dy-card'), function (c) {
            c.addEventListener('click', function () { openReader(c.getAttribute('data-id')); });
        });
        Array.prototype.forEach.call(list.querySelectorAll('.dy-group-hd'), function (h) {
            h.addEventListener('click', function () {
                curMonth = curMonth === h.getAttribute('data-month') ? '' : h.getAttribute('data-month');
                render();
            });
        });
    }

    function card(it) {
        var text = String(it.text || '');
        var snippet = text.length > 120 ? text.slice(0, 120) + '…' : text;
        return '<div class="dy-card" data-id="' + it.id + '">' +
            '<div class="dy-card-l">' +
                '<div class="dy-card-mood">' + (it.mood ? esc(it.mood) : '·') + '</div>' +
                '<div class="dy-card-date">' + esc(dayLabel(it.date)) + '</div>' +
            '</div>' +
            '<div class="dy-card-r">' +
                (it.photo ? '<div class="dy-card-thumb" style="background-image:url(\'' + esc(it.photo) + '\')"></div>' : '') +
                '<div class="dy-card-text">' + esc(snippet) + '</div>' +
                '<div class="dy-card-meta">' + text.length + ' 字' + (it.photo ? ' · 含照片' : '') + '</div>' +
            '</div>' +
        '</div>';
    }

    /* ---------------- 月份列表 ---------------- */
    function openMonths() {
        var box = el('dy-month-list');
        var groups = {};
        data.forEach(function (it) { var k = monthKey(it.date); groups[k] = (groups[k] || 0) + 1; });
        var keys = Object.keys(groups).sort().reverse();
        box.innerHTML =
            '<button class="dy-mo-item' + (curMonth ? '' : ' on') + '" data-k="">' +
                '<span>全部</span><span class="dy-mo-n">' + data.length + ' 篇</span></button>' +
            keys.map(function (k) {
                return '<button class="dy-mo-item' + (curMonth === k ? ' on' : '') + '" data-k="' + k + '">' +
                    '<span>' + esc(monthLabel(k)) + '</span><span class="dy-mo-n">' + groups[k] + ' 篇</span></button>';
            }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('.dy-mo-item'), function (b) {
            b.addEventListener('click', function () {
                curMonth = b.getAttribute('data-k');
                el('dy-months').classList.remove('on');
                render();
            });
        });
        el('dy-months').classList.add('on');
    }

    /* ---------------- 随机回顾 ---------------- */
    function randomRecall() {
        if (!data.length) { notify('还没有日记可以回顾'); return; }
        var it = data[Math.floor(Math.random() * data.length)];
        openReader(it.id);
    }

    /* ---------------- 阅读页 ---------------- */
    var readerId = null;
    function openReader(id) {
        var it = data.find(function (x) { return x.id === id; });
        if (!it) return;
        readerId = id;
        var r = el('dy-reader');
        r.setAttribute('data-id', id);
        el('dy-r-date').textContent = fullLabel(it.date);
        el('dy-r-mood').textContent = (it.mood || '没有标记心情') + ' · ' + String(it.text || '').length + ' 字';
        el('dy-r-text').textContent = it.text || '';
        if (it.photo) {
            el('dy-r-photo-wrap').classList.add('on');
            el('dy-r-photo').src = it.photo;
        } else {
            el('dy-r-photo-wrap').classList.remove('on');
            el('dy-r-photo').src = '';
        }
        r.classList.add('on');
        el('dy-page').classList.remove('dy-behind');
    }
    function closeReader() {
        el('dy-reader').classList.remove('on');
        readerId = null;
        if (el('dy-page')) el('dy-page').classList.remove('dy-behind');
    }

    /* ---------------- 编辑器 ---------------- */
    function openEditor(id) {
        closeReader();
        editingId = id || null;
        if (editingId) {
            var it = data.find(function (x) { return x.id === editingId; });
            if (!it) { editingId = null; }
            else {
                pickedMood = it.mood || '';
                el('dy-text').value = it.text || '';
                el('dy-editor-title').textContent = '编辑日记';
                el('dy-editor-date').textContent = fullLabel(it.date);
                if (it.photo) setPhoto(it.photo); else { pickedPhoto = ''; el('dy-photo-wrap').classList.remove('on'); el('dy-photo').src = ''; }
                syncMoods();
                el('dy-editor').classList.add('on');
                el('dy-page').classList.add('dy-behind');
                setTimeout(function () { el('dy-text').focus(); }, 60);
                return;
            }
        }
        pickedMood = ''; pickedPhoto = '';
        el('dy-text').value = '';
        el('dy-editor-title').textContent = '写日记';
        el('dy-editor-date').textContent = fullLabel(Date.now());
        el('dy-photo-wrap').classList.remove('on');
        el('dy-photo').src = '';
        syncMoods();
        el('dy-editor').classList.add('on');
        el('dy-page').classList.add('dy-behind');
        setTimeout(function () { el('dy-text').focus(); }, 60);
    }
    function closeEditor() {
        var t = el('dy-text');
        if (t && t.value.trim()) {
            if (!confirm('放弃这次未保存的内容？')) return;
        }
        el('dy-editor').classList.remove('on');
        el('dy-page').classList.remove('dy-behind');
        editingId = null; pickedMood = ''; pickedPhoto = '';
        var t2 = el('dy-text'); if (t2) t2.value = '';
    }

    function saveEntry() {
        var text = (el('dy-text').value || '').trim();
        if (!text && !pickedPhoto) { notify('写点什么再保存吧'); return; }
        if (editingId) {
            var it = data.find(function (x) { return x.id === editingId; });
            if (it) { it.text = text; it.mood = pickedMood; it.photo = pickedPhoto; }
        } else {
            data.push({ id: uid(), date: Date.now(), text: text, mood: pickedMood, photo: pickedPhoto });
        }
        persist();
        el('dy-editor').classList.remove('on');
        el('dy-page').classList.remove('dy-behind');
        var wasEdit = !!editingId;
        editingId = null; pickedMood = ''; pickedPhoto = '';
        el('dy-text').value = '';
        renderStats(); render();
        notify(wasEdit ? '已更新' : '已保存');
    }

    /* ---------------- 开关 ---------------- */
    function open() {
        build();
        el('diary-root').classList.add('on');
        load().then(function () { renderStats(); render(); });
    }
    function close() {
        var r = el('diary-root');
        if (!r) return;
        r.classList.remove('on');
        el('dy-reader').classList.remove('on');
        el('dy-editor').classList.remove('on');
        el('dy-months').classList.remove('on');
        editingId = null;
    }

    window.Diary = { open: open, close: close, count: function () { return data.length; } };
})();
