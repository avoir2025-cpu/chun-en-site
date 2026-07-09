/* ============================================================
   CHUN.EN v5 — interactions
   - IntersectionObserver 慢速 reveal
   - Nav scroll 狀態
   - 手機選單
   ============================================================ */
(function () {
  'use strict';

  /* ===== Reveal ===== */
  var reveals = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ===== Nav scroll 狀態 ===== */
  var nav = document.getElementById('nav');
  var lastState = false;
  function onScroll() {
    var scrolled = window.scrollY > 40;
    if (scrolled !== lastState) {
      nav.classList.toggle('scrolled', scrolled);
      lastState = scrolled;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ===== 手機選單 ===== */
  var burger = document.getElementById('burger');
  var mnav = document.getElementById('mnav');
  function closeMenu() {
    mnav.classList.remove('open');
    document.body.classList.remove('mnav-lock');
  }
  burger.addEventListener('click', function () {
    var opening = !mnav.classList.contains('open');
    mnav.classList.toggle('open', opening);
    document.body.classList.toggle('mnav-lock', opening);
  });
  mnav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  /* ===== Hero 影片 =====
     iOS 低耗電模式會封鎖 autoplay（只顯示 poster）。
     偵測播放失敗 → 首次觸碰/捲動時嘗試補播，讓使用者「打開就會動」。 */
  var heroVideoEl = document.querySelector('.hero-media video');
  if (heroVideoEl) {
    var tryPlay = function () {
      var p = heroVideoEl.play();
      if (p && p.catch) { p.catch(function () {}); }
    };
    tryPlay();
    // autoplay 被擋時，第一次互動補播
    var kickstart = function () {
      if (heroVideoEl.paused) tryPlay();
      window.removeEventListener('touchstart', kickstart);
      window.removeEventListener('scroll', kickstart);
      window.removeEventListener('click', kickstart);
    };
    window.addEventListener('touchstart', kickstart, { passive: true, once: false });
    window.addEventListener('scroll', kickstart, { passive: true, once: false });
    window.addEventListener('click', kickstart, { once: false });
  }

  /* ===== Hero 微視差 ===== */
  var heroMedia = document.querySelector('.hero-media');
  if (heroMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y < window.innerHeight) {
          heroMedia.style.transform = 'translateY(' + (y * 0.18) + 'px)';
        }
        ticking = false;
      });
    }, { passive: true });
  }
})();
