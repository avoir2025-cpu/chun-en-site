/* ============================================================
   CHUN.EN Visual OS｜Deploy — 影像部署模擬器 P0
   純前端、零後端。照片全程不離開瀏覽器。
   ------------------------------------------------------------
   本檔分區：
     §1 工具         §2 規格載入      §3 狀態
     §4 路由／步驟   §5 版位選擇      §6 裁切引擎（拖拉／縮放／有效像素）
     §7 裁切畫面     §8 舞台畫面      §9 輸出引擎（Canvas／預覽圖／ZIP）
     §10 下載畫面    §11 啟動
   疊層座標、尺寸、門檻、文案一律來自 specs/*.json，不寫死在程式。
   ============================================================ */

/* ================= §1 工具 ================= */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

const track = (name, params) => {
  if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
};

const todayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
const safeName = (s) => (s || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 20);
const fillTemplate = (tpl, fallback, name) =>
  tpl.replace('{name}', safeName(name) || fallback).replace('{date}', todayStamp());

const MAX_FILE_MB = 80;   // 交付原始檔常見 40–50MB，留足空間
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const MAX_WORK_PIXELS = 16.5e6;   // iOS Safari canvas 面積上限，超過先降採樣成工作圖
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const HEIC_LIB = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

/* ================= §2 規格載入 ================= */
const SPECS = { index: null, platforms: {} };

async function loadSpecs() {
  SPECS.index = await fetch('specs/index.json').then((r) => r.json());
  for (const p of SPECS.index.platforms) {
    if (!p.is_active) continue;
    SPECS.platforms[p.id] = await fetch(`specs/${p.file}`).then((r) => r.json());
  }
}
const platformSpec = () => SPECS.platforms[state.platform];
const slotSpec = (slotId) => platformSpec().slots.find((s) => s.slot === slotId);

/* ================= §3 狀態 ================= */
const state = {
  screen: 'pick',
  platform: 'linkedin',
  mode: null,
  queue: [],
  cursor: 0,
  assets: {},       // slot -> { img, url, naturalW/H, workW/H, downsampled, transform:{zoom,nx,ny} }
  guidesOn: {},
  stageView: 'desktop',
  compare: false,
  name: '',
  headline: ''
};
const currentSlotId = () => state.queue[state.cursor];
const currentAsset = () => state.assets[currentSlotId()];
const allSlotsReady = () => state.queue.length > 0 && state.queue.every((s) => state.assets[s]);

/* ================= §4 路由／步驟 ================= */
const SCREENS = ['pick', 'crop', 'stage', 'export'];

function go(screen) {
  if (!SCREENS.includes(screen)) return;
  state.screen = screen;
  SCREENS.forEach((s) => { $('screen-' + s).hidden = s !== screen; });
  $('stepper').hidden = screen === 'pick' && !state.mode;
  renderStepper();
  if (screen === 'crop') renderCrop();
  if (screen === 'stage') renderStage();
  if (screen === 'export') renderExport();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderStepper() {
  const order = { pick: 0, crop: 1, stage: 2, export: 3 };
  const now = order[state.screen];
  document.querySelectorAll('.step').forEach((btn) => {
    const i = order[btn.dataset.goto];
    btn.classList.toggle('on', i === now);
    btn.classList.toggle('done', i < now);
  });
}
document.querySelectorAll('.step').forEach((btn) => {
  btn.addEventListener('click', () => { if (btn.classList.contains('done')) go(btn.dataset.goto); });
});

/* ================= §5 版位選擇畫面 ================= */
function renderPicker() {
  const row = $('platformRow');
  row.innerHTML = '';
  SPECS.index.platforms.forEach((p) => {
    const b = el('button', 'plat' + (p.id === state.platform ? ' on' : ''));
    b.appendChild(el('span', null, p.display_name));
    b.appendChild(el('span', 'ph', p.is_active ? p.phase : '即將開放'));
    b.disabled = !p.is_active;
    b.title = p.tagline || '';
    b.addEventListener('click', () => { state.platform = p.id; state.mode = null; renderPicker(); });
    row.appendChild(b);
  });

  const spec = platformSpec();

  const grid = $('modeGrid');
  grid.innerHTML = '';
  spec.modes.forEach((m) => {
    const b = el('button', 'mode' + (m.id === state.mode ? ' on' : ''));
    b.appendChild(el('span', 'm-en', m.subtitle));
    b.appendChild(el('div', 'm-tc', m.display_name));
    b.appendChild(el('p', 'm-sum', m.summary));
    if (m.recommended) b.appendChild(el('span', 'm-rec', '建議'));
    b.addEventListener('click', () => {
      state.mode = m.id;
      state.queue = m.slots.slice();
      state.cursor = 0;
      track('deploy_mode_select', { platform: state.platform, mode: m.id });
      renderPicker();
      go('crop');
    });
    grid.appendChild(b);
  });

  const cards = $('slotCards');
  cards.innerHTML = '';
  spec.slots.filter((s) => s.is_active).forEach((s) => cards.appendChild(slotCard(s)));

  $('specStamp').textContent =
    `規格版本 ${spec.version}｜資料來源：${SPECS.index.source}。各平台規格會不定期改版，重大變動時本工具隨之更新。`;
  $('footSpec').textContent = `規格組版本 ${SPECS.index.bundle_version}`;
}

function slotCard(s) {
  const c = el('div', 'slot-card');
  const dia = el('div', 'sc-dia');
  dia.appendChild(diagramFor(s));
  c.appendChild(dia);

  const t = el('div', 'sc-title');
  t.appendChild(el('b', null, s.display_name));
  t.appendChild(el('span', null, s.display_name_en));
  c.appendChild(t);

  c.appendChild(el('div', 'sc-size',
    `${s.output.width} × ${s.output.height}　${s.output.aspect_ratio}　最低有效 ${s.minimum_effective.width}px`));
  c.appendChild(el('p', 'sc-purpose', s.card.purpose));

  const meta = el('div', 'sc-meta');
  [['建議照片', s.card.shot_type],
   ['主體位置', s.card.subject_position],
   ['頭像遮擋', s.card.has_overlap ? '有，左下角約 568×264' : '無'],
   ['顯示形狀', s.display_shape === 'circle' ? '圓形（四角會被切掉）' : '矩形']
  ].forEach(([k, v]) => {
    const d = el('div');
    d.appendChild(el('span', null, k));
    d.appendChild(el('p', null, v));
    meta.appendChild(d);
  });
  c.appendChild(meta);
  c.appendChild(el('p', 'sc-ver', `規格版本 ${s.version}`));
  return c;
}

function diagramFor(s) {
  const W = s.output.width, H = s.output.height;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${s.display_name} 版位示意` });
  const sk = Math.max(2, W / 220);
  const fs = Math.round(Math.max(Math.min(W, H) * 0.055, W * 0.032));
  const dash = `${(sk * 5).toFixed(0)} ${(sk * 4).toFixed(0)}`;
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#0D0A07', stroke: 'rgba(245,241,232,0.16)', 'stroke-width': sk * 0.8 }));

  if (s.display_shape === 'circle') {
    const g = s.guides.find((x) => x.id === 'circle_mask');
    if (g) {
      svg.appendChild(svgEl('path', {
        d: `M0,0 H${W} V${H} H0 Z M${g.geometry.cx},${g.geometry.cy - g.geometry.r} a${g.geometry.r},${g.geometry.r} 0 1,0 0.01,0 Z`,
        fill: 'rgba(180,101,90,0.28)', 'fill-rule': 'evenodd'
      }));
      svg.appendChild(svgEl('circle', { cx: g.geometry.cx, cy: g.geometry.cy, r: g.geometry.r, fill: 'none', stroke: '#A88A5C', 'stroke-width': sk }));
    }
    const sub = s.guides.find((x) => x.id === 'subject_zone');
    if (sub) svg.appendChild(svgEl('circle', { cx: sub.geometry.cx, cy: sub.geometry.cy, r: sub.geometry.r, fill: 'none', stroke: '#7FA37A', 'stroke-width': sk * 0.8, 'stroke-dasharray': dash }));
  } else {
    if (s.mobile_crop) {
      const m = s.mobile_crop;
      svg.appendChild(svgEl('rect', { x: 0, y: 0, width: m.x, height: H, fill: 'rgba(20,16,11,0.72)' }));
      svg.appendChild(svgEl('rect', { x: m.x + m.width, y: 0, width: W - m.x - m.width, height: H, fill: 'rgba(20,16,11,0.72)' }));
      svg.appendChild(svgEl('rect', { x: m.x, y: 1, width: m.width, height: H - 2, fill: 'none', stroke: '#C9A96E', 'stroke-width': sk * 0.8, 'stroke-dasharray': dash }));
    }
    if (s.avatar_overlap) {
      const a = s.avatar_overlap;
      svg.appendChild(svgEl('rect', { x: a.x, y: a.y, width: a.width, height: a.height, fill: 'rgba(180,101,90,0.3)', stroke: '#B4655A', 'stroke-width': sk * 0.8 }));
      svg.appendChild(svgText(a.x + a.width / 2, a.y + a.height / 2 + fs * 0.35, '頭像遮擋', fs, '#E0A79C'));
    }
    if (s.safe_zone && s.safe_zone.shape === 'rect') {
      const z = s.safe_zone;
      svg.appendChild(svgEl('rect', { x: z.x, y: z.y, width: z.width, height: z.height, fill: 'rgba(127,163,122,0.16)', stroke: '#7FA37A', 'stroke-width': sk * 0.8, 'stroke-dasharray': dash }));
      svg.appendChild(svgText(z.x + z.width / 2, z.y + z.height / 2 + fs * 0.35, '安全區', fs, '#A8C3A3'));
    }
  }
  return svg;
}

function svgText(x, y, str, size, fill) {
  const t = svgEl('text', { x, y, 'text-anchor': 'middle', 'font-size': size, fill, 'font-family': 'Noto Sans TC, sans-serif', 'letter-spacing': '2' });
  t.textContent = str;
  return t;
}

/* ================= §6 裁切引擎 =================
   模型：
     baseScale = cover 所需縮放（zoom=1 時影像剛好填滿裁切框）
     zoom      ≥1，使用者放大倍率
     nx, ny    影像左上角相對裁切框的位移，以裁切框寬高為單位（-1 ~ 0 之間）
   位移一律正規化，視窗縮放後不會跑掉。
   ------------------------------------------------------------ */
function frameSize() {
  const r = $('canvasFrame').getBoundingClientRect();
  return { w: r.width, h: r.height };
}

function baseScale(asset, s) {
  const f = frameSize();
  return Math.max(f.w / asset.workW, f.h / asset.workH);
}

/* 依目前 transform 算出影像在裁切框中的顯示幾何（px） */
function layout(asset, s) {
  const f = frameSize();
  const sc = baseScale(asset, s) * asset.transform.zoom;
  const dw = asset.workW * sc, dh = asset.workH * sc;
  let ox = asset.transform.nx * f.w;
  let oy = asset.transform.ny * f.h;
  ox = clamp(ox, f.w - dw, 0);
  oy = clamp(oy, f.h - dh, 0);
  return { f, sc, dw, dh, ox, oy };
}

/* 目前取樣到的原圖區域（工作圖像素）。
   只用 transform 推導、不依賴畫面尺寸，確保預覽與輸出取到完全相同的區域。 */
function cropRect(asset, s) {
  const target = s.output.width / s.output.height;
  const iw = asset.workW, ih = asset.workH;
  const coverW = Math.min(iw, ih * target);          // zoom=1 時取樣寬度
  const sw = coverW / asset.transform.zoom;
  const sh = sw / target;
  return {
    sx: clamp(-asset.transform.nx * sw, 0, iw - sw),
    sy: clamp(-asset.transform.ny * sh, 0, ih - sh),
    sw, sh
  };
}

function setTransform(asset, patch) {
  Object.assign(asset.transform, patch);
  const L = layout(asset, currentSlot());
  asset.transform.nx = L.ox / L.f.w;
  asset.transform.ny = L.oy / L.f.h;
  asset.dirty = true;
}

const currentSlot = () => slotSpec(currentSlotId());

function applyTransform() {
  const asset = currentAsset();
  if (!asset) return;
  const s = currentSlot();
  const L = layout(asset, s);
  const img = $('sourceImg');
  img.style.width = L.dw + 'px';
  img.style.height = L.dh + 'px';
  img.style.left = L.ox + 'px';
  img.style.top = L.oy + 'px';
  refreshReadouts(s, asset);
}

let rafPending = false;
function scheduleApply() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; applyTransform(); });
}

/* ---- 置中重設 ---- */
function resetTransform(asset) {
  asset.transform = { zoom: 1, nx: 0, ny: 0 };
  const s = currentSlot();
  const f = frameSize();
  const sc = baseScale(asset, s);
  asset.transform.nx = (f.w - asset.workW * sc) / 2 / f.w;
  asset.transform.ny = (f.h - asset.workH * sc) / 2 / f.h;
  asset.dirty = true;
}

/* ---- 以焦點縮放 ---- */
function zoomAt(asset, newZoom, fx, fy) {
  const s = currentSlot();
  const before = layout(asset, s);
  newZoom = clamp(newZoom, 1, 4);
  const ratio = newZoom / asset.transform.zoom;
  const ox = fx - (fx - before.ox) * ratio;
  const oy = fy - (fy - before.oy) * ratio;
  asset.transform.zoom = newZoom;
  asset.transform.nx = ox / before.f.w;
  asset.transform.ny = oy / before.f.h;
  setTransform(asset, {});
  $('zoom').value = Math.round(newZoom * 100);
  $('zoomVal').textContent = Math.round(newZoom * 100) + '%';
}

/* ---- 指標互動：拖拉＋雙指縮放 ---- */
const pointers = new Map();
let dragStart = null;
let pinchStart = null;

const frameEl = $('canvasFrame');

frameEl.addEventListener('pointerdown', (e) => {
  const asset = currentAsset();
  if (!asset) return;
  frameEl.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const L = layout(asset, currentSlot());
  if (pointers.size === 1) {
    dragStart = { x: e.clientX, y: e.clientY, ox: L.ox, oy: L.oy };
    frameEl.classList.add('grabbing');
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: asset.transform.zoom };
    dragStart = null;
  }
});

frameEl.addEventListener('pointermove', (e) => {
  const asset = currentAsset();
  if (!asset || !pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const r = frameEl.getBoundingClientRect();
    zoomAt(asset, pinchStart.zoom * (dist / pinchStart.dist),
      (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    scheduleApply();
    return;
  }
  if (dragStart) {
    const f = frameSize();
    setTransform(asset, {
      nx: (dragStart.ox + (e.clientX - dragStart.x)) / f.w,
      ny: (dragStart.oy + (e.clientY - dragStart.y)) / f.h
    });
    scheduleApply();
  }
});

/* 只認 up/cancel：已 setPointerCapture，指標移出框外仍會收到 pointerup；
   若連 pointerleave 也結束拖曳，捕捉當下就可能被誤判為放開。 */
['pointerup', 'pointercancel'].forEach((ev) =>
  frameEl.addEventListener(ev, (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) { dragStart = null; frameEl.classList.remove('grabbing'); }
  }));

frameEl.addEventListener('wheel', (e) => {
  const asset = currentAsset();
  if (!asset) return;
  e.preventDefault();
  const r = frameEl.getBoundingClientRect();
  zoomAt(asset, asset.transform.zoom * (e.deltaY > 0 ? 0.94 : 1.06), e.clientX - r.left, e.clientY - r.top);
  scheduleApply();
}, { passive: false });

new ResizeObserver(() => { if (state.screen === 'crop') scheduleApply(); }).observe(frameEl);

/* ================= §7 裁切畫面 ================= */
function renderCrop() {
  const s = currentSlot();
  const asset = currentAsset();

  $('cropTitle').textContent = `${platformSpec().display_name}　${s.display_name}`;
  renderSlotTabs();
  const frame = $('canvasFrame');
  frame.style.aspectRatio = `${s.output.width} / ${s.output.height}`;
  // 高版位（頭像 1:1）會撐爆螢幕：高度封頂 --frame-cap（桌面 60vh、手機 42vh），寬度照比例縮
  frame.style.width = `min(100%, calc(var(--frame-cap, 60vh) * ${(s.output.width / s.output.height).toFixed(4)}))`;

  const img = $('sourceImg');
  if (asset) {
    img.src = asset.url;
    img.hidden = false;
    $('dropzone').hidden = true;
    $('controls').hidden = false;
    $('zoom').disabled = false;
    $('btnReset').disabled = false;
    $('zoom').value = Math.round(asset.transform.zoom * 100);
    $('zoomVal').textContent = Math.round(asset.transform.zoom * 100) + '%';
    applyTransform();
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    $('dropzone').hidden = false;
    $('controls').hidden = true;
  }

  // 下一步按鈕：不是最後一個版位就標明接下來編輯什麼
  $('btnToNext').textContent = state.cursor < state.queue.length - 1
    ? `下一步：編輯${slotSpec(state.queue[state.cursor + 1]).display_name}`
    : '前往舞台預覽';

  renderGuides(s);
  renderGuideToggles(s);
  renderPanelStatic(s);
  refreshReadouts(s, asset);
}

/* 版位切換籤：完整部署時可在大頭照／橫幅之間來回編輯 */
function renderSlotTabs() {
  const box = $('slotTabs');
  box.innerHTML = '';
  if (state.queue.length < 2) return;
  state.queue.forEach((slotId, i) => {
    const s = slotSpec(slotId);
    const b = el('button', 'stab' + (i === state.cursor ? ' on' : ''));
    b.appendChild(el('span', null, '編輯' + s.display_name));
    if (state.assets[slotId]) b.appendChild(el('i', 'ok', '✓'));
    b.addEventListener('click', () => {
      if (i === state.cursor) return;
      state.cursor = i;
      renderCrop();
    });
    box.appendChild(b);
  });
}

function renderGuides(s) {
  const svg = $('canvasGuides');
  svg.setAttribute('viewBox', `0 0 ${s.output.width} ${s.output.height}`);
  svg.innerHTML = '';
  const W = s.output.width, H = s.output.height;
  // 線寬與字級以 viewBox 寬度換算：橫幅 1584 寬在手機縮到兩成，固定線寬會細到看不見
  const sk = Math.max(2.5, W / 200);
  const fs = Math.round(Math.max(Math.min(W, H) * 0.045, W * 0.03));
  const dash = `${(sk * 5).toFixed(0)} ${(sk * 4).toFixed(0)}`;
  const TONE = { danger: '#B4655A', warn: '#C9A96E', safe: '#7FA37A', info: '#8B7D6B' };

  s.guides.forEach((g) => {
    if (state.guidesOn[g.id] === false) return;
    const col = TONE[g.tone] || TONE.info;
    const geo = g.geometry;
    if (g.kind === 'circle_mask') {
      svg.appendChild(svgEl('path', {
        d: `M0,0 H${W} V${H} H0 Z M${geo.cx},${geo.cy - geo.r} a${geo.r},${geo.r} 0 1,0 0.01,0 Z`,
        fill: 'rgba(20,16,11,0.66)', 'fill-rule': 'evenodd'
      }));
      svg.appendChild(svgEl('circle', { cx: geo.cx, cy: geo.cy, r: geo.r, fill: 'none', stroke: '#A88A5C', 'stroke-width': sk * 1.1 }));
    } else if (g.kind === 'circle') {
      svg.appendChild(svgEl('circle', { cx: geo.cx, cy: geo.cy, r: geo.r, fill: 'none', stroke: col, 'stroke-width': sk, 'stroke-dasharray': dash }));
    } else if (g.kind === 'rect') {
      svg.appendChild(svgEl('rect', {
        x: geo.x, y: geo.y, width: geo.width, height: geo.height,
        fill: g.tone === 'danger' ? 'rgba(180,101,90,0.28)' : 'rgba(127,163,122,0.16)',
        stroke: col, 'stroke-width': sk,
        'stroke-dasharray': g.tone === 'safe' ? dash : 'none'
      }));
      svg.appendChild(svgText(geo.x + geo.width / 2, geo.y + geo.height / 2 + fs * 0.35, g.label, fs, col));
    } else if (g.kind === 'outside_rect') {
      svg.appendChild(svgEl('rect', { x: 0, y: 0, width: geo.x, height: H, fill: 'rgba(20,16,11,0.72)' }));
      svg.appendChild(svgEl('rect', { x: geo.x + geo.width, y: 0, width: W - geo.x - geo.width, height: H, fill: 'rgba(20,16,11,0.72)' }));
      svg.appendChild(svgEl('rect', { x: geo.x + 1, y: 1, width: geo.width - 2, height: H - 2, fill: 'none', stroke: col, 'stroke-width': sk * 0.85, 'stroke-dasharray': dash }));
      svg.appendChild(svgText(geo.x / 2, H / 2, '手機裁掉', Math.round(fs * 0.8), col));
    } else if (g.kind === 'crosshair') {
      svg.appendChild(svgEl('line', { x1: geo.cx, y1: 0, x2: geo.cx, y2: H, stroke: col, 'stroke-width': sk * 0.55, 'stroke-dasharray': dash }));
      svg.appendChild(svgEl('line', { x1: 0, y1: geo.cy, x2: W, y2: geo.cy, stroke: col, 'stroke-width': sk * 0.55, 'stroke-dasharray': dash }));
    }
  });
}

function renderGuideToggles(s) {
  const box = $('guideToggles');
  box.innerHTML = '';
  s.guides.forEach((g) => {
    if (state.guidesOn[g.id] === undefined) state.guidesOn[g.id] = g.default_on !== false;
    const b = el('button', 'gt' + (state.guidesOn[g.id] ? ' on' : ''));
    b.dataset.tone = g.tone;
    b.title = g.description || '';
    b.appendChild(el('span', 'sw-dot'));
    b.appendChild(el('span', null, g.label));
    b.addEventListener('click', () => {
      state.guidesOn[g.id] = !state.guidesOn[g.id];
      renderGuides(s);
      renderGuideToggles(s);
    });
    box.appendChild(b);
  });
}

function renderPanelStatic(s) {
  $('pnlPurpose').textContent = s.card.purpose;
  const good = $('pnlGood'); good.innerHTML = '';
  s.card.good_for.forEach((t) => good.appendChild(el('li', null, t)));
  const avoid = $('pnlAvoid'); avoid.innerHTML = '';
  s.card.avoid.forEach((t) => avoid.appendChild(el('li', null, t)));
  const adv = $('pnlAdvice'); adv.innerHTML = '';
  s.advice.forEach((t) => adv.appendChild(el('li', null, t)));
  $('resOutput').textContent = `${s.output.width} × ${s.output.height}`;
  buildMiniPreviews(s);
}

/* ---- 隨拖拉即時更新的讀數與預覽 ---- */
function refreshReadouts(s, asset) {
  if (!asset) {
    $('resSource').textContent = '－';
    $('resEffective').textContent = '－';
    setStatus('idle', '尚未上傳照片', '上傳後立即判斷這張照片是否撐得起這個版位。');
    $('btnToNext').disabled = true;
    drawMiniPreviews(s, null);
    return;
  }
  $('resSource').textContent = `${asset.naturalW} × ${asset.naturalH}` + (asset.downsampled ? '（已降採樣處理）' : '');
  const c = cropRect(asset, s);
  const effW = Math.round(c.sw * asset.srcRatio);
  const effH = Math.round(c.sh * asset.srcRatio);
  $('resEffective').textContent = `${effW} × ${effH}`;
  const r = judge(effW, s);
  setStatus(r.tone, r.label, r.msg);
  $('btnToNext').disabled = false;
  drawMiniPreviews(s, asset);
}

function judge(effW, s) {
  const t = s.resolution_tiers;
  const st = SPECS.index.resolution_status;
  const need = s.output.width;
  if (effW >= t.good) return { tone: st.good.tone, label: st.good.label, msg: `裁切後有效寬度 ${effW}px，足以支撐 ${need}px 的輸出，平台縮圖後仍然清楚。` };
  if (effW >= t.acceptable) return { tone: st.acceptable.tone, label: st.acceptable.label, msg: `裁切後只保留 ${effW}px，此版位建議至少 ${need}px。手機可接受，桌面可能略糊。請減少放大比例，或更換原始檔。` };
  if (effW >= t.poor) return { tone: st.poor.tone, label: st.poor.label, msg: `裁切後只保留 ${effW}px，低於此版位建議的 ${need}px。請減少放大比例，或更換解析度更高的原始檔。` };
  return { tone: st.unusable.tone, label: st.unusable.label, msg: `裁切後只保留 ${effW}px，低於最低需求 ${s.minimum_effective.width}px。請減少放大比例，或更換原始檔。` };
}

function setStatus(tone, label, msg) {
  const chip = $('statusChip');
  chip.dataset.tone = tone;
  chip.textContent = label;
  $('statusMsg').textContent = msg;
}

/* ---- 即時成品預覽（canvas，畫的是真正的裁切結果） ---- */
let miniCanvases = [];
function buildMiniPreviews(s) {
  const box = $('miniPreviews');
  box.innerHTML = '';
  miniCanvases = [];
  const circle = s.display_shape === 'circle';
  const sizes = circle ? (platformSpec().stage.small_preview_sizes || [96, 48, 32]) : [240];
  // 手機縮小顯示尺寸（標註維持平台實際 px）
  const scale = window.matchMedia('(max-width: 640px)').matches ? 0.72 : 1;

  sizes.forEach((px) => {
    const w = Math.round(px * scale);
    const h = circle ? w : Math.round(w * s.output.height / s.output.width);
    const m = el('div', 'mini');
    const cv = document.createElement('canvas');
    cv.className = 'box' + (circle ? ' circle' : '');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    m.appendChild(cv);
    m.appendChild(el('div', 'cap', circle ? `${px}px` : '橫幅'));
    box.appendChild(m);
    miniCanvases.push(cv);
  });
}

function drawMiniPreviews(s, asset) {
  miniCanvases.forEach((cv) => {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#0D0A07';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!asset) return;
    const c = cropRect(asset, s);
    ctx.drawImage(asset.img, c.sx, c.sy, c.sw, c.sh, 0, 0, cv.width, cv.height);
  });
}

/* ---- 上傳 ---- */
const dropzone = $('dropzone');
const filePicker = $('filePicker');

dropzone.addEventListener('click', () => filePicker.click());
$('btnReplace').addEventListener('click', () => filePicker.click());
['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', (e) => { if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
filePicker.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  filePicker.value = '';
});

async function handleFile(file) {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);

  if (file.size > MAX_FILE_BYTES) {
    setStatus('danger', '檔案過大', `單檔上限 ${MAX_FILE_MB}MB，這個檔案 ${(file.size / 1048576).toFixed(1)}MB。請改用稍小的版本。`);
    return;
  }
  if (!isHeic && file.type && !ACCEPT_TYPES.includes(file.type)) {
    setStatus('danger', '格式不支援', '支援 JPG／PNG／WebP／HEIC。請確認檔案格式後再試一次。');
    return;
  }

  let blob = file;
  if (isHeic && !(await canDecode(file))) {
    setStatus('warn', 'HEIC 轉檔中', '這台裝置的瀏覽器無法直接讀取 HEIC，正在本機轉檔，請稍候。');
    try { blob = await convertHeic(file); }
    catch (err) {
      setStatus('danger', 'HEIC 轉檔失敗', '請在 iPhone 相簿選擇「編輯後拷貝」輸出 JPG，或改用雲端交付的原始 JPG 檔。');
      return;
    }
  }

  let img;
  try { img = await decodeImage(blob); }
  catch (err) {
    setStatus('danger', '圖片無法讀取', '檔案可能已損壞或不是有效的影像。請更換檔案再試一次。');
    return;
  }

  const slot = currentSlotId();
  const prev = state.assets[slot];
  if (prev && prev.url) URL.revokeObjectURL(prev.url);

  // 超大圖降採樣成工作圖（避免 iOS canvas 面積上限）；原始尺寸照實顯示
  const natW = img.naturalWidth, natH = img.naturalHeight;
  let work = img, workW = natW, workH = natH, downsampled = false;
  if (natW * natH > MAX_WORK_PIXELS) {
    const k = Math.sqrt(MAX_WORK_PIXELS / (natW * natH));
    workW = Math.round(natW * k); workH = Math.round(natH * k);
    const cv = document.createElement('canvas');
    cv.width = workW; cv.height = workH;
    cv.getContext('2d').drawImage(img, 0, 0, workW, workH);
    work = cv;
    downsampled = true;
  }

  state.assets[slot] = {
    img: work,
    url: URL.createObjectURL(blob),
    naturalW: natW, naturalH: natH,
    workW, workH,
    srcRatio: natW / workW,     // 工作圖像素 → 原始像素的換算
    downsampled,
    transform: { zoom: 1, nx: 0, ny: 0 },
    dirty: true
  };

  track('deploy_upload', { platform: state.platform, slot, w: natW, h: natH });
  renderCrop();
  resetTransform(state.assets[slot]);   // 置中；同步做，不等 rAF（分頁在背景時 rAF 不會觸發）
  applyTransform();
}

function decodeImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => { res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    im.src = url;
  });
}
function canDecode(file) {
  return decodeImage(file).then(() => true).catch(() => false);
}

let heicLoading = null;
function loadHeicLib() {
  if (window.heic2any) return Promise.resolve();
  if (heicLoading) return heicLoading;
  heicLoading = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = HEIC_LIB;
    sc.onload = res; sc.onerror = rej;
    document.head.appendChild(sc);
  });
  return heicLoading;
}
async function convertHeic(file) {
  await loadHeicLib();
  const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  return Array.isArray(out) ? out[0] : out;
}

/* ---- 裁切頁按鈕 ---- */
$('btnBackPick').addEventListener('click', () => go('pick'));
$('btnToNext').addEventListener('click', () => {
  const asset = currentAsset();
  const s = currentSlot();
  const c = cropRect(asset, s);
  track('deploy_crop_done', {
    platform: state.platform, slot: currentSlotId(),
    zoom: Math.round(asset.transform.zoom * 100),
    effective_w: Math.round(c.sw * asset.srcRatio)
  });
  if (state.cursor < state.queue.length - 1) {
    state.cursor++;
    renderCrop();
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    go('stage');
  }
});
$('btnReset').addEventListener('click', () => {
  const a = currentAsset();
  if (!a) return;
  resetTransform(a);
  $('zoom').value = 100;
  $('zoomVal').textContent = '100%';
  applyTransform();
});
$('zoom').addEventListener('input', (e) => {
  const a = currentAsset();
  if (!a) return;
  const f = frameSize();
  zoomAt(a, Number(e.target.value) / 100, f.w / 2, f.h / 2);
  scheduleApply();
});

/* ================= §8 舞台畫面 ================= */
document.querySelectorAll('.sw').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.sw').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    state.stageView = b.dataset.view;
    renderStage();
  });
});
$('fieldName').addEventListener('input', (e) => { state.name = e.target.value; renderStage(); });
$('fieldHeadline').addEventListener('input', (e) => { state.headline = e.target.value; renderStage(); });
$('chkCompare').addEventListener('change', (e) => { state.compare = e.target.checked; renderStage(); });

/* 舞台與下載都用真正的裁切結果，不是原圖 */
function croppedDataURL(slotId, maxW) {
  const asset = state.assets[slotId];
  if (!asset) return null;
  const s = slotSpec(slotId);
  const key = 'preview_' + maxW;
  if (!asset.dirty && asset[key]) return asset[key];
  const w = Math.min(maxW, s.output.width);
  const h = Math.round(w * s.output.height / s.output.width);
  asset[key] = renderCropCanvas(slotId, w, h).toDataURL('image/jpeg', 0.9);
  return asset[key];
}

function renderCropCanvas(slotId, w, h) {
  const asset = state.assets[slotId];
  const s = slotSpec(slotId);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const c = cropRect(asset, s);
  ctx.drawImage(asset.img, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
  return cv;
}

function renderStage() {
  const cfg = platformSpec().stage;
  const area = $('stageArea');
  area.innerHTML = '';
  const views = state.compare ? ['desktop', 'mobile'] : [state.stageView];
  views.forEach((v) => area.appendChild(mockProfile(cfg, v)));
  $('stageNote').textContent = cfg.disclaimer;
  state.queue.forEach((slot) => { const a = state.assets[slot]; if (a) a.dirty = false; });
  track('deploy_stage_view', { platform: state.platform, view: state.stageView, compare: state.compare });
}

function mockProfile(cfg, view) {
  const c = cfg[view];
  const bannerSpec = slotSpec('banner');
  const avatarUrl = croppedDataURL('avatar', 400);
  const bannerUrl = croppedDataURL('banner', 1200);

  const wrapEl = el('div', 'mock-wrap');
  const card = el('div', 'mock' + (view === 'mobile' ? ' phone' : ''));

  const band = el('div', 'mock-banner');
  band.style.aspectRatio = view === 'mobile'
    ? `${Math.round(bannerSpec.output.width * c.banner_visible_ratio)} / ${bannerSpec.output.height}`
    : `${bannerSpec.output.width} / ${bannerSpec.output.height}`;
  if (bannerUrl) {
    const i = el('img'); i.src = bannerUrl; i.alt = ''; band.appendChild(i);
  } else {
    band.appendChild(el('div', 'ph-fill', '尚未設定橫幅'));
  }

  const av = el('div', 'mock-avatar');
  av.style.width = (c.avatar_diameter_ratio * 100) + '%';
  av.style.aspectRatio = '1 / 1';
  av.style.left = (c.avatar_left_ratio * 100) + '%';
  av.style.top = '100%';
  av.style.transform = `translateY(${-c.avatar_overlap_ratio * 100}%)`;
  if (avatarUrl) { const i = el('img'); i.src = avatarUrl; i.alt = ''; av.appendChild(i); }
  band.appendChild(av);
  card.appendChild(band);

  const body = el('div', 'mock-body');
  body.style.paddingTop = `calc(${(c.avatar_diameter_ratio * (1 - c.avatar_overlap_ratio) * 100).toFixed(2)}% + 0.8rem)`;
  body.appendChild(el('div', 'mock-name', state.name.trim() || cfg.placeholder.name));
  body.appendChild(el('div', 'mock-headline', state.headline.trim() || cfg.placeholder.headline));
  body.appendChild(el('div', 'mock-meta', cfg.placeholder.meta));
  const btns = el('div', 'mock-btns');
  ['建立關係', '訊息', '更多'].forEach((t) => btns.appendChild(el('i', null, t)));
  body.appendChild(btns);
  card.appendChild(body);

  wrapEl.appendChild(card);
  wrapEl.appendChild(el('div', 'mock-cap', view === 'desktop' ? 'Desktop' : 'Mobile'));
  return wrapEl;
}

$('btnBackCrop').addEventListener('click', () => { state.cursor = 0; go('crop'); });
$('btnToExport').addEventListener('click', () => go('export'));

/* ================= §9 輸出引擎 ================= */
function exportSlotBlob(slotId) {
  const s = slotSpec(slotId);
  const cv = renderCropCanvas(slotId, s.output.width, s.output.height);
  return new Promise((res) => cv.toBlob(res, s.output.file_format, s.output.quality));
}

/* 舞台預覽圖：把桌面版位關係畫成一張可交付的圖 */
async function exportStageBlob() {
  const cfg = platformSpec().stage;
  const c = cfg.desktop;
  const bSpec = slotSpec('banner');
  const W = 1600;
  const bandH = Math.round(W * bSpec.output.height / bSpec.output.width);
  const avD = Math.round(W * c.avatar_diameter_ratio);
  const avL = Math.round(W * c.avatar_left_ratio);
  const below = Math.round(avD * (1 - c.avatar_overlap_ratio));
  const bodyH = below + 190;
  const H = bandH + bodyH;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1C1710';
  ctx.fillRect(0, 0, W, H);

  if (state.assets.banner) {
    const bc = renderCropCanvas('banner', W, bandH);
    ctx.drawImage(bc, 0, 0);
  } else {
    ctx.fillStyle = '#0D0A07';
    ctx.fillRect(0, 0, W, bandH);
  }

  if (state.assets.avatar) {
    const ac = renderCropCanvas('avatar', avD, avD);
    const cx = avL + avD / 2;
    const cy = bandH - avD * c.avatar_overlap_ratio + avD / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, avD / 2 + 5, 0, Math.PI * 2);
    ctx.fillStyle = '#1C1710';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, avD / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(ac, avL, cy - avD / 2, avD, avD);
    ctx.restore();
  }

  try { await document.fonts.ready; } catch (e) { /* 字型未就緒不影響輸出 */ }
  const baseY = bandH + below + 56;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F5F1E8';
  ctx.font = '400 42px "Noto Serif TC", serif';
  ctx.fillText(state.name.trim() || cfg.placeholder.name, avL, baseY);
  ctx.fillStyle = '#CFC5B4';
  ctx.font = '400 24px "Noto Serif TC", serif';
  ctx.fillText(state.headline.trim() || cfg.placeholder.headline, avL, baseY + 44);
  ctx.fillStyle = '#8B7D6B';
  ctx.font = '400 19px "Noto Sans TC", sans-serif';
  ctx.fillText(cfg.disclaimer, avL, H - 26);

  return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
}

function readmeText() {
  const spec = platformSpec();
  const lines = [];
  lines.push('CHUN.EN 影像部署模擬器｜輸出說明');
  lines.push('');
  lines.push(`平台：${spec.display_name}`);
  lines.push(`規格版本：${spec.version}（規格組 ${SPECS.index.bundle_version}）`);
  lines.push(`輸出日期：${todayStamp()}`);
  lines.push(`資料來源：${SPECS.index.source}`);
  lines.push('');
  lines.push('── 檔案 ──');
  state.queue.forEach((slotId) => {
    const s = slotSpec(slotId);
    const a = state.assets[slotId];
    const c = a ? cropRect(a, s) : null;
    lines.push(`${fillTemplate(s.naming.template, s.naming.fallback_name, state.name)}.${s.output.extension}`);
    lines.push(`  版位：${s.display_name}　輸出：${s.output.width}×${s.output.height}（${s.output.aspect_ratio}）`);
    if (c) lines.push(`  裁切後有效像素：${Math.round(c.sw * a.srcRatio)}×${Math.round(c.sh * a.srcRatio)}（原始檔 ${a.naturalW}×${a.naturalH}）`);
    lines.push('');
  });
  lines.push(`${fillTemplate(spec.export.preview_naming.template, spec.export.preview_naming.fallback_name, state.name)}.jpg`);
  lines.push('  舞台預覽圖（版位模擬，非平台實際截圖）');
  lines.push('');
  lines.push('── 使用建議 ──');
  state.queue.forEach((slotId) => {
    const s = slotSpec(slotId);
    lines.push(`【${s.display_name}】`);
    lines.push(`用途：${s.card.purpose}`);
    lines.push(`主體位置：${s.card.subject_position}`);
    s.advice.forEach((t) => lines.push(`・${t}`));
    lines.push('');
  });
  lines.push('── 上傳說明 ──');
  lines.push('1. 請直接上傳本次輸出的檔案，畫質最完整。');
  lines.push('2. 平台會自行縮圖，上傳大圖畫質最好。');
  lines.push('3. 各平台規格會不定期改版，若顯示與預期不同，請回到模擬器確認最新規格版本。');
  lines.push('');
  lines.push(spec.stage.disclaimer);
  lines.push('');
  lines.push('© 2026 CHUN.EN 形象美學');
  return lines.join('\r\n');
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---- 極簡 ZIP（store，不壓縮）：JPG 本來就壓過了，省一個外部相依 ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
}
function buildZip(entries) {
  const enc = new TextEncoder();
  const now = new Date();
  const t = dosTime(now), dt = dosDate(now);
  const chunks = [];
  const central = [];
  let offset = 0;

  entries.forEach((e) => {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);      // UTF-8 檔名
    lh.setUint16(8, 0, true);           // store
    lh.setUint16(10, t, true);
    lh.setUint16(12, dt, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, e.data.length, true);
    lh.setUint32(22, e.data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, e.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, t, true);
    ch.setUint16(14, dt, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, e.data.length, true);
    ch.setUint32(24, e.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + e.data.length;
  });

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(8, entries.length, true);
  eo.setUint16(10, entries.length, true);
  eo.setUint32(12, centralSize, true);
  eo.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(eo.buffer)], { type: 'application/zip' });
}

/* ================= §10 下載畫面 ================= */
function renderExport() {
  const spec = platformSpec();
  const list = $('fileList');
  list.innerHTML = '';

  state.queue.forEach((slotId) => {
    const s = slotSpec(slotId);
    const a = state.assets[slotId];
    const fname = fillTemplate(s.naming.template, s.naming.fallback_name, state.name) + '.' + s.output.extension;
    const li = el('li');
    const left = el('div');
    left.appendChild(el('div', 'fn', fname));
    const c = a ? cropRect(a, s) : null;
    left.appendChild(el('div', 'fm',
      `${s.output.width} × ${s.output.height}　規格版本 ${s.version}` +
      (c ? `　有效像素 ${Math.round(c.sw * a.srcRatio)}px` : '')));
    li.appendChild(left);
    if (a) {
      const b = el('button', 'btn btn-ghost sm', '下載');
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = '輸出中';
        saveBlob(await exportSlotBlob(slotId), fname);
        b.disabled = false; b.textContent = '下載';
        track('deploy_download', { platform: state.platform, slot: slotId, kind: 'single' });
      });
      li.appendChild(b);
    } else {
      li.appendChild(el('span', 'fm', '未上傳'));
    }
    list.appendChild(li);
  });

  const pname = fillTemplate(spec.export.preview_naming.template, spec.export.preview_naming.fallback_name, state.name) + '.jpg';
  const li = el('li');
  const left = el('div');
  left.appendChild(el('div', 'fn', pname));
  left.appendChild(el('div', 'fm', '舞台預覽圖（版位模擬）'));
  li.appendChild(left);
  const pb = el('button', 'btn btn-ghost sm', '下載');
  pb.disabled = !allSlotsReady();
  pb.addEventListener('click', async () => {
    pb.disabled = true; pb.textContent = '輸出中';
    saveBlob(await exportStageBlob(), pname);
    pb.disabled = false; pb.textContent = '下載';
    track('deploy_download', { platform: state.platform, kind: 'preview' });
  });
  li.appendChild(pb);
  list.appendChild(li);

  const ready = allSlotsReady();
  $('btnDlAll').disabled = !ready;
  $('btnDlZip').disabled = !ready;
  if (ready) track('deploy_export_view', { platform: state.platform, mode: state.mode });
}

$('btnDlAll').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true; b.textContent = '輸出中';
  for (const slotId of state.queue) {
    const s = slotSpec(slotId);
    saveBlob(await exportSlotBlob(slotId),
      fillTemplate(s.naming.template, s.naming.fallback_name, state.name) + '.' + s.output.extension);
    await new Promise((r) => setTimeout(r, 300));
  }
  const spec = platformSpec();
  saveBlob(await exportStageBlob(),
    fillTemplate(spec.export.preview_naming.template, spec.export.preview_naming.fallback_name, state.name) + '.jpg');
  b.disabled = false; b.textContent = '全部下載';
  track('deploy_download', { platform: state.platform, kind: 'all' });
});

$('btnDlZip').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true; b.textContent = '打包中';
  try {
    const spec = platformSpec();
    const entries = [];
    for (const slotId of state.queue) {
      const s = slotSpec(slotId);
      const blob = await exportSlotBlob(slotId);
      entries.push({
        name: fillTemplate(s.naming.template, s.naming.fallback_name, state.name) + '.' + s.output.extension,
        data: new Uint8Array(await blob.arrayBuffer())
      });
    }
    const pv = await exportStageBlob();
    entries.push({
      name: fillTemplate(spec.export.preview_naming.template, spec.export.preview_naming.fallback_name, state.name) + '.jpg',
      data: new Uint8Array(await pv.arrayBuffer())
    });
    entries.push({ name: '使用說明與規格版本.txt', data: new TextEncoder().encode('﻿' + readmeText()) });

    saveBlob(buildZip(entries),
      fillTemplate(spec.export.zip_naming.template, spec.export.zip_naming.fallback_name, state.name) + '.zip');
    track('deploy_download', { platform: state.platform, kind: 'zip', mode: state.mode });
  } catch (err) {
    alert('打包失敗，請改用「全部下載」逐檔取得。');
  }
  b.disabled = false; b.textContent = '下載 ZIP（含舞台預覽與使用建議）';
});

/* ================= §11 啟動 ================= */
/* 成品預覽＋解析度檢查：桌面放右欄頂端，手機移到裁切框正下方（同一畫面內看得到） */
const liveMQ = window.matchMedia('(max-width: 1080px)');
function placeLiveWrap() {
  const lw = $('liveWrap');
  if (liveMQ.matches) {
    $('controls').after(lw);
    lw.classList.add('inline');
  } else {
    document.querySelector('.crop-panel').prepend(lw);
    lw.classList.remove('inline');
  }
  // 跨過斷點時重建成品預覽（顯示尺寸隨版型縮放）
  if (state.screen === 'crop' && state.queue.length) {
    const s = currentSlot();
    buildMiniPreviews(s);
    drawMiniPreviews(s, currentAsset());
  }
}
liveMQ.addEventListener('change', placeLiveWrap);
window.addEventListener('resize', placeLiveWrap);   // 部分環境 matchMedia change 不觸發，resize 兜底

window.addEventListener('beforeunload', (e) => {
  if (Object.keys(state.assets).length && state.screen !== 'pick') {
    e.preventDefault();
    e.returnValue = '';
  }
});

(async function init() {
  try {
    await loadSpecs();
  } catch (err) {
    document.querySelector('#screen-pick .wrap').appendChild(
      el('p', 'engine-todo', '規格檔載入失敗。請以本機伺服器開啟（file:// 無法讀取 JSON），或確認 specs/ 目錄已部署。'));
    return;
  }
  placeLiveWrap();
  renderPicker();
  go('pick');
  track('deploy_open', { platform: state.platform });
})();
