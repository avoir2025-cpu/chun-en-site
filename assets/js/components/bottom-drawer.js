/* ============================================================
   v4.0 BottomDrawer — 手機 nav drawer
   ============================================================
   - 點 trigger → open，點 close 或 ESC 或選單內 link → close
   - 開啟時 body overflow: hidden 避免背景捲動
   - 桌機 ≥768 自動隱藏 trigger 與 drawer
   ============================================================ */

(function () {
  'use strict';

  function init() {
    var trigger = document.querySelector('.drawer-trigger');
    var drawer = document.querySelector('[data-drawer]');
    if (!trigger || !drawer) return;

    var closeBtn = drawer.querySelector('.drawer-close');

    function openDrawer() {
      drawer.hidden = false;
      /* 先 render 才能 transition */
      requestAnimationFrame(function () {
        drawer.classList.add('is-open');
      });
      document.body.classList.add('drawer-open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    function closeDrawer() {
      drawer.classList.remove('is-open');
      document.body.classList.remove('drawer-open');
      trigger.setAttribute('aria-expanded', 'false');
      setTimeout(function () { drawer.hidden = true; }, 400);
    }

    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    /* 選單內任何 link 點擊後關閉 drawer（除了 # 開頭錨點不關） */
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        closeDrawer();
      });
    });

    /* ESC 關閉 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
        closeDrawer();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
