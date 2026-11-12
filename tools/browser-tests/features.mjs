// Expo web build: society feature flags (Part 1). A society from before
// features (LSE Poker, no type, no rows) keeps everything; switching
// features off hides them from the event form, the members screen and the
// manage screen; events, chats and invites already using a feature keep it;
// switching back on brings things back.
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
const U1 = '00000000-0000-0000-0000-000000000001';
const poker = sql(`select id from societies where slug='lse-poker-society'`); const venue = sql(`select id from venues limit 1`);
const setFeature = (key, enabled) => sql(`insert into society_features (society_id,feature_key,enabled) values ('${poker}','${key}',${enabled}) on conflict (society_id,feature_key) do update set enabled=excluded.enabled`);
const count = async (p, id) => p.getByTestId(id).count();

// Seed: the Poker Society has no type and no feature rows (a society from before features).
sql(`delete from events where title like 'Feat %'; delete from society_features where society_id='${poker}'; delete from society_members where user_id='${U1}'; insert into society_members (society_id,user_id,status,approved_at) values ('${poker}','${U1}','approved',now())`);
say('poker type/rows:', sql(`select coalesce(society_type,'none') from societies where id='${poker}'`), sql(`select count(*) from society_features where society_id='${poker}'`));
// A tables event with a cost (created while both were on), and a standard event Sam is going to.
const evT = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience,format,cost_pence) values ('${poker}','Feat Cash Game','social','${venue}',now()+interval '2 hours',now()+interval '6 hours','uni','tables',500) returning id`);
const t1 = sql(`insert into event_tables (event_id,name,level,seats,position) values ('${evT}','Table 1','10p/20p',6,0) returning id`);
const evC = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${poker}','Feat Chat Night','social','${venue}',now()+interval '1 day',now()+interval '1 day 3 hours','london') returning id`);
sql(`insert into event_entries (event_id,user_id,status) values ('${evC}','${U1}','going')`);
const thread = sql(`select id from threads where event_id='${evC}'`);

// (a) The committee: a legacy society gets every format and the cost choices.
const c = await fresh(); await login(c, 'committee@lse.ac.uk');
await c.goto(BASE + `/dashboard/${poker}/events/new`); await c.getByTestId('ev-title').waitFor({ timeout: 20000 });
for (const id of ['ev-format-standard', 'ev-format-entries', 'ev-format-tables', 'ev-cost-none', 'ev-cost-free', 'ev-cost-paid']) check((await count(c, id)) === 1, `legacy form shows ${id}`);
say('legacy form: entries, tables and cost shown');
await c.goto(BASE + `/dashboard/${poker}/members`); await c.getByTestId('members').waitFor({ timeout: 20000 });
check((await count(c, 'invite-emails')) === 1, 'legacy members screen offers invites');
await c.goto(BASE + `/dashboard/${poker}/events/${evT}`); await c.getByTestId('going-heading').waitFor({ timeout: 20000 }); await c.getByTestId('share-results').waitFor({ timeout: 15000 });
check((await count(c, `bank-pick-${t1}`)) === 1, 'legacy manage screen has the bank picker');

// (b) Tables and event cost off: gone from a new event's form; sign-up lists stay.
setFeature('tables', false); setFeature('event_cost', false);
await c.goto(BASE + `/dashboard/${poker}/events/new`); await c.getByTestId('ev-title').waitFor({ timeout: 20000 }); await c.waitForTimeout(400);
check((await count(c, 'ev-format-tables')) === 0, 'tables option hidden when tables is off');
check((await count(c, 'ev-cost')) === 0 && (await count(c, 'ev-cost-paid')) === 0, 'cost chips hidden when event cost is off');
check((await count(c, 'ev-format-entries')) === 1 && (await count(c, 'ev-format-standard')) === 1, 'entries and standard still offered');
await c.screenshot({ path: S + '/expo-features-form.png', fullPage: true });
say('tables and cost off: hidden from the new event form');
// An event already using tables and a cost keeps both when edited; one that doesn't, doesn't get them.
await c.goto(BASE + `/dashboard/${poker}/events/${evT}/edit`); await c.getByTestId('ev-title').waitFor({ timeout: 20000 });
check((await count(c, 'ev-format-tables')) === 1, 'tables option kept for an event already using tables');
check((await count(c, 'ev-cost-paid')) === 1, 'cost kept for an event that already has one');
check((await count(c, `ev-table-0`)) === 1, 'its tables are still in the form');
await c.goto(BASE + `/dashboard/${poker}/events/${evC}/edit`); await c.getByTestId('ev-title').waitFor({ timeout: 20000 }); await c.waitForTimeout(400);
check((await count(c, 'ev-format-tables')) === 0 && (await count(c, 'ev-cost')) === 0, 'a standard event without a cost is not offered tables or cost');
// A new event posted now has no cost and is standard.
await c.goto(BASE + `/dashboard/${poker}/events/new`); await c.getByTestId('ev-title').waitFor({ timeout: 20000 });
await c.getByTestId('ev-title').fill('Feat New Night');
await c.getByTestId('ev-category').click(); await c.getByTestId('ev-category-social').click();
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
await c.getByTestId('ev-start-date').fill(day); await c.getByTestId('ev-start-time').fill('19:00'); await c.getByTestId('ev-end-date').fill(day); await c.getByTestId('ev-end-time').fill('22:00');
await c.getByTestId('ev-venue').click(); await c.getByTestId(`ev-venue-${venue}`).click();
await c.getByTestId('ev-submit').click(); await c.waitForURL(/posted=1/, { timeout: 20000 });
say('posted:', sql(`select format||'/'||coalesce(cost_pence::text,'null') from events where title='Feat New Night'`)); check(sql(`select format||'/'||coalesce(cost_pence::text,'null') from events where title='Feat New Night'`) === 'standard/null', 'new event is standard with no cost');

// (c) A member still sees the tables of the existing tables event.
const p = await fresh(); await login(p, 's1@lse.ac.uk');
await p.goto(BASE + '/e/' + evT); await p.getByTestId('tables').waitFor({ timeout: 20000 }); await p.getByTestId(`table-${t1}`).waitFor({ timeout: 15000 });
say('existing tables event still shows its tables');

// (d) Event chats off: a chat that already exists keeps working (its button and chat list entry stay).
await p.goto(BASE + '/e/' + evC); await p.getByTestId('leave').waitFor({ timeout: 20000 }); await p.getByTestId('group-chat').waitFor({ timeout: 15000 });
setFeature('event_chats', false);
await p.reload(); await p.getByTestId('leave').waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
check((await count(p, 'group-chat')) === 1, 'an existing group chat keeps its button when event chats is off');
await p.goto(BASE + '/chats'); await p.getByTestId('chats-tab-events').click();
await p.getByTestId('threads').or(p.getByText('No event chats yet.')).first().waitFor({ timeout: 20000 }); await p.waitForTimeout(400);
check((await count(p, `thread-${thread}`)) === 1, 'an existing event chat stays in the chat list when event chats is off');
say('event chats off: the existing chat keeps its button and list entry');
setFeature('event_chats', true);

// (e) Member invites off: no "Add members by email"; the member list stays, and so do invites
// already sent (they still count, so the committee can still remove them). Ledger off: no settle-up
// tools, unless the event already uses them.
sql(`insert into society_member_invites (society_id,email) values ('${poker}','feat.invite@lse.ac.uk') on conflict do nothing`);
setFeature('member_invites', false); setFeature('ledger', false);
await c.goto(BASE + `/dashboard/${poker}/members`); await c.getByTestId('members').waitFor({ timeout: 20000 }); await c.waitForTimeout(400);
check((await count(c, 'invite-emails')) === 0 && (await count(c, 'invite-card')) === 0, 'invites hidden when member invites is off');
check((await count(c, `member-${U1}`)) === 1, 'members are still listed');
check((await count(c, 'invited')) === 1 && (await count(c, 'remove-invite')) >= 1, 'invites already sent still show, with Remove, when member invites is off');
await c.goto(BASE + `/dashboard/${poker}/events/${evT}`); await c.getByTestId('going-heading').waitFor({ timeout: 20000 }); await c.waitForTimeout(600);
check((await count(c, 'share-results')) === 0 && (await count(c, `bank-pick-${t1}`)) === 0, 'settle-up tools hidden when the ledger is off');
say('invites and ledger off: hidden');
// An event already using the ledger (a table with a bank) keeps its settle-up tools.
sql(`update event_tables set bank_user_id='${U1}' where id='${t1}'`);
await c.reload(); await c.getByTestId('going-heading').waitFor({ timeout: 20000 }); await c.waitForTimeout(600);
check((await count(c, 'share-results')) === 1 && (await count(c, `bank-pick-${t1}`)) === 1, 'settle-up tools kept for an event already using the ledger');
say('ledger off: an event already using it keeps its tools');

// Reset.
sql(`delete from society_features where society_id='${poker}'; delete from events where title like 'Feat %'; delete from society_member_invites where email='feat.invite@lse.ac.uk'`);
console.log('errors:', errs); await b.close();
