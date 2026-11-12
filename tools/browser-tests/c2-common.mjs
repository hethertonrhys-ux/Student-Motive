// Shared by the community screen tests (part C2): the browser, the database
// helper, and logging in through the real login screen (Log in with a code,
// or Sign up for a new account), the way people do it today.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
export const BASE = 'http://localhost:8123';
export const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003', U4 = '00000000-0000-0000-0000-000000000004', UC = '00000000-0000-0000-0000-00000000000c';
export const errs = []; export const say = (...a) => console.log('•', ...a);
export const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
export const check = (ok, what) => { if (!ok) errs.push(what); };
export const browser = await chromium.launch();
// tall: a very tall window, so a screenshot shows the whole screen (the app scrolls inside the page).
export const fresh = async ({ dark = false, desktop = false, tall = false } = {}) => {
  const base = desktop ? { viewport: { width: 1280, height: tall ? 3000 : 900 } } : { ...devices['iPhone 13'], ...(tall ? { viewport: { width: 390, height: 4400 }, deviceScaleFactor: 2 } : {}) };
  const c = await browser.newContext({ ...base, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
  await c.addInitScript(() => { window.__fnTestFiles = true; });
  const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p;
};
// An existing account: Log in -> "Log in with a code instead" -> the code -> skip the password step.
export const loginCode = async (p, email, { stay = false } = {}) => {
  if (!stay) await p.goto(BASE + '/login');
  await p.getByTestId('email').fill(email); await p.getByTestId('use-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {});
  if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
};
// A brand-new account from the Sign up tab: email, code, choose a password (then the welcome step follows).
export const signUp = async (p, email, { stay = false } = {}) => {
  if (!stay) { await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); }
  await p.getByTestId('send-code').waitFor({ timeout: 15000 });
  await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.getByTestId('new-password').waitFor({ timeout: 15000 }); await p.getByTestId('new-password').fill('correct horse 42'); await p.getByTestId('new-password-again').fill('correct horse 42'); await p.getByTestId('save-password').click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
};
export const welcome = async (p, { fullName = 'New Person', nickname = null } = {}) => {
  await p.getByTestId('full-name').waitFor({ timeout: 20000 }); await p.getByTestId('full-name').fill(fullName);
  if (nickname) await p.getByTestId('nickname').fill(nickname);
  await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click();
  await p.waitForURL((u) => !u.pathname.startsWith('/welcome'), { timeout: 20000 });
};
export const path = (p) => new URL(p.url()).pathname;
// Screens left underneath in the web app's stack stay in the page (hidden): only look at what's on screen.
export const see = (p, id) => p.getByTestId(id).filter({ visible: true });
export const text = async (p, id) => ((await see(p, id).count()) ? (await see(p, id).first().innerText()).replace(/\n/g, ' | ') : '(none)');
// The UCL Abacus community (seeded by the migration) with Sky on the Function team and Sam as its first admin.
export const setUpAbacus = () => {
  sql(`update profiles set is_admin = true where id = '${U4}'`);
  const cid = sql(`select id from communities where slug = 'ucl-abacus'`);
  sql(`select set_config('request.jwt.claim.sub', '${U4}', false); select public.admin_set_community_admin('${cid}', '${U1}')`);
  const main = sql(`select t.id from threads t join community_groups g on g.id = t.community_group_id where g.community_id = '${cid}' and g.kind = 'main'`);
  const abafam = sql(`select id from community_groups where community_id = '${cid}' and name = 'AbaFam'`);
  return { cid, main, abafam };
};
// Someone added straight into a community (test set-up only, as the database's owner).
export const addMember = (cid, user, nickname, { role = 'regular', membership = 'non_member', status = 'active', claimed = false, ref = null } = {}) =>
  sql(`insert into community_members (community_id, user_id, nickname, role, membership, status, membership_claimed, referred_by) values ('${cid}', '${user}', '${nickname}', '${role}', '${membership}', '${status}', ${claimed}, ${ref ? `'${ref}'` : 'null'})
       on conflict (community_id, user_id) do update set nickname = excluded.nickname, role = excluded.role, membership = excluded.membership, status = excluded.status, membership_claimed = excluded.membership_claimed`);
// An extra person who never logs in (for requests and rosters).
export const person = (id, email, name) => { sql(`insert into auth.users (id, email) values ('${id}', '${email}') on conflict do nothing`); sql(`update profiles set display_name = '${name}', full_name = '${name}', graduation_year = 2027 where id = '${id}'`); return id; };
export const finish = async () => { await browser.close(); console.log('errors:', JSON.stringify(errs)); };
