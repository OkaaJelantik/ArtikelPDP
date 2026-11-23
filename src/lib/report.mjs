import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function stats(db, draftDb = null) {
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const o = (sql, ...p) => db.prepare(sql).get(...p);
  const pub = o("SELECT COUNT(*) n FROM artikel WHERE status='publish'").n;
  const draftRows = draftDb ? draftDb.prepare("SELECT COALESCE(kategori,'-') kategori, COUNT(*) n FROM draft GROUP BY 1").all() : [];
  const draft = draftRows.reduce((a, r) => a + r.n, 0);
  const total = pub + draft;
  const span = o("SELECT MIN(tanggal) a, MAX(tanggal) b FROM artikel WHERE status='publish'");
  const pubKat = q("SELECT COALESCE(kategori,'-') kategori, COUNT(*) n FROM artikel WHERE status='publish' GROUP BY 1");
  const map = new Map();
  for (const r of pubKat) map.set(r.kategori, { kategori: r.kategori, terbit: r.n, draft: 0, total: r.n });
  for (const r of draftRows) {
    const cur = map.get(r.kategori) || { kategori: r.kategori, terbit: 0, draft: 0, total: 0 };
    cur.draft += r.n; cur.total += r.n; map.set(r.kategori, cur);
  }
  const perKat = [...map.values()].sort((a, b) => b.terbit - a.terbit || b.draft - a.draft);
  const perMonth = q(`SELECT substr(tanggal,1,7) bulan, COUNT(*) n FROM artikel
    WHERE status='publish' AND tanggal IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 12`);
  const titles = q("SELECT judul FROM artikel WHERE status='publish'").map((r) => r.judul);
  const words = titles.map((t) => t.split(/\s+/).length);
  const bucket = { '1-5': 0, '6-8': 0, '9-11': 0, '12-15': 0, '16+': 0 };
  for (const w of words) bucket[w <= 5 ? '1-5' : w <= 8 ? '6-8' : w <= 11 ? '9-11' : w <= 15 ? '12-15' : '16+']++;
  const firstWord = {};
  for (const t of titles) {
    const w = t.split(/\s+/)[0].replace(/[^A-Za-zÀ-ÿ]/g, '').toLowerCase();
    if (w.length > 2) firstWord[w] = (firstWord[w] || 0) + 1;
  }
  return {
    total, terbit: pub, draft, span, perKat, perMonth,
    pola: {
      kata_judul: { min: Math.min(...words), avg: Math.round(words.reduce((a, b) => a + b, 0) / (words.length || 1)), max: Math.max(...words), bucket },
      titik_dua: pct(titles.filter((t) => t.includes(':')).length, titles.length),
      tanda_tanya: pct(titles.filter((t) => t.includes('?')).length, titles.length),
      kata_pertama: Object.entries(firstWord).sort((a, b) => b[1] - a[1]).slice(0, 8),
    },
  };
}

export async function report(db, { draftDb = null, json = false, exportFile = null } = {}) {
  const s = stats(db, draftDb);
  if (json) console.log(JSON.stringify(s, null, 2));
  else {
    console.log(`artikel: ${s.terbit} terbit | ${s.draft} draft | rentang ${s.span.a ?? '-'} → ${s.span.b ?? '-'}`);
    console.table(s.perKat);
    console.table(s.perMonth);
    console.table([{ ...s.pola.kata_judul, bucket: JSON.stringify(s.pola.kata_judul.bucket) }]);
    console.table([{ 'pakai titik dua %': s.pola.titik_dua, 'pakai tanda tanya %': s.pola.tanda_tanya }]);
    console.table(s.pola.kata_pertama.map(([k, n]) => ({ kata_pertama: k, jumlah: n })));
  }
  if (exportFile) {
    mkdirSync(dirname(exportFile), { recursive: true });
    const artikelRows = db.prepare(`SELECT kategori,judul,ringkasan,penulis,tanggal,sumber,url
      FROM artikel WHERE status='publish' ORDER BY tanggal DESC`).all();
    const draftRows = draftDb ? draftDb.prepare(`SELECT kategori,judul,penulis FROM draft ORDER BY id DESC`).all() : [];
    writeFileSync(exportFile, JSON.stringify({ dibuat: new Date().toISOString(), ringkas: s, artikel: artikelRows, draft: draftRows }));
    writeFileSync(exportFile.replace(/\.json$/, '.md'),
      [`# Topik budayabali.com (ID)`, '',
        `${s.terbit} artikel terbit (` + '`artikel`' + `), ${s.draft} draft ACC (` + '`draft`' + `). Rentang ${s.span.a} → ${s.span.b}.`, '',
        '| kategori | terbit | draft |', '|---|---|---|',
        ...s.perKat.map((k) => `| ${k.kategori} | ${k.terbit} | ${k.draft} |`), '',
        `Pola judul: rata-rata ${s.pola.kata_judul.avg} kata, ${s.pola.titik_dua}% pakai titik dua, ${s.pola.tanda_tanya}% pakai tanda tanya.`].join('\n'));
    console.log(`export: ${exportFile} (${artikelRows.length} artikel + ${draftRows.length} draft)`);
  }
}
