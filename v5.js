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

  /* ===== GA4 轉換事件（gtag 存在時才送，consent-gated） ===== */
  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }

  /* 點擊委派：LINE / Email / 申請入口 */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('lin.ee') > -1) {
      track('click_line', { link_location: location.pathname });
    } else if (href.indexOf('mailto:') === 0) {
      track('click_email', { link_location: location.pathname });
    } else if (href.indexOf('apply.html') > -1) {
      track('click_apply_entry', { link_location: location.pathname });
    }
  }, { passive: true });

  /* 申請表單：首次輸入 → start_application */
  var applyForm = document.getElementById('applyForm');
  if (applyForm) {
    var started = false;
    applyForm.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('start_application');
    });
  }

  /* 方案/報價區進入視野 → view_pricing（一次） */
  var pricingEl = document.querySelector('#plans, .invest, .tiers');
  if (pricingEl && 'IntersectionObserver' in window) {
    var pio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          track('view_pricing', { page: location.pathname });
          pio.disconnect();
        }
      });
    }, { threshold: 0.3 });
    pio.observe(pricingEl);
  }
})();
