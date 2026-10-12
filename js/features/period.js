/* ============================================================
   经期 Period —— 整页应用重做
   结构：顶栏 / 状态大卡 + 环形进度 / 关键指标 / 迷你日历 / 底部操作条
   子页：全屏记录编辑（pt-edit）、全屏设置（pt-set）
   数据：localStorage 键 periodData  {cycles:[{id,start,end,pain,symptoms,note}],cfg:{cycleLen,periodLen}}
   ============================================================ */
(function () {
    'use strict';

    var DK = 'periodData';
    var data = { cycles: [], cfg: { cycleLen: 28, periodLen: 5 } };
    var built = false;
    var calMonth = new Date();

    var SYMPTOMS = ['痛经', '腰酸', '头痛', '胸胀', '长痘', '嗜睡', '食欲涨', '情绪低', '水肿', '畏寒'];

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function notify(m, t) {
        try { if (typeof showNotification === 'function') { showNotification(m, t || 'info', 1800); return; } } catch (e) {}
        var n = document.getElementById('cc-toast');
        if (!n) { n = document.createElement('div'); n.id = 'cc-toast'; document.body.appendChild(n); }
        n.textContent = m; n.className = 'cc-toast'; void n.offsetWidth; n.className = 'cc-toast show';
        clearTimeout(n._timer); n._timer = setTimeout(function () { n.className = 'cc-toast'; }, 1500);
    }
    function skey(k) {
        try { return (typeof getStorageKey === 'function') ? getStorageKey(k) : (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX + k : k); }
        catch (e) { return k; }
    }
    function pad(n) { return String(n).padStart(2, '0'); }
    function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
    function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
    function fmtD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

    /* ---------------- 存储 ---------------- */
    function load() {
        try {
            var raw = localStorage.getItem(skey(DK));
            if (!raw) { seed(); return; }
            var o = JSON.parse(raw);
            if (o && typeof o === 'object') {
                data.cycles = Array.isArray(o.cycles) ? o.cycles : [];
                if (o.cfg) {
                    data.cfg.cycleLen = +o.cfg.cycleLen || 28;
                    data.cfg.periodLen = +o.cfg.periodLen || 5;
                }
            }
        } catch (e) {}
    }
    function save() { try { localStorage.setItem(skey(DK), JSON.stringify(data)); } catch (e) {} }

    // 种子：6 个历史周期，让平均周期/经期长度有真实依据
    function seed() {
        var today = startOfDay(new Date());
        var lens = [5, 6, 5, 5, 7, 4];
        var gaps = [29, 28, 30, 27, 29];
        var cycles = [];
        var acc = startOfDay(addDays(today, -3));
        var pains = [2, 3, 1, 3, 2, 1];
        for (var i = 5; i >= 0; i--) {
            var L = lens[i];
            cycles.push({
                id: 'p2_' + i, start: acc.getTime(),
                end: addDays(acc, L - 1).getTime(),
                pain: pains[i],
                symptoms: i % 3 === 0 ? ['痛经', '嗜睡'] : (i % 3 === 1 ? ['腰酸'] : []),
                note: i === 5 ? '这次提前了两天' : ''
            });
            acc = startOfDay(addDays(acc, -(gaps[i] || 28)));
        }
        data.cycles = cycles;
        save();
    }

    /* ---------------- 计算 ---------------- */
    function sorted() { return data.cycles.slice().sort(function (a, b) { return a.start - b.start; }); }

    function avgCycle() {
        var s = sorted(), gaps = [];
        for (var i = 1; i < s.length; i++) {
            var g = daysBetween(new Date(s[i - 1].start), new Date(s[i].start));
            if (g > 15 && g < 90) gaps.push(g);
        }
        if (!gaps.length) return data.cfg.cycleLen;
        return Math.round(gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length);
    }
    function avgLen() {
        var s = sorted(), lens = [];
        s.forEach(function (c) {
            if (c.end) { var l = daysBetween(new Date(c.start), new Date(c.end)) + 1; if (l > 0 && l < 15) lens.push(l); }
        });
        if (!lens.length) return data.cfg.periodLen;
        return Math.round(lens.reduce(function (a, b) { return a + b; }, 0) / lens.length);
    }
    function lastCycle() { var s = sorted(); return s.length ? s[s.length - 1] : null; }

    function predict() {
        var lc = lastCycle();
        if (!lc) return null;
        var cyc = avgCycle(), len = avgLen();
        var nextStart = addDays(new Date(lc.start), cyc);
        var ovu = addDays(nextStart, -14);
        return {
            cycle: cyc, len: len,
            nextStart: nextStart,
            ovu: ovu,
            fertileStart: addDays(ovu, -5),
            fertileEnd: addDays(ovu, 1),
            daysTo: daysBetween(new Date(), nextStart)
        };
    }
    function statusNow() {
        var lc = lastCycle();
        if (!lc) return { state: 'none' };
        var today = startOfDay(new Date());
        var fromStart = daysBetween(new Date(lc.start), today);
        var open = !lc.end || daysBetween(new Date(lc.end), today) < 0;
        if (open && fromStart >= 0 && fromStart < 15) return { state: 'in', day: fromStart + 1 };
        return { state: 'wait', cycleDay: fromStart + 1 };
    }

    /* ---------------- 操作 ---------------- */
    function openCycle() {
        var today = startOfDay(new Date());
        var s = sorted();
        var open = s.filter(function (c) { return !c.end; })[0];
        if (open) { notify('已经在记录中了'); return; }
        data.cycles.push({ id: 'p_' + Date.now(), start: today.getTime(), end: null, pain: 0, symptoms: [], note: '' });
        save(); renderAll();
        notify('已记录今天开始', 'success');
    }
    function closeCycle() {
        var s = sorted();
        var open = s.filter(function (c) { return !c.end; })[0];
        if (!open) { notify('没有进行中的记录'); return; }
        open.end = startOfDay(new Date()).getTime();
        save(); renderAll();
        notify('已记录今天结束', 'success');
    }
    function removeCycle(id) {
        if (!confirm('删除这条记录？')) return;
        data.cycles = data.cycles.filter(function (c) { return c.id !== id; });
        save(); renderAll();
    }

    /* ---------------- DOM ---------------- */
    function el(id) { return document.getElementById(id); }

    function build() {
        if (built) return;
        built = true;

        var root = document.createElement('div');
        root.id = 'pt-root';
        root.className = 'pt-root';
        root.innerHTML =
            '<div class="pt-page" id="pt-page">' +
                '<header class="pt-bar">' +
                    '<button class="pt-bar-btn" id="pt-back"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="pt-bar-mid"><div class="pt-bar-title">经期记录</div>' +
                    '<div class="pt-bar-sub" id="pt-sub">—</div></div>' +
                    '<button class="pt-bar-btn" id="pt-set"><i class="fas fa-sliders"></i></button>' +
                '</header>' +

                '<div class="pt-scroll" id="pt-scroll">' +
                    '<div class="pt-hero" id="pt-hero"></div>' +
                    '<div class="pt-metrics" id="pt-metrics"></div>' +
                    '<div class="pt-sec-hd">日历</div>' +
                    '<div class="pt-cal-wrap">' +
                        '<div class="pt-cal-hd">' +
                            '<button class="pt-cal-nav" id="pt-prev"><i class="fas fa-chevron-left"></i></button>' +
                            '<span id="pt-cal-title"></span>' +
                            '<button class="pt-cal-nav" id="pt-next"><i class="fas fa-chevron-right"></i></button>' +
                        '</div>' +
                        '<div id="pt-cal"></div>' +
                        '<div class="pt-legend">' +
                            lg('p', '经期') + lg('pred', '预测') + lg('ovu', '排卵') + lg('fer', '易孕') +
                        '</div>' +
                    '</div>' +
                    '<div class="pt-sec-hd">历史记录 <span id="pt-ct"></span></div>' +
                    '<div id="pt-list"></div>' +
                    '<div style="height:8px"></div>' +
                '</div>' +

                '<div class="pt-foot">' +
                    '<button class="pt-foot-btn" id="pt-open"><i class="fas fa-droplet"></i><span>今天来了</span></button>' +
                    '<button class="pt-foot-main" id="pt-edit"><i class="fas fa-pen"></i> 补记 / 编辑</button>' +
                    '<button class="pt-foot-btn" id="pt-close"><i class="fas fa-check"></i><span>今天走了</span></button>' +
                '</div>' +
            '</div>' +

            /* 记录编辑子页 */
            '<div class="pt-sub" id="pt-editpage">' +
                '<header class="pt-bar">' +
                    '<button class="pt-bar-btn" id="pt-e-cancel"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="pt-bar-mid"><div class="pt-bar-title" id="pt-e-title">补记</div>' +
                    '<div class="pt-bar-sub">选择这次经期的起止日期</div></div>' +
                    '<button class="pt-bar-btn pt-bar-ok" id="pt-e-save">保存</button>' +
                '</header>' +
                '<div class="pt-scroll">' +
                    '<div class="pt-form">' +
                        '<div class="pt-frow">' +
                            '<label>开始日期</label>' +
                            '<input type="date" id="pt-e-start">' +
                        '</div>' +
                        '<div class="pt-frow">' +
                            '<label>结束日期<span class="pt-fhint">（还没结束可留空）</span></label>' +
                            '<input type="date" id="pt-e-end">' +
                        '</div>' +
                        '<div class="pt-frow">' +
                            '<label>疼痛程度 <span class="pt-pain-v" id="pt-pain-v">0</span></label>' +
                            '<div class="pt-pain" id="pt-pain"></div>' +
                        '</div>' +
                        '<div class="pt-frow pt-fcol">' +
                            '<label>症状</label>' +
                            '<div class="pt-sym" id="pt-sym"></div>' +
                        '</div>' +
                        '<div class="pt-frow pt-fcol">' +
                            '<label>备注</label>' +
                            '<textarea id="pt-e-note" placeholder="这次身体感觉如何？" maxlength="300"></textarea>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            /* 设置子页 */
            '<div class="pt-sub" id="pt-setpage">' +
                '<header class="pt-bar">' +
                    '<button class="pt-bar-btn" id="pt-s-back"><i class="fas fa-chevron-left"></i></button>' +
                    '<div class="pt-bar-mid"><div class="pt-bar-title">参数设置</div>' +
                    '<div class="pt-bar-sub">记录不足时用默认值预测</div></div>' +
                    '<span style="width:34px"></span>' +
                '</header>' +
                '<div class="pt-scroll">' +
                    '<div class="pt-form">' +
                        '<div class="pt-frow">' +
                            '<label>默认周期长度</label>' +
                            '<div class="pt-num"><button id="pt-c-minus">−</button>' +
                            '<span id="pt-c-val">28</span><span class="pt-unit">天</span>' +
                            '<button id="pt-c-plus">+</button></div>' +
                        '</div>' +
                        '<div class="pt-frow">' +
                            '<label>默认经期长度</label>' +
                            '<div class="pt-num"><button id="pt-l-minus">−</button>' +
                            '<span id="pt-l-val">5</span><span class="pt-unit">天</span>' +
                            '<button id="pt-l-plus">+</button></div>' +
                        '</div>' +
                        '<div class="pt-note">' +
                            '当前平均值：周期 <b id="pt-avgc">—</b> 天 · 经期 <b id="pt-avgl">—</b> 天。' +
                            '有足够记录时会优先使用平均值。' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="pt-subfoot"><button class="pt-sub-save" id="pt-s-save">保存设置</button></div>' +
            '</div>';

        document.body.appendChild(root);

        // 疼痛
        var pw = el('pt-pain');
        for (var i = 0; i <= 4; i++) {
            (function (n) {
                var b = document.createElement('button');
                b.className = 'pt-pain-b'; b.type = 'button'; b.textContent = n;
                b.addEventListener('click', function () { editPain = n; syncPain(); });
                pw.appendChild(b);
            })(i);
        }
        // 症状
        var sw = el('pt-sym');
        SYMPTOMS.forEach(function (s) {
            var b = document.createElement('button');
            b.className = 'pt-sym-b'; b.type = 'button'; b.textContent = s;
            b.setAttribute('data-s', s);
            b.addEventListener('click', function () {
                var v = s, i = editSym.indexOf(v);
                if (i >= 0) editSym.splice(i, 1); else editSym.push(v);
                syncSym();
            });
            sw.appendChild(b);
        });

        bind();
    }
    function lg(cls, t) {
        return '<span><i class="pt-lg ' + cls + '"></i>' + t + '</span>';
    }

    var editPain = 0, editSym = [], editId = null;

    function bind() {
        el('pt-back').addEventListener('click', close);
        el('pt-set').addEventListener('click', function () {
            el('pt-c-val').textContent = data.cfg.cycleLen;
            el('pt-l-val').textContent = data.cfg.periodLen;
            el('pt-avgc').textContent = data.cycles.length > 1 ? avgCycle() : '—';
            el('pt-avgl').textContent = data.cycles.filter(function (c) { return c.end; }).length ? avgLen() : '—';
            el('pt-setpage').classList.add('on');
            el('pt-page').classList.add('pt-behind');
        });
        el('pt-s-back').addEventListener('click', function () {
            el('pt-setpage').classList.remove('on'); el('pt-page').classList.remove('pt-behind');
        });
        el('pt-s-save').addEventListener('click', function () {
            save(); el('pt-setpage').classList.remove('on'); el('pt-page').classList.remove('pt-behind');
            renderAll(); notify('设置已保存');
        });
        el('pt-c-minus').addEventListener('click', function () {
            data.cfg.cycleLen = Math.max(18, data.cfg.cycleLen - 1);
            el('pt-c-val').textContent = data.cfg.cycleLen;
        });
        el('pt-c-plus').addEventListener('click', function () {
            data.cfg.cycleLen = Math.min(45, data.cfg.cycleLen + 1);
            el('pt-c-val').textContent = data.cfg.cycleLen;
        });
        el('pt-l-minus').addEventListener('click', function () {
            data.cfg.periodLen = Math.max(2, data.cfg.periodLen - 1);
            el('pt-l-val').textContent = data.cfg.periodLen;
        });
        el('pt-l-plus').addEventListener('click', function () {
            data.cfg.periodLen = Math.min(10, data.cfg.periodLen + 1);
            el('pt-l-val').textContent = data.cfg.periodLen;
        });

        el('pt-open').addEventListener('click', openCycle);
        el('pt-close').addEventListener('click', closeCycle);
        el('pt-edit').addEventListener('click', function () { openEdit(null); });

        el('pt-e-cancel').addEventListener('click', closeEdit);
        el('pt-e-save').addEventListener('click', saveEdit);

        el('pt-prev').addEventListener('click', function () {
            calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal();
        });
        el('pt-next').addEventListener('click', function () {
            calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal();
        });
    }

    function syncPain() {
        Array.prototype.forEach.call(el('pt-pain').children, function (b, i) {
            b.classList.toggle('on', i === editPain);
        });
        el('pt-pain-v').textContent = editPain;
    }
    function syncSym() {
        Array.prototype.forEach.call(el('pt-sym').children, function (b) {
            b.classList.toggle('on', editSym.indexOf(b.getAttribute('data-s')) >= 0);
        });
    }

    /* ---------------- 渲染 ---------------- */
    function renderAll() { renderHero(); renderMetrics(); renderCal(); renderList(); renderSub(); }

    function renderSub() {
        var s = el('pt-sub');
        if (!s) return;
        var st = statusNow();
        if (st.state === 'in') s.textContent = '经期第 ' + st.day + ' 天';
        else { var p = predict(); s.textContent = p ? ('周期第 ' + st.cycleDay + ' 天') : '还没有记录'; }
    }

    function renderHero() {
        var box = el('pt-hero'); if (!box) return;
        var p = predict(), st = statusNow();
        var cyc = p ? p.cycle : data.cfg.cycleLen;
        var cycleDay = st.state === 'in' ? st.day : (st.cycleDay || 1);
        var pct = Math.max(0, Math.min(1, cycleDay / cyc));
        var R = 52, C = 2 * Math.PI * R;

        var main, sub, color;
        if (st.state === 'in') {
            main = '第 ' + st.day + ' 天';
            sub = '经期中 · 注意保暖休息';
            color = 'var(--accent-color, #ff6b9d)';
        } else if (p) {
            if (p.daysTo > 0) { main = p.daysTo; sub = '天后预计来潮'; color = 'var(--accent-color, #ff6b9d)'; }
            else if (p.daysTo === 0) { main = '今天'; sub = '预计今天来潮'; color = 'var(--accent-color, #ff6b9d)'; }
            else { main = '晚 ' + Math.abs(p.daysTo); sub = '天 · 可能推迟了'; color = '#e0483c'; }
        } else {
            main = '—'; sub = '记录第一次经期开始'; color = '#bbb';
        }

        box.innerHTML =
            '<div class="pt-ring">' +
                '<svg viewBox="0 0 130 130">' +
                    '<circle cx="65" cy="65" r="' + R + '" fill="none" stroke="var(--secondary-bg,#f0f0f2)" stroke-width="10"/>' +
                    '<circle cx="65" cy="65" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="10" ' +
                    'stroke-linecap="round" stroke-dasharray="' + C + '" ' +
                    'stroke-dashoffset="' + (C * (1 - (st.state === 'in' ? Math.min(1, cycleDay / (p ? p.len : data.cfg.periodLen)) : pct)) ) + '" ' +
                    'transform="rotate(-90 65 65)"/>' +
                '</svg>' +
                '<div class="pt-ring-c"><div class="pt-ring-a">' + esc(main) + '</div><div class="pt-ring-b">' + esc(sub) + '</div></div>' +
            '</div>' +
            (p ?
                '<div class="pt-hero-line">预计下次 <b>' + fmtD(p.nextStart) + '</b> · 排卵日 <b>' + fmtD(p.ovu) + '</b></div>' +
                '<div class="pt-hero-line">易孕期 ' + fmtD(p.fertileStart) + ' - ' + fmtD(p.fertileEnd) + '</div>'
                : '<div class="pt-hero-line">记录 2 次以上就能自动预测</div>');
    }

    function renderMetrics() {
        var box = el('pt-metrics'); if (!box) return;
        var p = predict();
        var m = [
            ['平均周期', (p ? p.cycle : data.cfg.cycleLen) + ' 天'],
            ['平均经期', (p ? p.len : data.cfg.periodLen) + ' 天'],
            ['总记录', data.cycles.length + ' 次'],
            ['最长周期', maxGap() + ' 天']
        ];
        box.innerHTML = m.map(function (x) {
            return '<div class="pt-metric"><div class="pt-metric-a">' + esc(x[1]) + '</div><div class="pt-metric-b">' + esc(x[0]) + '</div></div>';
        }).join('');
    }
    function maxGap() {
        var s = sorted(), g = [];
        for (var i = 1; i < s.length; i++) {
            var d = daysBetween(new Date(s[i - 1].start), new Date(s[i].start));
            if (d > 15 && d < 90) g.push(d);
        }
        return g.length ? Math.max.apply(null, g) : 0;
    }

    function renderCal() {
        var p = predict();
        var y = calMonth.getFullYear(), m = calMonth.getMonth();
        el('pt-cal-title').textContent = y + '年' + (m + 1) + '月';
        var first = new Date(y, m, 1);
        var lead = first.getDay();
        var days = new Date(y, m + 1, 0).getDate();
        var today = startOfDay(new Date()).getTime();

        var marks = {};
        data.cycles.forEach(function (c) {
            var s0 = startOfDay(new Date(c.start)).getTime();
            var e0 = c.end ? startOfDay(new Date(c.end)).getTime() : addDays(new Date(c.start), avgLen() - 1).getTime();
            for (var t = s0; t <= e0; t += 86400000) marks[dayKey(new Date(t))] = 'p';
        });
        if (p) {
            var pn = startOfDay(p.nextStart).getTime();
            for (var i = 0; i < p.len; i++) {
                var k = dayKey(addDays(new Date(pn), i));
                if (!marks[k]) marks[k] = 'pred';
            }
            if (!marks[dayKey(p.ovu)]) marks[dayKey(p.ovu)] = 'ovu';
            for (var j = -5; j <= 1; j++) {
                var k2 = dayKey(addDays(p.ovu, j));
                if (!marks[k2]) marks[k2] = 'fer';
            }
        }

        var h = '<div class="pt-wk">';
        ['日', '一', '二', '三', '四', '五', '六'].forEach(function (w) { h += '<span>' + w + '</span>'; });
        h += '</div><div class="pt-days">';
        for (var b = 0; b < lead; b++) h += '<span class="pt-d empty"></span>';
        for (var d = 1; d <= days; d++) {
            var dt = new Date(y, m, d);
            var cls = marks[dayKey(dt)] ? (' ' + marks[dayKey(dt)]) : '';
            if (dt.getTime() === today) cls += ' today';
            h += '<span class="pt-d' + cls + '">' + d + '</span>';
        }
        h += '</div>';
        el('pt-cal').innerHTML = h;
    }

    function renderList() {
        var box = el('pt-list'); if (!box) return;
        var s = sorted().reverse();
        el('pt-ct').textContent = s.length ? '(' + s.length + ')' : '';
        if (!s.length) {
            box.innerHTML = '<div class="pt-empty">还没有记录，点下面「今天来了」</div>';
            return;
        }
        box.innerHTML = s.map(function (c) {
            var len = c.end ? (daysBetween(new Date(c.start), new Date(c.end)) + 1)
                             : (daysBetween(new Date(c.start), new Date()) + 1);
            var syms = (c.symptoms || []).map(function (x) { return '<span class="pt-chip">' + esc(x) + '</span>'; }).join('');
            return '<div class="pt-item" data-open="' + c.id + '">' +
                '<div class="pt-item-l">' +
                    '<div class="pt-item-day">' + new Date(c.start).getDate() + '</div>' +
                    '<div class="pt-item-mon">' + (new Date(c.start).getMonth() + 1) + '月</div>' +
                '</div>' +
                '<div class="pt-item-r">' +
                    '<div class="pt-item-t">' +
                        '<b>' + fmtD(new Date(c.start)) + (c.end ? ' - ' + fmtD(new Date(c.end)) : ' 起') + '</b>' +
                        '<span class="pt-item-len">' + (c.end ? len + ' 天' : '进行中 ' + len + ' 天') + '</span>' +
                    '</div>' +
                    (c.pain ? '<div class="pt-item-pain">疼痛 ' + '●'.repeat(c.pain) + '<span class="pt-item-painz">' + '○'.repeat(4 - c.pain) + '</span></div>' : '') +
                    (syms ? '<div class="pt-item-sym">' + syms + '</div>' : '') +
                    (c.note ? '<div class="pt-item-note">' + esc(c.note) + '</div>' : '') +
                '</div>' +
                '<button class="pt-item-x" data-del="' + esc(c.id) + '"><i class="fas fa-trash"></i></button>' +
            '</div>';
        }).join('');

        Array.prototype.forEach.call(box.querySelectorAll('[data-open]'), function (n) {
            n.addEventListener('click', function (e) {
                if (e.target.closest('[data-del]')) return;
                openEdit(n.getAttribute('data-open'));
            });
        });
        Array.prototype.forEach.call(box.querySelectorAll('[data-del]'), function (b) {
            b.addEventListener('click', function (e) {
                e.stopPropagation();
                removeCycle(b.getAttribute('data-del'));
            });
        });
    }

    /* ---------------- 编辑子页 ---------------- */
    function openEdit(id) {
        var c = id ? data.cycles.filter(function (x) { return x.id === id; })[0] : null;
        editId = id || null;
        editPain = c ? (c.pain || 0) : 0;
        editSym = c && c.symptoms ? c.symptoms.slice() : [];
        el('pt-e-title').textContent = c ? '编辑这次记录' : '补记一次';
        el('pt-e-start').value = toDateInput(c ? c.start : Date.now());
        el('pt-e-end').value = c && c.end ? toDateInput(c.end) : '';
        el('pt-e-note').value = (c && c.note) || '';
        syncPain(); syncSym();
        el('pt-editpage').classList.add('on');
        el('pt-page').classList.add('pt-behind');
    }
    function closeEdit() {
        el('pt-editpage').classList.remove('on');
        el('pt-page').classList.remove('pt-behind');
    }
    function toDateInput(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function fromDateInput(v) {
        if (!v) return null;
        var a = v.split('-');
        return new Date(+a[0], +a[1] - 1, +a[2]).getTime();
    }
    function saveEdit() {
        var s = fromDateInput(el('pt-e-start').value);
        var e = fromDateInput(el('pt-e-end').value);
        if (!s) { notify('请选择开始日期'); return; }
        if (e && e < s) { notify('结束日期不能早于开始日期'); return; }
        var note = el('pt-e-note').value.trim();
        var sym = editSym.slice();

        if (editId) {
            var c = data.cycles.filter(function (x) { return x.id === editId; })[0];
            if (c) { c.start = s; c.end = e; c.pain = editPain; c.symptoms = sym; c.note = note; }
        } else {
            data.cycles.push({ id: 'p_' + Date.now(), start: s, end: e, pain: editPain, symptoms: sym, note: note });
        }
        save(); closeEdit(); renderAll();
        notify('已保存');
    }

    /* ---------------- 开关 ---------------- */
    function open() {
        build(); load(); renderAll();
        calMonth = new Date();
        el('pt-root').classList.add('on');
    }
    function close() {
        var r = el('pt-root'); if (!r) return;
        r.classList.remove('on');
        el('pt-editpage').classList.remove('on');
        el('pt-setpage').classList.remove('on');
        el('pt-page').classList.remove('pt-behind');
    }

    window.Period = { open: open, close: close };
    if (window.whenSessionReady) window.whenSessionReady(load); else load();
})();
