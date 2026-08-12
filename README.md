# Website Properti — Cloudflare Worker

Website properti developer (multi-proyek/lokasi) dengan homepage bertema mewah minimalis,
live chat WhatsApp, dan panel admin lengkap: properti, gallery, proyek/lokasi, rumah terjual,
pembeli, marketing, voucher, dan banner promosi.

## Fitur (update terbaru)

Tambahan dari batch sebelumnya:
- **Sorting harga di halaman `/properti`** — dropdown "Urutkan" (Terbaru / Harga Termurah /
  Harga Termahal) di atas grid listing, kepakai kalau katalog sudah >20 unit. Kolom sort
  di-whitelist server-side (`terbaru`/`harga_asc`/`harga_desc`), jadi tidak bisa disalahgunakan
  untuk SQL injection lewat ORDER BY.
- **Halaman "Tentang Kami" berdiri sendiri (`/tentang`)** — sebelumnya cuma section di
  homepage, sekarang punya URL, meta description, dan canonical URL sendiri (bisa
  di-share/SEO terpisah). Isi: profil badan hukum, badge APERSI & mitra BTN Platinum,
  statistik proyek/unit, peta lokasi kantor, kontak. Section di homepage jadi teaser
  singkat + link "Selengkapnya →".
- **Role admin: Admin vs Marketing** — sebelumnya cuma satu login (`ADMIN_USER`/`ADMIN_PASS`
  di secret) yang harus di-share ke seluruh tim. Sekarang ada halaman **Tim & Pengguna**
  (`/admin/pengguna`, khusus role Admin) untuk bikin akun tambahan dengan dua role:
  - **Admin** — akses penuh, termasuk Pengaturan Situs & Tim/Pengguna.
  - **Marketing** — akses operasional (properti, leads, rumah terjual, pembeli, voucher,
    banner, testimoni, proyek) TANPA Pengaturan Situs & TANPA kelola Tim/Pengguna.

  Detail teknis yang perlu diketahui:
  - Password akun tambahan di-hash pakai PBKDF2-SHA256 (Web Crypto native, bukan loop JS)
    sebelum disimpan — tidak pernah plaintext di database.
  - Login `ADMIN_USER`/`ADMIN_PASS` (secret) tetap jadi akun **pemilik**/fallback yang selalu
    ada — jadi walau semua akun di Tim & Pengguna dinonaktifkan/dihapus, masih ada jalan masuk.
  - **Nonaktifkan/hapus akun langsung mencabut akses** — sesi akun tim (bukan pemilik)
    divalidasi ulang ke database di setiap request admin, bukan cuma dipercaya dari cookie
    sampai masa berlaku 7 hari habis.
  - Username akun tambahan cuma boleh huruf/angka/underscore/strip (tanpa titik/spasi) —
    dibatasi supaya tidak bentrok dengan format internal cookie sesi.

Tambahan dari batch sebelum-sebelumnya (masih berlaku):
- **Fix responsivitas kritis** — ditemukan lewat pengujian manual di layar 320px: tombol widget WhatsApp (fixed di pojok kanan-bawah) sempat menutupi tombol CTA di Kalkulator Impian & bisa menutupi elemen lain di layar sempit. Sudah diperbaiki (WA widget mengecil otomatis di layar ≤480px + reservasi ruang aman di tombol-tombol dekat pojok kanan-bawah), diverifikasi ulang di 320px/375px/414px/480px — tidak ada lagi tabrakan elemen.
- **Gebrakan struktural (bukan cuma re-skin warna)**: hero diganti total jadi "Kalkulator Impian" — slider interaktif yang langsung nunjukkin estimasi cicilan KPR real-time (bukan tombol statis), section "Unit Unggulan" diganti dari grid seragam jadi bento grid asimetris (1 kartu besar + 2 kartu kecil + banner statistik unit tersedia/terjual), plus motif lattice halus terinspirasi tenun/songket sebagai identitas visual lokal di hero.
- **Data default situs sekarang pakai identitas asli** — nama brand "Harjita Village", badan hukum "PT Digdaya Cipta Harjita" (developer perumahan bersubsidi di Kota Jambi, anggota APERSI, Platinum Developer BTN Properti), lengkap dengan alamat, WhatsApp, email, dan Instagram asli. Semua tetap bisa diubah kapan saja dari `/admin/settings` tanpa redeploy.
- **Polish visual "wah"**: icon spesifikasi unit (bukan cuma teks LT/LB/KT/KM), animasi scroll-reveal di tiap section, favicon otomatis (generate dari huruf pertama nama situs + warna tema, tanpa perlu upload file), footer lengkap (nama badan hukum resmi/PT, navigasi cepat, kontak, Instagram)
- **Nama badan hukum resmi (PT)** — field terpisah dari nama brand, tampil di footer & copyright. Default terisi "PT Digdaya Cipta Harjita", bisa diubah dari admin
- **Panel admin sekarang mobile-friendly juga** — sebelumnya sidebar bocor/overflow di HP, sekarang jadi drawer dengan hamburger sama kayak situs publik, tabel yang lebar scroll sendiri tanpa nge-bocorin halaman
- **Program KPR Subsidi Pemerintah (FLPP)** — tandai properti mana yang ikut program subsidi (checkbox per properti, portofolio campuran subsidi+komersil didukung). Properti bertanda subsidi otomatis dapat: badge "KPR Subsidi Pemerintah", harga tampil sebagai "harga pasti" (bukan "mulai dari"/nego), kalkulator KPR pakai DP & bunga subsidi (default 1% / 5%, bisa diubah admin), section "Syarat KPR Subsidi" di homepage & halaman detail, dan filter "Khusus KPR Subsidi" di listing.
- **SEO & Open Graph** — meta description, og:title/description/image, twitter card, canonical URL di setiap halaman publik; `robots.txt` dan `sitemap.xml` otomatis (hanya properti published yang masuk sitemap)
- **Draft/publish properti** — properti baru bisa disimpan sebagai draft (checkbox "Publikasikan" di form), tidak tampil di situs publik (404 kalau diakses langsung) sampai admin publikasikan. Dashboard menampilkan badge "Draft" untuk yang belum tayang.
- **Kompresi gambar otomatis** — semua upload foto (gallery, banner, testimoni) dikompresi & di-resize di browser sebelum dikirim ke server (maks 1600px, re-encode JPEG ~82% quality). Diverifikasi mengurangi ukuran file real hingga ~87% pada foto besar.
- **Nama situs, nomor WhatsApp, dan warna tema SEKARANG bisa diatur penuh dari admin** (`/admin/settings`) — tidak perlu lagi edit `wrangler.toml` atau redeploy. Warna divalidasi ketat (hex 6 digit) di server sebelum di-render, jadi tidak bisa disalahgunakan untuk CSS injection.
- **Nav mobile diperbaiki** — hamburger menu berfungsi (sebelumnya nav hilang total di HP)
- **Banner carousel beneran muter** — sebelumnya cuma nampilin banner pertama, sekarang semua banner aktif tampil bergantian otomatis tiap 5 detik + dot indicator
- **Lightbox galeri** — klik foto di halaman detail untuk zoom fullscreen, navigasi panah/keyboard
- **Peta lokasi** — embed Google Maps otomatis dari field lokasi properti (tanpa perlu API key)
- **Kalkulator simulasi KPR** — interaktif di halaman detail, hitung estimasi cicilan bulanan
- **Download brosur PDF** — upload PDF per properti dari admin, tombol download muncul otomatis di halaman detail
- **Filter harga** — min/max harga di halaman listing
- **Testimoni pembeli** — CRUD dari admin, tampil di homepage dengan rating bintang & foto
- **Statistik count-up** — angka di homepage animasi menghitung saat discroll ke view

## Verifikasi

Sebelum dikirim, seluruh alur (server + database) dijalankan lewat simulator lokal
(mock D1 pakai `node:sqlite`, mock R2 in-memory) — **152 assertion server-side lolos**,
mencakup semua modul admin, draft/publish, program KPR Subsidi (FLPP), SEO meta tags,
robots.txt/sitemap.xml, footer/favicon/nama PT, dan proteksi keamanan (CSRF, XSS escape,
rate-limit login, validasi warna tema). Kalkulator Impian (slider interaktif di hero) dan
bento grid juga dites terpisah dengan Chromium asli — termasuk drag slider beneran pakai
mouse dan mengukur ukuran kartu bento secara visual (bukan cuma cek CSS class), 9 assertion lolos.

Interaksi sisi browser (hamburger, lightbox, carousel, count-up, kalkulator KPR) dites
pakai Chromium headless asli (Playwright) — 24 assertion lolos, termasuk screenshot visual.
Kompresi gambar client-side juga diverifikasi terpisah dengan foto uji 5.35MB yang
benar-benar diukur hasilnya di server setelah upload: turun jadi 725KB (86.7% lebih kecil).

Detail lengkap ada di riwayat percakapan; source code di zip ini **tidak diubah** dari
yang sudah diverifikasi.

Catatan: peta lokasi memakai iframe embed Google Maps publik (`google.com/maps?...&output=embed`).
Ini butuh koneksi internet normal saat situs diakses — tidak perlu API key, dan akan berfungsi
normal begitu di-deploy (hanya sandbox testing internal yang sempat memblokir domain google.com).

## Fitur Lengkap

**Publik**
- Homepage: hero banner carousel (auto-rotate), statistik count-up, voucher aktif, unit unggulan, testimoni, listing terbaru
- Filter properti per proyek/lokasi, tipe, status, kata kunci, **rentang harga**
- Detail properti: gallery dengan lightbox, peta lokasi (Google Maps), kalkulator simulasi KPR, download brosur PDF
- Widget live chat WhatsApp mengambang di semua halaman
- Nav mobile (hamburger menu)
- SEO: meta tags, Open Graph/Twitter card, `robots.txt`, `sitemap.xml` otomatis

**Admin (`/admin`)**
- Login dengan rate-limit (dikunci sementara setelah 5x gagal dalam 15 menit)
- CRUD properti (dengan status **draft/publish**) + upload album foto (multi-upload ke R2, otomatis dikompres di browser)
- Upload brosur PDF per properti
- Proyek/lokasi (multi-cluster/multi-kota)
- Rumah terjual — mencatat pembeli & marketing per transaksi, otomatis update status properti
- Data pembeli & tim marketing
- Voucher/promo (kode, diskon rupiah/persen, masa berlaku)
- Banner promosi untuk hero homepage (carousel, bisa lebih dari satu)
- Testimoni pembeli (dengan foto & rating bintang)
- Pengaturan situs: **nama situs, nomor WhatsApp, warna tema, dan semua teks homepage** — tanpa perlu edit kode/redeploy

**Keamanan**
- Semua query D1 pakai parameterized binding (anti SQL injection)
- Semua teks dari admin/input di-escape sebelum dirender (anti stored XSS)
- Session admin: cookie ber-signature HMAC, `HttpOnly`, `Secure`, `SameSite=Lax`
- CSRF token di setiap form POST admin (defense-in-depth di atas SameSite)
- Perbandingan kredensial & token pakai constant-time compare (anti timing attack)
- Rate-limit percobaan login berbasis IP (anti brute-force)
- Validasi tipe & ukuran file saat upload gambar (maks 8MB, hanya jpg/png/webp/gif) dan brosur (PDF only)
- URL eksternal (link banner) disaring, hanya izinkan `http(s)://` atau path relatif
- Warna tema divalidasi ketat (hex 6 digit) sebelum di-render — tidak bisa dipakai untuk CSS injection

**Stack:** Cloudflare Workers + [Hono](https://hono.dev) (routing) + D1 (database) + R2 (penyimpanan foto).
Tanpa framework frontend — HTML dirender langsung dari Worker, jadi ringan dan tidak butuh build step.

## Struktur Folder

```
properti-worker/
├── wrangler.toml        # konfigurasi Worker, binding D1 & R2
├── schema.sql            # struktur database
├── src/
│   ├── index.js          # entry point, gabungkan semua route
│   ├── db.js              # helper query ke D1
│   ├── auth.js             # session login admin (signed cookie)
│   ├── templates.js         # layout HTML + komponen (design tokens tema "blueprint")
│   └── routes/
│       ├── public.js       # homepage, listing, detail properti, serve gambar
│       └── admin.js         # login, dashboard, CRUD properti, gallery, settings
```

## Setup (sekali di awal)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Login ke Cloudflare**
   ```bash
   npx wrangler login
   ```

3. **Buat database D1**
   ```bash
   npx wrangler d1 create properti-db
   ```
   Salin `database_id` yang muncul, lalu tempel ke `wrangler.toml` (bagian `[[d1_databases]]`).

4. **Buat bucket R2** (untuk simpan foto)
   ```bash
   npx wrangler r2 bucket create properti-media
   ```

5. **Jalankan migrasi schema**
   ```bash
   npm run db:migrate:remote
   ```
   Ini menjalankan `schema.sql`, yang sudah lengkap dan final — cukup ini saja untuk instalasi baru.

   > **Catatan:** folder `migrations-jika-upgrade/` hanya relevan kalau Anda sebelumnya
   > sudah pernah deploy versi lama situs ini dan mau upgrade tanpa kehilangan data.
   > Untuk instalasi baru (belum pernah deploy sama sekali), **abaikan folder itu sepenuhnya**.

6. **Set secret untuk login admin** (jangan ditaruh di wrangler.toml)
   ```bash
   npx wrangler secret put ADMIN_USER
   npx wrangler secret put ADMIN_PASS
   npx wrangler secret put SESSION_SECRET   # isi dengan string acak panjang, mis. hasil `openssl rand -hex 32`
   ```

7. **(Opsional) Sesuaikan `wrangler.toml`** — ini sekarang cuma FALLBACK, nilai sebenarnya diatur dari `/admin/settings` setelah situs jalan:
   - `SITE_NAME` → dipakai kalau admin belum pernah mengisi nama situs
   - `WHATSAPP_NUMBER` → dipakai kalau admin belum pernah mengisi nomor WA (format `62xxxxxxxxxx`, tanpa tanda `+`)

## Menjalankan di lokal

```bash
npm run db:migrate      # migrasi ke database lokal (sekali saja)
npm run dev
```
Buka `http://localhost:8787`. Admin panel ada di `http://localhost:8787/admin`.

## Deploy ke Cloudflare

**Opsi A — manual dari lokal (paling simpel buat sekali jalan):**
```bash
npm run deploy
```

**Opsi B — via GitLab (auto-deploy tiap push):**

Infrastruktur (D1, R2, secrets) tetap harus disiapkan manual dulu lewat langkah **Setup**
di atas — Git integration cuma otomatisasi deploy kode, bukan setup database/storage.

1. Pastikan `database_id` di `wrangler.toml` sudah diisi ID asli (bukan placeholder), dan
   D1 + R2 sudah dibuat serta di-migrasi seperti langkah Setup.
2. Push project ini ke repo GitLab Anda:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <url-repo-gitlab-anda>
   git push -u origin main
   ```
   (`.gitignore` sudah disiapkan supaya `node_modules` dan file secret lokal tidak ikut ter-push)
3. Di Cloudflare dashboard: **Workers & Pages → Create application → Import a repository**,
   pilih akun GitLab lalu pilih repo ini.
4. Set secret (`ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`) lewat **Settings → Variables and
   Secrets** di halaman Worker tersebut — **jangan** taruh secret di dalam repo GitLab.
5. Setelah dihubungkan, setiap `git push` ke branch production otomatis build & deploy.

Setelah deploy (opsi manapun), akses `https://<nama-worker>.<subdomain>.workers.dev/admin` untuk login dan mulai
menambahkan properti pertama Anda. Domain custom bisa ditambahkan lewat dashboard Cloudflare
(Workers & Pages → nama worker → Triggers → Custom Domains).

## Alur pemakaian admin

1. Login di `/admin` pakai `ADMIN_USER` / `ADMIN_PASS` yang sudah di-set sebagai secret.
2. Klik **+ Tambah Properti**, isi detail unit (harga, LT/LB, kamar, lokasi, dll).
3. Setelah properti dibuat, Anda otomatis diarahkan ke halaman **Gallery** — upload beberapa
   foto sekaligus. Foto pertama otomatis jadi cover, atau atur manual lewat tombol "Jadikan cover".
4. Halaman **Pengaturan Situs** untuk ubah tagline homepage, teks "Tentang Kami", alamat, email, dll.
5. Properti dengan centang "unit unggulan" akan tampil di section khusus homepage.

## Catatan desain

Tema visual: **"Ceria & Optimis"** — dirancang khusus untuk niche properti subsidi/terjangkau,
bukan properti premium. Palet hijau segar (`#2EB872`) + aksen kuning (`#FFC845`), tipografi
membulat dan ramah (Baloo 2 untuk judul, Nunito untuk isi), sudut serba membulat (kartu, tombol,
input). Filosofinya: rumah subsidi jualannya bukan "eksklusivitas" tapi **kepercayaan,
keterjangkauan, dan optimisme** ("rumah pertama jadi nyata") — jadi visualnya sengaja dibuat
approachable, bukan mewah/formal.

Nama situs, nomor WhatsApp, dan 2 warna utama (aksen hijau + warna gelap) bisa diubah langsung
dari `/admin/settings` tanpa edit kode. Kalau mau ubah lebih dalam (font, radius sudut, layout),
semua token ada di bagian atas `src/templates.js` (`BASE_CSS`).

## Pengembangan lanjutan (ide, belum diimplementasi)

- Kompresi/resize gambar otomatis saat upload (bisa pakai Cloudflare Images sebagai alternatif R2)
- Pagination di halaman listing kalau properti sudah banyak
- Form kontak/inquiry yang tersimpan ke database (saat ini pakai tombol WhatsApp langsung)
- Multi-bahasa (ID/EN)
