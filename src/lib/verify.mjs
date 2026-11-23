import { fetchHtml, pool } from './http.mjs';
import { parseArticle, slugOf } from './parse.mjs';

/**
 * Cek ulang semua baris 'publish': hanya artikel yang benar-benar tampil publik
 * (HTTP 200 + og:type=article + post-title + post-summary + canonical cocok)
 * yang dipertahankan. Sisanya dihapus dari tabel.
 */
export async function verify(db, { concurrency = 20, dry = false, log = console.log } = {}) {
  const rows = db.prepare("SELECT id, url, judul FROM artikel WHERE status='publish' AND url IS NOT NULL").all();
  log(`verifikasi ${rows.length} baris...`);
  let ok = 0, removed = 0, i = 0;
  const bad = [];
  await pool(rows, concurrency, async (row) => {
    let r = await fetchHtml(row.url, { maxBytes: 600_000, earlyStop: true });
    let a = parseArticle(r.html, row.url);
    if (r.status !== 200 || !a.title || !a.summary) {           // satu percobaan ulang: jangan hapus karena gangguan sesaat
      r = await fetchHtml(row.url, { maxBytes: 3_000_000, earlyStop: false });
      a = parseArticle(r.html, row.url);
    }
    const canonicalOk = r.html.includes(`rel="canonical"`) && slugOf(row.url) !== '';
    const artikel = r.status === 200 && canonicalOk && r.html.includes('property="og:type" content="article"') && a.title && a.summary;
    if (artikel) { ok++; }
    else {
      bad.push({ id: row.id, judul: row.judul, status: r.status });
      if (!dry) db.prepare('DELETE FROM artikel WHERE id = ?').run(row.id);
      removed++;
    }
    if (++i % 100 === 0) log(`  .. ${i}/${rows.length} (hapus ${removed})`);
  });
  if (bad.length) log(`contoh yang dibuang: ${JSON.stringify(bad.slice(0, 5))}`);
  log(`verifikasi selesai: ${ok} tetap, ${removed} dibuang${dry ? ' (dry-run)' : ''}`);
  return { ok, removed };
}
