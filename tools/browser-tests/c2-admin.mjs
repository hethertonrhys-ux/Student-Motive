// Communities part 2: the admin panel's Communities page. The Function team
// sees every community (UCL Abacus is seeded with no admins), makes a new
// one (name, web address from the name, a linked society, a bio; bad and
// taken addresses refused), and names a community's first admin by finding
// the person; the page and Manage open from it. Everyone else is kept out.
import { BASE, U1, U4, check, fresh, loginCode, path, text, see, say, sql, finish } from './c2-common.mjs';
const S = process.argv[2];
sql(`update profiles set is_admin = true where id = '${U4}'`);
const abacus = sql(`select id from communities where slug = 'ucl-abacus'`);
const poker = sql(`select id from societies where slug = 'lse-poker-society'`);
const pokerBefore = sql(`select name || '|' || coalesce(description, '') || '|' || (select count(*) from society_admins where society_id = '${poker}') from societies where id = '${poker}'`);

// 1. Someone not on the Function team.
const sam = await fresh(); await loginCode(sam, 's1@lse.ac.uk');
await sam.goto(BASE + '/admin/communities'); await sam.getByText('This page is for the Function team.').waitFor({ timeout: 20000 });
check(await sam.getByTestId('admin-communities').count() === 0, 'non-admins see no communities');

// 2. Sky (the Function team): the list, from the Me tab.
const sky = await fresh(); await loginCode(sky, 's4@lse.ac.uk');
await sky.goto(BASE + '/me'); await sky.getByTestId('admin-panel').click(); await sky.waitForURL('**/admin', { timeout: 15000 });
await sky.getByTestId('admin-tab-communities').click(); await sky.waitForURL('**/admin/communities', { timeout: 15000 });
await see(sky, 'admin-communities').waitFor({ timeout: 20000 });
say('UCL Abacus row:', await text(sky, 'admin-community-ucl-abacus'));
check(/UCL Abacus/.test(await text(sky, 'admin-community-ucl-abacus')) && /0 members/.test(await text(sky, 'admin-community-ucl-abacus')) && /No admins yet/.test(await text(sky, 'admin-community-ucl-abacus')), 'UCL Abacus is listed, with no admins yet');
await sky.screenshot({ path: S + '/c2-shots/admin-communities-phone.png', fullPage: true });

// 3. Make a community: the address comes from the name; bad and taken ones are refused.
await see(sky, 'new-community-name').fill('KCL Chess Club');
check(await see(sky, 'new-community-slug').inputValue() === 'kcl-chess-club', 'the web address is suggested from the name');
await see(sky, 'new-community-slug').fill('ab'); await see(sky, 'new-community-create').click();
check(/3 to 60 lowercase letters/.test(await text(sky, 'new-community-error')), 'a bad web address is refused');
await see(sky, 'new-community-slug').fill('ucl-abacus'); await see(sky, 'new-community-create').click();
await see(sky, 'new-community-error').filter({ hasText: 'taken' }).waitFor({ timeout: 15000 });
say('taken:', await text(sky, 'new-community-error')); check(await text(sky, 'new-community-error') === 'That web address is taken.', 'a taken web address is refused');
await see(sky, 'new-community-slug').fill('kcl-chess-club');
await see(sky, 'new-community-society-search').fill('Poker'); await see(sky, `new-community-society-${poker}`).waitFor({ timeout: 15000 });
await see(sky, `new-community-society-${poker}`).click(); check(/LSE Poker Society/.test(await text(sky, 'new-community-society')), 'a society is linked');
await see(sky, 'new-community-bio').fill('Chess for everyone at KCL.');
await see(sky, 'new-community-create').click(); await see(sky, 'new-community-done').waitFor({ timeout: 15000 });
const made = sql(`select name || '|' || slug || '|' || coalesce(society_id::text, '-') || '|' || bio from communities where slug = 'kcl-chess-club'`);
say('made:', made); check(made === `KCL Chess Club|kcl-chess-club|${poker}|Chess for everyone at KCL.`, 'the community is made with its name, address, society and bio');
check(sql(`select count(*) from community_groups g join threads t on t.community_group_id = g.id where g.community_id = (select id from communities where slug = 'kcl-chess-club') and g.kind = 'main'`) === '1', 'with its main chat');
await see(sky, 'admin-community-kcl-chess-club').waitFor({ timeout: 15000 });
check(sql(`select name || '|' || coalesce(description, '') || '|' || (select count(*) from society_admins where society_id = '${poker}') from societies where id = '${poker}'`) === pokerBefore, 'linking it changes nothing about the LSE Poker Society');

// 4. Name UCL Abacus's first admin.
if (!(await see(sky, 'admin-community-detail').count()) || !/ucl-abacus/.test(await text(sky, 'admin-community-detail'))) {
  // The new community's details are open: open UCL Abacus instead.
  await see(sky, 'admin-community-ucl-abacus').click();
}
await see(sky, 'community-admin-search').waitFor({ timeout: 15000 });
await see(sky, 'community-admin-search').fill('Sam'); await see(sky, `community-admin-pick-${U1}`).waitFor({ timeout: 15000 });
await see(sky, `community-admin-pick-${U1}`).getByTestId('make-community-admin').click(); await see(sky, 'community-admin-done').waitFor({ timeout: 15000 });
say('done:', await text(sky, 'community-admin-done'));
check(sql(`select status || '|' || role from community_members where community_id = '${abacus}' and user_id = '${U1}'`) === 'active|admin', 'Sam is UCL Abacus\'s first admin');
await see(sky, `community-admin-${U1}`).waitFor({ timeout: 15000 });
check(/1 admin/.test(await text(sky, 'admin-community-ucl-abacus')) && /1 member/.test(await text(sky, 'admin-community-ucl-abacus')), 'the list now says 1 member, 1 admin');
// Its page and Manage open from here.
await see(sky, 'admin-community-manage').click(); await sky.waitForURL('**/c/ucl-abacus/manage', { timeout: 15000 });
await see(sky, 'manage-heading').waitFor({ timeout: 20000 });
// 5. Sam sees UCL Abacus in the Societies tab and can manage it.
await sam.goto(BASE + '/societies'); await see(sam, 'your-communities').waitFor({ timeout: 20000 });
check(/UCL Abacus/.test(await text(sam, 'your-communities')) && /Admin/.test(await text(sam, 'your-communities')), 'Sam sees UCL Abacus (as an admin) in Your communities');
await see(sam, 'community-ucl-abacus').click(); await sam.waitForURL('**/c/ucl-abacus', { timeout: 15000 }); await see(sam, 'community-tab-manage').waitFor({ timeout: 20000 });
await finish();
