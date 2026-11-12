// Expo web build, phase 8: Friends (search, request, accept, friends list,
// people you've been to events with), private chats (send, receive while
// open, delete, report, unread badges), an event's group chat, and
// Notifications (friend requests, society events, the Me badge).
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
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003';
sql(`delete from messages; delete from thread_reads; delete from threads; delete from friendships; delete from user_blocks; delete from reports; delete from social_events where title like 'Chat %'`);
sql(`update profiles set display_name='Sam Student' where id='${U1}'; update profiles set display_name='Bea Brown' where id='${U2}'; update profiles set display_name='Cas Clark' where id='${U3}'`);

// 1. Sam searches for Bea and sends a request; Bea sees it in Notifications (with a Me badge) and in Friends, and accepts.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/friends'); await p.getByTestId('people-search').waitFor({ timeout: 20000 });
await p.getByTestId('people-search').fill('bea'); await p.getByTestId('people-results').getByTestId('add-friend').waitFor({ timeout: 10000 }); await p.getByTestId('people-results').getByTestId('add-friend').click(); await p.getByTestId('people-results').getByTestId('requested').waitFor({ timeout: 10000 });
say('request sent:', sql(`select status from friendships where requester_id='${U1}' and addressee_id='${U2}'`));
const q = await fresh(); await login(q, 's2@lse.ac.uk'); await q.goto(BASE + '/me'); await q.getByTestId('notifications').waitFor({ timeout: 20000 }); await q.waitForTimeout(2500);
say('Me tab badge text:', (await q.locator('[role="tablist"], nav').first().innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 80));
await q.getByTestId('notifications').click(); await q.waitForURL('**/notifications'); await q.getByTestId('friend-requests').waitFor({ timeout: 15000 }); say('notifications:', (await q.getByTestId('friend-requests').innerText()).replace(/\n/g, ' '));
check(/Sam Student sent you a friend request/.test(await q.getByTestId('friend-requests').innerText()), 'request notification');
await q.goto(BASE + '/friends'); await q.getByTestId('incoming').waitFor({ timeout: 15000 }); await q.getByTestId('incoming').getByTestId('accept-friend').click(); await q.getByTestId('friends').getByText('Your friends (1)').waitFor({ timeout: 15000 }); say('accepted; friends list shows Sam:', /Sam Student/.test(await q.getByTestId('friends').innerText()));
// 2. Bea messages Sam from the friends list; Sam sees the unread badge on Chats, opens the chat and replies; Bea's open chat picks it up without reloading.
await q.getByTestId('friends').getByTestId('message-friend').click(); await q.waitForURL(/\/chats\/[0-9a-f-]{36}/, { timeout: 15000 }); const thread = q.url().split('/chats/')[1];
await q.getByTestId('chat-title').waitFor({ timeout: 15000 }); await q.getByTestId('draft').fill('Hi Sam, poker tonight?'); await q.getByTestId('send').click(); await q.getByTestId('messages').getByText('Hi Sam, poker tonight?').waitFor({ timeout: 15000 }); say('Bea sent; messages:', sql(`select count(*) from messages where thread_id='${thread}'`));
await p.goto(BASE + '/chats'); await p.getByTestId('chats-tab-personal').waitFor({ timeout: 20000 }); await p.getByTestId('chats-tab-personal').click(); await p.getByTestId(`thread-${thread}`).waitFor({ timeout: 20000 }); say('Sam thread row:', (await p.getByTestId(`thread-${thread}`).innerText()).replace(/\n/g, ' | ')); check((await p.getByTestId('unread-badge').count()) === 1, 'unread badge');
await p.getByTestId(`thread-${thread}`).click(); await p.waitForURL('**/chats/' + thread); await p.getByTestId('messages').getByText('Hi Sam, poker tonight?').waitFor({ timeout: 15000 });
await p.getByTestId('draft').fill('Yes! See you at 7'); await p.getByTestId('send').click(); await p.getByTestId('messages').getByText('Yes! See you at 7').waitFor({ timeout: 15000 });
await q.getByTestId('messages').getByText('Yes! See you at 7').waitFor({ timeout: 15000 }); say('Bea received the reply live');
await p.screenshot({ path: S + '/expo-chat.png', fullPage: true });
// Sam deletes his message; Bea reports Bea's own? No: Bea reports Sam's (deleted shows as deleted); report a message.
await p.getByTestId('messages').getByText('Yes! See you at 7').click(); await p.getByTestId('delete-message').click(); await p.getByTestId('messages').getByText('Message deleted').waitFor({ timeout: 15000 }); say('deleted:', sql(`select deleted_at is not null from messages where body='Yes! See you at 7'`));
await p.getByTestId('messages').getByText('Hi Sam, poker tonight?').click(); await p.getByTestId('report-message').click(); await p.getByTestId('reason-0').click(); await p.getByTestId('report-send').click(); await p.getByTestId('report-sent').waitFor({ timeout: 15000 }); await p.getByTestId('report-done').click(); await p.waitForTimeout(1000); say('message reported:', sql(`select count(*) from reports where message_id is not null`)); check(sql(`select count(*) from reports where message_id is not null`) === '1', 'report message');
// 3. An event's group chat: Bea hosts a Social event, Cas joins, the chat appears for both with the event's title.
const ev = sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('${U2}','Chat Five-a-side','sport',now()+interval '3 hours',now()+interval '5 hours','Lincoln''s Inn Fields',51.516,-0.117,10) returning id`);
const c = await fresh(); await login(c, 's3@lse.ac.uk'); await c.goto(BASE + '/social/' + ev); await c.getByTestId('join-social').waitFor({ timeout: 20000 }); await c.getByTestId('join-social').click(); await c.getByTestId('group-chat').waitFor({ timeout: 15000 });
await c.getByTestId('group-chat').click(); await c.waitForURL(/\/chats\/[0-9a-f-]{36}/, { timeout: 15000 }); await c.getByText('Event chat · 2 people').waitFor({ timeout: 15000 }); await c.getByTestId('draft').fill('Anyone need boots?'); await c.getByTestId('send').click(); await c.getByTestId('messages').getByText('Anyone need boots?').waitFor({ timeout: 15000 });
await q.goto(BASE + '/chats'); await q.getByText('Chat Five-a-side').waitFor({ timeout: 20000 }); say('Bea sees the group chat:', (await q.getByTestId('threads').innerText()).replace(/\n/g, ' | ').slice(0, 120));
check(/Anyone need boots\?/.test(await q.getByTestId('threads').innerText()), 'group chat preview');
// 4. Society event notification: a new LSE Poker event shows for a member.
const lse = sql(`select id from societies where slug='lse-poker-society'`); const venue = sql(`select id from venues limit 1`);
sql(`insert into society_members (society_id,user_id,status) values ('${lse}','${U2}','approved') on conflict (society_id,user_id) do update set status='approved'`);
const post = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${lse}','Chat Notified Night','social','${venue}',now()+interval '2 days',now()+interval '2 days 3 hours','uni') returning id`);
await q.goto(BASE + '/notifications'); await q.getByTestId(`post-${post}`).waitFor({ timeout: 20000 }); say('society post notification:', (await q.getByTestId(`post-${post}`).innerText()).replace(/\n/g, ' '));
console.log('errors:', errs); await b.close();
