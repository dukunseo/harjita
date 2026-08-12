import { Hono } from "hono";
import { adminLayout, formatRupiah, statusBadge, draftBadge, subsidyBadge, leadStatusBadge, esc, safeUrl, starRating, starRatingInputOptions, faviconDataUri, toCsv } from "../templates.js";
import {
  listProperties, getPropertyById, getImages, createProperty, updateProperty, deleteProperty,
  addImage, getImageById, deleteImage, setCoverImage, setBrochure, removeBrochure, getAllSettings, setSetting,
  listProjects, getProjectById, createProject, updateProject, deleteProject, setProjectCover,
  listBuyers, getBuyerById, createBuyer, updateBuyer, deleteBuyer,
  listMarketing, getMarketingById, createMarketing, updateMarketing, deleteMarketing,
  listSales, createSale, deleteSale, countSales,
  bulkSetPublished, bulkDeleteProperties,
  listVouchers, getVoucherById, createVoucher, updateVoucher, deleteVoucher,
  listBanners, getBannerById, createBanner, updateBanner, deleteBanner, setBannerImage,
  listTestimonials, getTestimonialById, createTestimonial, updateTestimonial, setTestimonialPhoto, deleteTestimonial,
  countProperties, countProjects, getSiteContext,
  recentFailedAttempts, recordLoginAttempt, isLoginLocked, LOGIN_WINDOW_MINUTES,
  listLeads, getLeadById, countUnhandledLeads, setLeadHandled, deleteLead,
  listAdminUsers, getAdminUserByUsername, getAdminUserById, createAdminUser, setAdminUserActive, setAdminUserPassword, deleteAdminUser, ADMIN_ROLES,
} from "../db.js";
import { createSessionCookie, clearSessionCookie, requireAuth, csrfToken, requireCsrf, hiddenCsrfField, timingSafeEqual, hashPassword, verifyPassword } from "../auth.js";

// Prefix route yang hanya boleh diakses role "admin" (bukan "marketing").
// Dicek di path SETELAH "/admin" dibuang, mis. request ke /admin/settings -> "/settings".
const ADMIN_ONLY_PREFIXES = ["/settings", "/pengguna"];

export const adminRoutes = new Hono();

// ================= LOGIN (tanpa CSRF, tapi dengan rate limit) =================

adminRoutes.get("/login", async (c) => {
  const { siteName, theme } = await getSiteContext(c.env.DB, c.env);
  const err = c.req.query("error");
  return c.html(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login Admin · ${esc(siteName)}</title>
<link rel="icon" type="image/svg+xml" href="${faviconDataUri(siteName, theme.accent)}">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  body{ font-family:'Nunito',sans-serif; background:${/^#[0-9a-fA-F]{6}$/.test(theme.dark) ? theme.dark : "#26332D"}; min-height:100vh; display:flex; align-items:center; justify-content:center; margin:0; }
  .box{ background:#fff; padding:40px; width:340px; border-radius:24px; }
  h1{ font-family:'Baloo 2',sans-serif; font-weight:700; font-size:26px; margin:0 0 20px; }
  input{ width:100%; padding:12px 14px; margin-bottom:14px; border:2px solid #e5e5e0; border-radius:12px; box-sizing:border-box; font-family:'Nunito',sans-serif; font-size:14.5px; }
  button{ width:100%; padding:13px; background:${/^#[0-9a-fA-F]{6}$/.test(theme.accent) ? theme.accent : "#2EB872"}; color:#fff; border:none; border-radius:999px; font-weight:800; cursor:pointer; font-size:14.5px; }
  .err{ color:#E2574C; font-size:13.5px; font-weight:700; margin-bottom:14px; }
</style>
</head><body>
  <div class="box">
    <h1>Login Admin</h1>
    ${err === "1" ? `<div class="err">Username atau password salah.</div>` : ""}
    ${err === "locked" ? `<div class="err">Terlalu banyak percobaan gagal. Coba lagi dalam ${LOGIN_WINDOW_MINUTES} menit.</div>` : ""}
    <form method="post" action="/admin/login">
      <input type="text" name="username" placeholder="Username" required autofocus autocomplete="username">
      <input type="password" name="password" placeholder="Password" required autocomplete="current-password">
      <button type="submit">Masuk</button>
    </form>
  </div>
</body></html>`);
});

adminRoutes.post("/login", async (c) => {
  const { DB } = c.env;
  const ip = c.req.header("CF-Connecting-IP") || "unknown";

  const failed = await recentFailedAttempts(DB, ip);
  if (isLoginLocked(failed)) {
    return c.redirect("/admin/login?error=locked");
  }

  const body = await c.req.parseBody();
  const username = String(body.username || "");
  const password = String(body.password || "");

  // 1) Cek dulu kredensial "pemilik" dari secret ADMIN_USER/ADMIN_PASS — ini
  //    akun fallback yang selalu ada, jadi walau semua akun di tabel admin_users
  //    kena nonaktifkan/kehapus, masih ada jalan masuk. Kalau belum di-set
  //    sebagai secret, jangan izinkan login pakai jalur ini (cegah bypass
  //    lewat username/password kosong).
  const hasOwnerCredentials = !!c.env.ADMIN_USER && !!c.env.ADMIN_PASS;
  const validOwnerUser = hasOwnerCredentials && timingSafeEqual(username, c.env.ADMIN_USER);
  const validOwnerPass = hasOwnerCredentials && timingSafeEqual(password, c.env.ADMIN_PASS);
  let ok = validOwnerUser && validOwnerPass;
  let role = "admin";

  // 2) Kalau bukan akun pemilik, cek tabel admin_users (akun tim: admin/marketing).
  if (!ok && username) {
    const user = await getAdminUserByUsername(DB, username);
    if (user && user.active && (await verifyPassword(password, user.password_hash))) {
      ok = true;
      role = user.role;
    }
  }

  await recordLoginAttempt(DB, ip, ok);

  if (ok) {
    const cookie = await createSessionCookie(username, role, c.env.SESSION_SECRET);
    c.header("Set-Cookie", cookie);
    return c.redirect("/admin");
  }
  return c.redirect("/admin/login?error=1");
});

adminRoutes.get("/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.redirect("/admin/login");
});

// ================= Semua route di bawah ini butuh login + CSRF di POST =================

adminRoutes.use("/*", requireAuth);
adminRoutes.use("/*", async (c, next) => {
  const { siteName, theme } = await getSiteContext(c.env.DB, c.env);
  c.set("siteName", siteName);
  c.set("theme", theme);
  c.set("role", c.get("admin")?.role || "admin");
  await next();
});
// Batasi route yang hanya boleh diakses role "admin" (Pengaturan Situs, Tim & Pengguna).
// Role "marketing" tetap bisa akses semua route operasional lain (properti, leads,
// terjual, pembeli, voucher, banner, testimoni, proyek).
adminRoutes.use("/*", async (c, next) => {
  const role = c.get("role");
  if (role === "marketing") {
    const path = c.req.path.replace(/^\/admin/, "") || "/";
    const blocked = ADMIN_ONLY_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
    if (blocked) return c.text("Akses ditolak. Fitur ini hanya untuk role Admin.", 403);
  }
  await next();
});
adminRoutes.on("POST", "/*", requireCsrf);

function pb(c) {
  // Body sudah diparse oleh middleware requireCsrf, pakai ini di semua handler POST.
  return c.get("parsedBody");
}

// ================= DASHBOARD =================

const PAGE_SIZE = 20;

adminRoutes.get("/", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);

  // ── Filter & paginasi ──
  const q = c.req.query("q") || "";
  const status = c.req.query("status") || "";
  const type = c.req.query("type") || "";
  const project_id = c.req.query("project_id") || "";
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
  const filters = { q, status, type, project_id };

  const [properties, total, projects, soldCount, projectCount, salesCount, unhandledLeads] = await Promise.all([
    listProperties(DB, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countProperties(DB, filters),
    listProjects(DB),
    countProperties(DB, { status: "terjual" }),
    countProjects(DB),
    countSales(DB),
    countUnhandledLeads(DB),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const types = ["Rumah", "Ruko", "Apartemen", "Tanah", "Kavling"];
  const statuses = [["tersedia", "Tersedia"], ["proses", "Dalam Proses"], ["terjual", "Terjual"]];

  // Bangun query string dasar (tanpa `page`) supaya link paginasi mempertahankan filter aktif.
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  if (type) qs.set("type", type);
  if (project_id) qs.set("project_id", project_id);
  const baseQs = qs.toString();
  const pageLink = (n) => `/admin?${baseQs ? baseQs + "&" : ""}page=${n}`;

  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <div class="grid grid-4" style="margin-bottom:28px;">
      <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total Properti${baseQs ? " (filter aktif)" : ""}</div></div>
      <div class="stat-card"><div class="stat-num">${soldCount}</div><div class="stat-label">Terjual</div></div>
      <div class="stat-card"><div class="stat-num">${projectCount}</div><div class="stat-label">Proyek Aktif</div></div>
      <a href="/admin/leads" class="stat-card" style="text-decoration:none; color:inherit; ${unhandledLeads > 0 ? "border-color:var(--clay);" : ""}">
        <div class="stat-num" style="${unhandledLeads > 0 ? "color:var(--clay);" : ""}">${unhandledLeads}</div>
        <div class="stat-label">Leads Baru</div>
      </a>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:10px;">
      <h1 class="serif" style="font-size:26px; margin:0;">Daftar Properti</h1>
      <a href="/admin/properti/baru" class="btn btn-gold">+ Tambah Properti</a>
    </div>

    <form method="get" action="/admin" class="panel" style="margin-bottom:18px; display:grid; grid-template-columns:2fr 1fr 1fr 1fr auto; gap:10px; align-items:end;">
      <div class="field" style="margin:0;"><label>Cari</label><input type="text" name="q" value="${esc(q)}" placeholder="Judul atau lokasi..."></div>
      <div class="field" style="margin:0;"><label>Status</label>
        <select name="status">
          <option value="">Semua</option>
          ${statuses.map(([v, l]) => `<option value="${v}" ${v === status ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
      <div class="field" style="margin:0;"><label>Tipe</label>
        <select name="type">
          <option value="">Semua</option>
          ${types.map((t) => `<option ${t === type ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="field" style="margin:0;"><label>Proyek</label>
        <select name="project_id">
          <option value="">Semua</option>
          ${projects.map((pr) => `<option value="${pr.id}" ${String(pr.id) === String(project_id) ? "selected" : ""}>${esc(pr.name)}</option>`).join("")}
        </select>
      </div>
      <button type="submit" class="btn btn-outline" style="height:42px;">Filter</button>
    </form>

    <form method="post" action="/admin/properti/bulk" onsubmit="return confirmBulk(event);">
      ${hiddenCsrfField(csrf)}
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
        <select name="bulk_action" style="width:auto; padding:8px 10px; border-radius:8px; border:2px solid var(--line);">
          <option value="">Aksi massal untuk yang dicentang...</option>
          <option value="publish">Publikasikan</option>
          <option value="unpublish">Jadikan draft</option>
          <option value="delete">Hapus</option>
        </select>
        <button type="submit" class="btn btn-outline" style="padding:8px 16px;">Terapkan</button>
        <span style="font-size:12.5px; color:var(--stone);">Centang properti di tabel, pilih aksi, lalu klik Terapkan.</span>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th style="width:34px;"><input type="checkbox" onclick="document.querySelectorAll('.row-check').forEach(cb=>cb.checked=this.checked)"></th><th>Foto</th><th>Judul</th><th>Tipe</th><th>Status</th><th>Harga</th><th>Aksi</th></tr></thead>
        <tbody>
          ${
            properties.length
              ? properties
                  .map(
                    (p) => `<tr>
              <td><input type="checkbox" class="row-check" name="ids" value="${p.id}"></td>
              <td>${p.cover_image ? `<img class="thumb" src="/media/${esc(p.cover_image)}">` : `<div class="thumb" style="background:#eee;"></div>`}</td>
              <td>${esc(p.title)}</td>
              <td>${esc(p.type)}</td>
              <td>${statusBadge(p.status)} ${p.published ? "" : draftBadge()} ${p.subsidized ? subsidyBadge() : ""}</td>
              <td>${formatRupiah(p.price)}</td>
              <td class="row-actions">
                <a href="/admin/properti/${p.id}/edit">Edit</a>
                <a href="/admin/properti/${p.id}/gallery">Gallery</a>
                <a href="/properti/${esc(p.slug)}" target="_blank">Lihat</a>
                <form method="post" action="/admin/properti/${p.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus properti &quot;${esc(p.title).replace(/'/g, "&#039;")}&quot; beserta semua foto & brosurnya? Tindakan ini tidak bisa dibatalkan.');">
                  ${hiddenCsrfField(csrf)}
                  <button type="submit" style="background:none;border:none;color:var(--clay);font-size:12.5px;cursor:pointer;padding:0;font-weight:700;">Hapus</button>
                </form>
              </td>
            </tr>`
                  )
                  .join("")
              : `<tr><td colspan="7" style="text-align:center; color:var(--stone); padding:30px;">${baseQs ? "Tidak ada properti yang cocok dengan filter." : "Belum ada properti."}</td></tr>`
          }
        </tbody>
      </table></div>
    </form>

    ${
      totalPages > 1
        ? `<div style="display:flex; gap:6px; justify-content:center; margin-top:18px; flex-wrap:wrap;">
            ${Array.from({ length: totalPages }, (_, i) => i + 1)
              .map(
                (n) =>
                  `<a href="${pageLink(n)}" class="btn ${n === page ? "btn-gold" : "btn-outline"}" style="padding:8px 14px; min-width:38px; text-align:center;">${n}</a>`
              )
              .join("")}
          </div>`
        : ""
    }
    <script>
      function confirmBulk(e){
        var action = e.target.bulk_action.value;
        var checked = e.target.querySelectorAll('.row-check:checked').length;
        if (!action) { alert('Pilih aksi massal dulu.'); e.preventDefault(); return false; }
        if (!checked) { alert('Centang minimal satu properti.'); e.preventDefault(); return false; }
        if (action === 'delete') return confirm('Hapus ' + checked + ' properti terpilih beserta semua fotonya? Tindakan ini tidak bisa dibatalkan.');
        return confirm((action === 'publish' ? 'Publikasikan' : 'Jadikan draft') + ' ' + checked + ' properti terpilih?');
      }
    </script>
  `;
  return c.html(adminLayout({ title: "Dashboard", siteName, active: "dashboard", body, theme, role }));
});

adminRoutes.post("/properti/bulk", async (c) => {
  const { DB, MEDIA } = c.env;
  const body = pb(c);
  const action = body.bulk_action;
  const rawIds = Array.isArray(body.ids) ? body.ids : body.ids ? [body.ids] : [];
  const ids = rawIds.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n));

  if (ids.length && action) {
    if (action === "publish") await bulkSetPublished(DB, ids, true);
    else if (action === "unpublish") await bulkSetPublished(DB, ids, false);
    else if (action === "delete") {
      for (const id of ids) {
        const images = await getImages(DB, id);
        for (const img of images) await MEDIA.delete(img.image_key).catch(() => {});
      }
      await bulkDeleteProperties(DB, ids);
    }
  }
  return c.redirect(`/admin?msg=${encodeURIComponent(`Aksi massal diterapkan ke ${ids.length} properti.`)}`);
});

// ================= PROPERTI CRUD =================

async function propertyForm(c, p = {}) {
  const { DB } = c.env;
  const types = ["Rumah", "Ruko", "Apartemen", "Tanah", "Kavling"];
  const statuses = [["tersedia", "Tersedia"], ["proses", "Dalam Proses"], ["terjual", "Terjual"]];
  const projects = await listProjects(DB);
  return `
    <div class="field"><label>Judul Properti</label><input type="text" name="title" value="${esc(p.title)}" required></div>
    <div class="field"><label>Deskripsi</label><textarea name="description" rows="5">${esc(p.description)}</textarea></div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div class="field"><label>Tipe</label><select name="type">${types.map((t) => `<option ${t === p.type ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Status</label><select name="status">${statuses.map(([v, l]) => `<option value="${v}" ${v === p.status ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Proyek / Lokasi</label>
      <select name="project_id">
        <option value="">— Tanpa proyek —</option>
        ${projects.map((pr) => `<option value="${pr.id}" ${String(pr.id) === String(p.project_id) ? "selected" : ""}>${esc(pr.name)} (${esc(pr.location)})</option>`).join("")}
      </select>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div class="field"><label>Harga (Rp)</label><input type="number" name="price" min="0" value="${esc(p.price)}"></div>
      <div class="field"><label>Label Harga (opsional)</label><input type="text" name="price_label" placeholder="Mulai dari / Nego" value="${esc(p.price_label)}"></div>
    </div>
    <div class="field"><label>Lokasi (teks bebas, mis. nama jalan)</label><input type="text" name="location" value="${esc(p.location)}"></div>
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:16px;">
      <div class="field"><label>LT (m²)</label><input type="number" name="land_area" min="0" value="${esc(p.land_area)}"></div>
      <div class="field"><label>LB (m²)</label><input type="number" name="building_area" min="0" value="${esc(p.building_area)}"></div>
      <div class="field"><label>Kamar Tidur</label><input type="number" name="bedrooms" min="0" value="${esc(p.bedrooms)}"></div>
      <div class="field"><label>Kamar Mandi</label><input type="number" name="bathrooms" min="0" value="${esc(p.bathrooms)}"></div>
    </div>
    <div class="field"><label>Carport</label><input type="number" name="carports" min="0" value="${esc(p.carports)}" style="max-width:150px;"></div>
    <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none;"><input type="checkbox" name="featured" value="1" style="width:auto;" ${p.featured ? "checked" : ""}> Tampilkan sebagai unit unggulan di homepage</label></div>
    <div class="field" style="background:#f7f6f1; border:1px solid var(--line); padding:14px;">
      <label style="display:inline-flex; align-items:center; gap:8px; text-transform:none; margin:0;">
        <input type="checkbox" name="published" value="1" style="width:auto;" ${p.published === undefined || p.published ? "checked" : ""}>
        Publikasikan (tampil di situs publik)
      </label>
      <p style="font-size:12px; color:var(--stone); margin:6px 0 0;">Kalau dicentang, properti langsung tayang. Kalau tidak, tersimpan sebagai draft — hanya terlihat di panel admin sampai lo publikasikan.</p>
    </div>
    <div class="field" style="background:#FFF9E8; border:1px solid var(--sunny-dark, #F2AE1E); padding:14px;">
      <label style="display:inline-flex; align-items:center; gap:8px; text-transform:none; margin:0;">
        <input type="checkbox" name="subsidized" value="1" style="width:auto;" ${p.subsidized ? "checked" : ""}>
        🏠 Program KPR Subsidi Pemerintah (FLPP)
      </label>
      <p style="font-size:12px; color:var(--stone); margin:6px 0 0;">Kalau dicentang: badge subsidi otomatis muncul, harga ditampilkan sebagai "harga pasti" (label harga custom disembunyikan), dan kalkulator KPR di halaman detail otomatis pakai DP/bunga subsidi (bisa diatur di Pengaturan Situs).</p>
    </div>
  `;
}

adminRoutes.get("/properti/baru", async (c) => {
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const body = `
    <h1 class="serif" style="font-size:26px;">Tambah Properti</h1>
    <div class="panel">
      <form method="post" action="/admin/properti/baru">
        ${hiddenCsrfField(await csrfToken(c))}
        ${await propertyForm(c)}
        <button type="submit" class="btn btn-gold">Simpan Properti</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Tambah Properti", siteName, active: "new", body, theme, role }));
});

adminRoutes.post("/properti/baru", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.featured = data.featured === "1";
  data.published = data.published === "1";
  data.subsidized = data.subsidized === "1";
  const { id } = await createProperty(DB, data);
  return c.redirect(`/admin/properti/${id}/gallery?msg=${encodeURIComponent("Properti berhasil dibuat. Sekarang tambahkan foto.")}`);
});

adminRoutes.get("/properti/:id/edit", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const p = await getPropertyById(DB, c.req.param("id"));
  if (!p) return c.notFound();
  const csrf = await csrfToken(c);
  const body = `
    <h1 class="serif" style="font-size:26px;">Edit Properti</h1>
    <div class="panel">
      <form method="post" action="/admin/properti/${p.id}/edit">
        ${hiddenCsrfField(csrf)}
        ${await propertyForm(c, p)}
        <button type="submit" class="btn btn-gold">Simpan Perubahan</button>
        <a href="/admin/properti/${p.id}/gallery" class="btn btn-outline">Kelola Gallery →</a>
      </form>
      <form method="post" action="/admin/properti/${p.id}/hapus" style="margin-top:14px;" onsubmit="return confirm('Hapus properti &quot;${esc(p.title).replace(/'/g, "&#039;")}&quot; beserta semua foto & brosurnya? Tindakan ini tidak bisa dibatalkan.');">
        ${hiddenCsrfField(csrf)}
        <button type="submit" class="btn btn-outline" style="border-color:var(--clay); color:var(--clay);">Hapus Properti Ini</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Edit Properti", siteName, body, theme, role }));
});

adminRoutes.post("/properti/:id/edit", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  const data = pb(c);
  data.featured = data.featured === "1";
  data.published = data.published === "1";
  data.subsidized = data.subsidized === "1";
  await updateProperty(DB, id, data);
  return c.redirect(`/admin?msg=${encodeURIComponent("Perubahan disimpan.")}`);
});

adminRoutes.post("/properti/:id/hapus", async (c) => {
  const { DB, MEDIA } = c.env;
  const id = c.req.param("id");
  const images = await getImages(DB, id);
  for (const img of images) await MEDIA.delete(img.image_key).catch(() => {});
  await deleteProperty(DB, id);
  return c.redirect(`/admin?msg=${encodeURIComponent("Properti dihapus.")}`);
});

// ================= GALLERY =================

adminRoutes.get("/properti/:id/gallery", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const id = c.req.param("id");
  const p = await getPropertyById(DB, id);
  if (!p) return c.notFound();
  const images = await getImages(DB, id);
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);

  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <h1 class="serif" style="font-size:26px;">Gallery: ${esc(p.title)}</h1>
    <div class="panel" style="margin-bottom:24px;">
      <form method="post" action="/admin/properti/${id}/gallery/upload" enctype="multipart/form-data" class="compress-upload" data-file-field="photos">
        ${hiddenCsrfField(csrf)}
        <div class="field"><label>Upload Foto (bisa pilih beberapa sekaligus, maks. 8MB/file)</label><input type="file" name="photos" accept="image/*" multiple required></div>
        <button type="submit" class="btn btn-gold">Upload</button>
      </form>
    </div>

    <div class="panel" style="margin-bottom:24px;">
      <div class="eyebrow" style="margin-bottom:10px;">Brosur PDF (opsional)</div>
      ${
        p.brochure_key
          ? `<p style="font-size:13.5px; margin-bottom:12px;">Brosur saat ini: <a href="/media/${esc(p.brochure_key)}" target="_blank">Lihat PDF</a></p>
             <form method="post" action="/admin/properti/${id}/brosur/hapus" style="display:inline">${hiddenCsrfField(csrf)}<button type="submit" class="btn btn-outline">Hapus Brosur</button></form>`
          : `<form method="post" action="/admin/properti/${id}/brosur" enctype="multipart/form-data">
              ${hiddenCsrfField(csrf)}
              <div class="field"><label>Upload Brosur (PDF, maks. 8MB)</label><input type="file" name="brochure" accept="application/pdf" required></div>
              <button type="submit" class="btn btn-outline">Upload Brosur</button>
            </form>`
      }
    </div>
    <div class="grid grid-4">
      ${images
        .map(
          (img) => `
        <div style="border:1px solid var(--line); background:#fff;">
          <img src="/media/${esc(img.image_key)}" style="width:100%; aspect-ratio:4/3; object-fit:cover; display:block;">
          <div style="padding:10px; display:flex; justify-content:space-between; align-items:center;">
            ${
              p.cover_image === img.image_key
                ? `<span class="eyebrow" style="color:var(--sage);">Cover ✓</span>`
                : `<form method="post" action="/admin/properti/${id}/gallery/${img.id}/cover">${hiddenCsrfField(csrf)}<button type="submit" style="background:none;border:none;color:var(--stone);font-size:12px;cursor:pointer;padding:0;">Jadikan cover</button></form>`
            }
            <form method="post" action="/admin/gallery/${img.id}/hapus" onsubmit="return confirm('Hapus foto ini?');">
              ${hiddenCsrfField(csrf)}
              <button type="submit" style="background:none;border:none;color:var(--clay);font-size:12px;cursor:pointer;padding:0;">Hapus</button>
            </form>
          </div>
        </div>`
        )
        .join("")}
    </div>
    ${images.length === 0 ? `<p style="color:var(--stone);">Belum ada foto di album ini.</p>` : ""}
  `;
  return c.html(adminLayout({ title: "Gallery", siteName, body, theme, role }));
});

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB per file
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function safeExt(filename) {
  const ext = (filename.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
}

adminRoutes.post("/properti/:id/gallery/upload", async (c) => {
  const { DB, MEDIA } = c.env;
  const id = c.req.param("id");
  const body = pb(c);
  let files = body["photos"];
  if (!files) files = [];
  if (!Array.isArray(files)) files = [files];

  const p = await getPropertyById(DB, id);
  if (!p) return c.notFound();
  let isFirst = !p.cover_image;

  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_UPLOAD_BYTES) continue; // lewati file terlalu besar
    if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) continue; // hanya izinkan tipe gambar umum
    const ext = safeExt(file.name || "photo.jpg");
    const key = `properti/${id}/${crypto.randomUUID()}.${ext}`;
    await MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "image/jpeg" } });
    await addImage(DB, id, key);
    if (isFirst) {
      await setCoverImage(DB, id, key);
      isFirst = false;
    }
  }
  return c.redirect(`/admin/properti/${id}/gallery?msg=${encodeURIComponent("Foto berhasil diupload.")}`);
});

adminRoutes.post("/properti/:id/gallery/:imageId/cover", async (c) => {
  const { DB } = c.env;
  const { id, imageId } = c.req.param();
  const img = await getImageById(DB, imageId);
  if (img) await setCoverImage(DB, id, img.image_key);
  return c.redirect(`/admin/properti/${id}/gallery`);
});

adminRoutes.post("/gallery/:imageId/hapus", async (c) => {
  const { DB, MEDIA } = c.env;
  const imageId = c.req.param("imageId");
  const img = await getImageById(DB, imageId);
  if (img) {
    await MEDIA.delete(img.image_key).catch(() => {});
    await deleteImage(DB, imageId);
  }
  return c.redirect(`/admin/properti/${img?.property_id}/gallery`);
});

const ALLOWED_PDF_TYPE = "application/pdf";

adminRoutes.post("/properti/:id/brosur", async (c) => {
  const { DB, MEDIA } = c.env;
  const id = c.req.param("id");
  const body = pb(c);
  const file = body["brochure"];
  if (file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD_BYTES && (!file.type || file.type === ALLOWED_PDF_TYPE)) {
    const key = `brosur/${id}/${crypto.randomUUID()}.pdf`;
    await MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: ALLOWED_PDF_TYPE } });
    await setBrochure(DB, id, key);
    return c.redirect(`/admin/properti/${id}/gallery?msg=${encodeURIComponent("Brosur berhasil diupload.")}`);
  }
  return c.redirect(`/admin/properti/${id}/gallery?msg=${encodeURIComponent("Upload brosur gagal — pastikan file PDF dan di bawah 8MB.")}`);
});

adminRoutes.post("/properti/:id/brosur/hapus", async (c) => {
  const { DB, MEDIA } = c.env;
  const id = c.req.param("id");
  const p = await getPropertyById(DB, id);
  if (p?.brochure_key) await MEDIA.delete(p.brochure_key).catch(() => {});
  await removeBrochure(DB, id);
  return c.redirect(`/admin/properti/${id}/gallery?msg=${encodeURIComponent("Brosur dihapus.")}`);
});

// ================= LEADS (form kontak publik) =================

adminRoutes.get("/leads", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const filter = c.req.query("filter") || "";
  const q = c.req.query("q") || "";
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);

  const leads = await listLeads(DB, {
    unhandledOnly: filter === "baru",
    handledOnly: filter === "ditindaklanjuti",
    q,
  });

  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:10px;">
      <h1 class="serif" style="font-size:26px; margin:0;">Leads Masuk</h1>
    </div>
    <form method="get" action="/admin/leads" class="panel" style="margin-bottom:18px; display:grid; grid-template-columns:2fr 1fr auto; gap:10px; align-items:end;">
      <div class="field" style="margin:0;"><label>Cari</label><input type="text" name="q" value="${esc(q)}" placeholder="Nama atau no. WA..."></div>
      <div class="field" style="margin:0;"><label>Status</label>
        <select name="filter">
          <option value="">Semua</option>
          <option value="baru" ${filter === "baru" ? "selected" : ""}>Baru</option>
          <option value="ditindaklanjuti" ${filter === "ditindaklanjuti" ? "selected" : ""}>Ditindaklanjuti</option>
        </select>
      </div>
      <button type="submit" class="btn btn-outline" style="height:42px;">Filter</button>
    </form>
    <div class="table-scroll"><table>
      <thead><tr><th>Tanggal</th><th>Nama</th><th>WhatsApp</th><th>Pesan</th><th>Properti</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${
          leads.length
            ? leads
                .map(
                  (l) => `<tr>
              <td>${esc((l.created_at || "").slice(0, 16).replace("T", " "))}</td>
              <td>${esc(l.name)}</td>
              <td><a href="https://wa.me/${esc(String(l.phone || "").replace(/[^0-9]/g, ""))}" target="_blank">${esc(l.phone)}</a></td>
              <td style="white-space:normal; max-width:260px;">${esc(l.message) || "—"}</td>
              <td>${l.property_id ? `<a href="/admin/properti/${l.property_id}/edit">${esc(l.property_title || "Lihat properti")}</a>` : (l.property_title ? esc(l.property_title) : "—")}</td>
              <td>${leadStatusBadge(l.handled)}</td>
              <td class="row-actions">
                <form method="post" action="/admin/leads/${l.id}/toggle" style="display:inline">${hiddenCsrfField(csrf)}<button type="submit" style="background:none;border:none;color:var(--sage);cursor:pointer;padding:0;font-size:12.5px;font-weight:700;">${l.handled ? "Tandai baru" : "Tandai selesai"}</button></form>
                <form method="post" action="/admin/leads/${l.id}/jadikan-pembeli" style="display:inline">${hiddenCsrfField(csrf)}<button type="submit" style="background:none;border:none;color:var(--ink);cursor:pointer;padding:0;font-size:12.5px;font-weight:700;">Jadikan Pembeli</button></form>
                <form method="post" action="/admin/leads/${l.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus lead ini?');">${hiddenCsrfField(csrf)}<button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;font-size:12.5px;font-weight:700;">Hapus</button></form>
              </td>
            </tr>`
                )
                .join("")
            : `<tr><td colspan="7" style="text-align:center; color:var(--stone); padding:30px;">Belum ada lead masuk.</td></tr>`
        }
      </tbody>
    </table></div>`;
  return c.html(adminLayout({ title: "Leads Masuk", siteName, active: "leads", body, theme, role }));
});

adminRoutes.post("/leads/:id/toggle", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  const lead = await getLeadById(DB, id);
  if (lead) await setLeadHandled(DB, id, !lead.handled);
  return c.redirect("/admin/leads");
});

adminRoutes.post("/leads/:id/jadikan-pembeli", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  const lead = await getLeadById(DB, id);
  if (lead) {
    await createBuyer(DB, {
      name: lead.name,
      phone: lead.phone,
      notes: lead.property_title ? `Dari lead website — tertarik: ${lead.property_title}` : "Dari lead website",
    });
    await setLeadHandled(DB, id, true);
  }
  return c.redirect(`/admin/leads?msg=${encodeURIComponent("Lead ditambahkan sebagai pembeli.")}`);
});

adminRoutes.post("/leads/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteLead(DB, c.req.param("id"));
  return c.redirect("/admin/leads");
});

// ================= PROYEK / LOKASI =================

adminRoutes.get("/proyek", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const projects = await listProjects(DB);
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);
  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px;">
      <h1 class="serif" style="font-size:26px; margin:0;">Proyek / Lokasi</h1>
    </div>
    <div class="panel" style="margin-bottom:28px;">
      <form method="post" action="/admin/proyek/baru">
        ${hiddenCsrfField(csrf)}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama Proyek</label><input type="text" name="name" placeholder="Cluster Anggrek" required></div>
          <div class="field"><label>Lokasi</label><input type="text" name="location" placeholder="Bekasi, Jawa Barat" required></div>
        </div>
        <div class="field"><label>Deskripsi</label><textarea name="description" rows="3"></textarea></div>
        <button type="submit" class="btn btn-gold">Tambah Proyek</button>
      </form>
    </div>
    <div class="table-scroll"><table>
      <thead><tr><th>Nama</th><th>Lokasi</th><th>Jumlah Unit</th><th>Aksi</th></tr></thead>
      <tbody>
        ${
          projects.length
            ? (
                await Promise.all(
                  projects.map(async (pr) => {
                    const units = await listProperties(DB, { project_id: pr.id });
                    return `<tr>
                <td>${esc(pr.name)}</td>
                <td>${esc(pr.location)}</td>
                <td>${units.length}</td>
                <td class="row-actions">
                  <a href="/admin/proyek/${pr.id}/edit">Edit</a>
                  <a href="/properti?project=${esc(pr.slug)}" target="_blank">Lihat</a>
                  <form method="post" action="/admin/proyek/${pr.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus proyek ini? Properti di dalamnya tidak ikut terhapus.');">
                    ${hiddenCsrfField(csrf)}
                    <button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;">Hapus</button>
                  </form>
                </td>
              </tr>`;
                  })
                )
              ).join("")
            : `<tr><td colspan="4" style="text-align:center; color:var(--stone); padding:30px;">Belum ada proyek.</td></tr>`
        }
      </tbody>
    </table></div>
  `;
  return c.html(adminLayout({ title: "Proyek", siteName, active: "projects", body, theme, role }));
});

adminRoutes.post("/proyek/baru", async (c) => {
  const { DB } = c.env;
  await createProject(DB, pb(c));
  return c.redirect(`/admin/proyek?msg=${encodeURIComponent("Proyek ditambahkan.")}`);
});

adminRoutes.get("/proyek/:id/edit", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const pr = await getProjectById(DB, c.req.param("id"));
  if (!pr) return c.notFound();
  const body = `
    <h1 class="serif" style="font-size:26px;">Edit Proyek</h1>
    <div class="panel">
      <form method="post" action="/admin/proyek/${pr.id}/edit">
        ${hiddenCsrfField(await csrfToken(c))}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama Proyek</label><input type="text" name="name" value="${esc(pr.name)}" required></div>
          <div class="field"><label>Lokasi</label><input type="text" name="location" value="${esc(pr.location)}" required></div>
        </div>
        <div class="field"><label>Deskripsi</label><textarea name="description" rows="3">${esc(pr.description)}</textarea></div>
        <button type="submit" class="btn btn-gold">Simpan</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Edit Proyek", siteName, body, theme, role }));
});

adminRoutes.post("/proyek/:id/edit", async (c) => {
  const { DB } = c.env;
  await updateProject(DB, c.req.param("id"), pb(c));
  return c.redirect(`/admin/proyek?msg=${encodeURIComponent("Proyek diperbarui.")}`);
});

adminRoutes.post("/proyek/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteProject(DB, c.req.param("id"));
  return c.redirect(`/admin/proyek?msg=${encodeURIComponent("Proyek dihapus.")}`);
});

// ================= PEMBELI =================

adminRoutes.get("/pembeli/export.csv", async (c) => {
  const { DB } = c.env;
  const buyers = await listBuyers(DB, {});
  const csv = toCsv(buyers, [
    { label: "Nama", value: "name" },
    { label: "No. HP", value: "phone" },
    { label: "Email", value: "email" },
    { label: "Alamat", value: "address" },
    { label: "Catatan", value: "notes" },
    { label: "Ditambahkan", value: "created_at" },
  ]);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="pembeli-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(csv);
});

adminRoutes.get("/pembeli", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const buyers = await listBuyers(DB, { q: c.req.query("q") });
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);
  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px; flex-wrap:wrap; gap:10px;">
      <h1 class="serif" style="font-size:26px; margin:0;">Daftar Pembeli</h1>
      <a href="/admin/pembeli/export.csv" class="btn btn-outline">⬇ Export CSV</a>
    </div>
    <div class="panel" style="margin-bottom:28px;">
      <form method="post" action="/admin/pembeli/baru">
        ${hiddenCsrfField(csrf)}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama</label><input type="text" name="name" required></div>
          <div class="field"><label>No. HP / WA</label><input type="text" name="phone"></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Email</label><input type="email" name="email"></div>
          <div class="field"><label>Alamat</label><input type="text" name="address"></div>
        </div>
        <div class="field"><label>Catatan</label><textarea name="notes" rows="2"></textarea></div>
        <button type="submit" class="btn btn-gold">Tambah Pembeli</button>
      </form>
    </div>
    <div class="table-scroll"><table>
      <thead><tr><th>Nama</th><th>No. HP</th><th>Email</th><th>Aksi</th></tr></thead>
      <tbody>
        ${
          buyers.length
            ? buyers
                .map(
                  (b) => `<tr>
            <td>${esc(b.name)}</td><td>${esc(b.phone)}</td><td>${esc(b.email)}</td>
            <td class="row-actions">
              <a href="/admin/pembeli/${b.id}/edit">Edit</a>
              <form method="post" action="/admin/pembeli/${b.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus data pembeli ini?');">
                ${hiddenCsrfField(csrf)}
                <button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;">Hapus</button>
              </form>
            </td>
          </tr>`
                )
                .join("")
            : `<tr><td colspan="4" style="text-align:center; color:var(--stone); padding:30px;">Belum ada data pembeli.</td></tr>`
        }
      </tbody>
    </table></div>
  `;
  return c.html(adminLayout({ title: "Pembeli", siteName, active: "buyers", body, theme, role }));
});

adminRoutes.post("/pembeli/baru", async (c) => {
  const { DB } = c.env;
  await createBuyer(DB, pb(c));
  return c.redirect(`/admin/pembeli?msg=${encodeURIComponent("Pembeli ditambahkan.")}`);
});

adminRoutes.get("/pembeli/:id/edit", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const b = await getBuyerById(DB, c.req.param("id"));
  if (!b) return c.notFound();
  const body = `
    <h1 class="serif" style="font-size:26px;">Edit Pembeli</h1>
    <div class="panel">
      <form method="post" action="/admin/pembeli/${b.id}/edit">
        ${hiddenCsrfField(await csrfToken(c))}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama</label><input type="text" name="name" value="${esc(b.name)}" required></div>
          <div class="field"><label>No. HP / WA</label><input type="text" name="phone" value="${esc(b.phone)}"></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Email</label><input type="email" name="email" value="${esc(b.email)}"></div>
          <div class="field"><label>Alamat</label><input type="text" name="address" value="${esc(b.address)}"></div>
        </div>
        <div class="field"><label>Catatan</label><textarea name="notes" rows="2">${esc(b.notes)}</textarea></div>
        <button type="submit" class="btn btn-gold">Simpan</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Edit Pembeli", siteName, body, theme, role }));
});

adminRoutes.post("/pembeli/:id/edit", async (c) => {
  const { DB } = c.env;
  await updateBuyer(DB, c.req.param("id"), pb(c));
  return c.redirect(`/admin/pembeli?msg=${encodeURIComponent("Data pembeli diperbarui.")}`);
});

adminRoutes.post("/pembeli/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteBuyer(DB, c.req.param("id"));
  return c.redirect(`/admin/pembeli?msg=${encodeURIComponent("Data pembeli dihapus.")}`);
});

// ================= MARKETING =================

adminRoutes.get("/marketing/export.csv", async (c) => {
  const { DB } = c.env;
  const team = await listMarketing(DB, {});
  const csv = toCsv(team, [
    { label: "Nama", value: "name" },
    { label: "No. HP", value: "phone" },
    { label: "Email", value: "email" },
    { label: "Status", value: (m) => (m.active ? "Aktif" : "Nonaktif") },
    { label: "Catatan", value: "notes" },
  ]);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="marketing-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(csv);
});

adminRoutes.get("/marketing", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const team = await listMarketing(DB, {});
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);
  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px; flex-wrap:wrap; gap:10px;">
      <h1 class="serif" style="font-size:26px; margin:0;">Tim Marketing</h1>
      <a href="/admin/marketing/export.csv" class="btn btn-outline">⬇ Export CSV</a>
    </div>
    <div class="panel" style="margin-bottom:28px;">
      <form method="post" action="/admin/marketing/baru">
        ${hiddenCsrfField(csrf)}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama</label><input type="text" name="name" required></div>
          <div class="field"><label>No. HP / WA</label><input type="text" name="phone"></div>
        </div>
        <div class="field"><label>Email</label><input type="email" name="email"></div>
        <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none;"><input type="checkbox" name="active" value="1" checked style="width:auto;"> Aktif</label></div>
        <button type="submit" class="btn btn-gold">Tambah Marketing</button>
      </form>
    </div>
    <div class="table-scroll"><table>
      <thead><tr><th>Nama</th><th>No. HP</th><th>Email</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${
          team.length
            ? team
                .map(
                  (m) => `<tr>
            <td>${esc(m.name)}</td><td>${esc(m.phone)}</td><td>${esc(m.email)}</td>
            <td>${m.active ? '<span class="badge" style="background:#3F6B52;">Aktif</span>' : '<span class="badge" style="background:#8a8578;">Nonaktif</span>'}</td>
            <td class="row-actions">
              <a href="/admin/marketing/${m.id}/edit">Edit</a>
              <form method="post" action="/admin/marketing/${m.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus data marketing ini?');">
                ${hiddenCsrfField(csrf)}
                <button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;">Hapus</button>
              </form>
            </td>
          </tr>`
                )
                .join("")
            : `<tr><td colspan="5" style="text-align:center; color:var(--stone); padding:30px;">Belum ada data marketing.</td></tr>`
        }
      </tbody>
    </table></div>
  `;
  return c.html(adminLayout({ title: "Marketing", siteName, active: "marketing", body, theme, role }));
});

adminRoutes.post("/marketing/baru", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await createMarketing(DB, data);
  return c.redirect(`/admin/marketing?msg=${encodeURIComponent("Marketing ditambahkan.")}`);
});

adminRoutes.get("/marketing/:id/edit", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const m = await getMarketingById(DB, c.req.param("id"));
  if (!m) return c.notFound();
  const body = `
    <h1 class="serif" style="font-size:26px;">Edit Marketing</h1>
    <div class="panel">
      <form method="post" action="/admin/marketing/${m.id}/edit">
        ${hiddenCsrfField(await csrfToken(c))}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama</label><input type="text" name="name" value="${esc(m.name)}" required></div>
          <div class="field"><label>No. HP / WA</label><input type="text" name="phone" value="${esc(m.phone)}"></div>
        </div>
        <div class="field"><label>Email</label><input type="email" name="email" value="${esc(m.email)}"></div>
        <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none;"><input type="checkbox" name="active" value="1" ${m.active ? "checked" : ""} style="width:auto;"> Aktif</label></div>
        <button type="submit" class="btn btn-gold">Simpan</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Edit Marketing", siteName, body, theme, role }));
});

adminRoutes.post("/marketing/:id/edit", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await updateMarketing(DB, c.req.param("id"), data);
  return c.redirect(`/admin/marketing?msg=${encodeURIComponent("Data marketing diperbarui.")}`);
});

adminRoutes.post("/marketing/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteMarketing(DB, c.req.param("id"));
  return c.redirect(`/admin/marketing?msg=${encodeURIComponent("Data marketing dihapus.")}`);
});

// ================= RUMAH TERJUAL =================

adminRoutes.get("/terjual/export.csv", async (c) => {
  const { DB } = c.env;
  const sales = await listSales(DB);
  const csv = toCsv(sales, [
    { label: "Tanggal", value: "sale_date" },
    { label: "Properti", value: "property_title" },
    { label: "Pembeli", value: (s) => s.buyer_name || "" },
    { label: "No. HP Pembeli", value: (s) => s.buyer_phone || "" },
    { label: "Marketing", value: (s) => s.marketing_name || "" },
    { label: "Harga Jual", value: "sale_price" },
    { label: "Catatan", value: "notes" },
  ]);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="rumah-terjual-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(csv);
});

adminRoutes.get("/terjual", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const sales = await listSales(DB);
  const properties = await listProperties(DB, {});
  const buyers = await listBuyers(DB, {});
  const marketing = await listMarketing(DB, { activeOnly: true });
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);

  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px; flex-wrap:wrap; gap:10px;">
      <h1 class="serif" style="font-size:26px; margin:0;">Rumah Terjual</h1>
      <a href="/admin/terjual/export.csv" class="btn btn-outline">⬇ Export CSV</a>
    </div>
    <div class="panel" style="margin-bottom:28px;">
      <form method="post" action="/admin/terjual/baru">
        ${hiddenCsrfField(csrf)}
        <div class="field"><label>Properti</label>
          <select name="property_id" required>
            <option value="">— Pilih properti —</option>
            ${properties.map((p) => `<option value="${p.id}">${esc(p.title)} (${esc(p.status)})</option>`).join("")}
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Pembeli</label>
            <select name="buyer_id">
              <option value="">— Belum ada / tanpa data —</option>
              ${buyers.map((b) => `<option value="${b.id}">${esc(b.name)} (${esc(b.phone)})</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Marketing</label>
            <select name="marketing_id">
              <option value="">— Tanpa marketing —</option>
              ${marketing.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Harga Jual (Rp)</label><input type="number" name="sale_price"></div>
          <div class="field"><label>Tanggal Jual</label><input type="date" name="sale_date" value="${new Date().toISOString().slice(0, 10)}"></div>
        </div>
        <div class="field"><label>Catatan</label><textarea name="notes" rows="2"></textarea></div>
        <button type="submit" class="btn btn-gold">Catat Penjualan</button>
        <p style="font-size:12.5px; color:var(--stone); margin-top:10px;">Menyimpan data ini otomatis mengubah status properti menjadi "Terjual". Belum ada data pembeli/marketing? Tambahkan dulu lewat menu <a href="/admin/pembeli">Pembeli</a> / <a href="/admin/marketing">Marketing</a>.</p>
      </form>
    </div>
    <div class="table-scroll"><table>
      <thead><tr><th>Properti</th><th>Pembeli</th><th>Marketing</th><th>Harga Jual</th><th>Tanggal</th><th>Aksi</th></tr></thead>
      <tbody>
        ${
          sales.length
            ? sales
                .map(
                  (s) => `<tr>
            <td><a href="/properti/${esc(s.property_slug)}" target="_blank">${esc(s.property_title)}</a></td>
            <td>${esc(s.buyer_name || "-")}${s.buyer_phone ? ` (${esc(s.buyer_phone)})` : ""}</td>
            <td>${esc(s.marketing_name || "-")}</td>
            <td>${formatRupiah(s.sale_price)}</td>
            <td>${esc(s.sale_date)}</td>
            <td class="row-actions">
              <form method="post" action="/admin/terjual/${s.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus catatan penjualan ini? Status properti tidak otomatis berubah kembali.');">
                ${hiddenCsrfField(csrf)}
                <button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;">Hapus</button>
              </form>
            </td>
          </tr>`
                )
                .join("")
            : `<tr><td colspan="6" style="text-align:center; color:var(--stone); padding:30px;">Belum ada rumah yang tercatat terjual.</td></tr>`
        }
      </tbody>
    </table></div>
  `;
  return c.html(adminLayout({ title: "Rumah Terjual", siteName, active: "sales", body, theme, role }));
});

adminRoutes.post("/terjual/baru", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  if (!data.property_id) return c.redirect("/admin/terjual");
  await createSale(DB, data);
  // otomatis update status properti jadi terjual
  const p = await getPropertyById(DB, data.property_id);
  if (p) await updateProperty(DB, p.id, { ...p, status: "terjual" });
  return c.redirect(`/admin/terjual?msg=${encodeURIComponent("Penjualan dicatat, status properti diperbarui.")}`);
});

adminRoutes.post("/terjual/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteSale(DB, c.req.param("id"));
  return c.redirect(`/admin/terjual?msg=${encodeURIComponent("Catatan penjualan dihapus.")}`);
});

// ================= VOUCHER =================

adminRoutes.get("/voucher", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const vouchers = await listVouchers(DB, {});
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);
  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <h1 class="serif" style="font-size:26px; margin-bottom:22px;">Voucher & Promo</h1>
    <div class="panel" style="margin-bottom:28px;">
      <form method="post" action="/admin/voucher/baru">
        ${hiddenCsrfField(csrf)}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Kode Voucher</label><input type="text" name="code" placeholder="PROMOAGUSTUS" required style="text-transform:uppercase;"></div>
          <div class="field"><label>Judul</label><input type="text" name="title" placeholder="Promo Kemerdekaan" required></div>
        </div>
        <div class="field"><label>Deskripsi</label><textarea name="description" rows="2"></textarea></div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div class="field"><label>Tipe Diskon</label>
            <select name="discount_type"><option value="fixed">Rupiah (Rp)</option><option value="percent">Persen (%)</option></select>
          </div>
          <div class="field"><label>Nilai Diskon</label><input type="number" name="discount_value" required></div>
          <div class="field"><label>Berlaku Hingga</label><input type="date" name="valid_until"></div>
        </div>
        <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none;"><input type="checkbox" name="active" value="1" checked style="width:auto;"> Aktif / tampil di homepage</label></div>
        <button type="submit" class="btn btn-gold">Tambah Voucher</button>
      </form>
    </div>
    <div class="table-scroll"><table>
      <thead><tr><th>Kode</th><th>Judul</th><th>Diskon</th><th>Berlaku Hingga</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${
          vouchers.length
            ? vouchers
                .map(
                  (v) => `<tr>
            <td class="mono">${esc(v.code)}</td><td>${esc(v.title)}</td>
            <td>${v.discount_type === "percent" ? esc(v.discount_value) + "%" : formatRupiah(v.discount_value)}</td>
            <td>${esc(v.valid_until || "Tanpa batas")}</td>
            <td>${v.active ? '<span class="badge" style="background:#3F6B52;">Aktif</span>' : '<span class="badge" style="background:#8a8578;">Nonaktif</span>'}</td>
            <td class="row-actions">
              <a href="/admin/voucher/${v.id}/edit">Edit</a>
              <form method="post" action="/admin/voucher/${v.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus voucher ini?');">
                ${hiddenCsrfField(csrf)}
                <button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;">Hapus</button>
              </form>
            </td>
          </tr>`
                )
                .join("")
            : `<tr><td colspan="6" style="text-align:center; color:var(--stone); padding:30px;">Belum ada voucher.</td></tr>`
        }
      </tbody>
    </table></div>
  `;
  return c.html(adminLayout({ title: "Voucher", siteName, active: "vouchers", body, theme, role }));
});

adminRoutes.post("/voucher/baru", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await createVoucher(DB, data);
  return c.redirect(`/admin/voucher?msg=${encodeURIComponent("Voucher ditambahkan.")}`);
});

adminRoutes.get("/voucher/:id/edit", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const v = await getVoucherById(DB, c.req.param("id"));
  if (!v) return c.notFound();
  const body = `
    <h1 class="serif" style="font-size:26px;">Edit Voucher</h1>
    <div class="panel">
      <form method="post" action="/admin/voucher/${v.id}/edit">
        ${hiddenCsrfField(await csrfToken(c))}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Kode Voucher</label><input type="text" name="code" value="${esc(v.code)}" required style="text-transform:uppercase;"></div>
          <div class="field"><label>Judul</label><input type="text" name="title" value="${esc(v.title)}" required></div>
        </div>
        <div class="field"><label>Deskripsi</label><textarea name="description" rows="2">${esc(v.description)}</textarea></div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div class="field"><label>Tipe Diskon</label>
            <select name="discount_type">
              <option value="fixed" ${v.discount_type === "fixed" ? "selected" : ""}>Rupiah (Rp)</option>
              <option value="percent" ${v.discount_type === "percent" ? "selected" : ""}>Persen (%)</option>
            </select>
          </div>
          <div class="field"><label>Nilai Diskon</label><input type="number" name="discount_value" value="${esc(v.discount_value)}" required></div>
          <div class="field"><label>Berlaku Hingga</label><input type="date" name="valid_until" value="${esc(v.valid_until)}"></div>
        </div>
        <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none;"><input type="checkbox" name="active" value="1" ${v.active ? "checked" : ""} style="width:auto;"> Aktif / tampil di homepage</label></div>
        <button type="submit" class="btn btn-gold">Simpan</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Edit Voucher", siteName, body, theme, role }));
});

adminRoutes.post("/voucher/:id/edit", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await updateVoucher(DB, c.req.param("id"), data);
  return c.redirect(`/admin/voucher?msg=${encodeURIComponent("Voucher diperbarui.")}`);
});

adminRoutes.post("/voucher/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteVoucher(DB, c.req.param("id"));
  return c.redirect(`/admin/voucher?msg=${encodeURIComponent("Voucher dihapus.")}`);
});

// ================= BANNER PROMOSI =================

adminRoutes.get("/banner", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const banners = await listBanners(DB, {});
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);
  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <h1 class="serif" style="font-size:26px; margin-bottom:8px;">Banner Promosi (Hero Homepage)</h1>
    <p style="color:var(--stone); font-size:13.5px; margin-bottom:22px;">Banner pertama yang aktif akan tampil sebagai hero di homepage.</p>
    <div class="panel" style="margin-bottom:28px;">
      <form method="post" action="/admin/banner/baru">
        ${hiddenCsrfField(csrf)}
        <div class="field"><label>Judul</label><input type="text" name="title" required></div>
        <div class="field"><label>Subjudul</label><input type="text" name="subtitle"></div>
        <div class="field"><label>Link tujuan (opsional)</label><input type="text" name="link_url" placeholder="/properti"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Urutan tampil</label><input type="number" name="sort_order" value="0"></div>
          <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none; margin-top:30px;"><input type="checkbox" name="active" value="1" checked style="width:auto;"> Aktif</label></div>
        </div>
        <button type="submit" class="btn btn-gold">Tambah Banner</button>
      </form>
    </div>
    <div class="grid grid-3">
      ${
        banners.length
          ? banners
              .map(
                (b) => `
        <div style="border:1px solid var(--line); background:#fff;">
          ${b.image_key ? `<img src="/media/${esc(b.image_key)}" style="width:100%; aspect-ratio:16/9; object-fit:cover; display:block;">` : `<div style="width:100%; aspect-ratio:16/9; background:#eee; display:flex; align-items:center; justify-content:center; color:var(--stone); font-size:12px;">Belum ada gambar</div>`}
          <div style="padding:14px;">
            <div style="font-weight:600;">${esc(b.title)}</div>
            <div style="font-size:12.5px; color:var(--stone); margin-bottom:10px;">${esc(b.subtitle)}</div>
            ${b.active ? '<span class="badge" style="background:#3F6B52;">Aktif</span>' : '<span class="badge" style="background:#8a8578;">Nonaktif</span>'}
            <form method="post" action="/admin/banner/${b.id}/gambar" enctype="multipart/form-data" class="compress-upload" data-file-field="image" style="margin-top:10px;">
              ${hiddenCsrfField(csrf)}
              <input type="file" name="image" accept="image/*" required style="margin-bottom:8px;">
              <button type="submit" class="btn btn-outline" style="width:100%; justify-content:center; padding:8px;">Upload Gambar</button>
            </form>
            <div class="row-actions" style="margin-top:10px;">
              <a href="/admin/banner/${b.id}/edit">Edit</a>
              <form method="post" action="/admin/banner/${b.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus banner ini?');">
                ${hiddenCsrfField(csrf)}
                <button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;">Hapus</button>
              </form>
            </div>
          </div>
        </div>`
              )
              .join("")
          : `<p style="color:var(--stone);">Belum ada banner.</p>`
      }
    </div>
  `;
  return c.html(adminLayout({ title: "Banner", siteName, active: "banners", body, theme, role }));
});

adminRoutes.post("/banner/baru", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await createBanner(DB, data);
  return c.redirect(`/admin/banner?msg=${encodeURIComponent("Banner ditambahkan. Jangan lupa upload gambarnya.")}`);
});

adminRoutes.get("/banner/:id/edit", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const b = await getBannerById(DB, c.req.param("id"));
  if (!b) return c.notFound();
  const body = `
    <h1 class="serif" style="font-size:26px;">Edit Banner</h1>
    <div class="panel">
      <form method="post" action="/admin/banner/${b.id}/edit">
        ${hiddenCsrfField(await csrfToken(c))}
        <div class="field"><label>Judul</label><input type="text" name="title" value="${esc(b.title)}" required></div>
        <div class="field"><label>Subjudul</label><input type="text" name="subtitle" value="${esc(b.subtitle)}"></div>
        <div class="field"><label>Link tujuan</label><input type="text" name="link_url" value="${esc(b.link_url)}"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Urutan tampil</label><input type="number" name="sort_order" value="${esc(b.sort_order)}"></div>
          <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none; margin-top:30px;"><input type="checkbox" name="active" value="1" ${b.active ? "checked" : ""} style="width:auto;"> Aktif</label></div>
        </div>
        <button type="submit" class="btn btn-gold">Simpan</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Edit Banner", siteName, body, theme, role }));
});

adminRoutes.post("/banner/:id/edit", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await updateBanner(DB, c.req.param("id"), data);
  return c.redirect(`/admin/banner?msg=${encodeURIComponent("Banner diperbarui.")}`);
});

adminRoutes.post("/banner/:id/gambar", async (c) => {
  const { DB, MEDIA } = c.env;
  const id = c.req.param("id");
  const data = pb(c);
  const file = data["image"];
  if (file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD_BYTES && (!file.type || ALLOWED_IMAGE_TYPES.includes(file.type))) {
    const ext = safeExt(file.name || "banner.jpg");
    const key = `banners/${id}/${crypto.randomUUID()}.${ext}`;
    await MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "image/jpeg" } });
    await setBannerImage(DB, id, key);
  }
  return c.redirect(`/admin/banner?msg=${encodeURIComponent("Gambar banner diperbarui.")}`);
});

adminRoutes.post("/banner/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteBanner(DB, c.req.param("id"));
  return c.redirect(`/admin/banner?msg=${encodeURIComponent("Banner dihapus.")}`);
});

// ================= TESTIMONI =================

adminRoutes.get("/testimoni", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const testimonials = await listTestimonials(DB, {});
  const msg = c.req.query("msg");
  const csrf = await csrfToken(c);
  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <h1 class="serif" style="font-size:26px; margin-bottom:22px;">Testimoni Pembeli</h1>
    <div class="panel" style="margin-bottom:28px;">
      <form method="post" action="/admin/testimoni/baru">
        ${hiddenCsrfField(csrf)}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama</label><input type="text" name="name" required></div>
          <div class="field"><label>Peran / Keterangan</label><input type="text" name="role" placeholder="Pembeli Cluster Anggrek, 2025"></div>
        </div>
        <div class="field"><label>Rating</label><select name="rating">${starRatingInputOptions(5)}</select></div>
        <div class="field"><label>Kutipan Testimoni</label><textarea name="quote" rows="3" required></textarea></div>
        <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none;"><input type="checkbox" name="active" value="1" checked style="width:auto;"> Aktif / tampil di homepage</label></div>
        <button type="submit" class="btn btn-gold">Tambah Testimoni</button>
      </form>
    </div>
    <div class="grid grid-3">
      ${
        testimonials.length
          ? testimonials
              .map(
                (t) => `
        <div style="border:1px solid var(--line); background:#fff; padding:18px;">
          ${starRating(t.rating)}
          <p style="font-style:italic; font-size:13.5px; margin:8px 0;">&ldquo;${esc(t.quote)}&rdquo;</p>
          <div style="font-weight:600; font-size:13.5px;">${esc(t.name)}</div>
          <div style="font-size:12px; color:var(--stone); margin-bottom:10px;">${esc(t.role)}</div>
          ${t.active ? '<span class="badge" style="background:#3F6B52;">Aktif</span>' : '<span class="badge" style="background:#8a8578;">Nonaktif</span>'}
          <form method="post" action="/admin/testimoni/${t.id}/foto" enctype="multipart/form-data" class="compress-upload" data-file-field="photo" style="margin-top:10px;">
            ${hiddenCsrfField(csrf)}
            <input type="file" name="photo" accept="image/*" style="margin-bottom:8px;">
            <button type="submit" class="btn btn-outline" style="width:100%; justify-content:center; padding:8px;">Upload Foto</button>
          </form>
          <div class="row-actions" style="margin-top:10px;">
            <a href="/admin/testimoni/${t.id}/edit">Edit</a>
            <form method="post" action="/admin/testimoni/${t.id}/hapus" style="display:inline" onsubmit="return confirm('Hapus testimoni ini?');">
              ${hiddenCsrfField(csrf)}
              <button type="submit" style="background:none;border:none;color:var(--clay);cursor:pointer;padding:0;">Hapus</button>
            </form>
          </div>
        </div>`
              )
              .join("")
          : `<p style="color:var(--stone);">Belum ada testimoni.</p>`
      }
    </div>
  `;
  return c.html(adminLayout({ title: "Testimoni", siteName, active: "testimonials", body, theme, role }));
});

adminRoutes.post("/testimoni/baru", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await createTestimonial(DB, data);
  return c.redirect(`/admin/testimoni?msg=${encodeURIComponent("Testimoni ditambahkan.")}`);
});

adminRoutes.get("/testimoni/:id/edit", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const t = await getTestimonialById(DB, c.req.param("id"));
  if (!t) return c.notFound();
  const body = `
    <h1 class="serif" style="font-size:26px;">Edit Testimoni</h1>
    <div class="panel">
      <form method="post" action="/admin/testimoni/${t.id}/edit">
        ${hiddenCsrfField(await csrfToken(c))}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama</label><input type="text" name="name" value="${esc(t.name)}" required></div>
          <div class="field"><label>Peran / Keterangan</label><input type="text" name="role" value="${esc(t.role)}"></div>
        </div>
        <div class="field"><label>Rating</label><select name="rating">${starRatingInputOptions(t.rating)}</select></div>
        <div class="field"><label>Kutipan Testimoni</label><textarea name="quote" rows="3" required>${esc(t.quote)}</textarea></div>
        <div class="field"><label style="display:inline-flex; align-items:center; gap:8px; text-transform:none;"><input type="checkbox" name="active" value="1" ${t.active ? "checked" : ""} style="width:auto;"> Aktif / tampil di homepage</label></div>
        <button type="submit" class="btn btn-gold">Simpan</button>
      </form>
    </div>`;
  return c.html(adminLayout({ title: "Edit Testimoni", siteName, body, theme, role }));
});

adminRoutes.post("/testimoni/:id/edit", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  data.active = data.active === "1";
  await updateTestimonial(DB, c.req.param("id"), data);
  return c.redirect(`/admin/testimoni?msg=${encodeURIComponent("Testimoni diperbarui.")}`);
});

adminRoutes.post("/testimoni/:id/foto", async (c) => {
  const { DB, MEDIA } = c.env;
  const id = c.req.param("id");
  const data = pb(c);
  const file = data["photo"];
  if (file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD_BYTES && (!file.type || ALLOWED_IMAGE_TYPES.includes(file.type))) {
    const ext = safeExt(file.name || "photo.jpg");
    const key = `testimoni/${id}/${crypto.randomUUID()}.${ext}`;
    await MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "image/jpeg" } });
    await setTestimonialPhoto(DB, id, key);
  }
  return c.redirect(`/admin/testimoni?msg=${encodeURIComponent("Foto testimoni diperbarui.")}`);
});

adminRoutes.post("/testimoni/:id/hapus", async (c) => {
  const { DB } = c.env;
  await deleteTestimonial(DB, c.req.param("id"));
  return c.redirect(`/admin/testimoni?msg=${encodeURIComponent("Testimoni dihapus.")}`);
});

// ================= TIM & PENGGUNA (akun admin/marketing tambahan) =================
// Hanya role "admin" yang bisa sampai ke sini — sudah ditolak duluan lewat
// middleware ADMIN_ONLY_PREFIXES di atas kalau role-nya "marketing".

adminRoutes.get("/pengguna", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const msg = c.req.query("msg");
  const err = c.req.query("error");
  const users = await listAdminUsers(DB);
  const csrf = await csrfToken(c);

  const roleLabel = { admin: "Admin (akses penuh)", marketing: "Marketing (operasional)" };

  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    ${err ? `<div class="flash flash-err">${esc(err)}</div>` : ""}
    <h1 class="serif" style="font-size:26px;">Tim & Pengguna</h1>
    <p style="color:var(--stone); font-size:13.5px; margin:-8px 0 24px; max-width:640px;">
      Akun login terpisah untuk tim, jadi tidak perlu share satu username/password. Role
      <b>Admin</b> punya akses penuh (termasuk halaman ini & Pengaturan Situs). Role
      <b>Marketing</b> bisa kelola properti, leads, rumah terjual, pembeli, voucher, banner,
      dan testimoni — tapi tidak bisa buka Pengaturan Situs atau halaman Tim & Pengguna ini.
    </p>

    <div class="panel" style="margin-bottom:28px; max-width:520px;">
      <div class="eyebrow" style="margin-bottom:14px;">+ Tambah Akun</div>
      <form method="post" action="/admin/pengguna">
        ${hiddenCsrfField(csrf)}
        <div class="field"><label>Username</label><input type="text" name="username" required minlength="3" maxlength="40" autocomplete="off"></div>
        <div class="field"><label>Password</label><input type="password" name="password" required minlength="8" autocomplete="new-password"></div>
        <div class="field">
          <label>Role</label>
          <select name="role">
            <option value="marketing">Marketing (operasional)</option>
            <option value="admin">Admin (akses penuh)</option>
          </select>
        </div>
        <button type="submit" class="btn btn-gold">Tambah Akun</button>
      </form>
    </div>

    <div class="table-scroll">
      <table>
        <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
        <tbody>
          ${
            users.length
              ? users
                  .map(
                    (u) => `
            <tr>
              <td>${esc(u.username)}</td>
              <td>${esc(roleLabel[u.role] || u.role)}</td>
              <td>${u.active ? `<span class="badge" style="background:#3F6B52;">Aktif</span>` : `<span class="badge" style="background:#A3402E;">Nonaktif</span>`}</td>
              <td>${esc((u.created_at || "").slice(0, 10))}</td>
              <td class="row-actions">
                <form method="post" action="/admin/pengguna/${u.id}/toggle" style="display:inline;">
                  ${hiddenCsrfField(csrf)}
                  <button type="submit" class="btn btn-outline" style="padding:5px 10px;">${u.active ? "Nonaktifkan" : "Aktifkan"}</button>
                </form>
                <a href="/admin/pengguna/${u.id}/password">Reset Password</a>
                <form method="post" action="/admin/pengguna/${u.id}/hapus" style="display:inline;" onsubmit="return confirm('Hapus akun ${esc(u.username)}? Tidak bisa dibatalkan.');">
                  ${hiddenCsrfField(csrf)}
                  <button type="submit" class="btn btn-outline" style="padding:5px 10px; color:var(--clay); border-color:var(--clay);">Hapus</button>
                </form>
              </td>
            </tr>`
                  )
                  .join("")
              : `<tr><td colspan="5" style="color:var(--stone);">Belum ada akun tim tambahan. Semua login masih pakai kredensial pemilik (ADMIN_USER).</td></tr>`
          }
        </tbody>
      </table>
    </div>`;
  return c.html(adminLayout({ title: "Tim & Pengguna", siteName, active: "users", body, theme, role }));
});

adminRoutes.post("/pengguna", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  const username = String(data.username || "").trim();
  const password = String(data.password || "");
  const role = ADMIN_ROLES.includes(data.role) ? data.role : "marketing";

  if (username.length < 3 || password.length < 8) {
    return c.redirect(`/admin/pengguna?error=${encodeURIComponent("Username minimal 3 karakter & password minimal 8 karakter.")}`);
  }
  // Username TIDAK BOLEH mengandung titik (atau karakter lain di luar whitelist ini) —
  // titik dipakai sebagai pemisah field di dalam signed session cookie (auth.js), jadi
  // username ber-titik bikin parsing cookie ambigu dan sesi gagal diverifikasi.
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return c.redirect(`/admin/pengguna?error=${encodeURIComponent("Username hanya boleh huruf, angka, underscore (_), dan strip (-) — tanpa spasi atau titik.")}`);
  }
  if (c.env.ADMIN_USER && username === c.env.ADMIN_USER) {
    return c.redirect(`/admin/pengguna?error=${encodeURIComponent("Username itu sudah dipakai akun pemilik.")}`);
  }
  const existing = await getAdminUserByUsername(DB, username);
  if (existing) {
    return c.redirect(`/admin/pengguna?error=${encodeURIComponent("Username sudah dipakai.")}`);
  }

  const passwordHash = await hashPassword(password);
  await createAdminUser(DB, { username, passwordHash, role });
  return c.redirect(`/admin/pengguna?msg=${encodeURIComponent("Akun " + username + " berhasil dibuat.")}`);
});

adminRoutes.post("/pengguna/:id/toggle", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  const user = await getAdminUserById(DB, id);
  if (!user) return c.redirect("/admin/pengguna");
  await setAdminUserActive(DB, id, !user.active);
  return c.redirect(`/admin/pengguna?msg=${encodeURIComponent(`Akun ${user.username} ${user.active ? "dinonaktifkan" : "diaktifkan"}.`)}`);
});

adminRoutes.get("/pengguna/:id/password", async (c) => {
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const user = await getAdminUserById(c.env.DB, c.req.param("id"));
  if (!user) return c.redirect("/admin/pengguna");

  const body = `
    <h1 class="serif" style="font-size:24px;">Reset Password — ${esc(user.username)}</h1>
    <div class="panel" style="max-width:420px; margin-top:16px;">
      <form method="post" action="/admin/pengguna/${user.id}/password">
        ${hiddenCsrfField(await csrfToken(c))}
        <div class="field"><label>Password Baru</label><input type="password" name="password" required minlength="8" autocomplete="new-password"></div>
        <button type="submit" class="btn btn-gold">Simpan Password Baru</button>
      </form>
      <p style="margin-top:16px;"><a href="/admin/pengguna">← Kembali</a></p>
    </div>`;
  return c.html(adminLayout({ title: "Reset Password", siteName, body, theme, role }));
});

adminRoutes.post("/pengguna/:id/password", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  const data = pb(c);
  const password = String(data.password || "");
  const user = await getAdminUserById(DB, id);
  if (!user) return c.redirect("/admin/pengguna");
  if (password.length < 8) {
    return c.redirect(`/admin/pengguna/${id}/password?error=${encodeURIComponent("Password minimal 8 karakter.")}`);
  }
  const passwordHash = await hashPassword(password);
  await setAdminUserPassword(DB, id, passwordHash);
  return c.redirect(`/admin/pengguna?msg=${encodeURIComponent(`Password akun ${user.username} berhasil diubah.`)}`);
});

adminRoutes.post("/pengguna/:id/hapus", async (c) => {
  const { DB } = c.env;
  const id = c.req.param("id");
  const admin = c.get("admin");
  const user = await getAdminUserById(DB, id);
  if (user && user.username === admin.username) {
    return c.redirect(`/admin/pengguna?error=${encodeURIComponent("Tidak bisa menghapus akun yang sedang Anda pakai login.")}`);
  }
  await deleteAdminUser(DB, id);
  return c.redirect(`/admin/pengguna?msg=${encodeURIComponent("Akun dihapus.")}`);
});

// ================= PENGATURAN SITUS =================

adminRoutes.get("/settings", async (c) => {
  const { DB } = c.env;
  const siteName = c.get("siteName"); const theme = c.get("theme"); const role = c.get("role") || "admin";
  const settings = await getAllSettings(DB);
  const msg = c.req.query("msg");

  const fields = [
    ["site_tagline", "Tagline Hero (judul besar homepage)"],
    ["hero_subtitle", "Subjudul Hero (dipakai jika belum ada banner aktif)"],
    ["about_text", "Teks Tentang Kami"],
    ["address", "Alamat"],
    ["email", "Email"],
    ["instagram", "Instagram (username)"],
    ["whatsapp_greeting", "Pesan pembuka WhatsApp (widget live chat)"],
  ];

  const body = `
    ${msg ? `<div class="flash flash-ok">${esc(msg)}</div>` : ""}
    <h1 class="serif" style="font-size:26px;">Pengaturan Situs</h1>

    <div class="panel" style="margin-bottom:24px;">
      <div class="eyebrow" style="margin-bottom:14px;">Identitas Situs</div>
      <form method="post" action="/admin/settings">
        ${hiddenCsrfField(await csrfToken(c))}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Nama Website (brand/marketing)</label><input type="text" name="site_name" value="${esc(settings.site_name)}" required></div>
          <div class="field"><label>Nomor WhatsApp (format 62xxxx, tanpa +)</label><input type="text" name="whatsapp_number" value="${esc(settings.whatsapp_number)}" placeholder="6281234567890"></div>
        </div>
        <div class="field"><label>Nama Badan Hukum Resmi (tampil di footer & copyright)</label><input type="text" name="legal_name" value="${esc(settings.legal_name)}" placeholder="PT Nama Perusahaan Anda"></div>
        <div class="eyebrow" style="margin:20px 0 14px;">Warna Tema</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field">
            <label>Warna Aksen (harga, tombol, highlight)</label>
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="color" name="theme_accent" value="${esc(settings.theme_accent || "#2EB872")}" style="width:56px; height:42px; padding:2px; cursor:pointer;">
              <input type="text" value="${esc(settings.theme_accent || "#2EB872")}" readonly style="background:#f7f6f1; color:var(--stone);" id="accentHex">
            </div>
          </div>
          <div class="field">
            <label>Warna Gelap (nav, hero, sidebar admin)</label>
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="color" name="theme_dark" value="${esc(settings.theme_dark || "#26332D")}" style="width:56px; height:42px; padding:2px; cursor:pointer;">
              <input type="text" value="${esc(settings.theme_dark || "#26332D")}" readonly style="background:#f7f6f1; color:var(--stone);" id="darkHex">
            </div>
          </div>
        </div>
        <p style="font-size:12px; color:var(--stone); margin:-6px 0 16px;">Perubahan warna langsung berlaku di seluruh situs (publik & admin) setelah disimpan.</p>
        <button type="submit" class="btn btn-gold">Simpan Semua Pengaturan</button>
      </form>
    </div>

    <div class="panel" style="margin-bottom:24px;">
      <div class="eyebrow" style="margin-bottom:14px;">🏠 Pengaturan KPR Subsidi (FLPP)</div>
      <p style="font-size:12.5px; color:var(--stone); margin-top:-8px; margin-bottom:16px;">Dipakai otomatis di kalkulator KPR untuk properti yang ditandai "Program KPR Subsidi Pemerintah". Update di sini kalau ada perubahan kebijakan pemerintah.</p>
      <form method="post" action="/admin/settings">
        ${hiddenCsrfField(await csrfToken(c))}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field"><label>Default Uang Muka Subsidi (%)</label><input type="number" name="kpr_subsidi_dp_default" value="${esc(settings.kpr_subsidi_dp_default || "1")}" step="0.5" min="0" max="30"></div>
          <div class="field"><label>Default Bunga Subsidi (% per tahun, flat)</label><input type="number" name="kpr_subsidi_bunga_default" value="${esc(settings.kpr_subsidi_bunga_default || "5")}" step="0.1"></div>
        </div>
        <div class="field"><label>Syarat KPR Subsidi (tampil di homepage & halaman detail properti subsidi)</label><textarea name="kpr_subsidi_syarat" rows="8">${esc(settings.kpr_subsidi_syarat)}</textarea></div>
        <button type="submit" class="btn btn-gold">Simpan Pengaturan Subsidi</button>
      </form>
    </div>

    <div class="panel">
      <div class="eyebrow" style="margin-bottom:14px;">Konten Homepage</div>
      <form method="post" action="/admin/settings">
        ${hiddenCsrfField(await csrfToken(c))}
        <input type="hidden" name="site_name" value="${esc(settings.site_name)}">
        <input type="hidden" name="whatsapp_number" value="${esc(settings.whatsapp_number)}">
        <input type="hidden" name="theme_accent" value="${esc(settings.theme_accent || "#2EB872")}">
        <input type="hidden" name="theme_dark" value="${esc(settings.theme_dark || "#26332D")}">
        ${fields
          .map(
            ([key, label]) => `
          <div class="field">
            <label>${label}</label>
            ${["about_text", "hero_subtitle"].includes(key) ? `<textarea name="${key}" rows="3">${esc(settings[key])}</textarea>` : `<input type="text" name="${key}" value="${esc(settings[key])}">`}
          </div>`
          )
          .join("")}
        <button type="submit" class="btn btn-gold">Simpan Pengaturan</button>
      </form>
    </div>
    <script>
      document.querySelectorAll('input[type="color"]').forEach(function(el){
        var out = document.getElementById(el.name === 'theme_accent' ? 'accentHex' : 'darkHex');
        el.addEventListener('input', function(){ out.value = el.value; });
      });
    </script>`;
  return c.html(adminLayout({ title: "Pengaturan", siteName, active: "settings", body, theme, role }));
});

adminRoutes.post("/settings", async (c) => {
  const { DB } = c.env;
  const data = pb(c);
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  for (const [key, value] of Object.entries(data)) {
    if (key === "_csrf") continue;
    if ((key === "theme_accent" || key === "theme_dark") && !hexRe.test(value)) continue; // tolak warna tidak valid, biarkan nilai lama
    await setSetting(DB, key, value);
  }
  return c.redirect(`/admin/settings?msg=${encodeURIComponent("Pengaturan disimpan.")}`);
});
