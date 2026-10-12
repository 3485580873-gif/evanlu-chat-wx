/* ============================================================
   日记 · 信封（合并成一个全屏界面，顶部两栏切换）
   复用 diary.js / envelope.js 已有的面板节点——整段搬进全屏界面里，
   不改动它们内部的逻辑与事件绑定。
   ============================================================ */
(function () {
    'use strict';

    var page = null;
    var diaryNode = null, envNode = null;
    var diaryHome = null, envHome = null;

    function takeDiary(host) {
        var mask = document.getElementById('diary-mask');
        if (!mask) return;
        if (!diaryNode) {
            diaryNode = mask.querySelector('.diary-panel');
            diaryHome = mask;
        }
        if (!diaryNode) return;
        host.appendChild(diaryNode);
        mask.style.setProperty('display', 'none', 'important');
        try { if (window.Diary && window.Diary.open) window.Diary.open(); } catch (e) {}
    }
    function giveDiaryBack() {
        if (diaryNode && diaryHome) diaryHome.appendChild(diaryNode);
        var mask = document.getElementById('diary-mask');
        if (mask) mask.classList.remove('show');
    }

    function takeEnvelope(host) {
        var modal = document.getElementById('envelope-modal');
        if (!modal) return;
        if (!envNode) {
            envNode = modal.querySelector('.modal-content');
            envHome = modal;
        }
        if (!envNode) return;
        host.appendChild(envNode);
        modal.style.setProperty('display', 'none', 'important');
        try { if (typeof renderEnvelopeLists === 'function') renderEnvelopeLists(); } catch (e) {}
        try { if (typeof switchEnvTab === 'function') switchEnvTab('outbox'); } catch (e) {}
    }
    function giveEnvelopeBack() {
        if (envNode && envHome) envHome.appendChild(envNode);
    }

    function build() {
        page = window.FSPage.create({
            id: 'journal',
            title: '日记 · 信封',
            icon: 'fas fa-book',
            tabs: [{ id: 'diary', name: '日记' }, { id: 'envelope', name: '信封' }],
            onRender: function (pane, tabId) {
                if (!pane.getAttribute('data-hosted')) {
                    pane.innerHTML = '<div class="js-host"></div>';
                    pane.setAttribute('data-hosted', '1');
                    if (tabId === 'diary') takeDiary(pane.firstChild);
                    else takeEnvelope(pane.firstChild);
                }
            },
            onClose: function () { giveDiaryBack(); giveEnvelopeBack(); }
        });
    }

    window.JournalScreen = {
        open: function (tabId) {
            if (!page) build();
            page.open(tabId || 'diary');
        },
        close: function () { if (page) page.close(); }
    };
})();
