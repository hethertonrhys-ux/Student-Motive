// Expo web build, phase 5: the full event page. Tables (sit, move, confirm
// your seat, also-tables, waiting list on a full table), the sign-up list
// with a limit and waiting list, the name form, the bank's screen, your
// own result (self-report), and who pays who once results are published.
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
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003';
// Seed: s1, s2, s3 are approved LSE Poker members. A tables event (2 tables x 2 seats) starting in 2h, and a sign-up event with room for 1.
const lse = sql(`select id from societies where slug='lse-poker-society'`); const venue = sql(`select id from venues where name='Marshall Building'`);
sql(`delete from events where title like 'Full %'`);
for (const u of [U1, U2, U3]) sql(`insert into society_members (society_id,user_id,status) values ('${lse}','${u}','approved') on conflict (society_id,user_id) do update set status='approved'`);
sql(`update profiles set display_name='Sam Student' where id='${U1}'; update profiles set display_name='Bea Brown' where id='${U2}'; update profiles set display_name=null where id='${U3}'`);
const tablesEv = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience,members_only,format) values ('${lse}','Full Cash Game','social','${venue}',now()+interval '2 hours',now()+interval '6 hours','uni',true,'tables') returning id`);
const t1 = sql(`insert into event_tables (event_id,name,level,seats,position) values ('${tablesEv}','Table 1','5p/10p',2,1) returning id`);
const t2 = sql(`insert into event_tables (event_id,name,level,seats,position) values ('${tablesEv}','Table 2','10p/20p',2,2) returning id`);
const entriesEv = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience,members_only,format,capacity) values ('${lse}','Full Tournament','social','${venue}',now()+interval '3 hours',now()+interval '7 hours','uni',true,'entries',1) returning id`);

// 1. Sam: sit at Table 1, move to Table 2, tick "also happy" for Table 1, confirm the seat.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/e/' + tablesEv); await p.getByTestId('tables').waitFor({ timeout: 20000 });
await p.getByTestId(`table-${t1}`).getByTestId('sit').click(); await p.getByTestId('confirm-card').waitFor({ timeout: 15000 });
say('sat at table 1:', sql(`select table_id='${t1}' from event_entries where event_id='${tablesEv}' and user_id='${U1}'`));
await p.getByTestId(`table-${t2}`).getByTestId('sit').click(); await p.getByText("You're at Table 2").waitFor({ timeout: 15000 }); say('moved to table 2');
check(sql(`select table_id='${t2}' from event_entries where event_id='${tablesEv}' and user_id='${U1}'`) === 't', 'move');
await p.getByTestId(`also-${t1}`).click(); await p.waitForTimeout(800); say('also tables:', sql(`select also_tables from event_entries where event_id='${tablesEv}' and user_id='${U1}'`));
check(sql(`select '${t1}' = any(also_tables) from event_entries where event_id='${tablesEv}' and user_id='${U1}'`) === 't', 'also tables');
await p.getByTestId('confirm-seat').click(); await p.getByTestId('seat-confirmed').waitFor({ timeout: 15000 }); say('seat confirmed:', sql(`select confirmed_table_id='${t2}' from event_entries where event_id='${tablesEv}' and user_id='${U1}'`));
await p.screenshot({ path: S + '/expo-tables.png', fullPage: true });
// 2. Table 2 fills up (Bea sits via the database); Cas (no name yet) must give a name, then finds Table 2 full and joins its waiting list.
sql(`insert into event_entries (event_id,user_id,status,table_id) values ('${tablesEv}','${U2}','going','${t2}')`);
const c = await fresh(); await login(c, 's3@lse.ac.uk'); await c.goto(BASE + '/e/' + tablesEv); await c.getByTestId('name-form').waitFor({ timeout: 20000 });
await c.getByTestId('your-name').fill('Cas Clark'); await c.getByTestId('save-name').click(); await c.getByTestId('tables').waitFor({ timeout: 15000 }); say('name saved:', sql(`select display_name from profiles where id='${U3}'`));
await c.getByTestId('just-going').click(); await c.getByTestId(`table-${t2}`).getByTestId('join-waitlist').waitFor({ timeout: 15000 });
await c.getByTestId(`table-${t2}`).getByTestId('join-waitlist').click(); await c.getByTestId('waitlist-position').waitFor({ timeout: 15000 }); say('waitlist:', await c.getByTestId('waitlist-position').innerText());
check(/number 1/.test(await c.getByTestId('waitlist-position').innerText()), 'waitlist position');
await c.getByTestId('leave-waitlist').click(); await c.getByTestId(`table-${t2}`).getByTestId('join-waitlist').waitFor({ timeout: 15000 }); say('left waitlist');
// 3. Sign-up list: Sam enters (1/1, full), Cas joins the waiting list as number 1, Sam withdraws, Cas moves up.
await p.goto(BASE + '/e/' + entriesEv); await p.getByTestId('entry-panel').waitFor({ timeout: 20000 }); await p.getByTestId('join').click(); await p.getByText("You're entered").waitFor({ timeout: 15000 });
say('entries:', (await p.getByTestId('entry-panel').innerText()).replace(/\n/g, ' | ')); check(/1 \/ 1 entered · Full/.test(await p.getByTestId('entry-panel').innerText()), 'full');
await c.goto(BASE + '/e/' + entriesEv); await c.getByTestId('entry-panel').waitFor({ timeout: 20000 }); await c.getByTestId('join').click(); await c.getByText('number 1 on the waiting list').waitFor({ timeout: 15000 }); say('Cas on the waiting list');
say("who's coming for Sam:", (await p.getByTestId('whos-coming').innerText().catch(() => 'n/a')).replace(/\n/g, ' '));
await p.getByTestId('leave').click(); await p.getByTestId('join').waitFor({ timeout: 15000 });
await c.reload(); await c.getByText("You're entered").waitFor({ timeout: 20000 }); say('Cas moved up after Sam withdrew'); check(sql(`select status from event_entries where event_id='${entriesEv}' and user_id='${U3}'`) === 'going', 'waitlist promotion');
// 4. The bank: Sam becomes Table 2's bank and the game starts; Bea sees the bank line. Sam records buy-ins and cash-outs and saves.
sql(`update event_tables set bank_user_id='${U1}', started_at=now() where id='${t2}'`);
await p.goto(BASE + '/e/' + tablesEv); await p.getByTestId('bank-ledger').waitFor({ timeout: 20000 });
const beaRow = p.getByTestId(`bank-row-${U2}`); await beaRow.getByTestId('buyins').fill('10'); await beaRow.getByTestId('rebuy').click(); await beaRow.getByTestId('cashout').fill('35');
const samRow = p.getByTestId(`bank-row-${U1}`); await samRow.getByTestId('buyins').fill('20'); await samRow.getByTestId('cashout').fill('5');
await p.getByTestId('adds-up').waitFor({ timeout: 5000 }); say('bank:', await p.getByTestId('adds-up').innerText());
await p.getByTestId('save-bank').click(); await p.getByText('All saved ✓').waitFor({ timeout: 15000 });
say('ledger rows:', sql(`select player_name||':'||buyin_pence||'/'||coalesce(cashout_pence::text,'-')||'='||net_pence from ledger_rows where event_id='${tablesEv}' order by player_name`).replace(/\n/g, ' '));
check(sql(`select net_pence from ledger_rows where event_id='${tablesEv}' and user_id='${U2}'`) === '1500' && sql(`select net_pence from ledger_rows where event_id='${tablesEv}' and user_id='${U1}'`) === '-1500', 'bank save');
await p.screenshot({ path: S + '/expo-bank.png', fullPage: true });
const bea = await fresh(); await login(bea, 's2@lse.ac.uk'); await bea.goto(BASE + '/e/' + tablesEv); await bea.getByTestId('my-bank-line').waitFor({ timeout: 20000 }); say('Bea sees:', (await bea.getByTestId('my-bank-line').innerText()).replace(/\n/g, ' | '));
// 5. Self-report: at a table without a bank once started, Cas sits at Table 1 with Bea moved there, reports being down £7.50 and a £5 payment to Bea.
sql(`update event_tables set bank_user_id=null, started_at=now() where id='${t1}'; update event_entries set table_id='${t1}' where event_id='${tablesEv}' and user_id='${U2}'; update ledger_rows set table_id='${t1}' where event_id='${tablesEv}' and user_id='${U2}'`);
await c.goto(BASE + '/e/' + tablesEv); await c.getByTestId('tables').waitFor({ timeout: 20000 }); await c.getByTestId(`table-${t1}`).getByTestId('sit').click(); await c.getByTestId('self-report').waitFor({ timeout: 15000 });
await c.getByTestId('seg-down').click(); await c.getByTestId('result-amount').fill('7.50'); await c.getByTestId('save-result').click(); await c.getByText(/saved: −£7.50/).waitFor({ timeout: 15000 }); say('self-report saved:', sql(`select net_pence from ledger_rows where event_id='${tablesEv}' and user_id='${U3}'`));
await c.getByTestId('seg-paid').click(); await c.getByTestId(`player-${U2}`).click(); await c.getByTestId('pay-amount').fill('5'); await c.getByTestId('add-payment').click(); await c.getByText('You paid').waitFor({ timeout: 15000 }); say('payment recorded:', sql(`select count(*) from ledger_payments where event_id='${tablesEv}'`));
check(sql(`select count(*) from ledger_payments where event_id='${tablesEv}'`) === '1', 'payment');
// 6. Results published after the event: Cas's result shows and who pays who (Cas owes Bea £2.50 more); "I've paid" marks it.
sql(`update ledger_rows set net_pence=750 where event_id='${tablesEv}' and user_id='${U2}'; update events set ends_at=now()-interval '1 minute', starts_at=now()-interval '5 hours', results_published=true where id='${tablesEv}'`);
await c.reload(); await c.getByTestId('my-results').waitFor({ timeout: 20000 }); say('results:', (await c.getByTestId('my-results').innerText()).replace(/\n/g, ' | '));
check(/−£7.50/.test(await c.getByTestId('my-net').innerText()), 'my net'); check(/You pay Bea Brown/.test(await c.getByTestId('my-results').innerText()) && /£2.50/.test(await c.getByTestId('my-results').innerText()), 'transfer');
await c.getByTestId('mark-paid').click(); await c.getByText('All settled up').waitFor({ timeout: 15000 }); say('marked paid; payments:', sql(`select count(*) from ledger_payments where event_id='${tablesEv}'`));
await c.screenshot({ path: S + '/expo-results.png', fullPage: true });
console.log('errors:', errs); await b.close();
