// Communities part 2: screenshots for the owner, light and dark, at phone
// width (390px) and desktop width (1280px): the community page (Chat and
// Groups tabs), the join screen, and Manage. One community with a banner
// and picture uploaded, and one look at the brand-colour banner used when
// there's none.
import { readFileSync } from 'fs';
import { BASE, U1, U2, U3, check, fresh, loginCode, see, say, sql, setUpAbacus, addMember, person, finish } from './c2-common.mjs';
const S = process.argv[2];
const { cid } = setUpAbacus();
addMember(cid, U2, 'Bea', { role: 'committee' });
const DAN = person('d0000000-0000-4000-8000-00000000000d', 'dan@lse.ac.uk', 'Dan Dawes');
const ELI = person('d0000000-0000-4000-8000-00000000000e', 'eli@lse.ac.uk', 'Eli Evans');
addMember(cid, DAN, 'Danny', { membership: 'member' });
addMember(cid, ELI, 'Eli', { status: 'pending', claimed: true, ref: U1 });
sql(`update communities set bio = 'UCL''s maths, games and puzzles society. Weekly socials, AbaFam, and tickets to the big nights.' where id = '${cid}'`);
sql(`insert into community_groups (community_id, name, description, kind, sort) values ('${cid}', 'Poker Night', 'Thursday games', 'sub', 2)`);
const abafam = sql(`select id from community_groups where community_id = '${cid}' and name = 'AbaFam'`);
sql(`insert into community_group_members (group_id, user_id) values ('${abafam}', '${U1}') on conflict do nothing`);
// A banner and picture in the test's storage stand-in.
const up = async (name, file) => { const res = await fetch(`http://localhost:54400/storage/v1/object/images/communities/${cid}/${name}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: readFileSync(S + '/' + file) }); return res.ok; };
check(await up('banner.jpg', 'img1.jpg') && await up('logo.jpg', 'img2.jpg'), 'test images stored');
const pub = (n) => `http://localhost:54400/storage/v1/object/public/images/communities/${cid}/${n}`;
sql(`update communities set banner_url = '${pub('banner.jpg')}', image_url = '${pub('logo.jpg')}' where id = '${cid}'`);

for (const dark of [false, true]) {
  for (const desktop of [false, true]) {
    const tag = `${desktop ? 'desktop' : 'phone'}-${dark ? 'dark' : 'light'}`;
    const sam = await fresh({ dark, desktop, tall: true }); await loginCode(sam, 's1@lse.ac.uk');
    await sam.goto(BASE + '/c/ucl-abacus'); await see(sam, 'community-chat-tab').waitFor({ timeout: 20000 }); await sam.waitForTimeout(1500);
    await sam.screenshot({ path: `${S}/c2-shots/community-${tag}.png` });
    await see(sam, 'community-tab-groups').click(); await see(sam, 'community-groups').waitFor({ timeout: 10000 }); await sam.waitForTimeout(500);
    await sam.screenshot({ path: `${S}/c2-shots/community-groups-${tag}.png`, fullPage: true });
    await sam.goto(BASE + '/c/ucl-abacus/manage'); await see(sam, 'manage-members').waitFor({ timeout: 20000 }); await see(sam, `request-${ELI}`).waitFor({ timeout: 15000 }); await sam.waitForTimeout(1500);
    await sam.screenshot({ path: `${S}/c2-shots/manage-${tag}.png`, fullPage: true });
    const cas = await fresh({ dark, desktop, tall: true }); await loginCode(cas, 's3@lse.ac.uk');
    await cas.goto(BASE + '/c/ucl-abacus/join'); await see(cas, 'join-form').waitFor({ timeout: 20000 }); await cas.waitForTimeout(1500);
    await cas.screenshot({ path: `${S}/c2-shots/join-${tag}.png`, fullPage: true });
    const out = await fresh({ dark, desktop, tall: true });
    await out.goto(BASE + '/c/ucl-abacus/join'); await see(out, 'join-logged-out').waitFor({ timeout: 20000 }); await out.waitForTimeout(1500);
    await out.screenshot({ path: `${S}/c2-shots/join-logged-out-${tag}.png`, fullPage: true });
    say('shots:', tag);
  }
}
// No banner or picture: the brand-colour band and the first letter.
sql(`update communities set banner_url = null, image_url = null where id = '${cid}'`);
for (const dark of [false, true]) {
  const p = await fresh({ dark }); await loginCode(p, 's1@lse.ac.uk');
  await p.goto(BASE + '/c/ucl-abacus'); await see(p, 'community-chat-tab').waitFor({ timeout: 20000 }); await p.waitForTimeout(1000);
  await p.screenshot({ path: `${S}/c2-shots/community-no-banner-phone-${dark ? 'dark' : 'light'}.png` });
}
await finish();
