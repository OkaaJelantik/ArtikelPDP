import { readFileSync } from 'node:fs';
import { topicKey, similarity } from './parse.mjs';
import { upsertDraft } from './db.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0';
const ACC = /^acc\b/i;

export function splitDelimited(text) {
  const delim = text.includes('\t') && !text.includes(',') ? '\t' : ',';
  const lines = text.replace(/\r/g, '').split('\n');
  const rows = [];
  for (const line of lines) {
    const out = []; let f = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(f); f = ''; }
      else f += c;
    }
    out.push(f);
    if (out.some((v) => v.trim())) rows.push(out);
  }
  return rows;
}

// --- Google Sheets ---
const sheetId = (url) => /spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url)?.[1];
export const csvUrl = (id, gid) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;

/** daftar tab (gid + nama) dibaca dari bootstrap halaman edit */
export async function listTabs(id) {
  const html = await (await fetch(`https://docs.google.com/spreadsheets/d/${id}/edit`, { headers: { 'user-agent': UA } })).text();
  const found = [...html.matchAll(/\\?"(\d{6,})\\?",\[\{\\?"1\\?":\[\[0,0,\\?"([^"\\]{1,40})\\?"/g)].map((m) => ({ gid: m[1], name: m[2] }));
  return [...new Map(found.map((t) => [t.gid, t])).values()];
}

/** slot kolom: "Judul Artikel 1" + "Status" + "Kategori", "Judul Artikel 2" + "Status (2)" + "Kategori (2)" */
function detectSlots(header) {
  const H = header.map((h) => h.trim().toLowerCase());
  const slots = [];
  H.forEach((h, i) => {
    if (!/^judul\b/.test(h)) return;
    const n = Number(/(\d+)\s*$/.exec(h)?.[1] ?? 1);   // "judul artikel 2" → 2
    const status = H.findIndex((x) => x === (n === 1 ? 'status' : `status (${n})`));
    const kat = H.findIndex((x) => x === (n === 1 ? 'kategori' : `kategori (${n})`));
    slots.push({ title: i, status: status >= 0 ? status : -1, kategori: kat >= 0 ? kat : -1 });
  });
  if (!slots.length) {
    const t = H.findIndex((h) => ['judul', 'title', 'topik', 'topic'].includes(h));
    const s = H.findIndex((h) => h === 'status');
    const k = H.findIndex((h) => ['kategori', 'category'].includes(h));
    if (t >= 0) slots.push({ title: t, status: s, kategori: k });
  }
  return slots;
}

// Kategori kanonik sesuai badge-category situs budayabali.com/id
const KANON = [
  'Pura', 'Desa Adat', 'Tradisi', 'Kearifan lokal', 'Alam Bali', 'Pantai', 'Gunung', 'Hutan',
  'Seni', 'Kisah', 'Usadha', 'Bahasa dan Aksara Bali', 'Liputan Khusus',
  'Babad Bergambar', 'Jejak Bali', 'Sanggar Seni Budaya', 'Pura Leluhur', 'Kuliner Bali',
  'Mata Air Suci', 'Air Terjun Bali',
];
const ALIAS = {
  'babad': 'Babad Bergambar',
  'kuliner': 'Kuliner Bali',
  'air terjun': 'Air Terjun Bali',
  'usada': 'Usadha',
  'usadha bali': 'Usadha',
  'liputan': 'Liputan Khusus',
  'sanggar seni bali': 'Sanggar Seni Budaya',
  'sanggar seni': 'Sanggar Seni Budaya',
  'sejarah dan warisan bali': 'Kisah',
};
export function normKategori(s) {
  const v = (s || '').replace(/\s+/g, ' ').trim();
  if (!v) return null;
  const low = v.toLowerCase();
  if (ALIAS[low]) return ALIAS[low];
  const hit = KANON.find((k) => k.toLowerCase() === low);
  return hit || v;
}

const cleanTitle = (s) => (s || '').replace(/\s+/g, ' ').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();

export const DEFAULT_SHEET =
  'https://docs.google.com/spreadsheets/d/12_JVk5EeFBk31HeULR7iDuyZnhi3FXIB6iVlXuARXtA/edit?gid=261510177#gid=261510177';

/**
 * Ekstrak seluruh kelas dari spreadsheet (hanya baris berstatus ACC) ke 1 tabel `draft`
 * di database terpisah, tanpa info kelas dan tanpa kolom status.
 * Mode --sheet menyinkronkan ulang isi tabel secara atomik setelah semua tab berhasil difetch.
 */
export async function importDrafts(draftDb, { file, sheet, gid, siteDb = null, threshold = 0.42 } = {}) {
  const published = siteDb ? siteDb.prepare("SELECT id, judul, kunci FROM artikel WHERE status='publish'").all() : [];
  const byKey = new Map(published.map((a) => [a.kunci, a]));

  const batches = [];
  const isSheetSync = !file && !gid;
  if (file) {
    batches.push({ name: file, text: readFileSync(file, 'utf8') });
  } else {
    const id = sheetId(sheet || DEFAULT_SHEET);
    if (!id) throw new Error('URL Google Sheets tidak valid');
    const wantGid = gid || null;
    const all = await listTabs(id);
    if (!all.length) throw new Error('gagal membaca daftar tab spreadsheet');
    const tabs = wantGid ? all.filter((x) => x.gid === String(wantGid)) : all;   // default: semua tab
    for (const t of tabs) {
      const r = await fetch(csvUrl(id, t.gid), { headers: { 'user-agent': UA }, redirect: 'follow' });
      if (!r.ok) throw new Error(`gagal fetch tab ${t.name}: HTTP ${r.status}`);
      batches.push({ name: t.name, text: await r.text() });
    }
  }

  const seenKeys = isSheetSync
    ? new Map()
    : new Map(draftDb.prepare('SELECT id, judul FROM draft').all().map((r) => [topicKey(r.judul), r.judul]));
  const items = [];
  const total = { acc: 0, masuk: 0, terbitExact: 0, mirip: 0, tanpaJudul: 0 };

  for (const b of batches) {
    const rows = splitDelimited(b.text);
    if (!rows.length) continue;
    const header = rows[0];
    const slots = detectSlots(header);
    const namaIdx = header.findIndex((h) => /^(nama|name|penulis|author)$/i.test(h.trim()));
    if (!slots.length) { console.log(`${b.name}: tidak ada kolom judul, dilewati`); continue; }

    let acc = 0, masuk = 0, kosong = 0;
    for (const r of rows.slice(1)) {
      for (const s of slots) {
        const status = s.status >= 0 ? (r[s.status] || '').trim() : 'ACC';
        if (!ACC.test(status)) continue;
        acc++;
        const title = cleanTitle(r[s.title]);
        if (!title) { kosong++; continue; }
        const key = topicKey(title);
        if (seenKeys.has(key) && seenKeys.get(key) !== title) continue;
        seenKeys.set(key, title);
        if (byKey.has(key)) total.terbitExact++;
        else if (published.length) {
          for (const a of published) {
            if (similarity(title, a.judul) >= threshold) { total.mirip++; break; }
          }
        }
        items.push({
          title,
          kategori: s.kategori >= 0 ? normKategori(r[s.kategori]) : null,
          author: namaIdx >= 0 ? (r[namaIdx] || '').trim() || null : null,
        });
        masuk++;
      }
    }
    console.log(`${b.name}: ACC ${acc} → masuk ${masuk}${kosong ? ` (tanpa judul ${kosong})` : ''}`);
    total.acc += acc; total.masuk += masuk; total.tanpaJudul += kosong;
  }

  draftDb.exec('BEGIN');
  try {
    if (isSheetSync) draftDb.exec('DELETE FROM draft');
    for (const item of items) upsertDraft(draftDb, item);
    draftDb.exec('COMMIT');
  } catch (e) {
    draftDb.exec('ROLLBACK');
    throw e;
  }
  console.log(`TOTAL: ACC ${total.acc} → tabel draft ${total.masuk} baris (tanpa judul ${total.tanpaJudul})`);
  return total;
}
