/* ============================================================
   CHUN.EN v5 — interactions
   - IntersectionObserver 慢速 reveal
   - Nav scroll 狀態
   - 手機選單
   ============================================================ */
(function () {
  'use strict';

  /* ===== Reveal =====
     threshold 一定要是 0：比例門檻是「可見面積 / 元素面積」，
     元素比視窗還高的時候永遠達不到。手機上長篇專欄的 .article-body
     單一區塊動輒 8000px 以上，比例最多只到 0.07，過不了 0.08 的門檻，
     整段內文就永遠停在 opacity:0 —— 手機版專欄整片空白就是這個原因。
     改成「碰到就顯示」，進場節奏交給 rootMargin 控制。 */
  var reveals = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    reveals.forEach(function (el) { io.observe(el); });

    /* 保險絲：動效不管什麼原因沒跑起來，內容都不該被永久藏住 */
    window.addEventListener('load', function () {
      setTimeout(function () {
        reveals.forEach(function (el) {
          if (el.classList.contains('in')) return;
          if (el.getBoundingClientRect().top < window.innerHeight) {
            el.classList.add('in');
            io.unobserve(el);
          }
        });
      }, 1200);
    });
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

  /* LINE 點擊匿名計數：不用 Cookie、不帶識別碼，只記頁面／進站來源／按鈕位置，不受 GA4 同意閘影響
     （LINE 後台的管道數字單日未滿 20 不顯示，官網這種小量只能自己記；privacy.html 第一條已揭露） */
  function countLine(a) {
    if (!window.fetch) return;
    try { if (localStorage.getItem('chunen-internal') === '1') return; } catch (e) {}
    var src = '';
    try { src = sessionStorage.getItem('ce_line_src') || ''; } catch (e) {}
    var body = JSON.stringify({
      page: location.pathname,
      src: src || 'other',
      slot: a.closest('.float-line') ? 'float' : 'page'
    });
    fetch('https://booking.321avoir.com/beacon/line_click.php', {
      method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: body
    }).catch(function () {});
  }

  /* 點擊委派：LINE / Email / 申請入口 */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('lin.ee') > -1) {
      track('click_line', { link_location: location.pathname });
      countLine(a);
    } else if (href.indexOf('mailto:') === 0) {
      track('click_email', { link_location: location.pathname });
    } else if (href.indexOf('apply.html') > -1) {
      track('click_apply_entry', { link_location: location.pathname });
    }
    /* 首頁分流器：知道訪客實際選了哪一條線 */
    var lane = a.getAttribute('data-path');
    if (lane) track('click_pathfinder', { lane: lane });
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

  /* 分流器進入視野 → view_pathfinder（一次）
     首頁沒有價目，#plans 是分流器不是報價區；分流器已上移到第二屏，
     若仍併進 view_pricing 會讓該事件近乎等於工作階段數。 */
  var pathEl = document.getElementById('plans');
  if (pathEl && 'IntersectionObserver' in window) {
    var fio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          track('view_pathfinder', { page: location.pathname });
          fio.disconnect();
        }
      });
    }, { threshold: 0.3 });
    fio.observe(pathEl);
  }

  /* 方案/報價區進入視野 → view_pricing（一次） */
  var pricingEl = document.querySelector('.invest, .tiers');
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

  /* ===== 冷流量 CTA 兩段式（搜尋／AI 進站且未帶 src：第一顆按鈕改成「看」或「免費做一件事」） ===== */
  (function () {
    var KEY = 'ce_cold';
    var cold = null;
    try { cold = sessionStorage.getItem(KEY); } catch (e) {}
    if (cold === null) {
      var ref = document.referrer || '';
      var isSearch = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|brave)\.|chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google|copilot\.microsoft/i.test(ref);
      var hasSrc = /[?&]src=/.test(location.search);
      cold = (isSearch && !hasSrc) ? '1' : '0';
      try { sessionStorage.setItem(KEY, cold); } catch (e) {}
    }
    if (cold !== '1') return;
    var els = document.querySelectorAll('a[data-cold-text]');
    for (var i = 0; i < els.length; i++) {
      var a = els[i];
      a.textContent = a.getAttribute('data-cold-text');
      a.setAttribute('href', a.getAttribute('data-cold-href'));
      a.removeAttribute('target'); a.removeAttribute('rel');
      a.setAttribute('data-cta-variant', 'cold');
    }
  })();

  /* ===== 搜尋／AI 進站改用專屬 LINE 追蹤連結：LINE 後台「加入管道」就分得出 GEO 與 SEO 帶來多少加好友（不靠 GA4 同意閘） ===== */
  (function () {
    var LINKS = { ai: 'https://lin.ee/oOnyIec6', search: 'https://lin.ee/QR9L9f4' };  // 在 LINE OA「加好友工具」建好兩條追蹤連結後填入；空字串＝維持原連結
    var KEY = 'ce_line_src';
    var src = null;
    try { src = sessionStorage.getItem(KEY); } catch (e) {}
    if (src === null) {
      var ref = document.referrer || '', q = location.search;
      if (/chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google|copilot\.microsoft|claude\.ai/i.test(ref) ||
          /[?&]utm_source=(chatgpt|perplexity|gemini|copilot)/i.test(q)) src = 'ai';
      else if (/(^|\.)(google|bing|yahoo|duckduckgo|ecosia|brave)\./i.test(ref) && !/[?&](src|utm_[a-z]+|gclid|gbraid|wbraid|fbclid)=/i.test(q)) src = 'search';  // 廣告點擊與自帶來源的不算搜尋
      else src = '';
      try { sessionStorage.setItem(KEY, src); } catch (e) {}
    }
    var to = src && LINKS[src];
    if (!to) return;
    var as = document.querySelectorAll('a[href*="lin.ee/"]');
    for (var i = 0; i < as.length; i++) as[i].setAttribute('href', to);
  })();
})();


/* ============================================================
   LINE 入口修正包（G1a 原型，2026-10-23 原型，2026-11-17 重接到現行版本）
   上線時建議整段附加到 v5.js 尾端（或另存 line-entry.js 全站載入），並 bump 全站 ?v=
   1. Cookie 橫幅顯示期間，在 <body> 加 consent-open 與 --consent-h，讓右下 LINE 鈕讓位
   2. 桌機（滑鼠操作、寬度 ≥ 900px）點任何 lin.ee 連結：站內開行動條碼面板
      手機與平板照舊直接開 LINE
   不改原本的 click_line 事件（v5.js 的委派照常觸發），另外多送一個 line_qr_view
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. 橫幅讓位 ---------- */
  var root = document.documentElement;
  function syncConsent() {
    var bar = document.querySelector('.consent-bar');
    var open = !!(bar && bar.classList.contains('show'));
    document.body.classList.toggle('consent-open', open);
    if (open) root.style.setProperty('--consent-h', bar.offsetHeight + 'px');
  }
  var barObserver = null;
  function watchBar() {
    var bar = document.querySelector('.consent-bar');
    if (bar && !barObserver) {
      barObserver = new MutationObserver(syncConsent);
      barObserver.observe(bar, { attributes: true, attributeFilter: ['class'] });
    }
    if (!bar && barObserver) { barObserver.disconnect(); barObserver = null; }
    syncConsent();
  }
  new MutationObserver(watchBar).observe(document.body, { childList: true });
  window.addEventListener('resize', syncConsent, { passive: true });
  watchBar();

  /* ---------- 2. 桌機行動條碼面板 ---------- */
  // 追蹤連結 → 行動條碼檔（與 LINE 後台的渠道一一對應，掃碼加入仍記在同一條渠道）
  var QR = {
    '7DXWsNcz': { key: 'main' },
    'XsKBFdi': { key: 'broom', perk: true },
    'wINWAGj': { key: 'journal' },
    '8ZpeJyG': { key: 'portfolio' },
    'nRBmVEh': { key: 'event', file: '/assets/images/line-qr-event-makeup-360.png' },
    '8sU9fkj': { key: 'men' },
    'oOnyIec6': { key: 'ai' },     // 從 AI 進站時 v5.js 會換成這條
    'QR9L9f4': { key: 'search' }   // 從搜尋進站時 v5.js 會換成這條
  };
  function qrSrc(id) {
    var o = window.LINE_QR_OVERRIDE; // 原型用：本機預覽時以 data URI 取代
    if (o && o[id]) return o[id];
    var m = QR[id];
    return m.file || ('/assets/images/line-qr-' + m.key + '-360.png');
  }
  function isDesktop() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches && window.innerWidth >= 900;
  }

  var panel = null, lastFocus = null;
  function build() {
    panel = document.createElement('div');
    panel.className = 'line-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'line-panel-title');
    panel.innerHTML =
      '<div class="line-panel__box">' +
        '<button class="line-panel__close" type="button" aria-label="關閉">×</button>' +
        '<p class="line-panel__eyebrow">LINE</p>' +
        '<h2 class="line-panel__title" id="line-panel-title">用手機加入 LINE</h2>' +
        '<img class="line-panel__qr" alt="CHUN.EN LINE 官方帳號行動條碼" width="196" height="196" />' +
        '<p class="line-panel__text">用手機 LINE 掃描行動條碼加入好友，再點選想了解的服務，我們會接著說明與安排。</p>' +
        '<p class="line-panel__perk" hidden>加入好友可領取 B.room 妝髮抵用券 NT$500，到店日常、商務、活動妝髮適用。</p>' +
        '<p class="line-panel__alt">企業合作或正式洽談，可以<a href="/apply.html">填寫企業合作需求</a><br>或來信 <a href="mailto:contact@chunen.tw">contact@chunen.tw</a></p>' +
      '</div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
    panel.querySelector('.line-panel__close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) close(); });
  }
  function open(id, trigger) {
    if (!panel) build();
    lastFocus = trigger || document.activeElement;
    panel.querySelector('.line-panel__qr').src = qrSrc(id);
    panel.querySelector('.line-panel__perk').hidden = !QR[id].perk;
    panel.hidden = false;
    requestAnimationFrame(function () { panel.classList.add('show'); });
    panel.querySelector('.line-panel__close').focus();
    if (typeof window.gtag === 'function') window.gtag('event', 'line_qr_view', { link_location: location.pathname, channel: QR[id].key });
  }
  function close() {
    panel.classList.remove('show');
    setTimeout(function () { panel.hidden = true; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href*="lin.ee/"]') : null;
    if (!a || !isDesktop()) return;
    var m = (a.getAttribute('href') || '').match(/lin\.ee\/([A-Za-z0-9]+)/);
    if (!m || !QR[m[1]]) return; // 沒有對應行動條碼的連結（例如廣告渠道）照舊開新分頁
    e.preventDefault();
    open(m[1], a);
  });
})();
