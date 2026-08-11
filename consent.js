/* ============================================================
   CHUN.EN — Cookie 同意橫幅 + 追蹤/第三方元件載入
   ============================================================
   - 首次造訪顯示編輯感深色橫幅（接受 / 僅必要）
   - 選擇存 localStorage；footer「Cookie 設定」可隨時重開
   - 「接受」後才載入：GA4、Meta Pixel、LinkedIn Insight Tag、Elfsight 評論
   - 「僅必要」：評論區顯示靜態說明 + Google Maps 連結
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'chunen-consent';

  /* ========== 追蹤工具設定 ========== */
  var GA_ID = 'G-SDGX47Z79R';           // Google Analytics 4
  var META_PIXEL_ID = '';                // Meta Pixel（事件管理工具的資料來源 ID，15-16 位數字）
  var LINKEDIN_PARTNER_ID = '';          // LinkedIn Insight Tag（投放前填入）
  var ELFSIGHT_APP = 'elfsight-app-93473a4d-e044-4d20-a10b-664ca6a579f2';

  /* ========== GA4 事件 → Meta 事件對照 ==========
     全站事件都走 v5.js / deploy/app.js 的 track()，最後都落到 window.gtag('event', …)。
     這裡在 gtag 出口掛一個鏡射，把「對廣告有意義的那幾個」同步送一份給 Pixel，
     好處是 v5.js 與 app.js 一行都不用改，同意閘與佇列邏輯也完全沿用既有那套。

     只鏡射白名單內的事件，不是全部：Pixel 事件太雜會讓受眾與最佳化訊號變糊，
     而且每一發都是一次網路請求。要加新的就往這張表加。

     type='track' 是 Meta 標準事件（可拿來當廣告最佳化目標），
     type='custom' 是自訂事件（只能拿來做再行銷受眾，不能當最佳化目標）。 */
  var META_EVENT_MAP = {
    /* 主 CTA：點 LINE 加好友。這是全站最重要的轉換，廣告要最佳化的就是它 */
    click_line:         { type: 'track',  name: 'Lead',             params: { channel: 'line' } },
    /* 合作需求表單送出（apply.html），另一條真實的商業線索 */
    submit_application: { type: 'track',  name: 'Lead',             params: { channel: 'form' } },
    click_email:        { type: 'track',  name: 'Contact',          params: {} },
    /* 看過方案/價目：拿來做再行銷受眾（看過但沒加 LINE 的人） */
    view_pricing:       { type: 'track',  name: 'ViewContent',      params: { content_type: 'pricing' } },
    /* 開始填表但沒送出，是最值錢的再行銷名單，所以獨立成一個事件 */
    start_application:  { type: 'custom', name: 'StartApplication', params: {} }
  };

  function mirrorToMeta(name, params) {
    if (typeof window.fbq !== 'function') return;
    var m = META_EVENT_MAP[name];
    if (!m) return;                       // 不在白名單就不送
    var payload = { source_event: name, page: location.pathname };
    var k;
    for (k in m.params) { if (m.params.hasOwnProperty(k)) payload[k] = m.params[k]; }
    if (params && params.link_location) payload.link_location = params.link_location;
    window.fbq(m.type === 'track' ? 'track' : 'trackCustom', m.name, payload);
  }

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
      /* 事件同時鏡射給 Meta Pixel；'js' / 'config' 這類設定呼叫不鏡射 */
      function gtag() {
        window.dataLayer.push(arguments);
        if (arguments[0] === 'event') mirrorToMeta(arguments[1], arguments[2]);
      }
      window.gtag = gtag;
      gtag('js', new Date());
      var cfg = { anonymize_ip: true };
      if (isInternal()) cfg.traffic_type = 'internal';
      gtag('config', GA_ID, cfg);
    }
    /* --- Meta Pixel ---
       內部流量完全不載入。Meta 沒有 GA4 那種「內部流量」篩選器，
       自己人的瀏覽與點擊一旦進了 Pixel 就洗不掉，還會被拿去算相似受眾。 */
    if (META_PIXEL_ID && !window.__fbLoaded && !isInternal()) {
      window.__fbLoaded = true;
      /* Meta 官方 base code（含載入前的呼叫佇列，不要改寫） */
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', META_PIXEL_ID);
      window.fbq('track', 'PageView');
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
      var staticGrid = slot.querySelector('.tsm-static, .tsm-grid');
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
      '<a href="/privacy.html">隱私權政策</a></p>' +
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
