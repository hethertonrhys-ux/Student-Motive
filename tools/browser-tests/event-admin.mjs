// Expo web build: event admin, drafts and the LSE approval gate (Part 5a).
// EA Test Society (LSE, Event admin on, Sam manages it; Bea is a member with
// a phone set up): Sam posts an event with an external speaker and "Not
// yet" -> it's a draft (Draft pill, the draft banner on the dashboard, no
// push), the summary names the Large / External Speaker form; logged out and
// Bea can't open it; Sam ticks "SU approved" on the event page and
// publishes it -> Bea sees it and gets the push once. An event with 80
// people and "Yes" publishes straight away; editing it keeps its answers. A
// late event warns. From the Hub's setup, "Not yet" says it's saved as a
// draft. A UCL society says event admin isn't available; the LSE Poker
// Society (from before features) posts exactly as before.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh() { const c = await b.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
// Hidden pages (e.g. the Hub's earlier steps) stay in the page: look only at what's on screen.
const v = (pg, id) => pg.getByTestId(id).filter({ visible: true });
const text = async (p, id) => (await v(p, id).first().innerText()).replace(/\s+/g, ' ').trim();
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002';
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const waitFor = async (p, fn, what) => { for (let i = 0; i < 40; i++) { if (fn()) return true; await p.waitForTimeout(250); } check(false, what); return false; };

// Seed.
const poker = sql(`select id from societies where slug='lse-poker-society'`);
const campus = sql(`select id from venues where kind='campus' order by name limit 1`);
sql(`delete from societies where slug in ('ea-test-society','ea-ucl-society'); delete from events where title like 'EA %'; delete from push_queue`);
const soc = sql(`insert into societies (slug,name,university) values ('ea-test-society','EA Test Society','LSE') returning id`);
const ucl = sql(`insert into societies (slug,name,university) values ('ea-ucl-society','EA UCL Society','UCL') returning id`);
sql(`insert into society_admins (society_id,user_id) values ('${soc}','${U1}'),('${ucl}','${U1}'); insert into society_features (society_id,feature_key,enabled) values ('${soc}','event_admin',true),('${ucl}','event_admin',true)`);
sql(`insert into society_members (society_id,user_id,status,approved_at) values ('${soc}','${U2}','approved',now()) on conflict do nothing; insert into push_tokens (user_id, platform, token) values ('${U2}','ios','ExponentPushToken[ea-bea]') on conflict (token) do nothing`);
say('poker event_admin:', sql(`select society_feature_on('${poker}','event_admin')`), '· EA Test Society:', sql(`select society_feature_on('${soc}','event_admin')`));

async function fillEvent(p, title, date) {
  await v(p, 'ev-title').fill(title);
  await v(p, 'ev-category').click(); await v(p, 'ev-category-talks').click();
  await v(p, 'ev-start-date').fill(date); await v(p, 'ev-start-time').fill('18:30'); await v(p, 'ev-end-date').fill(date); await v(p, 'ev-end-time').fill('20:30');
  await v(p, 'ev-venue').click(); await v(p, `ev-venue-${campus}`).click();
}

// 1. Sam posts a talk with an external speaker; the SU hasn't approved it yet.
const p = await fresh(); await login(p, 's1@lse.ac.uk');
await p.goto(BASE + `/dashboard/${soc}`); await v(p, 'no-upcoming').waitFor({ timeout: 20000 });
check((await text(p, 'no-upcoming')).includes('it goes live once your committee ticks “SU approved”'), 'the empty dashboard says events wait for "SU approved": ' + await text(p, 'no-upcoming'));
await p.goto(BASE + `/dashboard/${soc}/events/new`); await v(p, 'ev-title').waitFor({ timeout: 20000 });
await v(p, 'ea-section').waitFor({ timeout: 15000 });
check((await text(p, 'ea-section')).includes('Function prepares the SU paperwork for this event; your committee checks and submits it.'), 'the section says Function prepares the paperwork and the committee submits it');
await fillEvent(p, 'EA Speaker Talk', day(60));
check((await v(p, 'ea-venue-campus').getAttribute('aria-checked')) === 'true', 'a campus venue pre-fills "LSE campus"');
check((await text(p, 'ea-summary')).startsWith('Regular Event Form · submit by'), 'starts as the regular form: ' + await text(p, 'ea-summary'));
await v(p, 'ea-speaker-yes').click();
await v(p, 'ea-speaker-names').fill('Dr Ada Lovelace'); await v(p, 'ea-speaker-org').fill('Royal Society');
await v(p, 'ea-public-yes').click();
await v(p, 'ea-attendees').fill('60');
await v(p, 'ea-budget').fill('120');
await v(p, 'ea-cost-add').click(); await v(p, 'ea-cost-label-0').fill('Speaker travel'); await v(p, 'ea-cost-amount-0').fill('45.50');
const summary = await text(p, 'ea-summary'); say('summary:', summary);
check(summary.startsWith('Large / External Speaker Event Form · submit by'), 'an external speaker makes it the Large / External Speaker form');
check((await v(p, 'ea-late').count()) === 0, 'two months ahead is not late');
check((await v(p, 'su-approved-no').getAttribute('aria-checked')) === 'true', '"Not yet" is the starting answer');
check((await text(p, 'ev-submit')) === 'Save as draft', 'Not yet: the button saves a draft');
await p.screenshot({ path: S + '/expo-event-admin-form.png', fullPage: true });
await v(p, 'ev-submit').click();
await p.waitForURL(/posted=1.*draft=1|draft=1.*posted=1/, { timeout: 20000 }); await v(p, 'posted-draft').waitFor({ timeout: 15000 });
check((await text(p, 'posted-draft')).includes('Saved as a draft. It goes live once your committee ticks'), 'the dashboard says it was saved as a draft');
const ev1 = sql(`select id from events where title='EA Speaker Talk'`);
check(sql(`select is_draft from events where id='${ev1}'`) === 't', 'the event is a draft');
const row = sql(`select form||'|'||external_speaker||'|'||speaker_names||'|'||speaker_org||'|'||open_to_public||'|'||expected_attendees||'|'||budget_pence||'|'||(cost_lines->0->>'pence')||'|'||venue_type||'|'||(submit_by is not null)||'|'||(su_approved_at is null)||'|'||(deadlines ? 'academic_chair') from event_admin where event_id='${ev1}'`);
say('event_admin:', row); check(row === 'large|true|Dr Ada Lovelace|Royal Society|true|60|12000|4550|campus|true|true|true', 'the answers, form and deadlines are saved: ' + row);
await v(p, `dash-event-${ev1}`).waitFor({ timeout: 15000 });
check((await v(p, `dash-event-${ev1}`).getByTestId('draft-pill').count()) === 1, 'the dashboard marks it Draft');
check(sql(`select count(*) from push_queue where dedupe_key like 'society-event:${ev1}:%'`) === '0', 'no push for a draft');
// The society page and the feed leave it out, even for its manager.
await p.goto(BASE + '/s/ea-test-society'); await p.getByText('EA Test Society').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
check((await p.getByTestId(`event-${ev1}`).count()) === 0, 'the society page leaves the draft out');

// 2. Nobody else can open it.
const o = await fresh(); await o.goto(BASE + '/e/' + ev1); await o.getByText('Event not found').waitFor({ timeout: 20000 }); say('logged out: not found');
const bea = await fresh(); await login(bea, 's2@lse.ac.uk'); await bea.goto(BASE + '/e/' + ev1); await bea.getByText('Event not found').waitFor({ timeout: 20000 }); say('Bea: not found');

// 3. Sam ticks "SU approved" on the event page and publishes it.
await p.goto(BASE + '/e/' + ev1); await v(p, 'draft-banner').waitFor({ timeout: 20000 });
check((await text(p, 'draft-banner')).includes('Draft: only your committee can see this.'), 'the draft banner');
check((await v(p, 'join').count()) === 0 && (await v(p, 'leave').count()) === 0 && (await v(p, 'share').count()) === 0, 'no RSVP or share on a draft');
check((await v(p, 'draft-admin-link').count()) === 1, 'a link to the event admin card');
check((await text(p, 'draft-admin-link')) === 'Event admin and checklist →', 'the link says where it goes: ' + await text(p, 'draft-admin-link'));
check(((await v(p, 'draft-admin-link').getAttribute('href')) ?? '').endsWith(`/dashboard/${soc}/events/${ev1}`), 'the link opens the manage screen, where the Event admin card is (Part 5b)');
await v(p, 'draft-su-approved').waitFor({ timeout: 15000 });
check((await v(p, 'draft-publish').getAttribute('aria-disabled')) === 'true', 'Publish waits for "SU approved"');
await v(p, 'draft-su-approved').click();
await waitFor(p, () => sql(`select su_approved_at is not null from event_admin where event_id='${ev1}'`) === 't', '"SU approved" is saved');
check(sql(`select su_approved_by from event_admin where event_id='${ev1}'`) === U1, 'it records who ticked it');
await p.waitForFunction(() => document.querySelector('[data-testid="draft-publish"]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 15000 });
await p.screenshot({ path: S + '/expo-event-admin-draft.png', fullPage: true });
await v(p, 'draft-publish').click();
await waitFor(p, () => sql(`select is_draft from events where id='${ev1}'`) === 'f', 'publishing clears the draft');
await p.waitForTimeout(800); check((await v(p, 'draft-banner').count()) === 0, 'the banner goes once it is published');
check(sql(`select count(*) from push_queue where dedupe_key='society-event:${ev1}:${U2}'`) === '1', 'publishing sends Bea the new-event push once');
await bea.goto(BASE + '/e/' + ev1); await bea.getByText('EA Speaker Talk').first().waitFor({ timeout: 20000 }); say('Bea can see it now');
await v(bea, 'join').waitFor({ timeout: 15000 }); check((await v(bea, 'share').count()) === 1, 'RSVP and share appear once published');

// 4. 80 people and "Yes": published straight away; editing keeps the answers.
await p.goto(BASE + `/dashboard/${soc}/events/new`); await v(p, 'ev-title').waitFor({ timeout: 20000 }); await v(p, 'ea-section').waitFor({ timeout: 15000 });
await fillEvent(p, 'EA Big Social', day(45));
await v(p, 'ea-attendees').fill('80');
check((await text(p, 'ea-summary')).startsWith('Large / External Speaker Event Form'), 'more than 75 people makes it the large form');
await v(p, 'su-approved-yes').click(); check((await text(p, 'ev-submit')) === 'Publish event', 'Yes: the button publishes');
await v(p, 'ev-submit').click();
await p.waitForURL(/posted=1/, { timeout: 20000 }); await v(p, 'posted').waitFor({ timeout: 15000 });
check(!p.url().includes('draft=1'), 'not a draft');
const ev2 = sql(`select id from events where title='EA Big Social'`);
check(sql(`select is_draft from events where id='${ev2}'`) === 'f', 'the second event is published');
check(sql(`select form||'|'||expected_attendees||'|'||(su_approved_at is not null) from event_admin where event_id='${ev2}'`) === 'large|80|true', 'its answers and approval are saved');
await p.goto(BASE + `/dashboard/${soc}/events/${ev2}/edit`); await v(p, 'ea-section').waitFor({ timeout: 20000 });
check((await v(p, 'ea-attendees').inputValue()) === '80', 'editing starts from the saved answers');
check((await v(p, 'su-approved-yes').getAttribute('aria-checked')) === 'true', 'and shows it as SU approved');
check((await text(p, 'ev-submit')) === 'Save changes', 'a published event is saved, not published again');

// 5. A late event says so.
await p.goto(BASE + `/dashboard/${soc}/events/new`); await v(p, 'ev-title').waitFor({ timeout: 20000 }); await v(p, 'ea-section').waitFor({ timeout: 15000 });
await fillEvent(p, 'EA Late Night', day(3));
await v(p, 'ea-late').waitFor({ timeout: 10000 });
check((await text(p, 'ea-late')) === "This is already late: LSESU asks for 10 working days' notice.", 'late warning: ' + await text(p, 'ea-late'));
// A paid event asks for its Native link, which becomes the ticket link.
await v(p, 'ev-cost-paid').click(); await v(p, 'ev-cost-amount').fill('5');
await v(p, 'ea-native').waitFor({ timeout: 10000 });
check((await v(p, 'ev-ticket').count()) === 0, 'the Native link takes the place of the ticket link');
check((await p.getByText("Native is LSESU's only approved ticketing. Function doesn't take payments.").count()) === 1, 'the Native note');

// 6. From the Hub's setup, "Not yet" ends on the last step with the draft wording.
await p.goto(BASE + `/dashboard/${soc}/events/new?from=hub`); await v(p, 'ev-title').waitFor({ timeout: 20000 }); await v(p, 'ea-section').waitFor({ timeout: 15000 });
await fillEvent(p, 'EA Hub Draft', day(50));
await v(p, 'ev-submit').click();
await p.waitForURL(/step=live/, { timeout: 20000 }); await v(p, 'hub-live').waitFor({ timeout: 20000 });
check(p.url().includes('draft=1'), 'the last step knows it is a draft');
await v(p, 'hub-event-draft').waitFor({ timeout: 15000 });
check((await text(p, 'hub-event-draft')).includes('Saved as a draft. It goes live once your committee ticks'), 'the Hub says it is saved as a draft');
check((await v(p, 'hub-event-link').count()) === 0, 'no event link for a draft');
check((await text(p, 'bio-link')) === 'https://studentfunction.com/s/ea-test-society', 'the society link is shown');
check(sql(`select is_draft from events where title='EA Hub Draft'`) === 't', 'the Hub event is a draft');

// 7. A UCL society: event admin isn't available there.
await p.goto(BASE + `/dashboard/${ucl}/events/new`); await v(p, 'ev-title').waitFor({ timeout: 20000 }); await v(p, 'ea-unavailable').waitFor({ timeout: 15000 });
check((await text(p, 'ea-unavailable')).includes("Event admin isn't available for your uni yet"), 'UCL: not available yet');
check((await v(p, 'ea-section').count()) === 0 && (await text(p, 'ev-submit')) === 'Post event', 'UCL: no questions, posts as before');

// 8. The LSE Poker Society (from before features, Event admin off) posts exactly as before.
const c = await fresh(); await login(c, 'committee@lse.ac.uk');
await c.goto(BASE + `/dashboard/${poker}/events/new`); await v(c, 'ev-title').waitFor({ timeout: 20000 }); await c.waitForTimeout(600);
check((await v(c, 'ea-section').count()) === 0 && (await v(c, 'ea-unavailable').count()) === 0, 'Poker: no Event admin section');
check((await text(c, 'ev-submit')) === 'Post event', 'Poker: the button still says Post event');
await fillEvent(c, 'EA Poker Night', day(5));
await v(c, 'ev-submit').click(); await c.waitForURL(/posted=1/, { timeout: 20000 }); await v(c, 'posted').waitFor({ timeout: 15000 });
check(!c.url().includes('draft=1'), 'Poker: no draft');
check(sql(`select is_draft::text||'|'||(select count(*) from event_admin a where a.event_id=e.id) from events e where title='EA Poker Night'`) === 'false|0', 'Poker: published, with no event admin row');

console.log('errors:', errs); await b.close();
