// Expo web build: Recommended events. The All | Recommended switch under the
// search box on the Societies tab (society events: your society first, then
// a friend going, popular/same uni; events you've joined left out) and on the
// Social tab (a friend hosting first; plans you've joined left out; search
// still narrows the recommended list). Logged out: no switch.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); } if (p.url().includes('/welcome')) { await p.getByTestId('skip').click(); await p.waitForURL('**/map'); }
}
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003';
const ids = (loc) => loc.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));

// Seed: Sam is an approved member of the Poker Society and friends with Bea (not Cas).
const lse = sql(`select id from societies where slug='lse-poker-society'`);
sql(`insert into societies (slug,name,university) values ('rec-econ','LSE Economics Society','LSE'),('rec-ucl','UCL Debating','UCL') on conflict (slug) do nothing`);
const econ = sql(`select id from societies where slug='rec-econ'`), ucl = sql(`select id from societies where slug='rec-ucl'`);
const venue = sql(`select id from venues limit 1`);
sql(`delete from events where title like 'Rec %'; delete from social_events where title like 'Rec %'`);
sql(`delete from society_admins where user_id='${U1}'; delete from society_members where user_id='${U1}'; insert into society_members (society_id,user_id,status,approved_at) values ('${lse}','${U1}','approved',now())`);
sql(`delete from friendships where requester_id in ('${U1}','${U2}','${U3}') and addressee_id in ('${U1}','${U2}','${U3}'); insert into friendships (requester_id,addressee_id,status,responded_at) values ('${U1}','${U2}','accepted',now())`);
const mk = (soc, title, aud, start) => sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${soc}','${title}','social','${venue}',${start},${start}+interval '3 hours','${aud}') returning id`).split('\n')[0];
const e1 = mk(lse, 'Rec Poker Night', 'uni', "now()+interval '2 days'");     // your society
const e2 = mk(econ, 'Rec Econ Talk', 'uni', "now()+interval '3 days'");      // a friend (Bea) is going
const e3 = mk(ucl, 'Rec UCL Open', 'london', "now()+interval '4 days'");     // nothing special
const e4 = mk(econ, 'Rec Already Going', 'uni', "now()+interval '5 days'");  // Sam is going: left out
sql(`insert into event_entries (event_id,user_id,status) values ('${e2}','${U2}','going'),('${e4}','${U1}','going')`);
const social = (host, title, days) => sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('${host}','${title}','social',now()+interval '${days} days',now()+interval '${days} days 2 hours','Soho',51.513,-0.132,8) returning id`).split('\n')[0];
const s1 = social(U2, 'Rec Bea Social', 2);   // a friend is hosting
const s2 = social(U3, 'Rec Cas Social', 3);   // same uni, no friends
const s3 = social(U3, 'Rec Joined Social', 4); sql(`insert into social_event_members (event_id,user_id,status) values ('${s3}','${U1}','going')`); // joined: left out

// 1. Societies tab: the switch, then the recommended list in the right order with its reasons.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/societies');
await p.getByTestId('societies-mode').waitFor({ timeout: 20000 }); await p.getByTestId('all-society').waitFor({ timeout: 20000 }); await p.getByTestId(`event-${e1}`).waitFor({ timeout: 20000 });
const allOrder = await ids(p.getByTestId('all-society').locator('[data-testid^="event-"]')); say('all events (soonest first):', allOrder.map((x) => ({ [`event-${e1}`]: 'poker', [`event-${e2}`]: 'econ', [`event-${e3}`]: 'ucl', [`event-${e4}`]: 'going' })[x] ?? x));
check(allOrder[0] === `event-${e1}` && allOrder[1] === `event-${e2}` && allOrder[2] === `event-${e3}` && !allOrder.includes(`event-${e4}`) && (await p.getByTestId('recommend-note').count()) === 0, 'all mode: every upcoming event, soonest first, no notes');
await p.getByTestId('societies-mode-recommended').click(); await p.getByTestId('recommended-society').waitFor({ timeout: 20000 }); await p.getByTestId(`event-${e1}`).waitFor({ timeout: 20000 });
const order = await ids(p.getByTestId('recommended-society').locator('[data-testid^="event-"]')); say('society order:', order.map((x) => ({ [`event-${e1}`]: 'poker', [`event-${e2}`]: 'econ', [`event-${e3}`]: 'ucl', [`event-${e4}`]: 'going' })[x] ?? x));
check(order[0] === `event-${e1}` && order[1] === `event-${e2}` && !order.includes(`event-${e3}`) && !order.includes(`event-${e4}`), 'society order (UCL event has no reason, so it is not recommended)');
const n1 = await p.getByTestId(`event-${e1}`).getByTestId('recommend-note').innerText(), n2 = await p.getByTestId(`event-${e2}`).getByTestId('recommend-note').innerText();
say('notes:', n1, '|', n2); check(/Your society/.test(n1), 'note: your society'); check(/1 friend going/.test(n2), 'note: friend going');
await p.screenshot({ path: S + '/expo-recommended-societies.png', fullPage: true });
await p.getByTestId('societies-mode-all').click(); await p.getByTestId('all-society').waitFor({ timeout: 5000 }); check((await p.getByTestId('recommended-society').count()) === 0, 'back to all');

// 2. Social tab: Bea's plan first, Cas's there, the joined one left out; search narrows within Recommended.
await p.goto(BASE + '/social'); await p.getByTestId('social-mode').waitFor({ timeout: 20000 }); await p.getByTestId('social-mode-recommended').click();
await p.getByTestId(`social-${s1}`).waitFor({ timeout: 20000 });
const sorder = await ids(p.getByTestId('social-list').locator('[data-testid^="social-"]')); say('social order:', sorder.map((x) => ({ [`social-${s1}`]: 'bea', [`social-${s2}`]: 'cas', [`social-${s3}`]: 'joined' })[x] ?? x));
check(sorder[0] === `social-${s1}` && sorder.includes(`social-${s2}`) && !sorder.includes(`social-${s3}`), 'social order');
const sn = await p.getByTestId(`social-${s1}`).getByTestId('recommend-note').innerText(), sn2 = await p.getByTestId(`social-${s2}`).getByTestId('recommend-note').innerText(); say('social notes:', sn, '|', sn2); check(/A friend is hosting/.test(sn) && !/At LSE/.test(sn), 'note: friend hosting'); check(/LSE student hosting/.test(sn2), 'note: uni fallback');
await p.getByTestId('social-search').fill('Cas'); await p.waitForTimeout(400); check((await p.getByTestId(`social-${s1}`).count()) === 0 && (await p.getByTestId(`social-${s2}`).count()) === 1, 'search narrows recommended');
await p.screenshot({ path: S + '/expo-recommended-social.png', fullPage: true });
await p.getByTestId('social-search').fill(''); await p.getByTestId('social-mode-all').click(); await p.getByTestId(`social-${s3}`).waitFor({ timeout: 15000 }); say('All mode shows the joined plan again');

// 3. Logged out: Discover works, no switch.
const q = await fresh(); await q.goto(BASE + '/social'); await q.getByTestId('social-list').waitFor({ timeout: 20000 }); await q.waitForTimeout(500);
check((await q.getByTestId('social-mode').count()) === 0, 'no switch logged out');
console.log('errors:', errs); await b.close();
