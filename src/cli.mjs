#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { openDb, openDraftDb } from './lib/db.mjs';
import { crawl, discoverCategories } from './lib/scrape.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const DB = flag('db', 'data/artikel.db');
const DRAFT_DB = flag('draft-db', 'data/draft.db');
const HELP = `artikelpdp — 2 file DB terpisah: ${DB} (situs) & ${DRAFT_DB} (spreadsheet ACC), locale ID

  node src/cli.mjs crawl [--full] [--category Pura,Seni] [--pages N] [--limit N]
                         [--concurrency 24] [--refresh 5]
  node src/cli.mjs draft [--sheet <url-google-sheets> | --file data/draft.csv]
  node src/cli.mjs topik [--kategori Pura] [--tabel draft|artikel] [--limit 20] [--json] [--ringkas]
  node src/cli.mjs verify [--dry] [--concurrency 20]   # buang artikel yang sudah tidak publik
  node src/cli.mjs report [--json]
  node src/cli.mjs export [--out out/topik.json]
  node src/cli.mjs cats
global: --db ${DB} --draft-db ${DRAFT_DB}
`;

if (cmd === 'cats') {
  const cats = await discoverCategories((m) => console.log(m));
  console.table(cats.map((c) => ({ label: c.label, url: c.url, induk: c.parent ?? '-' })));
} else if (cmd === 'crawl') {
  const db = openDb(DB);
  const only = flag('category');
  let cats = await discoverCategories((m) => console.log(m));
  if (only) {
    const wanted = String(only).split(',').map((s) => s.trim().toLowerCase());
    cats = cats.filter((c) => wanted.includes(c.label.toLowerCase()));
    if (!cats.length) throw new Error(`kategori tidak dikenal: ${only}`);
  }
  const stat = await crawl(db, {
    categories: cats, full: !!flag('full'),
    maxPages: Number(flag('pages', Infinity)), maxArticles: Number(flag('limit', Infinity)),
    concurrency: Number(flag('concurrency', 24)), refresh: Number(flag('refresh', 0)),
    log: (m) => console.log(m),
  });
  console.log('== RINGKAS ==', JSON.stringify(stat));
} else if (cmd === 'draft') {
  const { importDrafts, DEFAULT_SHEET } = await import('./lib/drafts.mjs');
  const draftDb = openDraftDb(DRAFT_DB);
  const siteDb = existsSync(DB) ? openDb(DB) : null;
  await importDrafts(draftDb, { file: flag('file'), sheet: flag('sheet', DEFAULT_SHEET), siteDb });
} else if (cmd === 'topik') {
  const tabel = flag('tabel') || (flag('status') === 'publish' ? 'artikel' : 'draft');
  const where = [], params = [];
  if (flag('kategori')) { where.push('kategori LIKE ?'); params.push(`%${flag('kategori')}%`); }
  const limit = Number(flag('limit', 20));
  if (tabel === 'artikel') {
    const db = openDb(DB);
    const rows = db.prepare(`SELECT id, kategori, judul, ringkasan, penulis, tanggal, url FROM artikel
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY tanggal DESC, id DESC LIMIT ?`)
      .all(...params, limit);
    const full = !flag('ringkas');
    const out = rows.map((r) => ({ ...r, ringkasan: r.ringkasan && (full ? r.ringkasan : r.ringkasan.slice(0, 120) + '…') }));
    if (flag('json')) console.log(JSON.stringify(out, null, 1));
    else console.table(out.map((r) => ({ id: r.id, kategori: r.kategori ?? '-', judul: r.judul.slice(0, 70), penulis: r.penulis ?? '-', tanggal: r.tanggal ?? '-' })));
    console.log(`${out.length} baris (${DB} / artikel${flag('kategori') ? ', kategori~' + flag('kategori') : ''})`);
  } else {
    const draftDb = openDraftDb(DRAFT_DB);
    const rows = draftDb.prepare(`SELECT id, kategori, judul, penulis FROM draft
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`)
      .all(...params, limit);
    if (flag('json')) console.log(JSON.stringify(rows, null, 1));
    else console.table(rows.map((r) => ({ id: r.id, kategori: r.kategori ?? '-', judul: r.judul.slice(0, 70), penulis: r.penulis ?? '-' })));
    console.log(`${rows.length} baris (${DRAFT_DB} / draft${flag('kategori') ? ', kategori~' + flag('kategori') : ''})`);
  }
} else if (cmd === 'verify') {
  const { verify } = await import('./lib/verify.mjs');
  await verify(openDb(DB), { concurrency: Number(flag('concurrency', 20)), dry: !!flag('dry') });
} else if (cmd === 'report' || cmd === 'export') {
  const { report } = await import('./lib/report.mjs');
  const db = openDb(DB);
  const draftDb = existsSync(DRAFT_DB) ? openDraftDb(DRAFT_DB) : null;
  await report(db, { draftDb, json: !!flag('json'), exportFile: cmd === 'export' ? flag('out', 'out/topik.json') : null });
} else if (cmd === 'init') {
  openDb(DB); openDraftDb(DRAFT_DB);
  console.log('db siap:', DB, '|', DRAFT_DB);
} else console.log(HELP);
