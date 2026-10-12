/* ============================================================
   avatar-store.js —— 全站唯一头像数据源（ Avatars ）
   ------------------------------------------------------------
   【为什么要有这个文件】之前头像有三套互不相通的数据路径：
     ① core.js 旧键 getStorageKey('myAvatar'/'partnerAvatar')，
        loadData 时写 DOM；saveData 又从 DOM 反读落盘；
     ② chat-settings 的 conv.myAvatar/partnerAvatar（按会话分桶）；
     ③ 联系人条目 sessionList[i].avatar（添加联系人时设置）。
   谁最后写 DOM 谁赢：头像库改完被 conv.apply 清掉、旧弹窗改完被
   loadData 冲掉 —— 表现成"换头像在聊天界面不起效果"。

   【统一后的模型】（符合"多联系人"的产品语义）
     · 「我」是同一个人 → 头像/全局唯一：APP_PREFIX+'myAvatarGlobal'
     · 「对方」= 联系人 → 头像挂在 sessionList 条目 .avatar 上，
       天然按联系人隔离；群聊头像走成员各自的 .avatar
     · 旧键 / conv 字段只在首次初始化时迁移进来，之后只读不写

   所有写入必须走 Avatars.set()；所有 DOM 套用走 Avatars.applyToDom()。
   ============================================================ */
(function () {
    'use strict';

    var P = (typeof APP_PREFIX !== 'undefined' && APP_PREFIX) ? APP_PREFIX : 'CHAT_APP_V3_';
    var ME_KEY = P + 'myAvatarGlobal';

    var state = { me: '', ready: false };
    var migrateTried = false;

    function curSession() {
        try {
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList) && typeof SESSION_ID !== 'undefined' && SESSION_ID) {
                for (var i = 0; i < sessionList.length; i++) if (sessionList[i].id === SESSION_ID) return sessionList[i];
            }
        } catch (e) {}
        return null;
    }

    function persistSessionList() {
        try {
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) {
                localforage.setItem(P + 'sessionList', sessionList);
            }
        } catch (e) {}
    }

    function lfGet(k) { try { return localforage.getItem(k); } catch (e) { return Promise.resolve(null); } }
    function lfSet(k, v) { try { return localforage.setItem(k, v); } catch (e) {} }

    /* ---------- 读（同步，取内存） ---------- */
    function get(who) {
        if (who === 'me') return state.me || '';
        var s = curSession();
        return (s && s.avatar) ? String(s.avatar) : '';
    }

    /* ---------- 消息气泡头像 HTML（renderMessages 用） ---------- */
    function msgHtml(who) {
        var src = get(who);
        if (src) return '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;" alt="">';
        return '<i class="fas fa-user"></i>';
    }

    /* ---------- 写 DOM（顶栏 / 消息区旁大头像） ---------- */
    function applyToDom() {
        var meEl = document.getElementById('my-avatar');
        var taEl = document.getElementById('partner-avatar');
        var titleEl = document.getElementById('wx-title-avatar');
        var meSrc = get('me'), taSrc = get('ta');
        if (meEl) {
            meEl.innerHTML = meSrc
                ? '<img src="' + meSrc + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" alt="">'
                : '<i class="fas fa-user"></i>';
        }
        if (taEl) {
            taEl.innerHTML = taSrc
                ? '<img src="' + taSrc + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" alt="">'
                : '<i class="fas fa-user"></i>';
        }
        if (titleEl) {
            if (taSrc) {
                titleEl.innerHTML = '<img src="' + taSrc + '" alt="">';
                titleEl.style.display = '';
            } else {
                var pn = document.getElementById('partner-name');
                var nm = (pn && pn.textContent) ? pn.textContent : '?';
                titleEl.textContent = String(nm).charAt(0);
                /* 顶栏头像显隐仍尊重 conv 设置：默认（没设头像）隐藏小头像圈 */
                var hide = true;
                try {
                    if (typeof settings !== 'undefined' && settings && settings.conv && settings.conv.headerAvatar === true) hide = false;
                } catch (e) {}
                titleEl.style.display = hide ? 'none' : '';
            }
        }
    }

    /* ---------- 全界面刷新：DOM + 消息气泡重画 ---------- */
    function refresh() {
        applyToDom();
        try { if (typeof renderMessages === 'function') renderMessages(true); } catch (e) {}
        try {
            document.dispatchEvent(new CustomEvent('avatars:changed', { detail: { me: state.me } }));
        } catch (e) {}
    }

    /* ---------- 唯一写入口 ---------- */
    function set(who, src) {
        src = (src || '').trim();
        if (who === 'me') {
            state.me = src;
            lfSet(ME_KEY, src);
        } else {
            var s = curSession();
            if (s) { s.avatar = src; persistSessionList(); }
        }
        refresh();
    }

    /* ---------- 会话切换 / 启动后重读当前联系人头像 ---------- */
    function reload() {
        applyToDom();
    }

    /* ---------- 初始化：迁移旧数据，只跑一次 ---------- */
    async function init() {
        if (state.ready) return;
        // 1) 我的头像：全局键 → 旧会话键 → conv.myAvatar
        var me = null;
        try { me = await lfGet(ME_KEY); } catch (e) {}
        if (!me) {
            try {
                if (typeof getStorageKey === 'function' && typeof SESSION_ID !== 'undefined' && SESSION_ID) {
                    me = await lfGet(getStorageKey('myAvatar'));
                }
            } catch (e) {}
        }
        if (!me) {
            try {
                if (typeof settings !== 'undefined' && settings && settings.conv && settings.conv.myAvatar) me = settings.conv.myAvatar;
            } catch (e) {}
        }
        state.me = me || '';

        // 2) 联系人头像：sessionList[].avatar 为准；为空的联系人尝试从旧键 / conv 迁移（仅当前会话能读到自己的旧键）
        if (!migrateTried) {
            migrateTried = true;
            try {
                var s = curSession();
                if (s && !s.avatar) {
                    var legacy = null;
                    if (typeof getStorageKey === 'function' && typeof SESSION_ID !== 'undefined' && SESSION_ID) {
                        legacy = await lfGet(getStorageKey('partnerAvatar'));
                    }
                    if (!legacy && typeof settings !== 'undefined' && settings && settings.conv && settings.conv.partnerAvatar) {
                        legacy = settings.conv.partnerAvatar;
                    }
                    if (legacy) { s.avatar = legacy; persistSessionList(); }
                }
            } catch (e) {}
        }
        state.ready = true;
        applyToDom();
    }

    window.Avatars = {
        get: get,
        set: set,
        msgHtml: msgHtml,
        applyToDom: applyToDom,
        refresh: refresh,
        reload: reload,
        init: init
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { init(); }, 0); });
    } else {
        setTimeout(function () { init(); }, 0);
    }
})();
