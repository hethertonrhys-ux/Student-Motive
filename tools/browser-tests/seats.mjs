// Expo web build: poker seating. Numbered seats on the felt; tap an empty
// seat → "Sit here"; "Sit anywhere" picks a random empty seat; tapping a
// player opens their card; the committee sees seat numbers and can
// randomise a table, which writes a seat change each player can see in
// Notifications; the new "Poker seating" notification switch exists.
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
const seatOf = (u) => sql(`select coalesce(seat_no::text,'none')||'@'||coalesce(table_id::text,'none') from event_entries where event_id='${ev}' and user_id='${u}'`);

// Seed: a Poker Society cash game with two tables; Sam, Bea, Cas and Sky are members.
const poker = sql(`select id from societies where slug='lse-poker-society'`); const venue = sql(`select id from venues limit 1`);
sql(`delete from events where title like 'Seat %'`);
sql(`delete from society_admins where user_id in ('${U1}','${U2}','${U3}'); delete from society_members where user_id in ('${U1}','${U2}','${U3}'); insert into society_members (society_id,user_id,status,approved_at) values ('${poker}','${U1}','approved',now()),('${poker}','${U2}','approved',now()),('${poker}','${U3}','approved',now()); update profiles set country='FR' where id='${U2}'`);
const ev = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience,members_only,format) values ('${poker}','Seat Cash Game','social','${venue}',now()+interval '2 hours',now()+interval '6 hours','uni',true,'tables') returning id`);
const t1 = sql(`insert into event_tables (event_id,name,level,seats,position) values ('${ev}','Table 1','10p/20p',4,0) returning id`);
const t2 = sql(`insert into event_tables (event_id,name,level,seats,position) values ('${ev}','Table 2','25p/50p',3,1) returning id`);

// 1. Sam: numbered empty seats; tap Seat 3 → Sit here; then move to Seat 1 by tapping it.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/e/' + ev); await p.getByTestId('tables').waitFor({ timeout: 20000 }); await p.getByTestId(`seat-${t1}-1`).waitFor({ timeout: 15000 });
say('empty seats on Table 1:', await p.getByTestId(`felt-${t1}`).locator('[data-testid^="seat-"]').count()); check((await p.getByTestId(`felt-${t1}`).locator('[data-testid^="seat-"]').count()) === 4, 'four numbered seats');
await p.getByTestId(`seat-${t1}-3`).click(); await p.getByTestId('seat-sheet').waitFor({ timeout: 5000 }); await p.getByText('Seat 3 at Table 1').waitFor(); await p.getByTestId('sit-here').click();
await p.getByTestId(`seat-player-${U1}`).waitFor({ timeout: 15000 }); say('Sam sat:', seatOf(U1)); check(seatOf(U1) === `3@${t1}`, 'sit here at seat 3');
await p.screenshot({ path: S + '/expo-seats-table.png', fullPage: true });
await p.getByTestId(`seat-${t1}-1`).click(); await p.getByTestId('sit-here').click(); await p.waitForTimeout(800); say('Sam moved:', seatOf(U1)); check(seatOf(U1) === `1@${t1}`, 'move to seat 1');
// 2. "Sit anywhere" on Table 2 gives a random empty seat there.
await p.getByTestId(`table-${t2}`).getByTestId('sit').click(); await p.waitForTimeout(800); say('Sam sat anywhere:', seatOf(U1)); check(/^[123]@/.test(seatOf(U1)) && seatOf(U1).endsWith(t2), 'sit anywhere');
// 3. Others sit (the database gives them the lowest empty seat); tap Bea for her card.
sql(`insert into event_entries (event_id,user_id,status,table_id) values ('${ev}','${U2}','going','${t1}'),('${ev}','${U3}','going','${t1}'),('${ev}','${U4}','going','${t1}')`);
say('auto seats:', seatOf(U2), seatOf(U3), seatOf(U4)); check(seatOf(U2) === `1@${t1}` && seatOf(U3) === `2@${t1}` && seatOf(U4) === `3@${t1}`, 'lowest free seat for the others');
await p.reload(); await p.getByTestId(`seat-player-${U2}`).waitFor({ timeout: 20000 }); await p.getByTestId(`seat-player-${U2}`).click(); await p.getByTestId('person-card-sheet').waitFor({ timeout: 10000 });
await p.getByTestId('person-card-sheet').getByText('Bea Brown').waitFor({ timeout: 10000 }); const card = (await p.getByTestId('person-card-sheet').innerText()).replace(/\n/g, ' | '); say('card:', card.slice(0, 200));
check(/Games played/.test(card) && /LSE/.test(card) && (await p.getByTestId('person-card-sheet').getByTestId('flag').count()) === 1, 'person card');
await p.screenshot({ path: S + '/expo-seats-card.png', fullPage: true });
await p.getByText('Close').click();
// 4. Committee: seat numbers in the manage list; Randomise seating reshuffles Table 1, each change is recorded.
const c = await fresh(); await login(c, 'committee@lse.ac.uk'); await c.goto(BASE + `/dashboard/${poker}/events/${ev}`); await c.getByTestId(`seat-of-${U2}`).waitFor({ timeout: 20000 });
say('manage shows:', await c.getByTestId(`seat-of-${U2}`).innerText(), '|', await c.getByTestId(`seat-of-${U4}`).innerText()); check((await c.getByTestId(`seat-of-${U2}`).innerText()) === 'Seat 1', 'manage list seat numbers');
const before = sql(`select string_agg(user_id||':'||seat_no, ',' order by user_id) from event_entries where table_id='${t1}'`);
await c.getByTestId(`randomise-${t1}`).click(); await c.waitForTimeout(1500);
const after = sql(`select string_agg(user_id||':'||seat_no, ',' order by user_id) from event_entries where table_id='${t1}'`); const changed = sql(`select count(*) from seat_changes where event_id='${ev}'`);
const distinctSeats = sql(`select count(distinct seat_no)||'/'||count(*) from event_entries where table_id='${t1}'`); say('before:', before, '| after:', after, '| changes recorded:', changed, '| distinct seats:', distinctSeats);
const moved = before.split(',').filter((x, i) => x !== after.split(',')[i]).length; check(distinctSeats === '3/3' && Number(changed) === moved, 'randomise: unique seats, one change per moved player');
await c.screenshot({ path: S + '/expo-seats-manage.png', fullPage: true });
// 5. A seat change shows in Notifications, and the new notification switch exists.
sql(`insert into seat_changes (event_id,user_id,table_id,seat_no) values ('${ev}','${U2}','${t1}',2)`);
const q = await fresh(); await login(q, 's2@lse.ac.uk'); await q.goto(BASE + '/notifications'); await q.getByText(/Seats reshuffled/).first().waitFor({ timeout: 20000 }); say('Bea sees:', (await q.getByText(/Seats reshuffled/).first().innerText()).slice(0, 120));
await q.goto(BASE + '/account/notifications'); await q.getByTestId('notify-seating').waitFor({ timeout: 20000 }); say('seating switch:', await q.getByTestId('notify-seating').getAttribute('aria-checked'));
await q.getByTestId('notify-seating').click(); await q.waitForTimeout(800); say('saved seating=', sql(`select seating from notification_settings where user_id='${U2}'`)); check(sql(`select seating from notification_settings where user_id='${U2}'`) === 'f', 'seating switch saves');
// 6. Waiting list: Table 1 is full and Sam is queued for it. When Bea (at Table 1) takes a seat at Table 2,
//    Sam is moved into Bea's old seat automatically, with a proper seat number (no duplicates, nothing stale).
const UC = '00000000-0000-0000-0000-00000000000c';
sql(`insert into event_entries (event_id,user_id,status,table_id) values ('${ev}','${UC}','going','${t1}')`);
sql(`insert into table_waitlist (event_id,user_id,table_id) values ('${ev}','${U1}','${t1}')`);
const beaOld = seatOf(U2).split('@')[0]; const freeT2 = sql(`select s from generate_series(1,3) s where not exists (select 1 from event_entries e where e.table_id='${t2}' and e.seat_no=s) order by s limit 1`);
say('Table 1 full (4/4):', sql(`select count(*) from event_entries where table_id='${t1}'`), '| Bea at seat', beaOld, '| Sam queued; Bea takes Table 2 seat', freeT2);
await q.goto(BASE + '/e/' + ev); await q.getByTestId(`seat-${t2}-${freeT2}`).waitFor({ timeout: 20000 }); await q.getByTestId(`seat-${t2}-${freeT2}`).click(); await q.getByTestId('sit-here').click(); await q.waitForTimeout(1200);
say('Bea now:', seatOf(U2), '| Sam now:', seatOf(U1), '| Table 1 seats:', sql(`select string_agg(seat_no::text, ',' order by seat_no) from event_entries where table_id='${t1}'`));
check(seatOf(U2) === `${freeT2}@${t2}`, 'Bea took the chosen seat at Table 2');
check(seatOf(U1) === `${beaOld}@${t1}`, "Sam was moved from the waiting list into Bea's old seat");
check(sql(`select count(distinct seat_no)||'/'||count(*) from event_entries where table_id='${t1}'`) === '4/4', 'Table 1 seats all distinct after the move');
check(sql(`select count(*) from table_waitlist where event_id='${ev}'`) === '0', 'queue emptied');
console.log('errors:', errs); await b.close();
