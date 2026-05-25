/* ============================================================
   v4.0 MarqueeTicker
   ============================================================
   純 CSS 動畫實作，JS 僅在開發時可選地驗證內容是否成對複製
   （seamless loop 需要 track 內容 ×2）。
   ============================================================ */

(function () {
  'use strict';

  /* 開發 utility：自動把 track 內容複製一次，確保 seamless loop */
  function ensureSeamless(ticker) {
    if (ticker.dataset.seamlessReady === 'true') return;
    var track = ticker.querySelector('.marquee-track');
    if (!track) return;

    /* 只有當 children 沒被刻意 ×2 時，才自動複製 */
    if (ticker.dataset.autoClone === 'true') {
      var original = Array.prototype.slice.call(track.children);
      original.forEach(function (child) {
        var clone = child.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });
    }
    ticker.dataset.seamlessReady = 'true';
  }

  function init() {
    document.querySelectorAll('[data-marquee]').forEach(ensureSeamless);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
