// Expo web build: reporting a society event, reaching a group-chat sender's
// profile (and its Block button) from the chat, and the admin's count of
// waiting reports on the Me tab.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click(); await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {}); if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); } if (p.url().includes('/welcome')) { await p.getByTestId('skip').click(); await p.waitForURL('**/map'); }
}
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U4 = '00000000-0000-0000-0000-000000000004';
const poker = sql(`select id from societies where slug='lse-poker-society'`); const venue = sql(`select id from venues limit 1`);
sql(`delete from events where title like 'Rep %'; delete from society_members where user_id in ('${U1}','${U2}'); insert into society_members (society_id,user_id,status,approved_at) values ('${poker}','${U1}','approved',now()),('${poker}','${U2}','approved',now())`);
const ev = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${poker}','Rep Night','social','${venue}',now()+interval '1 day',now()+interval '1 day 3 hours','london') returning id`);
const thread = sql(`select id from threads where event_id='${ev}'`);
sql(`insert into event_entries (event_id,user_id,status) values ('${ev}','${U1}','going'),('${ev}','${U2}','going'); insert into messages (thread_id,sender_id,body) values ('${thread}','${U2}','Bea says hello')`);

// 1. Sam reports the society event from its page.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/e/' + ev); await p.getByTestId('more').waitFor({ timeout: 20000 });
await p.getByTestId('more').click(); await p.getByTestId('report-event').click(); await p.getByTestId('reason-2').click(); await p.getByTestId('report-note').fill('Spam listing'); await p.getByTestId('report-send').click(); await p.getByTestId('report-sent').waitFor({ timeout: 15000 }); await p.getByTestId('report-done').click();
const rep = sql(`select reason||'|'||coalesce(details,'')||'|'||status from reports where event_id='${ev}' and reporter_id='${U1}'`); say('report stored:', rep); check(rep === 'Spam|Spam listing|open', 'event report stored');
// 2. In the event chat, tapping Bea's name opens her profile.
await p.goto(BASE + '/chats/' + thread); await p.getByTestId('messages').getByText('Bea says hello').waitFor({ timeout: 20000 });
await p.locator('[data-testid^="sender-"]').filter({ hasText: 'Bea Brown' }).first().click(); await p.waitForURL('**/u/' + U2, { timeout: 15000 }); say('sender name opens profile:', p.url().endsWith(U2));
// 3. Admin (Sky) sees the waiting reports on the Me tab.
sql(`update profiles set is_admin = true where id='${U4}'`);
const a = await fresh(); await login(a, 's4@lse.ac.uk'); await a.goto(BASE + '/me'); await a.getByTestId('admin-panel').waitFor({ timeout: 20000 });
await a.getByTestId('admin-panel').getByText(/report(s)? waiting/).waitFor({ timeout: 15000 }); say('admin row:', (await a.getByTestId('admin-panel').innerText()).replace(/\n/g, ' | '));
// 4. The committee doesn't get a report link on its own event.
const c = await fresh(); await login(c, 'committee@lse.ac.uk'); sql(`insert into event_entries (event_id,user_id,status) values ('${ev}','00000000-0000-0000-0000-00000000000c','going') on conflict do nothing`);
await c.goto(BASE + '/e/' + ev); await c.getByTestId('whos-coming').waitFor({ timeout: 20000 }); await c.waitForTimeout(800); check((await c.getByTestId('more').count()) === 0, 'no report link for the committee'); say('committee report links:', await c.getByTestId('more').count());
console.log('errors:', errs); await b.close();
