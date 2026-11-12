import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium, devices } = pw;
const B = 'https://app.studentfunction.com'; const errs = [];
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); const c = await b.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true }); const p = await c.newPage();
p.on('pageerror', (e) => errs.push('page: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await p.goto(B + '/'); await p.waitForTimeout(8000); console.log('• landing:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 90));
await p.goto(B + '/s/lse-poker-society'); await p.waitForTimeout(6000); console.log('• society page text:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160));
await p.goto(B + '/societies'); await p.waitForTimeout(6000); console.log('• societies tab:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 120));
await p.goto(B + '/map'); await p.waitForTimeout(10000); console.log('• map canvas:', await p.locator('canvas').count(), '| text:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 100));
await p.screenshot({ path: '/tmp/claude-0/-home-user-student-motive/0c73a7c3-526a-584d-9f1d-8c0b2ea6f4ee/scratchpad' + '/live-map.png' }); await b.close(); console.log('errors:', JSON.stringify(errs.slice(0, 6)));
