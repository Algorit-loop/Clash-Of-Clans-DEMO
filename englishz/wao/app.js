(function () {
'use strict';

/* =====================================================================
 *  Dữ liệu & lưu trữ
 * ===================================================================== */
const V = window.VOCAB || [];
const T = window.TOEIC || { p5: [], p6: [] };
const byId = new Map(V.map(e => [e.id, e]));
const byWord = new Map(V.map(e => [e.w.toLowerCase(), e]));

const POS_LABEL = { n: 'danh từ', v: 'động từ', adj: 'tính từ', adv: 'trạng từ', prep: 'giới từ', conj: 'liên từ', pron: 'đại từ', det: 'hạn định từ', phr: 'cụm từ' };
const STATUS_LABEL = { new: 'Chưa học', weak: 'Đang yếu', learning: 'Đang học', mastered: 'Đã thuộc' };
const CAT_LABEL = { wordform: 'Từ loại', tense: 'Thì động từ', voice: 'Chủ động / bị động', verbform: 'To V / V-ing', agreement: 'Hòa hợp chủ – vị', prep: 'Giới từ', conj: 'Liên từ & từ nối', pron: 'Đại từ', relative: 'Đại từ quan hệ', compare: 'So sánh', quant: 'Lượng từ', vocab: 'Từ vựng', sentence: 'Chèn câu' };
const KEY = 'wao.progress.v1';

const defaults = () => ({
  stats: {}, days: {}, theme: 'auto', goal: 30, tq: {}, qseen: {}, history: [], savedAt: 0,
  prefs: { fPos: 'all', fGroup: 'smart', fCount: '20', tPart: '5', tCats: [], tCount: '10', tMode: 'practice' },
});
const HISTORY_MAX = 2000;
function normalize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  return { ...d, ...raw, prefs: { ...d.prefs, ...(raw.prefs || {}) }, stats: raw.stats || {}, days: raw.days || {}, tq: raw.tq || {}, qseen: raw.qseen || {}, history: Array.isArray(raw.history) ? raw.history : [] };
}
let store = load();
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return defaults(); }
}

/* ---- lưu: file JSON qua server.py (nếu có) + bản đệm trong trình duyệt ---- */
const API = 'api/progress';
const storage = { server: false, ok: true, timer: null, pending: false };
const payload = () => ({ app: 'wao', version: 3, exportedAt: new Date().toISOString(), data: store });
function save() {
  store.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* bỏ qua */ }
  if (storage.server) { storage.pending = true; clearTimeout(storage.timer); storage.timer = setTimeout(pushServer, 400); }
}
async function pushServer() {
  clearTimeout(storage.timer); storage.pending = false;
  try {
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    storage.ok = r.ok;
  } catch (e) { storage.ok = false; }
  if (!storage.ok) toast('Không lưu được vào file JSON — kiểm tra server.py');
  updateSaveInfo();
}
async function initServer() {
  if (location.protocol === 'file:') return;
  try {
    const r = await fetch(API, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    storage.server = true;
    const remote = d && d.data;
    if (remote && (remote.savedAt || 0) > (store.savedAt || 0)) {
      store = normalize(remote);
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* bỏ qua */ }
      applyTheme(); if (!fs && !qz && !p6) route();
    } else if (store.savedAt) pushServer();
    updateSaveInfo();
  } catch (e) { /* không có server → dùng bản trong trình duyệt */ }
}
window.addEventListener('pagehide', () => {
  if (storage.server && storage.pending && navigator.sendBeacon) navigator.sendBeacon(API, new Blob([JSON.stringify(payload())], { type: 'application/json' }));
});
function saveInfoText() {
  return storage.server
    ? (storage.ok ? '✓ Đang lưu vào file <code>userdata/progress.json</code> (server.py)' : '⚠ Lỗi ghi file JSON — dữ liệu tạm giữ trong trình duyệt')
    : 'Đang lưu tạm trong trình duyệt. Chạy <code>python3 server.py</code> để lưu vào file JSON.';
}
function updateSaveInfo() { const el = $('#saveInfo'); if (el) el.innerHTML = saveInfoText(); }

/* ---- lịch sử bài làm ---- */
function logHistory(entry) {
  store.history.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), end: Date.now(), ...entry });
  if (store.history.length > HISTORY_MAX) store.history.splice(0, store.history.length - HISTORY_MAX);
  save();
}

const today = () => new Date().toLocaleDateString('sv-SE');
function bumpDay() { const d = today(); store.days[d] = (store.days[d] || 0) + 1; }

/* ---- từ vựng: hộp Leitner 0..5 ---- */
const statOf = id => store.stats[id];
function statusOf(id) {
  const s = statOf(id);
  if (!s || (s.ok + s.bad) === 0) return 'new';
  if (s.box >= 4) return 'mastered';
  if (s.box === 0) return 'weak';
  return 'learning';
}
function recordWord(id, ok) {
  const s = store.stats[id] || (store.stats[id] = { box: 0, ok: 0, bad: 0, last: 0 });
  if (ok) { s.ok++; s.box = Math.min(5, s.box + 1); } else { s.bad++; s.box = 0; }
  s.last = Date.now(); bumpDay(); save();
}
/* ---- TOEIC: thống kê theo loại câu ---- */
function recordQ(qid, cat, ok) {
  const c = store.tq[cat] || (store.tq[cat] = { ok: 0, bad: 0 });
  ok ? c.ok++ : c.bad++;
  const s = store.qseen[qid] || (store.qseen[qid] = { n: 0, ok: 0 });
  s.n++; if (ok) s.ok++;
  bumpDay(); save();
}
function streak() {
  let n = 0; const d = new Date();
  if (!store.days[today()]) d.setDate(d.getDate() - 1);
  while (store.days[d.toLocaleDateString('sv-SE')]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* =====================================================================
 *  Tiện ích
 * ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hl = s => esc(s).replace(/\*([^*]+)\*/g, '<mark>$1</mark>');
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const posBadge = t => `<span class="pos pos-${t}">${esc(t)}</span>`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const LETTERS = 'ABCD';

const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 19.5V4.5"/><path d="M8 7h8M8 11h6"/>',
  cards: '<rect x="3" y="6" width="14" height="15" rx="2.5"/><path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V17"/>',
  test: '<path d="M9 3h6l1 2h3v16H5V5h3z"/><path d="m9 13 2 2 4-4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>',
  vol: '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.3-2.1-5.5-3.6-7.2-.4 1.6-1.3 2.7-2.4 3.2.3-3.4-1.3-6.5-4-8.2.2 2.8-1.2 4.8-2.7 6.6C4.9 11.2 5 12.9 5 15.2 5 19.3 8 22 12 22z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2"/><path d="M20 4v4h-4M4 20v-4h4"/>',
};
const ic = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;
const speakBtn = w => `<button type="button" class="speak" data-speak="${esc(w)}" title="Nghe phát âm" aria-label="Nghe phát âm ${esc(w)}">${ic('vol')}</button>`;

function speak(text, btn) {
  try {
    const synth = window.speechSynthesis; if (!synth) return toast('Trình duyệt không hỗ trợ phát âm');
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.9;
    const en = synth.getVoices().find(v => /en[-_]US/i.test(v.lang)); if (en) u.voice = en;
    synth.speak(u);
    if (btn) { btn.classList.remove('playing'); void btn.offsetWidth; btn.classList.add('playing'); }
  } catch (e) { /* bỏ qua */ }
}

function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2200);
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const colors = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4'];
  const ps = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 18 * devicePixelRatio, vy: (-Math.random() * 16 - 6) * devicePixelRatio, s: (4 + Math.random() * 6) * devicePixelRatio, r: Math.random() * 6, vr: Math.random() * .3 - .15, c: colors[Math.random() * colors.length | 0] }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) { p.vy += .55 * devicePixelRatio; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .66); ctx.restore(); }
    if (t - t0 < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

function ringSvg(value, max, size = 120, stroke = 10, cls = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.min(1, max ? value / max : 0);
  return `<svg viewBox="0 0 ${size} ${size}" class="${cls}"><circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/><circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${c * (1 - p)}"/></svg>`;
}
function animateRings(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('circle.fg[data-off]').forEach(c => { c.style.strokeDashoffset = c.dataset.off; })));
}

for (const e of V) {
  e._s = fold([e.w, ...e.pos.flatMap(p => [...p.senses.map(s => s.m), ...p.syn]), ...e.fam.map(f => f.w)].join(' | '));
  e._m = e.pos.map(p => ({ t: p.t, all: p.senses.map(s => s.m).join('; '), first: p.senses[0].m }));
}
V.forEach((e, i) => { e._i = i; });

/* =====================================================================
 *  Chi tiết từ (dùng chung)
 * ===================================================================== */
function linkWord(w) {
  const e = byWord.get(w.toLowerCase().trim());
  return e ? `<button type="button" class="lnk" data-open="${e.id}">${esc(w)}</button>` : esc(w);
}
function pillWord(w, cls) {
  const e = byWord.get(w.toLowerCase().trim());
  return e ? `<button type="button" class="pill ${cls}" data-open="${e.id}">${esc(w)}</button>` : `<span class="pill ${cls}">${esc(w)}</span>`;
}
function renderPanel(p, i, hidden) {
  const senses = p.senses.map((s, k) => `
    <li><span class="num">${k + 1}</span><div>
      <div class="m">${esc(s.m)}</div>
      ${s.ex ? `<div class="ex">${hl(s.ex)}${s.vi ? `<span class="vi">${esc(s.vi)}</span>` : ''}</div>` : ''}
    </div></li>`).join('');
  const kv = (title, arr) => arr.length ? `<div class="sect"><h4>${title}</h4><ul class="kv">${arr.map(([a, b]) => `<li><b>${esc(a)}</b>${b ? ` <span>— ${esc(b)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
  return `<section class="panel pos-${p.t}" data-pos="${i}" ${hidden ? 'hidden' : ''}>
    <ol class="senses">${senses}</ol>
    ${kv('Cụm từ / kết hợp thường gặp', p.col)}
    ${kv('Giới từ & cấu trúc đi kèm', p.prep)}
    ${p.syn.length ? `<div class="sect"><h4>Đồng nghĩa</h4><div class="pills">${p.syn.map(w => pillWord(w, 'syn')).join('')}</div></div>` : ''}
    ${p.ant.length ? `<div class="sect"><h4>Trái nghĩa</h4><div class="pills">${p.ant.map(w => pillWord(w, 'ant')).join('')}</div></div>` : ''}
    ${p.use ? `<div class="sect"><h4>Cách dùng</h4><div class="use">${esc(p.use)}</div></div>` : ''}
  </section>`;
}
function renderDetail(e, { openFirst = false, header = true } = {}) {
  const st = statusOf(e.id);
  const chips = e.pos.map((p, i) => `<button type="button" class="chip pos-${p.t}${openFirst && i === 0 ? ' active' : ''}" data-pos-toggle="${i}" aria-expanded="${openFirst && i === 0}">${esc(p.t)}<small>${POS_LABEL[p.t] || ''}</small></button>`).join('');
  const fam = e.fam.length ? `<div class="sect"><h4>Họ từ (word family)</h4><ul class="kv">${e.fam.map(f => `<li>${linkWord(f.w)}${f.t ? ` ${posBadge(f.t)}` : ''}${f.m ? ` <span>— ${esc(f.m)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
  const tip = e.tip ? `<div class="tip"><b>Mẹo TOEIC:</b> ${esc(e.tip)}</div>` : '';
  return `<div class="detail" data-eid="${e.id}">
    ${header ? `<div class="d-head"><h2>${esc(e.w)}</h2>${speakBtn(e.w)}<span class="ipa">${esc(e.ipa)}</span><span class="st ${st}">${STATUS_LABEL[st]}</span></div>` : ''}
    <div class="pos-chips" role="group" aria-label="Từ loại">${chips}</div>
    <div class="hint">Bấm vào từ loại để xem nghĩa, ví dụ, cụm từ, giới từ, đồng/trái nghĩa.</div>
    <div class="pos-panels">${e.pos.map((p, i) => renderPanel(p, i, !(openFirst && i === 0))).join('')}</div>
    ${(fam || tip) ? `<div class="word-extra">${fam}${tip}</div>` : ''}
  </div>`;
}
function togglePos(btn) {
  const det = btn.closest('.detail'); if (!det) return;
  const idx = btn.dataset.posToggle, was = btn.classList.contains('active');
  det.querySelectorAll('.chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-expanded', 'false'); });
  det.querySelectorAll('.panel').forEach(p => { p.hidden = true; });
  if (!was) {
    btn.classList.add('active'); btn.setAttribute('aria-expanded', 'true');
    const panel = det.querySelector(`.panel[data-pos="${idx}"]`); if (panel) panel.hidden = false;
  }
}

/* ---- modal ---- */
const modal = $('#modal'), modalBody = $('#modalBody');
function openModal(id) {
  const e = byId.get(id); if (!e) return;
  modalBody.innerHTML = renderDetail(e, { openFirst: true });
  modalBody.scrollTop = 0;
  modal.classList.remove('closing');
  if (!modal.open) { try { modal.showModal(); } catch (err) { modal.setAttribute('open', ''); } }
}
function closeModal() {
  if (!modal.open) return;
  modal.classList.add('closing');
  setTimeout(() => { modal.classList.remove('closing'); try { modal.close(); } catch (err) { modal.removeAttribute('open'); } }, 200);
}
modal.addEventListener('click', ev => { if (ev.target === modal) closeModal(); });
modal.addEventListener('cancel', ev => { ev.preventDefault(); closeModal(); });

/* =====================================================================
 *  Trang chủ
 * ===================================================================== */
function viewHome() {
  const done = store.days[today()] || 0, goal = store.goal || 30;
  const counts = { new: 0, weak: 0, learning: 0, mastered: 0 }; V.forEach(e => counts[statusOf(e.id)]++);
  let qok = 0, qbad = 0; Object.values(store.tq).forEach(c => { qok += c.ok; qbad += c.bad; });
  const dayN = Math.floor(Date.now() / 864e5), w = V[(dayN * 7919) % V.length];
  const hour = new Date().getHours(), greet = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const s = streak();
  const msg = done >= goal ? 'Bạn đã hoàn thành mục tiêu hôm nay. Tuyệt vời!' : done ? `Còn ${goal - done} lượt nữa để đạt mục tiêu hôm nay.` : 'Bắt đầu với vài từ vựng và vài câu TOEIC nhé.';
  $('#app').innerHTML = `
    <section class="hero">
      <div>
        <h1>${greet}!</h1>
        <p>${msg}</p>
        <div class="pills-row">
          <span class="hp">${ic('flame')} ${s} ngày liên tiếp</span>
          <span class="hp">${ic('check')} ${counts.mastered} từ đã thuộc</span>
          <span class="hp">${ic('target')} TOEIC ${pct(qok, qok + qbad)}% đúng</span>
        </div>
      </div>
      <div class="ring">${ringSvg(done, goal, 120, 10)}<div class="txt">${done}<small>/ ${goal} hôm nay</small></div></div>
    </section>
    <div class="quick stagger">
      <button class="qcard" style="--q:#ef4444" data-act="quick-weak">${ic('arrow', 'i go')}<span class="qi">${ic('flame')}</span><b>Ôn từ đang yếu</b><span>${counts.weak ? `${counts.weak} từ bạn từng trả lời sai` : 'Chưa có từ yếu, giỏi lắm!'}</span></button>
      <button class="qcard" style="--q:#6366f1" data-act="quick-new">${ic('arrow', 'i go')}<span class="qi">${ic('sparkle')}</span><b>Học 10 từ mới</b><span>Còn ${counts.new} từ chưa học</span></button>
      <button class="qcard" style="--q:#0ea5e9" data-act="quick-p5">${ic('arrow', 'i go')}<span class="qi">${ic('bolt')}</span><b>Part 5 nhanh</b><span>10 câu điền từ, có giải thích</span></button>
      <button class="qcard" style="--q:#d946ef" data-act="quick-p6">${ic('arrow', 'i go')}<span class="qi">${ic('doc')}</span><b>Part 6 – 1 đoạn văn</b><span>Email, thông báo, quảng cáo…</span></button>
    </div>
    <div class="two">
      <div class="card wotd">
        <span class="label">Từ của ngày</span>
        <div class="row"><span class="w">${esc(w.w)}</span>${speakBtn(w.w)}<span class="ipa">${esc(w.ipa)}</span></div>
        <div class="mm" style="margin-top:10px">${w._m.map(m => `<div>${posBadge(m.t)}<span>${esc(m.all)}</span></div>`).join('')}</div>
        ${w.pos[0].senses[0].ex ? `<p style="margin-top:12px">${hl(w.pos[0].senses[0].ex)}</p><p class="muted">${esc(w.pos[0].senses[0].vi)}</p>` : ''}
        <div class="row" style="margin-top:14px"><button class="btn small" data-open="${w.id}">Xem chi tiết ${ic('arrow')}</button></div>
      </div>
      <div class="card">
        <span class="label">Tổng quan</span>
        <div class="mini-stats">
          <div><b>${V.length}</b><span>từ vựng</span></div>
          <div><b>${T.p5.length + T.p6.reduce((a, p) => a + p.qs.length, 0)}</b><span>câu TOEIC</span></div>
          <div><b style="color:var(--ok)">${counts.mastered}</b><span>đã thuộc</span></div>
          <div><b style="color:var(--bad)">${counts.weak}</b><span>đang yếu</span></div>
        </div>
        <div class="row" style="margin-top:14px"><a class="btn small" href="#/progress">Xem tiến độ ${ic('arrow')}</a></div>
      </div>
    </div>`;
  animateRings();
}

/* =====================================================================
 *  Thư viện
 * ===================================================================== */
const lib = { q: '', pos: 'all', st: 'all', sort: 'az', order: null, animIn: false };
function viewLibrary() {
  const posCounts = {}; V.forEach(e => new Set(e.pos.map(p => p.t)).forEach(t => posCounts[t] = (posCounts[t] || 0) + 1));
  $('#app').innerHTML = `
    <div class="page-head"><h1>Thư viện từ vựng</h1><p>${V.length} từ · bấm vào thẻ để xem chi tiết</p></div>
    <div class="toolbar">
      <div class="search">${ic('search')}<input id="q" type="search" placeholder="Tìm bằng tiếng Anh hoặc tiếng Việt…" value="${esc(lib.q)}" autocomplete="off" aria-label="Tìm từ"></div>
      <div class="lib-filters">
        <div class="chips" role="group" aria-label="Từ loại">
          <button class="fchip ${lib.pos === 'all' ? 'on' : ''}" data-act="lib-pos" data-v="all">Tất cả</button>
          ${Object.keys(POS_LABEL).filter(t => posCounts[t]).map(t => `<button class="fchip ${lib.pos === t ? 'on' : ''}" data-act="lib-pos" data-v="${t}">${POS_LABEL[t]} <span class="n">${posCounts[t]}</span></button>`).join('')}
        </div>
      </div>
      <div class="lib-filters">
        <select data-lib="st" aria-label="Trạng thái">${[['all', 'Mọi trạng thái'], ...Object.entries(STATUS_LABEL)].map(([v, l]) => `<option value="${v}" ${lib.st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select data-lib="sort" aria-label="Sắp xếp">${[['az', 'A → Z'], ['rand', 'Ngẫu nhiên'], ['bad', 'Sai nhiều nhất']].map(([v, l]) => `<option value="${v}" ${lib.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="count" id="libCount"></span>
      </div>
    </div>
    <div id="libList" class="grid"></div>`;
  lib.animIn = true; renderLibList(); lib.animIn = false;
}
function renderLibList() {
  const q = fold(lib.q.trim());
  let list = V.filter(e => (lib.pos === 'all' || e.pos.some(p => p.t === lib.pos)) && (lib.st === 'all' || statusOf(e.id) === lib.st) && (!q || e._s.includes(q)));
  if (lib.sort === 'az') list.sort((a, b) => a.w.localeCompare(b.w, 'en', { sensitivity: 'base' }));
  else if (lib.sort === 'bad') list.sort((a, b) => ((statOf(b.id) || {}).bad || 0) - ((statOf(a.id) || {}).bad || 0) || a._i - b._i);
  else if (lib.sort === 'rand') {
    if (!lib.order) lib.order = new Map(shuffle(V.map(e => e.id)).map((id, i) => [id, i]));
    list.sort((a, b) => lib.order.get(a.id) - lib.order.get(b.id));
  }
  $('#libCount').textContent = `${list.length} từ`;
  $('#libList').innerHTML = list.length ? list.map((e, i) => `
    <article class="wcard ${statusOf(e.id)}" data-open="${e.id}" tabindex="0" role="button" aria-label="Xem chi tiết ${esc(e.w)}"${lib.animIn && i < 24 ? ` style="animation:viewIn .4s var(--ease) ${i * 18}ms both"` : ''}>
      <div class="wc-top"><span class="w">${esc(e.w)}</span><span class="ipa">${esc(e.ipa)}</span></div>
      <div class="mm">${e._m.map(m => `<div>${posBadge(m.t)}<span>${esc(m.first)}</span></div>`).join('')}</div>
    </article>`).join('') : `<div class="empty" style="grid-column:1/-1">Không tìm thấy từ phù hợp.</div>`;
}

/* =====================================================================
 *  Flashcard
 * ===================================================================== */
let fs = null; // {queue, i, revealed, detail, results, combo}

function flashPool() {
  const p = store.prefs;
  let pool = V.filter(e => p.fPos === 'all' || e.pos.some(x => x.t === p.fPos));
  if (['new', 'weak', 'learning', 'mastered'].includes(p.fGroup)) pool = pool.filter(e => statusOf(e.id) === p.fGroup);
  return pool;
}
function buildQueue(pool, n, smart) {
  let list = shuffle(pool.slice());
  if (smart) { const rank = { weak: 0, new: 1, learning: 2, mastered: 3 }; list.sort((a, b) => rank[statusOf(a.id)] - rank[statusOf(b.id)]); }
  if (n > 0) list = list.slice(0, n);
  return shuffle(list).map(e => e.id);
}
function startFlash(ids) { fs = { queue: ids, i: 0, revealed: false, detail: false, results: [], combo: 0, start: Date.now() }; go('flash'); }

function viewFlash() {
  if (fs && fs.i < fs.queue.length) return renderFlash(true);
  if (fs) return renderFlashSummary();
  const p = store.prefs, pool = flashPool();
  const groups = [['smart', 'Thông minh'], ['all', 'Ngẫu nhiên'], ['weak', 'Đang yếu'], ['new', 'Chưa học'], ['learning', 'Đang học'], ['mastered', 'Đã thuộc']];
  $('#app').innerHTML = `
    <div class="page-head"><h1>Flashcard</h1><p>Nghĩ nghĩa trong đầu, lật thẻ, rồi tự chấm Đúng hoặc Sai.</p></div>
    <div class="card setup">
      <div><span class="label">Nhóm từ</span><div class="chips">${groups.map(([v, l]) => `<button class="fchip ${p.fGroup === v ? 'on' : ''}" data-act="pref" data-k="fGroup" data-v="${v}">${l}</button>`).join('')}</div>
        <p class="hint" style="margin-top:6px">“Thông minh” ưu tiên từ đang yếu, rồi đến từ chưa học.</p></div>
      <div><span class="label">Từ loại</span><div class="chips"><button class="fchip ${p.fPos === 'all' ? 'on' : ''}" data-act="pref" data-k="fPos" data-v="all">Tất cả</button>${Object.keys(POS_LABEL).filter(t => V.some(e => e.pos.some(x => x.t === t))).map(t => `<button class="fchip ${p.fPos === t ? 'on' : ''}" data-act="pref" data-k="fPos" data-v="${t}">${POS_LABEL[t]}</button>`).join('')}</div></div>
      <div><span class="label">Số thẻ mỗi lượt</span><div class="seg">${['10', '20', '30', '50', '0'].map(v => `<button class="${p.fCount === v ? 'on' : ''}" data-act="pref" data-k="fCount" data-v="${v}">${v === '0' ? 'Tất cả' : v}</button>`).join('')}</div></div>
      <div class="pool"><b>${pool.length}</b><span class="muted">thẻ phù hợp với lựa chọn của bạn</span></div>
      <div class="row"><button class="btn primary big" data-act="f-start" ${pool.length ? '' : 'disabled'}>Bắt đầu ${ic('arrow')}</button>
        <span class="hint"><kbd>Space</kbd> lật · <kbd>→</kbd> đúng · <kbd>←</kbd> sai · <kbd>X</kbd> chi tiết · vuốt thẻ trên điện thoại</span></div>
    </div>`;
}

function renderFlash(animIn) {
  const s = fs, e = byId.get(s.queue[s.i]), st = statusOf(e.id);
  $('#app').innerHTML = `
    <div class="stage">
      <div class="session-head"><span>${s.i + 1} / ${s.queue.length}</span><div class="progress"><i style="width:${pct(s.i, s.queue.length)}%"></i></div>
        ${s.combo >= 3 ? `<span class="combo">${ic('flame')} ${s.combo}</span>` : ''}<button class="btn small ghost" data-act="f-quit">Kết thúc</button></div>
      <div class="flip ${animIn ? 'anim-in' : ''} ${s.revealed ? 'flipped' : ''}" id="card" data-act="f-flip" role="button" tabindex="0" aria-label="Lật thẻ">
        <div class="face front">
          <span class="st ${st}">${STATUS_LABEL[st]}</span>
          <div class="flash-word">${esc(e.w)}</div>
          <div class="row" style="justify-content:center"><span class="ipa">${esc(e.ipa)}</span>${speakBtn(e.w)}</div>
          <span class="tap-hint">${ic('flip')} Chạm để lật thẻ</span>
        </div>
        <div class="face back">
          <span class="swipe-label yes">ĐÚNG</span><span class="swipe-label no">SAI</span>
          <div class="row" style="justify-content:center"><span class="w-small">${esc(e.w)}</span>${speakBtn(e.w)}</div>
          <div class="answer">${e._m.map(m => `<div class="line">${posBadge(m.t)}<span>${esc(m.all)}</span></div>`).join('')}</div>
        </div>
      </div>
      <div id="flashActions"></div>
      <div class="shortcuts"><kbd>S</kbd> nghe phát âm${s.revealed ? ' · vuốt thẻ phải = đúng, trái = sai' : ''}</div>
    </div>
    <div class="detail-wrap" id="flashDetail"></div>`;
  renderFlashActions(); renderFlashDetail(); bindSwipe();
}
function renderFlashActions() {
  const s = fs;
  $('#flashActions').innerHTML = s.revealed ? `
    <div class="actions">
      <button class="btn bad big" data-act="f-bad">${ic('x')} Sai / Bỏ qua</button>
      <button class="btn ok big" data-act="f-ok">${ic('check')} Đúng</button>
    </div>
    <div class="actions" style="margin-top:8px"><button class="btn" data-act="f-detail">${s.detail ? 'Ẩn chi tiết' : 'Xem chi tiết'} <kbd>X</kbd></button></div>`
    : `<div class="actions"><button class="btn primary big" data-act="f-flip">${ic('flip')} Lật thẻ <kbd>Space</kbd></button></div>`;
}
function renderFlashDetail() {
  const el = $('#flashDetail'); if (!el) return;
  el.innerHTML = fs.revealed && fs.detail ? `<div class="card">${renderDetail(byId.get(fs.queue[fs.i]), { header: false })}</div>` : '';
}
function flipCard() {
  if (!fs || fs.revealed) return;
  fs.revealed = true;
  const c = $('#card'); c.classList.remove('anim-in'); c.classList.add('flipped');
  renderFlashActions();
  $('.shortcuts').innerHTML = '<kbd>S</kbd> nghe phát âm · vuốt thẻ phải = đúng, trái = sai';
}
function markFlash(ok) {
  const s = fs; if (!s || !s.revealed || s.busy) return;
  s.busy = true;
  const id = s.queue[s.i];
  recordWord(id, ok); s.results.push({ id, ok });
  s.combo = ok ? s.combo + 1 : 0;
  if (ok && s.combo > 0 && s.combo % 5 === 0) toast(`${s.combo} câu đúng liên tiếp!`);
  const c = $('#card'); c.style.transform = ''; c.classList.add(ok ? 'out-right' : 'out-left');
  setTimeout(() => {
    s.busy = false; s.i++; s.revealed = false; s.detail = false;
    if (s.i >= s.queue.length) renderFlashSummary(); else { renderFlash(true); window.scrollTo({ top: 0 }); }
  }, 280);
}
function bindSwipe() {
  const c = $('#card'); if (!c) return;
  let x0 = null, dx = 0;
  c.addEventListener('pointerdown', ev => { if (!fs.revealed || ev.target.closest('.speak')) return; x0 = ev.clientX; dx = 0; c.style.transition = 'none'; });
  c.addEventListener('pointermove', ev => {
    if (x0 === null) return;
    dx = ev.clientX - x0;
    if (Math.abs(dx) < 4) return;
    c.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg) rotateY(180deg)`;
    c.querySelector('.swipe-label.yes').style.opacity = Math.max(0, Math.min(1, dx / 90));
    c.querySelector('.swipe-label.no').style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  const end = () => {
    if (x0 === null) return; x0 = null; c.style.transition = '';
    if (Math.abs(dx) > 90) { c.dataset.dragged = '1'; markFlash(dx > 0); }
    else { if (Math.abs(dx) > 4) c.dataset.dragged = '1'; c.style.transform = ''; c.querySelectorAll('.swipe-label').forEach(l => { l.style.opacity = 0; }); }
  };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('pointerleave', end);
}
function renderFlashSummary() {
  const s = fs, ok = s.results.filter(r => r.ok).length, total = s.results.length, p = pct(ok, total);
  if (!s.logged && total) { s.logged = true; logHistory({ type: 'flash', start: s.start, ok, total, items: s.results.map(r => [r.id, r.ok ? 1 : 0]) }); }
  const wrong = s.results.filter(r => !r.ok).map(r => byId.get(r.id));
  $('#app').innerHTML = `
    <div class="card summary">
      <h1>Hoàn thành lượt luyện tập</h1>
      <div class="ring score-ring" style="color:var(--accent)">${ringSvg(ok, total, 150, 12, 'scorering')}<div class="txt" style="color:var(--text)">${p}%<small style="color:var(--muted)">chính xác</small></div></div>
      <div class="stat-row"><div class="stat ok"><b>${ok}</b>Đúng</div><div class="stat bad"><b>${total - ok}</b>Sai / bỏ qua</div><div class="stat"><b>${total}</b>Tổng</div></div>
      <div class="row" style="justify-content:center">
        ${wrong.length ? `<button class="btn primary" data-act="f-again">Luyện lại ${wrong.length} từ sai</button>` : ''}
        <button class="btn ${wrong.length ? '' : 'primary'}" data-act="f-new">Lượt mới</button>
        <a class="btn" href="#/home">Về trang chủ</a>
      </div>
      ${wrong.length ? `<div class="list"><h3>Từ cần ôn lại</h3>${wrong.map(e => `<button class="litem" data-open="${e.id}"><b>${esc(e.w)}</b><span>${e._m.map(m => `${posBadge(m.t)} ${esc(m.first)}`).join(' &nbsp; ')}</span></button>`).join('')}</div>` : ''}
    </div>`;
  styleScoreRing(); animateRings();
  if (total && p >= 80) confetti();
  window.scrollTo({ top: 0 });
}
function styleScoreRing() { document.querySelectorAll('.scorering .bg').forEach(c => { c.style.stroke = 'var(--surface-2)'; }); document.querySelectorAll('.scorering .fg').forEach(c => { c.style.stroke = 'var(--accent)'; }); }

/* =====================================================================
 *  TOEIC Part 5 & Part 6
 * ===================================================================== */
let qz = null;  // Part 5: {mode, qs:[{q, picked}], i, deadline, done}
let p6 = null;  // Part 6: {ps, picked:[], cur}
let timerId = null;
const stopTimer = () => { if (timerId) { clearInterval(timerId); timerId = null; } };

function p5Pool() {
  const cats = store.prefs.tCats;
  return T.p5.filter(q => !cats.length || cats.includes(q.cat));
}
function startP5(n, mode, pool = p5Pool()) {
  // ưu tiên câu chưa làm, rồi câu từng sai
  const rank = q => { const s = store.qseen[q.id]; return !s ? 0 : s.ok < s.n ? 1 : 2; };
  const list = shuffle(pool.slice()).sort((a, b) => rank(a) - rank(b)).slice(0, n);
  qz = { mode, start: Date.now(), qs: shuffle(list).map(q => ({ q, picked: null })), i: 0, done: false, deadline: mode === 'exam' ? Date.now() + list.length * 30000 : 0 };
  p6 = null; go('toeic');
}
function startP6(ps) {
  if (!ps) {
    const unseen = T.p6.filter(x => !store.qseen[`${x.id}-1`]);
    ps = (unseen.length ? shuffle(unseen) : shuffle(T.p6.slice()))[0];
  }
  p6 = { ps, picked: ps.qs.map(() => null), cur: 0, start: Date.now() }; qz = null; go('toeic');
}

function viewToeic() {
  stopTimer();
  if (qz) return qz.done ? renderP5Result() : renderP5();
  if (p6) return renderP6();
  const p = store.prefs, part = p.tPart;
  const catCounts = {}; T.p5.forEach(q => catCounts[q.cat] = (catCounts[q.cat] || 0) + 1);
  const pool = p5Pool();
  const setup5 = `
    <div><span class="label">Dạng câu hỏi <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">— không chọn = tất cả</span></span>
      <div class="chips">${Object.keys(CAT_LABEL).filter(c => catCounts[c]).map(c => `<button class="fchip ${p.tCats.includes(c) ? 'on' : ''}" data-act="t-cat" data-v="${c}">${CAT_LABEL[c]} <span class="n">${catCounts[c]}</span></button>`).join('')}</div></div>
    <div class="setup-grid">
      <div><span class="label">Số câu</span><div class="seg">${['10', '20', '30'].map(v => `<button class="${p.tCount === v ? 'on' : ''}" data-act="pref" data-k="tCount" data-v="${v}">${v}</button>`).join('')}</div></div>
      <div><span class="label">Chế độ</span><div class="seg"><button class="${p.tMode === 'practice' ? 'on' : ''}" data-act="pref" data-k="tMode" data-v="practice">Luyện tập</button><button class="${p.tMode === 'exam' ? 'on' : ''}" data-act="pref" data-k="tMode" data-v="exam">${ic('clock')} Thi thử</button></div></div>
    </div>
    <p class="hint">${p.tMode === 'exam' ? 'Thi thử: 30 giây/câu như đề thật, xem đáp án và giải thích khi nộp bài.' : 'Luyện tập: hiện đáp án và giải thích ngay sau mỗi câu.'}</p>
    <div class="pool"><b>${pool.length}</b><span class="muted">câu trong ngân hàng phù hợp</span></div>
    <div class="row"><button class="btn primary big" data-act="t-start5" ${pool.length ? '' : 'disabled'}>Bắt đầu ${ic('arrow')}</button><span class="hint"><kbd>A</kbd>–<kbd>D</kbd> hoặc <kbd>1</kbd>–<kbd>4</kbd> để chọn · <kbd>Enter</kbd> câu tiếp</span></div>`;
  const setup6 = `
    <p class="muted">Mỗi đoạn có 4 chỗ trống: 3 câu chọn từ/cụm từ và 1 câu chèn câu, giống đề thật.</p>
    <div class="row"><button class="btn primary big" data-act="t-start6">Làm một đoạn ngẫu nhiên ${ic('arrow')}</button></div>
    <div class="list">${T.p6.map(ps => {
      const done = ps.qs.map((_, k) => store.qseen[`${ps.id}-${k + 1}`]).filter(Boolean);
      const okN = done.filter(s => s.ok > 0).length;
      return `<button class="litem" data-act="t-p6" data-v="${ps.id}"><b>${esc(ps.type)}</b><span>${esc(ps.title)}${done.length ? ` <span class="muted">· đã làm (${okN}/4 câu từng đúng)</span>` : ''}</span></button>`;
    }).join('')}</div>`;
  $('#app').innerHTML = `
    <div class="page-head"><h1>Luyện TOEIC Reading</h1><p>Câu hỏi soạn theo cấu trúc Part 5 & Part 6, có giải thích tiếng Việt.</p></div>
    <div class="card setup">
      <div class="seg" style="justify-self:start"><button class="${part === '5' ? 'on' : ''}" data-act="pref" data-k="tPart" data-v="5">Part 5 · Điền câu</button><button class="${part === '6' ? 'on' : ''}" data-act="pref" data-k="tPart" data-v="6">Part 6 · Đoạn văn</button></div>
      ${part === '5' ? setup5 : setup6}
    </div>`;
}

function renderP5() {
  const z = qz, item = z.qs[z.i], q = item.q, exam = z.mode === 'exam';
  const shown = !exam && item.picked !== null, correct = item.picked === q.ans;
  const fill = shown ? `<span class="blank ${correct ? 'ok' : 'bad'}">${esc(q.opts[q.ans])}</span>` : exam && item.picked !== null ? `<span class="blank">${esc(q.opts[item.picked])}</span>` : '<span class="blank">&nbsp;</span>';
  const sentence = esc(q.text).replace('-------', fill);
  const opts = q.opts.map((o, k) => {
    let cls = '';
    if (shown) cls = k === q.ans ? 'right' : (k === item.picked ? 'wrong' : '');
    else if (item.picked === k) cls = 'sel';
    return `<button class="opt ${cls}" data-act="t-pick" data-k="${k}" ${shown ? 'disabled' : ''}><span class="k">${LETTERS[k]}</span>${esc(o)}</button>`;
  }).join('');
  const ans = byWord.get(q.opts[q.ans].toLowerCase());
  const last = z.i + 1 >= z.qs.length;
  const explain = shown ? `
    <div class="explain ${correct ? 'ok' : 'bad'}">
      <div class="verdict">${correct ? ic('check') + ' Chính xác!' : ic('x') + ` Chưa đúng — đáp án (${LETTERS[q.ans]}) ${esc(q.opts[q.ans])}`}</div>
      <div>${esc(q.why)}</div>
      ${q.vi ? `<div class="vi">${esc(q.vi)}</div>` : ''}
      <div class="row" style="margin-top:4px">${ans ? `<button class="btn small" data-open="${ans.id}">Tra từ “${esc(ans.w)}”</button>` : ''}<span class="spacer"></span><button class="btn primary" data-act="t-next">${last ? 'Xem kết quả' : 'Câu tiếp'} <kbd>Enter</kbd></button></div>
    </div>` : '';
  const answered = z.qs.filter(x => x.picked !== null).length;
  $('#app').innerHTML = `
    <div class="qwrap">
      <div class="session-head"><span>Câu ${z.i + 1} / ${z.qs.length}</span><div class="progress"><i style="width:${pct(exam ? answered : z.i, z.qs.length)}%"></i></div>
        ${exam ? `<span class="timer" id="timer">${ic('clock')} --:--</span>` : ''}<button class="btn small ghost" data-act="t-quit">Kết thúc</button></div>
      <div class="card qcardx">
        <div class="qmeta"><span class="qno">${101 + z.i}.</span>${exam ? '' : `<span class="cat">${CAT_LABEL[q.cat]}</span>`}</div>
        <div class="q-sentence">${sentence}</div>
        <div class="opts">${opts}</div>
        ${explain}
        ${exam ? `<div class="row" style="margin-top:16px"><button class="btn" data-act="t-prev" ${z.i ? '' : 'disabled'}>← Câu trước</button><span class="spacer"></span>${last ? `<button class="btn primary" data-act="t-submit">Nộp bài (${answered}/${z.qs.length})</button>` : `<button class="btn primary" data-act="t-next">Câu tiếp →</button>`}</div>
          <div class="navdots">${z.qs.map((x, k) => `<button class="${x.picked !== null ? 'done' : ''} ${k === z.i ? 'cur' : ''}" data-act="t-jump" data-k="${k}">${k + 1}</button>`).join('')}</div>` : ''}
      </div>
    </div>`;
  if (exam) startTimer();
}
function startTimer() {
  stopTimer();
  const tick = () => {
    const left = Math.max(0, qz.deadline - Date.now()), el = $('#timer');
    if (el) { const sec = Math.ceil(left / 1000); el.innerHTML = `${ic('clock')} ${String(sec / 60 | 0).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; el.classList.toggle('low', sec <= 30); }
    if (left <= 0) { stopTimer(); toast('Hết giờ! Bài đã được nộp.'); finishP5(); }
  };
  tick(); timerId = setInterval(tick, 1000);
}
function pickP5(k) {
  const z = qz; if (!z || z.done) return;
  const item = z.qs[z.i];
  if (z.mode === 'exam') {
    item.picked = k; renderP5();
    if (z.i + 1 < z.qs.length) setTimeout(() => { if (qz === z && !z.done && z.qs[z.i] === item) { z.i++; renderP5(); } }, 350);
    return;
  }
  if (item.picked !== null) return;
  item.picked = k;
  recordQ(item.q.id, item.q.cat, k === item.q.ans);
  renderP5();
}
function nextP5() {
  const z = qz; if (!z) return;
  if (z.mode === 'practice' && z.qs[z.i].picked === null) return;
  if (z.i + 1 >= z.qs.length) { if (z.mode === 'practice') finishP5(); return; }
  z.i++; renderP5(); window.scrollTo({ top: 0 });
}
function finishP5() {
  const z = qz; if (!z || z.done) return;
  stopTimer();
  if (z.mode === 'exam') z.qs.forEach(x => recordQ(x.q.id, x.q.cat, x.picked === x.q.ans));
  z.done = true;
  logHistory({ type: 'p5', mode: z.mode, start: z.start, ok: z.qs.filter(x => x.picked === x.q.ans).length, total: z.qs.length, items: z.qs.map(x => [x.q.id, x.picked === null ? -1 : x.picked]) });
  renderP5Result();
}
function renderP5Result() {
  const z = qz, total = z.qs.length, ok = z.qs.filter(x => x.picked === x.q.ans).length, p = pct(ok, total);
  const by = {}; z.qs.forEach(x => { const c = by[x.q.cat] || (by[x.q.cat] = { ok: 0, n: 0 }); c.n++; if (x.picked === x.q.ans) c.ok++; });
  const wrong = z.qs.filter(x => x.picked !== x.q.ans);
  $('#app').innerHTML = `
    <div class="card summary">
      <h1>Kết quả Part 5</h1>
      <div class="ring score-ring">${ringSvg(ok, total, 150, 12, 'scorering')}<div class="txt" style="color:var(--text)">${ok}/${total}<small style="color:var(--muted)">${p}% chính xác</small></div></div>
      <div class="card" style="text-align:left;margin-top:14px;box-shadow:none"><h3>Theo dạng câu hỏi</h3><div class="bars">${Object.entries(by).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([c, v]) => barRow(CAT_LABEL[c], v.ok, v.n)).join('')}</div></div>
      <div class="row" style="justify-content:center;margin-top:16px">
        ${wrong.length ? `<button class="btn primary" data-act="t-retry">Làm lại ${wrong.length} câu sai</button>` : ''}
        <button class="btn ${wrong.length ? '' : 'primary'}" data-act="t-new">Bài mới</button>
        <a class="btn" href="#/progress">Xem tiến độ</a>
      </div>
      <div class="list"><div class="row"><h3 style="margin:0">Xem lại từng câu</h3><span class="spacer"></span>
        <div class="seg" id="rvSeg">${[['all', `Tất cả (${total})`], ['bad', `Sai (${total - ok})`], ['ok', `Đúng (${ok})`]].map(([v, l]) => `<button class="${(z.rf || 'all') === v ? 'on' : ''}" data-act="rv-f" data-v="${v}">${l}</button>`).join('')}</div></div>
        <p class="hint">Câu đúng cũng có giải thích — đọc lại để chắc rằng bạn đúng vì hiểu, không phải vì đoán.</p>
        <div id="review" style="display:grid;gap:10px"></div></div>
    </div>`;
  renderReview();
  styleScoreRing(); animateRings();
  if (p >= 80) confetti();
  window.scrollTo({ top: 0 });
}
function reviewP5Item(q, picked, i) {
  if (!q) return `<div class="card" style="box-shadow:none"><span class="muted">Câu ${101 + i}: câu hỏi này đã bị xóa khỏi ngân hàng.</span></div>`;
  const ok = picked === q.ans;
  const opts = q.opts.map((o, k) => `<span class="pill ${k === q.ans ? 'syn' : k === picked ? 'ant' : ''}">${LETTERS[k]}. ${k === picked && !ok ? `<s>${esc(o)}</s>` : esc(o)}</span>`).join('');
  return `<div class="card rv ${ok ? 'rv-ok' : 'rv-bad'}" style="box-shadow:none;text-align:left;border-left:5px solid ${ok ? 'var(--ok-strong)' : 'var(--bad-strong)'}">
    <div class="qmeta"><span class="qno">${101 + i}.</span><span class="cat">${CAT_LABEL[q.cat]}</span><span class="st ${ok ? 'mastered' : 'weak'}">${ok ? 'Đúng' : picked === null || picked < 0 ? 'Bỏ trống' : 'Sai'}</span></div>
    <div>${esc(q.text).replace('-------', `<span class="blank ok">${esc(q.opts[q.ans])}</span>`)}</div>
    <div class="pills" style="margin-top:8px">${opts}</div>
    <div style="margin-top:8px"><b>Vì sao:</b> ${esc(q.why)}</div>${q.vi ? `<div class="muted">${esc(q.vi)}</div>` : ''}</div>`;
}
function renderReview() {
  const z = qz, f = z.rf || 'all', el = $('#review'); if (!el) return;
  const items = z.qs.map((x, i) => ({ x, i, ok: x.picked === x.q.ans })).filter(r => f === 'all' || (f === 'ok') === r.ok);
  el.innerHTML = items.length ? items.map(({ x, i }) => reviewP5Item(x.q, x.picked, i)).join('') : '<p class="muted">Không có câu nào.</p>';
}
function barRow(label, ok, n) {
  const p = pct(ok, n), color = p >= 80 ? 'var(--ok-strong)' : p >= 50 ? '#f59e0b' : 'var(--bad-strong)';
  return `<div class="bar"><span>${esc(label)}</span><div class="track"><i style="width:${p}%;background:${color}"></i></div><span class="v">${ok}/${n}</span></div>`;
}

/* ---- Part 6 ---- */
function renderP6() {
  const st = p6, ps = st.ps;
  const allDone = st.picked.every(x => x !== null), ok = st.picked.filter((x, k) => x === ps.qs[k].ans).length;
  const text = esc(ps.text).replace(/\[(\d)\]/g, (_, n) => {
    const k = +n - 1, q = ps.qs[k], pk = st.picked[k];
    if (pk === null) return `<button class="pblank ${st.cur === k ? 'cur' : ''}" data-act="p6-go" data-k="${k}">(${n}) ________</button>`;
    return `<button class="pblank ${pk === q.ans ? 'ok' : 'bad'}" data-act="p6-go" data-k="${k}">(${n}) ${esc(q.opts[q.ans])}</button>`;
  });
  const qs = ps.qs.map((q, k) => {
    const pk = st.picked[k], shown = pk !== null;
    return `<div class="card p6q ${st.cur === k && !allDone ? 'cur' : ''}" id="p6q${k}">
      <div class="qmeta"><span class="qno">${131 + k}.</span><span class="cat">${CAT_LABEL[q.cat]}</span></div>
      <div class="opts ${q.cat === 'sentence' ? 'col1' : ''}">${q.opts.map((o, j) => `<button class="opt ${shown ? (j === q.ans ? 'right' : j === pk ? 'wrong' : '') : ''}" data-act="p6-pick" data-q="${k}" data-k="${j}" ${shown ? 'disabled' : ''}><span class="k">${LETTERS[j]}</span>${esc(o)}</button>`).join('')}</div>
      ${shown ? `<div class="explain ${pk === q.ans ? 'ok' : 'bad'}"><div class="verdict">${pk === q.ans ? ic('check') + ' Chính xác!' : ic('x') + ` Đáp án đúng: (${LETTERS[q.ans]})`}</div><div>${esc(q.why)}</div></div>` : ''}
    </div>`;
  }).join('');
  $('#app').innerHTML = `
    <div class="session-head" style="max-width:none"><span>Part 6 · ${esc(ps.type)}</span><div class="progress"><i style="width:${pct(st.picked.filter(x => x !== null).length, 4)}%"></i></div><button class="btn small ghost" data-act="t-quit">Kết thúc</button></div>
    <div class="p6">
      <div class="card passage"><div class="ptype">${esc(ps.type)} · ${esc(ps.title)}</div><div class="ptext">${text}</div>
        ${allDone ? `<details style="margin-top:14px"><summary class="lnk" style="cursor:pointer">Xem bản dịch</summary><p class="muted" style="margin-top:8px">${esc(ps.vi)}</p></details>` : ''}</div>
      <div>${qs}
        ${allDone ? `<div class="card center" style="animation:viewIn .4s var(--ease) both"><h3>Bạn đúng ${ok}/4 câu</h3><div class="row" style="justify-content:center"><button class="btn primary" data-act="t-start6">Đoạn tiếp theo ${ic('arrow')}</button><button class="btn" data-act="t-new">Về trang TOEIC</button></div></div>` : ''}
      </div>
    </div>`;
}
function logP6() {
  const st = p6; if (!st || st.logged || st.picked.every(x => x === null)) return;
  st.logged = true;
  logHistory({ type: 'p6', start: st.start, ps: st.ps.id, ok: st.picked.filter((x, j) => x === st.ps.qs[j].ans).length, total: st.ps.qs.length, items: st.picked.map(x => x === null ? -1 : x) });
}
function pickP6(qi, k) {
  const st = p6; if (!st || st.picked[qi] !== null) return;
  st.picked[qi] = k;
  const q = st.ps.qs[qi];
  recordQ(`${st.ps.id}-${qi + 1}`, q.cat, k === q.ans);
  const next = st.picked.findIndex(x => x === null);
  st.cur = next < 0 ? qi : next;
  renderP6();
  if (next < 0) { logP6(); if (st.picked.every((x, j) => x === st.ps.qs[j].ans)) confetti(); }
  else setTimeout(() => { const el = $(`#p6q${next}`); if (el && innerWidth < 860) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 450);
}

/* =====================================================================
 *  Tiến độ
 * ===================================================================== */
function viewProgress() {
  const counts = { new: 0, weak: 0, learning: 0, mastered: 0 }; V.forEach(e => counts[statusOf(e.id)]++);
  let ok = 0, bad = 0; Object.values(store.stats).forEach(s => { ok += s.ok; bad += s.bad; });
  let qok = 0, qbad = 0; Object.values(store.tq).forEach(c => { qok += c.ok; qbad += c.bad; });
  const colors = { mastered: 'var(--ok-strong)', learning: '#f59e0b', weak: 'var(--bad-strong)', new: 'var(--surface-3)' };
  const days = [...Array(14)].map((_, k) => { const d = new Date(); d.setDate(d.getDate() - (13 - k)); const key = d.toLocaleDateString('sv-SE'); return { n: store.days[key] || 0, label: k === 13 ? 'Nay' : d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' }) }; });
  const max = Math.max(1, ...days.map(d => d.n));
  const weakest = Object.entries(store.stats).filter(([, s]) => s.bad > 0).sort((a, b) => b[1].bad - a[1].bad || a[1].box - b[1].box).slice(0, 10).map(([id, s]) => [byId.get(id), s]).filter(([e]) => e);
  const cats = Object.keys(CAT_LABEL).filter(c => store.tq[c]).sort((a, b) => pct(store.tq[a].ok, store.tq[a].ok + store.tq[a].bad) - pct(store.tq[b].ok, store.tq[b].ok + store.tq[b].bad));
  $('#app').innerHTML = `
    <div class="page-head"><h1>Tiến độ</h1><p id="saveInfo">${saveInfoText()}</p></div>
    <div class="sections stagger">
      <div class="cards3">
        <div class="card"><span class="label">Từ đã thuộc</span><div class="big-num" style="color:var(--ok)">${counts.mastered}<small class="muted" style="font-size:1rem"> / ${V.length}</small></div></div>
        <div class="card"><span class="label">Flashcard</span><div class="big-num">${pct(ok, ok + bad)}%</div><div class="muted">${ok} đúng · ${bad} sai</div></div>
        <div class="card"><span class="label">TOEIC</span><div class="big-num">${pct(qok, qok + qbad)}%</div><div class="muted">${qok} đúng · ${qbad} sai</div></div>
        <div class="card"><span class="label">Chuỗi ngày học</span><div class="big-num" style="color:#f97316">${streak()}</div><div class="muted">ngày liên tiếp</div></div>
      </div>
      <div class="card"><h3>Mức độ thuộc từ</h3>
        <div class="stack">${['mastered', 'learning', 'weak', 'new'].map(k => `<i style="width:${counts[k] / V.length * 100}%;background:${colors[k]}" title="${STATUS_LABEL[k]}: ${counts[k]}"></i>`).join('')}</div>
        <div class="legend">${['mastered', 'learning', 'weak', 'new'].map(k => `<span style="--c:${colors[k]}">${STATUS_LABEL[k]}: <b>${counts[k]}</b></span>`).join('')}</div>
        <p class="hint" style="margin-top:8px">Đúng → lên một bậc (5 bậc, từ bậc 4 là “đã thuộc”). Sai / bỏ qua → về “đang yếu”.</p></div>
      <div class="card"><h3>TOEIC theo dạng câu hỏi</h3>
        ${cats.length ? `<div class="bars">${cats.map(c => barRow(CAT_LABEL[c], store.tq[c].ok, store.tq[c].ok + store.tq[c].bad)).join('')}</div><p class="hint" style="margin-top:10px">Các dạng ở trên cùng là dạng bạn yếu nhất, nên ưu tiên luyện.</p>` : '<p class="muted">Chưa có dữ liệu. Hãy làm vài câu Part 5 / Part 6.</p>'}</div>
      <div class="card"><div class="row"><h3 style="margin:0">14 ngày gần đây</h3><span class="spacer"></span>
        <label class="hint">Mục tiêu mỗi ngày <select data-goal>${[10, 20, 30, 50, 100].map(v => `<option ${store.goal === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <div class="days">${days.map((d, k) => `<div><i style="height:${Math.max(4, d.n / max * 76)}px;animation-delay:${k * 30}ms" title="${d.n} lượt"></i>${d.n}<br>${esc(d.label)}</div>`).join('')}</div></div>
      <div class="card"><div class="row"><h3 style="margin:0">Lịch sử bài làm</h3><span class="spacer"></span>
        <div class="seg" id="hSeg">${[['all', 'Tất cả'], ['flash', 'Flashcard'], ['p5', 'Part 5'], ['p6', 'Part 6']].map(([v, l]) => `<button class="${hist.f === v ? 'on' : ''}" data-act="h-f" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div id="hist" class="list" style="margin-top:12px"></div></div>
      <div class="card"><h3>Từ hay sai nhất</h3>
        ${weakest.length ? `<div class="list" style="margin:0">${weakest.map(([e, s]) => `<button class="litem" data-open="${e.id}"><b>${esc(e.w)}</b><span>${e._m.map(m => `${posBadge(m.t)} ${esc(m.first)}`).join(' &nbsp; ')} <span class="muted">· sai ${s.bad} lần</span></span></button>`).join('')}</div>` : '<p class="muted">Chưa có từ nào bị sai.</p>'}</div>
      <div class="card"><h3>Sao lưu & đặt lại</h3>
        <p class="muted">File JSON chứa toàn bộ dữ liệu: tiến độ từ vựng, thống kê TOEIC, lịch sử bài làm, mục tiêu và cài đặt. Nhập file sẽ <b>thay thế</b> toàn bộ dữ liệu hiện tại.</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="export">Xuất tiến độ (.json)</button>
          <label class="btn">Nhập tiến độ<input type="file" id="importFile" accept="application/json" hidden></label>
          <button class="btn bad" data-act="reset">Xóa toàn bộ tiến độ</button>
        </div></div>
    </div>`;
  renderHistory();
}

/* ---- lịch sử ---- */
const hist = { f: 'all', n: 15 };
const p5ById = new Map(T.p5.map(q => [q.id, q]));
const p6ById = new Map(T.p6.map(p => [p.id, p]));
const fmtTime = t => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDur = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)} phút ${s % 60}s` : `${s}s`; };
function histTitle(h) {
  if (h.type === 'flash') return 'Flashcard';
  if (h.type === 'p5') return `Part 5 · ${h.mode === 'exam' ? 'Thi thử' : 'Luyện tập'}`;
  const ps = p6ById.get(h.ps); return `Part 6 · ${ps ? ps.type + ' – ' + ps.title : 'đoạn đã xóa'}`;
}
function renderHistory() {
  const el = $('#hist'); if (!el) return;
  const list = store.history.filter(h => hist.f === 'all' || h.type === hist.f).slice().reverse();
  el.innerHTML = list.length ? list.slice(0, hist.n).map(h => {
    const p = pct(h.ok, h.total), color = p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)';
    return `<button class="litem" data-act="h-open" data-v="${h.id}"><b style="min-width:4.5em;color:${color}">${h.ok}/${h.total}</b><span style="flex:1">${esc(histTitle(h))}<br><span class="hint">${fmtTime(h.end)}${h.start ? ' · ' + fmtDur(h.end - h.start) : ''} · ${p}% đúng</span></span>${ic('arrow')}</button>`;
  }).join('') + (list.length > hist.n ? `<button class="btn small" data-act="h-more" style="justify-self:center">Xem thêm (${list.length - hist.n})</button>` : '')
    : '<p class="muted">Chưa có bài làm nào. Lịch sử được ghi khi bạn hoàn thành hoặc bấm “Kết thúc” một lượt.</p>';
}
function openHistory(id) {
  const h = store.history.find(x => x.id === id); if (!h) return;
  let body = '';
  if (h.type === 'flash') {
    body = `<div class="list">${h.items.map(([wid, ok]) => { const e = byId.get(wid); return e ? `<button class="litem" data-open="${e.id}"><b style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${ok ? '✓' : '✗'} ${esc(e.w)}</b><span>${e._m.map(m => `${posBadge(m.t)} ${esc(m.first)}`).join(' &nbsp; ')}</span></button>` : ''; }).join('')}</div>`;
  } else if (h.type === 'p5') {
    body = `<div style="display:grid;gap:10px;margin-top:12px">${h.items.map(([qid, pk], i) => reviewP5Item(p5ById.get(qid), pk, i)).join('')}</div>`;
  } else {
    const ps = p6ById.get(h.ps);
    body = !ps ? '<p class="muted">Đoạn văn này đã bị xóa khỏi ngân hàng.</p>' : `
      <div class="card" style="box-shadow:none;margin-top:12px"><span style="font-size:.74rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)">${esc(ps.type)} · ${esc(ps.title)}</span>
        <div class="ptext" style="white-space:pre-wrap;margin-top:8px">${esc(ps.text).replace(/\[(\d)\]/g, (_, n) => { const q = ps.qs[n - 1], pk = h.items[n - 1]; return `<span class="pblank ${pk === q.ans ? 'ok' : 'bad'}">(${n}) ${esc(q.opts[q.ans])}</span>`; })}</div>
        <p class="muted" style="margin-top:10px">${esc(ps.vi)}</p></div>
      <div style="display:grid;gap:10px;margin-top:10px">${ps.qs.map((q, k) => { const pk = h.items[k], ok = pk === q.ans; return `<div class="card" style="box-shadow:none;border-left:5px solid ${ok ? 'var(--ok-strong)' : 'var(--bad-strong)'}"><div class="qmeta"><span class="qno">${131 + k}.</span><span class="cat">${CAT_LABEL[q.cat]}</span><span class="st ${ok ? 'mastered' : 'weak'}">${ok ? 'Đúng' : pk < 0 ? 'Bỏ trống' : 'Sai'}</span></div><div class="pills">${q.opts.map((o, j) => `<span class="pill ${j === q.ans ? 'syn' : j === pk ? 'ant' : ''}">${LETTERS[j]}. ${esc(o)}</span>`).join('')}</div><div style="margin-top:8px"><b>Vì sao:</b> ${esc(q.why)}</div></div>`; }).join('')}</div>`;
  }
  modalBody.innerHTML = `<h2 style="font-size:1.4rem">${esc(histTitle(h))}</h2><p class="muted">${fmtTime(h.end)}${h.start ? ' · ' + fmtDur(h.end - h.start) : ''} · đúng <b>${h.ok}/${h.total}</b> (${pct(h.ok, h.total)}%)</p>${body}`;
  modalBody.scrollTop = 0; modal.classList.remove('closing');
  if (!modal.open) { try { modal.showModal(); } catch (err) { modal.setAttribute('open', ''); } }
}
function exportProgress() {
  const blob = new Blob([JSON.stringify(payload(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `wao-progress-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Đã xuất file tiến độ');
}
function importProgress(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const data = d && d.data ? d.data : d;           // v3: {data:{...}}; v2 cũ: dữ liệu ở cấp ngoài
      if (!data || typeof data !== 'object' || typeof data.stats !== 'object') throw new Error('bad');
      const n = Object.keys(data.stats).length, h = (data.history || []).length;
      if (!confirm(`Nhập file này sẽ THAY THẾ toàn bộ dữ liệu hiện tại.\nFile có: ${n} từ đã học, ${h} bài làm trong lịch sử.\nTiếp tục?`)) return;
      store = normalize(data); save(); applyTheme(); route();
      toast('Đã nhập tiến độ');
    } catch (e) { toast('File không hợp lệ'); }
  };
  r.readAsText(file);
}

/* =====================================================================
 *  Điều hướng
 * ===================================================================== */
const NAV = [['home', 'Trang chủ', 'home'], ['library', 'Thư viện', 'book'], ['flash', 'Flashcard', 'cards'], ['toeic', 'TOEIC', 'test'], ['progress', 'Tiến độ', 'chart']];
const views = { home: viewHome, library: viewLibrary, flash: viewFlash, toeic: viewToeic, progress: viewProgress };
$('#tabs').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" data-view="${k}">${ic(i)}${l}</a>`).join('');
$('#bottomNav').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" data-view="${k}">${ic(i)}<span>${l}</span></a>`).join('');
const curView = () => { const n = (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0]; return views[n] ? n : 'home'; };
function refresh() { const y = window.scrollY; views[curView()](); window.scrollTo(0, y); }
function go(name) { if (curView() === name) route(); else location.hash = `#/${name}`; }
function route() {
  stopTimer();
  const key = curView();
  document.querySelectorAll('#tabs a, #bottomNav a').forEach(a => a.classList.toggle('active', a.dataset.view === key));
  const app = $('#app'); app.classList.remove('view-enter'); void app.offsetWidth; app.classList.add('view-enter');
  views[key]();
}
window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0 }); });

/* =====================================================================
 *  Sự kiện
 * ===================================================================== */
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act],[data-open],[data-speak],[data-pos-toggle]'); if (!t) return;
  if (t.dataset.speak) { ev.stopPropagation(); return speak(t.dataset.speak, t); }
  if (t.dataset.posToggle !== undefined) return togglePos(t);
  if (t.dataset.open) return openModal(t.dataset.open);
  const v = t.dataset.v, k = t.dataset.k;
  switch (t.dataset.act) {
    case 'modal-close': return closeModal();
    case 'pref': store.prefs[k] = v; save(); return refresh();
    case 'lib-pos': lib.pos = v; document.querySelectorAll('[data-act="lib-pos"]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return renderLibList();
    // home
    case 'quick-weak': { const ids = V.filter(e => statusOf(e.id) === 'weak').map(e => e.id); return ids.length ? startFlash(shuffle(ids).slice(0, 20)) : toast('Chưa có từ yếu nào'); }
    case 'quick-new': { const ids = V.filter(e => statusOf(e.id) === 'new').map(e => e.id); return ids.length ? startFlash(shuffle(ids).slice(0, 10)) : toast('Bạn đã học hết các từ!'); }
    case 'quick-p5': return startP5(10, 'practice', T.p5);
    case 'quick-p6': return startP6();
    // flashcard
    case 'f-start': { const g = store.prefs.fGroup; return startFlash(buildQueue(flashPool(), parseInt(store.prefs.fCount, 10), g === 'smart')); }
    case 'f-flip': if (t.dataset.dragged) { delete t.dataset.dragged; return; } return flipCard();
    case 'f-ok': return markFlash(true);
    case 'f-bad': return markFlash(false);
    case 'f-detail': fs.detail = !fs.detail; renderFlashActions(); renderFlashDetail(); if (fs.detail) $('#flashDetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    case 'f-quit': if (fs.results.length) { fs.queue = fs.queue.slice(0, fs.i); renderFlashSummary(); } else { fs = null; viewFlash(); } return;
    case 'f-again': return startFlash(shuffle(fs.results.filter(r => !r.ok).map(r => r.id)));
    case 'f-new': fs = null; return viewFlash();
    // toeic
    case 't-cat': { const c = store.prefs.tCats; const i = c.indexOf(v); i < 0 ? c.push(v) : c.splice(i, 1); save(); return refresh(); }
    case 't-start5': return startP5(parseInt(store.prefs.tCount, 10), store.prefs.tMode);
    case 't-start6': logP6(); return startP6();
    case 't-p6': return startP6(T.p6.find(x => x.id === v));
    case 't-pick': return pickP5(+k);
    case 't-next': return nextP5();
    case 't-prev': if (qz.i > 0) { qz.i--; renderP5(); } return;
    case 't-jump': qz.i = +k; return renderP5();
    case 't-submit': { const left = qz.qs.filter(x => x.picked === null).length; if (left && !confirm(`Còn ${left} câu chưa làm. Nộp bài?`)) return; return finishP5(); }
    case 'rv-f': qz.rf = v; document.querySelectorAll('#rvSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return renderReview();
    case 't-retry': return startP5(999, 'practice', qz.qs.filter(x => x.picked !== x.q.ans).map(x => x.q));
    case 't-new': qz = null; p6 = null; return viewToeic();
    case 't-quit': stopTimer(); logP6(); if (qz && !qz.done) { if (qz.mode === 'exam') { if (confirm('Nộp bài ngay?')) finishP5(); return; } const n = qz.qs.filter(x => x.picked !== null).length; if (n) { qz.qs = qz.qs.slice(0, n); return finishP5(); } } qz = null; p6 = null; return viewToeic();
    case 'p6-pick': return pickP6(+t.dataset.q, +k);
    case 'p6-go': p6.cur = +k; renderP6(); { const el = $(`#p6q${k}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return;
    // progress
    case 'h-f': hist.f = v; hist.n = 15; document.querySelectorAll('#hSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return renderHistory();
    case 'h-more': hist.n += 15; return renderHistory();
    case 'h-open': return openHistory(v);
    case 'export': return exportProgress();
    case 'reset': if (confirm('Xóa toàn bộ tiến độ học và lịch sử? Hành động này không thể hoàn tác.')) { Object.assign(store, { stats: {}, days: {}, tq: {}, qseen: {}, history: [] }); save(); viewProgress(); toast('Đã xóa tiến độ'); } return;
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.lib) { lib[t.dataset.lib] = t.value; return renderLibList(); }
  if (t.dataset.goal !== undefined) { store.goal = +t.value; save(); return toast(`Mục tiêu mới: ${t.value} lượt/ngày`); }
  if (t.id === 'importFile' && t.files[0]) { importProgress(t.files[0]); t.value = ''; }
});
document.addEventListener('input', ev => { if (ev.target.id === 'q') { lib.q = ev.target.value; renderLibList(); } });

document.addEventListener('keydown', ev => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('wcard')) return openModal(ev.target.dataset.open);
  if (modal.open) return;
  const view = curView(), k = ev.key.toLowerCase();
  if (view === 'flash' && fs && fs.i < fs.queue.length) {
    if (!fs.revealed) { if (k === ' ' || k === 'enter') { ev.preventDefault(); flipCard(); } }
    else if (k === 'arrowright' || k === '1') { ev.preventDefault(); markFlash(true); }
    else if (k === 'arrowleft' || k === '2') { ev.preventDefault(); markFlash(false); }
    else if (k === 'x' || k === 'd') { fs.detail = !fs.detail; renderFlashActions(); renderFlashDetail(); }
    if (k === 's') speak(byId.get(fs.queue[fs.i]).w, $('#card .speak'));
  } else if (view === 'toeic' && qz && !qz.done) {
    const idx = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
    if (idx >= 0) return pickP5(idx);
    if (k === 'enter') { ev.preventDefault(); nextP5(); }
    if (qz.mode === 'exam' && k === 'arrowleft' && qz.i > 0) { qz.i--; renderP5(); }
    if (qz.mode === 'exam' && k === 'arrowright' && qz.i + 1 < qz.qs.length) { qz.i++; renderP5(); }
  } else if (view === 'toeic' && p6) {
    const idx = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
    if (idx >= 0 && p6.picked[p6.cur] === null) pickP6(p6.cur, idx);
  }
});

/* ---- giao diện sáng/tối ---- */
const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: 'Tự động', light: 'Sáng', dark: 'Tối' };
function applyTheme() {
  if (store.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', store.theme);
  const b = $('#themeBtn'); b.title = `Giao diện: ${THEME_LABEL[store.theme]} (bấm để đổi)`;
  b.innerHTML = ic({ auto: 'auto', light: 'sun', dark: 'moon' }[store.theme]);
}
$('#themeBtn').addEventListener('click', () => { store.theme = THEMES[(THEMES.indexOf(store.theme) + 1) % 3]; save(); applyTheme(); toast(`Giao diện: ${THEME_LABEL[store.theme]}`); });

applyTheme();
route();
initServer();
})();
