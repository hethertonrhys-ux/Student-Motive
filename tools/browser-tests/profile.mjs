// Expo web build, phase 7: your profile editor (name and course, show
// societies, prompts, Two truths and a lie, the profile picture and My 5
// with the cropper, the Archive) and someone's profile (prompts, the game,
// photos, friend requests, block and report).
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const b = await chromium.launch();
async function fresh() { const c = await b.newContext(devices['iPhone 13']); await c.addInitScript(() => { window.__fnTestFiles = true; }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page@' + p.url() + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; }
async function login(p, email) {
  await p.goto(BASE + '/login'); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click();
  await p.waitForURL(/\/(welcome|map)/, { timeout: 20000 }); if (p.url().includes('/welcome')) { await p.getByTestId('full-name').fill('Test Person'); await p.getByTestId('graduation-year').click(); await p.getByTestId('graduation-year-2027').click(); await p.getByTestId('save-details').click(); await p.waitForURL(/\/(map|societies|social|chats|me|e\/|s\/)/, { timeout: 20000 }); } if (p.url().includes('/welcome')) { await p.getByTestId('skip').click(); await p.waitForURL('**/map'); }
}
// Pick files through the app's hidden file chooser, then crop each one.
async function addFiles(p, trigger, files) {
  await trigger(); const input = p.locator('[data-testid="file-input"]'); await input.waitFor({ state: 'attached', timeout: 10000 }); await input.setInputFiles(files);
  for (let i = 0; i < files.length; i++) { await p.getByTestId('crop-done').waitFor({ timeout: 15000 }); await p.getByTestId('crop-done').click(); await p.waitForTimeout(300); }
}
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002';
sql(`delete from profile_photos where user_id in ('${U1}','${U2}'); delete from profile_prompts where user_id in ('${U1}','${U2}'); delete from two_truths_guesses; delete from two_truths where user_id in ('${U1}','${U2}'); delete from friendships where requester_id in ('${U1}','${U2}') or addressee_id in ('${U1}','${U2}'); delete from user_blocks; delete from reports; delete from profile_settings where user_id='${U1}'; update profiles set display_name='Sam Student', course=null, avatar_url=null where id='${U1}'; update profiles set display_name='Bea Brown' where id='${U2}'`);
const IMG1 = S + '/img1.jpg', IMG2 = S + '/img2.jpg';

// 1. Sam edits: name and course, the societies toggle, a prompt answer, and Two truths.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/account'); await p.getByTestId('full-name').waitFor({ timeout: 20000 });
await p.getByTestId('course').fill('Economics, 2nd year'); await p.getByTestId('save-details').click(); await p.getByText('Saved ✓').first().waitFor({ timeout: 15000 }); say('course saved:', sql(`select course from profiles where id='${U1}'`));
await p.getByTestId('show-societies').click(); await p.waitForTimeout(800); say('show societies now:', sql(`select show_societies from profile_settings where user_id='${U1}'`)); check(sql(`select show_societies from profile_settings where user_id='${U1}'`) === 'f', 'societies toggle');
const firstPick = p.locator('[data-testid^="pick-"]').filter({ hasNot: p.getByText('Two truths') }).first(); const pickId = (await firstPick.getAttribute('data-testid')).slice(5);
await firstPick.click(); await p.getByTestId('prompt-answer').fill('Any reality TV show. I have opinions.'); await p.getByTestId('save-answer').click(); await p.getByTestId(`answer-${pickId}`).waitFor({ timeout: 15000 });
say('prompt answered:', pickId, '| count:', await p.getByTestId('prompt-count').innerText()); check((await p.getByTestId('prompt-count').innerText()) === '1/3', 'prompt count');
await p.getByTestId('pick-two-truths').click(); await p.getByTestId('truth-0').fill('I have met the King'); await p.getByTestId('truth-1').fill('I can juggle'); await p.getByTestId('truth-2').fill('I was born in Leeds'); await p.getByTestId('lie-1').click();
await p.getByTestId('save-two-truths').click(); await p.getByTestId('answer-two-truths').waitFor({ timeout: 15000 }); say('two truths saved:', sql(`select lie from two_truths where user_id='${U1}'`)); check(sql(`select lie from two_truths where user_id='${U1}'`) === '2', 'two truths lie');
// 2. Photos: the profile picture through the cropper, then two photos for My 5; reorder; remove one to the Archive; restore and delete there.
await addFiles(p, () => p.getByTestId('change-photo').click(), [IMG1]); await p.waitForTimeout(1500); say('avatar set:', sql(`select avatar_url is not null from profiles where id='${U1}'`)); check(sql(`select avatar_url is not null from profiles where id='${U1}'`) === 't', 'avatar');
await addFiles(p, () => p.getByTestId('add-photos').click(), [IMG1, IMG2]); await p.getByText('2/5').waitFor({ timeout: 20000 }); say('my 5:', sql(`select count(*) from profile_photos where user_id='${U1}' and archived_at is null`));
const order = () => sql(`select string_agg(substr(id::text,1,4), ',' order by position nulls first, activated_at desc) from profile_photos where user_id='${U1}' and archived_at is null`);
const before = order(); await p.getByTestId('move-later').first().click(); await p.waitForTimeout(1200); say('order before/after:', before, '->', order()); check(before !== order(), 'reorder');
await p.screenshot({ path: S + '/expo-account.png', fullPage: true });
await p.getByTestId('archive-photo').first().click(); await p.getByText('1/5').waitFor({ timeout: 15000 }); await p.getByTestId('archive-link').click(); await p.waitForURL('**/account/archive');
await p.locator('[data-testid^="archived-"]').first().waitFor({ timeout: 15000 }); await p.getByTestId('restore-photo').click(); await p.getByText('Nothing in your Archive yet.').waitFor({ timeout: 15000 }); say('restored; current:', sql(`select count(*) from profile_photos where user_id='${U1}' and archived_at is null`));
await p.goto(BASE + '/account'); await p.getByText('2/5').waitFor({ timeout: 20000 }); await p.getByTestId('archive-photo').first().click(); await p.getByText('1/5').waitFor({ timeout: 15000 });
await p.goto(BASE + '/account/archive'); await p.getByTestId('delete-photo').waitFor({ timeout: 15000 }); await p.getByTestId('delete-photo').click(); await p.getByText('Nothing in your Archive yet.').waitFor({ timeout: 15000 }); say('deleted; rows:', sql(`select count(*) from profile_photos where user_id='${U1}'`)); check(sql(`select count(*) from profile_photos where user_id='${U1}'`) === '1', 'delete');
// 3. Bea looks at Sam: prompts, the game (guess the lie), the photo, and sends a friend request. Sam accepts from Bea's page.
const q = await fresh(); await login(q, 's2@lse.ac.uk'); await q.goto(BASE + '/u/' + U1); await q.getByTestId('person-card').waitFor({ timeout: 20000 });
say('Bea sees:', (await q.getByTestId('person-card').innerText()).replace(/\n/g, ' | ').slice(0, 200)); check((await q.getByTestId(`prompt-${pickId}`).count()) === 1 && (await q.getByTestId('gallery').count()) === 1, 'profile content');
await q.getByTestId('guess-2').click(); await q.getByTestId('two-truths-result').waitFor({ timeout: 15000 }); say('guess:', await q.getByTestId('two-truths-result').innerText()); check(/You got it/.test(await q.getByTestId('two-truths-result').innerText()), 'guess result');
await q.getByTestId('add-friend').click(); await q.getByTestId('requested').waitFor({ timeout: 15000 }); say('friend request:', sql(`select status from friendships where requester_id='${U2}' and addressee_id='${U1}'`));
await q.screenshot({ path: S + '/expo-person.png', fullPage: true });
await p.goto(BASE + '/u/' + U2); await p.getByTestId('accept-friend').waitFor({ timeout: 20000 }); await p.getByTestId('accept-friend').click(); await p.getByTestId('friends').waitFor({ timeout: 15000 }); say('friends:', sql(`select status from friendships where requester_id='${U2}' and addressee_id='${U1}'`));
check(sql(`select status from friendships where requester_id='${U2}' and addressee_id='${U1}'`) === 'accepted', 'accept');
// 4. Bea reports Sam, then blocks him; Sam's page then shows nothing of his.
await q.reload(); await q.getByTestId('block-or-report').waitFor({ timeout: 20000 }); await q.getByTestId('block-or-report').click(); await q.getByTestId('report-user').click(); await q.getByText('Spam or fake account').click(); await q.getByTestId('send-user-report').click();
await q.getByText('Thanks. The Function team will look at this.').waitFor({ timeout: 15000 }); say('reported:', sql(`select count(*) from reports where reported_user_id='${U1}'`));
await q.reload(); await q.getByTestId('block-or-report').waitFor({ timeout: 20000 }); await q.getByTestId('block-or-report').click(); await q.getByTestId('block').click(); await q.getByText("You've blocked this person").waitFor({ timeout: 15000 });
say('blocked:', sql(`select count(*) from user_blocks where blocker_id='${U2}'`), '| gallery shown:', await q.getByTestId('gallery').count()); check((await q.getByTestId('gallery').count()) === 0, 'blocked hides photos');
console.log('errors:', errs); await b.close();
