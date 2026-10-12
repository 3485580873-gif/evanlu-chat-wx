/* ============================================================
   全屏界面壳（FSPage）
   参考 mochi：主页面点任何功能，打开的是一个「新的界面」而不是弹窗。
   从底部推上来铺满整屏，顶部有返回 + 标题，可选顶部两栏切换。

   用法：
     var page = FSPage.create({
         id: 'appearance',
         title: '外观设置',
         icon: 'fas fa-palette',
         tabs: [{id:'theme', name:'主题配色'}, {id:'fontbg', name:'背景字体'}],
         onRender: function (pane, tabId) { pane.innerHTML = '...'; },
         onOpen:  function (tabId) {},
         onClose: function () {}
     });
     page.open('theme');  page.close();
   ============================================================ */
(function () {
    'use strict';

    var pages = {};

    function create(opts) {
        var id = 'fs-' + opts.id;
        var root = document.getElementById(id);
        if (root && pages[opts.id]) return pages[opts.id];

        root = document.createElement('div');
        root.className = 'fs-page';
        root.id = id;

        var tabs = opts.tabs || [];
        var head =
            '<div class="fs-head">' +
                '<button class="fs-back" type="button" aria-label="返回"><i class="fas fa-chevron-left"></i></button>' +
                '<div class="fs-title">' +
                    (opts.icon ? '<i class="' + opts.icon + '"></i> ' : '') +
                    '<span>' + (opts.title || '') + '</span>' +
                '</div>' +
                '<div class="fs-act" id="' + id + '-act"></div>' +
            '</div>';
        var tabsHtml = '';
        if (tabs.length) {
            tabsHtml = '<div class="fs-tabs">' + tabs.map(function (t, i) {
                return '<button class="fs-tab' + (i === 0 ? ' on' : '') + '" data-tab="' + t.id + '">' + (t.name || t.id) + '</button>';
            }).join('') + '</div>';
        }
        var bodyHtml = tabs.length
            ? tabs.map(function (t, i) {
                return '<div class="fs-pane' + (i === 0 ? ' on' : '') + '" data-pane="' + t.id + '"></div>';
            }).join('')
            : '<div class="fs-pane on" data-pane="__main"></div>';

        root.innerHTML = head + tabsHtml + '<div class="fs-body">' + bodyHtml + '</div>';
        document.body.appendChild(root);

        var curTab = tabs.length ? tabs[0].id : '__main';
        var opened = false;

        function paneOf(tabId) { return root.querySelector('.fs-pane[data-pane="' + tabId + '"]'); }
        function renderTab(tabId) {
            var pane = paneOf(tabId);
            if (!pane) return;
            try { if (typeof opts.onRender === 'function') opts.onRender(pane, tabId); } catch (e) { console.error('[FSPage] render', e); }
        }
        function switchTab(tabId) {
            curTab = tabId;
            root.querySelectorAll('.fs-tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tabId); });
            root.querySelectorAll('.fs-pane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === tabId); });
            renderTab(tabId);
            try { if (typeof opts.onTab === 'function') opts.onTab(tabId); } catch (e) {}
        }

        root.querySelectorAll('.fs-tab').forEach(function (b) {
            b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
        });
        root.querySelector('.fs-back').addEventListener('click', function () { api.close(); });

        var api = {
            id: opts.id,
            root: root,
            open: function (tabId) {
                if (tabId) curTab = tabId;
                root.querySelectorAll('.fs-tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === curTab); });
                root.querySelectorAll('.fs-pane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === curTab); });
                opened = true;
                root.classList.add('show');
                try { document.body.style.overflow = 'hidden'; } catch (e) {}
                try { if (typeof opts.onOpen === 'function') opts.onOpen(curTab); } catch (e) {}
                renderTab(curTab);
            },
            close: function () {
                if (!root.classList.contains('show')) return;
                root.classList.remove('show');
                try { document.body.style.overflow = ''; } catch (e) {}
                try { if (typeof opts.onClose === 'function') opts.onClose(); } catch (e) {}
            },
            render: function () { renderTab(curTab); },
            switchTab: switchTab,
            currentTab: function () { return curTab; },
            pane: function () { return paneOf(curTab); },
            actBox: function () { return root.querySelector('#' + id + '-act'); },
            isOpen: function () { return root.classList.contains('show'); }
        };
        pages[opts.id] = api;
        return api;
    }

    /* 把一个已有的 modal 面板「收养」进全屏界面：
       节点整个搬过去，事件绑定全部保留，关闭时再搬回原处。
       这样不用重写老模块，主页面点开也照样是新界面。 */
    function adopt(opts) {
        var page = null, node = null, home = null;
        return {
            open: function () {
                var modal = document.getElementById(opts.modalId);
                if (!modal) {
                    try { if (typeof showModal === 'function') showModal(document.getElementById(opts.modalId)); } catch (e) {}
                    return;
                }
                if (!page) {
                    page = create({
                        id: opts.id,
                        title: opts.title,
                        icon: opts.icon || '',
                        tabs: opts.tabs || [],
                        onRender: function (pane) {
                            if (pane.getAttribute('data-hosted')) return;
                            pane.innerHTML = '<div class="adopt-host"></div>';
                            pane.setAttribute('data-hosted', '1');
                            node = modal.querySelector(opts.contentSel || '.modal-content');
                            home = modal;
                            if (!node) return;
                            pane.firstChild.appendChild(node);
                            modal.style.setProperty('display', 'none', 'important');
                            try { if (typeof opts.afterAdopt === 'function') opts.afterAdopt(pane); } catch (e) {}
                        },
                        onClose: function () {
                            if (node && home && !home.contains(node)) home.appendChild(node);
                            try { if (typeof opts.afterClose === 'function') opts.afterClose(); } catch (e) {}
                        }
                    });
                }
                try { if (typeof opts.beforeOpen === 'function') opts.beforeOpen(); } catch (e) {}
                page.open();
            },
            close: function () { if (page) page.close(); },
            isOpen: function () { return !!(page && page.isOpen()); }
        };
    }

    window.FSPage = { create: create, get: function (id) { return pages[id]; }, adopt: adopt };
})();
