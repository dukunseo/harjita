import { Hono } from "hono";
import { baseLayout, propertyCard, projectPills, voucherCard, formatRupiah, statusBadge, subsidyBadge, esc, safeUrl, bannerCarousel, kprCalculator, mapsEmbed, testimonialCard, icon, dreamCalculatorHero, bentoLargeCard, bentoNormalCard, bentoStatCard, leadForm } from "../templates.js";
import { listProperties, getPropertyBySlug, getImages, getAllSettings, listProjects, getProjectBySlug, listVouchers, listBanners, countProperties, countProjects, listTestimonials, getSiteContext, createLead, recentLeadsFromIp, isLeadRateLimited } from "../db.js";

export const publicRoutes = new Hono();

// ── SEO: robots.txt & sitemap.xml ──
publicRoutes.get("/robots.txt", async (c) => {
  const origin = new URL(c.req.url).origin;
  const body = `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${origin}/sitemap.xml
`;
  return c.text(body);
});

publicRoutes.get("/sitemap.xml", async (c) => {
  const { DB } = c.env;
  const origin = new URL(c.req.url).origin;
  const properties = await listProperties(DB, { publishedOnly: true });
  const projects = await listProjects(DB);

  const staticUrls = [
    { loc: `${origin}/`, priority: "1.0" },
    { loc: `${origin}/properti`, priority: "0.9" },
    { loc: `${origin}/tentang`, priority: "0.6" },
  ];
  const propertyUrls = properties.map((p) => ({
    loc: `${origin}/properti/${p.slug}`,
    lastmod: (p.updated_at || p.created_at || "").slice(0, 10),
    priority: "0.8",
  }));
  const projectUrls = projects.map((pr) => ({
    loc: `${origin}/proyek/${pr.slug}`,
    priority: "0.7",
  }));

  const all = [...staticUrls, ...projectUrls, ...propertyUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all
  .map(
    (u) => `  <url>
    <loc>${esc(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;
  c.header("Content-Type", "application/xml");
  return c.body(xml);
});

// ── Serve gambar dari R2 (bucket private, jadi harus lewat worker) ──
publicRoutes.get("/media/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "ETag": obj.httpEtag,
    },
  });
});

// ── Form kontak publik (homepage + halaman detail properti) → tabel `leads` ──
publicRoutes.post("/kontak", async (c) => {
  const { DB } = c.env;
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const body = await c.req.parseBody();

  const returnTo = safeUrl(String(body.return_to || "")) || "/";
  const fail = () => c.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}lead=gagal#kontak`);

  // Honeypot: field ini disembunyikan lewat CSS, cuma bot yang isi.
  if (String(body.website || "").trim() !== "") return fail();

  const name = String(body.name || "").trim().slice(0, 120);
  const phone = String(body.phone || "").trim().slice(0, 30);
  if (!name || !phone) return fail();

  const recent = await recentLeadsFromIp(DB, ip);
  if (isLeadRateLimited(recent)) return fail();

  await createLead(DB, {
    name,
    phone,
    message: String(body.message || "").trim().slice(0, 500),
    property_id: body.property_id ? parseInt(body.property_id, 10) || null : null,
    property_title: String(body.property_title || "").trim().slice(0, 200),
    ip,
  });

  return c.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}lead=sukses#kontak`);
});

// ── Homepage ──
publicRoutes.get("/", async (c) => {
  const { DB } = c.env;
  const { settings, siteName, waNumber: wa, theme } = await getSiteContext(DB, c.env);
  const origin = new URL(c.req.url).origin;
  const leadQuery = c.req.query("lead") || "";
  const featured = await listProperties(DB, { featured: true, publishedOnly: true });
  const latest = await listProperties(DB, { publishedOnly: true });
  const projects = await listProjects(DB);
  const vouchers = await listVouchers(DB, { activeOnly: true });
  const banners = await listBanners(DB, { activeOnly: true });
  const soldCount = await countProperties(DB, { status: "terjual" });
  const availableCount = await countProperties(DB, { status: "tersedia" });
  const projectCount = await countProjects(DB);
  const locationCount = new Set(projects.map((p) => p.location).filter(Boolean)).size;
  const testimonials = await listTestimonials(DB, { activeOnly: true });
  const subsidizedProps = await listProperties(DB, { subsidized: true, publishedOnly: true });
  const subsidizedCount = subsidizedProps.length;

  const allPrices = latest.map((p) => p.price).filter((n) => n > 0);
  const dreamMin = allPrices.length ? Math.max(50000000, Math.floor(Math.min(...allPrices) / 10000000) * 10000000) : 100000000;
  const dreamMax = allPrices.length ? Math.ceil(Math.max(...allPrices) / 10000000) * 10000000 : 500000000;
  const dreamDefault = subsidizedProps[0]?.price || allPrices[0] || 150000000;

  const heroBanner = banners[0];

  const body = `
  <header class="lattice-pattern" style="position:relative; min-height:92vh; display:flex; align-items:center; overflow:hidden; background:var(--ink);">
    ${bannerCarousel(banners)}
    <div class="wrap" style="position:relative; z-index:2; padding:60px 24px; width:100%;">
      <div style="max-width:640px; margin-bottom:28px;">
        <div class="eyebrow" style="color:var(--sunny);">${esc(heroBanner?.title || "Rumah Pertama, Impian Jadi Nyata")}</div>
        <div class="divider-gold"></div>
        <h2 class="serif" style="font-size:44px; margin:0 0 12px; line-height:1.1; color:#fff;">
          ${esc(settings.site_tagline || "Wujudkan Rumah Pertama Impian Anda")}
        </h2>
        <p style="max-width:500px; font-size:15.5px; color:rgba(255,255,255,0.8);">
          ${esc(heroBanner?.subtitle || settings.hero_subtitle || "")}
        </p>
      </div>
      ${dreamCalculatorHero(dreamMin, dreamMax, dreamDefault, Number(settings.kpr_subsidi_dp_default) || 1, Number(settings.kpr_subsidi_bunga_default) || 5)}
    </div>
  </header>

  <section class="wrap reveal" style="padding:56px 0; border-bottom:1px solid var(--line);">
    <div class="grid grid-3" style="text-align:center;">
      <div><div class="stat-num" data-countup="${projectCount}">0</div><div class="stat-label">Proyek Berjalan</div></div>
      <div><div class="stat-num" data-countup="${locationCount || projectCount}">0</div><div class="stat-label">Lokasi Strategis</div></div>
      <div><div class="stat-num" data-countup="${soldCount}" data-suffix="+">0</div><div class="stat-label">Keluarga Sudah Punya Rumah</div></div>
    </div>
  </section>

  ${
    projects.length
      ? `
  <section class="wrap reveal" style="padding:70px 0 10px;">
    <div class="eyebrow corner-tick">Sebaran Proyek</div>
    <h2 class="serif" style="font-size:32px; margin:10px 0 24px;">Proyek Kami di Berbagai Lokasi</h2>
    ${projectPills(projects, "", "page")}
  </section>`
      : ""
  }

  ${
    vouchers.length
      ? `
  <section class="wrap reveal" style="padding:60px 0;">
    <div class="eyebrow">Penawaran Terbatas</div>
    <h2 class="serif" style="font-size:32px; margin:10px 0 24px;">Voucher & Promo</h2>
    <div class="grid grid-3">${vouchers.map((v) => voucherCard(v, wa)).join("")}</div>
  </section>`
      : ""
  }

  ${
    featured.length
      ? `
  <section class="wrap reveal" style="padding:60px 0;">
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:26px;">
      <div>
        <div class="eyebrow">Pilihan Terbaik</div>
        <h2 class="serif" style="font-size:32px; margin:8px 0 0;">Unit Unggulan</h2>
      </div>
      <a href="/properti" style="font-size:13px; text-transform:uppercase; letter-spacing:.05em;">Semua properti →</a>
    </div>
    <div class="bento-grid">
      ${bentoLargeCard(featured[0])}
      ${featured.slice(1, 3).map(bentoNormalCard).join("")}
      ${bentoStatCard(availableCount, soldCount)}
    </div>
  </section>`
      : ""
  }

  <section class="wrap reveal" style="padding:60px 0;">
    <div class="eyebrow">Terbaru</div>
    <h2 class="serif" style="font-size:32px; margin:8px 0 24px;">Listing Terbaru</h2>
    ${
      latest.length
        ? `<div class="grid grid-3">${latest.slice(0, 6).map(propertyCard).join("")}</div>`
        : `<p style="color:var(--stone);">Belum ada properti yang ditambahkan. Silakan tambah lewat panel admin.</p>`
    }
  </section>

  <section id="tentang" class="wrap reveal" style="padding:60px 0; display:grid; grid-template-columns:1fr 1fr; gap:48px;">
    <div>
      <div class="eyebrow">Tentang Kami</div>
      <h2 class="serif" style="font-size:30px; margin:10px 0 18px;">Kenapa memilih kami</h2>
      <p style="color:var(--stone);">${esc((settings.about_text || "").slice(0, 260))}${(settings.about_text || "").length > 260 ? "…" : ""}</p>
      <a href="/tentang" style="font-size:13px; text-transform:uppercase; letter-spacing:.05em; font-weight:700;">Selengkapnya tentang kami →</a>
    </div>
    <div style="border:1px solid var(--line); background:#fff; padding:32px;">
      <div class="eyebrow" style="margin-bottom:12px;">Legalitas & Jaminan</div>
      <ul style="margin:0; padding-left:18px; color:var(--stone); line-height:2;">
        <li>Sertifikat SHM / bisa dibantu proses KPR</li>
        <li>Serah terima unit sesuai jadwal</li>
        <li>Konsultasi gratis dengan tim marketing kami</li>
      </ul>
    </div>
  </section>

  ${
    testimonials.length
      ? `
  <section class="wrap reveal" style="padding:60px 0;">
    <div class="eyebrow">Kata Mereka</div>
    <h2 class="serif" style="font-size:32px; margin:10px 0 24px;">Testimoni Pembeli</h2>
    <div class="grid grid-3">${testimonials.map(testimonialCard).join("")}</div>
  </section>`
      : ""
  }

  ${
    subsidizedCount > 0 && settings.kpr_subsidi_syarat
      ? `
  <section class="wrap reveal" style="padding:20px 0 60px;">
    <div style="background:#fff; border:2px solid var(--line); border-radius:24px; padding:36px;">
      <div class="eyebrow">Info Penting</div>
      <h2 class="serif" style="font-size:28px; margin:10px 0 16px;">Syarat KPR Subsidi Pemerintah (FLPP)</h2>
      <p style="font-size:14px; color:var(--ink); white-space:pre-line; line-height:1.9; max-width:760px;">${esc(settings.kpr_subsidi_syarat)}</p>
    </div>
  </section>`
      : ""
  }

  <section id="kontak" class="wrap reveal" style="padding:20px 0 60px;">
    <div class="kontak-grid" style="background:var(--ink); color:#fff; padding:48px;">
      <div>
        <h2 class="serif" style="font-size:26px; margin:0 0 8px; color:#fff;">Tertarik dengan salah satu unit kami?</h2>
        <p style="margin:0 0 20px; color:rgba(255,255,255,0.75);">${esc(settings.address || "")} · ${esc(settings.email || "")}</p>
        <a href="https://wa.me/${esc(wa)}" target="_blank" class="btn btn-gold">Chat via WhatsApp</a>
      </div>
      <div>
        ${leadQuery === "sukses" ? `<div class="flash flash-ok">Terima kasih! Tim kami akan segera menghubungi Anda.</div>` : ""}
        ${leadQuery === "gagal" ? `<div class="flash flash-err">Gagal mengirim. Pastikan nama & no. WhatsApp terisi, lalu coba lagi.</div>` : ""}
        ${leadForm({ returnTo: "/" })}
      </div>
    </div>
  </section>
  `;

  return c.html(
    baseLayout({
      title: "Beranda",
      siteName,
      activeNav: "home",
      body,
      waNumber: wa,
      waGreeting: settings.whatsapp_greeting,
      theme,
      settings,
      description: settings.hero_subtitle || settings.site_tagline,
      ogImage: heroBanner?.image_key ? `${origin}/media/${heroBanner.image_key}` : (featured[0]?.cover_image ? `${origin}/media/${featured[0].cover_image}` : ""),
      canonicalUrl: origin + "/",
    })
  );
});

// ── Halaman "Tentang Kami" berdiri sendiri (kredibilitas developer: APERSI,
//    mitra BTN Platinum, dll) — sebelumnya cuma section di homepage, sekarang
//    punya URL, meta description, dan canonical URL sendiri supaya bisa
//    di-share/SEO terpisah dari homepage. ──
publicRoutes.get("/tentang", async (c) => {
  const { DB } = c.env;
  const { settings, siteName, waNumber: wa, theme } = await getSiteContext(DB, c.env);
  const origin = new URL(c.req.url).origin;

  const [soldCount, availableCount, projectCount] = await Promise.all([
    countProperties(DB, { status: "terjual" }),
    countProperties(DB, { status: "tersedia" }),
    countProjects(DB),
  ]);

  const body = `
  <div class="wrap" style="padding:48px 0 70px;">
    <div class="eyebrow">Tentang Kami</div>
    <h1 class="serif" style="font-size:38px; margin:10px 0 20px; max-width:720px;">${esc(settings.legal_name || siteName)}</h1>

    <div style="display:grid; grid-template-columns:1.4fr 1fr; gap:44px; align-items:start;">
      <div>
        <p style="color:var(--ink); white-space:pre-line; font-size:15px; line-height:1.9;">${esc(settings.about_text || "")}</p>

        <div style="display:flex; gap:32px; margin-top:30px; flex-wrap:wrap;">
          <div><div class="stat-num" style="font-size:28px;">${projectCount}</div><div class="stat-label">Proyek Berjalan</div></div>
          <div><div class="stat-num" style="font-size:28px;">${availableCount}</div><div class="stat-label">Unit Tersedia</div></div>
          <div><div class="stat-num" style="font-size:28px;">${soldCount}</div><div class="stat-label">Keluarga Sudah Punya Rumah</div></div>
        </div>

        ${
          settings.address
            ? `<div style="margin-top:36px;">
                <div class="eyebrow" style="margin-bottom:10px;">Lokasi Kantor</div>
                ${mapsEmbed(settings.address)}
              </div>`
            : ""
        }
      </div>

      <div>
        <div style="border:1px solid var(--line); background:#fff; padding:28px; margin-bottom:20px;">
          <div class="eyebrow" style="margin-bottom:12px;">Legalitas & Kemitraan</div>
          <ul style="margin:0; padding-left:18px; color:var(--stone); line-height:2; font-size:14px;">
            <li>Anggota APERSI (Asosiasi Pengembang Perumahan dan Permukiman Seluruh Indonesia)</li>
            <li>Mitra resmi Platinum Developer BTN Properti</li>
            <li>Sertifikat SHM / bisa dibantu proses KPR</li>
            <li>Serah terima unit sesuai jadwal</li>
          </ul>
        </div>
        <div style="border:1px solid var(--line); background:#fff; padding:28px;">
          <div class="eyebrow" style="margin-bottom:12px;">Kontak</div>
          ${settings.address ? `<p style="margin:0 0 8px; font-size:13.5px; color:var(--stone);">📍 ${esc(settings.address)}</p>` : ""}
          ${settings.email ? `<p style="margin:0 0 8px; font-size:13.5px; color:var(--stone);">✉️ ${esc(settings.email)}</p>` : ""}
          ${settings.instagram ? `<p style="margin:0 0 16px; font-size:13.5px; color:var(--stone);">📷 @${esc(settings.instagram.replace(/^@/, ""))}</p>` : ""}
          <a href="https://wa.me/${esc(wa)}" target="_blank" class="btn btn-gold" style="width:100%; justify-content:center;">Chat via WhatsApp</a>
        </div>
      </div>
    </div>
  </div>`;

  return c.html(
    baseLayout({
      title: "Tentang Kami",
      siteName,
      activeNav: "tentang",
      body,
      waNumber: wa,
      waGreeting: settings.whatsapp_greeting,
      theme,
      settings,
      description: (settings.about_text || `Tentang ${siteName} — ${settings.legal_name || ""}`).slice(0, 160),
      canonicalUrl: origin + "/tentang",
    })
  );
});

// ── Halaman detail proyek/lokasi (landing page per cluster — bagus untuk SEO & iklan lokasi) ──
publicRoutes.get("/proyek/:slug", async (c) => {
  const { DB } = c.env;
  const { settings, siteName, waNumber: wa, theme } = await getSiteContext(DB, c.env);
  const project = await getProjectBySlug(DB, c.req.param("slug"));
  if (!project) return c.notFound();

  const properties = await listProperties(DB, { project_id: project.id, publishedOnly: true });
  const availableCount = properties.filter((p) => p.status === "tersedia").length;
  const origin = new URL(c.req.url).origin;

  const body = `
  <div class="wrap" style="padding:36px 0 70px;">
    <a href="/properti" style="font-size:13px;">← Kembali ke daftar properti</a>

    <div style="margin-top:18px; display:grid; grid-template-columns:1.4fr 1fr; gap:36px; align-items:center;">
      <div>
        <div class="eyebrow">Proyek</div>
        <h1 class="serif" style="font-size:38px; margin:10px 0 12px;">${esc(project.name)}</h1>
        <div style="color:var(--stone); margin-bottom:16px;">📍 ${esc(project.location)}</div>
        <p style="color:var(--ink); white-space:pre-line;">${esc(project.description || "")}</p>
        <div style="display:flex; gap:24px; margin-top:22px;">
          <div><div class="stat-num" style="font-size:26px;">${properties.length}</div><div class="stat-label">Total Unit</div></div>
          <div><div class="stat-num" style="font-size:26px;">${availableCount}</div><div class="stat-label">Tersedia</div></div>
        </div>
      </div>
      ${project.cover_image ? `<img src="/media/${esc(project.cover_image)}" alt="${esc(project.name)}" loading="lazy" style="width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:20px;">` : ""}
    </div>

    ${
      project.location
        ? `<div style="margin-top:36px;"><div class="eyebrow" style="margin-bottom:10px;">Lokasi</div>${mapsEmbed(project.location)}</div>`
        : ""
    }

    <div style="margin-top:44px;">
      <h2 class="serif" style="font-size:26px; margin-bottom:20px;">Unit di ${esc(project.name)}</h2>
      ${
        properties.length
          ? `<div class="grid grid-3">${properties.map(propertyCard).join("")}</div>`
          : `<p style="color:var(--stone);">Belum ada unit yang dipublikasikan untuk proyek ini.</p>`
      }
    </div>
  </div>`;

  return c.html(
    baseLayout({
      title: project.name,
      siteName,
      body,
      waNumber: wa,
      waGreeting: settings.whatsapp_greeting,
      theme,
      settings,
      description: project.description || `${project.name} di ${project.location} — ${properties.length} unit tersedia dari ${siteName}.`,
      ogImage: project.cover_image ? `${origin}/media/${project.cover_image}` : "",
      canonicalUrl: origin + "/proyek/" + project.slug,
    })
  );
});

// ── Listing / pencarian properti ──
const LISTING_PAGE_SIZE = 12;

publicRoutes.get("/properti", async (c) => {
  const { DB } = c.env;
  const { settings, siteName, waNumber: wa, theme } = await getSiteContext(DB, c.env);
  const { status, type, q, project: projectSlug, price_min, price_max, subsidi, sort: sortParam, page: pageParam } = c.req.query();

  let project_id;
  if (projectSlug) {
    const project = await getProjectBySlug(DB, projectSlug);
    project_id = project?.id;
  }

  const sortOptions = [
    ["terbaru", "Terbaru"],
    ["harga_asc", "Harga Termurah"],
    ["harga_desc", "Harga Termahal"],
  ];
  const sort = sortOptions.some(([v]) => v === sortParam) ? sortParam : "terbaru";

  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const filters = { status, type, q, project_id, price_min, price_max, subsidized: subsidi === "1", sort, publishedOnly: true };
  const [properties, total] = await Promise.all([
    listProperties(DB, { ...filters, limit: LISTING_PAGE_SIZE, offset: (page - 1) * LISTING_PAGE_SIZE }),
    countProperties(DB, filters),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));
  const projects = await listProjects(DB);

  // Query string dasar (tanpa `page`) supaya link paginasi mempertahankan filter aktif.
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (type) qs.set("type", type);
  if (q) qs.set("q", q);
  if (projectSlug) qs.set("project", projectSlug);
  if (price_min) qs.set("price_min", price_min);
  if (price_max) qs.set("price_max", price_max);
  if (subsidi === "1") qs.set("subsidi", "1");
  if (sort !== "terbaru") qs.set("sort", sort);
  const baseQs = qs.toString();
  const pageLink = (n) => `/properti?${baseQs ? baseQs + "&" : ""}page=${n}`;

  const typeOptions = ["", "Rumah", "Ruko", "Apartemen", "Tanah", "Kavling"];
  const statusOptions = [
    ["", "Semua Status"],
    ["tersedia", "Tersedia"],
    ["proses", "Dalam Proses"],
    ["terjual", "Terjual"],
  ];

  const body = `
  <div class="wrap" style="padding:48px 0 70px;">
    <div class="eyebrow">Daftar Unit</div>
    <h1 class="serif" style="font-size:38px; margin:10px 0 20px;">Semua Properti</h1>

    ${projects.length ? projectPills(projects, projectSlug || "") : ""}

    <form method="get" style="display:flex; gap:12px; flex-wrap:wrap; margin:24px 0 32px; background:#fff; border:1px solid var(--line); padding:20px;">
      ${projectSlug ? `<input type="hidden" name="project" value="${esc(projectSlug)}">` : ""}
      <input type="text" name="q" placeholder="Cari nama / lokasi..." value="${esc(q || "")}" style="flex:2; min-width:200px;">
      <select name="type" style="flex:1; min-width:150px;">
        ${typeOptions.map((t) => `<option value="${esc(t)}" ${t === type ? "selected" : ""}>${t || "Semua Tipe"}</option>`).join("")}
      </select>
      <select name="status" style="flex:1; min-width:150px;">
        ${statusOptions.map(([v, l]) => `<option value="${esc(v)}" ${v === status ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <input type="number" name="price_min" placeholder="Harga min (Rp)" value="${esc(price_min || "")}" style="flex:1; min-width:150px;">
      <input type="number" name="price_max" placeholder="Harga maks (Rp)" value="${esc(price_max || "")}" style="flex:1; min-width:150px;">
      <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:700; color:var(--ink); white-space:nowrap;">
        <input type="checkbox" name="subsidi" value="1" ${subsidi === "1" ? "checked" : ""} style="width:auto;" onchange="this.form.submit()">
        Khusus KPR Subsidi
      </label>
      <button class="btn btn-gold" type="submit">Filter</button>
    </form>

    ${
      properties.length
        ? `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin:-14px 0 18px;">
             <p style="color:var(--stone); font-size:13.5px; margin:0;">Menampilkan ${properties.length} dari ${total} properti</p>
             <form method="get" style="display:flex; align-items:center; gap:8px;">
               ${status ? `<input type="hidden" name="status" value="${esc(status)}">` : ""}
               ${type ? `<input type="hidden" name="type" value="${esc(type)}">` : ""}
               ${q ? `<input type="hidden" name="q" value="${esc(q)}">` : ""}
               ${projectSlug ? `<input type="hidden" name="project" value="${esc(projectSlug)}">` : ""}
               ${price_min ? `<input type="hidden" name="price_min" value="${esc(price_min)}">` : ""}
               ${price_max ? `<input type="hidden" name="price_max" value="${esc(price_max)}">` : ""}
               ${subsidi === "1" ? `<input type="hidden" name="subsidi" value="1">` : ""}
               <label for="sortSelect" style="font-size:13px; color:var(--stone); white-space:nowrap;">Urutkan:</label>
               <select id="sortSelect" name="sort" onchange="this.form.submit()" style="min-width:170px;">
                 ${sortOptions.map(([v, l]) => `<option value="${v}" ${v === sort ? "selected" : ""}>${l}</option>`).join("")}
               </select>
             </form>
           </div>
           <div class="grid grid-3">${properties.map(propertyCard).join("")}</div>`
        : `<p style="color:var(--stone);">Tidak ada properti yang cocok dengan filter Anda.</p>`
    }

    ${
      totalPages > 1
        ? `<div style="display:flex; gap:6px; justify-content:center; margin-top:36px; flex-wrap:wrap;">
            ${Array.from({ length: totalPages }, (_, i) => i + 1)
              .map((n) => `<a href="${pageLink(n)}" class="btn ${n === page ? "btn-gold" : "btn-outline"}" style="padding:8px 14px; min-width:38px; text-align:center;">${n}</a>`)
              .join("")}
          </div>`
        : ""
    }
  </div>`;

  return c.html(
    baseLayout({
      title: "Semua Properti",
      siteName,
      activeNav: "listing",
      body,
      waNumber: wa,
      waGreeting: settings.whatsapp_greeting,
      theme,
      settings,
      description: `Jelajahi ${total} pilihan properti dari ${siteName} — rumah, ruko, dan kavling dengan lokasi strategis.`,
      ogImage: properties[0]?.cover_image ? `${new URL(c.req.url).origin}/media/${properties[0].cover_image}` : "",
      canonicalUrl: new URL(c.req.url).origin + "/properti",
    })
  );
});

// ── Detail properti + gallery ──
publicRoutes.get("/properti/:slug", async (c) => {
  const { DB } = c.env;
  const { settings, siteName, waNumber: wa, theme } = await getSiteContext(DB, c.env);
  const p = await getPropertyBySlug(DB, c.req.param("slug"), { publishedOnly: true });
  if (!p) return c.notFound();
  const images = await getImages(DB, p.id);
  const gallery = images.length ? images : p.cover_image ? [{ image_key: p.cover_image }] : [];

  const waMsg = encodeURIComponent(`Halo, saya tertarik dengan properti "${p.title}" (${c.req.url}).`);
  const origin = new URL(c.req.url).origin;
  const leadQuery = c.req.query("lead") || "";
  const detailPath = `/properti/${p.slug}`;

  // ── Structured data (JSON-LD) supaya listing berpeluang tampil sebagai rich result di Google ──
  // JSON.stringify otomatis meng-escape karakter berbahaya, jadi aman disisipkan ke <script> tanpa esc() tambahan.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    description: p.description || undefined,
    url: origin + "/properti/" + p.slug,
    image: gallery.length ? gallery.map((g) => origin + "/media/" + g.image_key) : undefined,
    address: p.location ? { "@type": "PostalAddress", addressLocality: p.location } : undefined,
    offers: {
      "@type": "Offer",
      price: p.price || undefined,
      priceCurrency: "IDR",
      availability: p.status === "terjual" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    },
  };

  const body = `
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  <div class="wrap" style="padding:36px 0 70px;">
    <a href="/properti" style="font-size:13px;">← Kembali ke daftar properti</a>

    <div style="display:grid; grid-template-columns:1.6fr 1fr; gap:44px; margin-top:22px;" id="detail-grid">
      <div>
        ${
          gallery.length
            ? `<div style="display:grid; grid-template-columns:2fr 1fr; gap:8px;">
                <img class="lightbox-img" src="/media/${esc(gallery[0].image_key)}" alt="${esc(p.title)} - foto 1" loading="lazy" style="width:100%; aspect-ratio:4/3; object-fit:cover; grid-row:span 2;">
                ${gallery
                  .slice(1, 3)
                  .map((g, i) => `<img class="lightbox-img" src="/media/${esc(g.image_key)}" alt="${esc(p.title)} - foto ${i + 2}" loading="lazy" style="width:100%; aspect-ratio:16/10; object-fit:cover;">`)
                  .join("")}
              </div>
              ${
                gallery.length > 3
                  ? `<div class="grid" style="grid-template-columns:repeat(4,1fr); margin-top:8px;">
                      ${gallery.slice(3).map((g, i) => `<img class="lightbox-img" src="/media/${esc(g.image_key)}" alt="${esc(p.title)} - foto ${i + 4}" loading="lazy" style="width:100%; aspect-ratio:1; object-fit:cover;">`).join("")}
                    </div>`
                  : ""
              }`
            : `<div style="aspect-ratio:16/9; background:#e9e6de;"></div>`
        }

        <div style="margin-top:34px;">
          <div class="eyebrow">${esc(p.type)}</div>
          <h1 class="serif" style="font-size:36px; margin:10px 0;">${esc(p.title)}</h1>
          <div style="color:var(--stone); margin-bottom:18px;">${esc(p.location || "-")}</div>
          <p style="color:var(--ink); white-space:pre-line;">${esc(p.description || "")}</p>
        </div>

        ${
          p.location
            ? `<div style="margin-top:30px;">
                <div class="eyebrow" style="margin-bottom:10px;">Lokasi</div>
                ${mapsEmbed(p.location)}
              </div>`
            : ""
        }
      </div>

      <div>
        <div style="border:1px solid var(--line); background:#fff; padding:26px; position:sticky; top:100px;">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${statusBadge(p.status)}
            ${p.subsidized ? subsidyBadge() : ""}
          </div>
          <div class="serif" style="font-size:28px; color:var(--gold-dark); margin:16px 0 6px;">
            ${p.subsidized ? "" : p.price_label ? esc(p.price_label) + " " : ""}${formatRupiah(p.price)}
          </div>
          ${p.subsidized ? `<div style="font-size:12.5px; color:var(--stone); margin-bottom:14px;">✓ Harga pasti sesuai ketentuan pemerintah, tanpa biaya tersembunyi</div>` : `<div style="margin-bottom:14px;"></div>`}
          <div class="specs" style="font-size:14px; gap:0; flex-direction:column; margin-bottom:22px;">
            ${p.land_area ? `<div style="display:flex;justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--line);"><span style="display:flex;align-items:center;gap:8px;">${icon("land")}Luas Tanah</span><span>${esc(p.land_area)} m²</span></div>` : ""}
            ${p.building_area ? `<div style="display:flex;justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--line);"><span style="display:flex;align-items:center;gap:8px;">${icon("building")}Luas Bangunan</span><span>${esc(p.building_area)} m²</span></div>` : ""}
            ${p.bedrooms ? `<div style="display:flex;justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--line);"><span style="display:flex;align-items:center;gap:8px;">${icon("bed")}Kamar Tidur</span><span>${esc(p.bedrooms)}</span></div>` : ""}
            ${p.bathrooms ? `<div style="display:flex;justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--line);"><span style="display:flex;align-items:center;gap:8px;">${icon("bath")}Kamar Mandi</span><span>${esc(p.bathrooms)}</span></div>` : ""}
            ${p.carports ? `<div style="display:flex;justify-content:space-between; padding:9px 0;"><span style="display:flex;align-items:center;gap:8px;">${icon("car")}Carport</span><span>${esc(p.carports)}</span></div>` : ""}
          </div>
          <a href="https://wa.me/${esc(wa)}?text=${waMsg}" target="_blank" class="btn btn-gold" style="width:100%; justify-content:center;">Chat via WhatsApp</a>
          ${p.brochure_key ? `<a href="/media/${esc(p.brochure_key)}" target="_blank" class="btn btn-outline" style="width:100%; justify-content:center; margin-top:10px;">Download Brosur (PDF)</a>` : ""}
          <div id="kontak" style="margin-top:20px; padding-top:20px; border-top:1px solid var(--line);">
            <div class="eyebrow" style="margin-bottom:10px;">Atau minta dihubungi</div>
            ${leadQuery === "sukses" ? `<div class="flash flash-ok">Terima kasih! Tim kami akan segera menghubungi Anda soal unit ini.</div>` : ""}
            ${leadQuery === "gagal" ? `<div class="flash flash-err">Gagal mengirim. Pastikan nama & no. WhatsApp terisi, lalu coba lagi.</div>` : ""}
            ${leadForm({ propertyId: p.id, propertyTitle: p.title, returnTo: detailPath })}
          </div>
        </div>

        <div style="margin-top:24px;">
          ${kprCalculator(p.price, !!p.subsidized, Number(settings.kpr_subsidi_dp_default) || 1, Number(settings.kpr_subsidi_bunga_default) || 5)}
        </div>

        ${
          p.subsidized && settings.kpr_subsidi_syarat
            ? `<div style="margin-top:24px; background:#fff; border:2px solid var(--line); border-radius:20px; padding:22px;">
                <div class="eyebrow">Info Penting</div>
                <h3 class="serif" style="font-size:18px; margin:8px 0 12px;">Syarat KPR Subsidi</h3>
                <p style="font-size:13.5px; color:var(--ink); white-space:pre-line; line-height:1.8;">${esc(settings.kpr_subsidi_syarat)}</p>
              </div>`
            : ""
        }
      </div>
    </div>
  </div>
  <style>@media(max-width:800px){ #detail-grid{ grid-template-columns:1fr !important; } }</style>
  `;

  return c.html(
    baseLayout({
      title: p.title,
      siteName,
      body,
      waNumber: wa,
      waGreeting: settings.whatsapp_greeting,
      theme,
      settings,
      description: p.description || `${p.type} ${p.location ? "di " + p.location : ""} - ${formatRupiah(p.price)}`,
      ogImage: p.cover_image ? `${new URL(c.req.url).origin}/media/${p.cover_image}` : "",
      canonicalUrl: new URL(c.req.url).origin + "/properti/" + p.slug,
    })
  );
});
