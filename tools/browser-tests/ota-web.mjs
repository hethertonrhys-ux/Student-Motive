// Expo web build: over-the-air updates must not touch the website. The
// phone updater (expo-updates) and the "A new version of Function is
// ready" banner must not be in the web bundle, no banner shows anywhere
// (logged out, logged in on the tabs, on an event page), and the local test
// build still uses the local test database from apps/mobile/.env (never the
// live one from eas.json).
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; import { readdirSync, readFileSync } from 'fs'; import { join } from 'path'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const DIST = '/home/user/student-motive/apps/mobile/dist';

// 1. The built website's JavaScript.
const jsDir = join(DIST, '_expo/static/js/web');
const js = readdirSync(jsDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(jsDir, f), 'utf8')).join('\n');
const html = readdirSync(DIST, { recursive: true }).filter((f) => String(f).endsWith('.html')).map((f) => readFileSync(join(DIST, String(f)), 'utf8')).join('\n');
say('web js files:', readdirSync(jsDir).length, '| bytes:', js.length, '| html bytes:', html.length);
// (expo-constants always asks whether a native 'ExpoUpdates' module exists, so that name alone proves nothing; these are expo-updates' own.)
for (const needle of ['checkForUpdateAsync', 'fetchUpdateAsync', 'isUpdatePending', 'isRollBackToEmbedded', 'NO_UPDATE_AVAILABLE_ON_SERVER', 'A new version of Function is ready', 'update-restart', 'update-banner']) {
  const inJs = js.includes(needle), inHtml = html.includes(needle);
  say(`"${needle}" in web js: ${inJs} | in html: ${inHtml}`); check(!inJs && !inHtml, 'web build contains ' + needle);
}
say('local test database in web build:', js.includes('localhost:54400'), '| live database in web build:', js.includes('xrpbmcoptyrpgkdowfdt'));
check(js.includes('localhost:54400'), 'web build lost the local .env database'); check(!js.includes('xrpbmcoptyrpgkdowfdt'), 'web build points at the live database');

// 2. In the browser: no banner anywhere, no errors.
const b = await chromium.launch();
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); }); p.on('dialog', (d) => d.accept()); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
const banners = async (p) => (await p.getByTestId('update-banner').count()) + (await p.getByText('A new version of Function is ready').count());

const p = await fresh();
await p.goto(BASE + '/'); await p.getByTestId('landing-title').waitFor(); await p.waitForTimeout(1500);
say('landing (logged out) banners:', await banners(p)); check((await banners(p)) === 0, 'banner on landing');
// Pretend the app came back to the foreground, as a phone would.
await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); }); await p.waitForTimeout(500);
check((await banners(p)) === 0, 'banner after focus');

await login(p, 's1@lse.ac.uk'); await p.waitForTimeout(1500);
say('map tab banners:', await banners(p), '| url:', p.url()); check((await banners(p)) === 0, 'banner on map');
for (const tab of ['societies', 'social', 'chats', 'me']) { await p.goto(BASE + '/' + tab); await p.waitForTimeout(1200); const n = await banners(p); say(tab, 'banners:', n); check(n === 0, 'banner on ' + tab); }
const venue = sql(`select id from venues limit 1`); const poker = sql(`select id from societies where slug='lse-poker-society'`);
const ev = sql(`insert into events (society_id, venue_id, title, category, starts_at, ends_at, audience) values ('${poker}', '${venue}', 'OTA web check', 'social', now() + interval '1 day', now() + interval '1 day 2 hours', 'london') returning id`).split('\n')[0];
say('event:', ev); check(!!ev, 'no event to open');
if (ev) { await p.goto(BASE + '/e/' + ev); await p.getByText('OTA web check').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(1500); const n = await banners(p); say('event page banners:', n); check(n === 0, 'banner on event page'); }
await p.screenshot({ path: S + '/ota-web-me.png' });
await b.close(); console.log('errors:', JSON.stringify(errs));
