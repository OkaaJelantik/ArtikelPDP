---
name: sintesa-judul
description: Memandu agent/LLM menyintesa judul artikel budaya Bali (gaya budayabali.com / PDP) secara deterministik agar siap ACC dan publish berdasarkan pola data/artikel.db. Gunakan skill ini setiap kali user meminta dibuatkan judul artikel, mengajukan topik/tema/keyword artikel budaya Bali, meminta revisi atau polesan judul agar layak ACC, atau ingin brainstorming sudut pembahasan sebelum menulis judul — bahkan jika user hanya menyebut satu topik singkat seperti "Gong Luang" atau "Pura Besakih".
---

# Sintesa Judul Artikel (Gaya ACC `budayabali.com`)

Skill ini memastikan proses sintesa judul berjalan **deterministik**: tidak langsung menebak judul saat topik masih kabur, selalu menyaring judul sesuai pola editorial `data/artikel.db`, dan selalu menawarkan variasi format yang relevan setelah draft dibuat.

> **Referensi Pola Data:** Sebelum menyusun draft pada Tahap 2 atau menawarkan variasi pada Tahap 4, baca `references/pola-judul.md` untuk mencocokkan kategori, 6 arketipe struktur judul, diksi kunci, dan filter ACC.

---

## Workflow 4 Tahap (Ikuti Berurutan)

### Tahap 1 — Audit Kejelasan & Scope Topik (Clarity Gate)

Setiap kali user memberikan topik, ide, atau bahan artikel, evaluasi **3 hal** sebelum menulis satu pun draft judul:

1. **Kejelasan Entitas:** Apakah objek/subjek utamanya spesifik (mis. *Gong Luang*, *Pura Dalem Tamblingan*, *Loloh Lempuyang*) atau terlalu luas (*gamelan Bali*, *pura di Bali*, *obat tradisional*)?
2. **Kejelasan Scope / Angle:** Apakah sudah ada arah pembahasan yang tegas (mis. *"Perkembangan Gong Luang"*, *"Tradisi buka pasar saat Nyepi di Pura Majelangu"*, atau user melampirkan ringkasan/data riset), atau masih punya banyak probabilitas maksud lain?
3. **Kesiapan Arah User:** Apakah user terlihat sudah tahu persis apa yang ingin diangkat, atau baru melempar kata kunci mentah?

**Aturan Routing:**
- **Scope JELAS** (entitas spesifik + angle/data sudah mengerucut) → langsung ke **Tahap 2**.
- **Scope AMBIGU / TERLALU GENERAL** (hanya menyebut nama topik tanpa angle, terlalu luas, atau banyak tafsir arah) → wajib ke **Tahap 3**. Jangan langsung memuntahkan daftar judul final.

---

### Tahap 2 — Sintesa Draft Judul (Saat Scope Jelas)

1. Tentukan **kategori target** yang paling cocok (`Pura`, `Kisah`, `Usadha`, `Pantai`, `Tradisi`, `Kearifan lokal`, `Seni`, `Desa Adat`, `Alam Bali`, `Gunung`, `Hutan`) menggunakan `references/pola-judul.md`.
2. *(Opsional, jika relevan untuk cek duplikasi topik)* Cek apakah topik serupa sudah pernah terbit di `data/artikel.db` (kolom `judul` / `kunci`) agar sudut yang diajukan tetap segar dan tidak bentrok.
3. Susun **3–5 draft judul** yang lolos **Filter ACC**:
   - **Panjang ideal:** 8–12 kata (57–80 karakter).
   - **Nada editorial:** Deklaratif, informatif-kultural, agak puitis/naratif — **bukan clickbait** (hindari `?`, `!`, dash ` - `, atau hiperbola kosong).
   - **Struktur jelas:** Entitas spesifik + angle pembeda + jangkar lokasi/konteks Bali bila relevan.
   - **Tidak monoton:** Berikan label pola ringkas di samping/bawah tiap opsi (mis. *Pola Titik Dua: Entitas–Angle*, *Pola Aposisi Koma*, *Pola Naratif Kontras*) agar user bisa membandingkan rasa dan strukturnya.
4. Lanjut ke **Tahap 4**.

---

### Tahap 3 — Klarifikasi Berbasis Dugaan (Saat Input Ambigu)

Jika hasil Tahap 1 menyatakan input masih ambigu atau terlalu general:

1. **Jangan bertanya kosong** seperti *"Kamu mau bahas apa tentang ini?"*.
2. Dari proses penalaranmu, turunkan **3–4 kemungkinan arah pembahasan (angles/ways)** yang konkret dan sesuai konteks budaya Bali — misalnya membedakan antara:
   - *Fokus lokal/spesifik lokasi/desa* (contoh: **Gong Luang Desa Tangkas**)
   - *Pengenalan/profil & fungsi sakral* (contoh: **Mengenal Gong Luang dan Maknanya dalam Upacara**)
   - *Sejarah/asal-usul/perkembangan* (contoh: **Bagaimana Gong Luang Masuk dan Berkembang di Bali**)
   - *Keunikan/perbandingan/pelestarian* (contoh: **Nasib & Pelestarian Gong Luang di Era Modern**)
3. Sampaikan ke user dengan gaya kolaboratif:
   > *"Topik **[Nama Topik]** masih cukup luas dan bisa diangkat dari beberapa sudut. Aku memikirkan beberapa arah pembahasan ini:*
   > *1. **[Dugaan Arah 1]** — (penjelasan singkat 1 kalimat)*
   > *2. **[Dugaan Arah 2]** — (penjelasan singkat 1 kalimat)*
   > *3. **[Dugaan Arah 3]** — (penjelasan singkat 1 kalimat)*
   >
   > *Apakah ada yang sesuai dengan pikiranmu, atau ada fokus/data lain yang ingin kamu angkat?"*
4. Begitu user memilih salah satu arah atau memberi detail tambahan → masuk ke **Tahap 2**.

---

### Tahap 4 — Validasi Format & Tawaran Variasi Pola (Pasca Sintesa)

Judul yang ACC di `data/artikel.db` beragam: tidak selalu memakai pemisah titik dua (`:`) dan tidak selalu satu pola semantik. Oleh karena itu, **setiap kali selesai mengajukan draft judul di Tahap 2, wajib tutup dengan konfirmasi format**:

1. Tanyakan apakah format/gaya draft yang diajukan sudah sesuai keinginan user.
2. **Sebutkan 2–3 pola variasi alternatif yang cocok dengan tema tersebut** (ambil dari Katalog 6 Pola di `references/pola-judul.md`) agar user punya opsi eksplorasi yang jelas.

Contoh penutup Tahap 4:
> *"Apakah format draft di atas sudah sesuai, atau kamu ingin mencoba format lain? Untuk tema **[Tema]** ini, pola variasi lain yang juga cocok antara lain:*
> - ***Pola Aposisi Koma** (`[Entitas], [Penjelas/Status]`) — terasa lebih mengalir seperti esai.*
> - ***Pola Naratif Kontras** (`[Entitas]: Dari [A] hingga [B]` atau `Ketika [X] ...`) — kuat untuk menonjolkan perjalanan sejarah/perubahan.*
> - ***Pola Deskriptif Langsung** (tanpa titik dua) — lebih lugas dan langsung ke inti bahasan."*

---

## Contoh Penerapan Singkat

### Contoh 1 — Input Ambigu (Tahap 1 → Tahap 3)
- **User:** *"Bantu bikinin judul tentang Gong Luang."*
- **Evaluasi Tahap 1:** Entitas jelas (*Gong Luang*), tetapi scope/angle belum ada (bisa sejarah masuknya, profil alat, fokus desa tertentu, atau pelestariannya). → **Masuk Tahap 3**.
- **Respon Agent:** Mengajukan 3 dugaan arah (*Gong Luang Desa Tangkas*, *Mengenal Gong Luang & fungsi sakralnya*, *Sejarah masuknya Gong Luang ke Bali*), lalu menanyakan mana yang paling sesuai pikiran user.

### Contoh 2 — Input Jelas (Tahap 1 → Tahap 2 → Tahap 4)
- **User:** *"Bantu bikinin judul tentang Perkembangan Gong Luang di Bali."*
- **Evaluasi Tahap 1:** Entitas jelas (*Gong Luang*) + scope jelas (*perkembangan di Bali*). → **Langsung Tahap 2**.
- **Respon Agent:**
  1. Menyajikan 3–4 draft judul yang mematuhi Filter ACC (8–12 kata, deklaratif-kultural, bebas clickbait) dengan label pola.
  2. Menutup dengan **Tahap 4**: menanyakan kesesuaian format sekaligus menyebutkan 2–3 pola variasi lain yang cocok untuk tema sejarah/perkembangan seni.
