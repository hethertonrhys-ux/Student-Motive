// Expo web build: the admin panel. Reached from the Me tab (admins only; the
// database refuses everyone else), with Overview (incl. reported Social
// plans), Users (search + support details) and Events (list, filters, and
// "Delete past events" that counts, confirms, deletes images too, and never
// touches published results or the LSE Poker Society). Plus a society's own
// committee clearing their past events from their dashboard.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || document.querySelector('[data-testid="new-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {});
  if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click();
  else if (await p.getByTestId('new-password').count()) { await p.getByTestId('new-password').fill('correct horse 42'); await p.getByTestId('new-password-again').fill('correct horse 42'); await p.getByTestId('save-password').click(); }
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); } if (p.url().includes('/welcome')) { await p.getByTestId('skip').click(); await p.waitForURL('**/map'); }
}
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U4 = '00000000-0000-0000-0000-000000000004';

// Seed: Sky (s4) is a Function admin. Old events of every kind.
sql(`update profiles set is_admin=true where id='${U4}'; update profiles set is_admin=false where id='${U1}'`);
const poker = sql(`select id from societies where slug='lse-poker-society'`);
sql(`insert into societies (slug,name,university) values ('adm-econ','LSE Economics Society','LSE') on conflict (slug) do nothing`); const econ = sql(`select id from societies where slug='adm-econ'`);
const venue = sql(`select id from venues limit 1`);
sql(`delete from events where title like 'Adm %'; delete from social_events where title like 'Adm %'; delete from storage.objects where name like '${econ}/%'`);
sql(`delete from society_members where user_id='${U1}'; insert into society_members (society_id,user_id,status,approved_at) values ('${poker}','${U1}','approved',now())`);
const mk = (soc, title, daysAgo, extra = '') => sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience${extra ? ',' + extra.split('=')[0] : ''}) values ('${soc}','${title}','social','${venue}',now()-interval '${daysAgo} days 3 hours',now()-interval '${daysAgo} days','london'${extra ? ',' + extra.split('=')[1] : ''}) returning id`).split('\n')[0];
const oldEcon = mk(econ, 'Adm Old Econ', 100); sql(`update events set image_url='https://x.supabase.co/storage/v1/object/public/images/${econ}/old.jpg' where id='${oldEcon}'; insert into storage.objects (bucket_id,name) values ('images','${econ}/old.jpg')`);
const oldEcon2 = mk(econ, 'Adm Old Econ Two', 120);
const oldPoker = mk(poker, 'Adm Old Poker Game', 100);
const oldResults = mk(econ, 'Adm Old With Results', 100, 'results_published=true');
const recent = mk(econ, 'Adm Recent Past', 10);
const upcoming = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${econ}','Adm Upcoming','social','${venue}',now()+interval '2 days',now()+interval '2 days 3 hours','london') returning id`);
const oldSocial = sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('${U2}','Adm Old Social','social',now()-interval '100 days 2 hours',now()-interval '100 days','Soho',51.513,-0.132,8) returning id`);
const liveSocial = sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('${U2}','Adm Reported Social','social',now()+interval '1 day',now()+interval '1 day 2 hours','Soho',51.513,-0.132,8) returning id`);
sql(`insert into social_reports (event_id,reporter_id,reason) values ('${liveSocial}','${U1}','Adm test report')`);
sql(`insert into reports (reporter_id,reported_user_id,reason) values ('${U2}','${U1}','Adm rude in chat')`);

// 1. Non-admin: no row on Me, the page refuses, the dashboard link is gone.
const n = await fresh(); await login(n, 's1@lse.ac.uk'); await n.goto(BASE + '/me'); await n.getByTestId('my-profile').waitFor({ timeout: 20000 }); check((await n.getByTestId('admin-panel').count()) === 0, 'non-admin: no Me row');
await n.goto(BASE + '/admin'); await n.getByText('This page is for the Function team.').waitFor({ timeout: 20000 }); say('non-admin refused');
await n.goto(BASE + '/dashboard'); await n.getByText('Society dashboard').waitFor({ timeout: 20000 }); await n.waitForTimeout(500); check((await n.getByTestId('admin-link').count()) === 0, 'dashboard link removed');
// 2. Admin: Me → Admin panel → Overview with the reported Social plan; hide it.
const p = await fresh(); await login(p, 's4@lse.ac.uk'); await p.goto(BASE + '/me'); await p.getByTestId('admin-panel').waitFor({ timeout: 20000 }); await p.getByTestId('admin-panel').click(); await p.waitForURL('**/admin');
await p.getByTestId('admin-tab-overview').waitFor({ timeout: 20000 }); await p.getByText('Reported Social plans (1)').waitFor({ timeout: 20000 });
await p.getByTestId('hide-social-event').click(); await p.getByText('Reported Social plans (0)').waitFor({ timeout: 15000 }); say('social report: hidden =', sql(`select is_hidden from social_events where id='${liveSocial}'`), '| status =', sql(`select status from social_reports where event_id='${liveSocial}'`));
check(sql(`select is_hidden from social_events where id='${liveSocial}'`) === 't', 'social plan hidden');
await p.screenshot({ path: S + '/expo-admin-overview.png', fullPage: true });
// 3. Users: search, pick Sam, see support details.
await p.getByTestId('admin-tab-users').click(); await p.waitForURL('**/admin/users'); await p.getByTestId('admin-user-search').fill('sam'); await p.getByTestId(`admin-user-${U1}`).waitFor({ timeout: 15000 }); await p.getByTestId(`admin-user-${U1}`).click();
await p.getByTestId('admin-user-detail').waitFor({ timeout: 15000 }); await p.getByTestId('admin-user-detail').getByText('Verification').waitFor({ timeout: 15000 });
const detail = (await p.getByTestId('admin-user-detail').innerText()).replace(/\n/g, ' | '); say('detail:', detail.slice(0, 400));
check(/University email/.test(detail) && /Reports against them \(1\)/.test(detail) && /LSE Poker Society/.test(detail) && /Email confirmed/.test(detail), 'user detail');
await p.getByTestId('admin-user-search').fill('s1@lse'); await p.getByTestId(`admin-user-${U1}`).waitFor({ timeout: 15000 }); say('email search finds Sam');
await p.screenshot({ path: S + '/expo-admin-user.png', fullPage: true });
// 4. Events: upcoming by default, past on request, search; then the clean-up with its numbers.
await p.getByTestId('admin-tab-events').click(); await p.waitForURL('**/admin/events'); await p.getByTestId(`admin-event-${upcoming}`).waitFor({ timeout: 20000 }); check((await p.getByTestId(`admin-event-${oldEcon}`).count()) === 0, 'upcoming only by default');
await p.getByTestId('admin-scope-past').click(); await p.getByTestId(`admin-event-${oldEcon}`).waitFor({ timeout: 15000 }); check((await p.getByTestId(`admin-event-${oldSocial}`).count()) === 1, 'past includes social plans');
await p.getByTestId('admin-event-search').fill('Old Poker'); await p.getByTestId(`admin-event-${oldEcon}`).waitFor({ state: 'detached', timeout: 15000 }); check((await p.getByTestId(`admin-event-${oldPoker}`).count()) === 1, 'search narrows'); await p.getByTestId('admin-event-search').fill(''); await p.getByTestId(`admin-event-${oldEcon}`).waitFor({ timeout: 15000 });
await p.getByTestId('cleanup-count').click(); await p.getByTestId('cleanup-summary').waitFor({ timeout: 15000 }); const summary = (await p.getByTestId('cleanup-summary').innerText()).replace(/\n/g, ' | '); say('summary:', summary);
check(/2 society events and 1 Social plan \(1 image\)/.test(summary) && /1 with published results, 1 from the LSE Poker Society/.test(summary), 'cleanup summary');
await p.screenshot({ path: S + '/expo-admin-cleanup.png', fullPage: true });
await p.getByTestId('cleanup-cancel').click(); await p.getByTestId('cleanup-count').waitFor(); say('kept them: still there =', sql(`select count(*) from events where id in ('${oldEcon}','${oldEcon2}')`));
await p.getByTestId('cleanup-count').click(); await p.getByTestId('cleanup-confirm').waitFor({ timeout: 15000 }); await p.getByTestId('cleanup-confirm').click(); await p.getByTestId('cleanup-done').waitFor({ timeout: 20000 }); say('done:', await p.getByTestId('cleanup-done').innerText());
const left = sql(`select string_agg(title, ', ' order by title) from events where title like 'Adm %'`); say('events left:', left, '| social left:', sql(`select string_agg(title, ', ') from social_events where title like 'Adm %'`), '| image object left:', sql(`select count(*) from storage.objects where name='${econ}/old.jpg'`));
check(left === 'Adm Old Poker Game, Adm Old With Results, Adm Recent Past, Adm Upcoming', 'right events deleted'); check(sql(`select count(*) from social_events where id='${oldSocial}'`) === '0', 'old social deleted'); check(sql(`select count(*) from storage.objects where name='${econ}/old.jpg'`) === '0', 'image removed');
// 5. The Poker Society's own committee can clear their old game from the dashboard.
const c = await fresh(); await login(c, 'committee@lse.ac.uk'); await c.goto(BASE + '/dashboard/' + poker); await c.getByTestId('past-cleanup-count').waitFor({ timeout: 20000 }); await c.getByTestId('past-cleanup-count').click();
await c.getByTestId('past-cleanup-summary').waitFor({ timeout: 15000 }); say('committee summary:', (await c.getByTestId('past-cleanup-summary').innerText()).replace(/\n/g, ' | ').slice(0, 160));
await c.getByTestId('past-cleanup-confirm').click(); await c.getByTestId('past-cleanup-done').waitFor({ timeout: 20000 }); say('committee deleted; old poker game left:', sql(`select count(*) from events where id='${oldPoker}'`)); check(sql(`select count(*) from events where id='${oldPoker}'`) === '0', 'committee cleanup');
await c.screenshot({ path: S + '/expo-dashboard-cleanup.png', fullPage: true });
console.log('errors:', errs); await b.close();
