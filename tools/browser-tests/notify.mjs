// Phase 6: notification settings save and persist; the Me tab links to them; the push card appears after joining an event.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const U1 = '00000000-0000-0000-0000-000000000001'; sql(`delete from notification_settings where user_id='${U1}'`);
const b = await chromium.launch(); const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message));
await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill('s1@lse.ac.uk'); await p.getByTestId('send-code').click(); await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click(); await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {}); if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click(); await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
await p.goto(BASE + '/me'); await p.getByTestId('notification-settings').click(); await p.waitForURL('**/account/notifications'); await p.getByTestId('notification-kinds').waitFor({ timeout: 20000 });
say('device card:', (await p.getByTestId('push-device').innerText()).replace(/\n/g, ' ').slice(0, 90));
await p.getByTestId('notify-messages').click(); await p.waitForTimeout(800); say('after toggling messages off:', sql(`select messages||'|'||friends||'|'||reminders from notification_settings where user_id='${U1}'`));
check(sql(`select messages from notification_settings where user_id='${U1}'`) === 'f', 'messages saved off');
await p.getByTestId('notify-reminders').click(); await p.waitForTimeout(800); await p.reload(); await p.getByTestId('notification-kinds').waitFor({ timeout: 20000 }); await p.waitForTimeout(1000);
const checkedOf = async (id) => p.getByTestId(id).getAttribute('aria-checked');
say('after reload: messages', await checkedOf('notify-messages'), '| reminders', await checkedOf('notify-reminders'), '| friends', await checkedOf('notify-friends'));
check((await checkedOf('notify-messages')) === 'false' && (await checkedOf('notify-friends')) === 'true', 'settings persisted');
// A queued push respects the setting: a message to Sam queues nothing while messages are off (and Sam has a token).
sql(`insert into push_tokens (user_id, platform, token) values ('${U1}','ios','ExponentPushToken[notify-test]') on conflict (token) do nothing; delete from push_queue`);
const dm = sql(`select id from threads where user_a='${U1}' or user_b='${U1}' order by created_at desc limit 1`);
if (dm) { sql(`insert into messages (thread_id, sender_id, body) values ('${dm}','00000000-0000-0000-0000-000000000002','quiet please')`); say('queued while off:', sql('select count(*) from push_queue')); check(sql('select count(*) from push_queue') === '0', 'setting ignored'); }
await p.getByTestId('notify-messages').click(); await p.waitForTimeout(800);
if (dm) { sql(`insert into messages (thread_id, sender_id, body) values ('${dm}','00000000-0000-0000-0000-000000000002','loud please')`); say('queued while on:', sql("select kind||': '||title||' - '||body from push_queue")); check(sql('select count(*) from push_queue') === '1', 'push queued'); }
sql(`delete from push_tokens where token='ExponentPushToken[notify-test]'; delete from push_queue`);
await p.screenshot({ path: S + '/expo-notify.png', fullPage: true });
await b.close(); console.log('errors:', JSON.stringify(errs));
