// Expo web build: the Society Hub and its setup (Part 3). Sam manages one
// society (imported, with a description and Instagram): the Me tab links to
// the Hub, /hub goes straight to it, "Finish setting up" opens the setup:
// welcome, page (looks right), type (games), features (tables and ledger
// pre-ticked and saved; event cost unticked; "We want this" for polls), no
// Founding step, committee (Bea added by name, someone invited by email),
// first event (the event form, then back to the last step with the link),
// copy for bio, the story card (and its PNG), WhatsApp, then the Hub home
// without the setup card. A Function admin makes it a Founding Society: the
// Founding step appears and "We're in" stores the agreement; looking
// through another society's setup saves nothing for its committee. The
// browser's back button goes to the step before. Wide screens get the
// sidebar. Adding by email asks for a uni email when the address could never
// sign up. Committee handover: Sam removes himself, Bea (now the
// last manager) can't. Logged out and non-managers are kept out.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; import { readFileSync } from 'fs'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh(extra = devices['iPhone 13']) { const c = await b.newContext({ ...extra, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await v(p, 'mode-signup').click(); await v(p, 'email').fill(email); await v(p, 'send-code').click();
  await v(p, 'code').waitFor({ timeout: 15000 }); await v(p, 'code').fill('123456'); await v(p, 'log-in').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || document.querySelector('[data-testid="new-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {});
  if (await p.getByTestId('skip-password').count()) await v(p, 'skip-password').click();
  else if (await p.getByTestId('new-password').count()) { await v(p, 'new-password').fill('correct horse 42'); await v(p, 'new-password-again').fill('correct horse 42'); await v(p, 'save-password').click(); }
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }); if (p.url().includes('/welcome')) { await v(p, 'full-name').fill('Test Person'); await v(p, 'graduation-year').click(); await v(p, 'graduation-year-2027').click(); await v(p, 'save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U4 = '00000000-0000-0000-0000-000000000004';
// Each setup step is its own page in the history, so earlier steps stay in
// the page (hidden) underneath: look only at what's on screen.
const v = (pg, id) => pg.getByTestId(id).filter({ visible: true });
const checked = async (p, id) => v(p, id).getAttribute('aria-checked');
const text = async (p, id) => (await v(p, id).innerText()).replace(/\s+/g, ' ').trim();

// Seed: an imported LSE society that only Sam manages; Bea has a phone set up for pushes.
const poker = sql(`select id from societies where slug='lse-poker-society'`);
const pokerBefore = sql(`select coalesce(society_type,'none')||'|'||is_founding||'|'||coalesce(onboarded_at::text,'null')||'|'||(select count(*) from society_features where society_id=s.id)||'|'||(select string_agg(user_id::text, ',' order by user_id) from society_admins where society_id=s.id) from societies s where s.id='${poker}'`);
sql(`delete from societies where slug='hub-test-society'; delete from society_admins where user_id in ('${U1}','${U2}'); update profiles set is_admin=false where id in ('${U1}','${U2}')`);
const soc = sql(`insert into societies (slug,name,university,description,instagram,source) values ('hub-test-society','Hub Test Society','LSE','We play board games every Tuesday in the Saw Swee Hock Centre.','hubtestsoc','su_directory') returning id`);
sql(`delete from societies where slug='hub-admin-society'`);
const soc2 = sql(`insert into societies (slug,name,university,society_type) values ('hub-admin-society','Hub Admin Society','LSE','games') returning id`);
sql(`insert into society_admins (society_id,user_id) values ('${soc}','${U1}')`);
sql(`insert into push_tokens (user_id, platform, token) values ('${U2}','ios','ExponentPushToken[hub-bea]') on conflict (token) do nothing; delete from push_queue`);
const venue = sql(`select id from venues limit 1`);

// 0. Logged out, the Hub asks you to log in and come back.
const o = await fresh(); await o.goto(BASE + `/hub/${soc}/setup`); await v(o, 'hub-login').waitFor({ timeout: 20000 });
await v(o, 'hub-login-button').click(); await o.waitForURL(/\/login/, { timeout: 15000 });
check(decodeURIComponent(o.url()).includes(`next=/hub/${soc}/setup`), 'logged out: logging in comes back to the setup (' + decodeURIComponent(o.url()).replace(BASE, '') + ')');

// 1. Sam: the Me tab links to the Hub; /hub goes straight to his one society.
const p = await fresh(); await login(p, 's1@lse.ac.uk');
await p.goto(BASE + '/me'); await v(p, 'society-hub').waitFor({ timeout: 20000 });
await v(p, 'society-hub').click(); await p.waitForURL(new RegExp(`/hub/${soc}$`), { timeout: 20000 });
await v(p, 'hub-finish-setup').waitFor({ timeout: 20000 }); say('landed on', p.url().replace(BASE, ''));

// 2. Welcome.
await v(p, 'hub-finish-setup').click(); await p.waitForURL(new RegExp(`/hub/${soc}/setup`), { timeout: 20000 });
await v(p, 'hub-start').waitFor({ timeout: 20000 });
check((await text(p, 'hub-welcome')).includes('Hub Test Society is on Function.'), 'welcome names the society');
check((await text(p, 'hub-progress')).includes('Step 1 of 7'), 'seven steps (not Founding): ' + await text(p, 'hub-progress'));
check((await v(p, 'hub-start').boundingBox()).height >= 52, 'the main button is at least 52px tall');

// 3. Check your page: imported details shown; nothing missing, so no inputs.
await v(p, 'hub-start').click(); await p.waitForURL(/step=page/, { timeout: 15000 }); await v(p, 'page-preview').waitFor({ timeout: 15000 });
check((await text(p, 'page-preview')).includes('We play board games') && (await text(p, 'page-preview')).includes('@hubtestsoc'), 'the page preview shows the imported description and Instagram');
check((await v(p, 'page-description').count()) === 0 && (await v(p, 'page-instagram').count()) === 0, 'no inputs when nothing is missing');
// Edit reveals the fields, cancel goes back.
await v(p, 'page-edit').click(); await v(p, 'page-edit-name').waitFor({ timeout: 10000 });
check((await v(p, 'page-edit-name').inputValue()) === 'Hub Test Society', 'edit is pre-filled');
await v(p, 'page-cancel').click(); await v(p, 'page-ok').click();

// 4. Type: games.
await p.waitForURL(/step=type/, { timeout: 15000 }); await v(p, 'type-games').waitFor({ timeout: 15000 });
check((await text(p, 'hub-progress')).includes('Step 3 of 7'), 'type is step 3');
check((await v(p, 'type-games').boundingBox()).height >= 64, 'option cards are at least 64px tall');
// The browser's back button goes to the step before, then on again.
await p.goBack(); await p.waitForURL(/step=page/, { timeout: 15000 }); await v(p, 'page-preview').waitFor({ timeout: 15000 });
check((await text(p, 'hub-progress')).includes('Step 2 of 7'), 'back in the browser is the step before: ' + await text(p, 'hub-progress'));
await v(p, 'page-ok').click();
await p.waitForURL(/step=type/, { timeout: 15000 }); await v(p, 'type-games').waitFor({ timeout: 15000 });
await v(p, 'type-games').click();
await p.waitForURL(/step=features/, { timeout: 15000 }); await v(p, 'feature-checklist').waitFor({ timeout: 20000 });
check(sql(`select society_type from societies where id='${soc}'`) === 'games', 'the type is saved');

// 5. Features: pre-ticked and saved; untick event cost; want polls.
for (const k of ['tables', 'ledger', 'event_cost', 'signup_lists', 'event_admin']) check((await checked(p, `feature-${k}`)) === 'true', `${k} pre-ticked for games at LSE`);
check(sql(`select count(*) from society_features where society_id='${soc}'`) === '7', 'the pre-ticked set is saved (7 rows)');
check(sql(`select string_agg(feature_key, ',' order by feature_key) from society_features where society_id='${soc}' and enabled`) === 'event_admin,event_chats,event_cost,ledger,member_invites,signup_lists,tables', 'the saved set matches what is ticked');
await v(p, 'feature-event_cost').click();
await p.waitForFunction(() => document.querySelector('[data-testid="feature-event_cost"]')?.getAttribute('aria-checked') === 'false', null, { timeout: 5000 });
for (let i = 0; i < 20 && sql(`select enabled from society_features where society_id='${soc}' and feature_key='event_cost'`) !== 'f'; i++) await p.waitForTimeout(250);
check(sql(`select enabled from society_features where society_id='${soc}' and feature_key='event_cost'`) === 'f', 'unticking event cost saves it');
check((await v(p, 'soon-polls').innerText()).includes('Coming soon'), 'polls is coming soon');
await v(p, 'want-polls').click(); await v(p, 'wanted-polls').waitFor({ timeout: 10000 });
check((await text(p, 'wanted-polls')).includes("We'll tell you when it's ready"), 'wanting polls says we will tell them');
for (let i = 0; i < 20 && sql(`select count(*) from feature_interest where society_id='${soc}' and feature_key='polls'`) !== '1'; i++) await p.waitForTimeout(250);
check(sql(`select count(*) from feature_interest where society_id='${soc}' and feature_key='polls' and created_by='${U1}'`) === '1', 'the wish for polls is saved');
await p.screenshot({ path: S + '/expo-hub-features.png', fullPage: true });
await v(p, 'features-continue').click();

// 6. No Founding step: straight to the committee.
await p.waitForURL(/step=committee/, { timeout: 15000 }); await v(p, 'manager-list').waitFor({ timeout: 15000 });
check((await text(p, 'hub-progress')).includes('Step 5 of 7'), 'committee is step 5 of 7');
check((await text(p, 'manager-list')).includes('Sam Student (you)'), 'Sam is listed as a manager');
await v(p, 'manager-search').fill('Bea'); await v(p, `manager-result-${U2}`).waitFor({ timeout: 15000 });
check((await text(p, `manager-result-${U2}`)).includes('LSE'), 'search results show the uni: ' + await text(p, `manager-result-${U2}`));
await v(p, `manager-result-${U2}`).click(); await v(p, 'manager-message').waitFor({ timeout: 15000 });
check((await text(p, 'manager-message')) === "Added Bea Brown. They're a manager now.", 'added by name: ' + await text(p, 'manager-message'));
check(sql(`select count(*) from society_admins where society_id='${soc}' and user_id='${U2}'`) === '1', 'Bea is a manager');
check(sql(`select is_admin from profiles where id='${U2}'`) === 'f', 'Bea is not a Function admin');
check(sql(`select count(*) from push_queue where user_id='${U2}' and kind='hub' and url='/hub/${soc}' and body='Open the Society Hub to see it.'`) === '1', 'Bea gets a Society Hub push (opening the society\'s Hub): ' + sql(`select body||'|'||url from push_queue where user_id='${U2}' and kind='hub'`));
await v(p, 'manager-list').getByText('Bea Brown').waitFor({ timeout: 10000 });
check((await v(p, 'manager-email-add').boundingBox()).height >= 52, 'the email Add button is at least 52px tall');
await v(p, 'manager-email').fill('someone@gmail.com'); await v(p, 'manager-email-add').click();
await p.waitForFunction(() => document.querySelector('[data-testid="manager-message"]')?.textContent.includes('uni email'), null, { timeout: 15000 });
check((await text(p, 'manager-message')) === 'Use their uni email: only uni students can sign up.', 'a personal email is refused: ' + await text(p, 'manager-message'));
check(sql(`select count(*) from society_manager_invites where society_id='${soc}' and email='someone@gmail.com'`) === '0', 'no invite kept for it');
await v(p, 'manager-email').fill('Newbie@LSE.ac.uk'); await v(p, 'manager-email-add').click();
await p.waitForFunction(() => document.querySelector('[data-testid="manager-message"]')?.textContent.includes('Invited'), null, { timeout: 15000 });
check((await text(p, 'manager-message')) === "Invited newbie@lse.ac.uk. They'll be a manager as soon as they sign up.", 'invited by email: ' + await text(p, 'manager-message'));
check(sql(`select count(*) from society_manager_invites where society_id='${soc}' and email='newbie@lse.ac.uk'`) === '1', 'the invite is stored');
await v(p, 'manager-invite-newbie@lse.ac.uk').waitFor({ timeout: 10000 });
await v(p, 'committee-continue').click();

// 7. First event: the event form, then back to the last step with its link.
await p.waitForURL(/step=event/, { timeout: 15000 }); await v(p, 'hub-post-event').waitFor({ timeout: 15000 });
const setupScreens = await p.getByTestId('hub-progress').count(); say('setup screens in the history:', setupScreens);
await v(p, 'hub-post-event').click();
await p.waitForURL(new RegExp(`/dashboard/${soc}/events/new\\?from=hub`), { timeout: 15000 }); await v(p, 'ev-title').waitFor({ timeout: 20000 });
check((await v(p, 'ev-cost').count()) === 0 && (await v(p, 'ev-cost-paid').count()) === 0, 'the form follows the features (no cost)');
check((await v(p, 'ev-format-tables').count()) === 1, 'the form offers tables');
await v(p, 'ev-title').fill('Hub Games Night');
await v(p, 'ev-category').click(); await v(p, 'ev-category-social').click();
const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
await v(p, 'ev-start-date').fill(day); await v(p, 'ev-start-time').fill('19:00'); await v(p, 'ev-end-date').fill(day); await v(p, 'ev-end-time').fill('22:00');
await v(p, 'ev-venue').click(); await v(p, `ev-venue-${venue}`).click();
// Event admin is on (LSE, pre-ticked for games): the SU has approved it, so it publishes (Part 5).
check((await v(p, 'ea-section').count()) === 1, 'the form has the Event admin questions');
await v(p, 'su-approved-yes').click(); check((await text(p, 'ev-submit')) === 'Publish event', 'SU approved: the button publishes');
await v(p, 'ev-submit').click();
await p.waitForURL(/step=live/, { timeout: 20000 }); await v(p, 'hub-live').waitFor({ timeout: 20000 });
const ev = sql(`select id from events where society_id='${soc}' and title='Hub Games Night'`);
check(!!ev && p.url().includes(`event=${ev}`), 'the live step knows the new event');
check((await p.getByTestId('hub-progress').count()) === setupScreens, 'posting went back to the setup underneath (no extra setup screen)');
check((await p.getByTestId('ev-title').count()) === 0, 'the event form is closed');
await v(p, 'hub-event-link').waitFor({ timeout: 15000 });
check((await text(p, 'hub-event-published')).includes("Published, here's your link") && (await text(p, 'hub-event-link')) === `https://studentfunction.com/e/${ev}`, 'the event link is shown');
for (let i = 0; i < 20 && sql(`select onboarded_at is not null from societies where id='${soc}'`) !== 't'; i++) await p.waitForTimeout(250);
check(sql(`select onboarded_at is not null from societies where id='${soc}'`) === 't', 'finishing the setup is recorded');
// Copy for the Instagram bio.
await v(p, 'copy-bio-link').click(); await v(p, 'copy-bio-link').getByText('Copied').waitFor({ timeout: 5000 });
check((await p.evaluate(() => navigator.clipboard.readText())) === 'https://studentfunction.com/s/hub-test-society', 'the bio link is the society page');
// The story card, and its image.
await v(p, 'share-story').click(); await v(p, 'story-card').waitFor({ timeout: 10000 });
const story = await text(p, 'story-card'); say('story card:', story);
check(story.includes('Hub Games Night') && story.includes('RSVP on Function') && story.includes(`studentfunction.com/e/${ev}`) && story.toUpperCase().includes('HUB TEST SOCIETY'), 'the story card has the event, RSVP on Function and the link');
const box = await v(p, 'story-card').boundingBox(); check(Math.abs(box.height / box.width - 16 / 9) < 0.02, `the story card is 9:16 (${Math.round(box.width)}x${Math.round(box.height)})`);
const [download] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), v(p, 'story-download').click()]);
const png = readFileSync(await download.path());
check(download.suggestedFilename() === 'hub-test-society-story.png', 'the image is named after the society');
check(png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1920, `the image is a 1080x1920 PNG (${png.readUInt32BE(16)}x${png.readUInt32BE(20)})`);
check((await v(p, 'share-whatsapp').count()) === 1, 'Share on WhatsApp is offered');
await p.screenshot({ path: S + '/expo-hub-live.png', fullPage: true });
// Done: the Hub home, without the setup card.
await v(p, 'hub-done').click(); await p.waitForURL(new RegExp(`/hub/${soc}$`), { timeout: 15000 }); await v(p, 'hub-card-page').first().waitFor({ timeout: 15000 });
await p.waitForTimeout(500);
check((await p.getByTestId('hub-card-page').count()) === 1, 'back to the Hub home underneath (one home screen)');
check((await p.getByTestId('hub-progress').count()) === 0, 'the setup steps are closed');
check((await v(p, 'hub-finish-setup').count()) === 0, 'no setup card once it is done');
check((await text(p, 'hub-card-committee')).includes('2 managers'), 'the committee card counts 2 managers');
check((await text(p, 'hub-card-features')).includes('6 features on'), 'the features card counts 6 on: ' + await text(p, 'hub-card-features'));
await p.screenshot({ path: S + '/expo-hub-home.png', fullPage: true });

// 8. A Function admin (Sky) makes it a Founding Society; the admin page shows it finished setting up.
sql(`update profiles set is_admin=true where id='${U4}'`);
const a = await fresh(); await login(a, 's4@lse.ac.uk');
await a.goto(BASE + '/admin/societies'); await v(a, 'admin-society-search').fill('Hub Test');
await v(a, `admin-society-${soc}`).waitFor({ timeout: 20000 }); await v(a, `admin-society-${soc}`).click();
await v(a, 'founding-switch').waitFor({ timeout: 15000 });
check((await text(a, 'society-onboarded')).includes('Finished setting up its Hub on'), 'the admin sees the society finished setting up');
check((await checked(a, 'founding-switch')) === 'false', 'not Founding yet');
await v(a, 'founding-switch').click();
for (let i = 0; i < 20 && sql(`select is_founding from societies where id='${soc}'`) !== 't'; i++) await a.waitForTimeout(250);
check(sql(`select is_founding from societies where id='${soc}'`) === 't', 'the Founding switch saves');
check((await checked(a, 'founding-switch')) === 'true', 'the switch shows on');

// The Founding step now appears for Sam, and "We're in" stores the agreement.
await p.goto(BASE + `/hub/${soc}/setup?step=founding`); await v(p, 'founding-agree').waitFor({ timeout: 20000 });
check((await text(p, 'hub-progress')).includes('Step 5 of 8'), 'Founding adds a step: ' + await text(p, 'hub-progress'));
check((await text(p, 'founding-function')).includes('Building one feature around how you run within 24 hours of your request') && (await text(p, 'founding-society')).includes('Adding the Function link to your Instagram bio for launch week'), 'both lists of commitments');
check((await text(p, 'founding-stay-active')).startsWith('The badge, prize draw entry and 24-hour builds stay active'), 'the stay-active line');
await p.screenshot({ path: S + '/expo-hub-founding.png', fullPage: true });
await v(p, 'founding-agree').click(); await p.waitForURL(/step=committee/, { timeout: 15000 });
check(sql(`select count(*) from founding_agreements where society_id='${soc}' and agreed_by='${U1}' and events_target=3`) === '1', 'the agreement is stored');
await p.goto(BASE + `/hub/${soc}/setup?step=founding`); await v(p, 'founding-agreed').waitFor({ timeout: 20000 });
check((await text(p, 'founding-agreed')).startsWith("You're a Founding Society since"), 'already agreed: since when');

// Sky looking through another society's setup saves nothing for its committee.
await a.goto(BASE + `/hub/${soc2}/setup?step=type`); await v(a, 'type-arts').waitFor({ timeout: 20000 });
await v(a, 'type-arts').click(); await a.waitForURL(/step=features/, { timeout: 15000 }); await v(a, 'feature-checklist').waitFor({ timeout: 20000 });
await a.waitForTimeout(1000);
check((await checked(a, 'feature-tables')) === 'true', 'the admin sees the pre-ticks for its type');
check(sql(`select count(*) from society_features where society_id='${soc2}'`) === '0', 'an admin looking at the features step saves none');
check(sql(`select society_type from societies where id='${soc2}'`) === 'games', 'nor the type');

// 9. Wide screens get the sidebar.
const d = await fresh({ viewport: { width: 1280, height: 800 } }); await login(d, 's1@lse.ac.uk');
await d.goto(BASE + `/hub/${soc}`); await v(d, 'hub-sidebar').waitFor({ timeout: 20000 });
check((await v(d, 'hub-sidebar').innerText()).includes('Committee'), 'the sidebar lists the sections');
await d.screenshot({ path: S + '/expo-hub-desktop.png' });
await d.goto(BASE + `/hub/${soc}/setup?step=features`); await v(d, 'hub-sidebar').waitFor({ timeout: 20000 }); await v(d, 'feature-checklist').waitFor({ timeout: 20000 });
check((await v(d, 'hub-sidebar').innerText()).includes('Founding Society'), 'the setup sidebar lists the steps');
await d.screenshot({ path: S + '/expo-hub-desktop-setup.png' });
await d.goto(BASE + `/hub/${soc}/features`); await v(d, 'feature-checklist').waitFor({ timeout: 20000 });
// "We want this" stays disabled until its saved state has loaded; wait for that, not just the list.
for (let t = 0; t < 40 && (await checked(d, 'want-polls')) !== 'true'; t++) await d.waitForTimeout(250);
check((await checked(d, 'feature-event_cost')) === 'false' && (await checked(d, 'want-polls')) === 'true', 'the Features page shows what was saved');

// 10. Bea: the Me tab and the society page lead to the Hub.
const e = await fresh(); await login(e, 's2@lse.ac.uk');
await e.goto(BASE + '/me'); await v(e, 'society-hub').waitFor({ timeout: 20000 });
await e.goto(BASE + '/s/hub-test-society'); await v(e, 'open-hub').waitFor({ timeout: 20000 });
check((await v(e, 'open-dashboard').count()) === 1, 'the dashboard link is still there');

// 11. Committee handover: Sam removes himself and lands on /hub; Bea is then the last manager and can't.
await p.goto(BASE + `/hub/${soc}/committee`); await v(p, 'leave-management').waitFor({ timeout: 20000 });
await v(p, 'leave-management').click(); await p.waitForURL(new RegExp(`/hub$`), { timeout: 20000 }); await v(p, 'hub-none').waitFor({ timeout: 20000 });
check(sql(`select count(*) from society_admins where society_id='${soc}' and user_id='${U1}'`) === '0', 'Sam is no longer a manager');
await p.goto(BASE + `/hub/${soc}`); await v(p, 'hub-no-access').waitFor({ timeout: 20000 });
await p.goto(BASE + '/me'); await v(p, 'my-profile').waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
check((await v(p, 'society-hub').count()) === 0, 'no Society Hub row once you run nothing');
await e.goto(BASE + `/hub/${soc}/committee`); await v(e, 'leave-management').waitFor({ timeout: 20000 });
await v(e, 'leave-management').click(); await v(e, 'leave-error').waitFor({ timeout: 15000 });
check((await text(e, 'leave-error')) === "You're the last manager. Add someone else first, then remove yourself.", 'the last manager is told why');
check(sql(`select count(*) from society_admins where society_id='${soc}' and user_id='${U2}'`) === '1', 'Bea is still the manager');

// 12. A student who doesn't manage it is kept out; the LSE Poker Society is unchanged.
const c = await fresh(); await login(c, 's3@lse.ac.uk'); await c.goto(BASE + `/hub/${soc}/setup`); await v(c, 'hub-no-access').waitFor({ timeout: 20000 });
await c.goto(BASE + '/hub'); await v(c, 'hub-none').waitFor({ timeout: 20000 });
check((await v(c, 'hub-claim').count()) === 1, 'someone who runs nothing is pointed to asking to manage a society');
const pokerAfter = sql(`select coalesce(society_type,'none')||'|'||is_founding||'|'||coalesce(onboarded_at::text,'null')||'|'||(select count(*) from society_features where society_id=s.id)||'|'||(select string_agg(user_id::text, ',' order by user_id) from society_admins where society_id=s.id) from societies s where s.id='${poker}'`);
check(pokerAfter === pokerBefore, `LSE Poker Society unchanged (${pokerBefore} -> ${pokerAfter})`);

console.log('errors:', errs); await b.close();
