// Communities part 2: Manage. Committee approve requests as non-members
// only (no "as member" button) and decline; admins approve as a member or
// not, confirm a paying member later, change roles and remove people;
// committee can remove regular people only; the last admin can't be
// demoted, removed or leave (the database's message is shown); the invite
// link and QR code are the community's join link; the bio, picture and
// banner are uploaded and saved; admins rename; regular people are told
// only admins and committee can manage it.
import { createRequire } from 'module';
import { BASE, U1, U2, U3, U4, check, fresh, loginCode, path, text, see, say, sql, setUpAbacus, addMember, person, finish } from './c2-common.mjs';
const S = process.argv[2];
const { cid } = setUpAbacus();
addMember(cid, U2, 'Bea', { role: 'committee' });
addMember(cid, U3, 'Cas');
const DAN = person('d0000000-0000-4000-8000-00000000000d', 'dan@lse.ac.uk', 'Dan Dawes');
const ELI = person('d0000000-0000-4000-8000-00000000000e', 'eli@lse.ac.uk', 'Eli Evans');
const FAY = person('d0000000-0000-4000-8000-00000000000f', 'fay@lse.ac.uk', 'Fay Fox');
const GIL = person('d0000000-0000-4000-8000-000000000010', 'gil@lse.ac.uk', 'Gil Grant');
addMember(cid, DAN, 'Danny', { status: 'pending', claimed: true, ref: U1 });
addMember(cid, ELI, 'Eli', { status: 'pending' });
addMember(cid, FAY, 'Fay', { status: 'pending', claimed: true });
addMember(cid, GIL, 'Gil', { status: 'pending' });
const row = (u) => sql(`select status || '|' || role || '|' || membership || '|' || membership_claimed from community_members where community_id = '${cid}' and user_id = '${u}'`);
const req = (p, u) => see(p, `request-${u}`);
const member = (p, u) => see(p, `member-${u}`);

// 1. Committee (Bea): approve as a non-member only, decline, remove regular people only.
const bea = await fresh(); await loginCode(bea, 's2@lse.ac.uk');
await bea.goto(BASE + '/c/ucl-abacus'); await bea.getByTestId('community-tab-manage').waitFor({ timeout: 20000 });
say('Manage tab:', await text(bea, 'community-tab-manage'));
check(/Manage/.test(await text(bea, 'community-tab-manage')) && (await text(bea, 'manage-requests-badge')) === '4', 'the Manage tab shows the 4 requests waiting');
await bea.getByTestId('community-tab-manage').click(); await bea.waitForURL('**/c/ucl-abacus/manage', { timeout: 15000 });
await req(bea, DAN).waitFor({ timeout: 20000 });
say('Dan\'s request (committee view):', await text(bea, `request-${DAN}`));
check(/Danny/.test(await text(bea, `request-${DAN}`)) && /Says they're a paying member/.test(await text(bea, `request-${DAN}`)) && /shared by Sam/.test(await text(bea, `request-${DAN}`)), 'a request shows the nickname, the claim and who shared the link');
check(!/@/.test(await text(bea, 'manage-requests')), 'no emails in the requests');
check(await see(bea, 'approve-as-member').count() === 0 && await see(bea, 'approve-as-non-member').count() === 0, 'committee have no "Approve as member" button');
check(await see(bea, 'approve').count() === 4, 'committee have an Approve button on each request');
check(/Only admins can confirm paying members/.test(await text(bea, 'manage-requests')), 'committee are told only admins confirm paying members');
await req(bea, DAN).getByTestId('approve').click(); await req(bea, DAN).waitFor({ state: 'detached', timeout: 15000 });
say('Dan after committee approval:', row(DAN)); check(row(DAN) === 'active|regular|non_member|true', 'committee approve Dan as a non-member; his claim stays');
await req(bea, GIL).getByTestId('decline').click(); await req(bea, GIL).waitFor({ state: 'detached', timeout: 15000 });
check(row(GIL).startsWith('declined'), 'committee decline Gil');
await member(bea, U3).waitFor({ timeout: 15000 });
check(await member(bea, U1).getByTestId('member-open').count() === 0, 'committee can do nothing to an admin');
check(await member(bea, U2).getByTestId('member-open').count() === 0, 'or to themselves');
await member(bea, U3).getByTestId('member-open').click();
check(await member(bea, U3).getByTestId('remove-member').count() === 1 && await member(bea, U3).getByTestId('role-admin').count() === 0 && await member(bea, U3).getByTestId('confirm-membership').count() === 0, 'committee can remove a regular person, but not change roles or membership');
check(await see(bea, 'community-name-input').count() === 0 && await see(bea, 'community-bio-input').count() === 1, 'committee edit the bio but can\'t rename');
check(await member(bea, DAN).getByText("Says they're a paying member").count() === 0, 'committee don\'t see unconfirmed claims in the member list');
await see(bea, 'community-bio-input').fill('Maths, games and friends at UCL.'); await see(bea, 'community-profile-save').click();
await see(bea, 'community-profile-saved').waitFor({ timeout: 15000 });
check(sql(`select bio from communities where id = '${cid}'`) === 'Maths, games and friends at UCL.', 'committee save the bio');

// 2. Admin (Sam): approve as a member and as a non-member, confirm a claim, set a role, remove someone.
const sam = await fresh(); await loginCode(sam, 's1@lse.ac.uk');
await sam.goto(BASE + '/c/ucl-abacus/manage'); await req(sam, FAY).waitFor({ timeout: 20000 });
check(await req(sam, FAY).getByTestId('approve-as-member').count() === 1 && await req(sam, FAY).getByTestId('approve-as-non-member').count() === 1, 'admins see both approve buttons');
await req(sam, FAY).getByTestId('approve-as-member').click(); await req(sam, FAY).waitFor({ state: 'detached', timeout: 15000 });
say('Fay:', row(FAY)); check(row(FAY) === 'active|regular|member|true', 'the admin approves Fay as a paying member');
check(sql(`select membership_confirmed_by from community_members where community_id = '${cid}' and user_id = '${FAY}'`) === U1, 'confirmed by Sam');
await req(sam, ELI).getByTestId('approve-as-non-member').click(); await req(sam, ELI).waitFor({ state: 'detached', timeout: 15000 });
check(row(ELI) === 'active|regular|non_member|false', 'the admin approves Eli as a non-member');
await see(sam, 'requests-empty').waitFor({ timeout: 15000 });
// Dan's claim is shown to the admin, who confirms it.
await member(sam, DAN).waitFor({ timeout: 15000 });
say('Dan in the admin\'s list:', await text(sam, `member-${DAN}`));
check(/Says they're a paying member/.test(await text(sam, `member-${DAN}`)), 'the admin sees Dan\'s claim in the member list');
await member(sam, DAN).getByTestId('member-open').click(); await member(sam, DAN).getByTestId('confirm-membership').click();
await member(sam, DAN).getByTestId('unconfirm-membership').waitFor({ timeout: 15000 });
check(row(DAN) === 'active|regular|member|true', 'the admin confirms Dan as a paying member');
check(/Member/.test(await text(sam, `member-${DAN}`)) && !/Says they're/.test(await text(sam, `member-${DAN}`)), 'Dan now has the Member tag, and no claim waiting');
// Eli becomes committee.
await member(sam, ELI).getByTestId('member-open').click(); await member(sam, ELI).getByTestId('role-committee').click();
await sam.waitForFunction((id) => /Committee/.test(document.querySelector(`[data-testid="member-${id}"]`)?.innerText ?? ''), ELI, { timeout: 15000 });
check(row(ELI) === 'active|committee|non_member|false', 'the admin makes Eli committee');
// Fay is removed (after the "are you sure?").
await member(sam, FAY).getByTestId('member-open').click(); await member(sam, FAY).getByTestId('remove-member').click();
await member(sam, FAY).waitFor({ state: 'detached', timeout: 15000 });
check(row(FAY).startsWith('removed'), 'the admin removes Fay');
const counts = await text(sam, 'member-counts'); say('counts:', counts);
check(counts === '5 members · 1 paying member · 2 committee · 1 admin', 'the counts: members, paying members, committee, admins');
await see(sam, 'member-search').fill('ca'); await sam.waitForTimeout(300);
check(await member(sam, U3).count() === 1 && await member(sam, U1).count() === 0, 'searching by nickname');
await see(sam, 'member-search').fill('');
// The invite link and its QR code.
const link = await text(sam, 'invite-link'); say('invite link:', link);
check(link === 'https://studentfunction.com/c/ucl-abacus/join', 'the invite link is https://studentfunction.com/c/ucl-abacus/join');
const qrcode = createRequire(import.meta.url)('/home/user/student-motive/node_modules/qrcode-generator');
const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
let runs = 0; for (let r = 0; r < qr.getModuleCount(); r++) { let c = 0; while (c < qr.getModuleCount()) { if (!qr.isDark(r, c)) { c++; continue; } while (c < qr.getModuleCount() && qr.isDark(r, c)) c++; runs++; } }
const drawn = await see(sam, 'invite-qr').evaluate((el) => el.children.length);
say('QR blocks drawn:', drawn, 'expected for the link:', runs); check(drawn === runs, 'the QR code is the join link');
await see(sam, 'qr-full-screen').click(); await sam.getByTestId('qr-full').waitFor({ timeout: 10000 });
await sam.screenshot({ path: S + '/c2-shots/manage-qr-full-screen-phone.png' });
await sam.getByTestId('qr-full-close').click(); await sam.getByTestId('qr-full').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
const [download] = await Promise.all([sam.waitForEvent('download', { timeout: 15000 }), see(sam, 'qr-download').click()]);
say('QR download:', download.suggestedFilename()); check(download.suggestedFilename() === 'ucl-abacus-join-qr.png', 'Download QR gives a PNG');
// The picture and the banner. (This test's storage is http://localhost; the real one is https, which the database insists on.)
sql(`create or replace function public.community_image_url(url text) returns text language plpgsql immutable set search_path = '' as \\$f\\$ begin return nullif(btrim(coalesce(url, '')), ''); end \\$f\\$`);
const pick = async (id) => { await see(sam, id).click(); const input = sam.locator('[data-testid="file-input"]'); await input.waitFor({ state: 'attached', timeout: 10000 }); await input.setInputFiles([S + '/img1.jpg']); await sam.getByTestId('crop-done').waitFor({ timeout: 15000 }); await sam.getByTestId('crop-done').click(); };
await pick('community-logo-pick'); await pick('community-banner-pick');
await see(sam, 'community-profile-save').click(); await see(sam, 'community-profile-saved').waitFor({ timeout: 20000 });
const images = sql(`select coalesce(image_url, '-') || ' ' || coalesce(banner_url, '-') from communities where id = '${cid}'`); say('images:', images);
check(images.split(' ').every((u) => u.includes(`/storage/v1/object/public/images/communities/${cid}/`)), 'the picture and banner are uploaded to images/communities/<id>/ and saved');
check(sql(`select bio from communities where id = '${cid}'`) === 'Maths, games and friends at UCL.', 'saving the images keeps the bio');
// Renaming (admins only).
await see(sam, 'community-name-input').fill('UCL Abacus Club'); await see(sam, 'community-rename').click(); await see(sam, 'community-name-saved').waitFor({ timeout: 15000 });
check(sql(`select c.name || '|' || g.name from communities c join community_groups g on g.community_id = c.id and g.kind = 'main' where c.id = '${cid}'`) === 'UCL Abacus Club|UCL Abacus Club', 'the admin renames the community (and its main chat)');
await see(sam, 'community-name-input').fill('UCL Abacus'); await see(sam, 'community-rename').click(); await sam.waitForTimeout(1500);
check(sql(`select name from communities where id = '${cid}'`) === 'UCL Abacus', 'and back');
check(await see(sam, 'colour-admin').count() === 1 && /Admin/.test(await text(sam, 'colour-admin')), 'the colour key lists the role colours with their tags');
// The page shows the new picture and banner.
await sam.goto(BASE + '/c/ucl-abacus'); await sam.getByTestId('community-header').waitFor({ timeout: 20000 }); await sam.waitForTimeout(1500);
check(await sam.getByTestId('community-banner').locator('img').count() === 1 && await sam.getByTestId('community-logo').locator('img').count() === 1, 'the community page shows the uploaded banner and picture');
check(/Maths, games and friends at UCL\./.test(await text(sam, 'community-bio')), 'and the bio');
// 3. The last admin can't leave (the database's message).
await sam.getByTestId('leave-community').click(); await sam.getByTestId('leave-community-error').waitFor({ timeout: 15000 });
say('Sam leaving:', await text(sam, 'leave-community-error'));
check(await text(sam, 'leave-community-error') === "You're the only admin. Make someone else an admin before you leave.", 'the only admin can\'t leave');
check(row(U1).startsWith('active|admin'), 'Sam is still the admin');

// 4. The Function team (Sky, not in the community) can't demote or remove the last admin either.
const sky = await fresh(); await loginCode(sky, 's4@lse.ac.uk');
await sky.goto(BASE + '/c/ucl-abacus/manage'); await member(sky, U1).waitFor({ timeout: 20000 });
check(/Function team/.test(await sky.locator('body').innerText()), 'the Function team are told they\'re managing as the Function team');
await member(sky, U1).getByTestId('member-open').click(); await member(sky, U1).getByTestId('role-regular').click();
await member(sky, U1).getByTestId('member-error').waitFor({ timeout: 15000 });
say('demoting the last admin:', await text(sky, 'member-error'));
check(await text(sky, 'member-error') === 'A community needs at least one admin. Make someone else an admin first.', 'the last admin can\'t be demoted');
await member(sky, U1).getByTestId('remove-member').click(); await sky.waitForTimeout(1500);
check(await text(sky, 'member-error') === 'A community needs at least one admin. Make someone else an admin first.', 'or removed');
check(row(U1).startsWith('active|admin'), 'Sam is still the admin');

// 5. Regular people can't manage (and see no Manage tab).
const cas = await fresh(); await loginCode(cas, 's3@lse.ac.uk');
await cas.goto(BASE + '/c/ucl-abacus/manage'); await cas.getByTestId('manage-not-allowed').waitFor({ timeout: 20000 });
check(/Only admins and committee can manage UCL Abacus/.test(await text(cas, 'manage-not-allowed')), 'a regular person is told only admins and committee can manage it');
await cas.goto(BASE + '/c/ucl-abacus'); await cas.getByTestId('community-tab-chat').waitFor({ timeout: 20000 });
check(await cas.getByTestId('community-tab-manage').count() === 0, 'and has no Manage tab');

// 6. Committee remove a regular person.
await bea.goto(BASE + '/c/ucl-abacus/manage'); await member(bea, U3).waitFor({ timeout: 20000 });
await member(bea, U3).getByTestId('member-open').click(); await member(bea, U3).getByTestId('remove-member').click();
await member(bea, U3).waitFor({ state: 'detached', timeout: 15000 });
check(row(U3).startsWith('removed'), 'committee remove Cas (a regular person)');
await cas.goto(BASE + '/c/ucl-abacus'); await cas.getByTestId('community-removed').waitFor({ timeout: 20000 });
await finish();
