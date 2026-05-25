/* ============================================================
   v4.0 HorizontalCarousel — 水平 scroll-snap 元件
   ============================================================
   - prev/next 按鈕滾動單張 item 寬度（含 gap）
   - hint 3 秒後 fade out，或首次 scroll 時 fade out
   - 邊界 disable：scroll 到頭/尾自動 disable 對應按鈕
   - 鍵盤可控：focus 後左右方向鍵切換
   ============================================================ */

(function () {
  'use strict';

  function initCarousel(carousel) {
    var track = carousel.querySelector('.h-carousel-track');
    if (!track) return;

    var prevBtn = carousel.querySelector('.h-carousel-nav--prev');
    var nextBtn = carousel.querySelector('.h-carousel-nav--next');
    var hint = carousel.querySelector('.h-carousel-hint');

    function getScrollStep() {
      var item = track.querySelector('.h-carousel-item');
      if (!item) return 360;
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 24;
      return item.getBoundingClientRect().width + gap;
    }

    function updateButtons() {
      if (!prevBtn || !nextBtn) return;
      var atStart = track.scrollLeft <= 4;
      var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      prevBtn.dataset.disabled = atStart ? 'true' : 'false';
      nextBtn.dataset.disabled = atEnd ? 'true' : 'false';
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        track.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        track.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
      });
    }

    /* hint fade out */
    if (hint) {
      var hideHint = function () { hint.classList.add('is-hidden'); };
      setTimeout(hideHint, 3000);
      track.addEventListener('scroll', hideHint, { once: true, passive: true });
    }

    /* 鍵盤 */
    track.tabIndex = 0;
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') {
        track.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        track.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
        e.preventDefault();
      }
    });

    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    updateButtons();
  }

  function init() {
    document.querySelectorAll('[data-carousel]').forEach(initCarousel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
