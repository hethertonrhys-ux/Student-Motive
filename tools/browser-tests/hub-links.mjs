// Expo web build: Society Hub links (the pre-build changes,
// 20261123000000_hub_push_links.sql). The three Society Hub pushes open the
// Hub: "You're now a manager" (/hub/<id>, "Open the Society Hub to see it."),
// "Your feature request is live" (/hub/<id>/requests) and the weekly
// Founding nudge (/hub/<id>), and each link opens the right screen for the
// person it's sent to. (The event admin checklist reminders still open the
// event's manage screen: covered by the database tests.) Logged out, /hub,
// /hub/<id> and /hub/<id>/requests ask you to log in and then come back.
// The website serves the universal links file with the claim and Hub paths
// added and the old ones kept.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh() { const c = await b.newContext({ ...devices['iPhone 13'] }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
const v = (pg, id) => pg.getByTestId(id).filter({ visible: true });
const text = async (p, id) => (await v(p, id).innerText()).replace(/\s+/g, ' ').trim();
async function fillCode(p, email) {
  await v(p, 'email').fill(email); await v(p, 'send-code').click();
  await v(p, 'code').waitFor({ timeout: 15000 }); await v(p, 'code').fill('123456'); await v(p, 'log-in').click();
}
async function login(p, email) {
  await p.goto(BASE + '/login'); await fillCode(p, email);
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await v(p, 'full-name').fill('Test Person'); await v(p, 'graduation-year').click(); await v(p, 'graduation-year-2027').click(); await v(p, 'save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002';

// Seed: a society only Sam manages; Sam and Bea have phones set up for pushes.
const poker = sql(`select id from societies where slug='lse-poker-society'`);
const pokerManagers = sql(`select string_agg(user_id::text, ',' order by user_id) from society_admins where society_id='${poker}'`);
sql(`delete from societies where slug='hub-links-society'; delete from society_admins where user_id in ('${U1}','${U2}'); update profiles set is_admin=false where id in ('${U1}','${U2}')`);
const soc = sql(`insert into societies (slug,name,university) values ('hub-links-society','Hub Links Society','LSE') returning id`);
sql(`insert into society_admins (society_id,user_id) values ('${soc}','${U1}')`);
sql(`insert into push_tokens (user_id, platform, token) values ('${U1}','ios','ExponentPushToken[links-sam]'), ('${U2}','ios','ExponentPushToken[links-bea]') on conflict (token) do nothing; delete from notification_settings where user_id in ('${U1}','${U2}'); delete from push_queue`);

// 1. The website serves the universal links file: the old paths kept, claim links and the Hub added.
const res = await fetch(BASE + '/.well-known/apple-app-site-association');
const aasa = JSON.parse(await res.text()); const d = aasa.applinks.details[0]; const components = d.components.map((c) => c['/']);
for (const path of ['/e/*', '/s/*', '/social/*', '/u/*', '/claim/*', '/hub', '/hub/*']) check(d.paths.includes(path) && components.includes(path), 'the universal links include ' + path);
say('universal link paths:', d.paths.join(' '));

// 2. Sam adds Bea as a manager: her push opens the society's Hub, and the link shows it.
sql(`select set_config('request.jwt.claim.sub', '${U1}', false); select public.add_society_manager('${soc}', '${U2}')`);
const added = sql(`select title||'|'||body||'|'||url from push_queue where user_id='${U2}' and kind='hub'`);
say('manager push:', added.replace(soc, '<soc>'));
check(added === `You're now a manager of Hub Links Society|Open the Society Hub to see it.|/hub/${soc}`, 'the "now a manager" push opens the Hub and says so: ' + added);
const bea = await fresh(); await login(bea, 's2@lse.ac.uk');
await bea.goto(BASE + added.split('|')[2]); await v(bea, 'hub-card-page').waitFor({ timeout: 20000 });
check((await text(bea, 'hub-card-page')).includes('Hub Links Society'), 'the link opens the society\'s Hub for Bea');
check(bea.url() === `${BASE}/hub/${soc}`, 'Bea stays on the Hub: ' + bea.url());

// 3. Sam's feature request goes live: each manager's push opens the Hub's Requests page.
const req = sql(`insert into feature_requests (society_id, requested_by, need) values ('${soc}','${U1}','Raffle tickets at the door') returning id`);
sql(`update feature_requests set status='live' where id='${req}'`);
const live = sql(`select string_agg(url, ',') from push_queue where dedupe_key like 'request-live:${req}:%'`);
say('request live pushes:', live.replaceAll(soc, '<soc>'));
check(live === `/hub/${soc}/requests,/hub/${soc}/requests`, 'Sam and Bea each get a push opening the Hub\'s Requests page: ' + live);
const sam = await fresh(); await login(sam, 's1@lse.ac.uk');
await sam.goto(BASE + `/hub/${soc}/requests`); await v(sam, `request-${req}`).waitFor({ timeout: 20000 });
check((await text(sam, `request-state-${req}`)) === 'Live', 'the link opens the Requests page with the request shown as Live: ' + await text(sam, `request-state-${req}`));

// 4. The weekly Founding nudge opens the society's Hub.
sql(`update societies set is_founding=true where id='${soc}'; insert into founding_agreements (society_id, agreed_by, agreed_at) values ('${soc}','${U1}', now() - interval '10 days')`);
sql(`select public.queue_hub_reminders()`);
const nudge = sql(`select url from push_queue where user_id='${U1}' and dedupe_key like 'founding-nudge:${soc}:%'`);
check(nudge === `/hub/${soc}`, 'Sam\'s Founding nudge opens the society\'s Hub: ' + nudge);
await sam.goto(BASE + nudge); await v(sam, 'hub-card-page').waitFor({ timeout: 20000 });
check((await text(sam, 'hub-card-page')).includes('Hub Links Society'), 'the nudge\'s link opens the Hub for Sam');
check(sql(`select count(*) from push_queue where kind='hub' and url like '/dashboard/%'`) === '0', 'no Society Hub push here opens the dashboard');

// 5. Logged out, each Hub link asks you to log in and comes back to it.
for (const [path, email, landed, ready] of [
  [`/hub/${soc}/requests`, 's1@lse.ac.uk', `/hub/${soc}/requests`, `request-${req}`],
  [`/hub/${soc}`, 's2@lse.ac.uk', `/hub/${soc}`, 'hub-card-page'],
  ['/hub', 's2@lse.ac.uk', `/hub/${soc}`, 'hub-card-page'], // Bea manages one society: /hub goes straight to it
]) {
  const o = await fresh(); await o.goto(BASE + path); await v(o, 'hub-login').waitFor({ timeout: 20000 });
  await v(o, 'hub-login-button').click(); await o.waitForURL(/\/login/, { timeout: 15000 });
  check(decodeURIComponent(o.url()).includes(`next=${path}`), `logged out on ${path.replace(soc, '<soc>')}: logging in will come back (${decodeURIComponent(o.url()).replace(BASE, '')})`);
  await fillCode(o, email);
  await o.waitForURL((u) => u.pathname === landed, { timeout: 30000 }); await v(o, ready).waitFor({ timeout: 20000 });
  say('logged out on', path.replace(soc, '<soc>'), '-> logged in as', email, '-> back on', o.url().replace(BASE, '').replace(soc, '<soc>'));
  await o.context().close();
}

// The live societies are untouched.
check(sql(`select string_agg(user_id::text, ',' order by user_id) from society_admins where society_id='${poker}'`) === pokerManagers, 'LSE Poker Society\'s managers are unchanged');

console.log('errors:', errs); await b.close();
