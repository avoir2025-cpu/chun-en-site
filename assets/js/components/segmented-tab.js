/* ============================================================
   v4.0 SegmentedTab — tab 切換
   ============================================================
   data-tab-group="X" 用來把多組 tab 與其 panel 配對（避免衝突）
   不傳 data-tab-group 時，從 data-target 找對應 #id
   ============================================================ */

(function () {
  'use strict';

  function initTabGroup(tabGroup) {
    var tabs = tabGroup.querySelectorAll('[role="tab"]');
    if (tabs.length === 0) return;

    var groupId = tabGroup.dataset.tabGroup || '';

    function getPanels() {
      if (groupId) {
        return document.querySelectorAll(
          '[role="tabpanel"][data-tab-group="' + groupId + '"]'
        );
      }
      var panels = [];
      tabs.forEach(function (t) {
        var p = document.getElementById(t.dataset.target);
        if (p) panels.push(p);
      });
      return panels;
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var targetId = tab.dataset.target;

        tabs.forEach(function (t) {
          t.setAttribute('aria-selected', 'false');
        });
        tab.setAttribute('aria-selected', 'true');

        var panels = getPanels();
        panels.forEach(function (p) { p.setAttribute('hidden', ''); });

        var target = document.getElementById(targetId);
        if (target) target.removeAttribute('hidden');
      });

      /* 鍵盤導航 */
      tab.addEventListener('keydown', function (e) {
        var idx = Array.prototype.indexOf.call(tabs, tab);
        if (e.key === 'ArrowRight') {
          tabs[(idx + 1) % tabs.length].focus();
          tabs[(idx + 1) % tabs.length].click();
          e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
          tabs[(idx - 1 + tabs.length) % tabs.length].focus();
          tabs[(idx - 1 + tabs.length) % tabs.length].click();
          e.preventDefault();
        }
      });
    });
  }

  function init() {
    document.querySelectorAll('[data-tab]').forEach(initTabGroup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
