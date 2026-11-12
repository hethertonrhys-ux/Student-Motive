// Expo web build: instant claim links (Part 2). A Function admin (Sky)
// finds an unclaimed society in Admin → Societies, makes a claim link and
// copies it (and the DM). Logged out, the link shows the society and a log
// in button; Bea logs in from it, comes back, is made a manager and lands on
// the Society Hub's setup (Part 3: the welcome step). Someone else (Cas)
// opening the same link is told it's been used; an admin checking the link
// doesn't use it up; an expired, a cancelled and a made-up link each say so;
// someone new signs up from a link (details step, then back to claim it);
// the admin list shows who used each link. Logging in from a link claims it
// exactly once and leaves no claim page behind; a logged-out manager reopening
// their used link can log in from it; cancelling an older link keeps the new
// one on screen.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh(extra = {}) { const c = await b.newContext({ ...devices['iPhone 13'], ...extra }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
async function fillCode(p, email) {
  await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || document.querySelector('[data-testid="new-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {});
  if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click();
  else if (await p.getByTestId('new-password').count()) { await p.getByTestId('new-password').fill('correct horse 42'); await p.getByTestId('new-password-again').fill('correct horse 42'); await p.getByTestId('save-password').click(); }
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}
async function login(p, email) {
  await p.goto(BASE + '/login'); await fillCode(p, email); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); }
}
const U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003', U4 = '00000000-0000-0000-0000-000000000004';
// Search Admin → Societies and wait until the list shows only matches (the
// search is debounced, so the first list on screen may be the old one).
async function searchFor(p, text, id) {
  await p.getByTestId('admin-society-search').fill(text);
  await p.waitForFunction((t) => { const rows = [...document.querySelectorAll('[data-testid^="admin-society-"]')].filter((e) => /^admin-society-[0-9a-f-]{36}$/.test(e.dataset.testid)); return rows.length > 0 && rows.every((r) => r.textContent.toLowerCase().includes(t.toLowerCase())); }, text, { timeout: 15000 });
  await p.getByTestId(`admin-society-${id}`).waitFor({ timeout: 15000 });
}
// Counts the claim (redeem) calls a page makes.
function countRedeems(p) { const n = { v: 0 }; p.on('request', (r) => { if (r.url().includes('/rpc/redeem_society_claim_link')) n.v++; }); return n; }
const tokenOf = (url) => (url.match(/\/claim\/([0-9a-f]{64})$/) || [])[1];
const hash = (t) => `encode(sha256(convert_to('${t}','UTF8')),'hex')`;

// Seed: Sky is a Function admin; a society nobody manages yet.
sql(`update profiles set is_admin=true where id='${U4}'; update profiles set is_admin=false where id in ('${U2}','${U3}')`);
sql(`insert into societies (slug,name,university) values ('claim-test-society','Claim Test Society','LSE') on conflict (slug) do nothing`);
const soc = sql(`select id from societies where slug='claim-test-society'`);
const poker = sql(`select id from societies where slug='lse-poker-society'`);
sql(`delete from society_admins where society_id='${soc}'; delete from society_claim_links where society_id='${soc}'`);
const pokerManagers = sql(`select string_agg(user_id::text, ',' order by user_id) from society_admins where society_id='${poker}'`);

// 1. Sky finds the society in Admin → Societies and makes a link.
const a = await fresh({ permissions: ['clipboard-read', 'clipboard-write'] }); await login(a, 's4@lse.ac.uk');
await a.goto(BASE + '/admin/societies'); await a.getByTestId('admin-tab-societies').waitFor({ timeout: 20000 });
await searchFor(a, 'Claim Test', soc);
check((await a.getByTestId(`admin-society-${soc}`).innerText()).includes('Unclaimed'), 'the society shows as unclaimed');
say('search row:', (await a.getByTestId(`admin-society-${soc}`).innerText()).replace(/\n/g, ' | '));
await a.getByTestId(`admin-society-${soc}`).click(); await a.getByTestId('create-claim-link').waitFor({ timeout: 15000 });
await a.getByTestId('create-claim-link').click(); await a.getByTestId('claim-link-url').waitFor({ timeout: 15000 });
const url1 = (await a.getByTestId('claim-link-url').innerText()).trim(); const tok1 = tokenOf(url1);
say('link:', url1.replace(/[0-9a-f]{64}$/, '<secret>')); check(!!tok1 && url1.startsWith('https://studentfunction.com/claim/'), 'the link is <site>/claim/<64 hex>');
check(sql(`select count(*) from society_claim_links where society_id='${soc}' and token_hash=${hash(tok1)} and created_by='${U4}'`) === '1', 'the link is stored by its hash, made by Sky');
check(sql(`select count(*) from society_claim_links c where c::text like '%${tok1}%'`) === '0', 'the secret itself is not stored');
check((await a.getByTestId('claim-link-made').innerText()).includes('Expires'), 'the new link shows when it expires');
await a.getByTestId('copy-claim-link').click(); await a.getByText('Link copied').waitFor({ timeout: 5000 });
check((await a.evaluate(() => navigator.clipboard.readText())) === url1, 'Copy link copies the link');
await a.getByTestId('copy-claim-dm').click(); await a.getByText('Message copied').waitFor({ timeout: 5000 });
const dm = await a.evaluate(() => navigator.clipboard.readText()); say('dm:', dm.replace(/[0-9a-f]{64}/, '<secret>'));
check(dm.includes('Claim Test Society') && dm.includes(url1) && dm.includes('7 days'), 'the DM has the name, the link and "7 days"');
await a.getByTestId('claim-links').getByText(/Ready until/).waitFor({ timeout: 15000 });
check((await a.getByTestId('claim-links').locator('[data-testid^="claim-link-"]').filter({ hasText: 'Made' }).count()) === 1, 'one link listed');

// 2. Logged out, the link shows the society and a log in button.
const o = await fresh(); const oRedeems = countRedeems(o); await o.goto(BASE + '/claim/' + tok1); await o.getByTestId('claim-society-name').waitFor({ timeout: 20000 });
check((await o.getByTestId('claim-society-name').innerText()).includes('Claim Test Society is on Function'), 'logged out: the society name');
check((await o.getByTestId('claim-login').count()) === 1, 'logged out: the log in button');
check((await o.getByTestId('claim-page').innerText()).includes('London School of Economics'), 'logged out: the uni');
check(sql(`select used_at is null from society_claim_links where token_hash=${hash(tok1)}`) === 't', 'just looking does not use the link');

// 2b. Sky (a Function admin) checking the link isn't made the manager by accident.
const a2 = await fresh(); await login(a2, 's4@lse.ac.uk'); await a2.goto(BASE + '/claim/' + tok1); await a2.getByTestId('claim-admin').waitFor({ timeout: 20000 }); await a2.waitForTimeout(800);
check(sql(`select used_at is null from society_claim_links where token_hash=${hash(tok1)}`) === 't', 'an admin opening the link does not use it');
check((await a2.getByTestId('claim-anyway').count()) === 1, 'the admin can still choose to claim it');
check(sql(`select count(*) from society_admins where society_id='${soc}'`) === '0', 'still nobody manages the society');

// 3. Bea logs in from the link, comes back, claims it and lands on the Hub's setup.
await o.getByTestId('claim-login').click(); await o.waitForURL(/\/login/, { timeout: 15000 });
check(decodeURIComponent(o.url()).includes('/claim/' + tok1), 'the login page will come back to the link');
await fillCode(o, 's2@lse.ac.uk');
await o.waitForURL(new RegExp(`/hub/${soc}/setup`), { timeout: 30000 }); await o.getByTestId('hub-welcome').waitFor({ timeout: 20000 });
say('landed:', o.url().replace(BASE, ''), '|', await o.getByTestId('hub-welcome').innerText());
check((await o.getByTestId('hub-welcome').innerText()).includes('Claim Test Society is on Function.'), 'the Hub setup welcomes the society');
check((await o.getByTestId('hub-start').count()) === 1, 'Bea can start setting up now');
check(sql(`select count(*) from society_admins where society_id='${soc}' and user_id='${U2}'`) === '1', 'Bea is a manager');
check(sql(`select used_by='${U2}' and used_at is not null from society_claim_links where token_hash=${hash(tok1)}`) === 't', 'the link is marked used by Bea');
check(sql(`select is_admin from profiles where id='${U2}'`) === 'f', 'Bea is not a Function admin');
await o.waitForTimeout(1500);
say('claim calls after logging in from the link:', oRedeems.v);
check(oRedeems.v === 1, `logging in from the link claims it exactly once (got ${oRedeems.v})`);
check((await o.getByTestId('claim-page').count()) === 0, 'no claim page is left behind the Hub');
// Opening it again (e.g. refreshing) just goes back to the Hub's setup.
await o.goto(BASE + '/claim/' + tok1); await o.waitForURL(new RegExp(`/hub/${soc}/setup`), { timeout: 30000 }); await o.getByTestId('hub-welcome').waitFor({ timeout: 20000 });
check(sql(`select count(*) from society_admins where society_id='${soc}'`) === '1', 'still one manager after opening it again');

// 4. Cas opening the same link is told it has been used, and isn't a manager.
const c = await fresh(); await login(c, 's3@lse.ac.uk'); await c.goto(BASE + '/claim/' + tok1); await c.getByTestId('claim-status').waitFor({ timeout: 20000 });
check((await c.getByTestId('claim-status').innerText()).includes('This link has already been used'), 'used link message'); say('Cas sees:', await c.getByTestId('claim-status').innerText());
check(!(await c.getByTestId('claim-page').innerText()).includes('Bea'), 'it does not say who used it');
check(sql(`select count(*) from society_admins where society_id='${soc}' and user_id='${U3}'`) === '0', 'Cas is not a manager');
check((await c.getByTestId('claim-used-login').count()) === 0, 'logged in, a used link offers no log in button');

// 4b. Logged out, Bea reopens her used link on another device: she can log in from it and lands on her society's Hub.
const u = await fresh(); const uRedeems = countRedeems(u); await u.goto(BASE + '/claim/' + tok1); await u.getByTestId('claim-status').waitFor({ timeout: 20000 });
check((await u.getByTestId('claim-status').innerText()).includes('This link has already been used'), 'logged out: the used link says so');
check((await u.getByTestId('claim-used-login').count()) === 1, 'logged out: a used link offers to log in');
await u.getByTestId('claim-used-login').click(); await u.waitForURL(/\/login/, { timeout: 15000 });
check(decodeURIComponent(u.url()).includes('/claim/' + tok1), 'the login page will come back to the used link');
await fillCode(u, 's2@lse.ac.uk');
await u.waitForURL(new RegExp(`/hub/${soc}/setup`), { timeout: 30000 }); await u.getByTestId('hub-welcome').waitFor({ timeout: 20000 });
await u.waitForTimeout(1000);
check(uRedeems.v === 1, `the manager reopening the link claims it once (got ${uRedeems.v})`);
check((await u.getByTestId('claim-page').count()) === 0, 'no used-link page is left behind the Hub');
check(sql(`select count(*) from society_admins where society_id='${soc}'`) === '1', 'still one manager after Bea logs in from her used link');

// 5. An expired link, a cancelled link and a made-up link each say so.
await a.getByTestId('create-claim-link').click(); await a.waitForFunction((t) => { const el = document.querySelector('[data-testid="claim-link-url"]'); return el && !el.textContent.includes(t); }, tok1, { timeout: 15000 });
const tok2 = tokenOf((await a.getByTestId('claim-link-url').innerText()).trim()); check(!!tok2 && tok2 !== tok1, 'a second, different link');
sql(`update society_claim_links set expires_at = now() - interval '1 hour' where token_hash=${hash(tok2)}`);
const e = await fresh(); await e.goto(BASE + '/claim/' + tok2); await e.getByTestId('claim-status').waitFor({ timeout: 20000 });
check((await e.getByTestId('claim-status').innerText()).includes('This link has expired'), 'expired link message');
check((await e.getByTestId('claim-page').innerText()).includes('help@studentfunction.com'), 'the expired message gives the support email');
check((await e.getByTestId('claim-used-login').count()) === 0, 'an expired link offers no log in button');
await c.goto(BASE + '/claim/' + tok2); await c.getByTestId('claim-status').waitFor({ timeout: 20000 });
check((await c.getByTestId('claim-status').innerText()).includes('This link has expired'), 'expired link message when logged in');
check(sql(`select count(*) from society_admins where society_id='${soc}' and user_id='${U3}'`) === '0', 'Cas is still not a manager');

await a.getByTestId('create-claim-link').click(); await a.waitForFunction((t) => { const el = document.querySelector('[data-testid="claim-link-url"]'); return el && !el.textContent.includes(t); }, tok2, { timeout: 15000 });
const tokX = tokenOf((await a.getByTestId('claim-link-url').innerText()).trim());
await a.getByTestId('create-claim-link').click(); await a.waitForFunction((t) => { const el = document.querySelector('[data-testid="claim-link-url"]'); return el && !el.textContent.includes(t); }, tokX, { timeout: 15000 });
const tok3 = tokenOf((await a.getByTestId('claim-link-url').innerText()).trim());
// Cancelling the older link (made just before) keeps the new one on screen.
const linkX = sql(`select id from society_claim_links where token_hash=${hash(tokX)}`);
await a.getByTestId(`claim-link-${linkX}`).getByTestId('revoke-claim-link').click();
await a.getByTestId(`claim-link-${linkX}`).getByText('Cancelled').waitFor({ timeout: 15000 });
check((await a.getByTestId('claim-link-url').count()) === 1 && tokenOf((await a.getByTestId('claim-link-url').innerText()).trim()) === tok3, 'cancelling an older link keeps the new link on screen');
const link3 = sql(`select id from society_claim_links where token_hash=${hash(tok3)}`);
await a.getByTestId(`claim-link-${link3}`).getByTestId('revoke-claim-link').click();
await a.getByTestId(`claim-link-${link3}`).getByText('Cancelled').waitFor({ timeout: 15000 });
check((await a.getByTestId('claim-link-url').count()) === 0, 'the cancelled link is no longer offered for copying');
check(sql(`select revoked_at is not null from society_claim_links where id='${link3}'`) === 't', 'the link is cancelled in the database');
await e.goto(BASE + '/claim/' + tok3); await e.getByTestId('claim-status').waitFor({ timeout: 20000 });
check((await e.getByTestId('claim-status').innerText()).includes('This link has been cancelled'), 'cancelled link message');
await e.goto(BASE + '/claim/' + 'f'.repeat(64)); await e.getByTestId('claim-status').waitFor({ timeout: 20000 });
check((await e.getByTestId('claim-status').innerText()).includes("This link isn't valid"), 'unknown link message');
await e.goto(BASE + '/claim/not-a-link'); await e.getByTestId('claim-status').waitFor({ timeout: 20000 });
check((await e.getByTestId('claim-status').innerText()).includes("This link isn't valid"), 'malformed link message');

// 5b. Someone new signs up from a link: the details step, then back to claim it.
await a.getByTestId('create-claim-link').click(); await a.waitForFunction((t) => { const el = document.querySelector('[data-testid="claim-link-url"]'); return el && !el.textContent.includes(t); }, tok3, { timeout: 15000 });
const tok4 = tokenOf((await a.getByTestId('claim-link-url').innerText()).trim());
const newEmail = `new${Date.now() % 100000}@lse.ac.uk`;
const n = await fresh(); await n.goto(BASE + '/claim/' + tok4); await n.getByTestId('claim-login').click(); await n.waitForURL(/\/login/, { timeout: 15000 });
await fillCode(n, newEmail); await n.waitForURL(/\/welcome/, { timeout: 20000 });
await n.getByTestId('full-name').fill('Nia New'); await n.getByTestId('graduation-year').click(); await n.getByTestId('graduation-year-2027').click(); await n.getByTestId('save-details').click();
await n.waitForURL(new RegExp(`/hub/${soc}/setup`), { timeout: 30000 }); await n.getByTestId('hub-welcome').waitFor({ timeout: 20000 });
const newId = sql(`select id from profiles where email='${newEmail}'`);
check(sql(`select count(*) from society_admins where society_id='${soc}' and user_id='${newId}'`) === '1', 'a new sign-up from the link is a manager');
check(sql(`select used_by from society_claim_links where token_hash=${hash(tok4)}`) === newId, 'the link records the new sign-up');
say('new sign-up claimed:', newEmail.replace(/\d+/, 'N'));

// 6. Sky's list shows who used the first link, and the society as claimed.
await a.goto(BASE + '/admin/societies'); await searchFor(a, 'Claim Test', soc);
await a.getByTestId(`admin-society-${soc}`).getByText('Claimed', { exact: true }).waitFor({ timeout: 15000 });
await a.getByTestId(`admin-society-${soc}`).click(); await a.getByTestId('claim-links').waitFor({ timeout: 15000 });
const link1 = sql(`select id from society_claim_links where token_hash=${hash(tok1)}`); const link2 = sql(`select id from society_claim_links where token_hash=${hash(tok2)}`);
const row1 = await a.getByTestId(`claim-link-${link1}`).innerText(); say('first link row:', row1.replace(/\n/g, ' | '));
check(row1.includes('Used by Bea Brown on') && row1.includes('by Sky Four'), 'the admin sees who used the link and who made it');
check((await a.getByTestId(`claim-link-${link2}`).innerText()).includes('Expired'), 'the expired link is marked');
check((await a.getByTestId(`claim-link-${link1}`).getByTestId('revoke-claim-link').count()) === 0, 'a used link cannot be cancelled');

// 7. A student can't open the admin page; the LSE Poker Society is unchanged.
await c.goto(BASE + '/admin/societies'); await c.getByText('This page is for the Function team.').waitFor({ timeout: 20000 });
check(sql(`select string_agg(user_id::text, ',' order by user_id) from society_admins where society_id='${poker}'`) === pokerManagers, 'LSE Poker Society managers unchanged');
await searchFor(a, 'LSE Poker', poker); await a.getByTestId(`admin-society-${poker}`).getByText('Claimed', { exact: true }).waitFor({ timeout: 15000 });

console.log('errors:', errs); await b.close();
