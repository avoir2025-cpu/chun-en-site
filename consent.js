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

  /* ========== 內部流量開關 ==========
     自己人（含手機、外出的網路）測站時，網址加 ?internal=1 開一次即可，
     這台瀏覽器之後所有事件都會帶 traffic_type=internal，
     被 GA4 的「內部流量」資料篩選器認出來。要關掉用 ?internal=0。
     IP 規則只擋得住固定網路，這個開關才擋得住手機網路與在外測試。 */
  var INTERNAL_KEY = 'chunen-internal';

  function isInternal() {
    var flag = false;
    try {
      var q = window.location.search;
      if (q.indexOf('internal=') > -1) {
        var on = q.indexOf('internal=0') === -1;
        if (on) { localStorage.setItem(INTERNAL_KEY, '1'); }
        else { localStorage.removeItem(INTERNAL_KEY); }
        console.info('[CHUN.EN] 內部流量標記：' + (on ? '開啟' : '關閉'));
      }
      flag = localStorage.getItem(INTERNAL_KEY) === '1';
    } catch (e) {}
    return flag;
  }

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
      var cfg = { anonymize_ip: true };
      if (isInternal()) cfg.traffic_type = 'internal';
      gtag('config', GA_ID, cfg);
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
    /* --- Elfsight（Google 評論元件，僅同意後載入） ---
       2026-08-05 防呆改版：
       - 內部流量（?internal=1 標記過的自己人）不載入 Elfsight，
         免費版 200 view/月額度留給真訪客，內部一律看靜態評論
       - 靜態評論(.tsm-grid)不再被清掉：widget 真的渲染出內容才隱藏，
         額度用完/腳本被擋/載入失敗時評論區維持靜態版，不會空白 */
    var slot = document.getElementById('elfsight-slot');
    if (slot && !slot.dataset.loaded && !isInternal()) {
      slot.dataset.loaded = 'true';
      var widget = document.createElement('div');
      widget.className = ELFSIGHT_APP;
      widget.setAttribute('data-elfsight-app-lazy', '');
      slot.appendChild(widget);
      var e = document.createElement('script');
      e.async = true;
      e.src = 'https://elfsightcdn.com/platform.js';
      document.head.appendChild(e);
      var staticGrid = slot.querySelector('.tsm-grid');
      if (staticGrid) {
        /* widget 是 lazy 載入（滾到可視範圍才渲染），不能用固定時限輪詢；
           改盯尺寸：長出高度＝渲染成功，那一刻才收掉靜態版。
           只看高度不數子節點——Elfsight 渲染在 Shadow DOM，light DOM 可能是空的 */
        var hideStatic = function () {
          if (widget.offsetHeight > 60) { staticGrid.style.display = 'none'; return true; }
          return false;
        };
        if (!hideStatic()) {
          if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function () { if (hideStatic()) ro.disconnect(); });
            ro.observe(widget);
          } else {
            var timer = setInterval(function () { if (hideStatic()) clearInterval(timer); }, 800);
          }
        }
      }
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
    isInternal();               // 先認網址上的開關，就算選「僅必要」也要記住
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
