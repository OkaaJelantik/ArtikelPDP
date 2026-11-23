import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { topicKey } from './parse.mjs';

// Dua file database terpisah:
// 1) data/artikel.db → tabel `artikel` (hasil scrap situs yang sudah publish)
// 2) data/draft.db   → tabel `draft` (gabungan seluruh kelas dari spreadsheet, baris ACC saja: kategori, judul, penulis)
export const SITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS artikel (
  id         INTEGER PRIMARY KEY,
  kategori   TEXT,                    -- badge-category (Pura, Pantai, Seni, ...)
  judul      TEXT NOT NULL,           -- post-title
  ringkasan  TEXT,                    -- post-summary
  penulis    TEXT,                    -- item-meta-author
  tanggal    TEXT,                    -- YYYY-MM-DD
  status     TEXT NOT NULL,           -- publish
  sumber     TEXT,                    -- domain situs
  url        TEXT,
  kunci      TEXT NOT NULL,           -- judul ternormalisasi utk dedupe & pencocokan
  diperbarui TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_artikel_url   ON artikel(url) WHERE url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_artikel_kunci ON artikel(kunci, status);
CREATE INDEX IF NOT EXISTS ix_artikel_kat ON artikel(kategori, tanggal DESC);
`;

export const DRAFT_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS draft (
  id       INTEGER PRIMARY KEY,
  kategori TEXT,                      -- dinormalisasi konsisten dengan kategori tabel artikel
  judul    TEXT NOT NULL,             -- dari kolom "Judul Artikel"
  penulis  TEXT                       -- dari kolom "Nama"
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_draft_judul ON draft(judul);
CREATE INDEX IF NOT EXISTS ix_draft_kat ON draft(kategori);
`;

export function openDb(path = 'data/artikel.db') {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SITE_SCHEMA);
  return db;
}

export function openDraftDb(path = 'data/draft.db') {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(DRAFT_SCHEMA);
  return db;
}

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export function upsertPublished(db, a) {
  const key = topicKey(a.title);
  const row = a.url ? db.prepare('SELECT id, kunci FROM artikel WHERE url = ?').get(a.url) : null;
  if (!row) {
    db.prepare(`INSERT INTO artikel (kategori,judul,ringkasan,penulis,tanggal,status,sumber,url,kunci,diperbarui)
      VALUES (?,?,?,?,?,'publish',?,?,?,?)
      ON CONFLICT(kunci,status) DO UPDATE SET
        judul=excluded.judul, ringkasan=excluded.ringkasan, penulis=excluded.penulis,
        tanggal=excluded.tanggal, kategori=excluded.kategori, url=excluded.url, diperbarui=excluded.diperbarui`)
      .run(a.kategori ?? null, a.title, a.summary ?? null, a.author ?? null, a.tanggal ?? null,
        a.sumber ?? null, a.url ?? null, key, now());
    return 'inserted';
  }
  const changed = db.prepare(`UPDATE artikel SET kategori=?,judul=?,ringkasan=?,penulis=?,tanggal=?,kunci=?,diperbarui=?
    WHERE id=? AND (judul IS NOT ? OR ringkasan IS NOT ? OR penulis IS NOT ? OR tanggal IS NOT ?)`)
    .run(a.kategori ?? null, a.title, a.summary ?? null, a.author ?? null, a.tanggal ?? null, key, now(),
      row.id, a.title, a.summary ?? null, a.author ?? null, a.tanggal ?? null);
  return changed.changes ? 'updated' : 'unchanged';
}

export const maxTanggal = (db, kategori) =>
  db.prepare("SELECT MAX(tanggal) t FROM artikel WHERE kategori=? AND status='publish'").get(kategori)?.t ?? null;

export const knownUrls = (db) => new Set(db.prepare("SELECT url FROM artikel WHERE status='publish' AND url IS NOT NULL").all().map((r) => r.url));

export function upsertDraft(db, d) {
  db.prepare(`INSERT INTO draft (kategori,judul,penulis)
    VALUES (?,?,?)
    ON CONFLICT(judul) DO UPDATE SET
      kategori=excluded.kategori, penulis=excluded.penulis`)
    .run(d.kategori ?? null, d.title, d.author ?? null);
  return 'draft';
}
