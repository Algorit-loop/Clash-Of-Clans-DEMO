(function () {
'use strict';

/* =====================================================================
 *  Dữ liệu & lưu trữ
 * ===================================================================== */
const V = window.VOCAB || [];
const byId = new Map(V.map(e => [e.id, e]));
const byWord = new Map(V.map(e => [e.w.toLowerCase(), e]));

const POS_LABEL = { n: 'danh từ', v: 'động từ', adj: 'tính từ', adv: 'trạng từ', prep: 'giới từ', conj: 'liên từ', pron: 'đại từ', det: 'hạn định từ', phr: 'cụm từ' };
const STATUS_LABEL = { new: 'Chưa học', weak: 'Đang yếu', learning: 'Đang học', mastered: 'Đã thuộc' };
const SRC_LABEL = { core: 'Từ của bạn', extra: 'Mở rộng' };
const KEY = 'wao.progress.v1';

const defaults = () => ({ stats: {}, days: {}, theme: 'auto', prefs: { pSource: 'all', pPos: 'all', pCount: '20', pPrio: 'smart', cSource: 'all', cCount: '10' } });
let store = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const d = defaults();
      return { ...d, ...raw, prefs: { ...d.prefs, ...(raw.prefs || {}) } };
    }
  } catch (e) { /* localStorage không dùng được: chạy không lưu */ }
  return defaults();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* bỏ qua */ } }

/* ---- trạng thái học: hộp Leitner 0..5 ---- */
function statOf(id) { return store.stats[id]; }
function statusOf(id) {
  const s = statOf(id);
  if (!s || (s.ok + s.bad) === 0) return 'new';
  if (s.box >= 4) return 'mastered';
  if (s.box === 0) return 'weak';
  return 'learning';
}
function record(id, ok) {
  const s = store.stats[id] || (store.stats[id] = { box: 0, ok: 0, bad: 0, last: 0 });
  if (ok) { s.ok++; s.box = Math.min(5, s.box + 1); } else { s.bad++; s.box = 0; }
  s.last = Date.now();
  const day = new Date().toLocaleDateString('sv-SE');
  store.days[day] = (store.days[day] || 0) + 1;
  save();
}

/* =====================================================================
 *  Tiện ích
 * ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hl = s => esc(s).replace(/\*([^*]+)\*/g, '<mark>$1</mark>');
const stripMark = s => s.replace(/\*([^*]+)\*/g, '$1');
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const posBadge = t => `<span class="pos pos-${t}">${esc(t)}</span>`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];
const speakBtn = w => `<button type="button" class="speak" data-speak="${esc(w)}" title="Nghe phát âm" aria-label="Nghe phát âm ${esc(w)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg></button>`;
const ucFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const lcFirst = s => s.charAt(0).toLowerCase() + s.slice(1);

function speak(text) {
  try {
    const synth = window.speechSynthesis; if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.9;
    synth.speak(u);
  } catch (e) { /* trình duyệt không hỗ trợ */ }
}

for (const e of V) {
  e._s = fold([e.w, e.seen, ...e.pos.flatMap(p => [...p.senses.map(s => s.m), ...p.syn]), ...e.fam.map(f => f.w)].join(' | '));
  e._m = e.pos.map(p => ({ t: p.t, all: p.senses.map(s => s.m).join('; '), first: p.senses[0].m }));
}
V.forEach((e, i) => { e._i = i; });

/* =====================================================================
 *  Chi tiết từ (dùng chung: thư viện, luyện tập, điền từ)
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
  const chips = e.pos.map((p, i) => `<button type="button" class="chip pos-${p.t}${openFirst && i === 0 ? ' active' : ''}" data-pos-toggle="${i}" aria-expanded="${openFirst && i === 0}">${esc(p.t)}<small>${POS_LABEL[p.t] || ''}</small></button>`).join('');
  const fam = e.fam.length ? `<div class="sect"><h4>Họ từ (word family)</h4><ul class="kv">${e.fam.map(f => `<li>${linkWord(f.w)}${f.t ? ` ${posBadge(f.t)}` : ''}${f.m ? ` <span>— ${esc(f.m)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
  const tip = e.tip ? `<div class="tip"><b>Mẹo TOEIC:</b> ${esc(e.tip)}</div>` : '';
  return `<div class="detail" data-eid="${e.id}">
    ${header ? `<div class="d-head"><h2>${esc(e.w)}</h2>${speakBtn(e.w)}<span class="ipa">${esc(e.ipa)}</span><span class="tag ${e.src}">${SRC_LABEL[e.src]}</span></div>
    ${e.seen ? `<div class="seen">Gặp trong bài test: ${esc(e.seen)}</div>` : ''}` : ''}
    <div class="pos-chips" role="group" aria-label="Từ loại">${chips}</div>
    <div class="hint">Bấm vào từ loại để xem đầy đủ nghĩa, ví dụ, cụm từ, giới từ, đồng/trái nghĩa.</div>
    <div class="pos-panels">${e.pos.map((p, i) => renderPanel(p, i, !(openFirst && i === 0))).join('')}</div>
    ${(fam || tip) ? `<div class="word-extra">${fam}${tip}</div>` : ''}
  </div>`;
}

function togglePos(btn) {
  const det = btn.closest('.detail'); if (!det) return;
  const idx = btn.dataset.posToggle;
  const wasActive = btn.classList.contains('active');
  det.querySelectorAll('.chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-expanded', 'false'); });
  det.querySelectorAll('.panel').forEach(p => { p.hidden = true; });
  if (!wasActive) {
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
  if (!modal.open) { try { modal.showModal(); } catch (err) { modal.setAttribute('open', ''); } }
}
function closeModal() { try { modal.close(); } catch (err) { modal.removeAttribute('open'); } }
modal.addEventListener('click', ev => { if (ev.target === modal) closeModal(); });

/* =====================================================================
 *  Bộ lọc dùng chung
 * ===================================================================== */
function posOptions(sel) {
  return `<option value="all">Tất cả từ loại</option>` + Object.keys(POS_LABEL).filter(t => V.some(e => e.pos.some(p => p.t === t)))
    .map(t => `<option value="${t}" ${sel === t ? 'selected' : ''}>${t} · ${POS_LABEL[t]}</option>`).join('');
}
function srcOptions(sel) {
  return [['all', 'Tất cả từ'], ['core', 'Từ của bạn (voca.txt)'], ['extra', 'Từ mở rộng']].map(([v, l]) => `<option value="${v}" ${sel === v ? 'selected' : ''}>${l}</option>`).join('');
}
function filterPool({ src = 'all', pos = 'all', st = 'all' }) {
  return V.filter(e => (src === 'all' || e.src === src) && (pos === 'all' || e.pos.some(p => p.t === pos)) && (st === 'all' || statusOf(e.id) === st));
}

/* =====================================================================
 *  View: Thư viện
 * ===================================================================== */
const lib = { q: '', src: 'all', pos: 'all', st: 'all', sort: 'az', order: null };

function viewLibrary() {
  $('#app').innerHTML = `
    <div class="page-head"><h1>Thư viện từ vựng</h1><p>${V.length} từ · ${V.filter(e => e.src === 'core').length} từ từ bài test của bạn · ${V.filter(e => e.src === 'extra').length} từ mở rộng</p></div>
    <div class="toolbar">
      <div class="search"><input id="q" type="search" placeholder="Tìm theo từ tiếng Anh hoặc nghĩa tiếng Việt…" value="${esc(lib.q)}" autocomplete="off" aria-label="Tìm từ"></div>
      <div class="filters">
        <select data-lib="src" aria-label="Nguồn">${srcOptions(lib.src)}</select>
        <select data-lib="pos" aria-label="Từ loại">${posOptions(lib.pos)}</select>
        <select data-lib="st" aria-label="Trạng thái">${[['all', 'Mọi trạng thái'], ...Object.entries(STATUS_LABEL)].map(([v, l]) => `<option value="${v}" ${lib.st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select data-lib="sort" aria-label="Sắp xếp">${[['az', 'A → Z'], ['orig', 'Thứ tự trong file'], ['rand', 'Ngẫu nhiên'], ['bad', 'Sai nhiều nhất']].map(([v, l]) => `<option value="${v}" ${lib.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="count" id="libCount"></span>
      </div>
    </div>
    <div id="libList" class="grid"></div>`;
  renderLibList();
}

function renderLibList() {
  const q = fold(lib.q.trim());
  let list = filterPool(lib).filter(e => !q || e._s.includes(q));
  if (lib.sort === 'az') list.sort((a, b) => a.w.localeCompare(b.w, 'en', { sensitivity: 'base' }));
  else if (lib.sort === 'bad') list.sort((a, b) => ((statOf(b.id) || {}).bad || 0) - ((statOf(a.id) || {}).bad || 0) || a._i - b._i);
  else if (lib.sort === 'rand') {
    if (!lib.order) lib.order = new Map(shuffle(V.map(e => e.id)).map((id, i) => [id, i]));
    list.sort((a, b) => lib.order.get(a.id) - lib.order.get(b.id));
  }
  $('#libCount').textContent = `${list.length} từ`;
  $('#libList').innerHTML = list.length ? list.map(e => `
    <article class="wcard" data-open="${e.id}" tabindex="0" role="button" aria-label="Xem chi tiết ${esc(e.w)}">
      <div class="wc-top"><span class="w">${esc(e.w)}</span>${e.src === 'core' ? '<span class="tag core">của bạn</span>' : ''}<span class="dot ${statusOf(e.id)}" title="${STATUS_LABEL[statusOf(e.id)]}"></span></div>
      <div class="ipa">${esc(e.ipa)}</div>
      <div class="mm">${e._m.map(m => `<div>${posBadge(m.t)}<span>${esc(m.first)}</span></div>`).join('')}</div>
    </article>`).join('') : `<div class="empty" style="grid-column:1/-1">Không tìm thấy từ phù hợp.</div>`;
}

/* =====================================================================
 *  View: Luyện tập (flashcard)
 * ===================================================================== */
let session = null; // {queue, i, revealed, detail, results, mode}

function setupPool() {
  return filterPool({ src: store.prefs.pSource, pos: store.prefs.pPos });
}

function viewPractice() {
  if (session && session.i < session.queue.length) return renderFlash();
  if (session) return renderSummary();
  const p = store.prefs, pool = setupPool();
  const weak = pool.filter(e => statusOf(e.id) === 'weak').length;
  $('#app').innerHTML = `
    <div class="page-head"><h1>Luyện tập</h1><p>Nghĩ nghĩa trong đầu → hiện đáp án → tự chấm Đúng / Sai.</p></div>
    <div class="card setup">
      <div class="setup-grid">
        <div class="field"><label for="pSource">Nguồn từ</label><select id="pSource" data-pref="pSource">${srcOptions(p.pSource)}</select></div>
        <div class="field"><label for="pPos">Từ loại</label><select id="pPos" data-pref="pPos">${posOptions(p.pPos)}</select></div>
        <div class="field"><label for="pCount">Số từ mỗi lượt</label><select id="pCount" data-pref="pCount">${['10', '20', '30', '50', '100', '0'].map(v => `<option value="${v}" ${p.pCount === v ? 'selected' : ''}>${v === '0' ? 'Tất cả' : v}</option>`).join('')}</select></div>
        <div class="field"><label for="pPrio">Thứ tự</label><select id="pPrio" data-pref="pPrio"><option value="smart" ${p.pPrio === 'smart' ? 'selected' : ''}>Thông minh (ưu tiên từ yếu & chưa học)</option><option value="rand" ${p.pPrio === 'rand' ? 'selected' : ''}>Xáo trộn hoàn toàn</option></select></div>
      </div>
      <div class="muted">Kho từ phù hợp: <b>${pool.length}</b> từ${weak ? ` · <b>${weak}</b> từ đang yếu` : ''}.</div>
      <div class="row">
        <button class="btn primary big" data-act="p-start" ${pool.length ? '' : 'disabled'}>Bắt đầu luyện tập</button>
        <span class="muted">Phím tắt: <kbd>Space</kbd> hiện nghĩa · <kbd>→</kbd> đúng · <kbd>←</kbd> sai · <kbd>X</kbd> chi tiết</span>
      </div>
    </div>`;
}

function buildQueue(pool, n, prio) {
  let list = shuffle(pool.slice());
  if (prio === 'smart') {
    const rank = { weak: 0, new: 1, learning: 2, mastered: 3 };
    list.sort((a, b) => rank[statusOf(a.id)] - rank[statusOf(b.id)]);
  }
  if (n > 0) list = list.slice(0, n);
  return shuffle(list).map(e => e.id);
}

function startPractice(ids) {
  session = { queue: ids, i: 0, revealed: false, detail: false, results: [] };
  renderFlash();
}

function renderFlash() {
  const s = session, e = byId.get(s.queue[s.i]);
  const pct = Math.round(s.i / s.queue.length * 100);
  const answer = s.revealed ? `
    <div class="answer">${e._m.map(m => `<div class="line">${posBadge(m.t)}<span>${esc(m.all)}</span></div>`).join('')}</div>
    <div class="actions">
      <button class="btn ok big" data-act="p-ok">✓ Đúng <kbd>→</kbd></button>
      <button class="btn bad big" data-act="p-bad">✗ Sai / Bỏ qua <kbd>←</kbd></button>
    </div>
    <div class="actions" style="margin-top:6px"><button class="btn" data-act="p-detail">${s.detail ? 'Ẩn chi tiết' : 'Xem chi tiết'} <kbd>X</kbd></button></div>
    ${s.detail ? `<div class="detail-wrap">${renderDetail(e, { header: false })}</div>` : ''}`
    : `<div class="reveal-zone"><button class="btn primary big" data-act="p-reveal">Hiện nghĩa <kbd>Space</kbd></button></div>`;
  $('#app').innerHTML = `
    <div class="flash">
      <div class="session-head"><span>${s.i + 1} / ${s.queue.length}</span><div class="progress"><i style="width:${pct}%"></i></div><button class="btn small" data-act="p-quit">Kết thúc</button></div>
      <div class="card">
        <div class="flash-face">
          <div class="flash-word">${esc(e.w)}</div>
          <div class="row" style="justify-content:center;margin-top:6px"><span class="flash-ipa">${esc(e.ipa)}</span>${speakBtn(e.w)}</div>
          <div class="flash-src"><span class="tag ${e.src}">${SRC_LABEL[e.src]}</span> <span class="tag">${STATUS_LABEL[statusOf(e.id)]}</span></div>
        </div>
        ${answer}
      </div>
      <div class="shortcuts"><kbd>S</kbd> nghe phát âm</div>
    </div>`;
}

function mark(ok) {
  const s = session; if (!s || !s.revealed) return;
  const id = s.queue[s.i];
  record(id, ok); s.results.push({ id, ok });
  s.i++; s.revealed = false; s.detail = false;
  if (s.i >= s.queue.length) renderSummary(); else { renderFlash(); window.scrollTo({ top: 0 }); }
}

function renderSummary() {
  const s = session, ok = s.results.filter(r => r.ok).length, bad = s.results.length - ok;
  const wrong = s.results.filter(r => !r.ok).map(r => byId.get(r.id));
  const pct = s.results.length ? Math.round(ok / s.results.length * 100) : 0;
  $('#app').innerHTML = `
    <div class="card summary">
      <h1>Hoàn thành lượt luyện tập</h1>
      <div class="score">${pct}%</div>
      <div class="stat-row"><div class="stat ok"><b>${ok}</b>Đúng</div><div class="stat bad"><b>${bad}</b>Sai / bỏ qua</div><div class="stat"><b>${s.results.length}</b>Tổng</div></div>
      <div class="row" style="justify-content:center">
        ${wrong.length ? `<button class="btn primary" data-act="p-again-wrong">Luyện lại ${wrong.length} từ sai</button>` : ''}
        <button class="btn ${wrong.length ? '' : 'primary'}" data-act="p-new">Lượt mới</button>
        <a class="btn" href="#/progress">Xem tiến độ</a>
      </div>
      ${wrong.length ? `<div class="wrong-list"><h3>Từ cần ôn lại</h3>${wrong.map(e => `<button class="wrong-item" data-open="${e.id}"><b>${esc(e.w)}</b><span>${e._m.map(m => `${posBadge(m.t)} ${esc(m.first)}`).join(' &nbsp; ')}</span></button>`).join('')}</div>` : ''}
    </div>`;
  window.scrollTo({ top: 0 });
}

/* =====================================================================
 *  View: Điền từ (kiểu TOEIC Part 5)
 * ===================================================================== */
let quiz = null; // {qs, i, picked, results}

// các câu ví dụ có đánh dấu *từ mục tiêu* → có thể làm câu hỏi điền từ
const clozeItems = [];
for (const e of V) e.pos.forEach((p, pi) => p.senses.forEach((s, si) => {
  const m = s.ex && s.ex.match(/\*([^*]+)\*/);
  if (m) clozeItems.push({ id: e.id, pi, si, surface: m[1], pos: p.t, src: e.src });
}));

function suffixClass(w) {
  const x = w.toLowerCase();
  if (/ly$/.test(x)) return 'ly';
  if (/ing$/.test(x)) return 'ing';
  if (/(ed|en)$/.test(x)) return 'ed';
  if (/(tion|sion|ment|ness|ity|ance|ence)s?$/.test(x)) return 'noun';
  if (/s$/.test(x) && !/ss$/.test(x)) return 's';
  return 'base';
}

function makeQuestion(item) {
  const e = byId.get(item.id), sense = e.pos[item.pi].senses[item.si];
  const startCap = /^\s*\*/.test(sense.ex);
  const ans = item.surface, nTok = ans.trim().split(/\s+/).length, cls = suffixClass(ans);
  const seen = new Set([ans.toLowerCase()]), dis = [];
  const add = w => {
    if (!w) return false;
    const k = w.toLowerCase();
    if (seen.has(k) || w.trim().split(/\s+/).length !== nTok) return false;
    seen.add(k); dis.push(w); return true;
  };
  // 1) cùng họ từ (kiểu bẫy "word form" của TOEIC)
  for (const f of shuffle(e.fam.slice())) { if (dis.length >= 2) break; add(f.w); }
  // 2) từ khác cùng loại, cùng đuôi
  const others = shuffle(clozeItems.filter(c => c.id !== item.id));
  for (const c of others) { if (dis.length >= 3) break; if (c.pos === item.pos && suffixClass(c.surface) === cls) add(c.surface); }
  for (const c of others) { if (dis.length >= 3) break; if (c.pos === item.pos) add(c.surface); }
  for (const c of others) { if (dis.length >= 3) break; add(c.surface); }
  const norm = w => startCap ? ucFirst(w) : (w === ans ? w : lcFirst(w).replace(/^i$/, 'I'));
  const options = shuffle([ans, ...dis.slice(0, 3)]).map(norm);
  return { id: item.id, pi: item.pi, si: item.si, answer: norm(ans), options, picked: null };
}

function viewCloze() {
  if (quiz && quiz.i < quiz.qs.length) return renderQuestion();
  if (quiz) return renderQuizSummary();
  const p = store.prefs, n = clozeItems.filter(c => p.cSource === 'all' || c.src === p.cSource);
  const uniq = new Set(n.map(c => c.id)).size;
  $('#app').innerHTML = `
    <div class="page-head"><h1>Điền từ · luyện đọc TOEIC</h1><p>Chọn từ đúng cho chỗ trống, giống Part 5 / Part 6.</p></div>
    <div class="card setup">
      <div class="setup-grid">
        <div class="field"><label for="cSource">Nguồn từ</label><select id="cSource" data-pref="cSource">${srcOptions(p.cSource)}</select></div>
        <div class="field"><label for="cCount">Số câu</label><select id="cCount" data-pref="cCount">${['5', '10', '20', '30'].map(v => `<option ${p.cCount === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="muted">Có <b>${uniq}</b> từ có câu ví dụ để tạo câu hỏi. Đáp án nhiễu lấy từ họ từ (evaluate / evaluation / evaluator…) và các từ cùng loại — đúng kiểu bẫy của đề thi.</div>
      <div class="row"><button class="btn primary big" data-act="c-start" ${uniq ? '' : 'disabled'}>Bắt đầu</button><span class="muted">Phím tắt: <kbd>1</kbd>–<kbd>4</kbd> chọn · <kbd>Enter</kbd> câu tiếp</span></div>
    </div>`;
}

function startQuiz() {
  const p = store.prefs, n = parseInt(p.cCount, 10) || 10;
  const pool = shuffle(clozeItems.filter(c => p.cSource === 'all' || c.src === p.cSource));
  const rank = { weak: 0, new: 1, learning: 2, mastered: 3 };
  const byEntry = new Map();
  for (const c of pool) if (!byEntry.has(c.id)) byEntry.set(c.id, c);
  const items = [...byEntry.values()].sort((a, b) => rank[statusOf(a.id)] - rank[statusOf(b.id)]).slice(0, n);
  quiz = { qs: shuffle(items).map(makeQuestion), i: 0, results: [] };
  renderQuestion();
}

function renderQuestion() {
  const qz = quiz, q = qz.qs[qz.i], e = byId.get(q.id), sense = e.pos[q.pi].senses[q.si];
  const done = q.picked !== null, correct = done && q.options[q.picked] === q.answer;
  const sentence = esc(sense.ex).replace(/\*([^*]+)\*/, () => done
    ? `<span class="blank ${correct ? 'ok' : 'bad'}">${esc(q.answer)}</span>`
    : '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>').replace(/\*/g, '');
  const opts = q.options.map((o, k) => {
    let cls = ''; if (done) cls = o === q.answer ? 'right' : (k === q.picked ? 'wrong' : '');
    return `<button class="opt ${cls}" data-act="c-pick" data-k="${k}" ${done ? 'disabled' : ''}><span class="k">${k + 1}</span>${esc(o)}</button>`;
  }).join('');
  const explain = done ? `
    <div class="explain ${correct ? 'ok' : 'bad'}">
      <div class="verdict">${correct ? '✓ Chính xác!' : `✗ Chưa đúng — đáp án: ${esc(q.answer)}`}</div>
      <div>${esc(sense.vi)}</div>
      <div>${posBadge(e.pos[q.pi].t)} <b>${esc(e.w)}</b> ${esc(e.ipa)} — ${esc(sense.m)}</div>
      ${e.tip ? `<div class="muted"><b>Mẹo:</b> ${esc(e.tip)}</div>` : ''}
      <div class="row" style="margin-top:6px"><button class="btn small" data-open="${e.id}">Xem chi tiết từ</button><span class="spacer"></span><button class="btn primary" data-act="c-next">${qz.i + 1 >= qz.qs.length ? 'Xem kết quả' : 'Câu tiếp'} <kbd>Enter</kbd></button></div>
    </div>` : '';
  $('#app').innerHTML = `
    <div class="flash">
      <div class="session-head"><span>Câu ${qz.i + 1} / ${qz.qs.length}</span><div class="progress"><i style="width:${Math.round(qz.i / qz.qs.length * 100)}%"></i></div><button class="btn small" data-act="c-quit">Kết thúc</button></div>
      <div class="card">
        <div class="muted" style="font-size:.88rem">Chọn từ/cụm từ thích hợp nhất để điền vào chỗ trống.</div>
        <div class="q-sentence">${sentence}</div>
        <div class="opts">${opts}</div>
        ${explain}
      </div>
    </div>`;
}

function pickAnswer(k) {
  const q = quiz && quiz.qs[quiz.i]; if (!q || q.picked !== null) return;
  q.picked = k;
  const ok = q.options[k] === q.answer;
  record(q.id, ok); quiz.results.push({ id: q.id, ok });
  renderQuestion();
}

function renderQuizSummary() {
  const ok = quiz.results.filter(r => r.ok).length, total = quiz.results.length;
  const wrong = quiz.results.filter(r => !r.ok).map(r => byId.get(r.id));
  const pct = total ? Math.round(ok / total * 100) : 0;
  $('#app').innerHTML = `
    <div class="card summary">
      <h1>Kết quả bài điền từ</h1>
      <div class="score">${ok}/${total}</div>
      <div class="muted">${pct}% chính xác</div>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-act="c-new">Làm bài mới</button><a class="btn" href="#/progress">Xem tiến độ</a></div>
      ${wrong.length ? `<div class="wrong-list"><h3>Cần xem lại</h3>${wrong.map(e => `<button class="wrong-item" data-open="${e.id}"><b>${esc(e.w)}</b><span>${e._m.map(m => `${posBadge(m.t)} ${esc(m.first)}`).join(' &nbsp; ')}</span></button>`).join('')}</div>` : ''}
    </div>`;
  window.scrollTo({ top: 0 });
}

/* =====================================================================
 *  View: Tiến độ
 * ===================================================================== */
function viewProgress() {
  const counts = { new: 0, weak: 0, learning: 0, mastered: 0 };
  V.forEach(e => counts[statusOf(e.id)]++);
  let ok = 0, bad = 0;
  Object.values(store.stats).forEach(s => { ok += s.ok; bad += s.bad; });
  const acc = ok + bad ? Math.round(ok / (ok + bad) * 100) : 0;
  const colors = { mastered: 'var(--ok)', learning: '#f59e0b', weak: 'var(--bad)', new: 'var(--border)' };
  const seg = k => `<i style="width:${counts[k] / V.length * 100}%;background:${colors[k]}" title="${STATUS_LABEL[k]}: ${counts[k]}"></i>`;
  const days = [...Array(7)].map((_, k) => { const d = new Date(); d.setDate(d.getDate() - (6 - k)); const key = d.toLocaleDateString('sv-SE'); return { key, n: store.days[key] || 0, label: d.toLocaleDateString('vi-VN', { weekday: 'short' }) }; });
  const max = Math.max(1, ...days.map(d => d.n));
  const weakest = Object.entries(store.stats).filter(([, s]) => s.bad > 0).sort((a, b) => b[1].bad - a[1].bad || a[1].box - b[1].box).slice(0, 12).map(([id, s]) => [byId.get(id), s]).filter(([e]) => e);
  const today = store.days[days[6].key] || 0;
  $('#app').innerHTML = `
    <div class="page-head"><h1>Tiến độ</h1><p>Dữ liệu lưu ngay trong trình duyệt này.</p></div>
    <div class="sections">
      <div class="cards3">
        <div class="card"><div class="muted">Đã thuộc</div><div class="big-num" style="color:var(--ok)">${counts.mastered}<small class="muted" style="font-size:1rem"> / ${V.length}</small></div></div>
        <div class="card"><div class="muted">Độ chính xác</div><div class="big-num">${acc}%</div><div class="muted">${ok} đúng · ${bad} sai</div></div>
        <div class="card"><div class="muted">Hôm nay</div><div class="big-num">${today}</div><div class="muted">lượt trả lời</div></div>
      </div>
      <div class="card">
        <h3>Mức độ thuộc từ</h3>
        <div class="stack">${['mastered', 'learning', 'weak', 'new'].map(seg).join('')}</div>
        <div class="legend">${['mastered', 'learning', 'weak', 'new'].map(k => `<span style="--c:${colors[k]}">${STATUS_LABEL[k]}: <b>${counts[k]}</b></span>`).join('')}</div>
        <p class="hint">Đúng → lên một bậc (5 bậc, từ bậc 4 là “đã thuộc”). Sai / bỏ qua → quay về “đang yếu”.</p>
      </div>
      <div class="card"><h3>7 ngày gần đây</h3><div class="days">${days.map(d => `<div><i style="height:${Math.max(3, d.n / max * 64)}px" title="${d.n}"></i>${d.n}<br>${esc(d.label)}</div>`).join('')}</div></div>
      <div class="card"><h3>Những từ hay sai nhất</h3>
        ${weakest.length ? `<div class="wrong-list">${weakest.map(([e, s]) => `<button class="wrong-item" data-open="${e.id}"><b>${esc(e.w)}</b><span>${e._m.map(m => `${posBadge(m.t)} ${esc(m.first)}`).join(' &nbsp; ')} <span class="muted">· sai ${s.bad} lần</span></span></button>`).join('')}</div>` : '<p class="muted">Chưa có từ nào bị sai. Hãy bắt đầu luyện tập!</p>'}
      </div>
      <div class="card">
        <h3>Sao lưu & đặt lại</h3>
        <p class="muted">Xuất file để chuyển sang máy khác, hoặc nhập lại tiến độ đã lưu.</p>
        <div class="row">
          <button class="btn" data-act="export">Xuất tiến độ (.json)</button>
          <label class="btn">Nhập tiến độ<input type="file" id="importFile" accept="application/json" hidden></label>
          <button class="btn bad" data-act="reset">Xóa toàn bộ tiến độ</button>
        </div>
      </div>
    </div>`;
}

function exportProgress() {
  const blob = new Blob([JSON.stringify({ app: 'wao', v: 1, stats: store.stats, days: store.days }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `wao-progress-${new Date().toLocaleDateString('sv-SE')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importProgress(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || typeof d.stats !== 'object') throw new Error('bad');
      store.stats = d.stats; store.days = d.days || {}; save(); route();
      alert('Đã nhập tiến độ.');
    } catch (e) { alert('File không hợp lệ.'); }
  };
  r.readAsText(file);
}

/* =====================================================================
 *  Điều hướng & sự kiện
 * ===================================================================== */
const views = { library: viewLibrary, practice: viewPractice, cloze: viewCloze, progress: viewProgress };
function route() {
  const name = (location.hash.replace(/^#\/?/, '') || 'library').split('/')[0];
  const key = views[name] ? name : 'library';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.view === key));
  views[key]();
}
window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0 }); });

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act],[data-open],[data-speak],[data-pos-toggle]'); if (!t) return;
  if (t.dataset.speak) return speak(t.dataset.speak);
  if (t.dataset.posToggle !== undefined) return togglePos(t);
  if (t.dataset.open) return openModal(t.dataset.open);
  switch (t.dataset.act) {
    case 'modal-close': return closeModal();
    case 'p-start': return startPractice(buildQueue(setupPool(), parseInt(store.prefs.pCount, 10), store.prefs.pPrio));
    case 'p-reveal': session.revealed = true; return renderFlash();
    case 'p-ok': return mark(true);
    case 'p-bad': return mark(false);
    case 'p-detail': session.detail = !session.detail; return renderFlash();
    case 'p-quit': if (session.results.length) { session.queue = session.queue.slice(0, session.i); renderSummary(); } else { session = null; viewPractice(); } return;
    case 'p-again-wrong': return startPractice(shuffle(session.results.filter(r => !r.ok).map(r => r.id)));
    case 'p-new': session = null; return viewPractice();
    case 'c-start': return startQuiz();
    case 'c-pick': return pickAnswer(+t.dataset.k);
    case 'c-next': quiz.i++; if (quiz.i >= quiz.qs.length) renderQuizSummary(); else { renderQuestion(); window.scrollTo({ top: 0 }); } return;
    case 'c-quit': if (quiz.results.length) { quiz.qs = quiz.qs.slice(0, quiz.i + (quiz.qs[quiz.i].picked !== null ? 1 : 0)); quiz.i = quiz.qs.length; renderQuizSummary(); } else { quiz = null; viewCloze(); } return;
    case 'c-new': quiz = null; return viewCloze();
    case 'export': return exportProgress();
    case 'reset': if (confirm('Xóa toàn bộ tiến độ học? Hành động này không thể hoàn tác.')) { store.stats = {}; store.days = {}; save(); viewProgress(); } return;
  }
});

document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.lib) { lib[t.dataset.lib] = t.value; return renderLibList(); }
  if (t.dataset.pref) { store.prefs[t.dataset.pref] = t.value; save(); return route(); }
  if (t.id === 'importFile' && t.files[0]) importProgress(t.files[0]);
});
document.addEventListener('input', ev => { if (ev.target.id === 'q') { lib.q = ev.target.value; renderLibList(); } });

document.addEventListener('keydown', ev => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('wcard')) return openModal(ev.target.dataset.open);
  if (modal.open) return; // <dialog> tự xử lý Esc
  const view = (location.hash.replace(/^#\/?/, '') || 'library');
  const k = ev.key.toLowerCase();
  if (view === 'practice' && session && session.i < session.queue.length) {
    if (!session.revealed) { if (k === ' ' || k === 'enter') { ev.preventDefault(); session.revealed = true; renderFlash(); } }
    else if (k === 'arrowright' || k === '1') { ev.preventDefault(); mark(true); }
    else if (k === 'arrowleft' || k === '2') { ev.preventDefault(); mark(false); }
    else if (k === 'x' || k === 'd') { session.detail = !session.detail; renderFlash(); }
    if (k === 's') speak(byId.get(session.queue[session.i]).w);
  } else if (view === 'cloze' && quiz && quiz.i < quiz.qs.length) {
    const q = quiz.qs[quiz.i];
    if (q.picked === null && /^[1-4]$/.test(k) && +k <= q.options.length) pickAnswer(+k - 1);
    else if (q.picked !== null && (k === 'enter' || k === ' ')) { ev.preventDefault(); quiz.i++; if (quiz.i >= quiz.qs.length) renderQuizSummary(); else { renderQuestion(); window.scrollTo({ top: 0 }); } }
  }
});

/* ---- giao diện sáng/tối ---- */
const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: 'Tự động', light: 'Sáng', dark: 'Tối' };
function applyTheme() {
  if (store.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', store.theme);
  const b = $('#themeBtn'); b.title = `Giao diện: ${THEME_LABEL[store.theme]} (bấm để đổi)`; b.textContent = { auto: '◐', light: '☀', dark: '☾' }[store.theme];
}
$('#themeBtn').addEventListener('click', () => { store.theme = THEMES[(THEMES.indexOf(store.theme) + 1) % 3]; save(); applyTheme(); });

applyTheme();
route();
})();
