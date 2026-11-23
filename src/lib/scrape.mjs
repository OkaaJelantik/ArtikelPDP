import { fetchHtml, pool, sleep } from './http.mjs';
import { HOME, parseNav, parseList, parseArticle, slugOf } from './parse.mjs';
import { upsertPublished, maxTanggal, knownUrls } from './db.mjs';

export const SUMBER = 'budayabali.com';

export async function discoverCategories(log = () => {}) {
  const home = await fetchHtml(HOME, { maxBytes: 900_000 });
  const cats = parseNav(home.html);
  log(`kategori (${cats.length}): ${cats.map((c) => c.label).join(' | ')}`);
  return cats;
}

/**
 * Inkremental tanpa tabel state: patokan diambil dari data sendiri.
 * Berhenti di sebuah halaman hanya bila (a) semua kartunya sudah ada di DB
 * dan (b) tanggal terbaru halaman itu tidak lebih baru dari artikel terbaru
 * yang sudah tersimpan. Run pertama (DB kosong) otomatis menyisir penuh.
 */
export async function crawl(db, opts = {}) {
  const { categories = null, full = false, maxPages = Infinity, maxArticles = Infinity,
    concurrency = 24, delayMs = 100, refresh = 0, log = () => {} } = opts;

  const cats = categories ?? (await discoverCategories(log));
  const stat = { fetched: 0, inserted: 0, updated: 0, unchanged: 0, errors: 0, pages: 0, stopped: 0 };

  for (const cat of cats) {
    const known = knownUrls(db);
    let cursorDate = maxTanggal(db, cat.label);
    let lastPage = 1;
    for (let page = 1; page <= Math.min(lastPage, maxPages); page++) {
      const url = page === 1 ? cat.url : `${cat.url}?page=${page}`;
      const res = await fetchHtml(url, { maxBytes: 900_000 });
      if (res.status !== 200) { stat.errors++; log(`  ! ${cat.label} p${page} status ${res.status}`); break; }
      const { cards, lastPage: lp } = parseList(res.html, url);
      if (page === 1) lastPage = lp || 1;
      stat.pages++;

      const fresh = [], refreshList = [];
      let pageNewest = null;
      cards.forEach((card, idx) => {
        if (card.dateRaw) {
          const d = card.dateRaw.replace(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/, '$3-$1-$2');
          const iso = isoOf(card.dateRaw);
          if (iso && (!pageNewest || iso > pageNewest)) pageNewest = iso;
        }
        if (!known.has(card.url)) fresh.push(card);
        else if (idx < refresh) refreshList.push(card);
      });

      log(`  ${cat.label} p${page}/${lastPage}: ${cards.length} kartu, ${fresh.length} baru`);
      // inkremental: berhenti di halaman pertama yang seluruh kartunya sudah ada di DB.
      // Pemakaian pertama / melanjutkan sweep yang terputus → pakai --full (fetch detail
      // artikel lama tetap dilewati, jadi biayanya cuma halaman listing).
      if (!fresh.length && !refreshList.length && !full) {
        stat.stopped++;
        break;
      }

      const targets = [...refreshList, ...fresh].slice(0, Math.max(0, maxArticles - (stat.inserted + stat.updated)));
      await pool(targets, concurrency, async (card) => {
        let r = await fetchHtml(card.url, { maxBytes: 600_000, earlyStop: true });
        if (r.status !== 200) { stat.errors++; log(`    ! ${card.slug} ${r.status}`); return; }
        let a = parseArticle(r.html, card.url);
        if (!a.title || !a.summary) {
          // halaman terpotong / markup tak biasa → ambil ulang tanpa early-stop
          r = await fetchHtml(card.url, { maxBytes: 3_000_000, earlyStop: false });
          a = parseArticle(r.html, card.url);
        }
        if (!a.title || !a.summary) { stat.errors++; log(`    ! ${card.slug} field kosong`); return; }
        const how = upsertPublished(db, {
          kategori: a.badgeCategory || cat.label,
          title: a.title, summary: a.summary, author: a.author, tanggal: a.publishedAt,
          url: card.url, sumber: SUMBER,
        });
        stat.fetched++; stat[how]++;
        if (stat.fetched % 50 === 0) log(`    .. ${stat.fetched} difetch (baru ${stat.inserted}, update ${stat.updated}, sama ${stat.unchanged}, err ${stat.errors})`);
        await sleep(delayMs);
      });

      if (stat.inserted + stat.updated >= maxArticles) break;
      const d = maxTanggal(db, cat.label);
      if (d) cursorDate = d;
      await sleep(delayMs);
    }
  }
  return stat;
}

function isoOf(raw) {
  const m = /([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/.exec(raw || '');
  if (!m) return null;
  const mo = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, ags: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 }[m[1].toLowerCase()];
  return mo ? `${m[3]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}
