// Build data.js từ data/vocab/*.txt và data/toeic/*.txt  —  chạy: node build.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = import.meta.dirname;
const read = (dir) => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.txt')).sort()
  .map(f => ({ f, lines: fs.readFileSync(path.join(root, dir, f), 'utf8').split('\n') }));
const warn = [];
// mã ổn định theo nội dung → thêm/bớt câu không làm lệch lịch sử làm bài
const hash = str => { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/* ------------------------- Từ vựng ------------------------- */
const POS = new Set(['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'phr']);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const list = (s, sep) => s.split(sep).map(x => x.trim()).filter(Boolean);
const pair = s => { const i = s.indexOf(' = '); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 3).trim()]; };
// "loyal (1)" -> "loyal"; giữ ghi chú dạng chữ, bỏ số thứ tự nghĩa / nhãn từ loại
const cleanWord = s => s.replace(/\s*\((?:\d+|n|v|adj|adv|prep|conj)\)\s*$/, '').trim();

const words = [], seen = new Map();
for (const { f, lines } of read('data/vocab')) {
  let e = null, p = null;
  lines.forEach((raw, i) => {
    const line = raw.trim(), at = `${f}:${i + 1}`;
    if (!line || line.startsWith('//')) return;
    if (line.startsWith('# ')) {
      const [w, ipa = ''] = line.slice(2).split(' | ').map(x => x.trim());
      const key = w.toLowerCase();
      if (seen.has(key)) warn.push(`TRÙNG ${w} (${at} và ${seen.get(key)})`);
      seen.set(key, at);
      e = { id: slug(w), w, ipa, pos: [], fam: [], tip: '' };
      words.push(e); p = null; return;
    }
    if (!e) return warn.push(`Dòng ngoài entry ${at}`);
    if (line.startsWith('@')) {
      const t = line.slice(1).trim();
      if (!POS.has(t)) warn.push(`POS lạ "${t}" ${at}`);
      p = { t, senses: [], col: [], prep: [], syn: [], ant: [], use: '' };
      e.pos.push(p); return;
    }
    let m;
    if ((m = line.match(/^(fam|tip):\s*(.*)$/))) {
      if (m[1] === 'fam') e.fam = list(m[2], ';').filter(x => x !== '—').map(x => { const mm = x.match(/^(.+?)\s*\((\w+)\)\s*(.*)$/); return mm ? { w: mm[1], t: mm[2], m: mm[3] } : { w: x, t: '', m: '' }; });
      else e.tip = m[2];
      return;
    }
    if (!p) return warn.push(`Dòng ngoài POS ${at}: ${line.slice(0, 40)}`);
    if ((m = line.match(/^\d+\.\s*(.*)$/))) {
      const [mean, ex = '', vi = ''] = m[1].split(' | ').map(x => x.trim());
      if (!ex) warn.push(`Thiếu ví dụ ${e.w} ${at}`);
      else if (!/\*[^*]+\*/.test(ex)) warn.push(`Ví dụ thiếu *đánh dấu* ${e.w} ${at}`);
      p.senses.push({ m: mean, ex, vi }); return;
    }
    if ((m = line.match(/^(col|prep|syn|ant|use):\s*(.*)$/))) {
      if (m[1] === 'col' || m[1] === 'prep') p[m[1]] = list(m[2], ';').map(pair);
      else if (m[1] === 'use') p.use = m[2];
      else p[m[1]] = [...new Set(list(m[2], /[,;]/).map(cleanWord).filter(Boolean))];
      return;
    }
    warn.push(`Dòng không hiểu ${at}: ${line.slice(0, 50)}`);
  });
}
for (const e of words) if (!e.pos.length || e.pos.some(p => !p.senses.length)) warn.push(`Entry thiếu nghĩa: ${e.w}`);

/* ------------------------- TOEIC Part 5 / 6 ------------------------- */
const CATS = new Set(['wordform', 'tense', 'voice', 'verbform', 'agreement', 'prep', 'conj', 'pron', 'relative', 'compare', 'quant', 'vocab', 'sentence']);
function checkQ(q, at) {
  if (!CATS.has(q.cat)) warn.push(`Loại câu hỏi lạ "${q.cat}" ${at}`);
  if (q.opts.length !== 4) warn.push(`Câu hỏi không đủ 4 lựa chọn (${q.opts.length}) ${at}`);
  if (q.ans < 0 || q.opts.filter((_, i) => i === q.ans).length !== 1) warn.push(`Câu hỏi thiếu đáp án đúng ${at}`);
  if (q._plus > 1) warn.push(`Câu hỏi có nhiều đáp án đúng ${at}`);
  if (new Set(q.opts.map(o => o.toLowerCase())).size !== q.opts.length) warn.push(`Lựa chọn trùng nhau ${at}`);
  if (!q.why) warn.push(`Thiếu giải thích ${at}`);
  delete q._plus;
}
function optLine(q, line) {
  if (/^[+-] /.test(line)) { if (line[0] === '+') { q.ans = q.opts.length; q._plus = (q._plus || 0) + 1; } q.opts.push(line.slice(2).trim()); return true; }
  if (line.startsWith('= ')) { q.why = line.slice(2).trim(); return true; }
  if (line.startsWith('~ ')) { q.vi = line.slice(2).trim(); return true; }
  return false;
}

const p5 = [], p6 = [];
for (const { f, lines } of read('data/toeic')) {
  if (f.startsWith('part5')) {
    let q = null, at = '';
    const done = () => { if (q) { q.id = 'p5-' + hash(q.text); if (p5.some(x => x.id === q.id)) warn.push(`Câu Part 5 trùng nội dung ${at}`); if (!q.text.includes('-------')) warn.push(`Thiếu chỗ trống ${at}`); checkQ(q, at); p5.push(q); } };
    lines.forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('//')) return;
      if (line.startsWith('@ ')) { done(); at = `${f}:${i + 1}`; q = { id: '', cat: line.slice(2).trim(), text: '', opts: [], ans: -1, why: '', vi: '' }; return; }
      if (!q) return;
      if (!optLine(q, line)) q.text += (q.text ? ' ' : '') + line;
    });
    done();
  } else if (f.startsWith('part6')) {
    let ps = null, mode = '', q = null, at = '';
    const doneQ = () => { if (q) { checkQ(q, at); ps.qs.push(q); q = null; } };
    const doneP = () => {
      if (!ps) return; doneQ();
      ps.text = ps.text.replace(/\n{3,}/g, '\n\n').trim();
      for (let k = 1; k <= ps.qs.length; k++) if (!ps.text.includes(`[${k}]`)) warn.push(`Đoạn "${ps.title}" thiếu chỗ trống [${k}]`);
      if (ps.qs.length !== 4) warn.push(`Đoạn "${ps.title}" có ${ps.qs.length} câu (cần 4)`);
      if (!ps.qs.some(x => x.cat === 'sentence')) warn.push(`Đoạn "${ps.title}" thiếu câu chèn câu`);
      p6.push(ps);
    };
    lines.forEach((raw, i) => {
      const line = raw.replace(/\s+$/, '');
      if (line.startsWith('//')) return;
      if (line.startsWith('### ')) { doneP(); const [type, title = ''] = line.slice(4).split(' | '); ps = { id: 'p6-' + slug(title || type), type: type.trim(), title: title.trim(), text: '', qs: [], vi: '' }; mode = 'text'; return; }
      if (!ps) return;
      if (line.trim() === '???') { mode = 'qs'; return; }
      if (mode === 'text') { ps.text += line + '\n'; return; }
      const t = line.trim(); if (!t) return;
      let m;
      if ((m = t.match(/^\[(\d+)\]\s*@\s*(\w+)/))) { doneQ(); at = `${f}:${i + 1}`; q = { n: +m[1], cat: m[2], opts: [], ans: -1, why: '' }; return; }
      if (t.startsWith('VI: ')) { doneQ(); ps.vi = t.slice(4).trim(); return; }
      if (!q || !optLine(q, t)) warn.push(`Dòng không hiểu ${f}:${i + 1}: ${t.slice(0, 50)}`);
    });
    doneP();
  }
}

fs.writeFileSync(path.join(root, 'data.js'),
  `// Tự sinh bởi build.mjs — đừng sửa tay, hãy sửa data/vocab/*.txt và data/toeic/*.txt\n` +
  `window.VOCAB = ${JSON.stringify(words)};\nwindow.TOEIC = ${JSON.stringify({ p5, p6 })};\n`);
console.log(`OK: ${words.length} từ · Part 5: ${p5.length} câu · Part 6: ${p6.length} đoạn (${p6.reduce((a, p) => a + p.qs.length, 0)} câu)`);
const cats = {}; p5.forEach(q => cats[q.cat] = (cats[q.cat] || 0) + 1); console.log('Part 5 theo loại:', cats);
warn.forEach(w => console.log('⚠', w));
