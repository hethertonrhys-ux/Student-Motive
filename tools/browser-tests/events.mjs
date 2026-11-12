// Expo web build, phase 2: the What's on feed (Tonight / Tomorrow / Coming
// up, society events and socials, other-uni events only when open to all
// London), the event page, "I'm going" / "Can't make it" through the
// database, the uni-only and members-only rules, and the share button.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch(); const n = Date.now() % 100000;
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message)); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); } if (p.url().includes('/welcome')) { await p.getByTestId('skip').click(); await p.waitForURL('**/map'); }
}
// Seed: an LSE society's events tonight (uni), tomorrow (london), later (members only), a UCL society's open and uni-only events, and a social.
const lse = sql(`select id from societies where slug='lse-poker-society'`);
// Sam must be a plain student here: the committee test makes him a Poker Society admin and may not have cleaned up.
sql(`delete from society_admins where user_id='00000000-0000-0000-0000-000000000001'; delete from society_members where user_id='00000000-0000-0000-0000-000000000001' and society_id='${lse}'`);
sql(`insert into societies (slug,name,university) values ('ucl-chess','UCL Chess Society','UCL') on conflict (slug) do nothing`); const ucl = sql(`select id from societies where slug='ucl-chess'`);
const venue = sql(`select id from venues limit 1`);
const mk = (soc, title, aud, mo, start, hours = 3) => sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience,members_only) values ('${soc}','${title}','social','${venue}',${start},${start}+interval '${hours} hours','${aud}',${mo}) returning id`).split('\n')[0];
const tonight = mk(lse, 'Poker Tonight', 'uni', false, "now()+interval '1 hour'");
const tomorrow = mk(lse, 'London Open Night', 'london', false, "now()+interval '26 hours'");
const members = mk(lse, 'Members Night', 'uni', true, "now()+interval '3 days'"); // LSE students see it; only members can join
const hidden = mk(lse, 'Committee Only', 'members', true, "now()+interval '4 days'"); // members-only audience: hidden from non-members
const uclOpen = mk(ucl, 'UCL Open Chess', 'london', false, "now()+interval '2 hours'");
const uclOnly = mk(ucl, 'UCL Students Chess', 'uni', false, "now()+interval '4 hours'");
sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('00000000-0000-0000-0000-000000000002','Five-a-side','sport',now()+interval '5 hours',now()+interval '7 hours','Lincoln''s Inn Fields',51.516,-0.117,10)`);

// 1. LSE student's feed.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/map'); await p.getByTestId('show-list').click(); await p.getByTestId('group-tonight').waitFor({ timeout: 15000 });
const titles = async (group) => (await p.getByTestId(`group-${group}`).locator('[data-testid^="event-"]').allInnerTexts()).map((t) => t.split('\n').find((l) => /Night|Chess|side|Tonight/.test(l)));
say('Tonight:', await titles('tonight')); say('Tomorrow:', await titles('tomorrow')); say('Coming up:', (await p.getByTestId('group-later').count()) ? await titles('later') : []);
const all = (await p.locator('[data-testid^="event-"]').allInnerTexts()).join(' ');
check(/Poker Tonight/.test(all) && /UCL Open Chess/.test(all) && /Five-a-side/.test(all), 'feed missing items');
check(!/UCL Students Chess/.test(all) && !/Committee Only/.test(all) && /Members Night/.test(all), 'feed visibility');
check(/UCL Chess Society · UCL/.test(all), 'other-uni tag'); check(/Hosted by/.test(all), 'social host line');
await p.screenshot({ path: S + '/expo-feed.png', fullPage: true });
// 2. Event page: I'm going, then can't make it.
await p.getByTestId(`event-${tonight}`).click(); await p.waitForURL(`**/e/${tonight}`); await p.getByText('Who can come').waitFor({ timeout: 15000 });
say('who can come:', await p.getByText('LSE students').first().textContent());
await p.getByTestId('join').click(); await p.getByText("You're going").waitFor({ timeout: 15000 });
say('joined:', sql(`select status from event_entries where event_id='${tonight}' and user_id='00000000-0000-0000-0000-000000000001'`)); check(sql(`select count(*) from event_entries where event_id='${tonight}' and user_id='00000000-0000-0000-0000-000000000001'`) === '1', 'join');
await p.screenshot({ path: S + '/expo-event.png', fullPage: true });
await p.getByTestId('leave').click(); await p.getByTestId('join').waitFor({ timeout: 15000 }); say('left:', sql(`select count(*) from event_entries where event_id='${tonight}'`) === '0');
// Members-only audience: hidden entirely. Members-only joining: visible, with a Become a member link.
await p.goto(BASE + '/e/' + hidden); await p.getByText('Event not found').waitFor({ timeout: 15000 }); say('members-only audience: not found for a non-member');
await p.goto(BASE + '/e/' + members); await p.getByText('Members only').first().waitFor(); say('members-only: become a member shown', await p.getByText('Become a member').count());
check((await p.getByText('Become a member').count()) === 1 && (await p.getByTestId('join').count()) === 0, 'members-only panel');
// Share copies the link (no share sheet in the test browser).
await p.goto(BASE + '/e/' + tonight); await p.context().grantPermissions(['clipboard-read', 'clipboard-write']); await p.getByTestId('share').click(); await p.getByText('Link copied').waitFor();
say('share copied:', await p.evaluate(() => navigator.clipboard.readText()));
// 3. King's student: UCL open event is joinable, the LSE uni-only one is hidden (404) and the UCL uni-only one too.
const k = await fresh(); await login(k, `k${n}@kcl.ac.uk`); await k.goto(BASE + '/map'); await k.getByTestId('show-list').click(); await k.locator('[data-testid^="event-"]').first().waitFor({ timeout: 15000 }); // (no "Tonight" group for King's after 6am London: Poker Tonight is LSE-only)
const kAll = (await k.locator('[data-testid^="event-"]').allInnerTexts()).join(' '); say("King's feed has Poker Tonight:", /Poker Tonight/.test(kAll), '| UCL Open:', /UCL Open Chess/.test(kAll));
check(!/Poker Tonight/.test(kAll) && /UCL Open Chess/.test(kAll), "King's feed visibility");
await k.goto(BASE + '/e/' + tonight); await k.getByText('Event not found').waitFor({ timeout: 15000 }); say("King's opening an LSE-students event: not found");
await k.goto(BASE + '/e/' + uclOpen); check((await k.getByTestId('name-form').count()) === 0, 'name form shown although the account step already took a name'); say("King's: no name form (the account step already took the name)"); await k.getByTestId('join').click(); await k.getByText("You're going").waitFor({ timeout: 15000 }); say("King's joined the London-open UCL event");
// 4. Logged out: feed still shows, with a log-in card; event page offers log in.
const v = await fresh(); await v.goto(BASE + '/map'); await v.getByTestId('show-list').click(); await v.getByText("Log in to see your uni's events").waitFor({ timeout: 15000 }); await v.getByTestId('group-tonight').waitFor();
await v.goto(BASE + '/e/' + tomorrow); await v.getByText("Log in to say you're going.").waitFor({ timeout: 15000 }); say('logged out: feed and event page work');
console.log('errors:', errs); await b.close();
