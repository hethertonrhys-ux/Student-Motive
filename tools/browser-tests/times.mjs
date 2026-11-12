// Expo web build: event time checks. The committee form warns as soon as
// the finish is before (or the same as) the start and won't save until it's
// fixed; the Social form notes an after-midnight finish, and blocks the same
// time as the start or a plan over 12 hours.
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
const disabled = async (loc) => (await loc.getAttribute('aria-disabled')) === 'true' || (await loc.isDisabled().catch(() => false));
const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);

// 1. Committee: finish before start → warning, Post disabled; fixed → gone, enabled.
const lse = sql(`select id from societies where slug='lse-poker-society'`);
const p = await fresh(); await login(p, 'committee@lse.ac.uk'); await p.goto(BASE + `/dashboard/${lse}/events/new`); await p.getByTestId('ev-title').waitFor({ timeout: 20000 });
await p.getByTestId('ev-title').fill('Times Test Night');
await p.getByTestId('ev-start-date').fill(tomorrow); await p.getByTestId('ev-start-time').fill('19:00'); await p.getByTestId('ev-end-date').fill(tomorrow); await p.getByTestId('ev-end-time').fill('18:00');
await p.getByTestId('ev-time-warning').waitFor({ timeout: 5000 }); say('committee warning:', await p.getByTestId('ev-time-warning').innerText()); check(await disabled(p.getByTestId('ev-submit')), 'committee: save blocked');
await p.screenshot({ path: S + '/expo-times-committee.png', fullPage: true });
await p.getByTestId('ev-end-time').fill('19:00'); await p.waitForTimeout(200); say('same time:', await p.getByTestId('ev-time-warning').innerText()); check(/same as the start/.test(await p.getByTestId('ev-time-warning').innerText()), 'committee: same time');
await p.getByTestId('ev-end-time').fill('22:00'); await p.waitForTimeout(200); check((await p.getByTestId('ev-time-warning').count()) === 0, 'committee: warning cleared'); check(!(await disabled(p.getByTestId('ev-submit'))), 'committee: save enabled');
// 2. Social: 22:00–02:00 is a note; 22:00–22:00 is blocked; 10:00–09:00 (23 hours) is blocked; 10:00–21:00 is fine.
const q = await fresh(); await login(q, 's1@lse.ac.uk'); await q.goto(BASE + '/social/new'); await q.getByTestId('title').waitFor({ timeout: 20000 });
await q.getByTestId('date').fill(tomorrow); await q.getByTestId('start').fill('22:00'); await q.getByTestId('finish').fill('02:00');
await q.getByTestId('finish-note').waitFor({ timeout: 5000 }); say('social note:', await q.getByTestId('finish-note').innerText()); check(/next morning/.test(await q.getByTestId('finish-note').innerText()), 'social: after-midnight note'); check(!(await disabled(q.getByTestId('submit'))), 'social: note does not block');
await q.getByTestId('finish').fill('22:00'); await q.getByTestId('finish-warning').waitFor({ timeout: 5000 }); say('social same:', await q.getByTestId('finish-warning').innerText()); check(await disabled(q.getByTestId('submit')), 'social: same time blocked');
await q.getByTestId('start').fill('10:00'); await q.getByTestId('finish').fill('09:00'); await q.waitForTimeout(200); say('social long:', await q.getByTestId('finish-warning').innerText()); check(/12 hours/.test(await q.getByTestId('finish-warning').innerText()) && (await disabled(q.getByTestId('submit'))), 'social: over 12 hours blocked');
await q.screenshot({ path: S + '/expo-times-social.png', fullPage: true });
await q.getByTestId('finish').fill('21:00'); await q.waitForTimeout(200); check((await q.getByTestId('finish-warning').count()) === 0 && (await q.getByTestId('finish-note').count()) === 0 && !(await disabled(q.getByTestId('submit'))), 'social: fine');
console.log('errors:', errs); await b.close();
