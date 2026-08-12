import { Hono } from "hono";
import { publicRoutes } from "./routes/public.js";
import { adminRoutes } from "./routes/admin.js";

const app = new Hono();

app.route("/", publicRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => c.text("404 - Halaman tidak ditemukan", 404));

export default app;
