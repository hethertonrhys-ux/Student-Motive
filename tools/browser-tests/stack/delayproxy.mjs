// Sits between the app and the fake Supabase, adding a fixed delay to every
// request and logging each one, so we can count and time database trips.
import http from 'http'; import fs from 'fs';
const DELAY = Number(process.env.DELAY ?? 80); const LOG = process.env.LOG;
// The Expo web build calls this straight from the browser, so answer CORS like Supabase does.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, x-supabase-api-version, prefer, range, accept, accept-profile, content-profile, cache-control, x-upsert', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'access-control-expose-headers': 'content-range, x-supabase-api-version' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const t0 = Date.now(); const chunks = [];
  req.on('data', c => chunks.push(c)); req.on('end', () => setTimeout(() => {
    const up = http.request({ host: '127.0.0.1', port: 54321, path: req.url, method: req.method, headers: req.headers }, r => {
      res.writeHead(r.statusCode, { ...r.headers, ...CORS }); r.pipe(res);
      r.on('end', () => fs.appendFileSync(LOG, `${t0} ${Date.now() - t0}ms ${req.method} ${req.url.split('?')[0]}\n`));
    });
    up.on('error', e => { res.writeHead(502); res.end(String(e)); });
    up.end(Buffer.concat(chunks));
  }, DELAY));
}).listen(Number(process.env.PORT ?? 54400));
