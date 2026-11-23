# ArtikelPDP — artikel budayabali.com (locale ID) & draft spreadsheet → 2 file SQLite

Dua file database terpisah dengan penamaan kolom & kategori yang konsisten:
- `data/artikel.db` → tabel `artikel` (hasil scrap situs `budayabali.com/id` yang sudah publish)
- `data/draft.db` → tabel `draft` (gabungan seluruh kelas dari spreadsheet, baris berstatus `ACC` saja; hanya `id, kategori, judul, penulis` tanpa info kelas, status, atau summary)

```sql
-- data/artikel.db
artikel(id, kategori, judul, ringkasan, penulis, tanggal, status, sumber, url, kunci, diperbarui)

-- data/draft.db
draft(id, kategori, judul, penulis)
```

## Pakai

```bash
node src/cli.mjs crawl                       # inkremental ke data/artikel.db
node src/cli.mjs crawl --full                # sweep arsip penuh ke data/artikel.db
npm run draft                                # rerun sinkronisasi spreadsheet (ACC) → data/draft.db
node src/cli.mjs draft --sheet "<url-lain>"  # opsional ganti URL sheet lain
node src/cli.mjs draft --file data/draft.csv
node src/cli.mjs topik --kategori Pura --tabel draft --limit 20
node src/cli.mjs report
node src/cli.mjs export                      # out/topik.json + out/topik.md
```

## Aturan yang dipakai

- **Inkremental**: listing urut tanggal terbaru; halaman yang seluruh kartunya sudah ada → berhenti. `--full` menyisir semua halaman tapi artikel yang sudah tersimpan tidak difetch ulang (hanya halaman listing yang dibaca).
- **Fetch ringan**: berhenti setelah `post-summary` + author + tanggal utuh (±75 KB), bukan 7 MB penuh.
- **Draft konsisten**: hanya baris berstatus `ACC` yang difetch dari seluruh tab kelas, digabung ke 1 tabel `draft` di `data/draft.db` dengan kolom `id, kategori, judul, penulis` (tanpa info kelas, tanpa kolom `status`, dan tanpa summary), dengan `kategori` ternormalisasi mengikuti kategori situs di `data/artikel.db`.
