let envelopeData = { outbox: [], inbox: [] }; 
let currentEnvTab = 'outbox';
let editingEnvId = null; 
let editingEnvSection = null; 

async function loadEnvelopeData() {
    const saved = await localforage.getItem(getStorageKey('envelopeData'));
    if (saved) envelopeData = saved;
    const oldPending = await localforage.getItem(getStorageKey('pending_envelope'));
    if (oldPending && envelopeData.outbox.length === 0) {
        envelopeData.outbox.push({
            id: 'legacy_' + Date.now(),
            content: '（历史寄出的信件）',
            sentTime: oldPending.sentTime,
            replyTime: oldPending.replyTime,
            status: 'pending'
        });
        await localforage.removeItem(getStorageKey('pending_envelope'));
        saveEnvelopeData();
    }
}

function saveEnvelopeData() {
    localforage.setItem(getStorageKey('envelopeData'), envelopeData);
}

/* ---------- 渲染小工具 ---------- */
function escEnv(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtEnvDate(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000 && d.getDate() === now.getDate()) return '今天 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function envPartnerName() {
    return (typeof settings !== 'undefined' && settings.partnerName) || '对方';
}
function envMyName() {
    return (typeof settings !== 'undefined' && settings.myName) || '我';
}
function envTodayStr() {
    const d = new Date();
    const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日  星期' + wk;
}

async function checkEnvelopeStatus() {
    await loadEnvelopeData();
    const now = Date.now();
    let changed = false;
    let newReplyLetter = null;
    envelopeData.outbox.forEach(letter => {
        if (letter.status === 'sent' && letter.deliveredTime && now >= letter.deliveredTime) {
            letter.status = 'received';
            changed = true;
        }
        if (letter.willReply && letter.status === 'received' && letter.replyTime && now >= letter.replyTime) {
            letter.status = 'replied';
            const replyContent = generateEnvelopeReplyText();
            const replyId = 'reply_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
            const inboxLetter = {
                id: replyId,
                refId: letter.id,
                originalContent: letter.content,
                content: replyContent,
                receivedTime: Date.now(),
                isNew: true
            };
            envelopeData.inbox.push(inboxLetter);
            newReplyLetter = inboxLetter;
            changed = true;
            playSound('message');
            // 本地已经在 App 开着的时候把回信生成出来了，取消掉之前登记的后端推送，避免用户已经看到了还收到一条迟到的通知
            if (window.pushNotify) window.pushNotify.cancel('envelope_reply_' + letter.id);
        }
    });
    if (changed) {
        saveEnvelopeData();
        if (newReplyLetter) showEnvelopeReplyPopup(newReplyLetter);
    }

    // 梦角主动来信检查
    await checkPartnerInitiatedLetter();
}

async function checkPartnerInitiatedLetter() {
    const COOLDOWN_MIN = 12 * 60 * 60 * 1000;
    const COOLDOWN_MAX = 24 * 60 * 60 * 1000;
    const PROB = 0.70;
    const KEY = getStorageKey('partnerLetterNextTime');

    const nextTimeRaw = await localforage.getItem(KEY);
    const now = Date.now();

    if (nextTimeRaw !== null && now < nextTimeRaw) return;

    if (Math.random() >= PROB) {
        // 未触发，设下次检查窗口（下次启动时重新随机）
        const cooldown = COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
        await localforage.setItem(KEY, now + cooldown);
        return;
    }

    // 触发：生成梦角主动来信（与回信逻辑相同，从字卡池随机抽取）
    const content = generateEnvelopeReplyText();
    const letterId = 'partner_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const inboxLetter = {
        id: letterId,
        refId: null,
        originalContent: null,
        content,
        receivedTime: now,
        isNew: true,
        fromPartner: true
    };
    envelopeData.inbox.push(inboxLetter);
    saveEnvelopeData();

    // 设冷却，下次最早 12~24 小时后再触发
    const cooldown = COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
    await localforage.setItem(KEY, now + cooldown);

    showEnvelopeReplyPopup(inboxLetter);
}

// 定时检查：每 6 小时检查一次信封状态和主动来信
setInterval(() => {
    if (typeof checkEnvelopeStatus === 'function') {
        checkEnvelopeStatus().catch(e => console.warn('envelope interval check error:', e));
    }
}, 6 * 60 * 60 * 1000);

// 页面从后台切回前台时也检查一次（iOS Safari 后台挂起回来后补发）
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && typeof checkEnvelopeStatus === 'function') {
            // 稍微延迟一下，等页面完全恢复
            setTimeout(() => {
                checkEnvelopeStatus().catch(e => console.warn('envelope visibility check error:', e));
            }, 1000);
        }
    });
}

function showEnvelopeReplyPopup(letter) {
    const existing = document.getElementById('envelope-reply-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'envelope-reply-popup';
    popup.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:20px;padding:18px 20px;z-index:8000;max-width:320px;width:88%;box-shadow:0 8px 32px rgba(0,0,0,0.18);display:flex;flex-direction:column;gap:12px;animation:slideUpNotif 0.4s cubic-bezier(0.22,1,0.36,1);';
    popup.innerHTML = `
        <style>@keyframes slideUpNotif{from{opacity:0;transform:translateX(-50%) translateY(24px) scale(0.9)}60%{transform:translateX(-50%) translateY(-4px) scale(1.02)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}</style>
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:26px;">💌</span>
            <div>
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${letter.fromPartner ? ((typeof settings !== 'undefined' && settings.partnerName) || '对方') + '给你写了一封信' : '收到了一封回信'}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;opacity:0.8;">${letter.fromPartner ? '打开信箱查看吧~' : 'Ta 给你写了回信，快去看看吧~'}</div>
            </div>
        </div>
        <div style="display:flex;gap:8px;">
            <button onclick="document.getElementById('envelope-reply-popup').remove();" style="flex:1;padding:8px 0;border-radius:12px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-secondary);font-size:13px;cursor:pointer;">稍后查看</button>
            <button onclick="openEnvelopeAndViewReply('${letter.id}');" style="flex:2;padding:8px 0;border-radius:12px;border:none;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">立即阅读 ✉</button>
        </div>`;
    document.body.appendChild(popup);
    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 8000);
}

const APPEARANCE_PANEL_TITLES = {
    'theme': '主题配色', 'font': '字体设置', 'background': '聊天背景',
    'bubble': '气泡样式', 'avatar': '聊天头像', 'css': '自定义CSS',
    'font-bg': '背景 & 字体', 'bubble-css': '气泡 & CSS'
};
window.showAppearancePanel = function(panel) {
    const panelMap = {
        'font-bg': ['font', 'background'],
        'bubble-css': ['bubble', 'css']
    };
    document.getElementById('appearance-nav-grid').style.display = 'none';
    var unBtn = document.getElementById('update-notice-btn');
    if (unBtn) unBtn.style.display = 'none';
    var galleryBanner = document.getElementById('gallery-banner-entry');
    if (galleryBanner) galleryBanner.style.display = 'none';
    document.getElementById('appearance-panel-container').style.display = 'block';
    document.getElementById('appearance-panel-title').textContent = APPEARANCE_PANEL_TITLES[panel] || panel;
    document.querySelectorAll('.appearance-sub-panel').forEach(p => p.style.display = 'none');
    if (panelMap[panel]) {
        panelMap[panel].forEach(sub => {
            const target = document.getElementById('appearance-panel-' + sub);
            if (target) target.style.display = 'block';
        });
    } else {
        const target = document.getElementById('appearance-panel-' + panel);
        if (target) target.style.display = 'block';
    }
    if (panel === 'bubble' || panel === 'bubble-css') { setTimeout(() => { if (typeof window.updateBubblePreviewFn === 'function') window.updateBubblePreviewFn(); }, 50); }
};
window.hideAppearancePanel = function() {
    document.getElementById('appearance-nav-grid').style.display = 'grid';
    document.getElementById('appearance-panel-container').style.display = 'none';
    document.querySelectorAll('.appearance-sub-panel').forEach(p => p.style.display = 'none');
    var unBtn = document.getElementById('update-notice-btn');
    if (unBtn) unBtn.style.display = 'flex';
    var galleryBanner = document.getElementById('gallery-banner-entry');
    if (galleryBanner) galleryBanner.style.display = 'flex';
};

window.openEnvelopeAndViewReply = function(replyId) {
    const popup = document.getElementById('envelope-reply-popup');
    if (popup) popup.remove();
    const envelopeModal = document.getElementById('envelope-modal');
    showModal(envelopeModal);
    setTimeout(() => {
        switchEnvTab('inbox');
        viewEnvLetter('inbox', replyId);
    }, 200);
};

/* 字卡库为空时的兜底句子，避免回信里出现 undefined */
const ENV_FALLBACK_LINES = [
    '收到你的信了', '我把它读了三遍', '最近一切都好，只是偶尔会想起你',
    '你说的话我都记着', '今天路过那家店，又想起你', '别熬夜，早点睡',
    '我也很想你', '等你有空的时候，我们再一起走走', '窗外的风有点凉了',
    '写信这件事，比我想的更像你', '有些话写下来才说得出口'
];

function generateEnvelopeReplyText() {
    let pool = [];
    try { if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) pool = customReplies.filter(Boolean); } catch (e) {}
    if (!pool.length) { try { if (window._customReplies && window._customReplies.length) pool = window._customReplies.filter(Boolean); } catch (e) {} }
    if (!pool.length) pool = ENV_FALLBACK_LINES;

    const sentenceCount = Math.floor(Math.random() * 5) + 8;   // 8-12 句
    const parts = [];
    for (let i = 0; i < sentenceCount; i++) {
        const line = String(pool[Math.floor(Math.random() * pool.length)] || '').trim();
        if (!line) continue;
        const punctuation = Math.random() < 0.2 ? '！' : (Math.random() < 0.25 ? '…' : '。');
        parts.push(line + punctuation);
    }
    if (!parts.length) parts.push('收到你的信了。');
    /* 每 3~4 句分一段，读起来像一封信而不是一整块 */
    let out = '';
    let inPara = 0;
    let paraTarget = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < parts.length; i++) {
        out += parts[i];
        inPara++;
        if (inPara >= paraTarget && i !== parts.length - 1) {
            out += '\n\n';
            inPara = 0;
            paraTarget = 3 + Math.floor(Math.random() * 2);
        }
    }
    return out;
}


window.switchEnvTab = function(tab) {
    currentEnvTab = tab;
    var tabs = ['inbox', 'outbox', 'compose', 'stats'];
    tabs.forEach(function (t) {
        var b = document.getElementById('env-tab-' + t);
        if (b) b.classList.toggle('active', tab === t);
    });
    /* 顶栏标题 */
    var barTitle = document.getElementById('ev-bar-title');
    var barSub = document.getElementById('ev-bar-sub');
    var titles = { inbox: ['收件箱', 'Inbox'], outbox: ['寄件箱', 'Outbox'], stats: ['信件数据', 'Statistics'], compose: ['提笔写信', 'Write'] };
    if (barTitle) barTitle.textContent = (titles[tab] || titles.inbox)[0];
    if (barSub) barSub.textContent = (titles[tab] || titles.inbox)[1];

    if (tab === 'compose') {
        // 写封信：直接进入撰写表单
        document.getElementById('env-inbox-section').style.display = 'none';
        document.getElementById('env-outbox-section').style.display = 'none';
        document.getElementById('env-stats-section').style.display = 'none';
        document.getElementById('env-main-close-btn').style.display = 'none';
        document.getElementById('env-compose-title').textContent = '写一封信';
        document.getElementById('envelope-input').value = '';
        document.getElementById('env-send-to-chat').checked = false;
        document.getElementById('env-compose-form').dataset.replyMode = '';
        var hint = document.getElementById('env-reply-time-info');
        if (hint) hint.textContent = '对方将在 10-24 小时内回信（8-12 句话）';
        var origCtx = document.getElementById('env-compose-original-ctx');
        if (origCtx) origCtx.style.display = 'none';
        /* 信纸抬头 */
        var dt = document.getElementById('ev-compose-date');
        if (dt) dt.textContent = envTodayStr();
        var toEl = document.getElementById('ev-compose-to');
        if (toEl) toEl.textContent = '致 ' + envPartnerName() + '：';
        var sg = document.getElementById('ev-compose-sign');
        if (sg) sg.textContent = envMyName();
        document.getElementById('env-compose-form').style.display = 'block';
        return;
    }
    if (tab === 'stats') {
        document.getElementById('env-inbox-section').style.display = 'none';
        document.getElementById('env-outbox-section').style.display = 'none';
        document.getElementById('env-stats-section').style.display = 'block';
        document.getElementById('env-compose-form').style.display = 'none';
        document.getElementById('env-main-close-btn').style.display = 'flex';
        renderEnvStats();
        return;
    }
    // inbox / outbox
    document.getElementById('env-inbox-section').style.display = tab === 'inbox' ? 'block' : 'none';
    document.getElementById('env-outbox-section').style.display = tab === 'outbox' ? 'block' : 'none';
    document.getElementById('env-stats-section').style.display = 'none';
    document.getElementById('env-compose-form').style.display = 'none';
    document.getElementById('env-main-close-btn').style.display = 'flex';
    renderEnvelopeLists();
};

function renderEnvelopeLists() {
    renderOutboxList();
    renderInboxList();
    const pendingCount = envelopeData.outbox.filter(l => l.status === 'pending').length;
    const newInboxCount = envelopeData.inbox.filter(l => l.isNew).length;
    const outboxBadge = document.getElementById('env-outbox-badge');
    const inboxBadge = document.getElementById('env-inbox-badge');
    if (outboxBadge) { outboxBadge.textContent = pendingCount; outboxBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none'; }
    if (inboxBadge) { inboxBadge.textContent = newInboxCount; inboxBadge.style.display = newInboxCount > 0 ? 'inline-block' : 'none'; }
    const envelopeEntryBadge = document.getElementById('env-entry-badge');
    if (envelopeEntryBadge) { envelopeEntryBadge.style.display = newInboxCount > 0 ? 'inline-block' : 'none'; }
}

function renderOutboxList() {
    const list = document.getElementById('env-outbox-list');
    if (!list) return;
    const pName = envPartnerName();
    if (envelopeData.outbox.length === 0) {
        list.innerHTML = `<div class="ev-empty">
            <i class="fas fa-paper-plane"></i>
            <div class="t">还没有寄出的信</div>
            <div class="s">提笔写一封信，让它慢慢寄到 ${escEnv(pName)} 身边</div>
        </div>`;
        return;
    }
    list.innerHTML = envelopeData.outbox.slice().reverse().map(letter => {
        const date = fmtEnvDate(letter.sentTime);
        let tag = '已寄出', acc = '';
        if (letter.status === 'replied') { tag = '已收到回信'; acc = 'acc'; }
        else if (letter.status === 'received') { tag = '已送达'; acc = 'acc'; }
        return `
        <div class="ev-item out" onclick="viewEnvLetter('outbox','${letter.id}')">
            <div class="ev-seal"><i class="fas fa-paper-plane"></i></div>
            <div class="ev-main">
                <div class="ev-row1">
                    <span class="ev-who">致 ${escEnv(pName)}</span>
                    <span class="ev-when">${escEnv(date)}</span>
                </div>
                <div class="ev-prev">${escEnv(letter.content)}</div>
                <div class="ev-tags">
                    <span class="ev-tag ${acc}"><i class="fas fa-circle" style="font-size:5px;"></i>${escEnv(tag)}</span>
                    <span class="ev-tag">${(letter.content || '').length} 字</span>
                </div>
            </div>
            <button class="ev-del" onclick="deleteEnvLetter(event,'outbox','${letter.id}')"><i class="fas fa-xmark"></i></button>
        </div>`;
    }).join('');
}

function renderInboxList() {
    const list = document.getElementById('env-inbox-list');
    if (!list) return;
    const pName = envPartnerName();
    if (envelopeData.inbox.length === 0) {
        list.innerHTML = `<div class="ev-empty">
            <i class="fas fa-envelope-open-text"></i>
            <div class="t">还没有收到信</div>
            <div class="s">${escEnv(pName)} 正在认真写回信，或者你也可以先寄一封</div>
        </div>`;
        return;
    }
    list.innerHTML = envelopeData.inbox.slice().reverse().map(letter => {
        const date = fmtEnvDate(letter.receivedTime);
        const isNew = !!letter.isNew;
        const who = letter.fromPartner ? pName : pName + '（回信）';
        const orig = letter.originalContent
            ? `回复你的《${escEnv(letter.originalContent.slice(0, 14))}${letter.originalContent.length > 14 ? '…' : ''}》`
            : '';
        return `
        <div class="ev-item in${isNew ? ' unread' : ''}" onclick="viewEnvLetter('inbox','${letter.id}')">
            <div class="ev-seal"><i class="fas fa-envelope-open-text"></i></div>
            <div class="ev-main">
                <div class="ev-row1">
                    ${isNew ? '<span class="ev-dot"></span>' : ''}
                    <span class="ev-who">${escEnv(who)}</span>
                    <span class="ev-when">${escEnv(date)}</span>
                </div>
                <div class="ev-prev">${escEnv(letter.content)}</div>
                <div class="ev-tags">
                    ${letter.fromPartner ? '<span class="ev-tag acc"><i class="fas fa-feather-pointed" style="font-size:8px;"></i>主动来信</span>' : ''}
                    ${orig ? '<span class="ev-tag">' + orig + '</span>' : ''}
                    <span class="ev-tag">${(letter.content || '').length} 字</span>
                </div>
            </div>
            <button class="ev-del" onclick="deleteEnvLetter(event,'inbox','${letter.id}')"><i class="fas fa-xmark"></i></button>
        </div>`;
    }).join('');
}

function renderEnvStats() {
    var box = document.getElementById('env-stats-box');
    if (!box) return;
    var out = envelopeData.outbox || [];
    var inbox = envelopeData.inbox || [];
    var sent = out.length;
    var replied = out.filter(function (l) { return l.status === 'replied'; }).length;
    var pending = out.filter(function (l) { return l.status === 'sent' || l.status === 'pending'; }).length;
    var received = inbox.length;
    var fromPartner = inbox.filter(function (l) { return l.fromPartner; }).length;
    var replyRate = sent > 0 ? Math.round(replied / sent * 100) : 0;
    var totalChars = out.reduce(function (s, l) { return s + (l.content || '').length; }, 0);
    var avgChars = sent > 0 ? Math.round(totalChars / sent) : 0;
    var pName = envPartnerName();

    var cell = function (n, l) {
        return '<div class="ev-stat-cell"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>';
    };
    var row = function (label, sub, val) {
        return '<div class="ev-stat-row"><div class="k">' + label +
            (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div><div class="v">' + val + '</div></div>';
    };

    box.innerHTML =
        '<div class="ev-stat-hero">' +
            '<div class="ev-stat-hero-num">' + (sent + received) + '</div>' +
            '<div class="ev-stat-hero-label">封信 · 来往之间</div>' +
        '</div>' +
        '<div class="ev-stat-grid">' +
            cell(sent, '寄出的信') +
            cell(received, '收到的信') +
            cell(pending, '还在路上') +
            cell(replyRate + '%', '回信率') +
        '</div>' +
        '<div class="ev-stat-list">' +
            row('写给你的回信', '你寄出后收到的回复', received - fromPartner) +
            row('主动来信', escEnv(pName) + ' 想起来就写给你的', fromPartner) +
            row('累计字数', '所有寄出信件的总和', totalChars) +
            row('平均每封', '一封大概写多长', avgChars + ' 字') +
        '</div>' +
        '<div class="ev-stat-tip"><i class="fas fa-feather-pointed"></i>多写几封信，回信率会慢慢变高</div>';
}

window.viewEnvLetter = function(section, id) {
    const letters = section === 'outbox' ? envelopeData.outbox : envelopeData.inbox;
    const letter = letters.find(l => l.id === id);
    if (!letter) return;
    if (section === 'inbox' && letter.isNew) {
        letter.isNew = false;
        saveEnvelopeData();
        renderEnvelopeLists();
    }
    editingEnvId = id;
    editingEnvSection = section;

    // 标题和戳文字根据状态决定
    const isInbox = section === 'inbox';
    let titleText, stampLabel, stampSub;
    if (isInbox) {
        const pName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
        titleText = letter.fromPartner ? pName + '的来信' : '收到的回信';
        stampLabel = '已收到'; stampSub = 'RECEIVED';
    } else {
        if (letter.status === 'replied') { titleText = '已收到回信'; stampLabel = '已回信'; stampSub = 'REPLIED'; }
        else if (letter.status === 'received') { titleText = '已送达'; stampLabel = '已送达'; stampSub = 'DELIVERED'; }
        else { titleText = '已寄出'; stampLabel = '已寄出'; stampSub = 'SENT'; }
    }
    document.getElementById('env-view-title').textContent = titleText;
    const stampLabelEl = document.getElementById('env-view-stamp-label');
    const stampSubEl = document.getElementById('env-view-stamp-sub');
    if (stampLabelEl) stampLabelEl.textContent = stampLabel;
    if (stampSubEl) stampSubEl.textContent = stampSub;

    const dateObj = new Date(letter.receivedTime || letter.sentTime || letter.timestamp || Date.now());
    const y = dateObj.getFullYear();
    const mo = String(dateObj.getMonth()+1).padStart(2,'0');
    const d = String(dateObj.getDate()).padStart(2,'0');
    const dateStr = `${y}/${mo}/${d}`;
    const weekdays = ['日','一','二','三','四','五','六'];
    const fullDateStr = dateStr + ' 星期' + weekdays[dateObj.getDay()];

    const stampEl = document.getElementById('env-view-stamp-date');
    if (stampEl) stampEl.textContent = `${mo}/${d}`;

    const dateLine = document.getElementById('env-view-date-line');
    if (dateLine) dateLine.textContent = fullDateStr;

    const toLine = document.getElementById('env-view-to-line');
    const greetingLine = document.getElementById('env-view-greeting-line');
    if (section === 'outbox') {
        const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '亲爱的';
        if (toLine) toLine.textContent = `致 ${partnerName}：`;
        if (greetingLine) greetingLine.textContent = '见字如面，望君安好。';
    } else {
        const myName = (typeof settings !== 'undefined' && settings.myName) || '你';
        if (toLine) toLine.textContent = `致 ${myName}：`;
        if (greetingLine) greetingLine.textContent = '见字如面，一切皆好。';
    }

    const textEl = document.getElementById('env-view-text');
    if (textEl) textEl.textContent = letter.content;

    const signDateEl = document.getElementById('env-view-sign-date');
    const signNameEl = document.getElementById('env-view-sign-name');
    if (signDateEl) signDateEl.textContent = fullDateStr;
    if (section === 'outbox') {
        const myName = (typeof settings !== 'undefined' && settings.myName) || '你';
        if (signNameEl) signNameEl.textContent = myName;
    } else {
        const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
        if (signNameEl) signNameEl.textContent = partnerName;
    }

    document.getElementById('env-edit-input').value = letter.content;
    document.getElementById('env-view-content').style.display = 'block';
    document.getElementById('env-view-edit').style.display = 'none';

    // 回复按钮只在梦角主动写的信显示；编辑只在发件箱显示
    document.getElementById('env-view-reply-btn').style.display = (isInbox && letter.fromPartner) ? 'inline-flex' : 'none';
    document.getElementById('env-view-edit-btn').style.display = isInbox ? 'none' : 'inline-flex';
    document.getElementById('env-view-save-btn').style.display = 'none';
    const origCtx = document.getElementById('env-view-original-ctx');
    const origText = document.getElementById('env-view-original-text');
    const origExpand = document.getElementById('env-view-original-expand');
    if (origCtx && origText) {
        if (section === 'inbox' && letter.originalContent) {
            origText.textContent = letter.originalContent;
            origText.style.maxHeight = '80px';
            origCtx.style.display = 'block';
            if (origExpand) {
                origExpand.style.display = letter.originalContent.length > 120 ? 'block' : 'none';
                origExpand.textContent = '展开查看全文';
            }
        } else {
            origCtx.style.display = 'none';
        }
    }
    showModal(document.getElementById('envelope-view-modal'));
};

window.toggleEnvEdit = function() {
    const contentEl = document.getElementById('env-view-content');
    const editEl = document.getElementById('env-view-edit');
    const editBtn = document.getElementById('env-view-edit-btn');
    const saveBtn = document.getElementById('env-view-save-btn');
    const isEditing = editEl.style.display !== 'none';
    if (isEditing) {
        contentEl.style.display = 'block';
        editEl.style.display = 'none';
        editBtn.textContent = '编辑';
        saveBtn.style.display = 'none';
    } else {
        contentEl.style.display = 'none';
        editEl.style.display = 'block';
        editBtn.textContent = '取消';
        saveBtn.style.display = 'inline-flex';
    }
};

window.saveEnvEdit = function() {
    const newContent = document.getElementById('env-edit-input').value.trim();
    if (!newContent) { showNotification('内容不能为空', 'warning'); return; }
    const letters = editingEnvSection === 'outbox' ? envelopeData.outbox : envelopeData.inbox;
    const letter = letters.find(l => l.id === editingEnvId);
    if (letter) {
        letter.content = newContent;
        saveEnvelopeData();
        const textEl = document.getElementById('env-view-text');
        if (textEl) textEl.textContent = newContent;
        showNotification('已保存修改', 'success');
        toggleEnvEdit();
    }
};

window.closeEnvViewModal = function() {
    hideModal(document.getElementById('envelope-view-modal'));
};

window.replyToEnvLetter = function() {
    // 记住正在回复的原信，供撰写页顶部引用展示
    const letters = editingEnvSection === 'outbox' ? envelopeData.outbox : envelopeData.inbox;
    const letter = letters.find(l => l.id === editingEnvId);

    // 先把撰写页内容（含引用块）准备好，再打开信封主弹窗，
    // 避免弹窗淡入过程中内容中途切换造成的闪屏。
    document.getElementById('env-outbox-section').style.display = 'none';
    document.getElementById('env-inbox-section').style.display = 'none';
    document.getElementById('env-main-close-btn').style.display = 'none';
    document.getElementById('env-compose-title').textContent = '回复这封信';
    document.getElementById('envelope-input').value = '';
    document.getElementById('env-send-to-chat').checked = false;
    document.getElementById('env-compose-form').style.display = 'block';
    // 标记为回复模式，提示文案用"传递你的心意吧"，梦角10%概率回复
    document.getElementById('env-compose-form').dataset.replyMode = 'true';
    const hint = document.getElementById('env-reply-time-info');
    if (hint) hint.textContent = '传递你的心意吧';

    // 在撰写页顶部展示对方原信内容，方便对照着写回复
    const origCtx = document.getElementById('env-compose-original-ctx');
    const origText = document.getElementById('env-compose-original-text');
    const origExpand = document.getElementById('env-compose-original-expand');
    const origLabel = document.getElementById('env-compose-original-label');
    if (origCtx && origText && letter) {
        const pName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
        if (origLabel) origLabel.textContent = pName + '的来信';
        origText.textContent = letter.content;
        origText.style.maxHeight = '80px';
        origCtx.style.display = 'block';
        if (origExpand) {
            origExpand.style.display = letter.content.length > 120 ? 'block' : 'none';
            origExpand.textContent = '展开查看全文';
        }
    } else if (origCtx) {
        origCtx.style.display = 'none';
    }

    hideModal(document.getElementById('envelope-view-modal'));

    /* 信纸抬头 + 顶栏 + 页签状态 */
    var _dt = document.getElementById('ev-compose-date');
    if (_dt) _dt.textContent = envTodayStr();
    var _to = document.getElementById('ev-compose-to');
    if (_to) _to.textContent = '致 ' + envPartnerName() + '：';
    var _sg = document.getElementById('ev-compose-sign');
    if (_sg) _sg.textContent = envMyName();
    var _bt = document.getElementById('ev-bar-title');
    if (_bt) _bt.textContent = '写回信';
    var _bs = document.getElementById('ev-bar-sub');
    if (_bs) _bs.textContent = 'Reply';
    ['inbox', 'outbox', 'stats', 'compose'].forEach(function (t) {
        var b = document.getElementById('env-tab-' + t);
        if (b) b.classList.toggle('active', t === 'compose');
    });

    showModal(document.getElementById('envelope-modal'));
};

window.deleteEnvLetter = function(event, section, id) {
    event.stopPropagation();
    if (!confirm('确定要删除这封信吗？')) return;
    if (section === 'outbox') {
        envelopeData.outbox = envelopeData.outbox.filter(l => l.id !== id);
    } else {
        envelopeData.inbox = envelopeData.inbox.filter(l => l.id !== id);
    }
    saveEnvelopeData();
    renderEnvelopeLists();
    showNotification('已删除', 'success');
};

window.openNewEnvelopeForm = function() {
    switchEnvTab('compose');
};

window.cancelEnvelopeCompose = function() {
    document.getElementById('env-compose-form').style.display = 'none';
    const origCtx = document.getElementById('env-compose-original-ctx');
    if (origCtx) origCtx.style.display = 'none';
    document.getElementById('env-main-close-btn').style.display = 'flex';
    // 取消后回到「收到的信」tab
    switchEnvTab('inbox');
};

function handleSendEnvelope() {
    const text = document.getElementById('envelope-input').value.trim();
    if (!text) { showNotification('信件内容不能为空', 'warning'); return; }

    const sendToChat = document.getElementById('env-send-to-chat').checked;
    if (sendToChat) {
        addMessage({ id: Date.now(), sender: 'user', text: `【寄出的信】\n${text}`, timestamp: new Date(), status: 'sent', type: 'normal' });
    }

    const isReplyMode = document.getElementById('env-compose-form').dataset.replyMode === 'true';
    const willReply = isReplyMode ? Math.random() < 0.10 : true;
    const minHours = 10, maxHours = 24;
    const randomHours = Math.random() * (maxHours - minHours) + minHours;
    const deliveredDelay = (30 + Math.random() * 30) * 60 * 1000; // 30–60 分钟
    const newId = 'env_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    envelopeData.outbox.push({
        id: newId, content: text,
        sentTime: Date.now(),
        deliveredTime: Date.now() + deliveredDelay,
        replyTime: willReply ? Date.now() + randomHours * 60 * 60 * 1000 : null,
        status: 'sent',
        willReply
    });
    saveEnvelopeData();

    // 就算 App 这段时间没打开，也能靠后端推送在回信到点时提醒一下
    // （前提是用户在设置里配置并开启了推送后端，没配置的话这里会自动跳过，不影响原有逻辑）
    if (willReply && window.pushNotify) {
        const pName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
        window.pushNotify.schedule(
            'envelope_reply_' + newId,
            Date.now() + randomHours * 60 * 60 * 1000,
            '来信提醒',
            pName + ' 给你回信了，点开看看吧',
            './index.html'
        );
    }

    cancelEnvelopeCompose();
    switchEnvTab('outbox');
    showNotification('信件已寄出 ✉️', 'success');
}
