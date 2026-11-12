// Phase 5: Chats split into "Events & Societies" and "Personal", with unread counts on each tab.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002';
// Seed: a private chat with 2 unread, and a social event group chat with 1 unread, both for Sam.
sql(`delete from messages; delete from thread_reads; delete from threads; delete from social_event_members; delete from social_events where title like 'Tabs %'`);
sql(`delete from friendships where (requester_id='${U1}' and addressee_id='${U2}') or (requester_id='${U2}' and addressee_id='${U1}'); insert into friendships (requester_id, addressee_id, status) values ('${U2}','${U1}','accepted')`);
sql(`insert into threads (user_a, user_b) values ('${U1}','${U2}')`); const dm = sql(`select id from threads where user_a='${U1}' and user_b='${U2}'`);
sql(`insert into messages (thread_id, sender_id, body) values ('${dm}','${U2}','first'),('${dm}','${U2}','second')`);
sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('${U2}','Tabs Five-a-side','sport',now()+interval '1 day',now()+interval '1 day 2 hours','Lincoln''s Inn Fields',51.516,-0.117,10)`);
const se = sql("select id from social_events where title='Tabs Five-a-side'"); sql(`insert into social_event_members (event_id,user_id,status) values ('${se}','${U1}','going')`);
const gt = sql(`select id from threads where social_event_id='${se}'`); /* made by a trigger when the event was created */ sql(`insert into messages (thread_id, sender_id, body) values ('${gt}','${U2}','boots?')`);
const b = await chromium.launch(); const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message));
await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill('s1@lse.ac.uk'); await p.getByTestId('send-code').click(); await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click(); await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {}); if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click(); await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
await p.goto(BASE + '/chats'); await p.getByTestId('chats-tab-events').waitFor({ timeout: 20000 }); await p.getByTestId('threads').waitFor({ timeout: 20000 });
const tabText = async (id) => (await p.getByTestId(id).innerText()).replace(/\n/g, ' ');
say('tabs:', await tabText('chats-tab-events'), '|', await tabText('chats-tab-personal'));
check(/1/.test(await tabText('chats-tab-events')) && /2/.test(await tabText('chats-tab-personal')), 'unread counts per tab');
const list1 = (await p.getByTestId('threads').innerText()).replace(/\n/g, ' | '); say('events tab list:', list1.slice(0, 100)); check(/Tabs Five-a-side/.test(list1) && !/Bea Brown/.test(list1), 'events tab shows only group chats');
await p.getByTestId('chats-tab-personal').click(); await p.waitForTimeout(300); const list2 = (await p.getByTestId('threads').innerText()).replace(/\n/g, ' | '); say('personal tab list:', list2.slice(0, 100)); check(/Bea Brown/.test(list2) && !/Tabs Five-a-side/.test(list2), 'personal tab shows only private chats');
await p.getByTestId(`thread-${dm}`).click(); await p.waitForURL(`**/chats/${dm}`); await p.getByTestId('messages').getByText('second').waitFor({ timeout: 15000 }); await p.getByTestId('back').click(); await p.waitForURL('**/chats'); await p.waitForTimeout(1500);
say('after reading the private chat:', await tabText('chats-tab-personal')); check(!/\d/.test(await tabText('chats-tab-personal')), 'personal badge cleared');
await p.screenshot({ path: S + '/expo-chats-tabs.png', fullPage: true });
await b.close(); console.log('errors:', JSON.stringify(errs));
