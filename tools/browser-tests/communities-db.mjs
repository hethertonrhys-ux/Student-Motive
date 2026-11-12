// Communities C1 (database foundation), through the real web app and its API:
// the public card for logged-out visitors, asking to join, approval by the
// community's admin, the community chat in the existing Chats tab and chat
// screen (sending, reading, the push to the other person with the
// community's name and the sender's nickname), mutes, and outsiders kept out.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; import { execSync } from 'child_process'; const { chromium, devices } = pw;
const [S] = process.argv.slice(2); const BASE = 'http://localhost:8123'; const API = 'http://localhost:54400'; const errs = []; const say = (...a) => console.log('•', ...a);
const sql = (q) => execSync(`psql -h /var/tmp/motivepg -p 5499 -U postgres -d e2e -qAtc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const check = (ok, what) => { if (!ok) errs.push(what); };
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003', U4 = '00000000-0000-0000-0000-000000000004';

// Seed: Sky is on the Function team and makes Sam the first admin of UCL Abacus (seeded by the migration). Bea has a phone set up.
sql(`update profiles set is_admin = true where id = '${U4}'`);
const cid = sql(`select id from communities where slug = 'ucl-abacus'`);
check(/^[0-9a-f-]{36}$/.test(cid), 'UCL Abacus is seeded');
sql(`select set_config('request.jwt.claim.sub', '${U4}', false); select public.admin_set_community_admin('${cid}', '${U1}')`);
const main = sql(`select t.id from threads t join community_groups g on g.id = t.community_group_id where g.community_id = '${cid}' and g.kind = 'main'`);
sql(`insert into push_tokens (user_id, platform, token) values ('${U2}', 'ios', 'ExponentPushToken[c1-browser-bea]') on conflict (token) do nothing`);
sql(`delete from push_queue`);

const b = await chromium.launch();
const fresh = async () => { const c = await b.newContext(devices['iPhone 13']); const p = await c.newPage(); p.on('pageerror', (e) => errs.push('page: ' + e.message)); p.on('dialog', (d) => d.accept()); return p; };
const login = async (p, email) => {
  await p.goto(BASE + '/login'); await p.getByTestId('mode-signup').click(); await p.getByTestId('email').fill(email); await p.getByTestId('send-code').click();
  await p.getByTestId('code').waitFor({ timeout: 15000 }); await p.getByTestId('code').fill('123456'); await p.getByTestId('log-in').click(); await p.waitForFunction(() => document.querySelector('[data-testid="skip-password"]') || !location.pathname.startsWith('/login'), null, { timeout: 15000 }).catch(() => {}); if (await p.getByTestId('skip-password').count()) await p.getByTestId('skip-password').click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
};
// Calls the API as whoever is logged in on that page (their session from local storage), or logged out.
const api = (p, path, body, { anon = false, method = 'POST' } = {}) => p.evaluate(async ({ API, path, body, anon, method }) => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
  const token = !anon && key ? JSON.parse(localStorage.getItem(key)).access_token : null;
  const headers = { 'Content-Type': 'application/json', apikey: 'sb_publishable_test', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(API + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}, { API, path, body, anon, method });

// 1. A logged-out visitor sees the public card, and nothing else.
const visitor = await fresh(); await visitor.goto(BASE + '/');
const card = await api(visitor, '/rest/v1/rpc/community_public', { community_slug: 'ucl-abacus' }, { anon: true });
say('public card:', card.status, JSON.stringify(card.json));
check(card.status === 200 && card.json?.[0]?.name === 'UCL Abacus', 'logged-out visitors see the public card');
const anonTable = await api(visitor, '/rest/v1/communities?select=id', null, { anon: true, method: 'GET' });
check(anonTable.status >= 400, `logged-out visitors can't read the communities table (got ${anonTable.status})`);
const anonJoin = await api(visitor, '/rest/v1/rpc/request_to_join', { community_slug: 'ucl-abacus', wanted_nickname: 'Anon', claims_membership: false }, { anon: true });
check(anonJoin.status >= 400, `logged-out visitors can't ask to join (got ${anonJoin.status})`);

// 2. Bea asks to join, claiming to be a paying member.
const bea = await fresh(); await login(bea, 's2@lse.ac.uk');
const reserved = await api(bea, '/rest/v1/rpc/request_to_join', { community_slug: 'ucl-abacus', wanted_nickname: 'Admin', claims_membership: true });
say('reserved nickname:', reserved.status, reserved.json?.message);
check(reserved.status >= 400 && /reserved/.test(reserved.json?.message ?? ''), 'a reserved nickname is refused with a friendly message');
// Look-alikes and reserved words inside a nickname are refused too ("Admin" with a Cyrillic A).
for (const nick of [String.fromCharCode(0x410) + 'dmin', 'Function Team', 'Committee Member']) {
  const refused = await api(bea, '/rest/v1/rpc/request_to_join', { community_slug: 'ucl-abacus', wanted_nickname: nick, claims_membership: false });
  check(refused.status >= 400 && /reserved/.test(refused.json?.message ?? ''), `the nickname "${nick}" is refused as reserved (got ${refused.status} ${refused.json?.message})`);
}
const join = await api(bea, '/rest/v1/rpc/request_to_join', { community_slug: 'ucl-abacus', wanted_nickname: 'Bea', claims_membership: true, ref: U1 });
say('join:', join.status, JSON.stringify(join.json));
check(join.status === 200 && join.json === 'pending', 'Bea asks to join: pending');
const waiting = await api(bea, '/rest/v1/rpc/community_home', { community_slug: 'ucl-abacus' });
check(waiting.json?.me?.status === 'pending' && waiting.json?.groups?.length === 0, 'while waiting Bea sees her request but no groups');
const beaEarly = await api(bea, `/rest/v1/messages?select=id&thread_id=eq.${main}`, null, { method: 'GET' });
check(beaEarly.status === 200 && beaEarly.json?.length === 0, 'while waiting Bea reads no messages');

// 3. Sam (the admin) sees the request with the claim (never an email) and approves her as a paying member.
const sam = await fresh(); await login(sam, 's1@lse.ac.uk');
const requests = await api(sam, '/rest/v1/rpc/community_requests', { cid });
say('requests:', JSON.stringify(requests.json));
check(requests.json?.length === 1 && requests.json[0].nickname === 'Bea' && requests.json[0].membership_claimed === true && requests.json[0].referred_by_nickname === 'Sam', 'the admin sees the request, the claim and who shared the link');
check(!requests.text.includes('@'), 'no email in the requests');
const approve = await api(sam, '/rest/v1/rpc/approve_request', { cid, target: U2, as_member: true });
check(approve.status === 200 || approve.status === 204, `the admin approves (got ${approve.status} ${approve.text})`);
const roster = await api(sam, '/rest/v1/rpc/community_roster', { cid });
say('roster:', JSON.stringify(roster.json));
check(roster.json?.length === 2 && !roster.text.includes('@') && !roster.text.includes('claimed'), 'the roster has both of them, with no emails or claims');

// 4. The community chat in the existing Chats tab and chat screen.
// (Since the community screens (part 2), the Chats tab files community chats under "Events & Societies".)
await sam.goto(BASE + '/chats'); await sam.getByTestId('chats-tab-events').waitFor({ timeout: 20000 });
await sam.getByTestId('chats-tab-events').click();
await sam.getByTestId(`thread-${main}`).waitFor({ timeout: 20000 }).catch(() => {});
const row = sam.getByTestId(`thread-${main}`);
check(await row.count() === 1, 'the community chat is in Sam\'s chat list');
if (await row.count()) {
  const rowText = (await row.innerText()).replace(/\n/g, ' | '); say('chat row:', rowText);
  check(/UCL Abacus/.test(rowText), 'titled "UCL Abacus"');
  await row.click(); await sam.waitForURL(`**/chats/${main}`, { timeout: 15000 });
} else {
  await sam.goto(BASE + `/chats/${main}`);
}
await sam.getByTestId('draft').waitFor({ timeout: 15000 });
await sam.getByTestId('draft').fill('Welcome to Abacus'); await sam.getByTestId('send').click();
await sam.getByTestId('messages').getByText('Welcome to Abacus').waitFor({ timeout: 15000 });
const push = sql(`select title || '|' || body || '|' || url from push_queue where user_id = '${U2}'`);
say('push to Bea:', push);
check(push === `UCL Abacus|Sam: Welcome to Abacus|/chats/${main}`, 'Bea is notified with the community\'s name and Sam\'s community nickname');
check(!sql(`select count(*) from push_queue where user_id = '${U1}'`).startsWith('1'), 'the sender gets no notification');

await bea.goto(BASE + `/chats/${main}`);
await bea.getByTestId('messages').getByText('Welcome to Abacus').waitFor({ timeout: 20000 });
await bea.getByTestId('draft').fill('Thanks Sam'); await bea.getByTestId('send').click();
await sam.getByTestId('messages').getByText('Thanks Sam').waitFor({ timeout: 30000 });
say('both see each other\'s messages in the existing chat screen');

// 5. Mutes, and the fuller chat list.
const mute = await api(bea, '/rest/v1/rpc/set_thread_mute', { tid: main, duration: '1h' });
check(mute.status === 200 || mute.status === 204, `Bea mutes the chat (got ${mute.status})`);
const list = await api(bea, '/rest/v1/rpc/my_chat_list', {});
const item = list.json?.find?.((t) => t.id === main);
say('Bea\'s chat list entry:', JSON.stringify(item && { title: item.title, kind: item.kind, muted: item.muted, muted_until: item.muted_until }));
check(item?.kind === 'community' && item?.muted === true && !!item?.muted_until, 'the chat list says it\'s a muted community chat');
sql(`delete from push_queue`);
await sam.getByTestId('draft').fill('Muted message'); await sam.getByTestId('send').click();
await sam.getByTestId('messages').getByText('Muted message').waitFor({ timeout: 15000 });
check(sql(`select count(*) from push_queue where user_id = '${U2}'`) === '0', 'a muted chat sends Bea no notification');

// 5b. The existing chat screen treats it as a group chat, and the share screen
// lists it as one, following the chat's "members can share events" setting.
check(await sam.getByTestId('chat-options').count() === 1, 'the community chat has the group chat menu');
const lse = sql(`select id from societies where slug='lse-poker-society'`); const venue = sql(`select id from venues limit 1`);
const ev = sql(`insert into events (society_id,title,category,venue_id,starts_at,ends_at,audience) values ('${lse}','Abacus Share Night','social','${venue}',now()+interval '2 days',now()+interval '2 days 3 hours','uni') returning id`);
check(/^[0-9a-f-]{36}$/.test(ev), 'there is an event to share');
const shareRow = async (p) => {
  await p.goto(BASE + `/share?event=${ev}`);
  const r = p.getByTestId(`share-to-${main}`);
  await r.waitFor({ timeout: 20000 }).catch(() => {});
  return (await r.count()) ? (await r.innerText()).replace(/\n/g, ' | ') : '(not listed)';
};
if (ev) {
  const samRow = await shareRow(sam); say('share row (Sam):', samRow);
  check(/UCL Abacus/.test(samRow) && /Group chat/.test(samRow), 'the share screen lists the community chat as a group chat');
  sql(`update threads set members_can_share_events = false where id = '${main}'`);
  const beaRow = await shareRow(bea); say('share row (Bea, sharing off):', beaRow);
  check(/Only the chat's admins can share events here/.test(beaRow), 'with sharing switched off, a regular member is told only admins can share');
  const adminRow = await shareRow(sam); say('share row (Sam, sharing off):', adminRow);
  check(/Group chat/.test(adminRow), 'the community\'s admin still can');
  sql(`update threads set members_can_share_events = true where id = '${main}'`);
}

// 6. Someone not in the community can't read or post.
const cas = await fresh(); await login(cas, 's3@lse.ac.uk');
const casRead = await api(cas, `/rest/v1/messages?select=id&thread_id=eq.${main}`, null, { method: 'GET' });
check(casRead.status === 200 && casRead.json?.length === 0, 'an outsider reads no messages');
const casSend = await api(cas, '/rest/v1/rpc/send_message', { tid: main, body: 'let me in' });
check(casSend.status >= 400, `an outsider can't post (got ${casSend.status})`);
const casWrite = await api(cas, '/rest/v1/community_members', { community_id: cid, user_id: U3, nickname: 'Cas', status: 'active', role: 'admin' });
check(casWrite.status >= 400, `nobody can write the members table directly (got ${casWrite.status})`);
await cas.goto(BASE + `/chats/${main}`); await cas.waitForTimeout(3000);
check(!(await cas.getByText('Welcome to Abacus').count()), 'the chat screen shows an outsider nothing');

await sam.screenshot({ path: S + '/expo-communities-db.png', fullPage: true });
await b.close(); console.log('errors:', JSON.stringify(errs));
