// Delete my account: a new account signs up, deletes itself from the
// profile editor, lands on the landing page logged out, and the login,
// profile and prompt rows are gone. Cancelling the "are you sure?" keeps it.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch(); const n = Date.now() % 100000; const email = `del${n}@lse.ac.uk`;
const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message));
await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); await p.getByTestId('full-name').fill('Del Eted'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL('**/map', { timeout: 20000 });
await p.goto(BASE + '/account'); await p.getByTestId('full-name').waitFor({ timeout: 20000 }); await p.waitForTimeout(500);
const uid = sql(`select id from profiles where email='${email}'`); say('new account', uid.slice(0, 8), '| name:', sql(`select full_name from profiles where id='${uid}'`));
await p.getByTestId('delete-account').waitFor({ timeout: 15000 });
// Cancel first: nothing happens.
p.once('dialog', (d) => { say('dialog:', d.message().slice(0, 60) + '…'); d.dismiss(); }); await p.getByTestId('delete-account').click(); await p.waitForTimeout(1000);
check(sql(`select count(*) from profiles where id='${uid}'`) === '1', 'deleted after cancel'); say('cancel keeps the account');
// Then for real.
p.once('dialog', (d) => d.accept()); await p.getByTestId('delete-account').click(); await p.waitForURL(BASE + '/', { timeout: 20000 }); await p.getByTestId('landing-title').waitFor();
say('after delete ->', new URL(p.url()).pathname, '| profile rows:', sql(`select count(*) from profiles where id='${uid}'`), '| logins:', sql(`select count(*) from auth.users where id='${uid}'`));
check(sql(`select count(*) from profiles where id='${uid}'`) === '0' && sql(`select count(*) from auth.users where id='${uid}'`) === '0', 'rows remain');
await p.goto(BASE + '/me'); await p.getByText('Log in to see your profile.').waitFor(); say('logged out');
await b.close(); console.log('errors:', JSON.stringify(errs));
