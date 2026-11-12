// Expo web build: the Event admin card on the committee's manage-event
// screen (Part 5b). EAC Test Society (LSE, Event admin on, Sam manages it):
// a paid draft talk in 6 days with an external speaker, open to the public,
// non-LSE guests (Uma from UCL is going, and Bea from LSE) -> the card shows
// the Large / External Speaker form, the late warning, the notes and the
// checklist (academic chair, Native tickets, Security list); ticking "Form
// submitted" is saved and survives a reload; "Risk assessment and budget:
// coming soon" with no download button; the hazards and budget previews;
// "Draft email to Security" opens a mailto: with the speaker and Uma's name
// but no email address and not Bea; ticking "SU approved" offers "Publish
// now", which publishes it. The event page then shows the Native ticket
// link. An event without answers asks for them; the draft banner links to
// the card. The LSE Poker Society's manage screen has no card.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh() {
  const c = await b.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
  // Record what the app opens (mailto: links, ticket pages) instead of opening it.
  await c.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p;
}
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
const v = (pg, id) => pg.getByTestId(id).filter({ visible: true });
const text = async (p, id) => (await v(p, id).first().innerText()).replace(/\s+/g, ' ').trim();
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', UMA = '00000000-0000-0000-0000-0000000000ec';
const waitFor = async (p, fn, what) => { for (let i = 0; i < 40; i++) { if (fn()) return true; await p.waitForTimeout(250); } check(false, what); return false; };

// Seed.
const poker = sql(`select id from societies where slug='lse-poker-society'`);
const campus = sql(`select id from venues where kind='campus' order by name limit 1`);
const campusName = sql(`select name from venues where id='${campus}'`);
sql(`delete from societies where slug='eac-test-society'; delete from events where title like 'EAC %'`);
const soc = sql(`insert into societies (slug,name,university) values ('eac-test-society','EAC Test Society','LSE') returning id`);
sql(`insert into society_admins (society_id,user_id) values ('${soc}','${U1}'); insert into society_features (society_id,feature_key,enabled) values ('${soc}','event_admin',true)`);
// Uma studies at UCL (her profile's uni comes from her email).
sql(`insert into auth.users (id,email) values ('${UMA}','eac-guest@ucl.ac.uk') on conflict (id) do nothing; update profiles set display_name='Uma', full_name='Uma Clarke' where id='${UMA}'`);
say('Uma uni:', sql(`select university from profiles where id='${UMA}'`), '· Bea uni:', sql(`select university from profiles where id='${U2}'`));
// A paid draft talk in 6 days: a month's notice is already past.
const ev = sql(`insert into events (society_id,title,category,venue_id,location_note,starts_at,ends_at,audience,is_draft,cost_pence,ticket_url)
  values ('${soc}','EAC Speaker Night','talks','${campus}','Room 2.06',date_trunc('day', now() + interval '6 days') + interval '18 hours',date_trunc('day', now() + interval '6 days') + interval '20 hours','london',true,500,'https://native.fm/e/eac-speaker-night') returning id`);
sql(`insert into event_admin (event_id,expected_attendees,venue_type,external_speaker,speaker_names,speaker_org,non_lse_guests,open_to_public,budget_pence,cost_lines,native_url,form)
  values ('${ev}',60,'campus',true,'Dr Ada Lovelace','Royal Society',true,true,12000,'[{"label":"Speaker travel","pence":4550},{"label":"Pizza","pence":3000}]'::jsonb,'https://native.fm/e/eac-speaker-night','large')`);
sql(`insert into event_entries (event_id,user_id,status) values ('${ev}','${UMA}','going'),('${ev}','${U2}','going')`);
// A second draft with no answers yet.
const ev2 = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience,is_draft) values ('${soc}','EAC No Answers','social','${campus}',now() + interval '40 days',now() + interval '40 days 2 hours','london',true) returning id`);
say('cost lines:', sql(`select jsonb_array_length(cost_lines) from event_admin where event_id='${ev}'`));

// 1. Sam opens the manage screen.
const p = await fresh(); await login(p, 's1@lse.ac.uk');
await p.goto(BASE + `/dashboard/${soc}/events/${ev}`); await v(p, 'event-admin-card').waitFor({ timeout: 20000 });
await v(p, 'ea-form').waitFor({ timeout: 15000 });
check((await text(p, 'ea-prepares')) === 'Function prepares drafts; your committee checks and submits them.', 'the card says Function prepares drafts and the committee submits them');
check((await text(p, 'ea-form')) === 'Large / External Speaker Event Form', 'the Large form: ' + await text(p, 'ea-form'));
check((await text(p, 'ea-why')).includes("There's an external speaker or organisation."), 'why: ' + await text(p, 'ea-why'));
const submitBy = await text(p, 'ea-submit-by'); say('submit by:', submitBy);
check(/^Submit by \w{3} \d{1,2} \w{3} \d{4} \(late\)$/.test(submitBy), 'submit-by date, marked late: ' + submitBy);
check((await text(p, 'ea-late-warning')) === "This is already late. LSESU asks for 1 month's notice: submit it as soon as you can and tell the SU it's late.", 'the late warning: ' + await text(p, 'ea-late-warning'));
const notes = await text(p, 'ea-notes');
for (const bit of ['Podio', 'approved by LSESU before', '5 working days', 'Native is LSESU', 'LSE academic to chair', "Security reception"]) check(notes.includes(bit), 'note about ' + bit + ': ' + notes);
for (const key of ['form_submitted', 'su_approved', 'room_confirmed', 'academic_chair', 'native_tickets', 'security_list']) check((await v(p, `check-${key}`).count()) === 1, 'checklist item ' + key);
check((await text(p, 'check-academic_chair')).startsWith('Academic chair secured'), 'the academic chair item: ' + await text(p, 'check-academic_chair'));
check((await text(p, 'check-native_tickets')).startsWith('Native tickets set up'), 'the Native tickets item');
check((await text(p, 'check-security_list')).startsWith('Security guest list sent'), 'the Security list item');
check(/(Due|Was due) \w{3} \d{1,2} \w{3} \d{4}/.test(await text(p, 'check-security_list')), 'each item shows its deadline: ' + await text(p, 'check-security_list'));
check((await text(p, 'check-form_submitted')).includes('Was due'), 'the overdue form says "Was due"');
check((await v(p, 'ea-not-needed').count()) === 0, 'every item is needed for this event');
// The paperwork: coming soon, and no download button.
check((await text(p, 'ea-docs-coming-soon')).startsWith('Risk assessment and budget: coming soon'), 'risk assessment and budget: coming soon');
check((await p.getByText(/download/i).count()) === 0, 'no download button');
check((await text(p, 'ea-hazards')).includes('What Function will use to prepare the risk assessment draft'), 'the hazards are labelled as what Function will use');
check((await text(p, 'ea-hazard-external_speaker')).includes("Who's at risk: The speaker and the audience"), 'the external speaker hazard, who is at risk');
check((await text(p, 'ea-rating-external_speaker')) === 'Medium', 'open to the public: a medium rating');
check((await text(p, 'ea-rating-crowding')) === 'Medium', '60 people: crowding is medium');
check((await text(p, 'ea-budget-preview')).includes('What Function will use to prepare the budget draft'), 'the budget is labelled as what Function will use');
check((await text(p, 'ea-cost-0')) === 'Speaker travel £45.50', 'cost line: ' + await text(p, 'ea-cost-0'));
check((await text(p, 'ea-budget-total')) === 'Total £120', 'the total: ' + await text(p, 'ea-budget-total'));
check(((await v(p, 'ea-edit-answers').getAttribute('href')) ?? '').endsWith(`/dashboard/${soc}/events/${ev}/edit`), 'Edit answers opens the event form');
check((await v(p, 'ea-publish').count()) === 0, 'no Publish before "SU approved"');
check((await text(p, 'ea-draft-note')).startsWith('Draft: only your committee can see this event.'), 'the draft note');
await p.screenshot({ path: S + '/expo-event-admin-card.png', fullPage: true });

// 2. Ticking "Form submitted" is saved, and survives a reload.
check((await v(p, 'check-form_submitted').getAttribute('aria-checked')) === 'false', 'the form starts unticked');
await v(p, 'check-form_submitted').click();
await waitFor(p, () => sql(`select checklist->'form_submitted'->>'done_by' from event_admin where event_id='${ev}'`) === U1, 'ticking "Form submitted" saves who ticked it');
check(sql(`select (checklist->'form_submitted'->>'done_at')::timestamptz > now() - interval '5 minutes' from event_admin where event_id='${ev}'`) === 't', 'and when');
await p.waitForFunction(() => document.querySelector('[data-testid="check-form_submitted"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 15000 });
await p.waitForTimeout(500); check((await v(p, 'ea-late-warning').count()) === 0, 'the late warning goes once the form is submitted');
check(/^Submit by \w{3} \d{1,2} \w{3} \d{4} \(submitted\)$/.test(await text(p, 'ea-submit-by')), 'the submit-by line says submitted, not late: ' + await text(p, 'ea-submit-by'));
await p.reload(); await v(p, 'check-form_submitted').waitFor({ timeout: 20000 });
check((await v(p, 'check-form_submitted').getAttribute('aria-checked')) === 'true', 'still ticked after a reload');
check((await text(p, 'check-form_submitted')).includes('Done'), 'it says when it was done: ' + await text(p, 'check-form_submitted'));
check(sql(`select su_approved_at is null from event_admin where event_id='${ev}'`) === 't', 'ticking the form does not tick SU approved');

// 3. Draft email to Security.
await v(p, 'ea-security-email').waitFor({ timeout: 15000 });
await p.waitForFunction(() => document.querySelector('[data-testid="ea-security-email"]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 15000 });
check((await text(p, 'ea-security-summary')).includes('lists 1 guest so far'), 'one non-LSE guest going: ' + await text(p, 'ea-security-summary'));
await v(p, 'ea-security-email').click();
await p.waitForTimeout(500);
const opened = await p.evaluate(() => window.__opened);
const mail = opened.find((u) => u.startsWith('mailto:')) ?? '';
say('mailto:', mail.slice(0, 120) + '…');
check(mail.startsWith('mailto:?subject='), 'opens a mailto: with an empty To');
const decoded = decodeURIComponent(mail);
check(decoded.includes('Guest list: EAC Speaker Night, '), 'the subject names the event');
check(decoded.includes("body=Add your building's Security reception email above."), 'the body starts by asking for the Security address');
check(decoded.includes('Dr Ada Lovelace') && decoded.includes('Royal Society'), 'the speaker and organisation are in it');
check(decoded.includes('Uma Clarke'), 'the UCL attendee is in it, by full name');
check(!decoded.includes('eac-guest') && !decoded.includes('@'), 'no email address in it');
check(!decoded.includes('Bea'), 'LSE attendees are not listed');
check(decoded.includes(`Venue: ${campusName} · Room 2.06`), 'the venue is in it');
check(sql(`select checklist ? 'security_list' from event_admin where event_id='${ev}'`) === 'f', 'drafting the email does not tick the item');

// 4. "SU approved" offers Publish now, which publishes it.
await v(p, 'check-su_approved').click();
await waitFor(p, () => sql(`select su_approved_at is not null from event_admin where event_id='${ev}'`) === 't', '"SU approved" is saved');
check(sql(`select su_approved_by from event_admin where event_id='${ev}'`) === U1, 'it records who ticked it');
await v(p, 'ea-publish').waitFor({ timeout: 15000 });
check(sql(`select is_draft from events where id='${ev}'`) === 't', 'still a draft until Publish now');
await v(p, 'ea-publish').click();
await waitFor(p, () => sql(`select is_draft from events where id='${ev}'`) === 'f', 'Publish now publishes it');
await p.waitForTimeout(800);
check((await v(p, 'ea-publish').count()) === 0 && (await v(p, 'ea-draft-note').count()) === 0, 'the publish offer and draft note go once it is published');
check((await v(p, 'event-admin-card').count()) === 1, 'the card stays for a published event');

// 5. The event page: the Native ticket link, nothing about paying in Function.
await p.goto(BASE + '/e/' + ev); await p.getByText('EAC Speaker Night').first().waitFor({ timeout: 20000 });
await v(p, 'ticket-link').waitFor({ timeout: 15000 });
check((await text(p, 'ticket-link')) === 'Tickets / sign up', 'the Tickets / sign up button');
check((await p.getByText(/pay (now|here|in function|with function)|checkout|card details/i).count()) === 0, 'nothing suggests paying in Function');
await v(p, 'ticket-link').click(); await p.waitForTimeout(400);
check((await p.evaluate(() => window.__opened)).includes('https://native.fm/e/eac-speaker-night'), 'it opens the Native ticket page');

// 6. An event without answers asks for them; the draft banner links to the card.
await p.goto(BASE + `/dashboard/${soc}/events/${ev2}`); await v(p, 'event-admin-card').waitFor({ timeout: 20000 });
await v(p, 'ea-no-answers').waitFor({ timeout: 15000 });
check(((await v(p, 'ea-edit-answers').getAttribute('href')) ?? '').endsWith(`/dashboard/${soc}/events/${ev2}/edit`), 'no answers yet: a link to add them');
await p.goto(BASE + '/e/' + ev2); await v(p, 'draft-banner').waitFor({ timeout: 20000 });
check((await text(p, 'draft-admin-link')) === 'Event admin and checklist →', 'the draft banner link: ' + await text(p, 'draft-admin-link'));
check(((await v(p, 'draft-admin-link').getAttribute('href')) ?? '').endsWith(`/dashboard/${soc}/events/${ev2}`), 'it opens the Event admin card');

// 7. The LSE Poker Society (Event admin off): its manage screen has no card.
const pokerEv = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${poker}','EAC Poker Night','social','${campus}',now() + interval '5 days',now() + interval '5 days 3 hours','uni') returning id`);
const c = await fresh(); await login(c, 'committee@lse.ac.uk');
await c.goto(BASE + `/dashboard/${poker}/events/${pokerEv}`); await v(c, 'going-heading').waitFor({ timeout: 20000 }); await c.waitForTimeout(800);
check((await v(c, 'event-admin-card').count()) === 0, 'Poker: no Event admin card');

console.log('errors:', errs); await b.close();
