// Expo web build, phase 9: the committee dashboard and admin. Claim a
// society and approve it as admin, post a tables event from the form, the
// society dashboard, manage the event (start a table, late arrival, move,
// results, who pays who, share results), members (add by email, approve),
// edit and delete an event, society details, and the admin page.
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
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003', U4 = '00000000-0000-0000-0000-000000000004';
const lse = sql(`select id from societies where slug='lse-poker-society'`);
sql(`delete from society_admins where user_id='${U1}'; delete from society_claims where user_id='${U1}'; update profiles set is_admin=true where id='${U4}'; update profiles set is_admin=false where id='${U1}'; update profiles set display_name='Sam Student' where id='${U1}'; update profiles set display_name='Bea Brown' where id='${U2}'; update profiles set display_name='Cas Clark' where id='${U3}'`);
sql(`delete from societies where slug='cmte-test-society'; delete from allowed_emails where email='@notauni.org'; delete from events where title like 'Cmte %'; delete from society_member_invites where society_id='${lse}'; insert into society_members (society_id,user_id,status) values ('${lse}','${U2}','approved'),('${lse}','${U3}','pending') on conflict (society_id,user_id) do update set status=excluded.status; delete from society_members where society_id='${lse}' and user_id='${U1}'`);
const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);

// 1. Sam asks to manage LSE Poker; admin (s4) approves it on the Admin page.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/s/lse-poker-society'); await p.getByTestId('join-card').waitFor({ timeout: 20000 });
await p.goto(BASE + '/dashboard/claim'); await p.getByTestId('claim-society').waitFor({ timeout: 20000 }); await p.getByTestId('claim-society').click(); await p.getByTestId(`claim-society-${lse}`).click();
await p.getByTestId('claim-role').fill('VP'); await p.getByTestId('claim-send').click(); await p.waitForURL('**/dashboard', { timeout: 15000 }); await p.locator('[data-testid^="claim-"]').first().waitFor({ timeout: 15000 });
say('claim pending:', sql(`select status from society_claims where user_id='${U1}' and society_id='${lse}'`));
const a = await fresh(); await login(a, 's4@lse.ac.uk'); await a.goto(BASE + '/admin'); await a.locator('[data-testid^="admin-claim-"]').first().waitFor({ timeout: 20000 });
await a.locator('[data-testid^="admin-claim-"]').first().getByTestId('approve-claim').click(); await a.getByText('Nothing waiting.').waitFor({ timeout: 15000 }); say('approved; admins:', sql(`select count(*) from society_admins where user_id='${U1}' and society_id='${lse}'`));
check(sql(`select count(*) from society_admins where user_id='${U1}' and society_id='${lse}'`) === '1', 'claim approval');
// Admin also allows an email and adds a society.
await a.getByTestId('allow-email').fill('@notauni.org'); await a.getByTestId('allow-add').click(); await a.getByTestId('allowed-@notauni.org').waitFor({ timeout: 15000 }); say('allowed domain added');
await a.getByTestId('soc-add-name').fill('Cmte Test Society'); await a.getByTestId('soc-add').click(); await a.getByText('Added Cmte Test Society.').waitFor({ timeout: 15000 }); say('society added:', sql(`select slug from societies where name='Cmte Test Society'`));
// 2. Sam's dashboard lists the society; post a tables event with two tables, a listed venue and a cost.
await p.reload(); await p.getByTestId(`manage-${lse}`).waitFor({ timeout: 20000 }); await p.getByTestId(`manage-${lse}`).click(); await p.waitForURL('**/dashboard/' + lse); await p.getByTestId('post-event').waitFor({ timeout: 20000 }); await p.getByTestId('post-event').click(); await p.waitForURL('**/events/new');
await p.getByTestId('ev-title').waitFor({ timeout: 20000 }); await p.getByTestId('ev-title').fill('Cmte Cash Game'); await p.getByTestId('ev-category').click(); await p.getByTestId('ev-category-social').click();
await p.getByTestId('ev-start-date').fill(tomorrow); await p.getByTestId('ev-start-time').fill('19:00'); await p.getByTestId('ev-end-date').fill(tomorrow); await p.getByTestId('ev-end-time').fill('23:00');
const venue = sql(`select id from venues where name='Marshall Building'`); await p.getByTestId('ev-venue').click(); await p.getByTestId(`ev-venue-${venue}`).click(); await p.getByTestId('ev-location-note').fill('Room 2.04');
await p.getByTestId('ev-cost-paid').click(); await p.getByTestId('ev-cost-amount').fill('5'); await p.getByTestId('ev-format-tables').click(); await p.getByTestId('ev-add-table').click();
await p.getByTestId('ev-table-1').getByTestId('ev-table-seats').fill('2'); await p.getByTestId('ev-audience-london').click(); await p.getByTestId('ev-submit').click();
await p.waitForURL(/\/dashboard\/[0-9a-f-]+\?posted=1/, { timeout: 20000 }); await p.getByTestId('posted').waitFor({ timeout: 15000 });
const ev = sql(`select id from events where title='Cmte Cash Game'`); say('posted:', ev, '| tables:', sql(`select string_agg(name||'/'||seats, ',' order by position) from event_tables where event_id='${ev}'`), '| cost/audience:', sql(`select cost_pence||'/'||audience||'/'||location_note from events where id='${ev}'`));
check(sql(`select count(*) from event_tables where event_id='${ev}'`) === '2' && sql(`select cost_pence from events where id='${ev}'`) === '500', 'event fields');
await p.screenshot({ path: S + '/expo-dashboard.png', fullPage: true });
// 3. Manage: Bea sits at table 1 (via the database); start table 1; add Cas (approve first) as a late arrival; move Bea; results and who pays who; share.
const t1 = sql(`select id from event_tables where event_id='${ev}' and position=0`); const t2 = sql(`select id from event_tables where event_id='${ev}' and position=1`);
sql(`insert into event_entries (event_id,user_id,status,table_id) values ('${ev}','${U2}','going','${t1}')`); sql(`update society_members set status='approved' where society_id='${lse}' and user_id='${U3}'`);
await p.getByTestId(`dash-event-${ev}`).getByTestId('manage-event').last().click(); await p.waitForURL('**/events/' + ev); await p.getByTestId('tables-admin').waitFor({ timeout: 20000 });
await p.getByTestId(`admin-table-${t1}`).getByTestId('start-table').click(); await p.getByTestId('undo-start').waitFor({ timeout: 15000 }); say('table started:', sql(`select started_at is not null from event_tables where id='${t1}'`));
await p.getByTestId('late-arrival').click(); await p.getByTestId('late-member').click(); await p.getByTestId(`late-member-${U3}`).click(); await p.getByTestId('late-table').click(); await p.getByTestId(`late-table-${t1}`).click(); await p.getByTestId('late-add').click();
await p.getByTestId(`seated-${U3}`).waitFor({ timeout: 15000 }); say('late arrival added:', sql(`select status||'/'||(table_id='${t1}') from event_entries where event_id='${ev}' and user_id='${U3}'`));
await p.getByTestId(`move-${U2}`).click(); await p.getByTestId(`move-${U2}-${t2}`).click(); await p.waitForTimeout(1500); say('Bea moved to table 2:', sql(`select table_id='${t2}' from event_entries where event_id='${ev}' and user_id='${U2}'`)); check(sql(`select table_id='${t2}' from event_entries where event_id='${ev}' and user_id='${U2}'`) === 't', 'move');
// Results for table 1 (Cas +10, a guest -10), save, mark paid.
const ledger = p.getByTestId(`ledger-${t1}`); await ledger.getByTestId('ledger-row-' + U3).getByTestId('ledger-amount').fill('10'); await ledger.getByTestId('ledger-add-row').click();
const newRow = ledger.locator('[data-testid^="ledger-row-new-"]').last(); await newRow.getByPlaceholder('Player name').fill('Guest Gus'); await newRow.getByTestId('ledger-amount').fill('-10');
await ledger.getByText('Guest Gus pays Cas Clark').waitFor({ timeout: 5000 }); await ledger.getByTestId('save-results').click(); await ledger.getByText('All saved ✓').waitFor({ timeout: 15000 });
say('ledger rows:', sql(`select string_agg(player_name||':'||net_pence, ',' order by player_name) from ledger_rows where event_id='${ev}' and table_id='${t1}'`));
await p.getByTestId(`ledger-${t1}`).getByTestId('mark-paid').click(); await p.getByTestId(`ledger-${t1}`).getByTestId('ledger-payment').waitFor({ timeout: 15000 }); say('payment:', sql(`select amount_pence from ledger_payments where event_id='${ev}'`));
await p.getByTestId('share-results').click(); await p.getByText('Hide from players').waitFor({ timeout: 15000 }); say('results shared:', sql(`select results_published from events where id='${ev}'`));
await p.screenshot({ path: S + '/expo-manage.png', fullPage: true });
// 4. Members: add two emails (one from another uni is skipped); the pending request from the seed is approved.
sql(`update society_members set status='pending' where society_id='${lse}' and user_id='${U3}'`);
await p.goto(BASE + '/dashboard/' + lse + '/members'); await p.getByTestId('invite-emails').waitFor({ timeout: 20000 }); await p.getByTestId('invite-emails').fill('new.member@lse.ac.uk, other@ucl.ac.uk'); await p.getByTestId('invite-add').click();
await p.getByTestId('invite-added').waitFor({ timeout: 15000 }); say('invites:', await p.getByTestId('invite-added').innerText(), '| skipped shown:', await p.getByText('other@ucl.ac.uk').count()); check(sql(`select count(*) from society_member_invites where society_id='${lse}' and email='new.member@lse.ac.uk'`) === '1', 'invite');
await p.getByTestId(`waiting-${U3}`).getByTestId('approve-member').click(); await p.getByTestId(`member-${U3}`).waitFor({ timeout: 15000 }); say('Cas approved');
// 5. Edit the event (title, cancel) and society details; then delete the event.
await p.goto(BASE + `/dashboard/${lse}/events/${ev}/edit`); await p.getByTestId('ev-title').waitFor({ timeout: 20000 }); say('edit form title:', await p.getByTestId('ev-title').inputValue()); await p.getByTestId('ev-title').fill('Cmte Cash Game 2'); await p.getByTestId('ev-submit').click();
await p.waitForURL('**/dashboard/' + lse, { timeout: 20000 }); await p.getByText('Cmte Cash Game 2').first().waitFor({ timeout: 15000 }); say('edited:', sql(`select title from events where id='${ev}'`));
await p.getByTestId('soc-instagram').fill('@lsepoker'); await p.getByTestId('soc-save').click(); await p.getByText('Saved.').waitFor({ timeout: 15000 }); say('society saved:', sql(`select instagram from societies where id='${lse}'`));
await p.goto(BASE + `/dashboard/${lse}/events/${ev}/edit`); await p.getByTestId('delete-event').waitFor({ timeout: 20000 }); await p.getByTestId('delete-event').click(); await p.waitForURL('**/dashboard/' + lse, { timeout: 20000 }); await p.waitForTimeout(800);
say('deleted:', sql(`select count(*) from events where id='${ev}'`)); check(sql(`select count(*) from events where id='${ev}'`) === '0', 'delete');
console.log('errors:', errs); await b.close();
