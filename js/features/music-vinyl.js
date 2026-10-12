/* ============================================================
   全屏黑胶播放器  music-vinyl.js
   · 复用 #audio 与 window.MusicAPI（listeners.js 导出），不建第二套播放状态
   · 黑胶唱片旋转 + 唱臂；网易云歌单/单曲导入；本地音乐导入
   ============================================================ */
(function () {
    'use strict';

    var root = null, disc = null, label = null, arm = null;
    var nameEl = null, subEl = null, fillEl = null, knobEl = null;
    var tCur = null, tAll = null, mainBtn = null, listEl = null;
    var neModal = null, neType = 'playlist', neInput = null, neMsg = null, neGo = null;
    var rlModal = null, plModal = null;
    var coverInput = null, fileInput = null, bgInput = null;
    var built = false, timer = null;
    var fab = null, fabTitle = null, fabSub = null, fabPlay = null, fabDisc = null, fabTimer = null;

    var COVER_KEY = 'musicCoverFull';
    var BG_KEY = 'musicBgFull';
    var RELAY_KEY = 'musicRelay';
    var METING = 'https://api.injahow.cn/meting/';

    /* ---------- 工具 ---------- */
    function esc(s) {
        var str = String(s === null || s === undefined ? '' : s);
        return str.replace(/&/g, '&' + 'amp;')
                  .replace(/</g, '&' + 'lt;')
                  .replace(/>/g, '&' + 'gt;')
                  .replace(/"/g, '&' + 'quot;')
                  .replace(/'/g, '&#39;');
    }
    function api() { return window.MusicAPI || null; }
    function notify(m, t) {
        try { if (typeof showNotification === 'function') showNotification(m, t || 'info', 1600); } catch (e) {}
    }
    function skey(k) {
        try { return (typeof getStorageKey === 'function') ? getStorageKey(k) : (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX + k : k); } catch (e) { return k; }
    }
    function rd(k, d) {
        try { var v = localStorage.getItem(skey(k)); return v === null ? d : v; } catch (e) { return d; }
    }
    function wr(k, v) { try { localStorage.setItem(skey(k), v); } catch (e) {} }
    function fmt(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ---------- 网易云导入 ---------- */
    // 从链接或纯数字里抽出 id
    function pickId(text) {
        var s = String(text || '').trim();
        var m = s.match(/[?&#/]id[=/](\d+)/i) || s.match(/\/(\d{4,})/) || s.match(/^(\d{4,})$/);
        return m ? m[1] : '';
    }
    function fetchMeting(id, type) {
        return new Promise(function (resolve, reject) {
            var ctl = null;
            try { ctl = new AbortController(); } catch (e) {}
            var to = setTimeout(function () { try { ctl && ctl.abort(); } catch (e) {} reject(new Error('请求超时')); }, 15000);
            fetch(METING + '?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id), ctl ? { signal: ctl.signal } : undefined)
                .then(function (r) {
                    clearTimeout(to);
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (j) { resolve(j); })
                .catch(function (e) { clearTimeout(to); reject(e); });
        });
    }
    function normalize(arr) {
        var out = [];
        (arr || []).forEach(function (it) {
            if (!it || !it.url) return;
            var u = String(it.url).replace(/^http:\/\//i, 'https://');
            out.push({
                title: String(it.name || it.title || '未命名').trim(),
                sub: String(it.artist || it.sub || '网易云').trim(),
                url: u,
                pic: it.pic || ''
            });
        });
        return out;
    }
    function doImport() {
        var raw = neInput.value.trim();
        if (!raw) { setMsg('请先粘贴链接或 ID', true); return; }
        var id = pickId(raw);
        if (!id) { setMsg('没识别到 ID，请检查链接', true); return; }
        setMsg('正在拉取…');
        neGo.disabled = true;
        fetchMeting(id, neType)
            .then(function (j) {
                var items = normalize(Array.isArray(j) ? j : []);
                if (!items.length) { setMsg('没拿到歌曲，可能是 VIP 专属或歌单为空', true); neGo.disabled = false; return; }
                var a = api();
                if (!a) { setMsg('播放器还没初始化，请先打开一次音乐', true); neGo.disabled = false; return; }
                var n = a.add(items);
                setMsg('成功导入 ' + n + ' 首', false);
                renderList();
                setTimeout(function () { closeNE(); }, 700);
            })
            .catch(function (e) {
                setMsg('导入失败：' + (e && e.message ? e.message : '网络错误'), true);
                neGo.disabled = false;
            });
    }
    function setMsg(t, isErr) {
        if (!neMsg) return;
        neMsg.textContent = t;
        neMsg.className = 'mv-ne-msg' + (isErr ? ' err' : (t.indexOf('成功') >= 0 ? ' ok' : ''));
    }

    /* ============================================================
       网易云中转（自己部署的 Worker）
       配置：{ base: 'https://xxx.workers.dev', uid: '', cookie: '' }
       ============================================================ */
    function relay() {
        var d = { base: '', uid: '', cookie: '' };
        try {
            var raw = rd(RELAY_KEY, '');
            if (raw) {
                var o = JSON.parse(raw);
                if (o && typeof o === 'object') {
                    d.base = String(o.base || '').trim().replace(/\/+$/, '');
                    d.uid = String(o.uid || '').trim();
                    d.cookie = String(o.cookie || '').trim();
                }
            }
        } catch (e) {}
        return d;
    }
    function saveRelay(o) { wr(RELAY_KEY, JSON.stringify(o)); }

    function rGet(path, qs) {
        var cfg = relay();
        if (!cfg.base) return Promise.reject(new Error('还没配置中转地址'));
        var u = cfg.base + path;
        var parts = [];
        Object.keys(qs || {}).forEach(function (k) {
            if (qs[k] !== '' && qs[k] !== null && qs[k] !== undefined) parts.push(k + '=' + encodeURIComponent(qs[k]));
        });
        if (cfg.cookie) parts.push('cookie=' + encodeURIComponent(cfg.cookie));
        if (parts.length) u += '?' + parts.join('&');
        return new Promise(function (resolve, reject) {
            var ctl = null;
            try { ctl = new AbortController(); } catch (e) {}
            var to = setTimeout(function () { try { ctl && ctl.abort(); } catch (e) {} reject(new Error('请求超时')); }, 25000);
            fetch(u, ctl ? { signal: ctl.signal } : undefined)
                .then(function (r) { clearTimeout(to); return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); resolve(j); }); })
                .catch(function (e) { clearTimeout(to); reject(e); });
        });
    }

    function rlMsg(t, isErr) {
        var m = rlModal && rlModal.querySelector('#mv-rl-msg');
        if (!m) return;
        m.textContent = t || '';
        m.className = 'mv-ne-msg' + (isErr ? ' err' : (t && t.indexOf('成功') >= 0 ? ' ok' : ''));
    }
    function openRelay() {
        if (!rlModal) return;
        var c = relay();
        rlModal.querySelector('#mv-rl-base').value = c.base;
        rlModal.querySelector('#mv-rl-uid').value = c.uid;
        rlModal.querySelector('#mv-rl-ck').value = c.cookie;
        rlMsg('');
        rlModal.classList.add('show');
    }
    function closeRelay() { if (rlModal) rlModal.classList.remove('show'); }

    function plMsg(t, isErr) {
        var m = plModal && plModal.querySelector('#mv-pl-msg');
        if (!m) return;
        m.textContent = t || '';
        m.className = 'mv-ne-msg' + (isErr ? ' err' : (t && t.indexOf('成功') >= 0 ? ' ok' : ''));
    }
    function openPL() {
        var c = relay();
        if (!c.base) { notify('先配置中转地址', 'warning'); openRelay(); return; }
        plModal.classList.add('show');
        loadPL();
    }
    function closePL() { if (plModal) plModal.classList.remove('show'); }

    function loadPL() {
        var c = relay();
        var box = plModal.querySelector('#mv-pl-body');
        plMsg('正在读取歌单…');
        box.innerHTML = '<div class="mv-pl-load"><i class="fas fa-spinner fa-spin"></i> 读取中…</div>';
        var task = c.uid
            ? rGet('/playlists', { uid: c.uid }).then(function (j) { return { list: j.list || [] }; })
            : rGet('/me', {}).then(function (j) {
                if (j.uid) { var c2 = relay(); c2.uid = String(j.uid); saveRelay(c2); var el = rlModal && rlModal.querySelector('#mv-rl-uid'); if (el) el.value = c2.uid; }
                return rGet('/playlists', { uid: j.uid });
            }).then(function (j) { return { list: j.list || [] }; });
        task.then(function (r) {
            var arr = r.list || [];
            if (!arr.length) { plMsg('一个歌单都没读到，检查 UID 或 Cookie', true); box.innerHTML = '<div class="mv-pl-load">没有歌单</div>'; return; }
            var h = '';
            arr.forEach(function (p) {
                h += '<div class="mv-pl-card" data-plid="' + esc(p.id) + '" data-plname="' + esc(p.name) + '">' +
                        '<div class="mv-pl-cov" style="' + (p.cover ? 'background-image:url(' + esc(p.cover) + ')' : '') + '"></div>' +
                        '<div class="mv-pl-nm">' + esc(p.name) + '</div>' +
                        '<div class="mv-pl-ct">' + (p.count || 0) + ' 首' + (p.creator ? ' · ' + esc(p.creator) : '') + '</div>' +
                     '</div>';
            });
            box.innerHTML = h;
            plMsg('共 ' + arr.length + ' 个歌单，点一个导入');
        }).catch(function (e) {
            plMsg('读取失败：' + (e && e.message ? e.message : '网络错误'), true);
            box.innerHTML = '<div class="mv-pl-load">读取失败</div>';
        });
    }

    function importPL(id, name) {
        if (!id) return;
        plMsg('正在拉取《' + name + '》…（前 40 首会校验直链）');
        rGet('/playlist', { id: id })
            .then(function (j) {
                var songs = (j.songs || []).map(function (s) {
                    return { title: s.name || '未命名', sub: s.artist || '', url: s.url, pic: s.pic || '' };
                });
                if (!songs.length) { plMsg('这个歌单没有可播放的歌曲（可能全是 VIP 专属）', true); return; }
                var a = api();
                if (!a) { plMsg('播放器还没初始化', true); return; }
                var n = a.add(songs);
                plMsg('成功导入 ' + n + ' 首', false);
                renderList(); syncMeta();
                setTimeout(function () { closePL(); closeRelay(); }, 900);
            })
            .catch(function (e) { plMsg('导入失败：' + (e && e.message ? e.message : '网络错误'), true); });
    }
    function openNE(type) {
        if (!neModal) return;
        neType = type || 'playlist';
        neInput.value = '';
        setMsg('');
        neGo.disabled = false;
        var segs = neModal.querySelectorAll('[data-netype]');
        for (var i = 0; i < segs.length; i++) {
            segs[i].classList.toggle('on', segs[i].getAttribute('data-netype') === neType);
        }
        neModal.classList.add('show');
        setTimeout(function () { try { neInput.focus(); } catch (e) {} }, 100);
    }
    function closeNE() { if (neModal) neModal.classList.remove('show'); }

    /* ---------- 封面 ---------- */
    function setCover(dataUrl) {
        wr(COVER_KEY, dataUrl || '');
        paintCover();
    }
    function paintCover() {
        if (!label) return;
        var c = rd(COVER_KEY, '');
        if (c) {
            label.innerHTML = '<img src="' + c + '" alt="">';
            label.style.background = '#111';
        } else {
            label.innerHTML = '<i class="fas fa-music"></i>';
            label.style.background = '';
        }
    }
    /* ---------- 播放器背景 ---------- */
    function paintBg() {
        if (!root) return;
        var b = rd(BG_KEY, '');
        var rm = document.getElementById('mv-bgrm');
        if (b) {
            root.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.42), rgba(0,0,0,.55)), url("' + b + '")';
            root.style.backgroundSize = 'cover';
            root.style.backgroundPosition = 'center';
            root.style.backgroundAttachment = 'fixed';
            root.classList.add('has-bg');
            if (rm) rm.style.display = '';
        } else {
            root.style.backgroundImage = '';
            root.classList.remove('has-bg');
            if (rm) rm.style.display = 'none';
        }
    }
    function onBgPick(e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var done = function (blob) {
            var r = new FileReader();
            r.onload = function () { wr(BG_KEY, r.result); paintBg(); notify('背景已更新', 'success'); };
            r.readAsDataURL(blob);
        };
        if (typeof window.compressImageSmart === 'function') {
            Promise.resolve(window.compressImageSmart(f, 900 * 1024)).then(function (b) { done(b || f); }).catch(function () { done(f); });
        } else { done(f); }
        e.target.value = '';
    }

    function onCoverPick(e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var fn = window.compressImageSmart;
        var done = function (blob) {
            var r = new FileReader();
            r.onload = function () { setCover(r.result); notify('封面已更新', 'success'); };
            r.readAsDataURL(blob);
        };
        if (typeof fn === 'function') {
            Promise.resolve(fn(f, 700 * 1024)).then(function (b) { done(b || f); }).catch(function () { done(f); });
        } else {
            done(f);
        }
        e.target.value = '';
    }

    /* ---------- 本地音乐文件 ---------- */
    function onFilePick(e) {
        var fs = e.target.files;
        if (!fs || !fs.length) return;
        var a = api();
        if (!a) { notify('播放器未初始化', 'warning'); e.target.value = ''; return; }
        var add = [];
        for (var i = 0; i < fs.length; i++) {
            (function (f) {
                add.push({
                    title: String(f.name || '本地音乐').replace(/\.[^.]+$/, ''),
                    sub: '本地文件',
                    url: URL.createObjectURL(f)
                });
            })(fs[i]);
        }
        a.add(add);
        renderList();
        notify('已加入 ' + add.length + ' 首本地音乐', 'success');
        e.target.value = '';
    }

    /* ---------- 渲染 ---------- */
    function syncMeta() {
        var a = api();
        if (!a) return;
        var songs = a.songs() || [];
        var i = a.index();
        var s = songs[i];
        if (nameEl) nameEl.textContent = s ? (s.title || '暂无歌曲') : '暂无歌曲';
        if (subEl) subEl.textContent = s ? (s.sub || '') : '';
        // 唱片旋转 + 唱臂
        var playing = !!a.isPlaying();
        if (disc) disc.classList.toggle('spinning', playing);
        if (arm) arm.classList.toggle('on', playing);
        if (mainBtn) mainBtn.classList.toggle('on', playing);
    }
    function syncProgress() {
        var a = api();
        if (!a) return;
        var au = a.audio();
        if (!au) return;
        var d = au.duration || 0, c = au.currentTime || 0;
        var p = d ? Math.min(100, (c / d) * 100) : 0;
        if (fillEl) fillEl.style.width = p + '%';
        if (knobEl) knobEl.style.left = p + '%';
        if (tCur) tCur.textContent = fmt(c);
        if (tAll) tAll.textContent = fmt(d);
    }
    function renderList() {
        if (!listEl) return;
        var a = api();
        var songs = (a && a.songs()) || [];
        var cur = a ? a.index() : -1;
        if (!songs.length) {
            listEl.innerHTML = '<div class="mv-empty">歌单是空的<br>用右上角的网易云导入，或加本地音乐</div>';
            return;
        }
        var h = '';
        for (var i = 0; i < songs.length; i++) {
            var s = songs[i] || {};
            h += '<div class="mv-row' + (i === cur ? ' cur' : '') + '" data-mvi="' + i + '">' +
                    '<div class="mv-ridx">' + (i === cur ? '<div class="mv-eq"><i></i><i></i><i></i></div>' : (i + 1)) + '</div>' +
                    '<div class="mv-rinfo">' +
                        '<div class="mv-rn">' + esc(s.title || '未命名') + '</div>' +
                        '<div class="mv-rs">' + esc(s.sub || '') + '</div>' +
                    '</div>' +
                    '<div class="mv-rx" data-mvrm="' + i + '" title="移除"><i class="fas fa-times"></i></div>' +
                 '</div>';
        }
        listEl.innerHTML = h;
    }

    /* ---------- 构建 ---------- */
    function build() {
        if (built) return;
        built = true;

        root = document.createElement('div');
        root.id = 'mv-root';
        root.innerHTML =
            '<div class="mv-bar">' +
                '<div class="mv-ic" data-mv="back" title="返回"><i class="fas fa-chevron-left"></i></div>' +
                '<div class="mv-ttl">星音陪伴</div>' +
                '<div class="mv-ic" data-mv="relay" title="网易云中转（读我的歌单）"><i class="fas fa-server"></i></div>' +
                '<div class="mv-ic" data-mv="ne" title="网易云导入"><i class="fas fa-cloud-arrow-down"></i></div>' +
                '<div class="mv-ic" data-mv="local" title="本地音乐"><i class="fas fa-plus"></i></div>' +
            '</div>' +
            '<div class="mv-stage">' +
                '<div class="mv-disc" id="mv-disc">' +
                    '<div class="mv-label" id="mv-label" title="点击更换封面"></div>' +
                    '<div class="mv-hole"></div>' +
                '</div>' +
                '<div class="mv-arm" id="mv-arm">' +
                    '<div class="mv-arm-rod"></div>' +
                    '<div class="mv-arm-head"></div>' +
                    '<div class="mv-arm-base"></div>' +
                '</div>' +
            '</div>' +
            '<div class="mv-meta">' +
                '<div class="mv-name" id="mv-name">暂无歌曲</div>' +
                '<div class="mv-sub" id="mv-sub"></div>' +
            '</div>' +
            '<div class="mv-prog">' +
                '<div class="mv-prog-track" id="mv-track">' +
                    '<div class="mv-prog-fill" id="mv-fill"></div>' +
                    '<div class="mv-prog-knob" id="mv-knob"></div>' +
                '</div>' +
                '<div class="mv-time"><span id="mv-tcur">0:00</span><span id="mv-tall">0:00</span></div>' +
            '</div>' +
            '<div class="mv-ctl">' +
                '<button class="mv-sm" data-mv="mode" title="播放模式">' +
                    '<svg id="mv-ic-mode" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>' +
                '</button>' +
                '<button class="mv-sm" data-mv="prev" title="上一首"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>' +
                '<button class="mv-main" id="mv-main" data-mv="toggle" title="播放/暂停">' +
                    '<svg class="mv-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
                    '<svg class="mv-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' +
                '</button>' +
                '<button class="mv-sm" data-mv="next" title="下一首"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>' +
                '<button class="mv-sm" data-mv="top" title="回到当前歌曲"><svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg></button>' +
            '</div>' +
            '<div class="mv-tools">' +
                '<span data-mv="relay2"><i class="fas fa-server"></i> 我的网易云</span>' +
                '<span data-mv="ne2"><i class="fas fa-cloud-arrow-down"></i> 单链接导入</span>' +
                '<span data-mv="local2"><i class="fas fa-folder-open"></i> 本地音乐</span>' +
                '<span data-mv="cover"><i class="fas fa-image"></i> 换封面</span>' +
                '<span data-mv="bg"><i class="fas fa-panorama"></i> 换背景</span>' +
                '<span data-mv="bgrm" id="mv-bgrm" style="display:none;"><i class="fas fa-rotate-left"></i> 恢复背景</span>' +
            '</div>' +
            '<div class="mv-list" id="mv-list"></div>';
        document.body.appendChild(root);

        /* 悬浮小播放器（聊天页常驻，点开全屏黑胶） */
        buildFab();

        disc = root.querySelector('#mv-disc');
        arm = root.querySelector('#mv-arm');
        label = root.querySelector('#mv-label');
        nameEl = root.querySelector('#mv-name');
        subEl = root.querySelector('#mv-sub');
        fillEl = root.querySelector('#mv-fill');
        knobEl = root.querySelector('#mv-knob');
        tCur = root.querySelector('#mv-tcur');
        tAll = root.querySelector('#mv-tall');
        mainBtn = root.querySelector('#mv-main');
        listEl = root.querySelector('#mv-list');

        coverInput = document.createElement('input');
        coverInput.type = 'file';
        coverInput.accept = 'image/*';
        coverInput.style.display = 'none';
        coverInput.addEventListener('change', onCoverPick);
        document.body.appendChild(coverInput);

        bgInput = document.createElement('input');
        bgInput.type = 'file';
        bgInput.accept = 'image/*';
        bgInput.style.display = 'none';
        bgInput.addEventListener('change', onBgPick);
        document.body.appendChild(bgInput);

        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', onFilePick);
        document.body.appendChild(fileInput);

        paintCover();
        paintBg();

        /* --- 事件 --- */
        root.addEventListener('click', function (e) {
            var a = api();
            var t = e.target.closest('[data-mv], [data-mvi], [data-mvrm]');
            if (!t) return;

            var rm = t.getAttribute('data-mvrm');
            if (rm !== null) {
                e.stopPropagation();
                if (a) { a.removeAt(+rm); renderList(); syncMeta(); }
                return;
            }
            var row = t.getAttribute('data-mvi');
            if (row !== null && !t.getAttribute('data-mvrm')) {
                if (a) { a.playAt(+row); setTimeout(function () { syncMeta(); renderList(); }, 120); }
                return;
            }
            var act = t.getAttribute('data-mv');
            // 下面这几个不依赖播放器是否已初始化
            if (act === 'back') { close(); return; }
            if (act === 'bg') { bgInput.click(); return; }
            if (act === 'bgrm') { wr(BG_KEY, ''); paintBg(); notify('已恢复默认背景', 'info'); return; }
            if (act === 'cover') { coverInput.click(); return; }
            if (act === 'relay' || act === 'relay2') {
                var cfg = relay();
                if (cfg.base) openPL(); else openRelay();
                return;
            }
            if (!a) { notify('播放器还没初始化，请先开一次音乐再进', 'warning'); return; }
            if (act === 'toggle') { a.toggle(); setTimeout(syncMeta, 60); return; }
            if (act === 'next') { a.next(); setTimeout(function () { syncMeta(); renderList(); }, 120); return; }
            if (act === 'prev') { a.prev(); setTimeout(function () { syncMeta(); renderList(); }, 120); return; }
            if (act === 'mode') {
                var m = a.cycleMode();
                var labels = { sequence: '顺序播放', single: '单曲循环', shuffle: '随机播放' };
                notify(labels[m] || m, 'info');
                paintMode(m);
                return;
            }
            if (act === 'top') { var cur = listEl.querySelector('.mv-row.cur'); if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
            if (act === 'ne' || act === 'ne2') { openNE('playlist'); return; }
            if (act === 'local' || act === 'local2') { fileInput.click(); return; }
        });

        // 唱片圆心也能换封面（跟上面 cover 走同一个 input）
        label.addEventListener('click', function () { coverInput.click(); });

        // 进度条：点击 + 拖动
        var track = root.querySelector('#mv-track');
        var dragging = false;
        function seekByX(clientX) {
            var a = api(); if (!a) return;
            var au = a.audio(); if (!au || !au.duration) return;
            var r = track.getBoundingClientRect();
            var p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
            a.seek(p * au.duration);
            syncProgress();
        }
        track.addEventListener('pointerdown', function (e) {
            dragging = true;
            try { track.setPointerCapture(e.pointerId); } catch (x) {}
            seekByX(e.clientX);
        });
        track.addEventListener('pointermove', function (e) { if (dragging) seekByX(e.clientX); });
        track.addEventListener('pointerup', function () { dragging = false; });
        track.addEventListener('pointercancel', function () { dragging = false; });

        /* --- 网易云弹窗 --- */
        neModal = document.createElement('div');
        neModal.id = 'mv-ne';
        neModal.innerHTML =
            '<div class="mv-ne-box">' +
                '<h4>导入网易云音乐</h4>' +
                '<div class="mv-ne-tip">在网易云 App / 网页里点「分享 → 复制链接」或「复制歌单链接」，粘贴到下面。也支持直接填纯数字 ID。</div>' +
                '<div class="mv-ne-seg">' +
                    '<button data-netype="playlist" class="on">整张歌单</button>' +
                    '<button data-netype="song">单首歌曲</button>' +
                '</div>' +
                '<input type="text" id="mv-ne-in" placeholder="粘贴链接或 ID，例如 1234567890">' +
                '<div class="mv-ne-msg" id="mv-ne-msg"></div>' +
                '<div class="mv-ne-act">' +
                    '<button class="mv-ne-cancel" id="mv-ne-cancel">取消</button>' +
                    '<button class="mv-ne-go" id="mv-ne-go">导入</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(neModal);
        neInput = neModal.querySelector('#mv-ne-in');
        neMsg = neModal.querySelector('#mv-ne-msg');
        neGo = neModal.querySelector('#mv-ne-go');

        neModal.addEventListener('click', function (e) {
            if (e.target === neModal) { closeNE(); return; }
            var seg = e.target.closest('[data-netype]');
            if (seg) {
                neType = seg.getAttribute('data-netype');
                var segs = neModal.querySelectorAll('[data-netype]');
                for (var i = 0; i < segs.length; i++) segs[i].classList.toggle('on', segs[i] === seg);
                return;
            }
            if (e.target.closest('#mv-ne-cancel')) { closeNE(); return; }
            if (e.target.closest('#mv-ne-go')) { doImport(); return; }
        });
        neInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doImport(); });

        /* --- 网易云中转设置 --- */
        rlModal = document.createElement('div');
        rlModal.id = 'mv-rl';
        rlModal.innerHTML =
            '<div class="mv-ne-box mv-rl-box">' +
                '<h4>网易云中转设置</h4>' +
                '<div class="mv-ne-tip">' +
                    '网页直连不了网易云，需要一个中转。仓库里 <b>netease-proxy/worker.js</b> 是现成的脚本，' +
                    '按 <b>netease-proxy/README.md</b> 三步部署到 Cloudflare Workers（免费），把拿到的域名填到下面。<br>' +
                    '想读「我喜欢的音乐」就再填 Cookie（README 里有复制方法）。' +
                '</div>' +
                '<div class="mv-rl-row"><label>中转地址</label><input type="text" id="mv-rl-base" placeholder="https://xxx.workers.dev"></div>' +
                '<div class="mv-rl-row"><label>网易云 UID</label><input type="text" id="mv-rl-uid" placeholder="个人主页链接里的数字，可留空"></div>' +
                '<div class="mv-rl-row"><label>Cookie（可选）</label><input type="text" id="mv-rl-ck" placeholder="MUSIC_U=... 一整串"></div>' +
                '<div class="mv-ne-msg" id="mv-rl-msg"></div>' +
                '<div class="mv-ne-act">' +
                    '<button class="mv-ne-cancel" id="mv-rl-test">测试</button>' +
                    '<button class="mv-ne-cancel" id="mv-rl-cancel">取消</button>' +
                    '<button class="mv-ne-go" id="mv-rl-save">保存并读歌单</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(rlModal);

        rlModal.addEventListener('click', function (e) {
            if (e.target === rlModal) { closeRelay(); return; }
            if (e.target.closest('#mv-rl-cancel')) { closeRelay(); return; }
            if (e.target.closest('#mv-rl-save')) {
                var base = rlModal.querySelector('#mv-rl-base').value.trim().replace(/\/+$/, '');
                if (!base) { rlMsg('中转地址不能为空', true); return; }
                if (!/^https?:\/\//i.test(base)) { rlMsg('地址要以 http:// 或 https:// 开头', true); return; }
                saveRelay({
                    base: base,
                    uid: rlModal.querySelector('#mv-rl-uid').value.trim(),
                    cookie: rlModal.querySelector('#mv-rl-ck').value.trim()
                });
                rlMsg('已保存，正在连接…');
                rGet('/me', {}).then(function (j) {
                    var c = relay();
                    if (j.uid) { c.uid = String(j.uid); saveRelay(c); var el = rlModal.querySelector('#mv-rl-uid'); if (el) el.value = c.uid; }
                    rlMsg('连接成功' + (j.nickname ? '，你好 ' + j.nickname : ''), false);
                    setTimeout(openPL, 500);
                }).catch(function (err) {
                    rlMsg('连不上：' + (err && err.message ? err.message : '网络错误') + '（没填 Cookie 会这样，不影响读公开歌单）', true);
                    setTimeout(openPL, 300);
                });
                return;
            }
            if (e.target.closest('#mv-rl-test')) {
                rlMsg('测试中…');
                rGet('/me', {}).then(function (j) {
                    rlMsg('连接成功' + (j.nickname ? '，你好 ' + j.nickname : '') + (j.uid ? '（UID ' + j.uid + '）' : ''), false);
                }).catch(function (err) {
                    rlMsg('连不上：' + (err && err.message ? err.message : '网络错误'), true);
                });
                return;
            }
        });

        /* --- 歌单选择 --- */
        plModal = document.createElement('div');
        plModal.id = 'mv-pl';
        plModal.innerHTML =
            '<div class="mv-ne-box mv-pl-box">' +
                '<h4>我的歌单</h4>' +
                '<div class="mv-ne-msg" id="mv-pl-msg"></div>' +
                '<div class="mv-pl-body" id="mv-pl-body"></div>' +
                '<div class="mv-ne-act">' +
                    '<button class="mv-ne-cancel" id="mv-pl-refresh">刷新</button>' +
                    '<button class="mv-ne-cancel" id="mv-pl-set">中转设置</button>' +
                    '<button class="mv-ne-cancel" id="mv-pl-cancel">关闭</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(plModal);

        plModal.addEventListener('click', function (e) {
            if (e.target === plModal) { closePL(); return; }
            if (e.target.closest('#mv-pl-cancel')) { closePL(); return; }
            if (e.target.closest('#mv-pl-refresh')) { loadPL(); return; }
            if (e.target.closest('#mv-pl-set')) { closePL(); openRelay(); return; }
            var card = e.target.closest('[data-plid]');
            if (card) { importPL(card.getAttribute('data-plid'), card.getAttribute('data-plname') || ''); return; }
        });
    }

    var MODE_SVG = {
        sequence: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
        single:   'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
        shuffle:  'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z'
    };
    function paintMode(m) {
        var ic = document.getElementById('mv-ic-mode');
        if (!ic) return;
        var path = ic.querySelector('path');
        if (path) path.setAttribute('d', MODE_SVG[m] || MODE_SVG.sequence);
        if (m === 'single') {
            var old = ic.querySelector('text');
            if (!old) {
                var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                t.setAttribute('x', '12'); t.setAttribute('y', '15');
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('font-size', '8');
                t.setAttribute('font-weight', 'bold');
                t.setAttribute('fill', 'currentColor');
                t.textContent = '1';
                ic.appendChild(t);
            }
        } else {
            var old2 = ic.querySelector('text');
            if (old2) old2.remove();
        }
    }

    /* ---------- 开关 ---------- */
    function open() {
        build();
        var a = api();
        if (!a) {
            // 播放器未初始化（设置里关掉了）→ 先打开开关再等一会
            try {
                var tg = document.getElementById('music-player-toggle');
                if (tg && !(window.settings && window.settings.musicPlayerEnabled)) tg.click();
            } catch (e) {}
            setTimeout(function () {
                if (!window.MusicAPI) { notify('请先在设置里开启「音乐播放器」', 'warning'); return; }
                reallyOpen();
            }, 500);
            return;
        }
        reallyOpen();
    }
    function reallyOpen() {
        root.classList.add('show');
        document.documentElement.style.overflow = 'hidden';
        var a = api();
        paintMode(a ? a.mode() : 'sequence');
        renderList();
        syncMeta();
        syncProgress();
        // 已有的悬浮小播放器先收起来，避免叠在一起
        try { document.getElementById('player').classList.add('collapsed'); } catch (e) {}
        updateFab();
        clearInterval(timer);
        timer = setInterval(function () { if (root && root.classList.contains('show')) syncProgress(); }, 500);
    }
    function close() {
        if (!root) return;
        root.classList.remove('show');
        document.documentElement.style.overflow = '';
        clearInterval(timer); timer = null;
        updateFab();
    }

    /* ---------- 悬浮小播放器 ---------- */
    function buildFab() {
        if (fab) return;
        fab = document.createElement('div');
        fab.id = 'mv-fab';
        fab.innerHTML =
            '<div class="mv-fab-disc" id="mv-fab-disc"><i class="fas fa-music"></i></div>' +
            '<div class="mv-fab-info">' +
                '<div class="mv-fab-name" id="mv-fab-name">星音陪伴</div>' +
                '<div class="mv-fab-sub" id="mv-fab-sub">轻触打开播放器</div>' +
            '</div>' +
            '<button class="mv-fab-btn" id="mv-fab-play" title="播放 / 暂停"><i class="fas fa-play"></i></button>' +
            '<button class="mv-fab-btn" id="mv-fab-next" title="下一首"><i class="fas fa-forward-step"></i></button>' +
            '<button class="mv-fab-close" id="mv-fab-close" title="关闭小窗"><i class="fas fa-xmark"></i></button>';
        document.body.appendChild(fab);
        fabTitle = fab.querySelector('#mv-fab-name');
        fabSub = fab.querySelector('#mv-fab-sub');
        fabPlay = fab.querySelector('#mv-fab-play');
        fabDisc = fab.querySelector('#mv-fab-disc');
        fab.addEventListener('click', function (e) {
            if (e.target.closest('#mv-fab-close')) { setFabEnabled(false); return; }
            if (e.target.closest('#mv-fab-play')) { fabToggle(); return; }
            if (e.target.closest('#mv-fab-next')) { fabNext(); return; }
            if (fabMoved) { fabMoved = false; return; }   // 刚拖完，别误触打开
            open();
        });
        makeFabDraggable(fab);
        restoreFabPos(fab);
        try { if (localStorage.getItem('mvFabHidden') === '1') fab.classList.add('mv-off'); } catch (e) {}
        updateFab();
    }

    /* ---------- 小窗：拖动 + 记住位置 ---------- */
    var fabMoved = false;
    function makeFabDraggable(el) {
        if (!el || el._mvDragBound) return;
        el._mvDragBound = true;
        var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, id = null;
        function down(e) {
            if (e.target.closest('.mv-fab-btn') || e.target.closest('.mv-fab-close')) return;
            id = (e.pointerId !== undefined) ? e.pointerId : null;
            var pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
            sx = pt.clientX; sy = pt.clientY;
            var r = el.getBoundingClientRect();
            ox = r.left; oy = r.top;
            dragging = false;
            try { el.setPointerCapture && id !== null && el.setPointerCapture(id); } catch (err) {}
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
            window.addEventListener('touchmove', move, { passive: false });
            window.addEventListener('touchend', up);
        }
        function move(e) {
            var pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
            var dx = pt.clientX - sx, dy = pt.clientY - sy;
            if (!dragging && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            dragging = true;
            el.classList.add('dragging');
            var nx = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, ox + dx));
            var ny = Math.max(56, Math.min(window.innerHeight - el.offsetHeight - 4, oy + dy));
            el.style.left = nx + 'px';
            el.style.top = ny + 'px';
            el.style.bottom = 'auto';
            el.style.right = 'auto';
            if (e.cancelable) e.preventDefault();
        }
        function up() {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
            window.removeEventListener('touchmove', move);
            window.removeEventListener('touchend', up);
            if (!dragging) return;
            el.classList.remove('dragging');
            fabMoved = true;
            setTimeout(function () { fabMoved = false; }, 260);
            try {
                var r = el.getBoundingClientRect();
                localStorage.setItem('mvFabPos', JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
            } catch (err) {}
        }
        el.addEventListener('mousedown', down);
        el.addEventListener('touchstart', down, { passive: true });
    }
    function restoreFabPos(el) {
        try {
            var raw = localStorage.getItem('mvFabPos');
            if (!raw) return;
            var p = JSON.parse(raw);
            if (!p || typeof p.left !== 'number') return;
            el.style.left = Math.max(4, Math.min(window.innerWidth - 60, p.left)) + 'px';
            el.style.top = Math.max(56, Math.min(window.innerHeight - 60, p.top)) + 'px';
            el.style.bottom = 'auto';
            el.style.right = 'auto';
        } catch (e) {}
    }
    /* 小窗开关：供输入框 ＋ 面板调用 */
    function setFabEnabled(on) {
        if (!fab) return;
        fab.classList.toggle('mv-off', !on);
        try { localStorage.setItem('mvFabHidden', on ? '0' : '1'); } catch (e) {}
        try { if (typeof showNotification === 'function') showNotification(on ? '音乐小窗已开启' : '音乐小窗已关闭', 'success', 1200); } catch (e) {}
    }
    function fabIsEnabled() { return !!(fab && !fab.classList.contains('mv-off')); }
    function fabTitleText() {
        try {
            var t = document.getElementById('music-title');
            if (t && t.textContent && t.textContent.trim() && t.textContent.trim() !== 'Loading...') return t.textContent.trim();
        } catch (e) {}
        return '';
    }
    function fabPlaying() {
        var a = api();
        if (a) return !!a.isPlaying();
        var au = document.getElementById('audio');
        return !!(au && au.currentSrc && !au.paused && !au.ended);
    }
    function updateFab() {
        if (!fab) return;
        var t = fabTitleText();
        var homeOpen = false;
        try { var hs = document.getElementById('home-screen'); if (hs && hs.classList.contains('show')) homeOpen = true; } catch (e) {}
        var off = !fabIsEnabled();
        var hidden = off || !t || (root && root.classList.contains('show')) || homeOpen;
        fab.classList.toggle('hide', !!hidden);
        fab.classList.toggle('playing', fabPlaying());
        if (t) {
            fabTitle.textContent = t;
            var a = api();
            if (a && a.songs) {
                var s = a.songs()[a.index()];
                if (s) fabSub.textContent = s.sub || '正在播放';
            }
        }
        if (fabPlay) fabPlay.innerHTML = '<i class="fas ' + (fabPlaying() ? 'fa-pause' : 'fa-play') + '"></i>';
    }
    function fabToggle() {
        var a = api();
        if (a) { a.toggle(); setTimeout(updateFab, 80); return; }
        var au = document.getElementById('audio');
        if (au && au.dataset && au.dataset.hsLocal === '1') {
            if (au.paused) au.play().catch(function () {}); else au.pause();
            updateFab(); return;
        }
        var pb = document.getElementById('play-btn'); if (pb) pb.click();
        setTimeout(updateFab, 120);
    }
    function fabNext() {
        var a = api();
        if (a) { a.next(); setTimeout(updateFab, 120); return; }
        var nx = document.getElementById('next-btn'); if (nx) nx.click();
    }

    /* ---------- 对外 ---------- */
    window.MusicVinyl = {
        open: open,
        close: close,
        isOpen: function () { return !!(root && root.classList.contains('show')); },
        setFab: setFabEnabled,
        toggleFab: function () { setFabEnabled(!fabIsEnabled()); return fabIsEnabled(); },
        fabOn: fabIsEnabled
    };

    // 顶部/悬浮播放器状态变化时同步（比如在小播放器上按了播放）
    document.addEventListener('DOMContentLoaded', function () {
        // 悬浮小播放器：不依赖全屏播放器是否已打开，有歌就常驻显示
        buildFab();
        var au = document.getElementById('audio');
        if (au) {
            au.addEventListener('play', function () { if (root && root.classList.contains('show')) syncMeta(); updateFab(); });
            au.addEventListener('pause', function () { if (root && root.classList.contains('show')) syncMeta(); updateFab(); });
            au.addEventListener('loadeddata', function () { if (root && root.classList.contains('show')) { syncMeta(); syncProgress(); } updateFab(); });
        }
        var ttl = document.getElementById('music-title');
        if (ttl && typeof MutationObserver !== 'undefined') {
            new MutationObserver(function () {
                if (root && root.classList.contains('show')) { syncMeta(); renderList(); }
                updateFab();
            }).observe(ttl, { childList: true, characterData: true, subtree: true });
        }
        clearInterval(fabTimer);
        fabTimer = setInterval(updateFab, 1000);
    });
})();
