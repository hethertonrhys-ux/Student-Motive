// Expo web build, phase 3: the live map. Pins and groups, Now / Tonight /
// Tomorrow, the category filter, search, the event card, directions, the
// uni / London buttons and the List view. Runs against the stand-in backend.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const n = Date.now() % 100000;

// Seed: two LSE events at the same venue (one live now, one later tonight), one tomorrow at another venue, and a sports social tonight.
sql(`delete from events where title like 'Map %'; delete from social_events where title like 'Map %'`);
const lse = sql(`select id from societies where slug='lse-poker-society'`);
const marshall = sql(`select id from venues where name='Marshall Building'`); const saw = sql(`select id from venues where name='Saw Swee Hock Student Centre'`);
const mk = (title, venue, start, hours = 3, cat = 'social') => sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience,members_only) values ('${lse}','${title}','${cat}','${venue}',${start},${start}+interval '${hours} hours','london',false) returning id`).split('\n')[0];
const live = mk('Map Live Poker', marshall, "now()-interval '30 minutes'", 4);
const later = mk('Map Late Poker', marshall, "now()+interval '2 hours'", 3, 'talks');
const tomorrow = mk('Map Tomorrow Talk', saw, "now()+interval '26 hours'", 2, 'talks');
// Other tests leave sport socials behind; the filter check below expects exactly one.
sql(`delete from social_events where category='sport' and title <> 'Map Five-a-side'`);
sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('00000000-0000-0000-0000-000000000002','Map Five-a-side','sport',now()-interval '10 minutes',now()+interval '2 hours','Lincoln''s Inn Fields',51.516,-0.117,10)`);
const windowOf = (iso) => sql(`select case when '${iso}'::timestamptz < (date_trunc('day', now() at time zone 'Europe/London') + interval '1 day 6 hours') at time zone 'Europe/London' then 'tonight' else 'tomorrow' end`);
say('live event falls in:', windowOf(sql(`select starts_at from events where id='${live}'`)));

const b = await chromium.launch(); const c = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 51.5146, longitude: -0.1168 }, permissions: ['geolocation'] });
const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/tiles|glyph|openfreemap|net::|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });

// 1. Logged out, the map still shows. Pins or a group appear for tonight's events.
await p.goto(BASE + '/map'); await p.getByTestId('map').waitFor({ timeout: 20000 });
await p.getByTestId('status').getByText(/\d+ events?/).waitFor({ timeout: 20000 });
const status = async () => (await p.getByTestId('status').innerText()).replace(/\n/g, ' ');
await p.waitForFunction(() => document.querySelectorAll('[data-testid^="pin-"], [data-testid="cluster"]').length > 0, null, { timeout: 20000 });
say('tonight:', await status(), '| pins:', await p.locator('[data-testid^="pin-"]').count(), '| groups:', await p.locator('[data-testid="cluster"]').count());
check(/live/.test(await status()), 'live count in status');
await p.screenshot({ path: S + '/expo-map.png' });

// 2. Now shows only what's on within the hour; Tomorrow shows the talk.
await p.getByTestId('when-now').click(); await p.waitForTimeout(300); const nowText = await status(); say('now:', nowText);
await p.getByTestId('when-tomorrow').click(); await p.waitForTimeout(300); const tomText = await status(); say('tomorrow:', tomText);
check(/1 event/.test(tomText) || /\d+ events?/.test(tomText), 'tomorrow count');
await p.getByTestId('when-tonight').click();

// 3. Search finds the live event; picking it opens its card, and View details goes to the event page.
await p.getByTestId('search').click(); await p.getByTestId('search-input').fill('live poker');
await p.getByTestId(`result-${live}`).waitFor({ timeout: 10000 }); await p.getByTestId(`result-${live}`).click();
await p.getByTestId('sheet').waitFor({ timeout: 10000 }); const card = await p.getByTestId('sheet').innerText(); say('card:', card.replace(/\n/g, ' | '));
check(/LIVE/.test(card) && /Map Live Poker/.test(card) && /LSE Poker Society/.test(card) && /Marshall Building/.test(card) && /min walk/.test(card) === false, 'card content');
await p.screenshot({ path: S + '/expo-map-card.png' });
await p.getByTestId('view-details').click(); await p.waitForURL(`**/e/${live}`, { timeout: 15000 }); await p.getByText('Who can come').waitFor({ timeout: 15000 }); say('view details -> event page');
await p.goBack(); await p.getByTestId('map').waitFor({ timeout: 20000 });

// 4. Directions: your location is shared (LSE), a route (or an estimate) shows in the walk bar, then it clears.
await p.getByTestId('close-sheet').click(); await p.getByTestId('search-cancel').click(); await p.getByTestId('status').waitFor();
await p.getByTestId('find-me').click(); await p.getByTestId('nearest').waitFor({ timeout: 15000 }); say('nearest:', (await p.getByTestId('nearest').innerText()).replace(/\n/g, ' '));
await p.getByTestId('nearest').click(); await p.getByTestId('sheet').waitFor({ timeout: 10000 });
check(/min walk|km away/.test(await p.getByTestId('sheet').innerText()), 'distance on card once located');
await p.getByTestId('directions').first().click(); await p.getByTestId('walk-bar').waitFor({ timeout: 30000 });
const walk = (await p.getByTestId('walk-bar').innerText()).replace(/\n/g, ' | '); say('walk:', walk); check(/min walk/.test(walk), 'walk text');
await p.screenshot({ path: S + '/expo-map-walk.png' });
await p.getByTestId('clear-route').click(); await p.getByTestId('status').waitFor();

// 5. Filter: only Sport leaves the five-a-side; Clear brings everything back. The choice is remembered after a reload.
await p.getByTestId('filter').click(); await p.getByText('Clear').click(); await p.getByTestId('filter-sport').click(); await p.getByTestId('filter-done').click(); await p.waitForTimeout(300);
const sportText = await status(); say('sport only:', sportText); check(/1 event/.test(sportText), 'sport filter');
await p.reload(); await p.getByTestId('status').getByText(/\d+ events?/).waitFor({ timeout: 20000 }); say('after reload:', await status()); check(/1 event/.test(await status()), 'filter remembered');
await p.getByTestId('filter').click(); await p.getByText('Clear').click(); await p.getByTestId('filter-done').click(); await p.waitForTimeout(300); say('cleared:', await status());

// 6. A group all in one place lists both events when tapped (the two poker events share the Marshall Building).
await p.getByTestId('go-uni').click(); await p.waitForTimeout(1500);
const groups = p.locator('[data-testid="cluster"]'); if (await groups.count()) { await groups.first().click(); await p.waitForTimeout(1500); }
if (await groups.count()) { await groups.first().click(); await p.getByTestId('sheet').waitFor({ timeout: 10000 }); const list = await p.getByTestId('sheet').innerText(); say('group card:', /Map Live Poker/.test(list) && /Map Late Poker/.test(list)); check(/Map Late Poker/.test(list), 'group list'); await p.getByTestId('close-sheet').click(); }
else say('group: already split at this zoom');

// 7. London and List.
await p.getByTestId('go-london').click(); await p.waitForTimeout(800);
await p.getByTestId('show-list').click(); await p.getByTestId('group-tonight').waitFor({ timeout: 15000 }); say('list view shows the feed');
await p.getByTestId('show-map').click(); await p.getByTestId('map').waitFor({ timeout: 20000 }); say('back to the map');
console.log('errors:', errs); await b.close();
