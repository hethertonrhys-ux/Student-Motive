// Phase 3: creating an account (full name, nickname, uni tag, graduation
// year), the gate for older accounts missing those details, what a profile
// shows, and the account settings tabs (profile, password & security).
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch(); const n = Date.now() % 100000;
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message)); return p; }
async function login(p, email) { await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click(); await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click(); await p.waitForURL(/\/(welcome|map|societies)/, { timeout: 20000 }); }
// 1. New LSE account: the details step, with the uni from the email.
const a = await fresh(); const email = `nina${n}@lse.ac.uk`; await login(a, email);
say('new account lands on:', new URL(a.url()).pathname); check(a.url().includes('/welcome'), 'no welcome');
await a.getByTestId('welcome-heading').waitFor(); say('heading:', await a.getByTestId('welcome-heading').innerText()); check((await a.getByTestId('uni-tag-LSE').count()) === 1, 'uni tag');
await a.getByTestId('save-details').click(); await a.getByTestId('details-error').waitFor(); say('empty:', await a.getByTestId('details-error').innerText());
await a.getByTestId('full-name').fill('Nina'); await a.getByTestId('save-details').click(); await a.waitForTimeout(300); say('one word:', await a.getByTestId('details-error').innerText()); check(/first and last/.test(await a.getByTestId('details-error').innerText()), 'first+last check');
await a.getByTestId('full-name').fill('Nina Test'); await a.getByTestId('save-details').click(); await a.waitForTimeout(300); say('no year:', await a.getByTestId('details-error').innerText()); check(/year/.test(await a.getByTestId('details-error').innerText()), 'year required');
await a.getByTestId('nickname').fill('Nins'); await a.getByTestId('graduation-year').click(); await a.getByTestId('graduation-year-2028').click(); await a.getByTestId('save-details').click(); await a.waitForURL('**/map', { timeout: 20000 });
const uid = sql(`select id from profiles where email='${email}'`); say('saved:', sql(`select full_name||' | '||nickname||' | '||display_name||' | '||graduation_year||' | '||university from profiles where id='${uid}'`));
check(sql(`select display_name from profiles where id='${uid}'`) === 'Nins' && sql(`select graduation_year from profiles where id='${uid}'`) === '2028', 'details saved');
check(sql(`select count(*) from signup_events where user_id='${uid}' and event='account_details_completed'`) === '1', 'funnel event');
// The profile shows nickname and real name, and the uni tag.
await a.goto(BASE + `/u/${uid}`); await a.getByTestId('person-card').waitFor({ timeout: 20000 }); const card = (await a.getByTestId('person-card').innerText()).replace(/\n/g, ' | '); say('profile card:', card.slice(0, 120));
check(/Nins/.test(card) && /Nina Test/.test(card), 'nickname + full name'); check((await a.getByTestId('person-card').getByTestId('uni-tag-LSE').count()) === 1, 'tag on profile');
// Back button on the profile.
check((await a.getByTestId('back').count()) >= 1, 'profile back button');
await a.screenshot({ path: S + '/expo-account-profile.png', fullPage: true });
// 2. Account settings: profile tab with the details, security tab with password + 2FA.
await a.goto(BASE + '/account'); await a.getByTestId('account-tab-security').waitFor({ timeout: 20000 }); check((await a.getByTestId('full-name').inputValue()) === 'Nina Test', 'editor prefilled');
await a.getByTestId('nickname').fill(''); await a.getByTestId('save-details').click(); await a.getByText('Saved ✓').first().waitFor({ timeout: 15000 }); say('nickname cleared -> display_name:', sql(`select display_name from profiles where id='${uid}'`)); check(sql(`select display_name from profiles where id='${uid}'`) === 'Nina Test', 'display falls back to full name');
await a.getByTestId('account-tab-security').click(); await a.getByTestId('new-password').waitFor({ timeout: 15000 });
await a.getByTestId('new-password').fill('short'); await a.getByTestId('save-password').click(); await a.getByText('Use at least 8 characters.').waitFor(); say('short password refused');
await a.getByTestId('new-password').fill('longenough1'); await a.getByTestId('new-password-again').fill('longenough2'); await a.getByTestId('save-password').click(); await a.getByText("The two passwords don't match.").waitFor(); say('mismatch refused');
await a.getByTestId('add-totp').click(); await a.getByTestId('mfa-error').waitFor({ timeout: 15000 }); say('2FA (fake backend) says:', await a.getByTestId('mfa-error').innerText());
await a.screenshot({ path: S + '/expo-account-security.png', fullPage: true });
// 3. An older account missing the details is asked next time, wherever it goes.
sql("update profiles set full_name=null, graduation_year=null where email='s3@lse.ac.uk'");
const c = await fresh(); await login(c, 's3@lse.ac.uk'); say('old account lands on:', new URL(c.url()).pathname); check(c.url().includes('/welcome'), 'old account not asked');
say('old heading:', await c.getByTestId('welcome-heading').innerText()); check((await c.getByTestId('full-name').inputValue()) === 'Cas Clark', 'old name prefilled');
await c.goto(BASE + '/societies'); await c.waitForURL(/welcome/, { timeout: 15000 }); say('gate sends /societies ->', new URL(c.url()).pathname + new URL(c.url()).search);
await c.getByTestId('graduation-year').click(); await c.getByTestId('graduation-year-2027').click(); await c.getByTestId('save-details').click(); await c.waitForURL('**/societies', { timeout: 20000 }); say('after details -> societies');
check(sql("select full_name||'|'||graduation_year from profiles where email='s3@lse.ac.uk'") === 'Cas Clark|2027', 'old account saved');
// 4. Invited with a non-uni email: picks the university.
sql(`insert into allowed_emails (email) values ('guest${n}@gmail.com') on conflict do nothing`);
const g = await fresh(); await login(g, `guest${n}@gmail.com`); await g.getByTestId('uni-select').waitFor({ timeout: 15000 }); say('non-uni email: picker shown');
await g.getByTestId('full-name').fill('Guest Person'); await g.getByTestId('uni-select').click(); await g.getByTestId('uni-select-QMUL').click(); await g.getByTestId('graduation-year').click(); await g.getByTestId('graduation-year-2029').click(); await g.getByTestId('save-details').click(); await g.waitForURL('**/map', { timeout: 20000 });
say('guest saved:', sql(`select university||'|'||graduation_year from profiles where email='guest${n}@gmail.com'`)); check(sql(`select university from profiles where email='guest${n}@gmail.com'`) === 'QMUL', 'picked uni saved');
// 5. A London uni that isn't one of the original four can sign up.
const q = await fresh(); await login(q, `qm${n}@qmul.ac.uk`); await q.getByTestId('uni-tag-QMUL').waitFor({ timeout: 15000 }); say('QMUL email accepted, tag QMUL');
const r = await fresh(); await r.goto(BASE + '/login'); await r.getByTestId('email').fill(`x${n}@notauni.com`); await r.getByTestId('send-code').click(); await r.getByText('Function is for London university students').waitFor({ timeout: 15000 }); say('non-uni email refused');
await b.close(); console.log('errors:', JSON.stringify(errs));
