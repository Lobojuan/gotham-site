// Gotham Consult × Carlson Capital — CRM back office
// Routes:
//   POST /api/register        public — save a registration
//   POST /api/admin/login     admin  — password -> bearer token (12h)
//   GET  /api/admin/list      admin  — list registrations (?status=&q=)
//   PATCH /api/admin/reg/:ref admin  — update payment/status/notes
//   DELETE /api/admin/reg/:ref admin — delete a row
//   GET  /api/admin/stats     admin  — counts + revenue by currency/status
//   GET  /api/admin/export.csv admin — CSV export
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === "OPTIONS") return cors(request, new Response(null, { status: 204 }));
      if (path === "/api/register" && request.method === "POST") return await saveReg(request, env);
      if (path === "/api/admin/login" && request.method === "POST") return await login(request, env);
      if (!(await gate(request, env))) return json({ ok: false, error: "unauthorized" }, 401);
      if (path === "/api/admin/list" && request.method === "GET") return await listRegs(url, env);
      if (path.startsWith("/api/admin/reg/") && request.method === "PATCH") return await patchReg(path, request, env);
      if (path.startsWith("/api/admin/reg/") && request.method === "DELETE") return await delReg(path, env);
      if (path === "/api/admin/stats" && request.method === "GET") return await stats(env);
      if (path === "/api/admin/export.csv" && request.method === "GET") return await exportCsv(url, env);
      return json({ ok: false, error: "not_found" }, 404);
    } catch (e) {
      return json({ ok: false, error: "server_error", detail: String(e && e.message || e) }, 500);
    }
  },
};

const ALLOWED = [
  "https://gotham-site.pages.dev",
  "https://gotham-site.netlify.app",
  "http://localhost:7100",
  "http://127.0.0.1:7100",
];

function cors(request, res) {
  const o = request.headers.get("Origin") || "";
  if (ALLOWED.includes(o) || o.endsWith(".netlify.app")) res.headers.set("Access-Control-Allow-Origin", o);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}
function json(data, status = 200, request) {
  const res = new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  return request ? cors(request, res) : res;
}

// ---------- public ----------
async function saveReg(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400, request); }
  const s = (v, n = 300) => String(v == null ? "" : v).slice(0, n).trim();
  const ref = s(b.ref, 40) || ("G-" + Date.now().toString(36).toUpperCase());
  const qty = Math.max(1, parseInt(b.qty) || 1);
  const unit = parseFloat(b.unit_price) || 0;
  const total = parseFloat(b.total) || unit * qty;
  const cur = s(b.currency, 8) || "USD";
  const email = s(b.email, 120);
  if (!s(b.company) || !s(b.name) || !email || !s(b.phone)) return json({ ok: false, error: "missing_fields" }, 400, request);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: "bad_email" }, 400, request);
  await env.DB.prepare(
    `INSERT INTO registrations (ref,item_id,item_title,item_sub,qty,unit_price,total,currency,payment_method,company,reg_no,name,role,email,phone,country,sector,guests,txn_ref,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new')
     ON CONFLICT(ref) DO UPDATE SET qty=excluded.qty,total=excluded.total,payment_method=excluded.payment_method,
       company=excluded.company,reg_no=excluded.reg_no,name=excluded.name,role=excluded.role,email=excluded.email,
       phone=excluded.phone,country=excluded.country,sector=excluded.sector,guests=excluded.guests,txn_ref=excluded.txn_ref,
       updated_at=datetime('now')`
  ).bind(ref, s(b.item_id, 20), s(b.item_title, 200), s(b.item_sub, 300), qty, unit, total, cur,
    s(b.payment_method, 60), s(b.company, 200), s(b.reg_no, 60), s(b.name, 120), s(b.role, 120),
    email, s(b.phone, 60), s(b.country, 80), s(b.sector, 120), s(b.guests, 1000), s(b.txn_ref, 120)
  ).run();
  return json({ ok: true, ref }, 200, request);
}

// ---------- auth ----------
async function login(request, env) {
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400, request); }
  const pw = String(b.password || "");
  const okPw = env.ADMIN_PASSWORD && pw.length > 0 && await eq(pw, env.ADMIN_PASSWORD);
  if (!okPw) return json({ ok: false, error: "wrong_password" }, 401, request);
  const exp = Date.now() + 12 * 3600 * 1000;
  const salt = crypto.randomUUID();
  const sig = await sign(`${exp}.${salt}`, env.TOKEN_SECRET);
  return json({ ok: true, token: `${exp}.${salt}.${sig}`, expires: exp }, 200, request);
}
function authed(request, env) {
  const h = request.headers.get("Authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [exp, salt, sig] = t.split(".");
  if (!exp || !salt || !sig || Number(exp) < Date.now()) return null;
  return { exp: Number(exp) };
}
async function gate(request, env) {
  const h = request.headers.get("Authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [exp, salt, sig] = t.split(".");
  if (!exp || !salt || !sig || Number(exp) < Date.now()) return false;
  return await eq(sig, await sign(`${exp}.${salt}`, env.TOKEN_SECRET));
}
async function sign(msg, secret) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const b = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function eq(a, b) {
  const ba = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  if (ba.length !== bb.length) return false;
  let d = 0; for (let i = 0; i < ba.length; i++) d |= ba[i] ^ bb[i];
  return d === 0;
}

// ---------- admin ----------
async function requireAdmin(request, env) {
  if (!(await gate(request, env))) return null;
  return true;
}
async function listRegs(url, env) {
  const q = (url.searchParams.get("q") || "").trim();
  const st = (url.searchParams.get("status") || "").trim();
  let sql = "SELECT * FROM registrations"; const cond = [], args = [];
  if (st) { cond.push("status=?"); args.push(st); }
  if (q) { cond.push("(ref LIKE ? OR company LIKE ? OR name LIKE ? OR email LIKE ?)"); const like = `%${q}%`; args.push(like, like, like, like); }
  if (cond.length) sql += " WHERE " + cond.join(" AND ");
  sql += " ORDER BY created_at DESC LIMIT 500";
  const r = await env.DB.prepare(sql).bind(...args).all();
  return json({ ok: true, rows: r.results || [] });
}
async function patchReg(path, request, env) {
  const ref = decodeURIComponent(path.split("/").pop());
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const fields = ["status", "amount_received", "received_currency", "received_method", "txn_ref", "notes"];
  const sets = [], args = [];
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f}=?`); args.push(typeof b[f] === "number" ? b[f] : String(b[f]).slice(0, 1500)); }
  if (!sets.length) return json({ ok: false, error: "nothing_to_update" }, 400);
  sets.push("updated_at=datetime('now')");
  const r = await env.DB.prepare(`UPDATE registrations SET ${sets.join(",")} WHERE ref=?`).bind(...args, ref).run();
  if (!r.meta.changes) return json({ ok: false, error: "not_found" }, 404);
  const row = await env.DB.prepare("SELECT * FROM registrations WHERE ref=?").bind(ref).first();
  return json({ ok: true, row });
}
async function delReg(path, env) {
  const ref = decodeURIComponent(path.split("/").pop());
  await env.DB.prepare("DELETE FROM registrations WHERE ref=?").bind(ref).run();
  return json({ ok: true });
}
async function stats(env) {
  const byStatus = await env.DB.prepare("SELECT status, COUNT(*) n, SUM(total) total, currency FROM registrations GROUP BY status, currency").all();
  const received = await env.DB.prepare("SELECT received_currency currency, SUM(amount_received) got FROM registrations WHERE amount_received>0 GROUP BY received_currency").all();
  const total = await env.DB.prepare("SELECT COUNT(*) n FROM registrations").first();
  return json({ ok: true, total: total.n, byStatus: byStatus.results || [], received: received.results || [] });
}
async function exportCsv(url, env) {
  const r = await env.DB.prepare("SELECT * FROM registrations ORDER BY created_at DESC").all();
  const cols = ["ref", "created_at", "status", "item_title", "qty", "total", "currency", "amount_received", "received_currency", "received_method", "txn_ref", "payment_method", "company", "reg_no", "name", "role", "email", "phone", "country", "sector", "guests", "notes", "updated_at"];
  const esc = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const csv = [cols.join(",")].concat((r.results || []).map(row => cols.map(c => esc(row[c])).join(","))).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=gotham-registrations.csv" } });
}
