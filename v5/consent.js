/* ============================================================
   CHUN.EN v5 — Cookie 同意橫幅 + 追蹤工具載入
   ============================================================
   - 首次造訪顯示編輯感深色橫幅（接受 / 僅必要）
   - 選擇存 localStorage，之後不再打擾
   - 「接受」後才載入 GA4 / LinkedIn Insight Tag
   - GA_ID 未設定（含 XXXX placeholder）時自動跳過載入，
     橫幅照常運作 → 之後填入正式 ID 即全站生效
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'chunen-consent';

  /* ========== 追蹤工具設定 ==========
     TODO: 開通後把下面兩個 ID 換成正式值 */
  var GA_ID = 'G-XXXXXXXXXX';          // Google Analytics 4 Measurement ID
  var LINKEDIN_PARTNER_ID = '';         // LinkedIn Insight Tag Partner ID（投放前填入）

  function loadTrackers() {
    /* --- GA4 --- */
    if (GA_ID && GA_ID.indexOf('XXXX') === -1) {
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
    if (LINKEDIN_PARTNER_ID) {
      window._linkedin_partner_id = LINKEDIN_PARTNER_ID;
      window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
      window._linkedin_data_partner_ids.push(LINKEDIN_PARTNER_ID);
      var l = document.createElement('script');
      l.async = true;
      l.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
      document.head.appendChild(l);
    }
  }

  /* ========== 已做過選擇 → 直接執行 ========== */
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'all') { loadTrackers(); return; }
  if (saved === 'necessary') { return; }

  /* ========== 首次造訪 → 顯示橫幅 ========== */
  function buildBanner() {
    var bar = document.createElement('div');
    bar.className = 'consent-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie 同意設定');
    bar.innerHTML =
      '<p class="consent-text">本網站使用 Cookie 以優化瀏覽體驗與匿名流量分析。' +
      '<a href="privacy.html">隱私權政策</a></p>' +
      '<div class="consent-actions">' +
      '<button class="consent-btn consent-accept" type="button">接受</button>' +
      '<button class="consent-btn consent-necessary" type="button">僅必要</button>' +
      '</div>';
    document.body.appendChild(bar);

    /* 進場動畫 */
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildBanner);
  } else {
    buildBanner();
  }
})();
