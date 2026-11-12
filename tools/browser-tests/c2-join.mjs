// Communities part 2: the join link. Logged out, the community's page and
// join screen show its public card and ask you to log in or sign up; after
// signing up for the first time (password, then the welcome step) and after
// logging in, you land back on the join screen, with ?ref= kept. Then: the
// nickname (from the profile), live and database errors, the paying-member
// box, "Request sent", the waiting card (change nickname), the Societies
// tab's "Your communities", someone declined asking again, someone removed
// kept out, and someone already in sent straight to the page.
import { BASE, U1, U2, U3, check, fresh, loginCode, signUp, welcome, path, text, say, sql, setUpAbacus, addMember, finish } from './c2-common.mjs';
const n = Date.now() % 100000;
const { cid } = setUpAbacus();
const samNick = sql(`select nickname from community_members where community_id = '${cid}' and user_id = '${U1}'`);
say('Sam is the first admin, nickname:', samNick);

// 1. Logged out: the page and the join link show the public card.
const v = await fresh();
await v.goto(BASE + '/c/ucl-abacus'); await v.getByTestId('community-logged-out').waitFor({ timeout: 20000 });
check(await text(v, 'community-name') === 'UCL Abacus', 'logged out: the page shows the name');
check(await v.getByTestId('community-login').count() === 1, 'logged out: "Log in to join"');
await v.goto(BASE + `/c/ucl-abacus/join?ref=${U1}`); await v.getByTestId('join-logged-out').waitFor({ timeout: 20000 });
say('logged-out join card:', await text(v, 'join-logged-out'));
check(/Log in or sign up to join UCL Abacus/.test(await text(v, 'join-logged-out')), 'logged out: "Log in or sign up to join UCL Abacus"');
check(await v.getByTestId('join-form').count() === 0, 'logged out: no form');

// 2. A brand-new account: Sign up -> password -> welcome -> back on the join screen.
await v.getByTestId('join-signup').click(); await v.waitForURL('**/login**', { timeout: 15000 });
const loginUrl = new URL(v.url()); say('sign up goes to:', loginUrl.pathname + loginUrl.search);
check(loginUrl.searchParams.get('next') === '/c/ucl-abacus/join' && loginUrl.searchParams.get('mode') === 'signup', 'the sign-up link carries next and the Sign up tab');
await signUp(v, `new${n}@lse.ac.uk`, { stay: true });
say('after sign-up:', path(v)); check(path(v) === '/welcome', 'a new account goes to the welcome step first');
await welcome(v, { fullName: 'Nina Newton', nickname: 'Nina' });
await v.waitForURL('**/c/ucl-abacus/join', { timeout: 20000 }).catch(() => {});
say('after the welcome step:', path(v)); check(path(v) === '/c/ucl-abacus/join', 'after signing up for the first time, back on the join screen');
await v.getByTestId('join-form').waitFor({ timeout: 20000 });
check(await v.getByTestId('join-nickname').inputValue() === 'Nina', 'the nickname starts as the profile nickname');
check(/This is the name people see in UCL Abacus's chats/.test(await text(v, 'join-form')), 'the help text');
check(/I'm a paying member of UCL Abacus/.test(await text(v, 'join-claim')), 'the paying-member box');
// Live validation, then the database's own message.
await v.getByTestId('join-nickname').fill('Admin');
check(/reserved/.test(await text(v, 'join-nickname-problem')), 'a reserved nickname is flagged as you type');
await v.getByTestId('join-nickname').fill(''); await v.getByTestId('join-send').click();
check(/Choose a nickname/.test(await text(v, 'join-nickname-problem')), 'an empty nickname is flagged');
await v.getByTestId('join-nickname').fill(samNick.toUpperCase()); await v.getByTestId('join-send').click();
await v.getByTestId('join-error').waitFor({ timeout: 15000 }); say('taken:', await text(v, 'join-error'));
check(await text(v, 'join-error') === 'That nickname is taken in this community. Try another.', 'a taken nickname shows the database\'s message');
await v.getByTestId('join-nickname').fill('Nina'); await v.getByTestId('join-claim').click();
check(await v.getByTestId('join-claim').getAttribute('aria-checked') === 'true', 'the box is ticked');
await v.screenshot({ path: process.argv[2] + '/c2-shots/join-form-filled.png', fullPage: true });
await v.getByTestId('join-send').click(); await v.getByTestId('join-sent').waitFor({ timeout: 15000 });
say('sent:', await text(v, 'join-sent'));
check(/Request sent/.test(await text(v, 'join-sent')) && /admin or committee member/.test(await text(v, 'join-sent')), '"Request sent" says an admin or committee member will approve it');
const nina = sql(`select id from profiles where email = 'new${n}@lse.ac.uk'`);
const row = sql(`select status || '|' || nickname || '|' || membership_claimed || '|' || coalesce(referred_by::text, '-') from community_members where community_id = '${cid}' and user_id = '${nina}'`);
say('stored:', row); check(row === `pending|Nina|true|${U1}`, 'pending, with the nickname, the claim and who shared the link (?ref= survived signing up)');

// 3. The community page shows the waiting card; the nickname can be changed.
await v.getByTestId('join-go-to-community').click(); await v.waitForURL('**/c/ucl-abacus', { timeout: 15000 });
await v.getByTestId('community-pending').waitFor({ timeout: 20000 });
say('waiting card:', await text(v, 'community-pending'));
check(await text(v, 'pending-nickname') === 'Nina' && /I'm a paying member of UCL Abacus/.test(await text(v, 'pending-claim')), 'the waiting card shows the nickname and the claim');
check(await v.getByTestId('community-tab-chat').count() === 0, 'no tabs while waiting');
await v.getByTestId('change-nickname').click(); await v.getByTestId('pending-nickname-input').fill('Nina N'); await v.getByTestId('pending-nickname-save').click();
await v.getByText('Nina N', { exact: true }).waitFor({ timeout: 15000 });
check(sql(`select nickname from community_members where community_id = '${cid}' and user_id = '${nina}'`) === 'Nina N', 'the new nickname is saved');
// 4. The Societies tab: "Your communities", waiting for approval.
await v.goto(BASE + '/societies'); await v.getByTestId('your-communities').waitFor({ timeout: 20000 });
say('Your communities:', await text(v, 'your-communities'));
check(/UCL Abacus/.test(await text(v, 'your-communities')) && await v.getByTestId('community-waiting').count() === 1, 'Societies tab: UCL Abacus, waiting for approval');
await v.getByTestId('community-ucl-abacus').click(); await v.waitForURL('**/c/ucl-abacus', { timeout: 15000 });

// 5. An existing account through the join link: Log in -> code -> back on the join screen.
const bea = await fresh();
await bea.goto(BASE + `/c/ucl-abacus/join?ref=${U1}`); await bea.getByTestId('join-login').click(); await bea.waitForURL('**/login**', { timeout: 15000 });
check(new URL(bea.url()).searchParams.get('next') === '/c/ucl-abacus/join', 'the log-in link carries next');
await loginCode(bea, 's2@lse.ac.uk', { stay: true });
await bea.waitForURL('**/c/ucl-abacus/join', { timeout: 20000 }).catch(() => {});
say('after logging in:', path(bea)); check(path(bea) === '/c/ucl-abacus/join', 'after logging in, back on the join screen');
await bea.getByTestId('join-form').waitFor({ timeout: 20000 });
say('Bea\'s nickname starts as:', await bea.getByTestId('join-nickname').inputValue());
check(await bea.getByTestId('join-nickname').inputValue() === 'Bea', 'no profile nickname: the first name');
// Declined before: "Request to join again" opens the form, with the old nickname.
addMember(cid, U2, 'Bee', { status: 'declined' });
await bea.goto(BASE + '/c/ucl-abacus'); await bea.getByTestId('community-declined').waitFor({ timeout: 20000 });
await bea.getByTestId('request-again').click(); await bea.waitForURL('**/c/ucl-abacus/join', { timeout: 15000 }); await bea.getByTestId('join-form').waitFor({ timeout: 20000 });
check(await bea.getByTestId('join-nickname').inputValue() === 'Bee', 'asking again starts with the old nickname');
await bea.getByTestId('join-send').click(); await bea.getByTestId('join-sent').waitFor({ timeout: 15000 });
const beaRow = sql(`select status || '|' || membership_claimed || '|' || coalesce(referred_by::text, '-') from community_members where community_id = '${cid}' and user_id = '${U2}'`);
say('Bea:', beaRow); check(beaRow === `pending|false|${U1}`, 'Bea asks again (no claim), with who shared the link kept through logging in');

// 6. A half-made account opening the join link is sent to fill in its details first, then comes back (with ?ref=).
const half = await fresh(); await signUp(half, `new${n + 1}@lse.ac.uk`); check(path(half) === '/welcome', 'the second new account stops at the welcome step');
await half.goto(BASE + `/c/ucl-abacus/join?ref=${U1}`); await half.waitForURL('**/welcome**', { timeout: 20000 });
say('half-made account sent to:', path(half) + new URL(half.url()).search);
check(new URL(half.url()).searchParams.get('next') === '/c/ucl-abacus/join', 'the account check keeps the join screen as next');
await welcome(half, { fullName: 'Hal Halfway' });
await half.waitForURL('**/c/ucl-abacus/join', { timeout: 20000 }).catch(() => {}); check(path(half) === '/c/ucl-abacus/join', 'and brings them back to it');
await half.getByTestId('join-form').waitFor({ timeout: 20000 }); check(await half.getByTestId('join-nickname').inputValue() === 'Hal', 'their first name to start with');
await half.getByTestId('join-send').click(); await half.getByTestId('join-sent').waitFor({ timeout: 15000 });
const hal = sql(`select id from profiles where email = 'new${n + 1}@lse.ac.uk'`);
check(sql(`select coalesce(referred_by::text, '-') from community_members where community_id = '${cid}' and user_id = '${hal}'`) === U1, '?ref= survived the account check too');

// 6b. The sign-up link opened straight in a new tab: the Sign up tab, without the page redrawing (no React error).
const direct = await fresh(); await direct.goto(BASE + '/login?mode=signup&next=/c/ucl-abacus/join'); await direct.getByTestId('send-code').waitFor({ timeout: 15000 });
check(await direct.getByTestId('send-code').count() === 1, 'a direct sign-up link opens the Sign up tab');

// 7. Someone removed: a clear message and no form, here or on the page.
addMember(cid, U3, 'Cas', { status: 'removed' });
const cas = await fresh(); await loginCode(cas, 's3@lse.ac.uk');
await cas.goto(BASE + '/c/ucl-abacus/join'); await cas.getByTestId('join-removed').waitFor({ timeout: 20000 });
check(await cas.getByTestId('join-form').count() === 0, 'removed: no form on the join screen');
await cas.goto(BASE + '/c/ucl-abacus'); await cas.getByTestId('community-removed').waitFor({ timeout: 20000 });
say('removed card:', await text(cas, 'community-removed'));
check(/You've been removed from UCL Abacus/.test(await text(cas, 'community-removed')) && await cas.getByTestId('join-community').count() === 0 && await cas.getByTestId('request-again').count() === 0, 'removed: no join button on the page');

// 8. Someone already in: straight to the community's page.
const sam = await fresh(); await loginCode(sam, 's1@lse.ac.uk');
await sam.goto(BASE + '/c/ucl-abacus/join'); await sam.waitForURL((u) => u.pathname === '/c/ucl-abacus', { timeout: 20000 }).catch(() => {});
say('Sam opening the join link lands on:', path(sam)); check(path(sam) === '/c/ucl-abacus', 'already in: the join link opens the community page');
await sam.getByTestId('community-tab-chat').waitFor({ timeout: 20000 });
// An unknown community.
await sam.goto(BASE + '/c/no-such-community/join'); await sam.getByTestId('community-not-found').waitFor({ timeout: 20000 });
await finish();
