/* ============================================================
   相册 Album —— 整页应用重做
   结构：顶栏 / 分段（照片·收藏）/ 按月分组网格 / 底部操作条
   子页：全屏大图查看（ab-viewer）、全屏添加/导入（ab-add）
   数据：localforage 键 album  [{id,src,ts,tag,fav}]
   对外：Album.open(cb) / random / one / list / count / pickImage
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'album';
    var items = [];
    var built = false;
    var onPickCb = null;
    var pickMode = false;
    var sel = {};          // 多选 id map
    var tab = 'all';       // all | fav
    var keyword = '';
    var curMonth = '';
    var viewerId = null;

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function notify(m, t) {
        try { if (typeof showNotification === 'function') { showNotification(m, t || 'info', 1600); return; } } catch (e) {}
        var n = document.getElementById('cc-toast');
        if (!n) { n = document.createElement('div'); n.id = 'cc-toast'; document.body.appendChild(n); }
        n.textContent = m; n.className = 'cc-toast'; void n.offsetWidth; n.className = 'cc-toast show';
        clearTimeout(n._timer); n._timer = setTimeout(function () { n.className = 'cc-toast'; }, 1500);
    }
    function skey(k) {
        try { return (typeof getStorageKey === 'function') ? getStorageKey(k) : (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX + k : k); }
        catch (e) { return k; }
    }
    function uid() { return 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function mkey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
    function mlabel(k) { var p = k.split('-'); return p[0] + '年' + Number(p[1]) + '月'; }
    function flabel(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    /* ---------------- 存储 ---------------- */
    function save() {
        try { localforage.setItem(skey(KEY), items).catch(function () {}); } catch (e) {}
        try { localStorage.setItem(skey(KEY), JSON.stringify(items.map(function (x) {
            return { id: x.id, src: x.src, ts: x.ts, tag: x.tag || '', fav: !!x.fav };
        }))); } catch (e) {}
    }
    function load() {
        return localforage.getItem(skey(KEY)).then(function (r) {
            if (Array.isArray(r) && r.length) {
                // 占位图样式已更新，重新生成种子
                if (String(r[0].id || '').indexOf('a2_') === 0) { items = r; return items; }
            }
            try { var raw = localStorage.getItem(skey(KEY)); if (raw) items = JSON.parse(raw) || []; } catch (e) {}
            var allSeed = !items.length || String(items[0].id || '').indexOf('a2_') === 0;
            items = allSeed ? seed() : items;
            save();
            return items;
        }).catch(function () {
            try { var raw = localStorage.getItem(skey(KEY)); if (raw) items = JSON.parse(raw) || []; } catch (e) {}
            if (!items.length || String(items[0].id || '').indexOf('a2_') === 0) { items = seed(); save(); }
            return items;
        });
    }

    /* 种子：内联 SVG 占位图，保证首次进入不是空白，且朋友圈/随机发图有素材 */
    function svgPhoto(c1, c2, label) {
        var s = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="0.45" y2="1">' +
            '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
            '</linearGradient></defs>' +
            '<rect width="900" height="900" fill="url(#g)"/>' +
            '<circle cx="690" cy="230" r="130" fill="rgba(255,255,255,.2)"/>' +
            '<circle cx="220" cy="700" r="200" fill="rgba(255,255,255,.13)"/>' +
            '<text x="450" y="480" text-anchor="middle" font-family="PingFang SC, sans-serif" ' +
            'font-size="64" fill="rgba(255,255,255,.92)">' + label + '</text>' +
            '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    }
    function seed() {
        var now = Date.now();
        return [
            { id: 'a2_' + uid(), src: svgPhoto('#f7b2b9', '#c98bb0', '黄昏'), ts: now - 3600000 * 5, tag: '风景', fav: true },
            { id: 'a2_' + uid(), src: svgPhoto('#a1d3f4', '#7fa8d6', '海'), ts: now - 3600000 * 26, tag: '海', fav: false },
            { id: 'a2_' + uid(), src: svgPhoto('#fde7b0', '#e8b06a', '晚霞'), ts: now - 3600000 * 54, tag: '天空', fav: false },
            { id: 'a2_' + uid(), src: svgPhoto('#bde8c8', '#6fbf9a', '绿'), ts: now - 3600000 * 96, tag: '植物', fav: true },
            { id: 'a2_' + uid(), src: svgPhoto('#d6c8f5', '#8f7ad1', '夜色'), ts: now - 3600000 * 140, tag: '夜', fav: false },
            { id: 'a2_' + uid(), src: svgPhoto('#ffd0c2', '#e58a72', '晚风'), ts: now - 3600000 * 190, tag: '', fav: false }
        ];
    }

    /* ---------------- DOM ---------------- */
    function el(id) { return document.getElementById(id); }

    function build() {
        if (built) return;
        built = true;

        var root = document.createElement('div');
        root.id = 'ab-root';
        root.className = 'ab-root';
        root.innerHTML =
            '<div class="ab-page" id="ab-page">' +
                '<header class="ab-bar">' +
                    '<button class="ab-bar-btn" id="ab-back"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="ab-bar-mid">' +
                        '<div class="ab-bar-title" id="ab-title">相册</div>' +
                        '<div class="ab-bar-sub" id="ab-sub">正在读取…</div>' +
                    '</div>' +
                    '<button class="ab-bar-btn" id="ab-select"><i class="fas fa-check-double"></i></button>' +
                '</header>' +

                '<div class="ab-tabs" id="ab-tabs">' +
                    '<button class="ab-tab on" data-tab="all">全部</button>' +
                    '<button class="ab-tab" data-tab="fav">收藏</button>' +
                '</div>' +

                '<div class="ab-pickbar" id="ab-pickbar">' +
                    '<button class="ab-pick-x" id="ab-pick-cancel"><i class="fas fa-xmark"></i></button>' +
                    '<span class="ab-pick-t">选一张放进日记 / 朋友圈</span>' +
                '</div>' +

                '<div class="ab-stats" id="ab-stats"></div>' +
                '<div class="ab-scroll" id="ab-scroll"><div id="ab-body"></div></div>' +

                '<div class="ab-foot">' +
                    '<button class="ab-foot-btn" id="ab-month-jump"><i class="fas fa-calendar"></i><span>按月</span></button>' +
                    '<button class="ab-foot-main" id="ab-add"><i class="fas fa-plus"></i> 添加照片</button>' +
                    '<button class="ab-foot-btn" id="ab-fav-all"><i class="fas fa-star"></i><span id="ab-fav-t">收藏</span></button>' +
                '</div>' +
            '</div>' +

            /* 多选操作条 */
            '<div class="ab-selbar" id="ab-selbar">' +
                '<button class="ab-sel-x" id="ab-sel-cancel"><i class="fas fa-xmark"></i></button>' +
                '<span class="ab-sel-n" id="ab-sel-n">已选 0 张</span>' +
                '<button class="ab-sel-a" id="ab-sel-fav"><i class="fas fa-star"></i></button>' +
                '<button class="ab-sel-a danger" id="ab-sel-del"><i class="fas fa-trash-can"></i></button>' +
            '</div>' +

            /* 大图查看 */
            '<div class="ab-sub" id="ab-viewer">' +
                '<header class="ab-bar ab-bar-dark">' +
                    '<button class="ab-bar-btn" id="ab-v-close"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="ab-bar-mid"><div class="ab-bar-title" id="ab-v-title"></div>' +
                    '<div class="ab-bar-sub" id="ab-v-sub"></div></div>' +
                    '<button class="ab-bar-btn" id="ab-v-fav"><i class="fas fa-star"></i></button>' +
                    '<button class="ab-bar-btn" id="ab-v-del"><i class="fas fa-trash-can"></i></button>' +
                '</header>' +
                '<div class="ab-viewer-body"><img id="ab-v-img" alt=""></div>' +
                '<footer class="ab-viewer-foot">' +
                    '<button class="ab-vf-btn" id="ab-v-tag"># 标签</button>' +
                    '<button class="ab-vf-btn" id="ab-v-copy">设为背景</button>' +
                    '<button class="ab-vf-btn" id="ab-v-pick">选用这张</button>' +
                '</footer>' +
            '</div>' +

            /* 添加页 */
            '<div class="ab-sub" id="ab-addpage">' +
                '<header class="ab-bar">' +
                    '<button class="ab-bar-btn" id="ab-a-cancel"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="ab-bar-mid"><div class="ab-bar-title">添加照片</div>' +
                    '<div class="ab-bar-sub">存进相册后 TA 就能拿去发朋友圈了</div></div>' +
                    '<span style="width:34px"></span>' +
                '</header>' +
                '<div class="ab-scroll">' +
                    '<div class="ab-add-box">' +
                        '<div class="ab-drop" id="ab-drop">' +
                            '<i class="fas fa-cloud-arrow-up"></i>' +
                            '<div class="ab-drop-t">选择照片</div>' +
                            '<div class="ab-drop-s">支持一次选多张，会自动压缩</div>' +
                            '<button class="ab-drop-btn" id="ab-a-pick">从设备选择</button>' +
                        '</div>' +
                        '<div class="ab-tagbox">' +
                            '<div class="ab-sec-t">给这批照片加个标签</div>' +
                            '<div class="ab-tags" id="ab-tag-list"></div>' +
                            '<input class="ab-tag-input" id="ab-tag-input" placeholder="自定义标签，回车确认" maxlength="12">' +
                        '</div>' +
                        '<div class="ab-tipbox">' +
                            '<div class="ab-sec-t">这些照片会被用在哪里</div>' +
                            '<ul>' +
                                '<li>TA 发朋友圈时随机配图</li>' +
                                '<li>TA 更换主页背景时抽取</li>' +
                                '<li>聊天中 TA 随机发给你</li>' +
                            '</ul>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="ab-add-foot">' +
                    '<button class="ab-add-save" id="ab-a-save">保存到相册</button>' +
                '</div>' +
            '</div>' +

            /* 按月浏览 */
            '<div class="ab-sub ab-sub-sheet" id="ab-months">' +
                '<header class="ab-bar">' +
                    '<button class="ab-bar-btn" id="ab-mo-close"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="ab-bar-mid"><div class="ab-bar-title">按月浏览</div></div>' +
                    '<span style="width:34px"></span>' +
                '</header>' +
                '<div class="ab-scroll"><div class="ab-month-list" id="ab-month-list"></div></div>' +
            '</div>';

        document.body.appendChild(root);

        var input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
        input.id = 'ab-file'; input.style.display = 'none';
        input.addEventListener('change', function (e) { addFiles(e.target.files); input.value = ''; });
        document.body.appendChild(input);

        // 待添加队列
        root.__queue = [];
        root.__tags = [];

        bind(root, input);
    }

    var COMMON_TAGS = ['风景', '自拍', '食物', '夜', '天空', '海', '猫', '植物', '街拍', '旅行'];

    function bind(root, input) {
        el('ab-back').addEventListener('click', function () {
            if (selMode()) { exitSelect(); return; }
            close();
        });
        el('ab-select').addEventListener('click', function () {
            selMode() ? exitSelect() : enterSelect();
        });

        Array.prototype.forEach.call(el('ab-tabs').children, function (t) {
            t.addEventListener('click', function () {
                Array.prototype.forEach.call(el('ab-tabs').children, function (x) { x.classList.remove('on'); });
                t.classList.add('on');
                tab = t.getAttribute('data-tab');
                render();
            });
        });

        el('ab-pick-cancel').addEventListener('click', function () {
            if (onPickCb) { var c = onPickCb; onPickCb = null; close(); try { c(''); } catch (e) {} return; }
            close();
        });

        el('ab-add').addEventListener('click', openAdd);
        el('ab-a-pick').addEventListener('click', function () { input.click(); });
        el('ab-a-cancel').addEventListener('click', closeAdd);
        el('ab-a-save').addEventListener('click', saveQueue);

        el('ab-drop').addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('over'); });
        el('ab-drop').addEventListener('dragleave', function () { this.classList.remove('over'); });
        el('ab-drop').addEventListener('drop', function (e) {
            e.preventDefault(); this.classList.remove('over');
            addFiles(e.dataTransfer.files);
        });

        // 标签
        var tl = el('ab-tag-list');
        COMMON_TAGS.forEach(function (t) {
            var b = document.createElement('button');
            b.className = 'ab-tag-chip'; b.type = 'button'; b.textContent = t;
            b.addEventListener('click', function () { toggleTag(t); });
            tl.appendChild(b);
        });
        el('ab-tag-input').addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var v = this.value.trim();
            if (!v) return;
            toggleTag(v); this.value = '';
        });

        el('ab-month-jump').addEventListener('click', openMonths);
        el('ab-mo-close').addEventListener('click', function () { el('ab-months').classList.remove('on'); });
        el('ab-fav-all').addEventListener('click', function () {
            tab = tab === 'fav' ? 'all' : 'fav';
            Array.prototype.forEach.call(el('ab-tabs').children, function (x) {
                x.classList.toggle('on', x.getAttribute('data-tab') === tab);
            });
            render();
        });

        // 多选
        el('ab-sel-cancel').addEventListener('click', exitSelect);
        el('ab-sel-fav').addEventListener('click', function () {
            var ids = Object.keys(sel); if (!ids.length) { notify('先选中照片'); return; }
            var allFav = ids.every(function (id) { var it = find(id); return it && it.fav; });
            ids.forEach(function (id) { var it = find(id); if (it) it.fav = !allFav; });
            save(); notify(allFav ? '已取消收藏' : '已收藏 ' + ids.length + ' 张');
            renderStats(); render();
        });
        el('ab-sel-del').addEventListener('click', function () {
            var ids = Object.keys(sel); if (!ids.length) { notify('先选中照片'); return; }
            if (!confirm('删除选中的 ' + ids.length + ' 张照片？')) return;
            items = items.filter(function (it) { return sel[it.id] !== true; });
            sel = {}; save(); renderStats(); render();
            el('ab-selbar').classList.remove('on');
            notify('已删除');
        });

        // 大图
        el('ab-v-close').addEventListener('click', closeViewer);
        el('ab-v-fav').addEventListener('click', function () {
            var it = find(viewerId); if (!it) return;
            it.fav = !it.fav; save(); renderStats(); render(); paintViewer(it);
            notify(it.fav ? '已收藏' : '已取消收藏');
        });
        el('ab-v-del').addEventListener('click', function () {
            var it = find(viewerId); if (!it) return;
            if (!confirm('从相册里删掉这张？')) return;
            items = items.filter(function (x) { return x.id !== viewerId; });
            save(); closeViewer(); renderStats(); render(); notify('已删除');
        });
        el('ab-v-tag').addEventListener('click', function () {
            var it = find(viewerId); if (!it) return;
            var v = prompt('给这张照片加个标签', it.tag || '');
            if (v === null) return;
            it.tag = v.trim(); save(); render(); paintViewer(it);
        });
        el('ab-v-copy').addEventListener('click', function () {
            var it = find(viewerId); if (!it) return;
            try {
                if (typeof setWallpaper === 'function') { setWallpaper(it.src); notify('已设为 TA 的主页背景'); }
                else if (typeof setBackground === 'function') { setBackground(it.src); notify('已设为背景'); }
                else {
                    var raw = localStorage.getItem(skey('wallpaper')) || localStorage.getItem('wallpaper');
                    if (raw) { var o = JSON.parse(raw); o.src = it.src; localStorage.setItem(skey('wallpaper'), JSON.stringify(o)); }
                    notify('已设为背景');
                }
            } catch (e) { notify('当前版本不支持，试试别的方式'); }
        });
        el('ab-v-pick').addEventListener('click', function () {
            var it = find(viewerId); if (!it) return;
            if (onPickCb) { var c = onPickCb; onPickCb = null; close(); try { c(it.src); } catch (e) {} return; }
            notify('已复制图片链接');
            try { navigator.clipboard.writeText(it.src); } catch (e) {}
        });
    }

    function find(id) { return items.filter(function (x) { return x.id === id; })[0]; }
    function selMode() { return el('ab-selbar').classList.contains('on'); }
    function enterSelect() {
        sel = {};
        el('ab-selbar').classList.add('on');
        el('ab-pickbar').classList.remove('on');
        render();
    }
    function exitSelect() {
        sel = {};
        el('ab-selbar').classList.remove('on');
        render();
    }

    function toggleTag(t) {
        var q = el('ab-root').__queue || (el('ab-root').__queue = []);
        var tags = el('ab-root').__tags || (el('ab-root').__tags = []);
        var i = tags.indexOf(t);
        if (i >= 0) tags.splice(i, 1); else tags.push(t);
        syncTags();
    }
    function syncTags() {
        var tags = el('ab-root').__tags || [];
        Array.prototype.forEach.call(el('ab-tag-list').children, function (c) {
            c.classList.toggle('on', tags.indexOf(c.textContent) >= 0);
        });
    }

    /* ---------------- 添加 ---------------- */
    var rootEl = null;
    function openAdd() {
        if (!rootEl) rootEl = el('ab-root');
        rootEl.__queue = [];
        rootEl.__tags = [];
        syncTags();
        paintQueue();
        el('ab-addpage').classList.add('on');
        el('ab-page').classList.add('ab-behind');
    }
    function closeAdd() {
        el('ab-addpage').classList.remove('on');
        el('ab-page').classList.remove('ab-behind');
    }
    function paintQueue() {
        var q = el('ab-root').__queue || [];
        var d = el('ab-drop');
        var html = '<i class="fas fa-cloud-arrow-up"></i>' +
            '<div class="ab-drop-t">' + (q.length ? ('已选 ' + q.length + ' 张') : '选择照片') + '</div>' +
            '<div class="ab-drop-s">' + (q.length ? '可以继续添加，或直接保存' : '支持一次选多张，会自动压缩') + '</div>' +
            '<button class="ab-drop-btn" id="ab-a-pick2">' + (q.length ? '继续添加' : '从设备选择') + '</button>';
        d.innerHTML = html;
        d.classList.toggle('has', q.length > 0);
        var b = el('ab-a-pick2');
        if (b) b.addEventListener('click', function () { el('ab-file').click(); });
    }
    function addFiles(files) {
        var fs = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//i.test(f.type); });
        if (!fs.length) return;
        var done = 0;
        fs.forEach(function (f) {
            var push = function (url) {
                if (url) el('ab-root').__queue.push({ src: url });
                done++;
                if (done === fs.length) paintQueue();
            };
            if (typeof compressImageSmart === 'function' && !/gif$/i.test(f.type)) {
                compressImageSmart(f, 0.7, 1500).then(push).catch(function () { readRaw(f, push); });
            } else readRaw(f, push);
        });
    }
    function readRaw(f, cb) {
        var r = new FileReader();
        r.onload = function (e) { cb(e.target.result); };
        r.onerror = function () { cb(''); };
        r.readAsDataURL(f);
    }
    function saveQueue() {
        var q = el('ab-root').__queue || [];
        var tags = el('ab-root').__tags || [];
        if (!q.length) { notify('先选几张照片'); return; }
        var now = Date.now();
        q.forEach(function (x, i) {
            items.push({
                id: uid(), src: x.src, ts: now - (q.length - i) * 1000,
                tag: tags[0] || '', fav: false
            });
        });
        save(); closeAdd(); renderStats(); render();
        notify('已保存 ' + q.length + ' 张', 'success');
    }

    /* ---------------- 统计 ---------------- */
    function renderStats() {
        var box = el('ab-stats');
        if (!box) return;
        if (!items.length) { box.style.display = 'none'; return; }
        box.style.display = 'grid';
        var fav = items.filter(function (x) { return x.fav; }).length;
        var months = {}; items.forEach(function (x) { months[mkey(x.ts)] = 1; });
        var tagged = items.filter(function (x) { return x.tag; }).length;
        box.innerHTML =
            sc(String(items.length), '张') + sc(String(fav), '收藏') +
            sc(String(Object.keys(months).length), '个月') + sc(String(tagged), '有标签');
    }
    function sc(a, b) { return '<div class="ab-stat"><div class="ab-stat-a">' + a + '</div><div class="ab-stat-b">' + b + '</div></div>'; }

    /* ---------------- 渲染 ---------------- */
    function cur() {
        var arr = items.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        if (tab === 'fav') arr = arr.filter(function (x) { return x.fav; });
        if (keyword) {
            var k = keyword.toLowerCase();
            arr = arr.filter(function (x) { return String(x.tag || '').toLowerCase().indexOf(k) >= 0; });
        }
        if (curMonth) arr = arr.filter(function (x) { return mkey(x.ts) === curMonth; });
        return arr;
    }

    function render() {
        var body = el('ab-body');
        if (!body) return;
        var arr = cur();

        var t = el('ab-title');
        if (t) t.textContent = pickMode ? '选一张' : '相册';
        var s = el('ab-sub');
        if (s) {
            if (pickMode) s.textContent = '选中的图片会放进当前操作';
            else if (curMonth) s.textContent = mlabel(curMonth) + ' · ' + arr.length + ' 张';
            else s.textContent = items.length + ' 张照片';
        }
        var ft = el('ab-fav-t');
        if (ft) ft.textContent = tab === 'fav' ? '全部' : '收藏';

        var pb = el('ab-pickbar');
        if (pb) pb.classList.toggle('on', !!pickMode);

        if (!arr.length) {
            body.innerHTML =
                '<div class="ab-empty">' +
                    '<div class="ab-empty-ico"><i class="fas fa-images"></i></div>' +
                    '<div class="ab-empty-t">' + (tab === 'fav' ? '还没有收藏' : (items.length ? '这个筛选下没有照片' : '相册还是空的')) + '</div>' +
                    '<div class="ab-empty-s">' + (items.length ? '换个标签或月份看看' : '添加几张，之后 TA 发朋友圈就有图可用') + '</div>' +
                    (items.length ? '' : '<button class="ab-empty-btn" id="ab-empty-add">添加照片</button>') +
                '</div>';
            var b = el('ab-empty-add');
            if (b) b.addEventListener('click', openAdd);
            return;
        }

        var groups = [], idx = {};
        arr.forEach(function (it) {
            var k = mkey(it.ts);
            if (!idx[k]) { idx[k] = { key: k, list: [] }; groups.push(idx[k]); }
            idx[k].list.push(it);
        });

        body.innerHTML = groups.map(function (g) {
            return '<div class="ab-group">' +
                '<div class="ab-group-hd" data-month="' + g.key + '">' +
                    '<span>' + esc(mlabel(g.key)) + '</span><span class="ab-group-c">' + g.list.length + ' 张</span>' +
                '</div>' +
                '<div class="ab-grid">' + g.list.map(cell).join('') + '</div>' +
            '</div>';
        }).join('');

        Array.prototype.forEach.call(body.querySelectorAll('.ab-cell'), function (c) {
            c.addEventListener('click', function (e) {
                var id = c.getAttribute('data-id');
                if (selMode()) {
                    if (sel[id]) delete sel[id]; else sel[id] = true;
                    c.classList.toggle('on', !!sel[id]);
                    el('ab-sel-n').textContent = '已选 ' + Object.keys(sel).length + ' 张';
                } else {
                    openViewer(id);
                }
            });
        });
        Array.prototype.forEach.call(body.querySelectorAll('.ab-group-hd'), function (h) {
            h.addEventListener('click', function () {
                curMonth = curMonth === h.getAttribute('data-month') ? '' : h.getAttribute('data-month');
                render();
            });
        });
    }

    function cell(it) {
        return '<div class="ab-cell' + (sel[it.id] ? ' on' : '') + '" data-id="' + it.id + '"' +
            (it.fav ? ' data-fav="1"' : '') + '>' +
            '<img src="' + esc(it.src) + '" alt="" loading="lazy">' +
            (it.fav ? '<span class="ab-cell-fav"><i class="fas fa-star"></i></span>' : '') +
            (it.tag ? '<span class="ab-cell-tag">' + esc(it.tag) + '</span>' : '') +
            '<span class="ab-cell-check"><i class="fas fa-check"></i></span>' +
        '</div>';
    }

    /* ---------------- 月份 ---------------- */
    function openMonths() {
        var box = el('ab-month-list');
        var g = {};
        items.forEach(function (x) { var k = mkey(x.ts); g[k] = (g[k] || 0) + 1; });
        var keys = Object.keys(g).sort().reverse();
        box.innerHTML =
            '<button class="ab-mo' + (curMonth ? '' : ' on') + '" data-k="">全部<span class="ab-mo-n">' + items.length + ' 张</span></button>' +
            keys.map(function (k) {
                return '<button class="ab-mo' + (curMonth === k ? ' on' : '') + '" data-k="' + k + '">' +
                    esc(mlabel(k)) + '<span class="ab-mo-n">' + g[k] + ' 张</span></button>';
            }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('.ab-mo'), function (b) {
            b.addEventListener('click', function () {
                curMonth = b.getAttribute('data-k');
                el('ab-months').classList.remove('on');
                render();
            });
        });
        el('ab-months').classList.add('on');
    }

    /* ---------------- 大图 ---------------- */
    function openViewer(id) {
        var it = find(id); if (!it) return;
        viewerId = id;
        paintViewer(it);
        el('ab-viewer').classList.add('on');
        el('ab-page').classList.add('ab-behind');
    }
    function paintViewer(it) {
        el('ab-v-img').src = it.src;
        el('ab-v-title').textContent = it.tag ? '#' + it.tag : '未分类';
        el('ab-v-sub').textContent = flabel(it.ts);
        var f = el('ab-v-fav');
        f.innerHTML = it.fav ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
        f.style.color = it.fav ? 'var(--accent-color, #ff6b9d)' : '';
    }
    function closeViewer() {
        el('ab-viewer').classList.remove('on');
        el('ab-page').classList.remove('ab-behind');
        viewerId = null;
    }

    /* ---------------- 开关 ---------------- */
    function open(cb) {
        build();
        onPickCb = cb || null;
        pickMode = !!cb;
        sel = {};
        el('ab-root').classList.add('on');
        el('ab-selbar').classList.remove('on');
        load().then(function () { renderStats(); render(); });
    }
    function close() {
        var r = el('ab-root'); if (!r) return;
        r.classList.remove('on');
        el('ab-viewer').classList.remove('on');
        el('ab-addpage').classList.remove('on');
        el('ab-months').classList.remove('on');
        el('ab-page').classList.remove('ab-behind');
        onPickCb = null; pickMode = false;
    }

    window.Album = {
        open: open,
        close: close,
        pickImage: function (cb) { open(cb); },
        list: function () { return items.slice(); },
        count: function () { return items.length; },
        random: function (n) {
            n = n || 1;
            if (!items.length) return [];
            var pool = items.slice(), out = [];
            while (pool.length && out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            return out.map(function (x) { return x.src; });
        },
        one: function () {
            if (!items.length) return '';
            return items[Math.floor(Math.random() * items.length)].src;
        }
    };

    if (window.whenSessionReady) window.whenSessionReady(load); else document.addEventListener('DOMContentLoaded', load);
    if (document.readyState === 'complete' || document.readyState === 'interactive') load();
})();
