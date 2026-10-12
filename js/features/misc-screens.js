/* ============================================================
   主页面其余功能 → 全屏界面
   统计 / 纪念日 / 心情 / 决策 / 转盘 / 数据 / 语音 —— 全部直接
   showModal 打开原 modal，由 CSS 把它们做成整页（参照 data-modal
   已验证可行的模式）。
   注意：不能用 FSPage.adopt（把 .modal-content 物理搬走）——
   统计等内容要在打开瞬间由 JS 填充（renderStatsContent 等），
   搬走后渲染函数没有触发点，页面就是一片空白。
   ============================================================ */
(function () {
    'use strict';

    function openM(id, before) {
        var m = document.getElementById(id);
        if (!m) return;
        try { if (typeof before === 'function') before(); } catch (e) {}
        try { if (typeof showModal === 'function') showModal(m); else m.style.display = 'flex'; }
        catch (e) { m.style.display = 'flex'; }
    }
    function closeM(id) {
        var m = document.getElementById(id);
        if (!m) return;
        try { if (typeof hideModal === 'function') hideModal(m); else m.style.display = 'none'; }
        catch (e) { m.style.display = 'none'; }
    }
    function isOpenM(id) {
        var m = document.getElementById(id);
        return !!(m && (m.classList.contains('show') || m.style.display === 'flex' || m.style.display === 'block'));
    }
    function make(id, before) {
        return {
            open: function () { openM(id, before); },
            close: function () { closeM(id); },
            isOpen: function () { return isOpenM(id); }
        };
    }

    window.MiscScreens = {
        stats: make('stats-modal', function () {
            try { if (typeof renderStatsContent === 'function') renderStatsContent(); } catch (e) {}
            try { if (typeof switchStatsTab === 'function') switchStatsTab('stats'); } catch (e) {}
        }),
        anniversary: make('anniversary-modal', function () {
            try { if (typeof renderAnniversariesList === 'function') renderAnniversariesList(); } catch (e) {}
        }),
        mood: make('mood-modal'),
        decision: make('decision-menu-modal', function () {
            try { if (typeof window.__decideRefresh === 'function') window.__decideRefresh(); } catch (e) {}
        }),
        wheel: make('wheel-modal'),
        voice: make('voice-clone-modal'),
        data: make('data-modal'),
        album: {
            open: function () { try { if (window.Album && typeof window.Album.open === 'function') { window.Album.open(); return; } } catch (e) {} openM('album-modal'); },
            close: function () { closeM('album-modal'); },
            isOpen: function () { return isOpenM('album-modal'); }
        },
        envelope: make('envelope-modal', function () {
            try { if (typeof renderEnvelopeLists === 'function') renderEnvelopeLists(); } catch (e) {}
            try { if (typeof switchEnvTab === 'function') switchEnvTab('inbox'); } catch (e) {}
        })
    };
})();
