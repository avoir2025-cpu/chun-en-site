/* ============================================================
   CHUN.EN — Cookie 同意橫幅 + 追蹤/第三方元件載入
   ============================================================
   - 首次造訪顯示編輯感深色橫幅（接受 / 僅必要）
   - 選擇存 localStorage；footer「Cookie 設定」可隨時重開
   - 「接受」後才載入：GA4、LinkedIn Insight Tag、Elfsight 評論
   - 「僅必要」：評論區顯示靜態說明 + Google Maps 連結
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'chunen-consent';

  /* ========== 追蹤工具設定 ========== */
  var GA_ID = 'G-SDGX47Z79R';           // Google Analytics 4
  var LINKEDIN_PARTNER_ID = '';          // LinkedIn Insight Tag（投放前填入）
  var ELFSIGHT_APP = 'elfsight-app-93473a4d-e044-4d20-a10b-664ca6a579f2';

  function loadTrackers() {
    /* --- GA4 --- */
    if (GA_ID && GA_ID.indexOf('XXXX') === -1 && !window.__gaLoaded) {
      window.__gaLoaded = true;
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      function gtag() { window.dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', GA_ID, { anonymize_ip: true });
    }
    /* --- LinkedIn Insight Tag --- */
    if (LINKEDIN_PARTNER_ID && !window.__liLoaded) {
      window.__liLoaded = true;
      window._linkedin_partner_id = LINKEDIN_PARTNER_ID;
      window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
      window._linkedin_data_partner_ids.push(LINKEDIN_PARTNER_ID);
      var l = document.createElement('script');
      l.async = true;
      l.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
      document.head.appendChild(l);
    }
    /* --- Elfsight（Google 評論元件，僅同意後載入） --- */
    var slot = document.getElementById('elfsight-slot');
    if (slot && !slot.dataset.loaded) {
      slot.dataset.loaded = 'true';
      slot.innerHTML = '<div class="' + ELFSIGHT_APP + '" data-elfsight-app-lazy></div>';
      var e = document.createElement('script');
      e.async = true;
      e.src = 'https://elfsightcdn.com/platform.js';
      document.head.appendChild(e);
    }
  }

  /* ========== 橫幅 ========== */
  function buildBanner() {
    if (document.querySelector('.consent-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'consent-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie 同意設定');
    bar.innerHTML =
      '<p class="consent-text">本網站使用 Cookie 以優化瀏覽體驗、匿名流量分析與評論展示。' +
      '<a href="privacy.html">隱私權政策</a></p>' +
      '<div class="consent-actions">' +
      '<button class="consent-btn consent-accept" type="button">接受</button>' +
      '<button class="consent-btn consent-necessary" type="button">僅必要</button>' +
      '</div>';
    document.body.appendChild(bar);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { bar.classList.add('show'); });
    });

    function choose(value) {
      try { localStorage.setItem(KEY, value); } catch (e) {}
      bar.classList.remove('show');
      setTimeout(function () { bar.remove(); }, 500);
      if (value === 'all') loadTrackers();
    }
    bar.querySelector('.consent-accept').addEventListener('click', function () { choose('all'); });
    bar.querySelector('.consent-necessary').addEventListener('click', function () { choose('necessary'); });
  }

  /* ========== 初始化 ========== */
  function init() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved === 'all') {
      loadTrackers();
    } else if (saved !== 'necessary') {
      buildBanner();
    }

    /* footer「Cookie 設定」→ 重開橫幅 */
    document.querySelectorAll('[data-cookie-settings]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        try { localStorage.removeItem(KEY); } catch (e) {}
        buildBanner();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
