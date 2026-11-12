// The link-preview function against the stand-in backend: an event with an image, a society, a social, and a bad id.
import { createRequire } from 'module'; import { execSync } from 'child_process';
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
for (const line of (await import('fs')).readFileSync('/home/user/student-motive/apps/mobile/.env', 'utf8').split('\n')) { const m = line.match(/^(\w+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
process.env.EXPO_PUBLIC_SITE_URL = 'https://studentfunction.com';
const handler = createRequire(import.meta.url)('/home/user/student-motive/apps/mobile/api/preview.js');
async function call(path) { let status = 200, body = ''; const headers = {}; await handler({ query: { path } }, { setHeader: (k, v) => (headers[k] = v), status: (s) => ({ send: (b) => { status = s; body = b; } }) }); return { status, body, headers }; }
// A society event anyone can see (audience 'all'), with a picture, just for this test; put back after.
const eid = sql("select id from events where society_id is not null and not is_hidden order by starts_at desc limit 1"), sid = sql("select id from social_events limit 1");
const before = sql(`select audience||'|'||coalesce(image_url,'') from events where id='${eid}'`);
sql(`update events set audience='london', image_url='https://example.com/pic.jpg' where id='${eid}'`);
for (const p of [`/e/${eid}`, '/s/bankside-house', `/social/${sid}`, '/e/not-a-uuid', '/s/nope', '/weird']) {
  const r = await call(p); const t = (r.body.match(/<title>([^<]*)/) || [])[1]; const d = (r.body.match(/og:description" content="([^"]*)/) || [])[1]; const i = (r.body.match(/og:image" content="([^"]*)/) || [])[1];
  console.log('•', p, '->', r.status, '|', t, '|', d, '|', i);
}
const [aud, img] = before.split('|'); sql(`update events set audience='${aud}', image_url=${img ? `'${img}'` : 'null'} where id='${eid}'`);
