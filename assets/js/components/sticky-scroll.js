/* ============================================================
   v4.0 StickyScroll — IntersectionObserver 點亮 active step
   ============================================================
   桌機 ≥1024：當 step 進入螢幕中央 40% 時，加 is-active class。
   手機 <1024：純垂直堆疊，全部 step 都顯示為 is-active（不需 observer）。
   ============================================================ */

(function () {
  'use strict';

  function initStickyScroll(section) {
    var steps = section.querySelectorAll('.sticky-scroll-step');
    if (steps.length === 0) return;

    var isDesktop = window.matchMedia('(min-width: 1024px)').matches;

    if (!isDesktop) {
      /* 手機：全部 is-active */
      steps.forEach(function (s) { s.classList.add('is-active'); });
      return;
    }

    if (!('IntersectionObserver' in window)) {
      steps.forEach(function (s) { s.classList.add('is-active'); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            steps.forEach(function (s) { s.classList.remove('is-active'); });
            entry.target.classList.add('is-active');
          }
        });
      },
      {
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0
      }
    );

    steps.forEach(function (step) { observer.observe(step); });

    /* 首段預設 active，避免 user 還沒滾就什麼都不亮 */
    if (steps[0]) steps[0].classList.add('is-active');
  }

  function init() {
    document.querySelectorAll('[data-sticky-scroll]').forEach(initStickyScroll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
