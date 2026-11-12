// Communities part 2: the community page's tabs and the Chats and Societies
// tabs. Chat (the main chat's card, with unread "99+" and muted), Groups
// (an admin adds themselves to AbaFam, makes a group and adds a member;
// the member sees it in Groups and the Chats tab, others don't), Tickets
// (coming soon); community rows in the Chats tab ("UCL Abacus", "UCL
// Abacus · <group>") under Events & Societies, with the muted icon;
// "Your communities" on the Societies tab; archiving a group.
import { BASE, U1, U2, U3, U4, check, fresh, loginCode, path, text, see, say, sql, setUpAbacus, addMember, person, finish } from './c2-common.mjs';
const S = process.argv[2];
const { cid, main, abafam } = setUpAbacus();
addMember(cid, U2, 'Bea', { role: 'committee' });
addMember(cid, U3, 'Cas', { membership: 'member' });
const DAN = person('d0000000-0000-4000-8000-00000000000d', 'dan@lse.ac.uk', 'Dan Dawes');
addMember(cid, DAN, 'Danny');
const abafamThread = sql(`select id from threads where community_group_id = '${abafam}'`);

// 1. Sam (admin): the Chat tab, then Groups: AbaFam with "Add myself", and a new group.
const sam = await fresh(); await loginCode(sam, 's1@lse.ac.uk');
await sam.goto(BASE + '/c/ucl-abacus'); await sam.getByTestId('community-chat-tab').waitFor({ timeout: 20000 });
check(await see(sam, 'open-main-chat').count() === 1, 'the Chat tab opens the main chat');
await see(sam, 'community-tab-groups').click(); await see(sam, `group-${abafam}`).waitFor({ timeout: 15000 });
say('AbaFam for the admin:', await text(sam, `group-${abafam}`));
check(await see(sam, `group-${abafam}`).getByTestId('add-myself').count() === 1, 'an admin not in AbaFam sees "Add myself"');
await see(sam, `group-${abafam}`).getByTestId('add-myself').click();
await sam.waitForFunction(() => !document.querySelector('[data-testid="add-myself"]'), null, { timeout: 15000 });
check(sql(`select count(*) from community_group_members where group_id = '${abafam}' and user_id = '${U1}'`) === '1', 'Sam is in AbaFam');
check(sql(`select body from messages where thread_id = '${abafamThread}' order by created_at desc limit 1`) === 'joined the group', 'AbaFam\'s chat says Sam joined');
await see(sam, 'new-group-open').click(); await see(sam, 'new-group-name').fill('Poker Night'); await see(sam, 'new-group-description').fill('Thursday games'); await see(sam, 'new-group-save').click();
await sam.getByText('Poker Night', { exact: true }).first().waitFor({ timeout: 15000 });
const poker = sql(`select id from community_groups where community_id = '${cid}' and name = 'Poker Night'`);
const pokerThread = sql(`select id from threads where community_group_id = '${poker}'`);
check(/^[0-9a-f-]{36}$/.test(poker) && /^[0-9a-f-]{36}$/.test(pokerThread), 'the new group and its chat exist');
// Manage -> Groups: add Cas to Poker Night by searching the roster.
await sam.goto(BASE + '/c/ucl-abacus/manage'); await see(sam, `manage-group-${poker}`).waitFor({ timeout: 20000 });
await see(sam, `manage-group-${poker}`).getByTestId('manage-group-open').click();
await see(sam, 'group-add-search').fill('cas'); await see(sam, `group-candidate-${U3}`).waitFor({ timeout: 15000 });
await see(sam, `group-candidate-${U3}`).getByTestId('add-to-group').click(); await see(sam, `group-member-${U3}`).waitFor({ timeout: 15000 });
check(sql(`select count(*) from community_group_members where group_id = '${poker}' and user_id = '${U3}'`) === '1', 'Cas is added to Poker Night');
check(sql(`select body from messages where thread_id = '${pokerThread}' order by created_at desc limit 1`) === 'added Cas', 'its chat says Sam added Cas');
check(await see(sam, `group-member-${U1}`).count() === 0, 'making a group doesn\'t put you in it');

// 2. Cas sees Poker Night (not AbaFam) in Groups and the Chats tab; Danny sees neither.
const cas = await fresh(); await loginCode(cas, 's3@lse.ac.uk');
await cas.goto(BASE + '/c/ucl-abacus?tab=groups'); await see(cas, 'community-groups').waitFor({ timeout: 20000 });
check(await see(cas, `group-${poker}`).count() === 1 && await see(cas, `group-${abafam}`).count() === 0, 'Cas sees Poker Night and not AbaFam');
check(await see(cas, 'add-myself').count() === 0 && await see(cas, 'new-group-open').count() === 0, 'a regular member can\'t add themselves or make groups');
await see(cas, `group-${poker}`).click(); await cas.waitForURL(`**/chats/${pokerThread}`, { timeout: 15000 });
say('Poker Night opens:', path(cas));
// Danny never logs in: the database keeps him out of the group's chat.
check(sql(`select count(*) from thread_participants where thread_id = '${pokerThread}' and user_id = '${DAN}'`) === '0', 'Danny isn\'t in Poker Night\'s chat');
const bea = await fresh(); await loginCode(bea, 's2@lse.ac.uk');
await bea.goto(BASE + '/c/ucl-abacus?tab=groups'); await see(bea, `group-${poker}`).waitFor({ timeout: 20000 });
check(await see(bea, `group-${poker}`).getByTestId('add-myself').count() === 1, 'committee see every group, with "Add myself"');
await bea.goto(BASE + '/chats'); await see(bea, 'chats-tab-events').waitFor({ timeout: 20000 }); await see(bea, 'chats-tab-events').click();
await see(bea, `thread-${main}`).waitFor({ timeout: 15000 });
check(await see(bea, `thread-${pokerThread}`).count() === 0, 'a group\'s chat isn\'t in the Chats tab of someone not in it');
// Tickets.
await cas.goto(BASE + '/c/ucl-abacus?tab=tickets'); await see(cas, 'tickets-coming-soon').waitFor({ timeout: 20000 });
say('Tickets:', await text(cas, 'tickets-coming-soon'));
check(/Ticket marketplace coming soon/.test(await text(cas, 'tickets-coming-soon')) && /Buy and sell tickets with other members of UCL Abacus\. Coming soon\./.test(await text(cas, 'tickets-coming-soon')), 'Tickets says the marketplace is coming soon');

// 3. The Chats tab: community rows, "99+", muted.
const ins = (n) => sql(`insert into messages (thread_id, sender_id, body) select '${main}', '${U1}', 'Message ' || g from generate_series(1, ${n}) g`);
ins(120);
sql(`insert into thread_mutes (thread_id, user_id, muted_until) values ('${main}', '${U3}', null) on conflict (thread_id, user_id) do update set muted_until = null`);
sql(`insert into messages (thread_id, sender_id, body) values ('${pokerThread}', '${U1}', 'Thursday at 7?')`);
await cas.goto(BASE + '/chats'); await see(cas, 'chats-tab-events').waitFor({ timeout: 20000 }); await see(cas, 'chats-tab-events').click();
await see(cas, `thread-${main}`).waitFor({ timeout: 15000 });
const mainRow = await text(cas, `thread-${main}`), pokerRow = await text(cas, `thread-${pokerThread}`);
say('main row:', mainRow); say('group row:', pokerRow);
check(/^A \| UCL Abacus \|/.test(mainRow) || /UCL Abacus/.test(mainRow), 'the main chat row is titled "UCL Abacus"');
check(/UCL Abacus · Poker Night/.test(pokerRow) && /Thursday at 7\?/.test(pokerRow), 'the group row is titled "UCL Abacus · Poker Night" with its last message');
check(/99\+/.test(mainRow), 'the unread badge stops at 99+');
say('Events & Societies tab:', await text(cas, 'chats-tab-events'));
check(/99\+/.test(await text(cas, 'chats-tab-events')), 'the section\'s count says 99+ when a community chat is at the cap');
check(await see(cas, `thread-${main}`).getByTestId('thread-muted').count() === 1 && await see(cas, `thread-${pokerThread}`).getByTestId('thread-muted').count() === 0, 'the muted chat has the muted icon, the other doesn\'t');
check(await see(cas, 'chats-tab-personal').count() === 1, 'the Personal tab is still there');
await see(cas, 'chats-tab-personal').click(); await cas.waitForTimeout(500);
check(await see(cas, `thread-${main}`).count() === 0, 'community chats aren\'t under Personal');
await cas.screenshot({ path: S + '/c2-shots/chats-tab-personal-phone.png' });
await see(cas, 'chats-tab-events').click(); await see(cas, `thread-${main}`).waitFor({ timeout: 10000 });
await cas.screenshot({ path: S + '/c2-shots/chats-tab-communities-phone.png', fullPage: true });
// The Chat tab of the community page shows the same.
await cas.goto(BASE + '/c/ucl-abacus'); await see(cas, 'community-chat-tab').waitFor({ timeout: 20000 });
say('Chat tab:', await text(cas, 'community-chat-tab'));
check(await text(cas, 'main-chat-unread') === '99+' && await see(cas, 'main-chat-muted').count() === 1 && /^Message \d+$/.test(await text(cas, 'main-chat-preview')), 'the Chat tab shows 99+, muted and the last message');
await see(cas, 'open-main-chat').click(); await cas.waitForURL(`**/chats/${main}`, { timeout: 15000 });

// 4. The Societies tab: "Your communities" for members, nothing for others.
await cas.goto(BASE + '/societies'); await see(cas, 'your-communities').waitFor({ timeout: 20000 });
say('Your communities (Cas):', await text(cas, 'your-communities'));
check(/UCL Abacus/.test(await text(cas, 'your-communities')) && /As Cas/.test(await text(cas, 'your-communities')) && await see(cas, 'community-waiting').count() === 0, 'Cas sees UCL Abacus in Your communities');
const sky = await fresh(); await loginCode(sky, 's4@lse.ac.uk');
await sky.goto(BASE + '/societies'); await see(sky, 'society-event-buttons').waitFor({ timeout: 20000 }); await sky.waitForTimeout(800);
check(await see(sky, 'your-communities').count() === 0, 'someone in no community sees no Your communities section');

// 5. Archiving a group hides it.
await sam.goto(BASE + '/c/ucl-abacus/manage'); await see(sam, `manage-group-${poker}`).waitFor({ timeout: 20000 });
await see(sam, `manage-group-${poker}`).getByTestId('manage-group-open').click(); await see(sam, 'archive-group').click();
await see(sam, `manage-group-${poker}`).waitFor({ state: 'detached', timeout: 15000 });
check(sql(`select archived_at is not null from community_groups where id = '${poker}'`) === 't', 'Sam archives Poker Night');
await cas.goto(BASE + '/c/ucl-abacus?tab=groups'); await see(cas, 'community-groups').waitFor({ timeout: 20000 });
check(await see(cas, `group-${poker}`).count() === 0, 'an archived group is gone from Groups');
await finish();
