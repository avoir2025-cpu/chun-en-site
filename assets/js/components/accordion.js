/* ============================================================
   v4.0 Accordion — 摺疊元件
   ============================================================
   原生 <details>/<summary> 已 fully functional。
   此 JS 只在 data-single-open 模式下，確保一次只能展開一個。
   ============================================================ */

(function () {
  'use strict';

  function initSingleOpenAccordion(group) {
    var items = group.querySelectorAll('details.accordion-item');
    items.forEach(function (item) {
      item.addEventListener('toggle', function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item && other.open) other.open = false;
        });
      });
    });
  }

  function init() {
    var groups = document.querySelectorAll('[data-accordion][data-single-open]');
    groups.forEach(initSingleOpenAccordion);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
