// Expo web build: the two personal tick boxes ("Only events my friends are
// hosting", "Only events from societies I'm a member of") behave the same
// on the map, in the map's list view, in the Social tab's search and in
// Recommended; both ticked = either; the choice is remembered; logged out
// they don't appear.
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
const has = async (p, id) => (await p.getByTestId(id).count()) > 0;

// Seed: Sam is friends with Bea and an approved Poker Society member. Four events tonight, all starting "Flt".
const lse = sql(`select id from societies where slug='lse-poker-society'`);
sql(`insert into societies (slug,name,university) values ('flt-econ','LSE Economics Society','LSE') on conflict (slug) do nothing`); const econ = sql(`select id from societies where slug='flt-econ'`);
const venue = sql(`select id from venues limit 1`);
sql(`delete from events where title like 'Flt %'; delete from social_events where title like 'Flt %'`);
sql(`delete from society_admins where user_id='${U1}'; delete from society_members where user_id='${U1}'; insert into society_members (society_id,user_id,status,approved_at) values ('${lse}','${U1}','approved',now())`);
sql(`delete from friendships where requester_id in ('${U1}','${U2}','${U3}') and addressee_id in ('${U1}','${U2}','${U3}'); insert into friendships (requester_id,addressee_id,status,responded_at) values ('${U1}','${U2}','accepted',now())`);
const mk = (soc, title) => sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${soc}','${title}','social','${venue}',now()+interval '1 hour',now()+interval '3 hours','london') returning id`).split('\n')[0];
const poker = mk(lse, 'Flt Poker'), other = mk(econ, 'Flt Econ');
const social = (host, title) => sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('${host}','${title}','social',now()+interval '1 hour',now()+interval '3 hours','Soho',51.513,-0.132,8) returning id`).split('\n')[0];
const bea = social(U2, 'Flt Bea Plan'), cas = social(U3, 'Flt Cas Plan');
const want = async (p, list, label) => { const got = {}; for (const [k, id] of Object.entries(list)) got[k] = await has(p, id); say(label + ':', JSON.stringify(got)); return got; };

// 1. Map: tick "friends hosting" → only Bea's plan; add "my societies" → Bea's and Poker; just societies → Poker.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/map'); await p.getByTestId('filter').waitFor({ timeout: 20000 }); await p.waitForTimeout(1500);
const results = async () => { await p.getByTestId('search').click(); await p.getByTestId('search-input').fill('Flt'); await p.getByTestId('search-results').waitFor({ timeout: 10000 }); await p.waitForTimeout(300); const r = await want(p, { poker: `result-${poker}`, econ: `result-${other}`, bea: `result-${bea}`, cas: `result-${cas}` }, 'map results'); await p.getByTestId('search-cancel').click(); return r; };
let r = await results(); check(r.poker && r.econ && r.bea && r.cas, 'map: all four before filtering');
await p.getByTestId('filter').click(); await p.getByTestId('filter-personal-friendsHosting').click(); await p.getByTestId('filter-done').click();
check((await p.getByTestId('filter-count').innerText()) === '1', 'badge 1');
r = await results(); check(!r.poker && !r.econ && r.bea && !r.cas, 'map: friends hosting only');
await p.getByTestId('filter').click(); await p.getByTestId('filter-personal-mySocieties').click(); await p.getByTestId('filter-done').click();
check((await p.getByTestId('filter-count').innerText()) === '2', 'badge 2');
r = await results(); check(r.poker && !r.econ && r.bea && !r.cas, 'map: either');
await p.getByTestId('filter').click(); await p.getByTestId('filter-personal-friendsHosting').click(); await p.getByTestId('filter-done').click();
r = await results(); check(r.poker && !r.econ && !r.bea && !r.cas, 'map: my societies only');
await p.screenshot({ path: S + '/expo-filters-map.png' });
// 2. Remembered: reload keeps the badge; the list view shares the same box.
await p.reload(); await p.getByTestId('filter').waitFor({ timeout: 20000 }); await p.getByTestId('filter-count').waitFor({ timeout: 10000 }); say('after reload badge:', await p.getByTestId('filter-count').innerText());
await p.getByTestId('show-list').click(); await p.getByTestId('list-personal').waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
check((await p.getByTestId('list-personal-mySocieties').getAttribute('aria-checked')) === 'true', 'list box shares the choice');
r = await want(p, { poker: `event-${poker}`, econ: `event-${other}`, bea: `event-${bea}` }, 'list view'); check(r.poker && !r.econ && !r.bea, 'list view filtered');
await p.getByTestId('list-personal-mySocieties').click(); await p.waitForTimeout(500); r = await want(p, { poker: `event-${poker}`, econ: `event-${other}`, bea: `event-${bea}` }, 'list view unticked'); check(r.poker && r.econ && r.bea, 'list view all');
await p.screenshot({ path: S + '/expo-filters-list.png', fullPage: true });
// 3. Social tab search: the same boxes inside the filters; "friends hosting" leaves Bea's plan; Clear filters clears them.
await p.goto(BASE + '/social'); await p.getByTestId(`social-${bea}`).waitFor({ timeout: 20000 }); await p.getByTestId('social-search').click(); await p.getByTestId('social-personal-friendsHosting').waitFor({ timeout: 10000 });
await p.getByTestId('social-personal-friendsHosting').click(); await p.waitForTimeout(400);
r = await want(p, { bea: `social-${bea}`, cas: `social-${cas}` }, 'social discover'); check(r.bea && !r.cas, 'social: friends hosting');
await p.getByTestId('filters-done').click(); say('filter badge:', await p.getByText(/1 filter/).count()); check((await p.getByText(/1 filter/).count()) === 1, 'social badge');
await p.getByTestId('clear-filters').click(); await p.waitForTimeout(400); r = await want(p, { bea: `social-${bea}`, cas: `social-${cas}` }, 'social cleared'); check(r.bea && r.cas, 'social: cleared');
// 4. Recommended lists respect them too: Societies tab, my societies ticked → only Poker; Social Recommended, friends hosting → only Bea.
await p.goto(BASE + '/societies'); await p.getByTestId('societies-mode-recommended').click(); await p.getByTestId('recommended-society').waitFor({ timeout: 20000 }); await p.getByTestId(`event-${poker}`).waitFor({ timeout: 20000 });
await p.getByTestId('recommended-personal-mySocieties').click(); await p.waitForTimeout(500); r = await want(p, { poker: `event-${poker}`, econ: `event-${other}` }, 'recommended societies'); check(r.poker && !r.econ, 'recommended: my societies');
await p.getByTestId('recommended-personal-mySocieties').click();
await p.goto(BASE + '/social'); await p.getByTestId('social-mode-recommended').click(); await p.getByTestId(`social-${bea}`).waitFor({ timeout: 20000 });
await p.getByTestId('social-search').click(); await p.getByTestId('social-personal-friendsHosting').click(); await p.waitForTimeout(400);
r = await want(p, { bea: `social-${bea}`, cas: `social-${cas}` }, 'recommended social'); check(r.bea && !r.cas, 'recommended social: friends hosting');
await p.getByTestId('social-personal-friendsHosting').click();
// 5. Logged out: no personal section anywhere.
const q = await fresh(); await q.goto(BASE + '/map'); await q.getByTestId('filter').waitFor({ timeout: 20000 }); await q.getByTestId('filter').click(); await q.getByTestId('filter-panel').waitFor();
check(!(await has(q, 'filter-personal')), 'logged out: no boxes on the map'); await q.getByTestId('filter-done').click();
await q.getByTestId('show-list').click(); await q.waitForTimeout(800); check(!(await has(q, 'list-personal')), 'logged out: no boxes in the list');
console.log('errors:', errs); await b.close();
