-- ============================================================
-- Schema database properti (Cloudflare D1 / SQLite)
-- v2: + proyek/lokasi, pembeli, marketing, penjualan, voucher, banner
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,               -- nama proyek/cluster, mis. "Cluster Anggrek"
  location        TEXT NOT NULL DEFAULT '',    -- kota/area, mis. "Bekasi, Jawa Barat"
  description     TEXT DEFAULT '',
  cover_image     TEXT DEFAULT '',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'Rumah',       -- Rumah, Ruko, Apartemen, Tanah, Kavling
  status          TEXT NOT NULL DEFAULT 'tersedia',    -- tersedia, proses, terjual
  price           INTEGER NOT NULL DEFAULT 0,          -- dalam rupiah
  price_label     TEXT DEFAULT '',
  location        TEXT DEFAULT '',
  land_area       INTEGER DEFAULT 0,
  building_area   INTEGER DEFAULT 0,
  bedrooms        INTEGER DEFAULT 0,
  bathrooms       INTEGER DEFAULT 0,
  carports        INTEGER DEFAULT 0,
  cover_image     TEXT DEFAULT '',
  brochure_key    TEXT DEFAULT '',                     -- object key PDF brosur di R2 (opsional)
  published       INTEGER NOT NULL DEFAULT 1,           -- 0 = draft (belum tampil publik), 1 = tayang
  subsidized      INTEGER NOT NULL DEFAULT 0,            -- 1 = ikut program KPR Subsidi Pemerintah (FLPP)
  featured        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS property_images (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id     INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  image_key       TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buyers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketing (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Satu baris = satu transaksi rumah terjual (menghubungkan properti + pembeli + marketing)
CREATE TABLE IF NOT EXISTS sales (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id     INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  buyer_id        INTEGER REFERENCES buyers(id) ON DELETE SET NULL,
  marketing_id    INTEGER REFERENCES marketing(id) ON DELETE SET NULL,
  sale_price      INTEGER NOT NULL DEFAULT 0,
  sale_date       TEXT NOT NULL DEFAULT (date('now')),
  notes           TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vouchers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  discount_type   TEXT NOT NULL DEFAULT 'fixed',   -- 'fixed' (rupiah) atau 'percent'
  discount_value  INTEGER NOT NULL DEFAULT 0,
  valid_until     TEXT DEFAULT '',                 -- YYYY-MM-DD, kosong = tanpa batas
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS banners (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  subtitle        TEXT DEFAULT '',
  image_key       TEXT DEFAULT '',
  link_url        TEXT DEFAULT '',
  active          INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS testimonials (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  role            TEXT DEFAULT '',              -- mis. "Pembeli Cluster Anggrek, 2025"
  rating          INTEGER NOT NULL DEFAULT 5,   -- 1-5
  photo_key       TEXT DEFAULT '',
  quote           TEXT NOT NULL DEFAULT '',
  active          INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Akun admin tambahan (di luar ADMIN_USER/ADMIN_PASS di secret, yang tetap
-- jadi akun "pemilik" utama & fallback kalau tabel ini kosong/terkunci semua).
-- role: 'admin' (akses penuh, termasuk Pengaturan Situs & kelola Tim/Pengguna)
--       'marketing' (akses operasional: properti, leads, terjual, pembeli,
--        voucher, banner, testimoni — TANPA Pengaturan Situs & Tim/Pengguna)
CREATE TABLE IF NOT EXISTS admin_users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,          -- format "saltHex:hashHex" (PBKDF2-SHA256)
  role            TEXT NOT NULL DEFAULT 'marketing',
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dipakai untuk rate-limit percobaan login admin
CREATE TABLE IF NOT EXISTS login_attempts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ip              TEXT NOT NULL,
  success         INTEGER NOT NULL DEFAULT 0,
  attempted_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL DEFAULT ''
);

-- Lead masuk dari form kontak publik (homepage & halaman detail properti).
-- Terpisah dari `buyers` karena lead belum tentu jadi pembeli — admin yang
-- mem-filter & convert manual lewat tombol "Jadikan Pembeli" di panel admin.
CREATE TABLE IF NOT EXISTS leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  message         TEXT DEFAULT '',
  property_id     INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  property_title  TEXT DEFAULT '',            -- snapshot judul, biar tetap kebaca walau properti dihapus
  ip              TEXT DEFAULT '',
  handled         INTEGER NOT NULL DEFAULT 0, -- 0 = belum ditindaklanjuti, 1 = sudah
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type);
CREATE INDEX IF NOT EXISTS idx_properties_project ON properties(project_id);
CREATE INDEX IF NOT EXISTS idx_images_property ON property_images(property_id);
CREATE INDEX IF NOT EXISTS idx_sales_property ON sales(property_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, attempted_at);
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_leads_handled ON leads(handled);
CREATE INDEX IF NOT EXISTS idx_leads_ip_time ON leads(ip, created_at);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'Harjita Village'),
  ('legal_name', 'PT Digdaya Cipta Harjita'),
  ('whatsapp_number', '6281250501948'),
  ('theme_accent', '#2EB872'),
  ('theme_dark', '#26332D'),
  ('site_tagline', 'Wujudkan Rumah Pertama Impian Anda di Jambi'),
  ('hero_subtitle', 'Rumah subsidi berkualitas di Kota Jambi dengan DP ringan, proses KPR mudah, dan cicilan yang bersahabat.'),
  ('about_text', 'Harjita Village adalah pengembang perumahan bersubsidi di Kota Jambi, dikembangkan oleh PT Digdaya Cipta Harjita — anggota APERSI (Asosiasi Pengembang Perumahan dan Permukiman Seluruh Indonesia) dan mitra resmi Platinum Developer BTN Properti. Kami membantu keluarga muda memiliki rumah pertama lewat program subsidi pemerintah — proses jujur, transparan, dan tanpa biaya tersembunyi.'),
  ('address', 'Komplek Ruko I-Walk, Jl. Ismail Malik Blok C-11, Kota Jambi'),
  ('email', 'digdayaciptaharjita@gmail.com'),
  ('instagram', 'digdayaciptaharjita'),
  ('whatsapp_greeting', 'Halo Harjita Village, saya tertarik dengan properti Anda.'),
  ('kpr_subsidi_dp_default', '1'),
  ('kpr_subsidi_bunga_default', '5'),
  ('kpr_subsidi_syarat', 'Rumah dengan label ini termasuk program KPR Subsidi Pemerintah (FLPP), dengan syarat umum:

• Warga Negara Indonesia (WNI) yang sudah berusia 21 tahun atau sudah menikah
• Belum pernah memiliki rumah sendiri
• Belum pernah menerima subsidi perumahan dari pemerintah sebelumnya
• Memiliki penghasilan tetap sesuai batas maksimal yang berlaku
• Rumah digunakan sebagai tempat tinggal utama, bukan untuk disewakan/dijual kembali dalam masa tertentu

Syarat dapat berubah sesuai kebijakan pemerintah terbaru. Hubungi tim kami untuk info paling update dan bantuan proses pengajuan.');
