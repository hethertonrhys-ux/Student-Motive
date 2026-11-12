// Expo web build, phase 6: Social. Host an event from the form (search a
// place, pick a date), Discover with search and filters, I'm in / Leave,
// a private event's request → approve, the host's guest list and remove,
// edit, who's going, report, cancel, and the Hosting badge.
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
sql(`delete from social_events where title like 'Soc %'`); sql(`update profiles set display_name='Sam Student' where id='${U1}'; update profiles set display_name='Bea Brown' where id='${U2}'`);
const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);

// 1. Sam hosts a private five-a-side from the form: LSE place search fills the place, the date picker, spaces, cost.
const p = await fresh(); await login(p, 's1@lse.ac.uk'); await p.goto(BASE + '/social'); await p.getByTestId('host').click(); await p.waitForURL('**/social/new');
await p.getByTestId('title').waitFor({ timeout: 15000 }); await p.getByTestId('title').fill('Soc Five-a-side'); await p.getByTestId('category-sport').click();
await p.getByTestId('description').fill('Bring boots.'); await p.getByTestId('date').fill(tomorrow); await p.getByTestId('start').fill('18:30'); await p.getByTestId('finish').fill('20:00');
await p.getByTestId('place-search').fill('marshall'); await p.getByTestId('place-0').waitFor({ timeout: 10000 }); say('place result:', (await p.getByTestId('place-0').innerText()).replace(/\n/g, ' | ')); await p.getByTestId('place-0').click();
say('area auto-filled:', await p.getByTestId('area').inputValue()); check((await p.getByTestId('area').inputValue()).length > 0, 'area from place');
await p.getByTestId('spaces-input').fill('3'); await p.getByTestId('cost-paid').click(); await p.getByTestId('cost-amount').fill('4.50'); await p.getByTestId('privacy-private').click();
await p.getByTestId('submit').click(); await p.waitForURL(/\/social\/[0-9a-f-]{36}/, { timeout: 20000 }); await p.getByTestId('created').waitFor({ timeout: 15000 });
const ev = sql(`select id from social_events where title='Soc Five-a-side'`); say('created:', ev, '| rough vs exact:', sql(`select e.lat||','||e.lng||' vs '||a.lat||','||a.lng from social_events e join social_event_addresses a on a.event_id=e.id where e.id='${ev}'`));
check(sql(`select is_private and cost_pence=450 and spaces=3 from social_events where id='${ev}'`) === 't', 'event fields');
say('host sees:', (await p.getByTestId('spaces').innerText()), '|', await p.getByText("You're hosting").count());
await p.screenshot({ path: S + '/expo-social-event.png', fullPage: true });
// 2. Bea: Discover lists it with the host; search narrows; "Spaces available" keeps it; a private event asks to join (skip the prompt nudge).
sql(`delete from profile_prompts where user_id='${U2}'`);
const q = await fresh(); await login(q, 's2@lse.ac.uk'); await q.goto(BASE + '/social'); await q.getByTestId(`social-${ev}`).waitFor({ timeout: 20000 });
say('discover card:', (await q.getByTestId(`social-${ev}`).innerText()).replace(/\n/g, ' | ')); check(/Sam Student/.test(await q.getByTestId(`social-${ev}`).innerText()) && /Private/.test(await q.getByTestId(`social-${ev}`).innerText()), 'discover card');
await q.getByTestId('social-search').fill('zzz-nothing'); await q.getByText('Nothing matches those filters').waitFor({ timeout: 5000 }); await q.getByTestId('social-search').fill('five'); await q.getByTestId(`social-${ev}`).waitFor({ timeout: 5000 });
await q.getByTestId('menu-category').click(); await q.getByTestId('cat-study').click(); await q.getByText('Nothing matches those filters').waitFor({ timeout: 5000 }); await q.getByTestId('cat-sport').click(); await q.getByTestId(`social-${ev}`).waitFor({ timeout: 5000 }); say('filters: search and category narrow the list');
await q.getByTestId('filters-done').click(); await q.getByTestId('clear-filters').click(); await q.getByTestId(`social-${ev}`).click(); await q.waitForURL('**/social/' + ev);
await q.getByText('The exact spot is shared with people going.').waitFor({ timeout: 15000 }); await q.getByTestId('join-social').click(); await q.getByTestId('skip-and-request').waitFor({ timeout: 5000 }); await q.getByTestId('skip-and-request').click();
await q.getByTestId('pending-panel').waitFor({ timeout: 15000 }); say('Bea requested; db:', sql(`select status from social_event_members where event_id='${ev}' and user_id='${U2}'`));
// 3. Sam: the Hosting badge shows 1; approve Bea; she then sees the exact address and the guest list; the group chat button appears.
await p.goto(BASE + '/social'); await p.getByTestId('hosting-badge').waitFor({ timeout: 15000 }); say('hosting badge:', await p.getByTestId('hosting-badge').innerText());
await p.getByTestId('tab-hosting').click(); await p.getByTestId(`social-${ev}`).waitFor({ timeout: 15000 }); check(/1 request/.test(await p.getByTestId(`social-${ev}`).innerText()), 'request pill');
await p.goto(BASE + '/social/' + ev); await p.getByTestId(`approve-${U2}`).click(); await p.getByTestId(`remove-${U2}`).waitFor({ timeout: 15000 }); say('approved; going:', sql(`select going_count from social_events where id='${ev}'`));
await q.reload(); await q.getByTestId('going-panel').waitFor({ timeout: 20000 }); say('Bea sees exact address:', await q.getByTestId('exact-address').count(), '| group chat:', await q.getByTestId('group-chat').count(), '| attendees:', (await q.getByTestId('attendees').innerText()).replace(/\n/g, ' '));
check((await q.getByTestId('exact-address').count()) === 1 && /2 going, including the host/.test(await q.getByTestId('attendees').innerText()), 'guest view');
await q.screenshot({ path: S + '/expo-social-going.png', fullPage: true });
// 4. Going tab lists it for Bea; report it; then leave.
await q.goto(BASE + '/social'); await q.getByTestId('tab-going').click(); await q.getByTestId(`social-${ev}`).waitFor({ timeout: 15000 }); check(/Going ✓/.test(await q.getByTestId(`social-${ev}`).innerText()), 'going tab');
await q.goto(BASE + '/social/' + ev); await q.getByTestId('report').click(); await q.getByTestId('report-reason').fill('Test report'); await q.getByTestId('send-report').click(); await q.getByText('Thanks. The Function team will take a look.').waitFor({ timeout: 15000 }); say('reported:', sql(`select count(*) from social_reports where event_id='${ev}'`));
await q.getByTestId('leave-social').click(); await q.getByTestId('join-social').waitFor({ timeout: 15000 }); say('left; going:', sql(`select going_count from social_events where id='${ev}'`));
// 5. Sam edits: title and spaces; then cancels. Discover no longer shows it.
await p.goto(BASE + '/social/' + ev); await p.getByTestId('edit-event').click(); await p.waitForURL('**/social/' + ev + '/edit'); await p.getByTestId('title').waitFor({ timeout: 15000 });
say('edit form pre-filled date:', await p.getByTestId('date').inputValue(), await p.getByTestId('start').inputValue()); await p.getByTestId('title').fill('Soc Five-a-side (edited)'); await p.getByTestId('spaces-input').fill('4'); await p.getByTestId('submit').click();
await p.waitForURL('**/social/' + ev, { timeout: 20000 }); await p.getByText('Soc Five-a-side (edited)').last().waitFor({ timeout: 15000 }); say('edited:', sql(`select title||' / '||spaces from social_events where id='${ev}'`));
await p.getByTestId('cancel-event').last().click(); await p.getByText('This event has been cancelled.').last().waitFor({ timeout: 15000 }); say('cancelled:', sql(`select is_cancelled from social_events where id='${ev}'`));
await q.goto(BASE + '/social'); await q.getByTestId('social-list').waitFor(); await q.waitForTimeout(1500); say('discover after cancel shows it:', await q.getByTestId(`social-${ev}`).count()); check((await q.getByTestId(`social-${ev}`).count()) === 0, 'cancelled hidden');
console.log('errors:', errs); await b.close();
