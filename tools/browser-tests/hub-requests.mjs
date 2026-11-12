// Expo web build: feature requests, Founding Society progress and the
// admin panel's Hub tab (Part 4). Sam manages a society (set up already):
// the Hub has Requests, he sends a request and sees it as New. Sky, a
// Function admin, sees it in Admin panel → Hub, filters New, adds a note and
// sets it to Live (Sam's phone gets a Society Hub push); back on All (loaded
// earlier) it shows Live, and saving a note there keeps it Live; Sam sees
// Live and the note. Wanted features are ranked by how many societies want
// each. Sky marks the society Founding in the Societies tab and the Hub
// tab's Founding list shows it straight away; Sam agrees from the progress
// card and, back on the Hub, sees the progress bar without reloading. With
// the agreement and 3 events, 2 with someone going: Sam's Hub shows "3 of 3 events posted", not yet in the
// prize draw, badge on; a third person going puts them in the draw. The
// public society page shows the Founding Society badge until everything is
// 40 days old, when it disappears and the Hub says the badge is paused.
// Students who don't manage it can't open its Requests; the LSE Poker
// Society shows no badge and is unchanged.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh(extra = devices['iPhone 13']) { const c = await b.newContext(extra); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
const v = (pg, id) => pg.getByTestId(id).filter({ visible: true });
const text = async (p, id) => (await v(p, id).innerText()).replace(/\s+/g, ' ').trim();
async function login(p, email) {
  await p.goto(BASE + '/login'); await v(p, 'email').fill(email); await v(p, 'send-code').click();
  await v(p, 'code').waitFor({ timeout: 15000 }); await v(p, 'code').fill('123456'); await v(p, 'log-in').click();
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await v(p, 'full-name').fill('Test Person'); await v(p, 'graduation-year').click(); await v(p, 'graduation-year-2027').click(); await v(p, 'save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
async function until(fn, what, tries = 40) { for (let i = 0; i < tries; i++) { if (fn()) return true; await new Promise((r) => setTimeout(r, 250)); } errs.push('timed out waiting: ' + what); return false; }
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003', U4 = '00000000-0000-0000-0000-000000000004';

// Seed: a set-up society that only Sam manages, and a second one for the
// wanted-features ranking. Sam has a phone set up for pushes; Sky is a
// Function admin.
const poker = sql(`select id from societies where slug='lse-poker-society'`);
const pokerBefore = sql(`select is_founding||'|'||(select count(*) from feature_requests where society_id=s.id)||'|'||(select count(*) from founding_agreements where society_id=s.id) from societies s where s.id='${poker}'`);
sql(`delete from societies where slug in ('req-test-society','req-test-two'); delete from society_admins where user_id in ('${U1}','${U2}','${U3}'); update profiles set is_admin=false where id in ('${U1}','${U2}','${U3}'); update profiles set is_admin=true where id='${U4}'`);
const soc = sql(`insert into societies (slug,name,university,society_type,onboarded_at) values ('req-test-society','Requests Test Society','LSE','games',now()) returning id`);
const soc2 = sql(`insert into societies (slug,name,university,society_type,onboarded_at) values ('req-test-two','Second Test Society','LSE','social',now()) returning id`);
sql(`insert into society_admins (society_id,user_id) values ('${soc}','${U1}')`);
sql(`insert into push_tokens (user_id, platform, token) values ('${U1}','ios','ExponentPushToken[req-sam]') on conflict (token) do nothing; delete from push_queue`);
const venue = sql(`select id from venues limit 1`);

// 1. Sam: Requests is in the Hub; he sends a request and sees it as New.
const p = await fresh(); await login(p, 's1@lse.ac.uk');
await p.goto(BASE + `/hub/${soc}`); await v(p, 'hub-card-requests').waitFor({ timeout: 20000 });
check((await v(p, 'founding-progress').count()) === 0, 'no Founding progress card for a society that is not Founding');
check((await v(p, 'hub-nav-requests').count()) === 1, 'Requests is one of the Hub sections');
await v(p, 'hub-requests-link').click(); await p.waitForURL(new RegExp(`/hub/${soc}/requests$`), { timeout: 15000 });
await v(p, 'request-form').waitFor({ timeout: 20000 });
await v(p, 'requests-none').waitFor({ timeout: 15000 });
check(await v(p, 'request-send').isDisabled() || (await v(p, 'request-send').getAttribute('aria-disabled')) === 'true', 'Send is off until something is typed');
await v(p, 'request-need').fill('Check people in at the door with a QR code');
await v(p, 'request-now').fill('A printed list and a pen');
await v(p, 'request-send').click(); await v(p, 'request-thanks').waitFor({ timeout: 15000 });
check((await text(p, 'request-thanks')) === "Thanks. We'll be in touch.", 'thanks message: ' + await text(p, 'request-thanks'));
const req = sql(`select id from feature_requests where society_id='${soc}'`);
check(!!req && sql(`select status||'|'||requested_by||'|'||current_process from feature_requests where id='${req}'`) === `new|${U1}|A printed list and a pen`, 'the request is stored as new, from Sam');
await v(p, `request-${req}`).waitFor({ timeout: 15000 });
check((await text(p, `request-state-${req}`)) === 'New', 'Sam sees it as New');
check((await text(p, `request-${req}`)).includes('Check people in at the door with a QR code'), 'the request is listed');
check((await v(p, 'request-need').inputValue()) === '', 'the form is cleared after sending');
await p.screenshot({ path: S + '/expo-hub-requests.png', fullPage: true });

// A student who doesn't manage it can't open its Requests.
const c = await fresh(); await login(c, 's3@lse.ac.uk');
await c.goto(BASE + `/hub/${soc}/requests`); await v(c, 'hub-no-access').waitFor({ timeout: 20000 });

// 2. Sky (Function admin): Admin panel → Hub, filter New, note, set Live.
const a = await fresh(); await login(a, 's4@lse.ac.uk');
await a.goto(BASE + '/admin'); await v(a, 'admin-tab-hub').waitFor({ timeout: 20000 });
await v(a, 'admin-tab-hub').click(); await a.waitForURL(/\/admin\/hub$/, { timeout: 15000 });
await v(a, 'requests-filter-all').waitFor({ timeout: 20000 });
await v(a, 'requests-filter-declined').click(); await v(a, 'requests-empty').waitFor({ timeout: 15000 });
check((await v(a, `admin-request-${req}`).count()) === 0, 'Declined does not list the new request');
await v(a, 'requests-filter-new').click(); await v(a, `admin-request-${req}`).waitFor({ timeout: 15000 });
const card = await text(a, `admin-request-${req}`); say('admin card:', card);
check(card.includes('Requests Test Society') && card.includes('LSE') && card.includes('Check people in at the door with a QR code') && card.includes('How they do it now: A printed list and a pen') && card.includes('Requested by Sam Student'), 'the card shows the society, uni, request, how they do it now and who asked');
check(!card.includes('@'), 'no email on the card');
check((await text(a, `admin-request-${req}`)).includes('Setting it to Live sends the society'), 'the card says Live notifies the managers');
await a.screenshot({ path: S + '/expo-admin-hub.png', fullPage: true });
await v(a, `request-note-${req}`).fill('Building it now');
await v(a, `request-note-save-${req}`).click(); await v(a, `request-message-${req}`).waitFor({ timeout: 15000 });
await until(() => sql(`select admin_note from feature_requests where id='${req}'`) === 'Building it now', 'the note is saved');
check(sql(`select status from feature_requests where id='${req}'`) === 'new', 'saving the note keeps it New');
check(sql(`select count(*) from push_queue`) === '0', 'no push yet');
await v(a, `request-status-${req}`).click(); await v(a, `request-status-${req}-live`).click();
await until(() => sql(`select status from feature_requests where id='${req}'`) === 'live', 'the status saves straight away');
check(sql(`select status_changed_at is not null from feature_requests where id='${req}'`) === 't', 'the change is stamped');
await until(() => sql(`select count(*) from push_queue where user_id='${U1}' and kind='hub'`) === '1', 'Sam gets a push');
check(sql(`select title||'|'||body||'|'||url from push_queue where user_id='${U1}' and kind='hub'`) === `Your feature request is live|Check people in at the door with a QR code|/hub/${soc}/requests`, 'the push says the request is live and opens the Hub\'s Requests page: ' + sql(`select title||'|'||body||'|'||url from push_queue where user_id='${U1}'`));
// Filtered to New, it leaves the list; Live lists it.
await a.waitForTimeout(800);
check((await v(a, `admin-request-${req}`).count()) === 0, 'once Live it leaves the New list');
// Back on All (loaded before it went Live): the card shows Live once the
// list reloads, and saving a note there keeps it Live.
await v(a, 'requests-filter-all').click(); await v(a, `admin-request-${req}`).waitFor({ timeout: 15000 });
await a.waitForFunction((id) => document.querySelector(`[data-testid="admin-request-state-${id}"]`)?.textContent === 'Live', req, { timeout: 15000 }).catch(() => errs.push('the All list shows it as Live: ' + sql(`select status from feature_requests where id='${req}'`)));
check((await v(a, `request-status-${req}`).innerText()).includes('Live'), 'the status picker on All shows Live');
await v(a, `request-note-${req}`).fill('Live in the app now: Event check-in');
await v(a, `request-note-save-${req}`).click();
await until(() => sql(`select admin_note from feature_requests where id='${req}'`) === 'Live in the app now: Event check-in', 'the second note is saved');
await a.waitForTimeout(500);
check(sql(`select status from feature_requests where id='${req}'`) === 'live', 'saving a note on All keeps it Live: ' + sql(`select status from feature_requests where id='${req}'`));
check((await text(a, `admin-request-state-${req}`)) === 'Live', 'and the card still says Live');
await v(a, 'requests-filter-live').click(); await v(a, `admin-request-${req}`).waitFor({ timeout: 15000 });
check((await v(a, `request-status-${req}`).innerText()).includes('Live'), 'the Live list shows it as Live');

// 3. Sam reloads and sees Live, with the note.
await p.reload(); await v(p, `request-${req}`).waitFor({ timeout: 20000 });
check((await text(p, `request-state-${req}`)) === 'Live', 'Sam sees it as Live: ' + await text(p, `request-state-${req}`));
check((await text(p, `request-note-${req}`)) === 'From Function: Live in the app now: Event check-in', 'Sam sees the note');
// The admin looking at the society's Requests can't send one for it (only its managers can).
await a.goto(BASE + `/hub/${soc}/requests`); await v(a, 'request-committee-only').waitFor({ timeout: 20000 }); await v(a, `request-${req}`).waitFor({ timeout: 20000 });
check((await v(a, 'request-form').count()) === 0, 'no request form for a Function admin who does not manage it');
check((await v(a, `request-${req}`).count()) === 1, 'the admin sees its requests');

// 4. Wanted features: polls (two societies) ranks above check-in (one).
sql(`insert into feature_interest (society_id, feature_key, created_by) values ('${soc}','check_in_qr','${U1}'), ('${soc}','polls','${U1}'), ('${soc2}','polls',null)`);
await a.goto(BASE + '/admin/hub'); await v(a, 'wanted-list').waitFor({ timeout: 20000 });
const wanted = await a.$$eval('[data-testid="wanted-list"] > [data-testid^="wanted-"]', (els) => els.map((e) => e.getAttribute('data-testid')));
say('wanted order:', wanted.join(', '));
check(wanted[0] === 'wanted-polls' && wanted.indexOf('wanted-check_in_qr') > 0, 'polls (2 societies) is ranked first: ' + wanted.join(','));
check((await text(a, 'wanted-polls')).includes('Polls') && (await text(a, 'wanted-polls')).includes('2 societies') && (await text(a, 'wanted-polls')).includes('Requests Test Society, Second Test Society'), 'polls: name, count and the societies: ' + await text(a, 'wanted-polls'));
check((await text(a, 'wanted-check_in_qr')).includes('1 society'), 'check-in: 1 society');
await v(a, 'founding-empty').waitFor({ timeout: 15000 });

// 4b. Sky marks it Founding in the Societies tab; back on the Hub tab (no
// reload) the Founding list shows it, not agreed yet.
await v(a, 'admin-tab-societies').click(); await a.waitForURL(/\/admin\/societies$/, { timeout: 15000 });
await v(a, 'admin-society-search').fill('Requests Test Society'); await v(a, `admin-society-${soc}`).waitFor({ timeout: 15000 });
await v(a, `admin-society-${soc}`).click(); await v(a, 'founding-switch').waitFor({ timeout: 15000 });
await v(a, 'founding-switch').click();
await until(() => sql(`select is_founding from societies where id='${soc}'`) === 't', 'the society is marked Founding');
await a.waitForTimeout(500);
await v(a, 'admin-tab-hub').click(); await a.waitForURL(/\/admin\/hub$/, { timeout: 15000 });
await v(a, `founding-${soc}`).waitFor({ timeout: 15000 }).catch(() => errs.push('the Hub tab lists the new Founding Society without a reload'));
if (await v(a, `founding-${soc}`).count()) check((await text(a, `founding-${soc}`)).includes('Not agreed yet'), 'it shows as not agreed yet: ' + await text(a, `founding-${soc}`));

// 4c. Sam's Hub asks him to agree; he agrees from the card and, back on the
// Hub (the same screen, not reloaded), sees the progress bar.
await p.goto(BASE + `/hub/${soc}`); await v(p, 'founding-agree-link').waitFor({ timeout: 20000 });
check((await text(p, 'founding-line')) === 'Agree to the Founding Society terms to start counting your events.', 'before agreeing the card asks him to agree');
await v(p, 'founding-agree-link').click(); await p.waitForURL(/step=founding/, { timeout: 15000 });
await v(p, 'founding-agree').waitFor({ timeout: 20000 }); await v(p, 'founding-agree').click(); await p.waitForURL(/step=committee/, { timeout: 15000 });
check(sql(`select agreed_by from founding_agreements where society_id='${soc}'`) === U1, 'the agreement is stored, by Sam');
await v(p, 'hub-setup-exit').first().click(); await p.waitForURL(new RegExp(`/hub/${soc}$`), { timeout: 15000 });
await v(p, 'founding-bar').waitFor({ timeout: 15000 }).catch(() => errs.push('after agreeing, the Hub shows the progress bar without a reload'));
check((await v(p, 'founding-agree-link').count()) === 0, 'and no longer asks him to agree');
check((await text(p, 'founding-line')) === '0 of 3 events posted, 3 to go for the prize draw', 'progress line after agreeing: ' + await text(p, 'founding-line'));

// 5. Founding Society: agreed 10 days ago, 3 events since, 2 with someone going.
sql(`update founding_agreements set agreed_at = now() - interval '10 days' where society_id='${soc}'`);
const mk = (title, created) => sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${soc}','${title}','social','${venue}',now()+interval '3 days',now()+interval '3 days 3 hours','london') returning id`).split('\n')[0];
const e1 = mk('Req Founding One'), e2 = mk('Req Founding Two'), e3 = mk('Req Founding Three');
sql(`update events set created_at = now() - interval '6 days' where id='${e1}'; update events set created_at = now() - interval '4 days' where id='${e2}'; update events set created_at = now() - interval '2 days' where id='${e3}'`);
sql(`insert into event_entries (event_id,user_id,status) values ('${e1}','${U2}','going'), ('${e2}','${U3}','going')`);
await p.goto(BASE + `/hub/${soc}`); await v(p, 'founding-progress').waitFor({ timeout: 20000 }); await v(p, 'founding-line').waitFor({ timeout: 20000 });
const line = await text(p, 'founding-line'); say('progress line:', line);
check(line.startsWith('3 of 3 events posted') && line.includes('1 to go for the prize draw'), 'Sam sees 3 of 3 events posted, 1 to go: ' + line);
check((await text(p, 'founding-prize')) === 'Not in the prize draw yet', 'not in the prize draw yet');
check((await text(p, 'founding-badge-state')) === 'Badge on', 'badge on');
check((await text(p, 'founding-last-event')) === 'Last event 2 days ago', 'days since the last event: ' + await text(p, 'founding-last-event'));
check((await v(p, 'founding-bar').count()) === 1, 'a progress bar');
await p.screenshot({ path: S + '/expo-hub-founding-progress.png', fullPage: true });
// The admin's Founding Societies list.
await a.goto(BASE + '/admin/hub'); await v(a, `founding-${soc}`).waitFor({ timeout: 20000 });
const row = await text(a, `founding-${soc}`); say('admin founding row:', row);
check(row.includes('Requests Test Society') && row.includes('3 of 3 events since agreeing') && row.includes('2 with someone going') && row.includes('Last event 2 days ago') && row.includes('Prize draw: no') && row.includes('Badge on'), 'the admin row shows the progress');
// Someone going to the third event: in the prize draw.
sql(`insert into event_entries (event_id,user_id,status) values ('${e3}','${U4}','going')`);
await p.reload(); await v(p, 'founding-line').waitFor({ timeout: 20000 });
check((await text(p, 'founding-line')) === "3 of 3 events posted. You're in the prize draw.", 'in the prize draw: ' + await text(p, 'founding-line'));
check((await text(p, 'founding-prize')) === "You're in the prize draw", 'the card says so');
await a.reload(); await v(a, `founding-${soc}`).waitFor({ timeout: 20000 });
check((await text(a, `founding-${soc}`)).includes('Prize draw: yes'), 'the admin sees prize draw: yes');

// 6. The public society page shows the badge (logged out too).
const o = await fresh(); await o.goto(BASE + '/s/req-test-society'); await v(o, 'founding-badge').waitFor({ timeout: 20000 });
check((await text(o, 'founding-badge')).endsWith('Founding Society'), 'the badge on the society page: ' + await text(o, 'founding-badge'));
await o.screenshot({ path: S + '/expo-founding-badge.png' });
// The LSE Poker Society shows no badge.
await o.goto(BASE + '/s/lse-poker-society'); await o.getByText('LSE Poker Society').first().waitFor({ timeout: 20000 }); await o.waitForTimeout(1500);
check((await v(o, 'founding-badge').count()) === 0, 'no badge for LSE Poker Society');

// 7. Everything 40 days old: the badge disappears; the Hub says it's paused.
sql(`update events set created_at = now() - interval '40 days' where society_id='${soc}'; update founding_agreements set agreed_at = now() - interval '40 days' where society_id='${soc}'`);
await o.goto(BASE + '/s/req-test-society'); await o.getByText('Requests Test Society').first().waitFor({ timeout: 20000 }); await o.waitForTimeout(1500);
check((await v(o, 'founding-badge').count()) === 0, 'the badge has gone after 40 days without an event');
await p.reload(); await v(p, 'founding-badge-state').waitFor({ timeout: 20000 });
check((await text(p, 'founding-badge-state')) === 'Badge paused: post an event to turn it back on', 'the Hub says the badge is paused: ' + await text(p, 'founding-badge-state'));
check((await text(p, 'founding-last-event')) === 'Last event 40 days ago', 'last event 40 days ago');
// Posting again turns it back on.
mk('Req Founding Four');
await o.goto(BASE + '/s/req-test-society'); await v(o, 'founding-badge').waitFor({ timeout: 20000 });

// 8. Wide screens: Requests is in the sidebar.
const d = await fresh({ viewport: { width: 1280, height: 800 } }); await login(d, 's1@lse.ac.uk');
await d.goto(BASE + `/hub/${soc}/requests`); await v(d, 'hub-sidebar').waitFor({ timeout: 20000 }); await v(d, `request-${req}`).waitFor({ timeout: 20000 });
check((await v(d, 'hub-sidebar').innerText()).includes('Requests'), 'the sidebar lists Requests');
await d.screenshot({ path: S + '/expo-hub-requests-desktop.png' });

// The LSE Poker Society is unchanged.
const pokerAfter = sql(`select is_founding||'|'||(select count(*) from feature_requests where society_id=s.id)||'|'||(select count(*) from founding_agreements where society_id=s.id) from societies s where s.id='${poker}'`);
check(pokerAfter === pokerBefore, `LSE Poker Society unchanged (${pokerBefore} -> ${pokerAfter})`);

console.log('errors:', errs); await b.close();
