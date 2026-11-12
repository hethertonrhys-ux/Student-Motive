// Expo web build: society event group chats. A chat exists the moment an
// event is created; people going and the society's committee can use it;
// committee members show the Host badge in the going list and in the chat;
// leaving the event takes you out; chats of long-finished events drop off
// the list.
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
const U1 = '00000000-0000-0000-0000-000000000001', UC = '00000000-0000-0000-0000-00000000000c';

// Seed: a Poker Society event (open to everyone); its chat appears on creation. An old event with its chat too.
const poker = sql(`select id from societies where slug='lse-poker-society'`); const venue = sql(`select id from venues limit 1`);
sql(`delete from events where title like 'Chat2 %'; delete from society_admins where user_id='${U1}'; delete from society_members where user_id='${U1}'; insert into society_members (society_id,user_id,status,approved_at) values ('${poker}','${U1}','approved',now())`); // a member: members see the going list
const ev = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${poker}','Chat2 Society Night','social','${venue}',now()+interval '1 day',now()+interval '1 day 3 hours','london') returning id`);
const thread = sql(`select id from threads where event_id='${ev}'`); say('chat created with the event:', thread ? 'yes' : 'NO'); check(!!thread, 'chat created on insert');
const old = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${poker}','Chat2 Old Night','social','${venue}',now()-interval '10 days 3 hours',now()-interval '10 days','london') returning id`);
sql(`insert into event_entries (event_id,user_id,status) values ('${old}','${U1}','going')`);

// 1. Sam: no chat button before joining; after "I'm going" the button appears and opens the event chat.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/e/' + ev); await p.getByTestId('join').waitFor({ timeout: 20000 }); await p.waitForTimeout(600);
check((await p.getByTestId('group-chat').count()) === 0, 'no chat before joining');
await p.getByTestId('join').click(); await p.getByTestId('group-chat').waitFor({ timeout: 20000 }); say('joined: chat button shown');
await p.getByTestId('group-chat').click(); await p.waitForURL('**/chats/' + thread, { timeout: 15000 }); await p.getByText('Event chat · 1 going').waitFor({ timeout: 15000 }); say('header shows the going count');
await p.getByTestId('draft').fill('Anyone bringing chips?'); await p.getByTestId('send').click(); await p.getByTestId('messages').getByText('Anyone bringing chips?').waitFor({ timeout: 15000 }); say('Sam sent a message');
// 2. The committee (Casey) can use the chat without joining; their message carries the Host badge.
const c = await fresh(); await login(c, 'committee@lse.ac.uk'); await c.goto(BASE + '/chats/' + thread); await c.getByTestId('messages').getByText('Anyone bringing chips?').waitFor({ timeout: 20000 });
await c.getByTestId('draft').fill('Welcome all, cards at 7.'); await c.getByTestId('send').click(); await c.getByTestId('messages').getByText('Welcome all, cards at 7.').waitFor({ timeout: 15000 });
await p.reload(); await p.getByTestId('messages').getByText('Welcome all, cards at 7.').waitFor({ timeout: 20000 }); await p.getByTestId('messages').locator('[data-testid^="host-pill-"]').first().waitFor({ timeout: 15000 });
const pills = await p.getByTestId('messages').locator('[data-testid^="host-pill-"]').count(); say('host pills in chat:', pills); check(pills === 1, "committee message has the Host badge, Sam's does not");
await p.screenshot({ path: S + '/expo-society-chat.png', fullPage: true });
// 3. Going list: the committee member who's going shows the Host badge; Sam doesn't.
sql(`insert into event_entries (event_id,user_id,status) values ('${ev}','${UC}','going')`);
await p.goto(BASE + '/e/' + ev); await p.getByTestId('whos-coming').waitFor({ timeout: 20000 }); await p.getByTestId('whos-coming').getByText('Casey Committee').waitFor({ timeout: 15000 });
say('host badges in going list:', await p.getByTestId('whos-coming').getByTestId('host-pill').count()); check((await p.getByTestId('whos-coming').getByTestId('host-pill').count()) === 1, 'host badge in going list');
await p.screenshot({ path: S + '/expo-society-going.png', fullPage: true });
// 4. The chats list shows the event chat under Events & Societies, but not the chat of the event that finished 10 days ago.
await p.goto(BASE + '/chats'); await p.getByTestId('chats-tab-events').click(); await p.getByTestId('threads').getByText('Chat2 Society Night').waitFor({ timeout: 20000 });
check((await p.getByTestId('threads').getByText('Chat2 Old Night').count()) === 0, 'old chat dropped off the list'); say('chat list ok');
// 5. Leaving the event takes Sam out of the chat.
await p.goto(BASE + '/e/' + ev); await p.getByTestId('leave').waitFor({ timeout: 20000 }); await p.getByTestId('leave').click(); await p.getByTestId('join').waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
check((await p.getByTestId('group-chat').count()) === 0, 'chat button gone after leaving');
await p.goto(BASE + '/chats/' + thread); await p.getByText('Chat not found').waitFor({ timeout: 20000 }); say('left: chat no longer opens');
console.log('errors:', errs); await b.close();
