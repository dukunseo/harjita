// Session login admin pakai cookie yang di-sign dengan HMAC-SHA256 (tanpa KV/session store).
// Juga menyediakan CSRF token (synchronizer token) untuk semua form POST di admin.

import { getAdminUserByUsername } from "./db.js";

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Perbandingan string dengan waktu konstan, supaya tidak bocor lewat timing attack.
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

// Role & username disisipkan ke payload session supaya middleware bisa membatasi
// akses (mis. role "marketing" tidak boleh buka Pengaturan Situs / Tim & Pengguna)
// tanpa perlu query DB ulang di tiap request.
//
// Urutan field SENGAJA: signature, role, expires, lalu username PALING BELAKANG.
// role adalah enum tetap (tidak ada titik) dan expires cuma digit, jadi 3 field
// pertama selalu aman di-split(".")  — sisanya (bisa lebih dari 1 bagian kalau
// username mengandung titik) digabung lagi jadi username. Ini supaya username
// yang mengandung "." (mis. dari ADMIN_USER secret yang tidak kita validasi
// sendiri) tetap ke-parse benar, bukan bikin sesi gagal diverifikasi diam-diam.
export async function createSessionCookie(username, role, secret) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${role}.${expires}.${username}`;
  const sig = await hmac(secret, payload);
  const value = encodeURIComponent(`${sig}.${payload}`);
  return `admin_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function verifySession(cookieHeader, secret) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/admin_session=([^;]+)/);
  if (!match) return null;

  const value = decodeURIComponent(match[1]);
  const parts = value.split(".");
  if (parts.length < 4) return null;

  const [sig, role, expires, ...usernameParts] = parts;
  const username = usernameParts.join(".");
  if (!username) return null;

  const payload = `${role}.${expires}.${username}`;
  const expectedSig = await hmac(secret, payload);

  if (!timingSafeEqual(sig, expectedSig)) return null;
  if (Date.now() > Number(expires)) return null;
  if (role !== "admin" && role !== "marketing") return null;

  return { username, role };
}

// ── Hashing password akun admin tambahan (tabel admin_users) ──
// PBKDF2-SHA256 via Web Crypto native (bukan loop JS), jadi tetap ringan
// untuk dijalankan di Workers meski iterasinya tinggi. Format simpan:
// "saltHex:hashHex" supaya salt unik per akun ikut tersimpan.
const PBKDF2_ITERATIONS = 100000;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function deriveBits(password, salt) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, keyMaterial, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt);
  return `${bufToHex(salt)}:${bufToHex(bits)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const bits = await deriveBits(password, hexToBuf(saltHex));
  return timingSafeEqual(bufToHex(bits), hashHex);
}

// Middleware Hono: lindungi semua route di bawah /admin (kecuali /admin/login)
export async function requireAuth(c, next) {
  const cookie = c.req.header("Cookie");
  const session = await verifySession(cookie, c.env.SESSION_SECRET);
  if (!session) {
    return c.redirect("/admin/login");
  }

  // Sesi akun pemilik (dari secret ADMIN_USER) dipercaya langsung dari signature cookie.
  // Sesi akun tim (tabel admin_users) DIVALIDASI ULANG ke DB di setiap request — supaya
  // menonaktifkan/menghapus akun dari /admin/pengguna langsung mencabut akses saat itu
  // juga, bukan nunggu cookie 7 hari expired. Biayanya cuma 1 query D1 ringan per request
  // admin (indexed by username), jadi masih aman untuk beban CF free-tier.
  if (session.username !== c.env.ADMIN_USER) {
    const user = await getAdminUserByUsername(c.env.DB, session.username);
    if (!user || !user.active) {
      return c.redirect("/admin/login");
    }
    session.role = user.role; // sinkron kalau role diubah admin setelah sesi berjalan
  }

  c.set("admin", session);
  await next();
}

// ── CSRF: token statis per-sesi, dicek di setiap form POST admin ──
// (Cookie session sudah SameSite=Lax yang menghalangi POST cross-site,
// token ini adalah lapisan pertahanan tambahan / defense-in-depth.)

export async function csrfToken(c) {
  const admin = c.get("admin");
  if (!admin) return "";
  return hmac(c.env.SESSION_SECRET, `csrf:${admin.username}`);
}

export async function requireCsrf(c, next) {
  const admin = c.get("admin");
  const body = await c.req.parseBody({ all: true });
  const expected = await hmac(c.env.SESSION_SECRET, `csrf:${admin.username}`);
  const provided = body["_csrf"];
  if (!provided || !timingSafeEqual(String(provided), expected)) {
    return c.text("Permintaan ditolak (token keamanan tidak valid). Silakan kembali dan coba lagi.", 403);
  }
  // simpan body yang sudah di-parse supaya handler tidak perlu parseBody lagi
  c.set("parsedBody", body);
  await next();
}

export function hiddenCsrfField(token) {
  return `<input type="hidden" name="_csrf" value="${token}">`;
}
