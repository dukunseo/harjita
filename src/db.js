// Kumpulan helper query ke D1. Semua fungsi menerima `DB` (env.DB) sebagai argumen pertama.
// Semua query pakai parameterized binding (.bind) — jangan pernah concat string user ke SQL.

export function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function uniqueSlug(DB, table, baseText) {
  const baseSlug = slugify(baseText) || "item";
  let slug = baseSlug;
  let i = 1;
  while (await DB.prepare(`SELECT id FROM ${table} WHERE slug = ?`).bind(slug).first()) {
    slug = `${baseSlug}-${i++}`;
  }
  return slug;
}

// ================= PROPERTIES =================

// Whitelist tipe & status — dicek server-side biar POST langsung (di luar <select> form)
// gak bisa nyelundupin value sembarangan ke DB.
export const PROPERTY_TYPES = ["Rumah", "Ruko", "Apartemen", "Tanah", "Kavling"];
export const PROPERTY_STATUSES = ["tersedia", "proses", "terjual"];

function sanitizePropertyData(data) {
  return {
    ...data,
    type: PROPERTY_TYPES.includes(data.type) ? data.type : PROPERTY_TYPES[0],
    status: PROPERTY_STATUSES.includes(data.status) ? data.status : PROPERTY_STATUSES[0],
    price: Math.max(0, Number(data.price) || 0),
    land_area: Math.max(0, Number(data.land_area) || 0),
    building_area: Math.max(0, Number(data.building_area) || 0),
    bedrooms: Math.max(0, Number(data.bedrooms) || 0),
    bathrooms: Math.max(0, Number(data.bathrooms) || 0),
    carports: Math.max(0, Number(data.carports) || 0),
  };
}

// Bangun klausa WHERE + params yang dipakai bersama oleh listProperties & countProperties,
// supaya filter untuk paginasi dan total count selalu konsisten.
function propertyWhereClause({ status, type, featured, q, project_id, price_min, price_max, publishedOnly, subsidized } = {}) {
  let where = " WHERE 1=1";
  const params = [];
  if (status) { where += " AND status = ?"; params.push(status); }
  if (type) { where += " AND type = ?"; params.push(type); }
  if (featured) { where += " AND featured = 1"; }
  if (project_id) { where += " AND project_id = ?"; params.push(project_id); }
  if (q) { where += " AND (title LIKE ? OR location LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }
  if (price_min) { where += " AND price >= ?"; params.push(Number(price_min)); }
  if (price_max) { where += " AND price <= ?"; params.push(Number(price_max)); }
  if (publishedOnly) { where += " AND published = 1"; }
  if (subsidized) { where += " AND subsidized = 1"; }
  return { where, params };
}

// Whitelist kolom sorting — JANGAN pernah concat nilai `sort` dari query string
// langsung ke ORDER BY, walau sudah "cuma" dari <select>, karena bisa juga
// dikirim manual lewat request mentah (bypass form). Whitelist adalah satu-satunya
// pertahanan yang aman untuk ORDER BY (tidak bisa diparameterized pakai .bind).
const PROPERTY_SORTS = {
  terbaru: "created_at DESC",
  harga_asc: "price ASC",
  harga_desc: "price DESC",
};

export async function listProperties(DB, filters = {}) {
  const { where, params } = propertyWhereClause(filters);
  const orderBy = PROPERTY_SORTS[filters.sort] || PROPERTY_SORTS.terbaru;
  let query = "SELECT * FROM properties" + where + " ORDER BY " + orderBy;
  const { limit, offset } = filters;
  if (limit) {
    query += " LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset) || 0);
  }
  const { results } = await DB.prepare(query).bind(...params).all();
  return results;
}

export async function countProperties(DB, filters = {}) {
  const { where, params } = propertyWhereClause(filters);
  const row = await DB.prepare("SELECT COUNT(*) as n FROM properties" + where).bind(...params).first();
  return row?.n || 0;
}

export async function bulkSetPublished(DB, ids, published) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await DB.prepare(`UPDATE properties SET published = ? WHERE id IN (${placeholders})`)
    .bind(published ? 1 : 0, ...ids).run();
}

export async function bulkDeleteProperties(DB, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await DB.prepare(`DELETE FROM properties WHERE id IN (${placeholders})`).bind(...ids).run();
}

export async function getPropertyBySlug(DB, slug, { publishedOnly } = {}) {
  if (publishedOnly) {
    return await DB.prepare("SELECT * FROM properties WHERE slug = ? AND published = 1").bind(slug).first();
  }
  return await DB.prepare("SELECT * FROM properties WHERE slug = ?").bind(slug).first();
}

export async function getPropertyById(DB, id) {
  return await DB.prepare("SELECT * FROM properties WHERE id = ?").bind(id).first();
}

export async function getImages(DB, propertyId) {
  const { results } = await DB.prepare(
    "SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order ASC, id ASC"
  ).bind(propertyId).all();
  return results;
}

export async function createProperty(DB, rawData) {
  const data = sanitizePropertyData(rawData);
  const slug = await uniqueSlug(DB, "properties", data.title);
  const result = await DB.prepare(
    `INSERT INTO properties
      (slug, title, description, type, status, price, price_label, location,
       land_area, building_area, bedrooms, bathrooms, carports, featured, cover_image, project_id, published, subsidized)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    slug, data.title, data.description || "", data.type, data.status,
    data.price, data.price_label || "", data.location || "",
    data.land_area, data.building_area, data.bedrooms,
    data.bathrooms, data.carports, data.featured ? 1 : 0,
    data.cover_image || "", data.project_id || null, data.published ? 1 : 0, data.subsidized ? 1 : 0
  ).run();
  return { id: result.meta.last_row_id, slug };
}

export async function updateProperty(DB, id, rawData) {
  const data = sanitizePropertyData(rawData);
  await DB.prepare(
    `UPDATE properties SET
      title=?, description=?, type=?, status=?, price=?, price_label=?, location=?,
      land_area=?, building_area=?, bedrooms=?, bathrooms=?, carports=?, featured=?, project_id=?, published=?, subsidized=?,
      updated_at=datetime('now')
     WHERE id=?`
  ).bind(
    data.title, data.description || "", data.type, data.status,
    data.price, data.price_label || "", data.location || "",
    data.land_area, data.building_area, data.bedrooms,
    data.bathrooms, data.carports, data.featured ? 1 : 0,
    data.project_id || null, data.published ? 1 : 0, data.subsidized ? 1 : 0, id
  ).run();
}

export async function setCoverImage(DB, id, imageKey) {
  await DB.prepare("UPDATE properties SET cover_image = ? WHERE id = ?").bind(imageKey, id).run();
}

export async function setBrochure(DB, id, key) {
  await DB.prepare("UPDATE properties SET brochure_key = ? WHERE id = ?").bind(key, id).run();
}

export async function removeBrochure(DB, id) {
  await DB.prepare("UPDATE properties SET brochure_key = '' WHERE id = ?").bind(id).run();
}

export async function deleteProperty(DB, id) {
  await DB.prepare("DELETE FROM properties WHERE id = ?").bind(id).run();
}

export async function addImage(DB, propertyId, imageKey, sortOrder = 0) {
  const result = await DB.prepare(
    "INSERT INTO property_images (property_id, image_key, sort_order) VALUES (?,?,?)"
  ).bind(propertyId, imageKey, sortOrder).run();
  return result.meta.last_row_id;
}

export async function getImageById(DB, id) {
  return await DB.prepare("SELECT * FROM property_images WHERE id = ?").bind(id).first();
}

export async function deleteImage(DB, id) {
  await DB.prepare("DELETE FROM property_images WHERE id = ?").bind(id).run();
}

// ================= PROJECTS (proyek / lokasi) =================

export async function listProjects(DB) {
  const { results } = await DB.prepare("SELECT * FROM projects ORDER BY sort_order ASC, id ASC").all();
  return results;
}

export async function getProjectBySlug(DB, slug) {
  return await DB.prepare("SELECT * FROM projects WHERE slug = ?").bind(slug).first();
}

export async function getProjectById(DB, id) {
  return await DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
}

export async function createProject(DB, data) {
  const slug = await uniqueSlug(DB, "projects", data.name);
  const result = await DB.prepare(
    "INSERT INTO projects (slug, name, location, description, sort_order) VALUES (?,?,?,?,?)"
  ).bind(slug, data.name, data.location || "", data.description || "", data.sort_order || 0).run();
  return { id: result.meta.last_row_id, slug };
}

export async function updateProject(DB, id, data) {
  await DB.prepare(
    "UPDATE projects SET name=?, location=?, description=?, sort_order=? WHERE id=?"
  ).bind(data.name, data.location || "", data.description || "", data.sort_order || 0, id).run();
}

export async function setProjectCover(DB, id, imageKey) {
  await DB.prepare("UPDATE projects SET cover_image=? WHERE id=?").bind(imageKey, id).run();
}

export async function deleteProject(DB, id) {
  await DB.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
}

export async function countProjects(DB) {
  const row = await DB.prepare("SELECT COUNT(*) as n FROM projects").first();
  return row?.n || 0;
}

// ================= BUYERS (pembeli) =================

export async function listBuyers(DB, { q } = {}) {
  let query = "SELECT * FROM buyers WHERE 1=1";
  const params = [];
  if (q) { query += " AND (name LIKE ? OR phone LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }
  query += " ORDER BY created_at DESC";
  const { results } = await DB.prepare(query).bind(...params).all();
  return results;
}

export async function getBuyerById(DB, id) {
  return await DB.prepare("SELECT * FROM buyers WHERE id = ?").bind(id).first();
}

export async function createBuyer(DB, data) {
  const result = await DB.prepare(
    "INSERT INTO buyers (name, phone, email, address, notes) VALUES (?,?,?,?,?)"
  ).bind(data.name, data.phone || "", data.email || "", data.address || "", data.notes || "").run();
  return result.meta.last_row_id;
}

export async function updateBuyer(DB, id, data) {
  await DB.prepare(
    "UPDATE buyers SET name=?, phone=?, email=?, address=?, notes=? WHERE id=?"
  ).bind(data.name, data.phone || "", data.email || "", data.address || "", data.notes || "", id).run();
}

export async function deleteBuyer(DB, id) {
  await DB.prepare("DELETE FROM buyers WHERE id = ?").bind(id).run();
}

// ================= MARKETING =================

export async function listMarketing(DB, { activeOnly } = {}) {
  let query = "SELECT * FROM marketing WHERE 1=1";
  if (activeOnly) query += " AND active = 1";
  query += " ORDER BY name ASC";
  const { results } = await DB.prepare(query).all();
  return results;
}

export async function getMarketingById(DB, id) {
  return await DB.prepare("SELECT * FROM marketing WHERE id = ?").bind(id).first();
}

export async function createMarketing(DB, data) {
  const result = await DB.prepare(
    "INSERT INTO marketing (name, phone, email, notes, active) VALUES (?,?,?,?,?)"
  ).bind(data.name, data.phone || "", data.email || "", data.notes || "", data.active ? 1 : 0).run();
  return result.meta.last_row_id;
}

export async function updateMarketing(DB, id, data) {
  await DB.prepare(
    "UPDATE marketing SET name=?, phone=?, email=?, notes=?, active=? WHERE id=?"
  ).bind(data.name, data.phone || "", data.email || "", data.notes || "", data.active ? 1 : 0, id).run();
}

export async function deleteMarketing(DB, id) {
  await DB.prepare("DELETE FROM marketing WHERE id = ?").bind(id).run();
}

// ================= SALES (rumah terjual) =================

export async function listSales(DB) {
  const { results } = await DB.prepare(
    `SELECT sales.*, properties.title AS property_title, properties.slug AS property_slug,
            buyers.name AS buyer_name, buyers.phone AS buyer_phone,
            marketing.name AS marketing_name
     FROM sales
     JOIN properties ON properties.id = sales.property_id
     LEFT JOIN buyers ON buyers.id = sales.buyer_id
     LEFT JOIN marketing ON marketing.id = sales.marketing_id
     ORDER BY sales.sale_date DESC, sales.id DESC`
  ).all();
  return results;
}

export async function getSaleByPropertyId(DB, propertyId) {
  return await DB.prepare("SELECT * FROM sales WHERE property_id = ? ORDER BY id DESC LIMIT 1")
    .bind(propertyId).first();
}

export async function createSale(DB, data) {
  const result = await DB.prepare(
    `INSERT INTO sales (property_id, buyer_id, marketing_id, sale_price, sale_date, notes)
     VALUES (?,?,?,?,?,?)`
  ).bind(
    data.property_id, data.buyer_id || null, data.marketing_id || null,
    data.sale_price || 0, data.sale_date || new Date().toISOString().slice(0, 10), data.notes || ""
  ).run();
  return result.meta.last_row_id;
}

export async function deleteSale(DB, id) {
  await DB.prepare("DELETE FROM sales WHERE id = ?").bind(id).run();
}

export async function countSales(DB) {
  const row = await DB.prepare("SELECT COUNT(*) as n FROM sales").first();
  return row?.n || 0;
}

// ================= VOUCHERS =================

export async function listVouchers(DB, { activeOnly } = {}) {
  let query = "SELECT * FROM vouchers WHERE 1=1";
  if (activeOnly) query += " AND active = 1 AND (valid_until = '' OR valid_until >= date('now'))";
  query += " ORDER BY created_at DESC";
  const { results } = await DB.prepare(query).all();
  return results;
}

export async function getVoucherById(DB, id) {
  return await DB.prepare("SELECT * FROM vouchers WHERE id = ?").bind(id).first();
}

export async function createVoucher(DB, data) {
  const result = await DB.prepare(
    `INSERT INTO vouchers (code, title, description, discount_type, discount_value, valid_until, active)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(
    data.code.toUpperCase().trim(), data.title, data.description || "",
    data.discount_type || "fixed", data.discount_value || 0, data.valid_until || "",
    data.active ? 1 : 0
  ).run();
  return result.meta.last_row_id;
}

export async function updateVoucher(DB, id, data) {
  await DB.prepare(
    `UPDATE vouchers SET code=?, title=?, description=?, discount_type=?, discount_value=?, valid_until=?, active=?
     WHERE id=?`
  ).bind(
    data.code.toUpperCase().trim(), data.title, data.description || "",
    data.discount_type || "fixed", data.discount_value || 0, data.valid_until || "",
    data.active ? 1 : 0, id
  ).run();
}

export async function deleteVoucher(DB, id) {
  await DB.prepare("DELETE FROM vouchers WHERE id = ?").bind(id).run();
}

// ================= BANNERS (promo homepage) =================

export async function listBanners(DB, { activeOnly } = {}) {
  let query = "SELECT * FROM banners WHERE 1=1";
  if (activeOnly) query += " AND active = 1";
  query += " ORDER BY sort_order ASC, id ASC";
  const { results } = await DB.prepare(query).all();
  return results;
}

export async function getBannerById(DB, id) {
  return await DB.prepare("SELECT * FROM banners WHERE id = ?").bind(id).first();
}

export async function createBanner(DB, data) {
  const result = await DB.prepare(
    "INSERT INTO banners (title, subtitle, link_url, active, sort_order) VALUES (?,?,?,?,?)"
  ).bind(data.title, data.subtitle || "", data.link_url || "", data.active ? 1 : 0, data.sort_order || 0).run();
  return result.meta.last_row_id;
}

export async function updateBanner(DB, id, data) {
  await DB.prepare(
    "UPDATE banners SET title=?, subtitle=?, link_url=?, active=?, sort_order=? WHERE id=?"
  ).bind(data.title, data.subtitle || "", data.link_url || "", data.active ? 1 : 0, data.sort_order || 0, id).run();
}

export async function setBannerImage(DB, id, imageKey) {
  await DB.prepare("UPDATE banners SET image_key=? WHERE id=?").bind(imageKey, id).run();
}

export async function deleteBanner(DB, id) {
  await DB.prepare("DELETE FROM banners WHERE id = ?").bind(id).run();
}

// ================= TESTIMONIALS =================

export async function listTestimonials(DB, { activeOnly } = {}) {
  let query = "SELECT * FROM testimonials WHERE 1=1";
  if (activeOnly) query += " AND active = 1";
  query += " ORDER BY sort_order ASC, id DESC";
  const { results } = await DB.prepare(query).all();
  return results;
}

export async function getTestimonialById(DB, id) {
  return await DB.prepare("SELECT * FROM testimonials WHERE id = ?").bind(id).first();
}

export async function createTestimonial(DB, data) {
  const result = await DB.prepare(
    `INSERT INTO testimonials (name, role, rating, quote, active, sort_order) VALUES (?,?,?,?,?,?)`
  ).bind(
    data.name, data.role || "", Math.min(5, Math.max(1, Number(data.rating) || 5)),
    data.quote || "", data.active ? 1 : 0, data.sort_order || 0
  ).run();
  return result.meta.last_row_id;
}

export async function updateTestimonial(DB, id, data) {
  await DB.prepare(
    `UPDATE testimonials SET name=?, role=?, rating=?, quote=?, active=?, sort_order=? WHERE id=?`
  ).bind(
    data.name, data.role || "", Math.min(5, Math.max(1, Number(data.rating) || 5)),
    data.quote || "", data.active ? 1 : 0, data.sort_order || 0, id
  ).run();
}

export async function setTestimonialPhoto(DB, id, key) {
  await DB.prepare("UPDATE testimonials SET photo_key=? WHERE id=?").bind(key, id).run();
}

export async function deleteTestimonial(DB, id) {
  await DB.prepare("DELETE FROM testimonials WHERE id = ?").bind(id).run();
}

// ================= SETTINGS =================

export async function getAllSettings(DB) {
  const { results } = await DB.prepare("SELECT * FROM settings").all();
  const map = {};
  for (const row of results) map[row.key] = row.value;
  return map;
}

export async function setSetting(DB, key, value) {
  await DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(key, value).run();
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Sumber kebenaran tunggal untuk nama situs, nomor WA, dan warna tema.
// Prioritas: nilai di tabel settings (diedit dari admin) > env var (wrangler.toml) > default hardcode.
// Warna divalidasi ketat (hex 6 digit) supaya tidak bisa dipakai untuk CSS injection.
export async function getSiteContext(DB, env) {
  const settings = await getAllSettings(DB);
  const accent = HEX_COLOR_RE.test(settings.theme_accent) ? settings.theme_accent : "#2EB872";
  const dark = HEX_COLOR_RE.test(settings.theme_dark) ? settings.theme_dark : "#26332D";
  return {
    settings,
    siteName: settings.site_name || env.SITE_NAME || "Griya Asri",
    legalName: settings.legal_name || "",
    waNumber: settings.whatsapp_number || env.WHATSAPP_NUMBER || "",
    theme: { accent, dark },
  };
}

// ================= ADMIN USERS (akun tim, di luar ADMIN_USER/ADMIN_PASS pemilik) =================

export const ADMIN_ROLES = ["admin", "marketing"];

export async function listAdminUsers(DB) {
  const { results } = await DB.prepare(
    "SELECT id, username, role, active, created_at FROM admin_users ORDER BY created_at ASC"
  ).all();
  return results;
}

export async function getAdminUserByUsername(DB, username) {
  return await DB.prepare("SELECT * FROM admin_users WHERE username = ?").bind(username).first();
}

export async function getAdminUserById(DB, id) {
  return await DB.prepare("SELECT id, username, role, active, created_at FROM admin_users WHERE id = ?").bind(id).first();
}

export async function createAdminUser(DB, { username, passwordHash, role }) {
  const safeRole = ADMIN_ROLES.includes(role) ? role : "marketing";
  const result = await DB.prepare(
    "INSERT INTO admin_users (username, password_hash, role, active) VALUES (?,?,?,1)"
  ).bind(username, passwordHash, safeRole).run();
  return result.meta.last_row_id;
}

export async function setAdminUserActive(DB, id, active) {
  await DB.prepare("UPDATE admin_users SET active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
}

export async function setAdminUserPassword(DB, id, passwordHash) {
  await DB.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").bind(passwordHash, id).run();
}

export async function deleteAdminUser(DB, id) {
  await DB.prepare("DELETE FROM admin_users WHERE id = ?").bind(id).run();
}

// ================= LOGIN RATE LIMITING =================

const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_MAX_ATTEMPTS = 5;

export async function recentFailedAttempts(DB, ip) {
  const row = await DB.prepare(
    `SELECT COUNT(*) as n FROM login_attempts
     WHERE ip = ? AND success = 0 AND attempted_at >= datetime('now', ?)`
  ).bind(ip, `-${LOGIN_WINDOW_MINUTES} minutes`).first();
  return row?.n || 0;
}

export async function recordLoginAttempt(DB, ip, success) {
  await DB.prepare("INSERT INTO login_attempts (ip, success) VALUES (?,?)")
    .bind(ip, success ? 1 : 0).run();
  // Housekeeping: buang jejak lebih dari 1 hari supaya tabel gak numpuk terus.
  // Aman dipanggil tiap kali ada attempt, cuma DELETE ringan pakai index (ip, attempted_at).
  await DB.prepare(`DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')`).run();
}

export function isLoginLocked(failedCount) {
  return failedCount >= LOGIN_MAX_ATTEMPTS;
}

export { LOGIN_WINDOW_MINUTES, LOGIN_MAX_ATTEMPTS };

// ================= LEADS (form kontak publik) =================

const LEAD_WINDOW_MINUTES = 10;
const LEAD_MAX_PER_WINDOW = 3;

export async function recentLeadsFromIp(DB, ip) {
  const row = await DB.prepare(
    `SELECT COUNT(*) as n FROM leads WHERE ip = ? AND created_at >= datetime('now', ?)`
  ).bind(ip, `-${LEAD_WINDOW_MINUTES} minutes`).first();
  return row?.n || 0;
}

export function isLeadRateLimited(recentCount) {
  return recentCount >= LEAD_MAX_PER_WINDOW;
}

export async function createLead(DB, data) {
  const result = await DB.prepare(
    `INSERT INTO leads (name, phone, message, property_id, property_title, ip)
     VALUES (?,?,?,?,?,?)`
  ).bind(
    data.name, data.phone || "", data.message || "",
    data.property_id || null, data.property_title || "", data.ip || ""
  ).run();
  return result.meta.last_row_id;
}

export async function listLeads(DB, { handledOnly, unhandledOnly, q } = {}) {
  let query = "SELECT * FROM leads WHERE 1=1";
  const params = [];
  if (handledOnly) query += " AND handled = 1";
  if (unhandledOnly) query += " AND handled = 0";
  if (q) { query += " AND (name LIKE ? OR phone LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }
  query += " ORDER BY created_at DESC";
  const { results } = await DB.prepare(query).bind(...params).all();
  return results;
}

export async function getLeadById(DB, id) {
  return await DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
}

export async function countUnhandledLeads(DB) {
  const row = await DB.prepare("SELECT COUNT(*) as n FROM leads WHERE handled = 0").first();
  return row?.n || 0;
}

export async function setLeadHandled(DB, id, handled) {
  await DB.prepare("UPDATE leads SET handled = ? WHERE id = ?").bind(handled ? 1 : 0, id).run();
}

export async function deleteLead(DB, id) {
  await DB.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
}
