// ============================================================
// Design tokens — tema "Ceria & Optimis" (properti subsidi/terjangkau)
// ink    : teks utama, nav gelap        #26332D
// paper  : background utama             #FFFBF2
// gold   : aksen CTA / harga / garis    #2EB872 (hijau segar — bisa diubah admin)
// sunny  : aksen kuning (highlight)     #FFC845
// stone  : teks sekunder                #6B7563
// clay   : status terjual               #E2574C
// sage   : status tersedia              #2EB872
// ============================================================

// ── Keamanan: selalu escape teks yang berasal dari input user/admin
// sebelum ditaruh ke HTML, supaya tidak bisa jadi stored XSS. ──
export function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Bangun file CSV dari array of objects, dengan header dari `columns`. ──
// Setiap sel di-escape sesuai aturan CSV (RFC 4180): bungkus dengan tanda kutip ganda
// kalau mengandung koma/kutip/baris baru, dan dobelkan tanda kutip di dalamnya.
// Diberi BOM UTF-8 di depan supaya karakter non-ASCII (mis. "é") tampil benar di Excel.
export function toCsv(rows, columns) {
  function cell(value) {
    const s = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  const header = columns.map((c) => cell(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => cell(typeof c.value === "function" ? c.value(row) : row[c.value])).join(","));
  return "\uFEFF" + [header, ...lines].join("\r\n");
}

// Hanya izinkan URL http(s) atau path relatif — cegah javascript: URL / injeksi.
export function safeUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (trimmed.startsWith("/")) return esc(trimmed);
  if (/^https?:\/\//i.test(trimmed)) return esc(trimmed);
  return "";
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Icon spesifikasi unit — inline SVG (tanpa dependency eksternal), gaya garis simpel
// biar konsisten sama tema membulat & ramah.
const ICONS = {
  land: `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4"/></svg>`,
  building: `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5 9 3l6.5 5.5V15a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V8.5Z"/><path d="M7 16v-4h4v4"/></svg>`,
  bed: `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15V9.5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 16 9.5V15"/><path d="M2 12.5h14"/><path d="M4 8V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/></svg>`,
  bath: `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2C9 2 5 6.8 5 10a4 4 0 0 0 8 0C13 6.8 9 2 9 2Z"/></svg>`,
  car: `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V9.3a1 1 0 0 1 .6-.9l1.5-.7 1-2A1 1 0 0 1 7 5h4a1 1 0 0 1 .9.6l1 2 1.5.7a1 1 0 0 1 .6.9V12"/><circle cx="5.5" cy="12.5" r="1.3"/><circle cx="12.5" cy="12.5" r="1.3"/></svg>`,
};
export function icon(name) {
  return ICONS[name] || "";
}

export function faviconDataUri(siteName, accent) {
  const safeAccent = HEX_RE.test(accent) ? accent : "#2EB872";
  const letter = (siteName || "G").trim().charAt(0).toUpperCase().replace(/[^A-Z0-9]/g, "") || "G";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${safeAccent}"/><text x="32" y="45" font-family="Arial, sans-serif" font-weight="700" font-size="34" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function darkenHex(hex, percent = 18) {
  if (!HEX_RE.test(hex)) return hex;
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  r = Math.max(0, Math.round(r * (1 - percent / 100)));
  g = Math.max(0, Math.round(g * (1 - percent / 100)));
  b = Math.max(0, Math.round(b * (1 - percent / 100)));
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

// Injeksi warna tema kustom sebagai override CSS variable, DI-VALIDASI KETAT
// (hex 6 digit only) sebelum masuk ke <style> — supaya nilai dari admin
// tidak bisa dipakai untuk keluar dari style block / CSS injection.
function themeOverrideCss(theme) {
  const accent = HEX_RE.test(theme?.accent) ? theme.accent : "#2EB872";
  const dark = HEX_RE.test(theme?.dark) ? theme.dark : "#26332D";
  return `<style>:root{ --gold:${accent}; --gold-dark:${darkenHex(accent)}; --ink:${dark}; }</style>`;
}

export function formatRupiah(n) {
  if (!n) return "Hubungi kami";
  return "Rp " + Number(n).toLocaleString("id-ID");
}

export function statusBadge(status) {
  const map = {
    tersedia: { label: "Tersedia", bg: "#3F6B52" },
    proses: { label: "Dalam Proses", bg: "#2EB872" },
    terjual: { label: "Terjual", bg: "#A3402E" },
  };
  const s = map[status] || map.tersedia;
  return `<span style="background:${s.bg}" class="badge">${s.label}</span>`;
}

export function draftBadge() {
  return `<span class="badge" style="background:#8a8578;">Draft</span>`;
}

export function subsidyBadge() {
  return `<span class="badge" style="background:var(--sunny-dark); color:#26332D;">🏠 KPR Subsidi Pemerintah</span>`;
}

export function leadStatusBadge(handled) {
  return handled
    ? `<span class="badge" style="background:#3F6B52;">Ditindaklanjuti</span>`
    : `<span class="badge" style="background:#A3402E;">Baru</span>`;
}

// Form kontak publik (homepage & halaman detail properti) — POST ke /kontak,
// masuk ke tabel `leads`. Gak butuh CSRF token (anonim, gak ada session),
// jadi pertahanan spam-nya cuma honeypot field + rate limit per-IP di server.
export function leadForm({ propertyId, propertyTitle, returnTo, dark = false } = {}) {
  return `
    <form method="post" action="/kontak" class="lead-form">
      <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off">
      ${propertyId ? `<input type="hidden" name="property_id" value="${esc(propertyId)}">` : ""}
      ${propertyTitle ? `<input type="hidden" name="property_title" value="${esc(propertyTitle)}">` : ""}
      <input type="hidden" name="return_to" value="${esc(returnTo || "/")}">
      <div class="field"><label${dark ? ' style="color:rgba(255,255,255,0.85);"' : ""}>Nama</label><input type="text" name="name" placeholder="Nama Anda" required maxlength="120"></div>
      <div class="field"><label${dark ? ' style="color:rgba(255,255,255,0.85);"' : ""}>No. WhatsApp</label><input type="text" name="phone" placeholder="08xxxxxxxxxx" required maxlength="30"></div>
      <div class="field"><label${dark ? ' style="color:rgba(255,255,255,0.85);"' : ""}>Pesan (opsional)</label><textarea name="message" rows="2" maxlength="500" placeholder="Mau tanya-tanya soal unit ini..."></textarea></div>
      <button type="submit" class="btn btn-gold" style="width:100%; justify-content:center;">Kirim, Hubungi Saya</button>
    </form>`;
}

const BASE_CSS = `
  :root{
    --ink:#26332D; --paper:#FFFBF2; --gold:#2EB872; --gold-dark:#25A362;
    --stone:#6B7563; --clay:#E2574C; --sage:#2EB872; --line: rgba(38,51,45,0.12);
    --panel:#FFFFFF; --sunny:#FFC845; --sunny-dark:#F2AE1E;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; background:var(--paper); color:var(--ink);
    font-family:'Nunito', -apple-system, sans-serif; line-height:1.65; font-size:15.5px;
  }
  h1,h2,h3,.serif{ font-family:'Baloo 2', 'Nunito', sans-serif; font-weight:700; letter-spacing:0; }
  .mono{ font-family:'IBM Plex Mono', monospace; }
  a{ color:var(--ink); }
  .wrap{ max-width:1180px; margin:0 auto; padding:0 24px; }
  .navbar{
    position:sticky; top:0; z-index:50; background:rgba(255,251,242,0.94);
    backdrop-filter:blur(8px); border-bottom:1px solid var(--line);
  }
  .navbar-inner{ display:flex; align-items:center; justify-content:space-between; padding:18px 24px; max-width:1180px; margin:0 auto; }
  .brand{ font-family:'Baloo 2', sans-serif; font-weight:700; font-size:24px; color:var(--ink); text-decoration:none; letter-spacing:0; display:flex; align-items:center; gap:9px; }
  .brand-mark{ width:11px; height:11px; background:var(--sunny); border-radius:50%; flex-shrink:0; }
  .nav-links{ display:flex; gap:28px; align-items:center; }
  .nav-links a{ color:var(--ink); text-decoration:none; font-size:14.5px; font-weight:700; }
  .nav-links a:hover{ color:var(--gold-dark); }
  .btn{
    display:inline-flex; align-items:center; gap:8px; padding:13px 26px;
    text-decoration:none; font-size:14.5px; font-weight:800; letter-spacing:0;
    border:2px solid transparent; cursor:pointer; border-radius:999px;
  }
  .btn-gold{ background:var(--gold); color:#fff; box-shadow:0 4px 0 var(--gold-dark); }
  .btn-gold:hover{ background:var(--gold-dark); transform:translateY(2px); box-shadow:0 2px 0 var(--gold-dark); }
  .btn-outline{ border-color:var(--ink); color:var(--ink); background:transparent; }
  .btn-outline:hover{ background:var(--ink); color:#fff; }
  .btn-outline-light{ border-color:rgba(255,255,255,0.85); color:#fff; background:transparent; }
  .btn-outline-light:hover{ background:#fff; color:var(--ink); }
  .badge{ color:#fff; font-size:11px; font-weight:800; padding:6px 13px; letter-spacing:.02em; border-radius:999px; }
  .eyebrow{ font-family:'Nunito',sans-serif; font-weight:800; font-size:12.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--gold-dark); }
  .divider-gold{ width:36px; height:5px; background:var(--sunny); border-radius:99px; margin:14px 0 22px; }
  .card{
    background:var(--panel); border:2px solid var(--line); overflow:hidden; display:flex; flex-direction:column;
    border-radius:20px; transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;
  }
  .card:hover{ transform:translateY(-4px); box-shadow:0 16px 32px rgba(38,51,45,0.12); border-color:var(--gold); }
  .card-img{ width:100%; aspect-ratio:4/3; object-fit:cover; background:#eef2ea; display:block; }
  .card-body{ padding:20px 20px 22px; display:flex; flex-direction:column; gap:9px; flex:1; }
  .specs{ display:flex; gap:16px; font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--stone); flex-wrap:wrap; }
  .grid{ display:grid; gap:26px; }
  .grid-3{ grid-template-columns:repeat(3,1fr); }
  .grid-4{ grid-template-columns:repeat(4,1fr); }
  @media(max-width:900px){ .grid-3,.grid-4{ grid-template-columns:repeat(2,1fr);} }
  @media(max-width:600px){ .grid-3,.grid-4{ grid-template-columns:1fr;} .nav-links{ display:none; } .footer-grid{ grid-template-columns:1fr !important; } }

  /* ── Nav mobile (hamburger) ── */
  .hamburger{ display:none; background:none; border:none; cursor:pointer; padding:6px; }
  .hamburger span{ display:block; width:24px; height:3px; border-radius:99px; background:var(--ink); margin:5px 0; transition:.2s; }
  @media(max-width:600px){ .hamburger{ display:block; } }
  .mobile-menu{
    display:none; position:fixed; inset:0 0 auto 0; top:69px; background:#fff; z-index:60;
    border-bottom:1px solid var(--line); box-shadow:0 12px 24px rgba(38,51,45,.1);
  }
  .mobile-menu.open{ display:block; }
  .mobile-menu a{ display:block; padding:16px 24px; text-decoration:none; color:var(--ink); font-weight:700; border-bottom:1px solid var(--line); font-size:15px; }
  .mobile-menu a.btn-gold{ margin:16px 24px; text-align:center; border-bottom:none; }

  /* ── Banner carousel (hero) ── */
  .banner-slide{ position:absolute; inset:0; opacity:0; transition:opacity .8s ease; }
  .banner-slide.active{ opacity:1; z-index:1; }
  .banner-slide img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .banner-dots{ position:absolute; bottom:26px; left:0; right:0; display:flex; justify-content:center; gap:8px; z-index:3; }
  .banner-dot{ width:9px; height:9px; border-radius:50%; background:rgba(255,255,255,0.5); cursor:pointer; border:none; padding:0; }
  .banner-dot.active{ background:var(--sunny); }

  /* ── Lightbox galeri ── */
  .lightbox-img{ cursor:zoom-in; }
  .lightbox-overlay{
    display:none; position:fixed; inset:0; background:rgba(20,28,24,0.94); z-index:100;
    align-items:center; justify-content:center; flex-direction:column;
  }
  .lightbox-overlay.open{ display:flex; }
  .lightbox-overlay img{ max-width:88vw; max-height:78vh; object-fit:contain; border-radius:16px; }
  .lightbox-close{ position:absolute; top:20px; right:26px; color:#fff; font-size:32px; background:none; border:none; cursor:pointer; line-height:1; }
  .lightbox-nav{ position:absolute; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.15); border:none; color:#fff; font-size:26px; width:48px; height:48px; border-radius:50%; cursor:pointer; }
  .lightbox-prev{ left:18px; } .lightbox-next{ right:18px; }
  .lightbox-count{ color:rgba(255,255,255,0.75); font-size:13px; margin-top:14px; font-family:'Nunito',sans-serif; font-weight:700; }

  /* ── Testimoni ── */
  .stars{ color:var(--sunny-dark); letter-spacing:2px; font-size:15px; }
  .avatar-circle{ width:46px; height:46px; border-radius:50%; background:var(--gold); color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Baloo 2',sans-serif; font-size:18px; flex-shrink:0; }

  /* ── Simulasi KPR ── */
  .kpr-box{ background:#fff; border:2px solid var(--line); border-radius:20px; padding:24px; }
  .kpr-result{ font-family:'Baloo 2',sans-serif; font-size:28px; font-weight:700; color:var(--gold-dark); margin-top:6px; }

  /* ── Animasi muncul pas discroll ── */
  .reveal{ opacity:0; transform:translateY(24px); transition:opacity .6s ease, transform .6s ease; }
  .reveal.in{ opacity:1; transform:translateY(0); }

  input,select,textarea{
    font-family:inherit; font-size:14.5px; padding:11px 14px; border:2px solid var(--line);
    background:#fff; color:var(--ink); width:100%; border-radius:12px;
  }
  input:focus,select:focus,textarea:focus{ outline:none; border-color:var(--gold); }
  .flash{ padding:12px 16px; margin-bottom:20px; font-size:14px; border-radius:12px; }
  .flash-ok{ background:#eaf1ec; color:var(--sage); border:1px solid var(--sage); }
  .flash-err{ background:#f8ece9; color:var(--clay); border:1px solid var(--clay); }
  /* Honeypot anti-bot: field kosong yang disembunyikan dari mata manusia tapi kelihatan bot */
  .hp-field{ position:absolute !important; left:-9999px !important; top:auto; width:1px; height:1px; overflow:hidden; }
  .lead-form .field{ margin-bottom:12px; }
  .kontak-grid{ display:grid; grid-template-columns:1.3fr 1fr; gap:32px; align-items:start; }
  @media(max-width:700px){ .kontak-grid{ grid-template-columns:1fr; } }
  label{ font-size:13px; font-weight:800; color:var(--stone); display:block; margin-bottom:6px; }
  .field{ margin-bottom:16px; }
  footer{ border-top:1px solid var(--line); margin-top:90px; padding:44px 0; font-size:13.5px; color:var(--stone); }
  .pill{ display:inline-block; padding:9px 18px; border:2px solid var(--line); font-size:13px; font-weight:700; text-decoration:none; color:var(--ink); margin:0 8px 8px 0; border-radius:999px; }
  .pill.active, .pill:hover{ background:var(--gold); color:#fff; border-color:var(--gold); }
  .stat-num{ font-family:'Baloo 2',sans-serif; font-size:44px; font-weight:700; color:var(--gold-dark); line-height:1; }
  .stat-label{ font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--stone); margin-top:6px; }

  /* Widget live chat WhatsApp — tampil di semua halaman publik */
  .wa-fab{
    position:fixed; right:22px; bottom:22px; z-index:80; width:58px; height:58px; border-radius:50%;
    background:#25D366; display:flex; align-items:center; justify-content:center; text-decoration:none;
    box-shadow:0 8px 22px rgba(38,51,45,0.28); animation: wa-pulse 2.4s infinite;
  }
  .wa-fab svg{ width:30px; height:30px; }
  @media(max-width:480px){
    .wa-fab{ width:46px; height:46px; right:14px; bottom:14px; }
    .wa-fab svg{ width:24px; height:24px; }
  }
  @keyframes wa-pulse{
    0%{ box-shadow:0 8px 22px rgba(20,20,20,0.28), 0 0 0 0 rgba(37,211,102,0.5);}
    70%{ box-shadow:0 8px 22px rgba(20,20,20,0.28), 0 0 0 14px rgba(37,211,102,0);}
    100%{ box-shadow:0 8px 22px rgba(20,20,20,0.28), 0 0 0 0 rgba(37,211,102,0);}
  }
  .wa-tooltip{
    position:fixed; right:88px; bottom:36px; z-index:80; background:#fff; padding:10px 16px; font-size:13px;
    border:1px solid var(--line); box-shadow:0 6px 16px rgba(20,20,20,0.1); display:none;
  }
  @media(min-width:700px){ .wa-fab:hover + .wa-tooltip, .wa-tooltip:hover{ display:block; } }

  /* ── Motif lattice terinspirasi tenun/songket (identitas lokal, halus) ── */
  .lattice-pattern{
    background-image:
      linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.045) 75%),
      linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.045) 75%);
    background-size: 34px 34px;
    background-position: 0 0, 17px 17px;
  }

  /* ── Kalkulator Impian (hero interaktif) ── */
  .dream-calc{
    background:rgba(255,255,255,0.08); backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,0.18);
    border-radius:24px; padding:28px 30px; max-width:480px;
  }
  @media(max-width:600px){ .dream-calc{ padding-bottom:44px; } }
  .dream-calc input[type="range"]{
    -webkit-appearance:none; width:100%; height:10px; border-radius:99px;
    background:rgba(255,255,255,0.25); outline:none; margin:14px 0 4px; padding:0; border:none;
  }
  .dream-calc input[type="range"]::-webkit-slider-thumb{
    -webkit-appearance:none; width:32px; height:32px; border-radius:50%; background:var(--sunny);
    border:3px solid #fff; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3);
  }
  .dream-calc input[type="range"]::-moz-range-thumb{
    width:32px; height:32px; border-radius:50%; background:var(--sunny); border:3px solid #fff; cursor:pointer;
  }
  .dream-range-labels{ display:flex; justify-content:space-between; font-size:11px; color:rgba(255,255,255,.55); font-family:'IBM Plex Mono',monospace; }
  .dream-cta{ width:100%; justify-content:center; }
  @media(max-width:480px){ .dream-cta{ width:calc(100% - 10px); } }

  /* ── Bento grid (unit unggulan, asimetris) ── */
  .bento-grid{ display:grid; grid-template-columns:repeat(4, 1fr); grid-auto-rows:200px; gap:18px; }
  .bento-large{ grid-column:span 2; grid-row:span 2; position:relative; border-radius:22px; overflow:hidden; display:block; text-decoration:none; }
  .bento-large img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:transform .4s ease; }
  .bento-large:hover img{ transform:scale(1.05); }
  .bento-large-overlay{
    position:absolute; inset:0; background:linear-gradient(0deg, rgba(20,20,20,.88) 0%, rgba(20,20,20,.15) 55%, transparent 100%);
    display:flex; flex-direction:column; justify-content:flex-end; padding:26px; color:#fff;
  }
  .bento-normal{ grid-column:span 2; grid-row:span 1; }
  .bento-stat{
    grid-column:span 4; border-radius:22px; background:var(--ink); color:#fff;
    padding:26px 30px; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap;
  }
  @media(max-width:900px){
    .bento-grid{ grid-template-columns:repeat(2,1fr); grid-auto-rows:180px; }
    .bento-large{ grid-column:span 2; grid-row:span 2; }
    .bento-stat{ grid-column:span 2; }
  }
  @media(max-width:600px){
    .bento-grid{ grid-template-columns:1fr; grid-auto-rows:auto; }
    .bento-large{ grid-column:span 1; aspect-ratio:4/3; grid-row:auto; }
    .bento-normal{ grid-column:span 1; grid-row:auto; min-height:180px; }
    .bento-stat{ grid-column:span 1; flex-direction:column; align-items:flex-start; text-align:left; }
  }
`;

function waWidget({ waNumber, greeting }) {
  if (!waNumber) return "";
  const msg = encodeURIComponent(greeting || "Halo, saya tertarik dengan properti Anda.");
  return `
  <a class="wa-fab" href="https://wa.me/${esc(waNumber)}?text=${msg}" target="_blank" rel="noopener" aria-label="Chat via WhatsApp">
    <svg viewBox="0 0 32 32" fill="#fff"><path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.5.73 4.83 2 6.78L4 29l7.4-1.94a11.9 11.9 0 0 0 4.62.93h.01c6.62 0 12.02-5.4 12.02-12.02C28.05 8.4 22.65 3 16.02 3zm0 21.86h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.7.97.99-3.6-.24-.37a9.85 9.85 0 0 1-1.51-5.25c0-5.47 4.45-9.92 9.92-9.92 2.65 0 5.14 1.03 7.01 2.91a9.86 9.86 0 0 1 2.9 7.01c0 5.47-4.45 9.84-9.95 9.84zm5.44-7.43c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.7.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z"/></svg>
  </a>
  <div class="wa-tooltip">Ada yang bisa kami bantu?</div>`;
}

export function baseLayout({ title, siteName, activeNav = "", body, waNumber, waGreeting, theme, description, ogImage, canonicalUrl, noindex = false, settings = {}, extraHead = "" }) {
  const metaDesc = esc((description || `${siteName} - properti pilihan dengan lokasi strategis dan legalitas jelas.`).slice(0, 160));
  const fullTitle = `${esc(title)} · ${esc(siteName)}`;
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${fullTitle}</title>
<meta name="description" content="${metaDesc}">
<link rel="icon" type="image/svg+xml" href="${faviconDataUri(siteName, theme?.accent)}">
${noindex ? `<meta name="robots" content="noindex, nofollow">` : ""}
${canonicalUrl ? `<link rel="canonical" href="${esc(canonicalUrl)}">` : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${metaDesc}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
${canonicalUrl ? `<meta property="og:url" content="${esc(canonicalUrl)}">` : ""}
<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${fullTitle}">
<meta name="twitter:description" content="${metaDesc}">
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${BASE_CSS}</style>
${themeOverrideCss(theme)}
${extraHead}
</head>
<body>
<nav class="navbar">
  <div class="navbar-inner">
    <a href="/" class="brand"><span class="brand-mark"></span>${esc(siteName)}</a>
    <div class="nav-links">
      <a href="/" style="${activeNav === "home" ? "color:var(--gold-dark)" : ""}">Beranda</a>
      <a href="/properti" style="${activeNav === "listing" ? "color:var(--gold-dark)" : ""}">Properti</a>
      <a href="/tentang" style="${activeNav === "tentang" ? "color:var(--gold-dark)" : ""}">Tentang</a>
      <a href="/#kontak" class="btn btn-gold">Hubungi Kami</a>
    </div>
    <button class="hamburger" id="hamburgerBtn" aria-label="Buka menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="mobile-menu" id="mobileMenu">
  <a href="/">Beranda</a>
  <a href="/properti">Properti</a>
  <a href="/tentang">Tentang</a>
  <a href="/#kontak" class="btn btn-gold">Hubungi Kami</a>
</div>
${body}
<footer>
  <div class="wrap">
    <div class="grid footer-grid" style="grid-template-columns:1.6fr 1fr 1fr; gap:32px; margin-bottom:32px;">
      <div>
        <div class="brand" style="margin-bottom:12px;"><span class="brand-mark"></span>${esc(siteName)}</div>
        ${settings.legal_name ? `<p style="margin:0 0 4px; font-size:13.5px;">${esc(settings.legal_name)}</p>` : ""}
        ${settings.address ? `<p style="margin:0 0 4px; font-size:13.5px; max-width:280px;">${esc(settings.address)}</p>` : ""}
        ${settings.email ? `<p style="margin:0; font-size:13.5px;">${esc(settings.email)}</p>` : ""}
      </div>
      <div>
        <div class="eyebrow" style="margin-bottom:10px;">Navigasi</div>
        <p style="margin:0 0 8px;"><a href="/" style="text-decoration:none; font-size:13.5px; font-weight:700;">Beranda</a></p>
        <p style="margin:0 0 8px;"><a href="/properti" style="text-decoration:none; font-size:13.5px; font-weight:700;">Properti</a></p>
        <p style="margin:0;"><a href="/tentang" style="text-decoration:none; font-size:13.5px; font-weight:700;">Tentang</a></p>
      </div>
      <div>
        <div class="eyebrow" style="margin-bottom:10px;">Hubungi Kami</div>
        ${waNumber ? `<p style="margin:0 0 8px;"><a href="https://wa.me/${esc(waNumber)}" target="_blank" style="text-decoration:none; font-size:13.5px; font-weight:700;">WhatsApp</a></p>` : ""}
        ${settings.instagram ? `<p style="margin:0;"><a href="https://instagram.com/${esc(settings.instagram.replace(/^@/, ""))}" target="_blank" style="text-decoration:none; font-size:13.5px; font-weight:700;">Instagram</a></p>` : ""}
      </div>
    </div>
    <div style="border-top:1px solid var(--line); padding-top:20px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div>© ${new Date().getFullYear()} ${esc(siteName)}${settings.legal_name ? " — " + esc(settings.legal_name) : ""}. Seluruh hak cipta dilindungi.</div>
      <div><a href="/admin">Admin</a></div>
    </div>
  </div>
</footer>
${waNumber ? waWidget({ waNumber, greeting: waGreeting }) : ""}

<!-- Lightbox galeri (dipakai kalau ada .lightbox-img di halaman) -->
<div class="lightbox-overlay" id="lightboxOverlay">
  <button class="lightbox-close" id="lightboxClose" aria-label="Tutup">&times;</button>
  <button class="lightbox-nav lightbox-prev" id="lightboxPrev" aria-label="Sebelumnya">&#8249;</button>
  <img id="lightboxImg" src="" alt="">
  <button class="lightbox-nav lightbox-next" id="lightboxNext" aria-label="Selanjutnya">&#8250;</button>
  <div class="lightbox-count" id="lightboxCount"></div>
</div>

<script>
(function(){
  // ── Kalkulator Impian (hero interaktif) ──
  var dreamSlider = document.getElementById('dreamSlider');
  if (dreamSlider) {
    var dreamPriceLabel = document.getElementById('dreamPriceLabel');
    var dreamCicilanEl = document.getElementById('dreamCicilan');
    var dreamCtaEl = document.getElementById('dreamCta');
    var dp = parseFloat(dreamSlider.getAttribute('data-dp')) || 1;
    var bungaTahun = parseFloat(dreamSlider.getAttribute('data-bunga')) || 5;
    function fmtRpDream(n){ return 'Rp ' + Math.round(n).toLocaleString('id-ID'); }
    function updateDream(){
      var price = parseInt(dreamSlider.value, 10);
      var uangMuka = price * (dp / 100);
      var pokok = price - uangMuka;
      var r = (bungaTahun / 100) / 12;
      var n = 240;
      var cicilan = r === 0 ? pokok / n : pokok * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      dreamPriceLabel.textContent = fmtRpDream(price);
      dreamCicilanEl.innerHTML = fmtRpDream(cicilan) + '<span style="font-size:14px; font-weight:400; color:rgba(255,255,255,.6);">/bulan</span>';
      if (dreamCtaEl) dreamCtaEl.href = '/properti?price_max=' + (price + 25000000) + '&subsidi=1';
    }
    dreamSlider.addEventListener('input', updateDream);
    updateDream();
  }

  // ── Hamburger menu mobile ──
  var btn = document.getElementById('hamburgerBtn');
  var menu = document.getElementById('mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', function(){
      var isOpen = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ menu.classList.remove('open'); btn.setAttribute('aria-expanded','false'); });
    });
  }

  // ── Banner carousel (auto-rotate tiap 5 detik) ──
  var slides = document.querySelectorAll('.banner-slide');
  if (slides.length > 1) {
    var dots = document.querySelectorAll('.banner-dot');
    var current = 0;
    function showSlide(i){
      slides.forEach(function(s){ s.classList.remove('active'); });
      dots.forEach(function(d){ d.classList.remove('active'); });
      slides[i].classList.add('active');
      if (dots[i]) dots[i].classList.add('active');
      current = i;
    }
    dots.forEach(function(d, i){ d.addEventListener('click', function(){ showSlide(i); }); });
    setInterval(function(){ showSlide((current + 1) % slides.length); }, 5000);
  }

  // ── Lightbox galeri ──
  var imgs = Array.prototype.slice.call(document.querySelectorAll('.lightbox-img'));
  var overlay = document.getElementById('lightboxOverlay');
  if (imgs.length && overlay) {
    var lbImg = document.getElementById('lightboxImg');
    var lbCount = document.getElementById('lightboxCount');
    var idx = 0;
    function openAt(i){
      idx = i;
      lbImg.src = imgs[idx].getAttribute('src');
      lbCount.textContent = (idx + 1) + ' / ' + imgs.length;
      overlay.classList.add('open');
    }
    function close(){ overlay.classList.remove('open'); }
    function nav(delta){ openAt((idx + delta + imgs.length) % imgs.length); }
    imgs.forEach(function(img, i){ img.addEventListener('click', function(){ openAt(i); }); });
    document.getElementById('lightboxClose').addEventListener('click', close);
    document.getElementById('lightboxPrev').addEventListener('click', function(){ nav(-1); });
    document.getElementById('lightboxNext').addEventListener('click', function(){ nav(1); });
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
    document.addEventListener('keydown', function(e){
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') nav(-1);
      if (e.key === 'ArrowRight') nav(1);
    });
  }

  // ── Animasi muncul pas discroll (.reveal) ──
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var revealObs = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) { entry.target.classList.add('in'); revealObs.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function(el){ revealObs.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }

  // ── Count-up angka statistik ──
  var counters = document.querySelectorAll('[data-countup]');
  if (counters.length && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-countup'), 10) || 0;
        var suffix = el.getAttribute('data-suffix') || '';
        var start = 0;
        var duration = 1000;
        var startTime = null;
        function step(ts){
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          el.textContent = Math.floor(progress * target) + suffix;
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target + suffix;
        }
        requestAnimationFrame(step);
        obs.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(function(el){ obs.observe(el); });
  } else {
    counters.forEach(function(el){ el.textContent = (el.getAttribute('data-countup') || '0') + (el.getAttribute('data-suffix') || ''); });
  }

  // ── Simulasi KPR ──
  var kprForm = document.getElementById('kprForm');
  if (kprForm) {
    function formatRp(n){ return 'Rp ' + Math.round(n).toLocaleString('id-ID'); }
    function calc(){
      var harga = parseFloat(document.getElementById('kprHarga').value) || 0;
      var dpPercent = parseFloat(document.getElementById('kprDp').value) || 0;
      var tenor = parseFloat(document.getElementById('kprTenor').value) || 1;
      var bunga = parseFloat(document.getElementById('kprBunga').value) || 0;
      var dp = harga * (dpPercent / 100);
      var pokok = harga - dp;
      var r = (bunga / 100) / 12;
      var n = tenor * 12;
      var cicilan;
      if (r === 0) cicilan = pokok / n;
      else cicilan = pokok * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      document.getElementById('kprDpNominal').textContent = formatRp(dp);
      document.getElementById('kprPokok').textContent = formatRp(pokok);
      document.getElementById('kprCicilan').textContent = formatRp(cicilan) + ' / bulan';
    }
    kprForm.addEventListener('input', calc);
    calc();
  }
})();
</script>
</body>
</html>`;
}

export function adminLayout({ title, siteName, active = "", body, theme, role = "admin" }) {
  const nav = [
    ["/admin", "Dashboard", "dashboard"],
    ["/admin/properti/baru", "+ Tambah Properti", "new"],
    ["/admin/proyek", "Proyek / Lokasi", "projects"],
    ["/admin/leads", "Leads Masuk", "leads"],
    ["/admin/terjual", "Rumah Terjual", "sales"],
    ["/admin/pembeli", "Pembeli", "buyers"],
    ["/admin/marketing", "Marketing", "marketing"],
    ["/admin/voucher", "Voucher", "vouchers"],
    ["/admin/banner", "Banner Promosi", "banners"],
    ["/admin/testimoni", "Testimoni", "testimonials"],
    // Dua item terakhir ini hanya ditampilkan untuk role "admin" — akses
    // sebenarnya tetap ditegakkan di middleware admin.js, jadi ini murni
    // supaya sidebar role "marketing" tidak nampilin link yang bakal ditolak.
    ["/admin/pengguna", "Tim & Pengguna", "users"],
    ["/admin/settings", "Pengaturan Situs", "settings"],
  ];
  const ADMIN_ONLY_NAV_KEYS = ["users", "settings"];
  const visibleNav = role === "admin" ? nav : nav.filter(([, , key]) => !ADMIN_ONLY_NAV_KEYS.includes(key));
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} · Admin ${esc(siteName)}</title>
<link rel="icon" type="image/svg+xml" href="${faviconDataUri(siteName, theme?.accent)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${BASE_CSS}</style>
${themeOverrideCss(theme)}
<style>
  .admin-shell{ display:flex; min-height:100vh; background:var(--paper); }
  .sidebar{ width:230px; flex-shrink:0; background:var(--ink); color:#fff; padding:24px 16px; position:sticky; top:0; height:100vh; overflow-y:auto; z-index:70; }
  .sidebar a{ display:block; color:#cfcac0; text-decoration:none; font-size:13.5px; padding:10px 12px; border-radius:1px; margin-bottom:2px; }
  .sidebar a.active, .sidebar a:hover{ background:rgba(255,255,255,0.08); color:#fff; }
  .sidebar .brand{ color:#fff; margin-bottom:22px; }
  .main{ flex:1; padding:36px 40px; min-width:0; }
  table{ width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); }
  .table-scroll{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  th,td{ text-align:left; padding:12px 14px; border-bottom:1px solid var(--line); font-size:13.5px; white-space:nowrap; }
  th{ font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--stone); background:#f7f6f1; }
  .row-actions a, .row-actions button{ font-size:12.5px; margin-right:10px; }
  .panel{ background:#fff; border:1px solid var(--line); padding:28px; max-width:760px; }
  .flash{ padding:12px 16px; margin-bottom:20px; font-size:14px; }
  .flash-ok{ background:#eaf1ec; color:var(--sage); border:1px solid var(--sage); }
  .flash-err{ background:#f8ece9; color:var(--clay); border:1px solid var(--clay); }
  .thumb{ width:70px; height:52px; object-fit:cover; border:1px solid var(--line); }
  .stat-card{ background:#fff; border:1px solid var(--line); padding:20px; }

  /* ── Mobile: sidebar jadi drawer, dipicu topbar hamburger ── */
  .admin-topbar{ display:none; }
  .sidebar-overlay{ display:none; }
  @media (max-width: 900px){
    .admin-shell{ flex-direction:column; }
    .admin-topbar{
      display:flex; align-items:center; justify-content:space-between;
      position:sticky; top:0; height:58px; background:var(--ink); color:#fff;
      padding:0 16px; z-index:75;
    }
    .admin-topbar .brand{ color:#fff; font-size:18px; }
    .admin-hamburger{ background:none; border:none; cursor:pointer; padding:8px; }
    .admin-hamburger span{ display:block; width:22px; height:2px; background:#fff; margin:5px 0; border-radius:2px; }
    .sidebar{
      position:fixed; top:0; left:0; bottom:0; height:100vh; width:250px;
      transform:translateX(-100%); transition:transform .25s ease;
    }
    .sidebar.open{ transform:translateX(0); }
    .sidebar-overlay{
      display:block; position:fixed; inset:0; background:rgba(20,20,20,0.45); z-index:74;
      opacity:0; pointer-events:none; transition:opacity .2s ease;
    }
    .sidebar-overlay.open{ opacity:1; pointer-events:auto; }
    .main{ padding:22px 16px; }
  }
</style>
</head>
<body>
<div class="admin-shell">
  <div class="admin-topbar">
    <div class="brand serif">${esc(siteName)}</div>
    <button class="admin-hamburger" id="adminHamburgerBtn" aria-label="Buka menu"><span></span><span></span><span></span></button>
  </div>
  <div class="sidebar-overlay" id="sidebarOverlay"></div>
  <div class="sidebar" id="adminSidebar">
    <div class="brand serif" style="font-size:19px;"><span class="brand-mark" style="background:var(--gold);"></span> ${esc(siteName)}</div>
    ${visibleNav.map(([href, label, key]) => `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`).join("")}
    <a href="/admin/logout" style="margin-top:16px; border-top:1px solid rgba(255,255,255,0.12); padding-top:14px;">Keluar</a>
    <a href="/" target="_blank" style="opacity:.7;">← Lihat situs</a>
  </div>
  <div class="main">${body}</div>
</div>
<script>
(function(){
  var adminBtn = document.getElementById('adminHamburgerBtn');
  var adminSidebar = document.getElementById('adminSidebar');
  var adminOverlay = document.getElementById('sidebarOverlay');
  function closeSidebar(){ adminSidebar.classList.remove('open'); adminOverlay.classList.remove('open'); }
  if (adminBtn && adminSidebar && adminOverlay) {
    adminBtn.addEventListener('click', function(){
      adminSidebar.classList.toggle('open');
      adminOverlay.classList.toggle('open');
    });
    adminOverlay.addEventListener('click', closeSidebar);
    adminSidebar.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', closeSidebar); });
  }
})();
</script>
<script>
(function(){
  // ── Kompresi gambar di browser sebelum upload (resize maks 1600px, re-encode JPEG) ──
  // Berlaku otomatis untuk semua <form class="compress-upload" data-file-field="nama_input">
  async function compressImageFile(file, maxDim, quality){
    if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif') return file;
    try {
      var bitmap = await createImageBitmap(file);
      var width = bitmap.width, height = bitmap.height;
      if (width > maxDim || height > maxDim) {
        var scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      var canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      var blob = await new Promise(function(resolve){ canvas.toBlob(resolve, 'image/jpeg', quality); });
      if (!blob || blob.size >= file.size) return file; // kalau hasil kompresi malah lebih besar, pakai file asli
      var newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], newName, { type: 'image/jpeg' });
    } catch (e) {
      console.warn('Kompresi gagal, upload file asli:', e);
      return file;
    }
  }

  document.querySelectorAll('form.compress-upload').forEach(function(form){
    var fieldName = form.getAttribute('data-file-field');
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      var input = form.querySelector('input[name="' + fieldName + '"]');
      var submitBtn = form.querySelector('button[type="submit"]');
      var originalLabel = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengompres & mengupload...'; }
      try {
        var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
        var compressed = [];
        for (var i = 0; i < files.length; i++) compressed.push(await compressImageFile(files[i], 1600, 0.82));
        var fd = new FormData(form);
        fd.delete(fieldName);
        compressed.forEach(function(f){ fd.append(fieldName, f); });
        var res = await fetch(form.action, { method: 'POST', body: fd });
        window.location.href = res.url;
      } catch (err) {
        alert('Upload gagal: ' + err.message);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
      }
    });
  });
})();
</script>
</body>
</html>`;
}

export function starRating(rating) {
  const r = Math.min(5, Math.max(0, Number(rating) || 0));
  return `<span class="stars">${"★".repeat(r)}${"☆".repeat(5 - r)}</span>`;
}

export function testimonialCard(t) {
  const initial = (t.name || "?").trim().charAt(0).toUpperCase();
  const photo = t.photo_key ? `<img src="/media/${esc(t.photo_key)}" class="avatar-circle" style="object-fit:cover;" alt="${esc(t.name)}">` : `<div class="avatar-circle">${esc(initial)}</div>`;
  return `
  <div class="card"><div class="card-body">
    ${starRating(t.rating)}
    <p style="color:var(--ink); font-style:italic; margin:8px 0 16px;">&ldquo;${esc(t.quote)}&rdquo;</p>
    <div style="display:flex; align-items:center; gap:12px; margin-top:auto;">
      ${photo}
      <div>
        <div style="font-weight:600;">${esc(t.name)}</div>
        <div style="font-size:12px; color:var(--stone);">${esc(t.role)}</div>
      </div>
    </div>
  </div></div>`;
}

export function starRatingInputOptions(selected) {
  return [5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${Number(selected) === n ? "selected" : ""}>${"★".repeat(n)} (${n})</option>`).join("");
}

export function bannerCarousel(banners, fallback) {
  if (!banners.length) {
    return `
    <div style="position:absolute; inset:0; background:var(--ink);"></div>
    <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(20,20,20,.35), rgba(20,20,20,.75));"></div>`;
  }
  const slides = banners
    .map(
      (b, i) => `
    <div class="banner-slide ${i === 0 ? "active" : ""}">
      ${b.image_key ? `<img src="/media/${esc(b.image_key)}" alt="${esc(b.title)}">` : `<div style="position:absolute; inset:0; background:var(--ink);"></div>`}
      <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(20,20,20,.35), rgba(20,20,20,.75));"></div>
    </div>`
    )
    .join("");
  const dots = banners.length > 1 ? `<div class="banner-dots">${banners.map((b, i) => `<button class="banner-dot ${i === 0 ? "active" : ""}" aria-label="Banner ${i + 1}"></button>`).join("")}</div>` : "";
  return slides + dots;
}

export function dreamCalculatorHero(minPrice = 100000000, maxPrice = 500000000, defaultPrice = 150000000, subsidyDp = 1, subsidyBunga = 5) {
  return `
  <div class="dream-calc" id="dreamCalc">
    <div class="eyebrow" style="color:var(--sunny);">Kalkulator Impian</div>
    <h1 class="serif" style="font-size:26px; color:#fff; margin:8px 0 4px; line-height:1.2;">Cicilan rumah impian Anda, mulai dari berapa?</h1>
    <p style="color:rgba(255,255,255,.75); font-size:13.5px; margin:0 0 18px;">Geser buat lihat estimasi cicilan KPR Subsidi (DP ${subsidyDp}%, bunga ${subsidyBunga}% flat)</p>

    <div style="font-size:12.5px; color:rgba(255,255,255,.65); margin-bottom:2px;">Harga rumah</div>
    <div id="dreamPriceLabel" class="serif" style="font-size:24px; color:#fff; font-weight:700;">Rp ${Number(defaultPrice).toLocaleString("id-ID")}</div>
    <input type="range" id="dreamSlider" min="${minPrice}" max="${maxPrice}" step="5000000" value="${defaultPrice}" data-dp="${subsidyDp}" data-bunga="${subsidyBunga}" style="margin-top:14px;">
    <div class="dream-range-labels"><span>Rp ${(minPrice / 1000000).toFixed(0)}jt</span><span>Rp ${(maxPrice / 1000000).toFixed(0)}jt</span></div>

    <div style="margin-top:22px;">
      <div class="eyebrow" style="color:rgba(255,255,255,.65);">Estimasi Cicilan</div>
      <div id="dreamCicilan" class="serif" style="font-size:32px; color:var(--sunny); font-weight:700; line-height:1.1; margin-bottom:16px;">-</div>
      <a href="/properti" id="dreamCta" class="btn btn-gold dream-cta">Lihat Rumahnya →</a>
    </div>
  </div>`;
}

export function bentoLargeCard(p) {
  const img = p.cover_image ? `/media/${esc(p.cover_image)}` : "";
  return `
  <a href="/properti/${esc(p.slug)}" class="bento-large">
    ${img ? `<img src="${img}" alt="${esc(p.title)}" loading="lazy">` : `<div style="position:absolute;inset:0;background:#dfe4da;"></div>`}
    <div class="bento-large-overlay">
      <div style="display:flex; gap:8px; margin-bottom:10px;">${statusBadge(p.status)}${p.subsidized ? subsidyBadge() : ""}</div>
      <h3 class="serif" style="margin:0 0 6px; font-size:24px; color:#fff;">${esc(p.title)}</h3>
      <div style="font-size:13px; color:rgba(255,255,255,.8); margin-bottom:8px;">${esc(p.location || "-")}</div>
      <div class="serif" style="font-size:20px; color:var(--sunny); font-weight:700;">${p.subsidized ? "" : p.price_label ? esc(p.price_label) + " " : ""}${formatRupiah(p.price)}</div>
    </div>
  </a>`;
}

export function bentoNormalCard(p) {
  const img = p.cover_image ? `/media/${esc(p.cover_image)}` : "";
  return `
  <a href="/properti/${esc(p.slug)}" class="bento-large bento-normal">
    ${img ? `<img src="${img}" alt="${esc(p.title)}" loading="lazy">` : `<div style="position:absolute;inset:0;background:#dfe4da;"></div>`}
    <div class="bento-large-overlay" style="padding:18px;">
      <div style="display:flex; gap:6px; margin-bottom:6px;">${statusBadge(p.status)}${p.subsidized ? subsidyBadge() : ""}</div>
      <h3 class="serif" style="margin:0 0 4px; font-size:17px; color:#fff;">${esc(p.title)}</h3>
      <div class="serif" style="font-size:15px; color:var(--sunny); font-weight:700;">${formatRupiah(p.price)}</div>
    </div>
  </a>`;
}

export function bentoStatCard(availableCount, soldCount) {
  return `
  <div class="bento-stat">
    <div>
      <div class="eyebrow" style="color:var(--sunny);">Update Terkini</div>
      <div class="serif" style="font-size:15px; margin-top:4px;">${soldCount} keluarga sudah lebih dulu punya rumah bersama kami</div>
    </div>
    <div style="display:flex; gap:32px;">
      <div style="text-align:center;">
        <div class="serif" style="font-size:34px; font-weight:700;">${availableCount}</div>
        <div style="font-size:11px; color:rgba(255,255,255,.65); text-transform:uppercase; letter-spacing:.04em;">Unit Tersedia</div>
      </div>
      <div style="text-align:center;">
        <div class="serif" style="font-size:34px; font-weight:700; color:var(--sunny);">${soldCount}</div>
        <div style="font-size:11px; color:rgba(255,255,255,.65); text-transform:uppercase; letter-spacing:.04em;">Sudah Terjual</div>
      </div>
    </div>
  </div>`;
}

export function kprCalculator(defaultPrice, subsidized = false, subsidyDp = 1, subsidyBunga = 5) {
  const dp = subsidized ? subsidyDp : 20;
  const bunga = subsidized ? subsidyBunga : 6.5;
  return `
  <div class="kpr-box" id="kprForm">
    <div class="eyebrow">Simulasi Cicilan</div>
    <h3 class="serif" style="margin:8px 0 16px; font-size:20px;">Kalkulator KPR${subsidized ? " Subsidi" : ""}</h3>
    ${subsidized ? `<p style="font-size:12.5px; color:var(--gold-dark); font-weight:800; margin:-8px 0 16px;">✓ Simulasi pakai DP & bunga program KPR Subsidi Pemerintah (FLPP)</p>` : ""}
    <div class="field"><label>Harga Properti (Rp)</label><input type="number" id="kprHarga" value="${Number(defaultPrice) || 0}"></div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
      <div class="field"><label>Uang Muka (%)</label><input type="number" id="kprDp" value="${dp}" min="0" max="90" step="0.5"></div>
      <div class="field"><label>Tenor (tahun)</label><input type="number" id="kprTenor" value="${subsidized ? 20 : 15}" min="1" max="30"></div>
    </div>
    <div class="field"><label>Bunga per Tahun (%)</label><input type="number" id="kprBunga" value="${bunga}" step="0.1"></div>
    <div style="border-top:1px solid var(--line); margin-top:6px; padding-top:14px; font-size:13.5px; color:var(--stone);">
      <div style="display:flex; justify-content:space-between; padding:4px 0;"><span>Uang Muka</span><span id="kprDpNominal">-</span></div>
      <div style="display:flex; justify-content:space-between; padding:4px 0;"><span>Pokok Pinjaman</span><span id="kprPokok">-</span></div>
    </div>
    <div class="eyebrow" style="margin-top:10px;">Estimasi Cicilan</div>
    <div class="kpr-result" id="kprCicilan">-</div>
    <p style="font-size:11.5px; color:var(--stone); margin-top:10px;">*Simulasi kasar, bukan penawaran resmi bank. Angka final tergantung kebijakan bank/KPR terkait${subsidized ? " dan dapat berubah sesuai kebijakan pemerintah terbaru" : ""}.</p>
  </div>`;
}

export function mapsEmbed(location) {
  if (!location) return "";
  const q = encodeURIComponent(location);
  return `<iframe src="https://www.google.com/maps?q=${q}&output=embed" style="width:100%; aspect-ratio:16/8; border:0;" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Lokasi ${esc(location)}"></iframe>`;
}

export function propertyCard(p) {
  const img = p.cover_image ? `/media/${esc(p.cover_image)}` : "";
  return `
  <a href="/properti/${esc(p.slug)}" style="text-decoration:none;color:inherit;">
    <div class="card">
      ${img ? `<img class="card-img" src="${img}" alt="${esc(p.title)}" loading="lazy">` : `<div class="card-img"></div>`}
      <div class="card-body">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <span class="eyebrow">${esc(p.type)}</span>
          ${statusBadge(p.status)}
        </div>
        <h3 class="serif" style="margin:2px 0 0; font-size:21px;">${esc(p.title)}</h3>
        ${p.subsidized ? `<div>${subsidyBadge()}</div>` : ""}
        <div style="color:var(--stone); font-size:13px;">${esc(p.location || "-")}</div>
        <div class="specs">
          ${p.land_area ? `<span style="display:inline-flex;align-items:center;gap:4px;">${icon("land")}${esc(p.land_area)}m²</span>` : ""}
          ${p.building_area ? `<span style="display:inline-flex;align-items:center;gap:4px;">${icon("building")}${esc(p.building_area)}m²</span>` : ""}
          ${p.bedrooms ? `<span style="display:inline-flex;align-items:center;gap:4px;">${icon("bed")}${esc(p.bedrooms)}</span>` : ""}
          ${p.bathrooms ? `<span style="display:inline-flex;align-items:center;gap:4px;">${icon("bath")}${esc(p.bathrooms)}</span>` : ""}
        </div>
        <div style="margin-top:auto; padding-top:10px; font-weight:600; color:var(--gold-dark); font-size:17px;" class="serif">
          ${p.subsidized ? "" : p.price_label ? esc(p.price_label) + " " : ""}${formatRupiah(p.price)}
        </div>
        ${p.subsidized ? `<div style="font-size:11.5px; color:var(--stone);">✓ Harga pasti sesuai ketentuan pemerintah</div>` : ""}
      </div>
    </div>
  </a>`;
}

// `mode`: "filter" (default) menautkan ke /properti?project=slug untuk filter listing (dipakai di halaman /properti).
// "page" menautkan langsung ke halaman landing proyek /proyek/slug (dipakai di homepage, lebih baik untuk SEO).
export function projectPills(projects, activeSlug, mode = "filter") {
  const hrefFor = (slug) => (mode === "page" ? `/proyek/${esc(slug)}` : `/properti?project=${esc(slug)}`);
  return `
  <div>
    ${mode === "filter" ? `<a href="/properti" class="pill ${!activeSlug ? "active" : ""}">Semua Lokasi</a>` : ""}
    ${projects.map((pr) => `<a href="${hrefFor(pr.slug)}" class="pill ${activeSlug === pr.slug ? "active" : ""}">${esc(pr.name)} — ${esc(pr.location)}</a>`).join("")}
  </div>`;
}

export function voucherCard(v, waNumber) {
  const discount = v.discount_type === "percent" ? `${v.discount_value}%` : formatRupiah(v.discount_value);
  const msg = encodeURIComponent(`Halo, saya mau klaim voucher ${v.code} - ${v.title}.`);
  return `
  <div class="card" style="border-style:dashed; border-color:var(--gold);">
    <div class="card-body">
      <span class="eyebrow">Voucher Promo</span>
      <h3 class="serif" style="margin:4px 0 0; font-size:20px;">${esc(v.title)}</h3>
      <p style="color:var(--stone); font-size:13.5px; margin:4px 0 8px;">${esc(v.description || "")}</p>
      <div class="serif" style="font-size:24px; color:var(--gold-dark);">Diskon ${discount}</div>
      <div class="mono" style="background:#f7f6f1; border:1px dashed var(--line); padding:8px 12px; margin:10px 0; letter-spacing:.1em; text-align:center;">${esc(v.code)}</div>
      ${v.valid_until ? `<div style="font-size:12px; color:var(--stone);">Berlaku hingga ${esc(v.valid_until)}</div>` : ""}
      <a href="https://wa.me/${esc(waNumber)}?text=${msg}" target="_blank" class="btn btn-gold" style="margin-top:12px; justify-content:center;">Klaim Sekarang</a>
    </div>
  </div>`;
}
