// Expo web build, phase 4: the Societies tab (own-uni search, widening to
// all London unis, your societies, upcoming events) and the society page
// (join, request sent, leave, other-uni message, unclaimed label and claim link).
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch(); const n = Date.now() % 100000;
async function fresh() { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || document.querySelector('[data-testid="new-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {});
  if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click();
  else if (await p.getByTestId('new-password').count()) { await p.getByTestId('new-password').fill('correct horse 42'); await p.getByTestId('new-password-again').fill('correct horse 42'); await p.getByTestId('save-password').click(); }
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
// Seed: an unclaimed UCL society (from the SU directory) and a claimed LSE one with an event.
sql(`insert into societies (slug,name,university,source) values ('ucl-chess','UCL Chess Society','UCL','su_directory') on conflict (slug) do update set source='su_directory'`);
sql(`delete from society_members where user_id='00000000-0000-0000-0000-000000000001'; delete from society_admins where user_id='00000000-0000-0000-0000-000000000001'`);
const lse = sql(`select id from societies where slug='lse-poker-society'`);
const lseAdmin = sql(`select count(*) from society_admins where society_id='${lse}'`); say('LSE poker has admins:', lseAdmin);

// 1. LSE student: own-uni search is instant; "Poker" finds the society; "Chess" doesn't until widened.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/societies'); await p.getByTestId('society-search').waitFor({ timeout: 15000 });
await p.getByTestId('society-search').fill('poker'); await p.getByTestId('society-lse-poker-society').waitFor({ timeout: 10000 });
say('scope:', await p.getByTestId('search-scope').innerText()); check(/LSE societies/.test(await p.getByTestId('search-scope').innerText()), 'own-uni scope');
await p.getByTestId('society-search').fill('chess'); await p.getByTestId('widen').waitFor(); say('no LSE match:', (await p.getByTestId('widen').innerText()).replace(/\n/g, ' '));
await p.getByTestId('widen').click(); await p.getByTestId('society-ucl-chess').waitFor({ timeout: 10000 }); say('widened:', await p.getByTestId('search-scope').innerText());
check(/UCL/.test(await p.getByTestId('society-ucl-chess').innerText()), 'uni tag on widened results'); check(sql(`select count(*) from search_events where event='societies_search_all_unis'`) !== '0', 'search analytics row');
await p.screenshot({ path: S + '/expo-societies-search.png', fullPage: true });
// 2. The UCL society page: unclaimed label, no claim link for an LSE student, "for UCL students" instead of a join button.
await p.getByTestId('society-ucl-chess').click(); await p.waitForURL('**/s/ucl-chess'); await p.getByTestId('other-uni').waitFor({ timeout: 15000 });
say('UCL page: unclaimed label', await p.getByTestId('unclaimed').count(), '| claim link for LSE student', await p.getByTestId('claim').count());
check((await p.getByTestId('unclaimed').count()) === 1 && (await p.getByTestId('claim').count()) === 0, 'unclaimed / claim for other uni');
// 3. The LSE society page: join (name pre-filled), request sent at once, then approve in the database and leave.
await p.goto(BASE + '/s/lse-poker-society'); await p.getByTestId('join-card').waitFor({ timeout: 15000 });
say('name pre-filled:', await p.getByTestId('join-name').inputValue()); await p.getByTestId('join-name').fill('Sam Student'); await p.getByTestId('join-society').click();
await p.getByTestId('request-sent').waitFor({ timeout: 15000 }); say('request sent; db status:', sql(`select status from society_members where society_id='${lse}' and user_id='00000000-0000-0000-0000-000000000001'`));
check(sql(`select status from society_members where society_id='${lse}' and user_id='00000000-0000-0000-0000-000000000001'`) === 'pending', 'pending row');
sql(`update society_members set status='approved' where society_id='${lse}' and user_id='00000000-0000-0000-0000-000000000001'`);
await p.reload(); await p.getByTestId('member').waitFor({ timeout: 15000 }); say('member card shown; complete-profile nudge:', await p.getByTestId('complete-profile').count());
await p.screenshot({ path: S + '/expo-society.png', fullPage: true });
// The tab lists it under Your societies.
await p.goto(BASE + '/societies'); await p.getByTestId('my-societies').waitFor({ timeout: 15000 }); say('your societies:', (await p.getByTestId('my-societies').innerText()).replace(/\n/g, ' '));
await p.goto(BASE + '/s/lse-poker-society'); await p.getByTestId('leave').click(); await p.getByTestId('join-card').waitFor({ timeout: 15000 });
await p.waitForTimeout(500); say('left; rows:', sql(`select count(*) from society_members where society_id='${lse}' and user_id='00000000-0000-0000-0000-000000000001'`)); check(sql(`select count(*) from society_members where society_id='${lse}' and user_id='00000000-0000-0000-0000-000000000001'`) === '0', 'leave');
// 4. UCL student sees the claim link on the unclaimed UCL page and can join it.
const u = await fresh(); await login(u, `u${n}@ucl.ac.uk`); await u.goto(BASE + '/s/ucl-chess'); await u.getByTestId('join-card').waitFor({ timeout: 15000 });
say('UCL student: claim link', await u.getByTestId('claim').count()); check((await u.getByTestId('claim').count()) === 1, 'claim link for own uni');
// 5. Logged out: search covers all unis; the society page offers log in.
const v = await fresh(); await v.goto(BASE + '/societies'); await v.waitForLoadState('networkidle'); await v.getByTestId('society-search').fill('chess'); await v.getByTestId('society-ucl-chess').waitFor({ timeout: 10000 });
say('logged out scope:', await v.getByTestId('search-scope').innerText()); check(/all London/.test(await v.getByTestId('search-scope').innerText()), 'logged-out scope');
await v.goto(BASE + '/s/lse-poker-society'); await v.getByText('Log in to join').waitFor({ timeout: 15000 }); say('logged out: log in to join');
console.log('errors:', errs); await b.close();
