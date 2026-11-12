// Expo web build: country flags. Pick a country on Edit profile (searchable,
// "UK" finds the United Kingdom), it's saved as a two-letter code, and the
// flag shows on your profile, the Me tab, friends lists and event guest
// lists; "Prefer not to say" clears it.
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
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002';
sql(`update profiles set country=null where id='${U1}'; update profiles set country='FR' where id='${U2}'`);
sql(`delete from friendships where requester_id in ('${U1}','${U2}') and addressee_id in ('${U1}','${U2}'); insert into friendships (requester_id,addressee_id,status,responded_at) values ('${U2}','${U1}','accepted',now())`);

// 1. Edit profile: the picker is searchable; "uk" finds the United Kingdom; saved as GB.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/account'); await p.getByTestId('country').waitFor({ timeout: 20000 });
say('before:', await p.getByTestId('country').innerText());
await p.getByTestId('country').click(); await p.getByTestId('country-search').waitFor({ timeout: 5000 }); await p.getByTestId('country-search').fill('uk');
await p.getByTestId('country-GB').waitFor({ timeout: 5000 }); const firstOption = await p.getByTestId('country-options').locator('[data-testid^="country-"]').first().getAttribute('data-testid'); say('first match for "uk":', firstOption); check(firstOption === 'country-GB', 'uk finds the United Kingdom first');
await p.getByTestId('country-GB').click(); say('picked:', await p.getByTestId('country').innerText()); await p.getByTestId('save-details').click(); await p.getByText('Saved ✓').waitFor({ timeout: 15000 });
say('saved code:', sql(`select country from profiles where id='${U1}'`)); check(sql(`select country from profiles where id='${U1}'`) === 'GB', 'country saved');
await p.screenshot({ path: S + '/expo-flag-picker.png', fullPage: true });
// 2. Shown on your profile and the Me tab.
await p.goto(BASE + '/u/' + U1); await p.getByTestId('person-card').waitFor({ timeout: 20000 }); await p.getByTestId('profile-flag').waitFor({ timeout: 10000 });
say('profile flag label:', await p.getByTestId('profile-flag').getAttribute('aria-label')); check((await p.getByTestId('profile-flag').getAttribute('aria-label')) === 'United Kingdom', 'profile flag');
await p.goto(BASE + '/me'); await p.getByTestId('my-profile').waitFor({ timeout: 20000 }); check((await p.getByTestId('flag').count()) >= 1, 'me flag');
await p.screenshot({ path: S + '/expo-flag-profile.png', fullPage: true });
// 3. Friends list: Bea's French flag next to her name.
await p.goto(BASE + '/friends'); await p.getByText('Bea Brown').first().waitFor({ timeout: 20000 });
const labels = await p.getByTestId('flag').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))); say('friends page flags:', labels); check(labels.includes('France'), 'friend flag');
// 4. A social event's guest list: Bea hosts, Sam joins; Bea sees Sam's flag in her guest list.
const ev = sql(`insert into social_events (host_id,title,category,starts_at,ends_at,area,lat,lng,spaces) values ('${U2}','Flag Plan','social',now()+interval '1 day',now()+interval '1 day 2 hours','Soho',51.513,-0.132,8) returning id`);
sql(`insert into social_event_members (event_id,user_id,status) values ('${ev}','${U1}','going')`);
const q = await fresh(); await login(q, 's2@lse.ac.uk'); await q.goto(BASE + '/social/' + ev); await q.getByText('Sam Student').first().waitFor({ timeout: 20000 });
const guestFlags = await q.getByTestId('flag').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))); say('guest list flags:', guestFlags); check(guestFlags.includes('United Kingdom') && guestFlags.includes('France'), 'guest list flags');
await q.screenshot({ path: S + '/expo-flag-guests.png', fullPage: true });
// 5. Prefer not to say clears it.
await p.goto(BASE + '/account'); await p.getByTestId('country').waitFor({ timeout: 20000 }); await p.getByTestId('country').click(); await p.getByTestId('country-none').click(); await p.getByTestId('save-details').click(); await p.getByText('Saved ✓').waitFor({ timeout: 15000 });
say('cleared:', JSON.stringify(sql(`select coalesce(country,'<null>') from profiles where id='${U1}'`))); check(sql(`select coalesce(country,'<null>') from profiles where id='${U1}'`) === '<null>', 'country cleared');
console.log('errors:', errs); await b.close();
