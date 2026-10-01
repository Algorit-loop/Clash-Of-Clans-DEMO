// Build data.js from data/*.txt  —  chạy: node build.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, 'data');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort();
const POS = new Set(['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'phr']);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const list = (s, sep) => s.split(sep).map(x => x.trim()).filter(Boolean);
const pair = s => { const i = s.indexOf(' = '); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 3).trim()]; };

const words = [], seen = new Map(), warn = [];
for (const f of files) {
  const src = f.startsWith('core') ? 'core' : 'extra';
  let e = null, p = null;
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((raw, i) => {
    const line = raw.trim(), at = `${f}:${i + 1}`;
    if (!line || line.startsWith('//')) return;
    if (line.startsWith('# ')) {
      const [w, ipa = '', extra = ''] = line.slice(2).split(' | ').map(x => x.trim());
      const key = w.toLowerCase();
      if (seen.has(key)) warn.push(`TRÙNG ${w} (${at} và ${seen.get(key)})`);
      seen.set(key, at);
      e = { id: slug(w), w, ipa, src, seen: extra.replace(/^seen:\s*/, ''), pos: [], fam: [], tip: '' };
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
      else p[m[1]] = list(m[2], ',');
      return;
    }
    warn.push(`Dòng không hiểu ${at}: ${line.slice(0, 50)}`);
  });
}
for (const e of words) if (!e.pos.length || e.pos.some(p => !p.senses.length)) warn.push(`Entry thiếu nghĩa: ${e.w}`);
const core = words.filter(w => w.src === 'core').length;
fs.writeFileSync(path.join(import.meta.dirname, 'data.js'),
  `// Tự sinh bởi build.mjs — đừng sửa tay, hãy sửa data/*.txt\nwindow.VOCAB = ${JSON.stringify(words)};\n`);
console.log(`OK: ${words.length} từ (core ${core}, extra ${words.length - core}) từ ${files.length} file`);
warn.forEach(w => console.log('⚠', w));
