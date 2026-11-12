// Fake Supabase gateway for local end-to-end tests only.
// /rest/v1/* -> PostgREST; /auth/v1/* -> a tiny pretend auth service.
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const SECRET = process.env.FAKE_AUTH_HS256_SECRET ?? "local-test-only-change-me"; // local test stack only
const USERS = {
  "committee@lse.ac.uk": "00000000-0000-0000-0000-00000000000c",
  "s1@lse.ac.uk": "00000000-0000-0000-0000-000000000001",
  "s2@lse.ac.uk": "00000000-0000-0000-0000-000000000002",
  "s3@lse.ac.uk": "00000000-0000-0000-0000-000000000003",
  "s4@lse.ac.uk": "00000000-0000-0000-0000-000000000004",
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
// Tokens are signed like a current Supabase project: ES256 with a key id,
// and the public key is published at /auth/v1/.well-known/jwks.json.
import fs from "node:fs";
const DIR = new URL(".", import.meta.url).pathname;
const PRIVATE = crypto.createPrivateKey(fs.readFileSync(DIR + "es256-private.pem"));
const JWKS = fs.readFileSync(DIR + "jwks-public.json", "utf8");
export function sign(payload) {
  const h = b64({ alg: "ES256", typ: "JWT", kid: "test-es256" }), p = b64(payload);
  return `${h}.${p}.${crypto.sign("sha256", Buffer.from(`${h}.${p}`), { key: PRIVATE, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
// When each account was made: seeded test users long ago, new sign-ups now (like real Supabase).
const CREATED = {};
const userFor = (email) => ({ id: USERS[email], aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: CREATED[email] ?? "2026-01-01T00:00:00Z" });
const session = (email) => ({ access_token: sign({ sub: USERS[email], role: "authenticated", email, aud: "authenticated", exp }), refresh_token: "r-" + email, token_type: "bearer", expires_in: 86400 * 30, expires_at: exp, user: userFor(email) });

const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

const FILES = new Map();
const readRaw = (req) => new Promise((r) => { const d = []; req.on("data", (c) => d.push(c)); req.on("end", () => r(Buffer.concat(d))); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  // Minimal storage stand-in for tests: upload, list, remove, public download.
  if (url.pathname.startsWith("/storage/v1/object")) {
    const rest = url.pathname.slice("/storage/v1/object/".length);
    if (rest.startsWith("public/")) {
      const f = FILES.get(rest.slice(7));
      if (!f) return json(res, 404, {});
      res.writeHead(200, { "content-type": f.type, "access-control-allow-origin": "*", "cache-control": "no-store" }); return res.end(f.data);
    }
    if (rest.startsWith("sign/")) {
      const key = rest.slice(5);
      if (req.method === "GET") { const f = FILES.get(key); if (!f) return json(res, 404, {}); res.writeHead(200, { "content-type": f.type, "access-control-allow-origin": "*", "cache-control": "no-store" }); return res.end(f.data); }
      const body = JSON.parse((await readBody(req)) || "{}");
      if (body.paths) return json(res, 200, body.paths.map((p) => ({ path: p, signedURL: `/object/sign/${key}/${p}?token=t`, error: null })));
      return json(res, 200, { signedURL: `/object/sign/${key}?token=t` });
    }
    if (rest.startsWith("list/")) {
      const bucket = rest.slice(5); const { prefix } = JSON.parse((await readBody(req)) || "{}");
      const names = [...FILES.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}/`)).map((k) => ({ name: k.split("/").pop() }));
      return json(res, 200, names);
    }
    if (req.method === "DELETE") {
      const { prefixes } = JSON.parse((await readBody(req)) || "{}");
      for (const p of prefixes ?? []) FILES.delete(`${rest}/${p}`);
      return json(res, 200, []);
    }
    let data = await readRaw(req); let type = req.headers["content-type"] || "application/octet-stream";
    const m = /boundary=(.+)$/.exec(type);
    if (m) { // supabase-js sends files as multipart form data: pull out the file part
      const boundary = Buffer.from("--" + m[1]); const parts = [];
      let i = data.indexOf(boundary);
      while (i !== -1) { const j = data.indexOf(boundary, i + boundary.length); if (j === -1) break; parts.push(data.subarray(i + boundary.length, j)); i = j; }
      const file = parts.map((pt) => { const h = pt.indexOf("\r\n\r\n"); return { head: pt.subarray(0, h).toString(), body: pt.subarray(h + 4, pt.length - 2) }; }).find((pt) => /filename=|content-type/i.test(pt.head) && pt.body.length > 100);
      if (file) { data = file.body; type = (/content-type:\s*(\S+)/i.exec(file.head) || [, "image/jpeg"])[1]; }
    }
    FILES.set(rest, { data, type });
    return json(res, 200, { Key: rest });
  }
  if (url.pathname.startsWith("/rest/v1")) {
    const body = await readBody(req);
    const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
    // Real Supabase treats the publishable key as "logged out" (anon); only pass real login tokens on.
    if (headers.authorization && (headers.authorization.split(" ")[1] || "").split(".").length !== 3) delete headers.authorization;
    let upstream;
    try {
      upstream = await fetch("http://localhost:3001" + url.pathname.slice(8) + url.search, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    } catch { return json(res, 503, { message: "database restarting" }); }
    const out = Buffer.from(await upstream.arrayBuffer());
    const h = {}; upstream.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) h[k] = v; });
    res.writeHead(upstream.status, h); return res.end(out);
  }
  if (url.pathname === "/auth/v1/otp") {
    const { email } = JSON.parse((await readBody(req)) || "{}");
    // Like Supabase's shouldCreateUser: the account is made now, and the
    // database's sign-up rule (check_signup_email) decides who's allowed.
    if (!USERS[email]) {
      const id = crypto.randomUUID();
      try {
        execFileSync("psql", ["-h", "/var/tmp/motivepg", "-p", "5499", "-U", "postgres", "-d", "e2e", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", `insert into auth.users (id, email) values ('${id}', '${email}')`], { stdio: "pipe" });
      } catch { return json(res, 500, { code: 500, msg: "Database error saving new user" }); }
      USERS[email] = id;
      CREATED[email] = new Date().toISOString();
    }
    return json(res, 200, {});
  }
  if (url.pathname === "/auth/v1/verify") {
    const { email } = JSON.parse((await readBody(req)) || "{}");
    // Sign-up: a new@ address gets a fresh account, like Supabase's shouldCreateUser.
    if (!USERS[email] && /^new\d*@lse\.ac\.uk$/.test(email)) {
      const id = crypto.randomUUID();
      execFileSync("psql", ["-h", "/var/tmp/motivepg", "-p", "5499", "-U", "postgres", "-d", "e2e", "-qAt", "-c", `insert into auth.users (id, email) values ('${id}', '${email}')`]);
      USERS[email] = id;
      CREATED[email] = new Date().toISOString();
    }
    if (!USERS[email]) return json(res, 400, { code: 400, msg: "Token has expired or is invalid" });
    return json(res, 200, session(email));
  }
  if (url.pathname === "/auth/v1/user") {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      if (payload.role !== "authenticated") throw 0;
      return json(res, 200, userFor(payload.email));
    } catch { return json(res, 401, { code: 401, msg: "invalid JWT" }); }
  }
  if (url.pathname === "/auth/v1/.well-known/jwks.json") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JWKS); }
  if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
  json(res, 404, { msg: "not faked: " + url.pathname });
}).listen(54321, () => console.log("fake supabase on 54321"));
