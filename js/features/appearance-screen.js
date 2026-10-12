/* ============================================================
   外观设置（全屏界面）—— 管的是「整个主页面 / 整个 App」，不是某个聊天界面
   顶部两个可切换：主题配色 / 背景字体
   去掉了原来的「气泡 & CSS」「聊天头像」（那两个属于单个聊天界面）
   ============================================================ */
(function () {
    'use strict';

    var page = null;
    var SCHEME_KEY = ((typeof APP_PREFIX !== 'undefined' && APP_PREFIX) ? APP_PREFIX : 'CHAT_APP_V3_') + 'lookSchemes';
    var schemes = [];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function notify(m, t) { try { if (typeof showNotification === 'function') { showNotification(m, t || 'info', 1500); return; } } catch (e) {} }
    function save() {
        try { if (typeof throttledSaveData === 'function') { throttledSaveData(); return; } } catch (e) {}
        try { if (typeof saveData === 'function') saveData(); } catch (e) {}
    }
    function reUI() { try { if (typeof updateUI === 'function') updateUI(); } catch (e) {} }

    var PRESETS = [
        { id: 'gold', name: '金', c: '#c8a165' },
        { id: 'blue', name: '蓝', c: '#5b8def' },
        { id: 'purple', name: '紫', c: '#9b6bff' },
        { id: 'green', name: '绿', c: '#3fae7a' },
        { id: 'pink', name: '粉', c: '#ff6b9d' },
        { id: 'black-white', name: '黑白', c: '#333333' },
        { id: 'pastel', name: '红', c: '#f0736a' },
        { id: 'sunset', name: '橙', c: '#ff9142' },
        { id: 'forest', name: '深绿', c: '#2f7d5d' },
        { id: 'ocean', name: '深蓝', c: '#2b6cb0' }
    ];

    function hexToRgbStr(hex) {
        var h = String(hex || '').replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        var n = parseInt(h, 16);
        if (isNaN(n)) return '255,91,141';
        return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    }

    /* ---------------- 主题配色 ---------------- */
    function renderTheme(pane) {
        var cur = (typeof settings !== 'undefined' && settings.colorTheme) || 'gold';
        var dark = !!(typeof settings !== 'undefined' && settings.isDarkMode);
        var accent = '';
        try {
            accent = (settings.customThemeColors && settings.customThemeColors['--accent-color']) ||
                     getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ff6b9d';
        } catch (e) { accent = '#ff6b9d'; }

        pane.innerHTML =
            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-swatchbook"></i>快捷换肤</div>' +
                '<div class="fs-sec-d">切换后整个主页面、聊天、图标都会跟着变</div>' +
                '<div class="ap-swatches">' +
                    PRESETS.map(function (p) {
                        return '<button class="ap-sw' + (cur === p.id ? ' on' : '') + '" data-theme="' + p.id + '" title="' + p.name + '">' +
                            '<i style="background:' + p.c + '"></i><span>' + p.name + '</span></button>';
                    }).join('') +
                '</div>' +
            '</div>' +

            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-moon"></i>深浅模式</div>' +
                '<div class="fs-row"><span class="fs-lb">深色模式</span>' +
                    '<button class="fs-btn" id="ap-dark" style="margin-left:auto">' + (dark ? '已开启' : '已关闭') + '</button>' +
                '</div>' +
                '<div class="fs-hint">作用范围：整个 App（主页面 + 聊天 + 所有界面）</div>' +
            '</div>' +

            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-droplet"></i>强调色（主色）</div>' +
                '<div class="fs-sec-d">按钮、图标、选中态统一用的颜色</div>' +
                '<div class="fs-row">' +
                    '<input type="color" id="ap-accent" class="ap-color" value="' + esc(accent) + '">' +
                    '<input class="fs-inp" id="ap-accent-hex" value="' + esc(accent) + '">' +
                    '<button class="fs-btn primary" id="ap-accent-apply">应用</button>' +
                '</div>' +
                '<div class="fs-row"><button class="fs-btn" id="ap-accent-reset">恢复主题默认色</button></div>' +
            '</div>' +

            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-sliders-h"></i>高级编辑器</div>' +
                '<div class="fs-sec-d">细调每一个颜色变量（背景 / 文字 / 边框 / 气泡…）</div>' +
                '<div class="fs-row"><button class="fs-btn primary" id="ap-editor">打开主题编辑器</button></div>' +
            '</div>' +

            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-layer-group"></i>我的方案' +
                    '<button class="fs-btn primary" id="ap-scheme-save" style="margin-left:auto;padding:5px 11px;font-size:12px;">保存当前</button>' +
                '</div>' +
                '<div class="fs-sec-d">把现在的主题配色 / 背景 / 字体整套存下来，一键切回</div>' +
                '<div id="ap-scheme-list"></div>' +
            '</div>';

        pane.querySelectorAll('.ap-sw').forEach(function (b) {
            b.addEventListener('click', function () {
                settings.colorTheme = b.getAttribute('data-theme');
                pane.querySelectorAll('.ap-sw').forEach(function (x) { x.classList.toggle('on', x === b); });
                reUI(); save(); notify('已切换到「' + b.querySelector('span').textContent + '」', 'success');
            });
        });
        pane.querySelector('#ap-dark').addEventListener('click', function () {
            settings.isDarkMode = !settings.isDarkMode;
            this.textContent = settings.isDarkMode ? '已开启' : '已关闭';
            reUI(); save();
        });
        var col = pane.querySelector('#ap-accent'), hex = pane.querySelector('#ap-accent-hex');
        if (col && hex) {
            col.addEventListener('input', function () { hex.value = col.value; });
            hex.addEventListener('input', function () { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) col.value = hex.value; });
        }
        pane.querySelector('#ap-accent-apply').addEventListener('click', function () {
            var v = hex.value.trim();
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) { notify('颜色格式不对，例如 #ff6b9d', 'error'); return; }
            settings.customThemeColors = settings.customThemeColors || {};
            settings.customThemeColors['--accent-color'] = v;
            settings.customThemeColors['--accent-color-rgb'] = hexToRgbStr(v);
            document.documentElement.style.setProperty('--accent-color', v);
            document.documentElement.style.setProperty('--accent-color-rgb', hexToRgbStr(v));
            save(); notify('强调色已应用', 'success');
        });
        pane.querySelector('#ap-accent-reset').addEventListener('click', function () {
            settings.customThemeColors = {};
            document.documentElement.style.removeProperty('--accent-color');
            document.documentElement.style.removeProperty('--accent-color-rgb');
            reUI(); save(); notify('已恢复主题默认色', 'success');
            renderTheme(pane);
        });
        pane.querySelector('#ap-editor').addEventListener('click', function () {
            try {
                var btn = document.getElementById('open-theme-editor');
                if (btn) { btn.click(); return; }
                var m = document.getElementById('theme-editor-modal');
                if (m && typeof showModal === 'function') { showModal(m); return; }
            } catch (e) {}
            notify('主题编辑器暂不可用', 'info');
        });
        pane.querySelector('#ap-scheme-save').addEventListener('click', function () {
            var name = prompt('给这套外观起个名字', '方案 ' + (schemes.length + 1));
            if (!name || !name.trim()) return;
            schemes.push({
                id: 'ls_' + Date.now().toString(36),
                name: name.trim(),
                colorTheme: settings.colorTheme,
                isDarkMode: !!settings.isDarkMode,
                customThemeColors: JSON.parse(JSON.stringify(settings.customThemeColors || {})),
                fontSize: settings.fontSize,
                messageFontFamily: settings.messageFontFamily,
                customFontUrl: settings.customFontUrl,
                localFontName: settings.localFontName,
                bg: document.documentElement.style.getPropertyValue('--chat-bg-image') || ''
            });
            try { localforage.setItem(SCHEME_KEY, schemes); } catch (e) {}
            renderSchemeList(pane);
            notify('方案已保存', 'success');
        });
        renderSchemeList(pane);
    }

    function renderSchemeList(pane) {
        var box = pane.querySelector('#ap-scheme-list');
        if (!box) return;
        if (!schemes.length) { box.innerHTML = '<div class="fs-hint">还没有方案，点右上角「保存当前」</div>'; return; }
        box.innerHTML = schemes.map(function (s) {
            return '<div class="ap-scheme" data-id="' + esc(s.id) + '">' +
                '<span class="ap-scheme-dot" style="background:' + ((s.customThemeColors && s.customThemeColors['--accent-color']) || PRESETS.filter(function (p) { return p.id === s.colorTheme; })[0].c) + '"></span>' +
                '<span class="ap-scheme-nm">' + esc(s.name) + '</span>' +
                '<button class="fs-btn" data-use="' + esc(s.id) + '" style="padding:5px 11px;font-size:12px;">应用</button>' +
                '<button class="fs-btn danger" data-del="' + esc(s.id) + '" style="padding:5px 10px;font-size:12px;"><i class="fas fa-trash"></i></button>' +
            '</div>';
        }).join('');
        box.querySelectorAll('[data-use]').forEach(function (b) {
            b.addEventListener('click', function () { applyScheme(b.getAttribute('data-use')); });
        });
        box.querySelectorAll('[data-del]').forEach(function (b) {
            b.addEventListener('click', function () {
                var id = b.getAttribute('data-del');
                schemes = schemes.filter(function (s) { return s.id !== id; });
                try { localforage.setItem(SCHEME_KEY, schemes); } catch (e) {}
                renderSchemeList(pane);
            });
        });
    }

    function applyScheme(id) {
        var s = schemes.filter(function (x) { return x.id === id; })[0];
        if (!s) return;
        settings.colorTheme = s.colorTheme;
        settings.isDarkMode = !!s.isDarkMode;
        settings.customThemeColors = JSON.parse(JSON.stringify(s.customThemeColors || {}));
        if (s.fontSize) settings.fontSize = s.fontSize;
        if (s.messageFontFamily) settings.messageFontFamily = s.messageFontFamily;
        settings.customFontUrl = s.customFontUrl || '';
        settings.localFontName = s.localFontName || '';
        if (s.bg) document.documentElement.style.setProperty('--chat-bg-image', s.bg);
        else document.documentElement.style.removeProperty('--chat-bg-image');
        reUI(); save();
        notify('已应用「' + s.name + '」', 'success');
    }

    /* ---------------- 背景 & 字体 ---------------- */
    function renderFontBg(pane) {
        var fs = (typeof settings !== 'undefined' && settings.fontSize) || 16;
        var ff = (typeof settings !== 'undefined' && settings.messageFontFamily) || '';
        var url = (typeof settings !== 'undefined' && settings.customFontUrl) || '';
        var lfn = (typeof settings !== 'undefined' && settings.localFontName) || '';
        var bg = document.documentElement.style.getPropertyValue('--chat-bg-image') || '';

        pane.innerHTML =
            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-font"></i>字体大小</div>' +
                '<div class="fs-row">' +
                    '<input type="range" min="12" max="24" value="' + fs + '" class="fs-range" id="ap-fs">' +
                    '<span class="fs-val" id="ap-fs-v">' + fs + 'px</span>' +
                '</div>' +
                '<div class="fs-hint">整个 App 的文字一起放大 / 缩小</div>' +
            '</div>' +

            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-upload"></i>本地字体</div>' +
                '<div class="fs-sec-d">支持 TTF / OTF / WOFF / WOFF2，上传后全站生效</div>' +
                '<input type="file" id="ap-font-file" accept=".ttf,.otf,.woff,.woff2" style="display:none">' +
                '<div class="fs-row">' +
                    '<button class="fs-btn primary" id="ap-font-pick">选择字体文件</button>' +
                    '<span class="fs-hint" id="ap-font-name" style="margin:0;flex:1;">' + (lfn ? esc(lfn) : '未使用本地字体') + '</span>' +
                '</div>' +
            '</div>' +

            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-link"></i>字体链接</div>' +
                '<div class="fs-row">' +
                    '<input class="fs-inp" id="ap-font-url" placeholder="https://…/font.woff2" value="' + (url === '__local__' ? '' : esc(url)) + '">' +
                    '<button class="fs-btn primary" id="ap-font-apply">应用</button>' +
                '</div>' +
                '<div class="fs-row">' +
                    '<button class="fs-btn" id="ap-font-sys">跟随系统字体</button>' +
                    '<span class="fs-hint" style="margin:0;flex:1;">当前：' + esc(ff || '默认') + '</span>' +
                '</div>' +
            '</div>' +

            '<div class="fs-sec">' +
                '<div class="fs-sec-t"><i class="fas fa-image"></i>全局背景</div>' +
                '<div class="fs-sec-d">主页面和聊天界面统一用这张图 / 这个颜色</div>' +
                '<input type="file" id="ap-bg-file" accept="image/*" style="display:none">' +
                '<div class="ap-bg-preview" id="ap-bg-preview" style="' + (bg ? 'background-image:' + bg + ';' : '') + '">' +
                    (bg ? '' : '<span>未设置</span>') + '</div>' +
                '<div class="fs-row">' +
                    '<button class="fs-btn primary" id="ap-bg-pick">上传图片</button>' +
                    '<input type="color" id="ap-bg-color" class="ap-color" value="#f7f2ec">' +
                    '<button class="fs-btn" id="ap-bg-color-apply">用纯色</button>' +
                '</div>' +
                '<div class="fs-row"><button class="fs-btn danger" id="ap-bg-clear">清除背景</button></div>' +
            '</div>';

        var sl = pane.querySelector('#ap-fs'), sv = pane.querySelector('#ap-fs-v');
        sl.addEventListener('input', function () {
            settings.fontSize = parseInt(this.value, 10);
            sv.textContent = settings.fontSize + 'px';
            document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');
        });
        sl.addEventListener('change', save);

        var finput = pane.querySelector('#ap-font-file');
        pane.querySelector('#ap-font-pick').addEventListener('click', function () { finput.click(); });
        finput.addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var ext = '.' + f.name.split('.').pop().toLowerCase();
            if (['.ttf', '.otf', '.woff', '.woff2'].indexOf(ext) < 0) { notify('只支持 TTF/OTF/WOFF/WOFF2', 'error'); return; }
            if (f.size > 25 * 1024 * 1024) { notify('字体太大了（>25MB）', 'error'); return; }
            notify('正在加载字体…', 'info', 1500);
            var nameEl = pane.querySelector('#ap-font-name');
            f.arrayBuffer().then(function (ab) {
                var blob = new Blob([ab], { type: f.type || 'font/' + ext.slice(1) });
                var blobUrl = URL.createObjectURL(blob);
                return Promise.resolve()
                    .then(function () { return (typeof applyCustomFont === 'function') ? applyCustomFont(blobUrl) : null; })
                    .then(function () {
                        var b64 = (typeof arrayBufferToBase64 === 'function') ? arrayBufferToBase64(ab) : '';
                        try { localforage.setItem(getStorageKey('localFontFile'), { name: f.name, data: b64, mime: f.type || 'font/' + ext.slice(1) }); } catch (e) {}
                        settings.customFontUrl = '__local__';
                        settings.localFontName = f.name;
                        if (nameEl) nameEl.textContent = f.name;
                        try { saveData(); } catch (e) { save(); }
                        notify('字体已应用：' + f.name, 'success');
                    });
            }).catch(function () { notify('字体加载失败', 'error'); });
        });

        pane.querySelector('#ap-font-apply').addEventListener('click', function () {
            var v = pane.querySelector('#ap-font-url').value.trim();
            settings.customFontUrl = v;
            if (!v) {
                document.documentElement.style.removeProperty('--font-family');
                document.documentElement.style.removeProperty('--message-font-family');
            } else if (typeof applyCustomFont === 'function') {
                applyCustomFont(v).then(function () { notify('字体已应用', 'success'); }).catch(function () { notify('字体加载失败', 'error'); });
            }
            save();
        });
        pane.querySelector('#ap-font-sys').addEventListener('click', function () {
            settings.customFontUrl = '';
            settings.localFontName = '';
            settings.messageFontFamily = 'system-ui, -apple-system, sans-serif';
            try { localforage.removeItem(getStorageKey('localFontFile')); } catch (e) {}
            document.documentElement.style.setProperty('--font-family', settings.messageFontFamily);
            document.documentElement.style.setProperty('--message-font-family', settings.messageFontFamily);
            pane.querySelector('#ap-font-url').value = '';
            pane.querySelector('#ap-font-name').textContent = '未使用本地字体';
            save(); notify('已跟随系统字体', 'success');
        });

        var binput = pane.querySelector('#ap-bg-file');
        pane.querySelector('#ap-bg-pick').addEventListener('click', function () { binput.click(); });
        binput.addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var done = function (b64) {
                document.documentElement.style.setProperty('--chat-bg-image', 'url(' + b64 + ')');
                document.body.classList.add('with-background');
                try { localforage.setItem(getStorageKey('chatBackground'), b64); } catch (e) {}
                var pv = pane.querySelector('#ap-bg-preview');
                if (pv) { pv.style.backgroundImage = 'url(' + b64 + ')'; pv.innerHTML = ''; }
                save(); notify('背景已应用', 'success');
            };
            if (typeof compressImageToLimit === 'function') {
                compressImageToLimit(f, 1920, 5).then(done).catch(function () { raw(f, done); });
            } else { raw(f, done); }
        });
        pane.querySelector('#ap-bg-color-apply').addEventListener('click', function () {
            var c = pane.querySelector('#ap-bg-color').value;
            document.documentElement.style.setProperty('--chat-bg-image', c);
            try { localforage.setItem(getStorageKey('chatBackground'), c); } catch (e) {}
            var pv = pane.querySelector('#ap-bg-preview');
            if (pv) { pv.style.backgroundImage = ''; pv.style.background = c; pv.innerHTML = ''; }
            save(); notify('已换成纯色背景', 'success');
        });
        pane.querySelector('#ap-bg-clear').addEventListener('click', function () {
            document.documentElement.style.removeProperty('--chat-bg-image');
            try { localforage.removeItem(getStorageKey('chatBackground')); } catch (e) {}
            var pv = pane.querySelector('#ap-bg-preview');
            if (pv) { pv.style.backgroundImage = ''; pv.style.background = ''; pv.innerHTML = '<span>未设置</span>'; }
            save(); notify('背景已清除', 'success');
        });

        function raw(f, cb) {
            var r = new FileReader();
            r.onload = function (e) { cb(e.target.result); };
            r.readAsDataURL(f);
        }
    }

    function loadSchemes() {
        try {
            localforage.getItem(SCHEME_KEY).then(function (v) {
                if (Array.isArray(v)) schemes = v;
                var p = page && page.pane && page.pane();
                if (p && page.currentTab() === 'theme') renderTheme(p);
            }).catch(function () {});
        } catch (e) {}
    }

    function build() {
        page = window.FSPage.create({
            id: 'appearance',
            title: '外观设置',
            icon: 'fas fa-palette',
            tabs: [{ id: 'theme', name: '主题配色' }, { id: 'fontbg', name: '背景 & 字体' }],
            onRender: function (pane, tabId) {
                if (tabId === 'theme') renderTheme(pane); else renderFontBg(pane);
            }
        });
    }

    window.AppearanceScreen = {
        open: function (tabId) {
            if (!page) build();
            loadSchemes();
            page.open(tabId || 'theme');
        },
        close: function () { if (page) page.close(); }
    };

    /* 主页面 / 设置里的「外观设置」统一走全屏界面 */
    document.addEventListener('click', function (e) {
        var card = e.target.closest && e.target.closest('#appearance-settings');
        if (!card) return;
        e.preventDefault(); e.stopPropagation();
        try { window.AppearanceScreen.open('theme'); } catch (err) {}
    }, true);
})();
