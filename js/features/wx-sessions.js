/* ============================================================
   仿微信「传讯」好友列表入口
   · 点击传讯 → 显示会话列表（不直接进聊天）
   · 右上角 + → 添加好友 / 添加群聊（就地添加，不重载页面）
   · 点击某会话 → 就地切换会话（saveData → 切 SESSION_ID → loadData），不重载
   · 左上角 首页 → 回到桌面主页面
   ============================================================ */
(function () {
    'use strict';

    var screen = null, listEl = null, addBtn = null, homeBtn = null, sheetMask = null;

    function el(id) { return document.getElementById(id); }
    function prefix() { return (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_'); }

    /* ---------- 桌面（主页面）显示 / 隐藏 ---------- */
    // 必须走 HomeScreen 的 show/hide（切 class）。
    // 早期版本直接写 style.display='none'，之后 HomeScreen.show() 加 class 也盖不住内联样式，
    // 会导致桌面再也回不来。
    function hideDesk() {
        try {
            if (window.HomeScreen && typeof window.HomeScreen.hide === 'function') { window.HomeScreen.hide(); return; }
        } catch (e) {}
        try { if (typeof hideHome === 'function') { hideHome(); return; } } catch (e) {}
        var home = el('home-screen');
        if (home) home.classList.remove('show');
    }
    function showDesk() {
        try {
            if (window.HomeScreen && typeof window.HomeScreen.show === 'function') { window.HomeScreen.show(); return; }
        } catch (e) {}
        try { if (typeof showHome === 'function') { showHome(); return; } } catch (e) {}
        var home = el('home-screen');
        if (home) { home.style.display = ''; home.classList.add('show'); }
    }

    function notify(msg, type) {
        try { if (typeof showNotification === 'function') { showNotification(msg, type || 'success'); } } catch (e) {}
    }

    function fmtTime(ts) {
        if (!ts) return '';
        var d = new Date(ts), now = new Date();
        var sameDay = d.toDateString() === now.toDateString();
        if (sameDay) {
            var h = ('0' + d.getHours()).slice(-2), m = ('0' + d.getMinutes()).slice(-2);
            return h + ':' + m;
        }
        var y = ('0' + d.getDate()).slice(-2);
        return (d.getMonth() + 1) + '/' + y;
    }

    async function getLast(session) {
        try {
            var key = prefix() + session.id + '_chatMessages';
            var msgs = await localforage.getItem(key);
            if (Array.isArray(msgs) && msgs.length) {
                var m = msgs[msgs.length - 1];
                var preview = '[消息]';
                if (m.image) preview = '[图片]';
                else if (m.sticker) preview = '[表情包]';
                else if (m.voice) preview = '[语音]';
                else if (m.text) preview = m.text;
                else if (m.type === 'system') preview = '';
                return { preview: preview, ts: m.timestamp };
            }
        } catch (e) {}
        return { preview: '', ts: session.createdAt };
    }

    function avatarHTML(session) {
        if (session.kind === 'group' && Array.isArray(session.members) && session.members.length) {
            var members = session.members.slice(0, 4);
            var imgs = members.map(function (mid) {
                var f = (typeof sessionList !== 'undefined' && Array.isArray(sessionList) ? sessionList : []).filter(function (s) { return s.id === mid; })[0];
                if (f && f.avatar) return '<div class="wxc-mini" style="background:transparent"><img src="' + escapeHtml(f.avatar) + '"></div>';
                if (f) return '<div class="wxc-mini">' + escapeHtml((f.name || '联').charAt(0)) + '</div>';
                return '<div class="wxc-mini"><i class="fas fa-user"></i></div>';
            }).join('');
            return '<div class="wx-session-avatar wx-session-avatar-group">' + imgs + '</div>';
        }
        if (session.avatar) {
            return '<div class="wx-session-avatar" style="background:transparent"><img src="' + escapeHtml(session.avatar) + '"></div>';
        }
        var name = (session.name || '').trim();
        var ch = name ? name.charAt(0) : '';
        if (!ch) {
            return '<div class="wx-session-avatar wx-session-avatar-blank"><i class="fas fa-user"></i></div>';
        }
        return '<div class="wx-session-avatar">' + escapeHtml(ch) + '</div>';
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    async function render() {
        if (!listEl) return;
        var list = (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) ? sessionList : [];
        if (!list.length) {
            listEl.innerHTML = '<div class="wx-sessions-empty">还没有会话<br>点右上角 + 添加好友 / 群聊</div>';
            return;
        }
        var curId = (typeof SESSION_ID !== 'undefined') ? SESSION_ID : null;
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            var last = await getLast(s);
            html +=
                '<div class="wx-session-item" data-id="' + escapeHtml(s.id) + '">' +
                avatarHTML(s) +
                '<div class="wx-session-main">' +
                '<div class="wx-session-name">' + escapeHtml(s.name || '未命名') + '</div>' +
                '<div class="wx-session-preview">' + escapeHtml(last.preview || '暂无消息') + '</div>' +
                '</div>' +
                '<div class="wx-session-meta">' +
                '<div class="wx-session-time">' + fmtTime(last.ts) + '</div>' +
                (s.id === curId ? '<div class="wx-session-badge" style="background:var(--accent-color,#ff5b8d)">●</div>' : '') +
                '</div>' +
                '</div>';
        }
        listEl.innerHTML = html;
    }

    /* ---------- 就地切换会话（不刷新页面） ---------- */
    async function switchSession(id) {
        try {
            // 0) 上切换锁：锁住期间所有 saveData 拒绝落盘，
            //    防止旧会话的 messages/settings 被写进新会话的存储键（串数据）
            window.__SESSION_SWITCHING__ = true;
            // 1. 先把当前会话的数据落盘（saveData 按当前 SESSION_ID 写入）
            if (typeof saveData === 'function') { await saveData(); }
        } catch (e) { console.warn('[wx-sessions] 保存当前会话失败：', e); }

        try { SESSION_ID = id; } catch (e) { console.warn('[wx-sessions] 切换 SESSION_ID 失败', e); }

        try { await localforage.setItem(prefix() + 'lastSessionId', id); } catch (e) {}
        // 只改地址栏 hash，不触发页面跳转/重载
        try { history.replaceState(null, '', '#' + id); } catch (e) {}

        try {
            // 2. 按新的 SESSION_ID 把该会话的数据读回内存
            if (typeof loadData === 'function') { await loadData(); }
        } catch (e) { console.warn('[wx-sessions] 载入会话数据失败：', e); }
        finally {
            window.__SESSION_SWITCHING__ = false;
        }

        try { displayedMessageCount = 20; } catch (e) {}

        // 3. 重新套用外观 / 名字 / 头像（这些函数在核心脚本里是全局的，名字存在才调）
        try { if (typeof applySettings === 'function') applySettings(); } catch (e) {}
        try { if (typeof applyChatBackground === 'function') applyChatBackground(); } catch (e) {}
        try {
            var pn = el('partner-name');
            if (pn && typeof settings !== 'undefined' && settings.partnerName) pn.textContent = settings.partnerName;
        } catch (e) {}
        // 新会话 = 新联系人：头像按 sessionList 条目刷新（顶栏 + 消息气泡）
        try { if (window.Avatars && window.Avatars.reload) window.Avatars.reload(); } catch (e) {}
        try { if (window.ChatConvSettings && typeof window.ChatConvSettings.apply === 'function') window.ChatConvSettings.apply(); } catch (e) {}

        // 4. 重画消息
        try { if (typeof renderMessages === 'function') renderMessages(); } catch (e) {}
    }

    async function enter(id) {
        if (!id) return;
        var curId = (typeof SESSION_ID !== 'undefined') ? SESSION_ID : null;
        close();
        if (id === curId) return;   // 同一会话：聊天层本来就在背后，直接显示
        await switchSession(id);
        await render();
    }

    /* ---------- 添加好友 / 群聊：微信式「新联系人」界面，不重载 ---------- */
    function nextContactNo() {
        var list = (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) ? sessionList : [];
        var max = 0;
        list.forEach(function (s) {
            var m = /^联系人(\d+)$/.exec((s && s.name) || '');
            if (m) max = Math.max(max, parseInt(m[1], 10));
            // 也统计 kind=friend 的数量做兜底
        });
        // 返回一个比现有最大序号 +1，或按好友数量 +1
        var friendCount = list.filter(function (s) { return !s.kind || s.kind === 'friend'; }).length;
        return Math.max(max + 1, friendCount + 1);
    }

    function contactsExclude() {
        var list = (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) ? sessionList : [];
        return list.filter(function (s) { return !s.kind || s.kind === 'friend'; });
    }

    // 生成联系人面板（好友 / 群聊通用），返回面板 DOM
    function buildContactPanel(kind) {
        var isGroup = kind === 'group';
        var panel = document.createElement('div');
        panel.className = 'wx-contact-panel';
        var defaultName = isGroup ? '' : ('联系人' + nextContactNo());
        var friends = contactsExclude();

        var friendChecks = '';
        if (isGroup) {
            if (friends.length) {
                friendChecks = '<div class="wxc-label">选择群成员</div>' +
                    '<div class="wxc-members">' + friends.map(function (f) {
                        return '<label class="wxc-member">' +
                            '<input type="checkbox" data-mid="' + escapeHtml(f.id) + '">' +
                            '<div class="wxc-member-av">' + (f.avatar ? '<img src="' + escapeHtml(f.avatar) + '">' : '<i class="fas fa-user"></i>') + '</div>' +
                            '<div class="wxc-member-name">' + escapeHtml(f.name || '联系人') + '</div>' +
                            '</label>';
                    }).join('') + '</div>';
            } else {
                friendChecks = '<div class="wxc-hint">还没有可加入的联系人，先添加好友吧</div>';
            }
        }

        panel.innerHTML =
            '<div class="wxc-head">' +
                '<button class="wxc-back" id="wxc-back"><i class="fas fa-chevron-left"></i></button>' +
                '<div class="wxc-title">' + (isGroup ? '创建群聊' : '新的联系人') + '</div>' +
                '<button class="wxc-save" id="wxc-save"><i class="fas fa-check"></i></button>' +
            '</div>' +
            '<div class="wxc-body">' +
                '<div class="wxc-avatar-wrap">' +
                    '<div class="wxc-avatar" id="wxc-avatar">' + (isGroup ? '<i class="fas fa-users"></i>' : '<i class="fas fa-user"></i>') + '</div>' +
                    '<button class="wxc-avatar-edit" id="wxc-avatar-edit"><i class="fas fa-camera"></i></button>' +
                '</div>' +
                '<div class="wxc-field">' +
                    '<div class="wxc-label">' + (isGroup ? '群聊名称' : '名字') + '</div>' +
                    '<input class="wxc-input" id="wxc-name" placeholder="' + (isGroup ? '输入群聊名称' : '输入名字（留空用默认）') + '" value="' + escapeHtml(isGroup ? '' : defaultName) + '">' +
                '</div>' +
                friendChecks +
            '</div>';
        return panel;
    }

    async function saveNewContact(kind, data) {
        var name = (data.name || '').trim();
        if (kind === 'friend' && !name) name = '联系人' + nextContactNo();
        if (kind === 'group' && !name) name = '群聊';

        var newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        var newSession = {
            id: newId, name: name, createdAt: Date.now(), kind: kind,
            avatar: data.avatar || ''
        };
        if (kind === 'group' && Array.isArray(data.members) && data.members.length) {
            newSession.members = data.members;
        }

        try {
            var arr;
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) {
                sessionList.push(newSession);
                arr = sessionList;
            } else {
                arr = (await localforage.getItem(prefix() + 'sessionList')) || [];
                arr.push(newSession);
                try { sessionList = arr; } catch (e) {}
            }
            await localforage.setItem(prefix() + 'sessionList', arr);
        } catch (e) { console.warn('[wx-sessions] 保存会话列表失败：', e); }

        await render();
        notify('已添加「' + name + '」', 'success');
        return newSession;
    }

    function openNewContact(kind) {
        var panel = buildContactPanel(kind);
        document.body.appendChild(panel);
        var isGroup = kind === 'group';
        var avatarData = '';

        function closePanel() { if (panel.parentNode) panel.parentNode.removeChild(panel); }

        panel.querySelector('#wxc-back').addEventListener('click', closePanel);
        panel.querySelector('#wxc-save').addEventListener('click', function () {
            var name = panel.querySelector('#wxc-name').value || '';
            var members = [];
            if (isGroup) {
                panel.querySelectorAll('.wxc-member input:checked').forEach(function (cb) {
                    members.push(cb.getAttribute('data-mid'));
                });
            }
            closePanel();
            saveNewContact(kind, { name: name, avatar: avatarData, members: members });
        });

        // 头像上传
        var fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        panel.querySelector('#wxc-avatar-edit').addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function () {
            var f = fileInput.files && fileInput.files[0];
            if (!f) return;
            var fr = new FileReader();
            fr.onload = function () {
                avatarData = String(fr.result || '');
                var av = panel.querySelector('#wxc-avatar');
                av.innerHTML = '<img src="' + escapeHtml(avatarData) + '">';
            };
            fr.readAsDataURL(f);
            fileInput.value = '';
        });
    }

    async function addSession(kind) {
        openNewContact(kind);
    }

    function open() {
        hideDesk();
        if (screen) screen.classList.add('wx-show');
        render();
    }

    /* ---------- 直接进入聊天界面（不再经过会话列表） ----------
       点桌面「传讯」/ 底栏「主界面」时调用：确保会话列表已关闭、
       桌面隐藏，让常驻在底层的聊天界面（顶栏 + 消息 + 输入栏）露出来。 */
    function enterCurrent() {
        close();
        hideDesk();
        try { if (typeof renderMessages === 'function') renderMessages(); } catch (e) {}
        try { if (window.ChatConvSettings && typeof window.ChatConvSettings.apply === 'function') window.ChatConvSettings.apply(); } catch (e) {}
    }
    function close() {
        if (screen) screen.classList.remove('wx-show');
    }
    function backToDesk() {
        close();
        showDesk();
    }

    function bind() {
        if (screen) return;
        screen = el('wx-sessions');
        listEl = el('wx-sessions-list');
        addBtn = el('wx-sessions-add');
        homeBtn = el('wx-sessions-home');
        sheetMask = el('wx-add-sheet-mask');
        if (!screen) return;

        listEl.addEventListener('click', function (e) {
            var item = e.target.closest('.wx-session-item');
            if (item) enter(item.dataset.id);
        });

        // 左上角：回到桌面主页面
        if (homeBtn) homeBtn.addEventListener('click', backToDesk);

        if (addBtn) addBtn.addEventListener('click', function () {
            if (sheetMask) sheetMask.classList.add('wx-show');
        });
        if (sheetMask) {
            sheetMask.addEventListener('click', function (e) {
                if (e.target === sheetMask) sheetMask.classList.remove('wx-show');
            });
            var cancel = el('wx-add-cancel');
            if (cancel) cancel.addEventListener('click', function () { sheetMask.classList.remove('wx-show'); });
            var friend = el('wx-add-friend');
            if (friend) friend.addEventListener('click', function () { sheetMask.classList.remove('wx-show'); addSession('friend'); });
            var group = el('wx-add-group');
            if (group) group.addEventListener('click', function () { sheetMask.classList.remove('wx-show'); addSession('group'); });
        }
    }

    // 兼容旧逻辑：现在不再依赖 reload，保留以防外部仍在调用
    function maybeAutoOpen() {
        try {
            if (localStorage.getItem('wxAutoOpenChat') === '1') {
                localStorage.removeItem('wxAutoOpenChat');
                hideDesk();
                return true;
            }
        } catch (e) {}
        return false;
    }

    // 暴露
    window.WxSessions = {
        open: open,
        enterCurrent: enterCurrent,
        close: close,
        bind: bind,
        maybeAutoOpen: maybeAutoOpen,
        render: render,
        backToDesk: backToDesk,
        switchSession: switchSession
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
