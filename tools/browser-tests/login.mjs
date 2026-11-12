// Expo web build, phase 1: login with a code, the welcome step for new
// accounts (uni greeting, LSE prompts, autosave, Continue / Skip), existing
// users skip it, the Me tab shows who you are and logs out, bad emails are
// refused, and a code in progress survives a reload.
// Updated for the 21 Oct Log in / Sign up tabs (codes come from Sign up or
// "Log in with a code instead"; a new account chooses a password, an
// existing one may skip it) and for the map being switched off (the home
// tab is Societies: lib/app-features.ts HOME_PATH).
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const HOME = '/societies';
const b = await chromium.launch(); const n = Date.now() % 100000;
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message)); return p; }
// The Sign up tab's code; then a new account chooses a password, an existing one skips it.
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || document.querySelector('[data-testid="new-password"]'), null, { timeout: 15000 });
  if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click();
  else { await p.getByTestId('new-password').fill('correct horse 42'); await p.getByTestId('new-password-again').fill('correct horse 42'); await p.getByTestId('save-password').click(); }
  await p.waitForURL((u) => u.pathname === '/welcome' || u.pathname === HOME, { timeout: 20000 });
}
// 1. New LSE account: the account-details step (full name, nickname, uni, graduation year), then the home tab.
const a = await fresh(); await login(a, `new${n}@lse.ac.uk`);
say('new account lands on:', new URL(a.url()).pathname); check(a.url().includes('/welcome'), 'no welcome');
await a.getByTestId('welcome-heading').waitFor(); say('heading:', await a.getByTestId('welcome-heading').innerText());
check((await a.getByTestId('uni-tag-LSE').count()) === 1, 'uni tag from email'); check((await a.getByText('Which uni are you at?').count()) === 0, 'picker for uni email');
await a.getByTestId('full-name').fill('New Student'); await a.getByTestId('graduation-year').click(); await a.getByTestId('graduation-year-2027').click();
await a.screenshot({ path: S + '/expo-welcome.png', fullPage: true });
await a.getByTestId('save-details').click(); await a.waitForURL('**' + HOME, { timeout: 20000 }); say('Continue goes to:', new URL(a.url()).pathname);
const uid = sql(`select id from profiles where email='new${n}@lse.ac.uk'`);
say('saved:', sql(`select full_name||' | '||display_name||' | '||graduation_year from profiles where id='${uid}'`)); check(sql(`select display_name from profiles where id='${uid}'`) === 'New Student', 'details saved');
say('events:', sql(`select string_agg(event, ',' order by id) from signup_events where user_id='${uid}'`)); check(sql(`select count(*) from signup_events where user_id='${uid}' and event='account_details_completed'`) === '1', 'completed event');
// Me tab, then log out.
await a.goto(BASE + '/me'); await a.getByText(`new${n}@lse.ac.uk`).waitFor(); say('Me shows:', await a.getByText('LSE ·').textContent());
await a.getByTestId('log-out').click(); await a.waitForURL(BASE + '/'); await a.getByText("London's student social life").first().waitFor(); say('logged out -> landing');
await a.goto(BASE + '/me'); await a.getByText('Log in to see your profile.').waitFor(); say('Me logged out: login prompt');
// 2. The details can't be skipped: no Skip button, and other tabs send you back until they're filled in.
const k = await fresh(); await login(k, `new${n + 1}@lse.ac.uk`); check((await k.getByTestId('skip').count()) === 0, 'skip button exists');
await k.goto(BASE + '/map'); await k.waitForURL(/welcome/, { timeout: 15000 }); say('map before details ->', new URL(k.url()).pathname);
await k.goto(BASE + HOME); await k.waitForURL(/welcome/, { timeout: 15000 }); say('home tab before details ->', new URL(k.url()).pathname);
// 3. Existing user: straight to the home tab, no welcome.
const s = await fresh(); await login(s, 's1@lse.ac.uk'); say('existing user lands on:', new URL(s.url()).pathname); check(new URL(s.url()).pathname === HOME, 'existing saw welcome');
// 4. Logged in: landing redirects to the home tab.
await s.goto(BASE + '/'); await s.waitForURL('**' + HOME); say('landing while logged in ->', HOME);
// 5. Bad email (the committee test allows this domain; make sure it isn't).
sql("delete from allowed_emails where email='@notauni.org'");
const x = await fresh(); await x.goto(BASE + '/login'); await x.getByTestId('mode-signup').click(); await x.getByTestId('email').fill(`x${n}@notauni.org`); await x.getByTestId('send-code').click();
await x.getByText("Function is for London university students").waitFor({ timeout: 15000 }); say('other uni email refused');
// 6. Code in progress survives a reload.
const r = await fresh(); await r.goto(BASE + '/login'); await r.getByTestId('mode-signup').click(); await r.getByTestId('email').fill('s2@lse.ac.uk'); await r.getByTestId('send-code').click(); await r.getByTestId('code').waitFor();
await r.reload(); await r.getByTestId('code').waitFor({ timeout: 10000 }); say('code box still there after reload:', await r.getByText('s2@lse.ac.uk').count() === 1); check(await r.getByText('s2@lse.ac.uk').count() === 1, 'the code box keeps the email after a reload');
// 7. The password path (the Log in tab): shows by default, refuses a wrong password, and offers the code flow instead.
const w = await fresh(); await w.goto(BASE + '/login'); await w.getByTestId('password').waitFor();
await w.getByTestId('email').fill('s2@lse.ac.uk'); await w.getByTestId('password').fill('wrong'); await w.getByTestId('log-in-password').click();
await w.getByTestId('login-error').waitFor({ timeout: 15000 }); say('wrong password refused:', await w.getByTestId('login-error').innerText());
check(new URL(w.url()).pathname === '/login' && !(await w.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')))), 'a wrong password logs nobody in');
await w.getByTestId('use-code').click(); await w.getByTestId('code').waitFor({ timeout: 15000 }); say('back to the code flow'); check(await w.getByText('s2@lse.ac.uk').count() === 1, 'the code goes to that email');
console.log('errors:', errs); await b.close();
