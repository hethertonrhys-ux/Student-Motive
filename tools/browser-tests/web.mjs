// Expo web build, phase 10: landing and uni pages (and the remembered uni
// on the login page), privacy / terms / support, the install guide, the
// not-found page, the manifest, and no console or page errors anywhere.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh(dev = devices['iPhone 13']) { const c = await b.newContext(dev); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); }); return p; }
const p = await fresh();
// Home landing.
await p.goto(BASE + '/'); await p.getByTestId('landing-title').waitFor(); await p.waitForTimeout(800);
say('home title:', await p.getByTestId('landing-title').textContent(), '| badge:', await p.getByTestId('landing-badge').textContent(), '| tab title:', await p.title());
check((await p.getByText('What societies get').count()) === 1, 'perks'); check((await p.getByTestId('header-login').count()) === 1, 'header login'); check((await p.getByText('Students: put Function on your phone').count()) === 1, 'install box');
await p.screenshot({ path: S + '/expo-landing.png', fullPage: true });
// Footer links.
await p.getByTestId('footer-privacy').last().click(); await p.waitForURL('**/privacy'); await p.getByTestId('prose-title').last().waitFor(); await p.waitForTimeout(500);
say('privacy:', await p.getByTestId('prose-title').last().textContent(), '| tab title:', await p.title(), '| bullets:', await p.getByText('•').count());
check((await p.getByText('Draft: this page must be reviewed').count()) === 0, 'draft banner still there');
await p.getByTestId('footer-terms').last().click(); await p.waitForURL('**/terms'); await p.getByText('Terms of Service').first().waitFor(); say('terms ok');
await p.getByTestId('footer-support').last().click(); await p.waitForURL('**/support'); await p.getByText('I didn').first().waitFor(); say('support ok');
await p.screenshot({ path: S + '/expo-support.png', fullPage: true });
// Uni page remembers the uni for the login example.
await p.goto(BASE + '/kings'); await p.getByTestId('landing-title').waitFor(); await p.waitForTimeout(800);
say('kings title:', await p.getByTestId('landing-title').textContent(), '| badge:', await p.getByTestId('landing-badge').textContent(), '| login button:', await p.getByTestId('landing-login').textContent(), '| tab title:', await p.title());
check((await p.getByTestId('landing-title').textContent()) === "King's student social life, all in one place.", 'possessive');
await p.getByTestId('landing-login').click(); await p.waitForURL('**/login'); await p.waitForTimeout(500);
const ph = await p.getByTestId('email').getAttribute('placeholder'); say('login example after /kings:', ph); check(ph === 'you@kcl.ac.uk', 'arrival uni');
await p.goto(BASE + '/imperial'); await p.getByTestId('landing-title').waitFor(); await p.waitForTimeout(500); await p.goto(BASE + '/login'); await p.waitForTimeout(500);
say('login example after /imperial:', await p.getByTestId('email').getAttribute('placeholder'));
// Install guide on an iPhone (Safari) and on a desktop.
await p.goto(BASE + '/install'); await p.getByTestId('install-title').waitFor(); await p.waitForTimeout(800);
say('install iphone: steps', await p.getByTestId('install-steps').locator('>div').count(), '| in Safari note:', await p.getByText("You're already in Safari").count(), '| tab title:', await p.title());
check((await p.getByTestId('install-steps').locator('>div').count()) === 6, 'iphone steps');
await p.getByTestId('tab-android').click(); await p.waitForTimeout(300); say('android tab: steps', await p.getByTestId('install-steps').locator('>div').count(), '| copy box:', await p.getByTestId('copy-link').count());
await p.screenshot({ path: S + '/expo-install.png', fullPage: true });
const d = await fresh(devices['Desktop Chrome']); await d.goto(BASE + '/install'); await d.getByTestId('install-title').waitFor(); await d.waitForTimeout(800);
say('install desktop: on a computer note', await d.getByText('On a computer?').count(), '| tabs picked:', await d.getByTestId('install-steps').count());
// Not found, manifest, icons.
await p.goto(BASE + '/no-such-page'); await p.getByTestId('not-found').waitFor(); say('404 page ok'); await p.getByText('Go home').click(); await p.waitForURL(BASE + '/'); say('404 -> home');
const m = await p.request.get(BASE + '/manifest.webmanifest'); const mj = await m.json(); say('manifest:', m.status(), mj.name, mj.theme_color, mj.start_url, mj.icons.length);
for (const f of ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/function-iphone-story.png']) check((await p.request.get(BASE + f)).status() === 200, 'missing ' + f);
const html = await (await p.request.get(BASE + '/lse')).text(); say('lse html has manifest link:', html.includes('rel="manifest"'), '| apple icon:', html.includes('apple-touch-icon'), '| pre-rendered title text:', html.includes('student social life, all in one place'));
// Logged-in home still goes to the map (phase 1 behaviour).
await b.close(); console.log('errors:', JSON.stringify(errs));
