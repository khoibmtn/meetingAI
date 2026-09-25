// Cổng Supabase giả lập cho kiểm thử e2e cục bộ (KHÔNG dùng production).
//  - /rest/v1/*  → chuyển tiếp tới PostgREST (RLS thật trên PostgreSQL)
//  - /auth/v1/*  → mô phỏng GoTrue tối thiểu: đăng nhập mật khẩu, lấy user, refresh, logout
// Chạy: JWT_SECRET=... POSTGREST_URL=http://127.0.0.1:3001 DATABASE_URL=... node tests/e2e/gateway.mjs
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const SECRET = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters";
const POSTGREST = process.env.POSTGREST_URL ?? "http://127.0.0.1:3001";
const DB = process.env.DATABASE_URL;
const PASSWORD = process.env.E2E_PASSWORD ?? "matkhau123";

const b64u = (b) => Buffer.from(b).toString("base64url");
export function signJwt(payload, secret = SECRET) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, p, s] = (token ?? "").split(".");
  if (!h || !p || !s) return null;
  const expect = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (expect !== s) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}

function sql(query) {
  const out = execFileSync("psql", [DB, "-At", "-c", query], { encoding: "utf8" });
  return out.trim();
}
function findUserByEmail(email) {
  const row = sql(`select row_to_json(u) from auth.users u where lower(email) = lower('${email.replace(/'/g, "''")}')`);
  return row ? JSON.parse(row) : null;
}
function findUserById(id) {
  const row = sql(`select row_to_json(u) from auth.users u where id = '${id.replace(/'/g, "''")}'`);
  return row ? JSON.parse(row) : null;
}
function userJson(u) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: crypto.randomUUID() });
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: b64u(`${u.id}:${crypto.randomUUID()}`), user: userJson(u) };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    });
    return res.end();
  }
  try {
    if (url.pathname.startsWith("/rest/v1/")) {
      const target = `${POSTGREST}${url.pathname.replace("/rest/v1", "")}${url.search}`;
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (["host", "connection", "content-length"].includes(k)) continue;
        headers[k] = v;
      }
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
      const r = await fetch(target, { method: req.method, headers, body });
      const out = Buffer.from(await r.arrayBuffer());
      const h = { "Access-Control-Allow-Origin": "*" };
      r.headers.forEach((v, k) => {
        if (!["content-encoding", "transfer-encoding", "connection"].includes(k) && !k.startsWith("access-control-")) h[k] = v;
      });
      res.writeHead(r.status, h);
      return res.end(out);
    }
    if (url.pathname === "/auth/v1/token") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const u = findUserByEmail(body.email ?? "");
        if (!u || body.password !== PASSWORD) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
        return send(res, 200, session(u));
      }
      if (grant === "refresh_token") {
        const id = Buffer.from(body.refresh_token ?? "", "base64url").toString().split(":")[0];
        const u = id ? findUserById(id) : null;
        if (!u) return send(res, 400, { error: "invalid_grant", msg: "Invalid Refresh Token" });
        return send(res, 200, session(u));
      }
      return send(res, 400, { error: "unsupported_grant_type" });
    }
    if (url.pathname === "/auth/v1/user") {
      const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const claims = verifyJwt(token);
      if (!claims || claims.role !== "authenticated") return send(res, 401, { code: 401, msg: "invalid JWT" });
      const u = findUserById(claims.sub);
      return u ? send(res, 200, userJson(u)) : send(res, 404, { msg: "User not found" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(res, 200, { keys: [] });
    if (url.pathname === "/auth/v1/settings") return send(res, 200, { external: { email: true, google: true } });
    return send(res, 404, { msg: `not mocked: ${url.pathname}` });
  } catch (err) {
    console.error(err);
    return send(res, 500, { msg: String(err) });
  }
});

// Khoá cố định (iat cố định) → biết trước để build ứng dụng với NEXT_PUBLIC_* tương ứng
const ANON_KEY = signJwt({ role: "anon", iss: "supabase-e2e", iat: 1700000000, exp: 4102444800 });
const SERVICE_KEY = signJwt({ role: "service_role", iss: "supabase-e2e", iat: 1700000000, exp: 4102444800 });

if (process.argv.includes("--print-keys")) {
  console.log(`ANON_KEY=${ANON_KEY}`);
  console.log(`SERVICE_KEY=${SERVICE_KEY}`);
} else {
  server.listen(PORT, () => {
    console.log(`gateway http://127.0.0.1:${PORT}`);
    console.log(`ANON_KEY=${ANON_KEY}`);
    console.log(`SERVICE_KEY=${SERVICE_KEY}`);
  });
}
