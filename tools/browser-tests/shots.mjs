// Screenshots of every screen, light and dark, at iPhone size, for the design audit.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123';
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const U2 = sql("select id from profiles where email='s2@lse.ac.uk'"); const lse = sql("select id from societies where slug='lse-poker-society'");
const ev = sql(`select id from events where society_id='${lse}' and not is_hidden order by starts_at desc limit 1`); const soc = sql("select id from social_events order by created_at desc limit 1");
const thread = sql("select id from threads order by created_at desc limit 1"); const dashEv = ev;
const b = await chromium.launch();
async function login(p, email) { await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click(); await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click(); await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); } }
const routes = [['landing', '/'], ['login', '/login'], ['map', '/map'], ['societies', '/societies'], ['social', '/social'], ['chats', '/chats'], ['me', '/me'], ['account', '/account'], ['archive', '/account/archive'], ['friends', '/friends'], ['notifications', '/notifications'], ['society', '/s/lse-poker-society'], ['event', `/e/${ev}`], ['person', `/u/${U2}`], ['social-new', '/social/new'], ['social-event', `/social/${soc}`], ['chat', `/chats/${thread}`], ['dashboard', '/dashboard'], ['claim', '/dashboard/claim'], ['society-dash', `/dashboard/${lse}`], ['event-new', `/dashboard/${lse}/events/new`], ['manage-event', `/dashboard/${lse}/events/${dashEv}`], ['members', `/dashboard/${lse}/members`], ['install', '/install'], ['privacy', '/privacy'], ['not-found', '/nope']];
for (const scheme of ['light', 'dark']) {
  const c = await b.newContext({ ...devices['iPhone 13'], colorScheme: scheme }); const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
  await login(p, 's1@lse.ac.uk');
  for (const [name, path] of routes) {
    try { await p.goto(BASE + path); await p.waitForTimeout(name === 'map' ? 6000 : 2500); await p.screenshot({ path: `${S}/shots/${name}-${scheme}.png`, fullPage: name !== 'map' && name !== 'chat' }); } catch (e) { console.log('skip', name, e.message.slice(0, 80)); }
    if (name === 'map') { try { await p.getByTestId('filter').click(); await p.waitForTimeout(600); await p.screenshot({ path: `${S}/shots/map-filter-${scheme}.png` }); await p.getByTestId('filter-done').click(); await p.getByText('List').click(); await p.waitForTimeout(1500); await p.screenshot({ path: `${S}/shots/map-list-${scheme}.png`, fullPage: true }); } catch (e) { console.log('skip map extras', e.message.slice(0, 80)); } }
    if (name === 'event') { try { const sel = p.locator('[data-testid="join"], [data-testid="sit"]').first(); } catch {} }
  }
  // Admin page as the admin user.
  const a = await b.newContext({ ...devices['iPhone 13'], colorScheme: scheme }); const ap = await a.newPage(); await login(ap, 's4@lse.ac.uk'); await ap.goto(BASE + '/admin'); await ap.waitForTimeout(2500); await ap.screenshot({ path: `${S}/shots/admin-${scheme}.png`, fullPage: true });
  console.log(scheme, 'done; page errors:', errs.length ? errs : 'none');
}
await b.close();
