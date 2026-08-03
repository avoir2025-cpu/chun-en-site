/* ============================================================
   CHUN.EN Visual OS｜Deploy — 影像部署模擬器 P0
   純前端、零後端。照片全程不離開瀏覽器。
   ------------------------------------------------------------
   本檔分區：
     §1 工具         §2 規格載入      §3 狀態
     §4 路由／步驟   §5 版位選擇畫面  §6 裁切畫面（疊層由規格 JSON 驅動）
     §7 舞台畫面     §8 下載畫面      §9 啟動
   裁切引擎（拖拉／縮放／Canvas 輸出）在 §6 標示 [ENGINE] 處接手。
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

const MAX_FILE_BYTES = 40 * 1024 * 1024;
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
const modeSpec = () => platformSpec().modes.find((m) => m.id === state.mode);

/* ================= §3 狀態 ================= */
const state = {
  screen: 'pick',
  platform: 'linkedin',
  mode: null,
  queue: [],        // 本次要處理的版位順序，例：['avatar','banner']
  cursor: 0,        // queue 索引
  assets: {},       // slot -> { file, url, naturalW, naturalH, transform }
  guidesOn: {},     // guideId -> bool
  stageView: 'desktop',
  compare: false,
  name: '',
  headline: ''
};

const currentSlotId = () => state.queue[state.cursor];
const currentAsset = () => state.assets[currentSlotId()];
const allSlotsReady = () => state.queue.every((s) => state.assets[s]);

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
  btn.addEventListener('click', () => {
    if (btn.classList.contains('done')) go(btn.dataset.goto);
  });
});

/* ================= §5 版位選擇畫面 ================= */
function renderPicker() {
  // --- 平台列 ---
  const row = $('platformRow');
  row.innerHTML = '';
  SPECS.index.platforms.forEach((p) => {
    const b = el('button', 'plat' + (p.id === state.platform ? ' on' : ''));
    b.appendChild(el('span', null, p.display_name));
    b.appendChild(el('span', 'ph', p.is_active ? p.phase : '即將開放'));
    b.disabled = !p.is_active;
    b.title = p.tagline || '';
    b.addEventListener('click', () => {
      state.platform = p.id;
      state.mode = null;
      renderPicker();
    });
    row.appendChild(b);
  });

  const spec = platformSpec();

  // --- 版位模式 ---
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

  // --- 版位卡 ---
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
  const rows = [
    ['建議照片', s.card.shot_type],
    ['主體位置', s.card.subject_position],
    ['頭像遮擋', s.card.has_overlap ? '有，左下角約 568×264' : '無'],
    ['顯示形狀', s.display_shape === 'circle' ? '圓形（四角會被切掉）' : '矩形']
  ];
  rows.forEach(([k, v]) => {
    const d = el('div');
    d.appendChild(el('span', null, k));
    d.appendChild(el('p', null, v));
    meta.appendChild(d);
  });
  c.appendChild(meta);
  c.appendChild(el('p', 'sc-ver', `規格版本 ${s.version}`));
  return c;
}

/* 版位示意圖：由規格座標直接畫，不另外備圖檔 */
function diagramFor(s) {
  const W = s.output.width, H = s.output.height;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${s.display_name} 版位示意` });
  const fs = Math.round(Math.min(W, H) * 0.055);

  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#0D0A07', stroke: 'rgba(245,241,232,0.16)', 'stroke-width': 2 }));

  if (s.display_shape === 'circle') {
    const g = s.guides.find((x) => x.id === 'circle_mask');
    if (g) {
      svg.appendChild(svgEl('path', {
        d: `M0,0 H${W} V${H} H0 Z M${g.geometry.cx},${g.geometry.cy - g.geometry.r} a${g.geometry.r},${g.geometry.r} 0 1,0 0.01,0 Z`,
        fill: 'rgba(180,101,90,0.28)', 'fill-rule': 'evenodd'
      }));
      svg.appendChild(svgEl('circle', {
        cx: g.geometry.cx, cy: g.geometry.cy, r: g.geometry.r,
        fill: 'none', stroke: '#A88A5C', 'stroke-width': 3
      }));
    }
    const sub = s.guides.find((x) => x.id === 'subject_zone');
    if (sub) svg.appendChild(svgEl('circle', {
      cx: sub.geometry.cx, cy: sub.geometry.cy, r: sub.geometry.r,
      fill: 'none', stroke: '#7FA37A', 'stroke-width': 2, 'stroke-dasharray': '14 12'
    }));
  } else {
    if (s.mobile_crop) {
      const m = s.mobile_crop;
      svg.appendChild(svgEl('rect', { x: 0, y: 0, width: m.x, height: H, fill: 'rgba(20,16,11,0.72)' }));
      svg.appendChild(svgEl('rect', { x: m.x + m.width, y: 0, width: W - m.x - m.width, height: H, fill: 'rgba(20,16,11,0.72)' }));
      svg.appendChild(svgEl('rect', { x: m.x, y: 1, width: m.width, height: H - 2, fill: 'none', stroke: '#C9A96E', 'stroke-width': 2, 'stroke-dasharray': '12 10' }));
    }
    if (s.avatar_overlap) {
      const a = s.avatar_overlap;
      svg.appendChild(svgEl('rect', { x: a.x, y: a.y, width: a.width, height: a.height, fill: 'rgba(180,101,90,0.3)', stroke: '#B4655A', 'stroke-width': 2 }));
      svg.appendChild(text(a.x + a.width / 2, a.y + a.height / 2 + fs * 0.35, '頭像遮擋', fs, '#E0A79C'));
    }
    if (s.safe_zone && s.safe_zone.shape === 'rect') {
      const z = s.safe_zone;
      svg.appendChild(svgEl('rect', { x: z.x, y: z.y, width: z.width, height: z.height, fill: 'rgba(127,163,122,0.14)', stroke: '#7FA37A', 'stroke-width': 2, 'stroke-dasharray': '12 10' }));
      svg.appendChild(text(z.x + z.width / 2, z.y + z.height / 2 + fs * 0.35, '安全區', fs, '#A8C3A3'));
    }
  }
  return svg;
}

function text(x, y, str, size, fill) {
  const t = svgEl('text', { x, y, 'text-anchor': 'middle', 'font-size': size, fill, 'font-family': 'Noto Sans TC, sans-serif', 'letter-spacing': '2' });
  t.textContent = str;
  return t;
}

/* ================= §6 裁切畫面 ================= */
function renderCrop() {
  const s = slotSpec(currentSlotId());
  const asset = currentAsset();

  $('cropTitle').textContent = `${platformSpec().display_name}　${s.display_name}`;
  $('slotProgress').textContent = state.queue.length > 1
    ? `第 ${state.cursor + 1} / ${state.queue.length} 個版位`
    : '';

  // 裁切框比例＝輸出比例
  const frame = $('canvasFrame');
  frame.style.aspectRatio = `${s.output.width} / ${s.output.height}`;

  // 影像
  const img = $('sourceImg');
  if (asset) {
    img.src = asset.url;
    img.hidden = false;
    $('dropzone').hidden = true;
    $('controls').hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    $('dropzone').hidden = false;
    $('controls').hidden = true;
  }

  renderGuides(s);
  renderGuideToggles(s);
  renderPanel(s, asset);
}

/* ---- 疊層：完全由規格 JSON 的 guides 驅動 ---- */
function renderGuides(s) {
  const svg = $('canvasGuides');
  svg.setAttribute('viewBox', `0 0 ${s.output.width} ${s.output.height}`);
  svg.innerHTML = '';
  const W = s.output.width, H = s.output.height;
  const fs = Math.round(Math.min(W, H) * 0.045);
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
      svg.appendChild(svgEl('circle', { cx: geo.cx, cy: geo.cy, r: geo.r, fill: 'none', stroke: '#A88A5C', 'stroke-width': 3 }));
    } else if (g.kind === 'circle') {
      svg.appendChild(svgEl('circle', { cx: geo.cx, cy: geo.cy, r: geo.r, fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': '16 12' }));
    } else if (g.kind === 'rect') {
      svg.appendChild(svgEl('rect', {
        x: geo.x, y: geo.y, width: geo.width, height: geo.height,
        fill: g.tone === 'danger' ? 'rgba(180,101,90,0.26)' : 'rgba(127,163,122,0.12)',
        stroke: col, 'stroke-width': 2.5,
        'stroke-dasharray': g.tone === 'safe' ? '16 12' : 'none'
      }));
      svg.appendChild(text(geo.x + geo.width / 2, geo.y + geo.height / 2 + fs * 0.35, g.label, fs, col));
    } else if (g.kind === 'outside_rect') {
      svg.appendChild(svgEl('rect', { x: 0, y: 0, width: geo.x, height: H, fill: 'rgba(20,16,11,0.7)' }));
      svg.appendChild(svgEl('rect', { x: geo.x + geo.width, y: 0, width: W - geo.x - geo.width, height: H, fill: 'rgba(20,16,11,0.7)' }));
      svg.appendChild(svgEl('rect', { x: geo.x + 1, y: 1, width: geo.width - 2, height: H - 2, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-dasharray': '14 10' }));
      svg.appendChild(text(geo.x / 2, H / 2, '手機裁掉', Math.round(fs * 0.8), col));
    } else if (g.kind === 'crosshair') {
      svg.appendChild(svgEl('line', { x1: geo.cx, y1: 0, x2: geo.cx, y2: H, stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': '8 10' }));
      svg.appendChild(svgEl('line', { x1: 0, y1: geo.cy, x2: W, y2: geo.cy, stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': '8 10' }));
    }
  });
}

function renderGuideToggles(s) {
  const box = $('guideToggles');
  box.innerHTML = '';
  s.guides.forEach((g) => {
    if (state.guidesOn[g.id] === undefined) state.guidesOn[g.id] = g.default_on !== false;
    const on = state.guidesOn[g.id];
    const b = el('button', 'gt' + (on ? ' on' : ''));
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

/* ---- 右側判斷面板 ---- */
function renderPanel(s, asset) {
  $('pnlPurpose').textContent = s.card.purpose;

  const good = $('pnlGood'); good.innerHTML = '';
  s.card.good_for.forEach((t) => good.appendChild(el('li', null, t)));
  const avoid = $('pnlAvoid'); avoid.innerHTML = '';
  s.card.avoid.forEach((t) => avoid.appendChild(el('li', null, t)));
  const adv = $('pnlAdvice'); adv.innerHTML = '';
  s.advice.forEach((t) => adv.appendChild(el('li', null, t)));

  $('resOutput').textContent = `${s.output.width} × ${s.output.height}`;

  if (!asset) {
    $('resSource').textContent = '－';
    $('resEffective').textContent = '－';
    setStatus('idle', '尚未上傳照片', '上傳後立即判斷這張照片是否撐得起這個版位。');
    renderMiniPreviews(s, null);
    $('btnToNext').disabled = true;
    return;
  }

  $('resSource').textContent = `${asset.naturalW} × ${asset.naturalH}`;
  const eff = effectiveCrop(asset, s);
  $('resEffective').textContent = `${eff.w} × ${eff.h}`;

  const r = judge(eff.w, s);
  setStatus(r.tone, r.label, r.msg);
  renderMiniPreviews(s, asset);
  $('btnToNext').disabled = false;
}

/* [ENGINE] 目前為預設裁切狀態：影像 cover 置中填滿裁切框（縮放 100%、無位移）。
   裁切引擎接手後，這裡改為依 transform（位移／縮放）計算實際取樣區域。 */
function effectiveCrop(asset, s) {
  const target = s.output.width / s.output.height;
  const src = asset.naturalW / asset.naturalH;
  let w, h;
  if (src > target) { h = asset.naturalH; w = Math.round(h * target); }
  else { w = asset.naturalW; h = Math.round(w / target); }
  return { w, h };
}

function judge(effW, s) {
  const t = s.resolution_tiers;
  const st = SPECS.index.resolution_status;
  const need = s.output.width;
  if (effW >= t.good) {
    return { tone: st.good.tone, label: st.good.label, msg: `裁切後有效寬度 ${effW}px，足以支撐 ${need}px 的輸出，平台縮圖後仍然清楚。` };
  }
  if (effW >= t.acceptable) {
    return { tone: st.acceptable.tone, label: st.acceptable.label, msg: `裁切後只保留 ${effW}px，此版位建議至少 ${need}px。手機可接受，桌面可能略糊。請減少放大比例，或更換原始檔。` };
  }
  if (effW >= t.poor) {
    return { tone: st.poor.tone, label: st.poor.label, msg: `裁切後只保留 ${effW}px，低於此版位建議的 ${need}px。建議改用雲端交付的原始檔，不要用聊天室存下來的壓縮版本。` };
  }
  return { tone: st.unusable.tone, label: st.unusable.label, msg: `裁切後只保留 ${effW}px，低於最低需求 ${s.minimum_effective.width}px。這張照片不適合此版位，請更換原始檔。` };
}

function setStatus(tone, label, msg) {
  const chip = $('statusChip');
  chip.dataset.tone = tone;
  chip.textContent = label;
  $('statusMsg').textContent = msg;
}

function renderMiniPreviews(s, asset) {
  const box = $('miniPreviews');
  box.innerHTML = '';
  const sizes = s.display_shape === 'circle'
    ? (platformSpec().stage.small_preview_sizes || [96, 48, 32])
    : [[220, null]];

  const mk = (w, h, circle, cap) => {
    const m = el('div', 'mini');
    const b = el('div', 'box' + (circle ? ' circle' : ''));
    b.style.width = w + 'px';
    b.style.height = (h || Math.round(w * s.output.height / s.output.width)) + 'px';
    if (asset) {
      const i = el('img');
      i.src = asset.url;
      i.alt = '';
      b.appendChild(i);
    } else {
      b.appendChild(el('div', 'empty'));
    }
    m.appendChild(b);
    m.appendChild(el('div', 'cap', cap));
    box.appendChild(m);
  };

  if (s.display_shape === 'circle') {
    sizes.forEach((px) => mk(px, px, true, `${px}px`));
  } else {
    mk(220, null, false, '橫幅');
  }
}

/* ---- 上傳 ---- */
const dropzone = $('dropzone');
const filePicker = $('filePicker');

dropzone.addEventListener('click', () => filePicker.click());
$('btnReplace').addEventListener('click', () => filePicker.click());
['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
filePicker.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  filePicker.value = '';
});

async function handleFile(file) {
  const s = slotSpec(currentSlotId());
  const isHeic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);

  if (file.size > MAX_FILE_BYTES) {
    setStatus('danger', '檔案過大', `單檔上限 40MB，這個檔案 ${(file.size / 1048576).toFixed(1)}MB。請提供壓縮前的原始檔或稍小的版本。`);
    return;
  }
  if (!isHeic && file.type && !ACCEPT_TYPES.includes(file.type)) {
    setStatus('danger', '格式不支援', '支援 JPG／PNG／WebP／HEIC。請確認檔案格式後再試一次。');
    return;
  }

  let blob = file;
  if (isHeic && !(await canDecode(file))) {
    setStatus('warn', 'HEIC 轉檔中', '這台裝置的瀏覽器無法直接讀取 HEIC，正在本機轉檔，請稍候。');
    try {
      blob = await convertHeic(file);
    } catch (err) {
      setStatus('danger', 'HEIC 轉檔失敗', '請在 iPhone 相簿選擇「編輯後拷貝」輸出 JPG，或改用雲端交付的原始 JPG 檔。');
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const slot = currentSlotId();
    if (state.assets[slot]) URL.revokeObjectURL(state.assets[slot].url);
    state.assets[slot] = {
      file, blob, url,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      transform: { scale: 1, x: 0, y: 0 }   // [ENGINE] 裁切引擎的位移／縮放狀態
    };
    track('deploy_upload', { platform: state.platform, slot, w: img.naturalWidth, h: img.naturalHeight });
    renderCrop();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('danger', '圖片無法讀取', '檔案可能已損壞或不是有效的影像。請更換檔案再試一次。');
  };
  img.src = url;
}

function canDecode(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(true); };
    im.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    im.src = url;
  });
}

let heicLoading = null;
function loadHeicLib() {
  if (window.heic2any) return Promise.resolve();
  if (heicLoading) return heicLoading;
  heicLoading = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = HEIC_LIB;
    sc.onload = res;
    sc.onerror = rej;
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
  track('deploy_crop_done', { platform: state.platform, slot: currentSlotId() });
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
  a.transform = { scale: 1, x: 0, y: 0 };   // [ENGINE]
  $('zoom').value = 100;
  $('zoomVal').textContent = '100%';
  renderCrop();
});
$('zoom').addEventListener('input', (e) => {
  $('zoomVal').textContent = e.target.value + '%';   // [ENGINE]
});

/* ================= §7 舞台畫面 ================= */
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

function renderStage() {
  const cfg = platformSpec().stage;
  const area = $('stageArea');
  area.innerHTML = '';

  const views = state.compare ? ['desktop', 'mobile'] : [state.stageView];
  views.forEach((v) => area.appendChild(mockProfile(cfg, v)));

  $('stageNote').textContent = cfg.disclaimer;
  track('deploy_stage_view', { platform: state.platform, view: state.stageView, compare: state.compare });
}

function mockProfile(cfg, view) {
  const c = cfg[view];
  const bannerSpec = slotSpec('banner');
  const avatarAsset = state.assets.avatar;
  const bannerAsset = state.assets.banner;

  const wrapEl = el('div', 'mock-wrap');
  const card = el('div', 'mock' + (view === 'mobile' ? ' phone' : ''));

  // 橫幅
  const band = el('div', 'mock-banner');
  band.style.aspectRatio = view === 'mobile'
    ? `${Math.round(bannerSpec.output.width * c.banner_visible_ratio)} / ${bannerSpec.output.height}`
    : `${bannerSpec.output.width} / ${bannerSpec.output.height}`;
  if (bannerAsset) {
    const i = el('img'); i.src = bannerAsset.url; i.alt = ''; band.appendChild(i);
  } else {
    band.appendChild(el('div', 'ph-fill', '尚未設定橫幅'));
  }

  // 頭像：寬度取卡片寬度的比例；用 translateY（相對自身高度）控制壓在橫幅上的比例
  const av = el('div', 'mock-avatar');
  av.style.width = (c.avatar_diameter_ratio * 100) + '%';
  av.style.aspectRatio = '1 / 1';
  av.style.left = (c.avatar_left_ratio * 100) + '%';
  av.style.top = '100%';
  av.style.transform = `translateY(${-c.avatar_overlap_ratio * 100}%)`;
  if (avatarAsset) {
    const i = el('img'); i.src = avatarAsset.url; i.alt = ''; av.appendChild(i);
  }
  band.appendChild(av);
  card.appendChild(band);

  // 資訊區：padding-top 的百分比是相對容器寬度，正好等於頭像露在橫幅下方的那一段
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

/* ================= §8 下載畫面 ================= */
function renderExport() {
  const spec = platformSpec();
  const list = $('fileList');
  list.innerHTML = '';

  state.queue.forEach((slotId) => {
    const s = slotSpec(slotId);
    const li = el('li');
    const left = el('div');
    left.appendChild(el('div', 'fn', fillTemplate(s.naming.template, s.naming.fallback_name, state.name) + '.' + s.output.extension));
    left.appendChild(el('div', 'fm', `${s.output.width} × ${s.output.height}　規格版本 ${s.version}`));
    li.appendChild(left);
    li.appendChild(el('span', 'fm', state.assets[slotId] ? '已就緒' : '未上傳'));
    list.appendChild(li);
  });

  const li = el('li');
  const left = el('div');
  left.appendChild(el('div', 'fn', fillTemplate(spec.export.preview_naming.template, spec.export.preview_naming.fallback_name, state.name) + '.jpg'));
  left.appendChild(el('div', 'fm', '舞台預覽圖'));
  li.appendChild(left);
  li.appendChild(el('span', 'fm', '待輸出引擎'));
  list.appendChild(li);

  const ready = allSlotsReady();
  $('btnDlAll').disabled = true;   // [ENGINE] 輸出引擎接手後開啟
  $('btnDlZip').disabled = true;
  if (ready) track('deploy_export_view', { platform: state.platform, mode: state.mode });
}

/* ================= §9 啟動 ================= */
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
  renderPicker();
  go('pick');
  track('deploy_open', { platform: state.platform });
})();
