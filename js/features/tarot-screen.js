/* ============================================================
   塔罗 / 雷诺曼（全屏界面）
   复用 #fortune-lenormand-modal 里已有的面板节点，搬进全屏壳，
   内部逻辑（抽牌、切换标签）完全不动。

   ⚠️ 关闭陷阱（已修）：
   - generateFortune()/switchFLTab() 内部会 showModal(#fortune-lenormand-modal)，
     该弹窗带 backdrop-filter: blur(8px) 且 z-index(9380) 只比全屏壳(9400)低一级。
     所以「开着全屏壳时它只是被盖在底下」，一旦点退出键关掉全屏壳，这个带模糊
     背景的旧弹窗就露在最上层 → 整页糊掉、body overflow 卡死、无法互动。
   - showModal 用 el.style.display='flex' 普通赋值，会**清掉**我们 setProperty 的
     !important 标志，所以光靠 JS 内联隐藏会被它覆盖。
   - 正解：用「body 加 tarot-fs-open 类 + 样式表 !important 规则」强制收起旧弹窗
     （样式表 !important 压得过 showModal 的普通内联 display:flex）；关闭时再
     把内容搬回旧弹窗并内联隐藏，确保下次直接 showModal 的路径也正常。
   ============================================================ */
(function () {
    'use strict';

    var MODAL_ID = 'fortune-lenormand-modal';
    var page = null;
    var node = null, home = null;

    function getModal() { return document.getElementById(MODAL_ID); }

    function hideSourceModal() {
        var m = getModal();
        if (!m) return;
        m.style.setProperty('display', 'none', 'important');
        m.classList.remove('show');
    }

    function build() {
        page = window.FSPage.create({
            id: 'tarot',
            title: '塔罗 · 雷诺曼',
            icon: 'fas fa-star-and-crescent',
            onRender: function (pane) {
                var modal = getModal();
                if (!modal) return;
                // 已经认领过且内容还在 pane 里：不重复搬（首开后的重开走这里）
                if (pane.getAttribute('data-hosted') && node && pane.contains(node)) return;

                pane.innerHTML = '<div class="fl-host"></div>';
                pane.setAttribute('data-hosted', '1');
                node = modal.querySelector('.modal-content');
                home = modal;
                if (!node) return;
                pane.firstChild.appendChild(node);
                hideSourceModal();
            },
            onOpen: function () {
                // 让样式表 !important 规则生效，强制收起带模糊背景的旧弹窗
                document.body.classList.add('tarot-fs-open');
                hideSourceModal();
            },
            onClose: function () {
                document.body.classList.remove('tarot-fs-open');
                // 把内容还给旧弹窗（其它入口可能直接 showModal 打开它），并彻底隐藏，
                // 避免带模糊背景的旧弹窗在关闭后浮到最上层糊住整页。
                if (node && home && !home.contains(node)) home.appendChild(node);
                hideSourceModal();
            }
        });
    }

    window.TarotScreen = {
        open: function (tab) {
            if (!page) build();
            document.body.classList.add('tarot-fs-open');
            try { if (typeof generateFortune === 'function') generateFortune(); } catch (e) {}
            page.open();
            try { if (typeof switchFLTab === 'function') switchFLTab(tab || 'fortune'); } catch (e) {}
            // 兜底：任何时机被 showModal 重新点亮的旧弹窗，一律收掉
            hideSourceModal();
        },
        close: function () { if (page) page.close(); }
    };
})();
