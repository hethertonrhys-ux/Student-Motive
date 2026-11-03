-- 20261202000000_communities.sql: communities, their chats, live updates,
-- mutes and notifications.
--
--   Ada  (Function admin) creates "Test Community" (slug test-comm) and makes
--   Sam its first admin. Then: Bea joins and becomes committee, Cas is a
--   paying member, Dee a regular non-member, Hal a second admin, Ivy, Lu and
--   Mo regular people, Eve stays pending, Fin is removed, Kit is declined,
--   Gus never joins (an outsider), Jo is in another community. Anon is a
--   logged-out visitor.
--
-- Everything runs in one transaction that is rolled back at the end, so the
-- other test files never see this data.
begin;

create or replace function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create or replace function pg_temp.error_of(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 0. Running the migration a second time works, and the functions are safe
-- ---------------------------------------------------------------------
reset role;
\ir ../migrations/20261202000000_communities.sql

select pg_temp.expect((select count(*) from public.communities where slug = 'ucl-abacus') = 1, 'the seed: UCL Abacus exists exactly once after running the migration twice');
select pg_temp.expect((select count(*) from public.community_groups g join public.communities c on c.id = g.community_id where c.slug = 'ucl-abacus' and g.kind = 'main') = 1, 'the seed: one main group');
select pg_temp.expect((select string_agg(g.name || ':' || g.kind, ',' order by g.kind) from public.community_groups g join public.communities c on c.id = g.community_id where c.slug = 'ucl-abacus') = 'UCL Abacus:main,AbaFam:sub', 'the seed: the main group "UCL Abacus" and the sub-group "AbaFam"');
select pg_temp.expect((select count(*) from public.threads t join public.community_groups g on g.id = t.community_group_id join public.communities c on c.id = g.community_id where c.slug = 'ucl-abacus') = 2, 'the seed: each group has exactly one chat');
select pg_temp.expect(not exists (select 1 from public.community_members m join public.communities c on c.id = m.community_id where c.slug = 'ucl-abacus'), 'the seed: no members yet');
select pg_temp.expect((select bio from public.communities where slug = 'ucl-abacus') = '', 'the seed: empty bio (the owner adds it)');
select pg_temp.expect((select settings->'role_colours'->'admin'->>'light' from public.communities where slug = 'ucl-abacus') = '#8A5A00', 'the seed: default role colours');

select pg_temp.expect((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in (
    'community_public', 'community_home', 'my_communities', 'request_to_join', 'approve_request', 'decline_request',
    'confirm_membership', 'set_community_role', 'remove_community_member', 'leave_community', 'update_my_community_nickname',
    'update_community_profile', 'update_community_settings', 'create_community_group', 'rename_community_group',
    'archive_community_group', 'add_group_member', 'remove_group_member', 'community_roster', 'community_requests',
    'group_members', 'admin_create_community', 'admin_set_community_admin', 'admin_list_communities', 'set_thread_mute',
    'my_chat_list', 'thread_member_roles', 'purge_push_queue', 'broadcast_message_change', 'community_member_sync',
    'community_group_member_sync', 'community_group_create_chat', 'community_create_main_group', 'is_community_member',
    'is_community_manager', 'can_see_community_group', 'can_manage_community_image')),
  'every new server function is security definer with an empty search path');
select pg_temp.expect((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'community_home', 'my_communities', 'request_to_join', 'approve_request', 'decline_request', 'confirm_membership',
    'set_community_role', 'remove_community_member', 'leave_community', 'update_my_community_nickname', 'update_community_profile',
    'update_community_settings', 'create_community_group', 'rename_community_group', 'archive_community_group', 'add_group_member',
    'remove_group_member', 'community_roster', 'community_requests', 'group_members', 'admin_create_community',
    'admin_set_community_admin', 'admin_list_communities', 'set_thread_mute', 'my_chat_list', 'thread_member_roles')
    and has_function_privilege('anon', p.oid, 'execute')) = 0, 'logged-out visitors can''t call any community function...');
select pg_temp.expect(has_function_privilege('anon', 'public.community_public(text)', 'execute'), '...except the public card');
select pg_temp.expect((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'community_member_sync', 'community_group_member_sync', 'community_group_create_chat', 'community_create_main_group',
    'broadcast_message_change', 'community_role_of', 'community_group_thread', 'community_nickname_problem', 'community_nickname_key', 'community_nickname_tidy',
    'clean_community_nickname', 'community_nickname_taken', 'community_default_nickname', 'community_role_colours',
    'community_settings_problem', 'community_image_url', 'community_group_for_manager', 'purge_push_queue', 'claim_push_batch')
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))) = 0,
  'the server-only helpers and triggers can''t be called from the app');
select pg_temp.expect(has_function_privilege('service_role', 'public.purge_push_queue(integer)', 'execute')
  and has_function_privilege('service_role', 'public.claim_push_batch(integer)', 'execute'), 'send-push (the service role) can claim and purge');
select pg_temp.expect((select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('public.communities'::regclass, 'public.community_members'::regclass,
    'public.community_groups'::regclass, 'public.community_group_members'::regclass, 'public.thread_participants'::regclass, 'public.thread_mutes'::regclass)),
  'row level security is on for every new table');
select pg_temp.expect(not exists (select 1 from pg_policy p where p.polrelid in ('public.communities'::regclass, 'public.community_members'::regclass,
    'public.community_groups'::regclass, 'public.community_group_members'::regclass, 'public.thread_participants'::regclass, 'public.thread_mutes'::regclass)
    and p.polcmd <> 'r'), 'the new tables only have read rules');

-- ---------------------------------------------------------------------
-- Set-up: people
-- ---------------------------------------------------------------------
select pg_temp.as_server();
create temp table people (name text primary key, id uuid);
grant all on people to anon, authenticated;
insert into people values
  ('sam', '00000000-0000-0000-0000-000000000001'), ('bea', '00000000-0000-0000-0000-000000000002'),
  ('cas', '00000000-0000-0000-0000-000000000003'), ('ada', '00000000-0000-0000-0000-0000000000a0'),
  ('dee', 'c0000000-0000-0000-0000-000000000004'), ('eve', 'c0000000-0000-0000-0000-000000000005'),
  ('fin', 'c0000000-0000-0000-0000-000000000006'), ('gus', 'c0000000-0000-0000-0000-000000000007'),
  ('hal', 'c0000000-0000-0000-0000-000000000008'), ('ivy', 'c0000000-0000-0000-0000-000000000009'),
  ('jo',  'c0000000-0000-0000-0000-00000000000a'), ('kit', 'c0000000-0000-0000-0000-00000000000b'),
  ('lu',  'c0000000-0000-0000-0000-00000000000c'), ('mo',  'c0000000-0000-0000-0000-00000000000d');
create or replace function pg_temp.u(n text) returns uuid language sql stable as $$ select id from people where name = n $$;
create or replace function pg_temp.as_person(n text) returns void language plpgsql as $$
begin
  perform pg_temp.act_as((select id::text from people where name = n));
end $$;
insert into auth.users (id, email) select id, name || '@ucl.ac.uk' from people where name not in ('sam', 'bea', 'cas', 'ada') on conflict (id) do nothing;
update public.profiles p set display_name = initcap(x.name) || ' Person', full_name = initcap(x.name) || ' Person'
  from people x where x.id = p.id;
update public.profiles set nickname = 'Sammy' where id = pg_temp.u('sam');
update public.profiles set nickname = 'Admin', full_name = 'Hal Jordan' where id = pg_temp.u('hal');

create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
create or replace function pg_temp.id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;

-- ---------------------------------------------------------------------
-- 1. The Function team creates a community and sets its first admin
-- ---------------------------------------------------------------------
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.error_of($q$select public.admin_create_community('Mine', 'mine-now')$q$) like 'Only the Function team%', 'a student can''t create a community');
select pg_temp.expect(pg_temp.error_of($q$select public.admin_list_communities()$q$) is null and (select count(*) from public.admin_list_communities()) = 0, 'a student sees no communities in the admin list');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($q$select public.admin_create_community('Mine', 'mine-now')$q$), 'a logged-out visitor can''t create a community');

select pg_temp.as_person('ada');
select pg_temp.expect(pg_temp.error_of($q$select public.admin_create_community('Bad', 'Bad Slug')$q$) like 'The web address%', 'a bad web address is refused');
select pg_temp.expect(pg_temp.error_of($q$select public.admin_create_community('Dup', 'ucl-abacus')$q$) = 'That web address is taken', 'a taken web address is refused');
insert into ids values ('c', public.admin_create_community('Test Community', 'test-comm', null, 'Our bio'));
insert into ids values ('other', public.admin_create_community('Other Community', 'other-comm'));
insert into ids select 'main', g.id from public.community_groups g where g.community_id = pg_temp.id('c') and g.kind = 'main';
insert into ids select 'main_chat', t.id from public.threads t where t.community_group_id = pg_temp.id('main');
insert into ids select 'other_chat', t.id from public.threads t join public.community_groups g on g.id = t.community_group_id where g.community_id = pg_temp.id('other');
select pg_temp.expect(pg_temp.id('main') is not null and pg_temp.id('main_chat') is not null, 'a new community gets its main group and its chat');
select pg_temp.expect((select kind from public.threads where id = pg_temp.id('main_chat')) = 'community', 'its chat is a community chat (threads.kind)');
select pg_temp.expect((select count(*) from public.admin_list_communities()) = 3, 'the Function team sees every community');

select pg_temp.expect(pg_temp.error_of($q$select public.admin_set_community_admin(pg_temp.id('c'), pg_temp.u('sam'))$q$) is null, 'the Function team makes Sam the first admin');
select pg_temp.expect(pg_temp.error_of($q$select public.admin_set_community_admin(pg_temp.id('other'), pg_temp.u('jo'))$q$) is null, 'and Jo the admin of the other community');
select pg_temp.as_server();
select pg_temp.expect((select status || ':' || role || ':' || nickname from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('sam')) = 'active:admin:Sammy', 'Sam is an active admin, nicknamed from his profile nickname');
select pg_temp.expect(exists (select 1 from public.thread_participants where thread_id = pg_temp.id('main_chat') and user_id = pg_temp.u('sam')), 'Sam is in the main chat');
select pg_temp.expect(exists (select 1 from public.thread_reads where thread_id = pg_temp.id('main_chat') and user_id = pg_temp.u('sam')), 'and starts with nothing unread');
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.error_of($q$select public.admin_set_community_admin(pg_temp.id('c'), pg_temp.u('bea'))$q$) like 'Only the Function team%', 'a community admin can''t use the Function team''s function');

-- ---------------------------------------------------------------------
-- 2. Joining
-- ---------------------------------------------------------------------
select pg_temp.act_as(null);
select pg_temp.expect((select name from public.community_public('test-comm')) = 'Test Community', 'a logged-out visitor sees the public card');
select pg_temp.expect((select count(*) from public.community_public('nope')) = 0, 'an unknown community has no card');
select pg_temp.expect(pg_temp.fails($q$select public.request_to_join('test-comm', 'Anon', false)$q$), 'a logged-out visitor can''t ask to join');

select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('no-such', 'Bea', false)$q$) = 'Community not found', 'an unknown community');
select pg_temp.expect(public.request_to_join('test-comm', '  Bea  ', false) = 'pending', 'Bea asks to join: pending');
select pg_temp.expect((select nickname from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('bea')) = 'Bea', 'her nickname is trimmed');
select pg_temp.as_person('cas');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'BEA', true)$q$) = 'That nickname is taken in this community. Try another', 'nicknames are unique ignoring case');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'sammy', true)$q$) like 'That nickname is taken%', 'an admin''s nickname is taken too');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'Admin', true)$q$) = 'That nickname is reserved. Choose another', '"Admin" is reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', ' c.o.m.m.i.t.t.e.e ', true)$q$) like '%reserved%', '"Committee" with dots is reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'MEMBER!!', true)$q$) like '%reserved%', '"Member" is reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'Mod-erator 1', true)$q$) like '%reserved%', '"Moderator" is reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'function', true)$q$) like '%reserved%', '"Function" is reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', '   ', true)$q$) = 'Choose a nickname', 'an empty nickname');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', repeat('x', 31), true)$q$) = 'Nicknames can be up to 30 characters', 'a nickname over 30 characters');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'Ca' || chr(7) || 's', true)$q$) like '%control characters', 'a control character');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'Ca' || chr(8203) || 's', true)$q$) like '%hidden%', 'an invisible character');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', U&'Sam\00AD', true)$q$) like '%hidden%', 'a soft hyphen');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', U&'Sam\2066', true)$q$) like '%hidden%', 'a direction isolate');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', U&'\3164', true)$q$) like '%hidden%', 'the Hangul filler (which shows as blank)');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', U&'\0410dmin', true)$q$) = 'That nickname is reserved. Choose another', '"Admin" with a Cyrillic A is reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'ＡＤＭＩＮ', true)$q$) like '%reserved%', 'fullwidth "ADMIN" is reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'Function Team', true)$q$) like '%reserved%', 'a reserved word inside the nickname: "Function Team"');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'Committee Member', true)$q$) like '%reserved%', '"Committee Member"');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', U&'\0405ammy', true)$q$) like 'That nickname is taken%', '"Sammy" with a Cyrillic S is taken (Sam is Sammy)');
select pg_temp.expect(public.request_to_join('test-comm', 'Cas', true) = 'pending', 'Cas asks to join, claiming to be a paying member');
select pg_temp.as_person('dee');
select pg_temp.expect(public.request_to_join('test-comm', U&'\00A0\FF24\FF45\FF45\3000', false, pg_temp.u('sam')) = 'pending', 'Dee asks to join through Sam''s link');
select pg_temp.as_person('eve');
select public.request_to_join('test-comm', 'Eve', true, pg_temp.u('gus'));
select pg_temp.expect(public.request_to_join('test-comm', 'Evie', false) = 'pending', 'asking again while pending updates the request');
select pg_temp.as_server();
select pg_temp.expect((select nickname || ':' || membership_claimed from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('eve')) = 'Evie:false', 'Eve''s nickname and claim were updated');
select pg_temp.expect((select nickname from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('dee')) = 'Dee', 'Dee''s fullwidth nickname is stored as plain letters, trimmed of Unicode spaces');
select pg_temp.expect((select referred_by from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('dee')) = pg_temp.u('sam'), 'who shared the link is kept when they''re in the community');
select pg_temp.expect((select referred_by from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('eve')) is null, 'but not when they aren''t');
select pg_temp.expect(not exists (select 1 from public.thread_participants where thread_id = pg_temp.id('main_chat') and user_id in (pg_temp.u('bea'), pg_temp.u('cas'))), 'people waiting aren''t in the chat');
select pg_temp.as_person('fin'); select public.request_to_join('test-comm', 'Fin', false);
select pg_temp.as_person('hal'); select public.request_to_join('test-comm', 'Hal', false);
select pg_temp.as_person('ivy'); select public.request_to_join('test-comm', 'Ivy', false);
select pg_temp.as_person('kit'); select public.request_to_join('test-comm', 'Kit', true);
select pg_temp.as_person('lu');  select public.request_to_join('test-comm', 'Lu', false);
select pg_temp.as_person('mo');  select public.request_to_join('test-comm', 'Mo', false);

-- ---------------------------------------------------------------------
-- 3. Approvals
-- ---------------------------------------------------------------------
select pg_temp.as_person('gus');
select pg_temp.expect(pg_temp.error_of($q$select public.approve_request(pg_temp.id('c'), pg_temp.u('bea'), false)$q$) like 'Only the community''s admins and committee%', 'an outsider can''t approve');
select pg_temp.as_person('eve');
select pg_temp.expect(pg_temp.error_of($q$select public.approve_request(pg_temp.id('c'), pg_temp.u('bea'), false)$q$) like 'Only the community''s admins and committee%', 'someone waiting can''t approve');
select pg_temp.as_person('jo');
select pg_temp.expect(pg_temp.error_of($q$select public.approve_request(pg_temp.id('c'), pg_temp.u('bea'), false)$q$) like 'Only the community''s admins and committee%', 'another community''s admin can''t approve here');
select pg_temp.as_person('sam');
select public.approve_request(pg_temp.id('c'), pg_temp.u('bea'), false);
select public.set_community_role(pg_temp.id('c'), pg_temp.u('bea'), 'committee');
select pg_temp.expect(pg_temp.error_of($q$select public.approve_request(pg_temp.id('c'), pg_temp.u('bea'), false)$q$) = 'That request isn''t waiting any more', 'a request can only be approved once');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.approve_request(pg_temp.id('c'), pg_temp.u('cas'), true)$q$) = 'Only admins can approve someone as a paying member', 'committee can''t approve as a paying member');
select pg_temp.expect(pg_temp.error_of($q$select public.approve_request(pg_temp.id('c'), pg_temp.u('dee'), false)$q$) is null, 'committee approves Dee as a non-member');
select pg_temp.as_person('sam');
select public.approve_request(pg_temp.id('c'), pg_temp.u('cas'), true);
select public.approve_request(pg_temp.id('c'), pg_temp.u('fin'), false);
select public.approve_request(pg_temp.id('c'), pg_temp.u('hal'), false);
select public.approve_request(pg_temp.id('c'), pg_temp.u('ivy'), false);
select public.approve_request(pg_temp.id('c'), pg_temp.u('lu'), false);
select public.approve_request(pg_temp.id('c'), pg_temp.u('mo'), false);
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.decline_request(pg_temp.id('c'), pg_temp.u('kit'))$q$) like 'Only the community''s admins and committee%', 'a regular person can''t decline');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.decline_request(pg_temp.id('c'), pg_temp.u('kit'))$q$) is null, 'committee declines Kit');
select pg_temp.as_server();
select pg_temp.expect((select status || ':' || membership from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('dee')) = 'active:non_member', 'Dee is in as a non-member');
select pg_temp.expect((select status || ':' || membership || ':' || (membership_confirmed_by = pg_temp.u('sam')) from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('cas')) = 'active:member:true', 'Cas is in as a paying member, confirmed by Sam');
select pg_temp.expect((select status from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('kit')) = 'declined', 'Kit was declined');
select pg_temp.expect((select count(*) from public.thread_participants where thread_id = pg_temp.id('main_chat'))
  = (select count(*) from public.community_members where community_id = pg_temp.id('c') and status = 'active'), 'everyone active is in the main chat, nobody else');
select pg_temp.expect((select count(*) from public.thread_participants where thread_id = pg_temp.id('main_chat')) = 9, '9 people in the main chat');
select pg_temp.expect(not exists (select 1 from public.thread_participants where thread_id = pg_temp.id('main_chat') and user_id in (pg_temp.u('eve'), pg_temp.u('kit'), pg_temp.u('gus'))), 'pending, declined and outsiders aren''t in it');
select pg_temp.expect((select count(*) from public.thread_reads where thread_id = pg_temp.id('main_chat') and user_id in (select user_id from public.thread_participants where thread_id = pg_temp.id('main_chat'))) = 9, 'everyone approved starts with the chat read');
select pg_temp.as_person('kit');
select pg_temp.expect(public.request_to_join('test-comm', 'Kit', false) = 'pending', 'someone declined can ask again');
select pg_temp.as_person('dee');
select pg_temp.expect(public.request_to_join('test-comm', 'Whatever', false) = 'active', 'asking again when already in changes nothing');
select pg_temp.as_server();
select pg_temp.expect((select nickname from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('dee')) = 'Dee', 'Dee''s nickname is unchanged');

-- ---------------------------------------------------------------------
-- 4. Paying membership: admins only, never your own
-- ---------------------------------------------------------------------
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.confirm_membership(pg_temp.id('c'), pg_temp.u('dee'), true)$q$) = 'Only the community''s admins can do that', 'committee can''t confirm membership');
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.confirm_membership(pg_temp.id('c'), pg_temp.u('dee'), true)$q$) = 'Only the community''s admins can do that', 'a regular person can''t confirm their own');
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.error_of($q$select public.confirm_membership(pg_temp.id('c'), pg_temp.u('sam'), true)$q$) = 'You can''t change your own membership', 'an admin can''t confirm their own membership');
select pg_temp.expect(pg_temp.error_of($q$select public.confirm_membership(pg_temp.id('c'), pg_temp.u('eve'), true)$q$) like 'They''re not an active member%', 'only active members can be confirmed');
select pg_temp.expect(pg_temp.error_of($q$select public.confirm_membership(pg_temp.id('c'), pg_temp.u('ivy'), true)$q$) is null, 'an admin confirms Ivy');
select pg_temp.expect(pg_temp.error_of($q$select public.confirm_membership(pg_temp.id('c'), pg_temp.u('ivy'), false)$q$) is null, 'and can undo it');
select pg_temp.as_person('ada');
select pg_temp.expect(pg_temp.error_of($q$select public.confirm_membership(pg_temp.id('c'), pg_temp.u('sam'), true)$q$) is null, 'the Function team can confirm anyone');
select pg_temp.as_server();
select pg_temp.expect((select membership from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('ivy')) = 'non_member', 'Ivy is a non-member again');
select pg_temp.expect((select membership from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('sam')) = 'member', 'Sam is a paying member');

-- ---------------------------------------------------------------------
-- 5. Roles: admins only, never your own, never the last admin
-- ---------------------------------------------------------------------
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('dee'), 'committee')$q$) = 'Only the community''s admins can do that', 'committee can''t set roles');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('bea'), 'admin')$q$) = 'Only the community''s admins can do that', 'committee can''t promote themselves');
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('dee'), 'admin')$q$) = 'Only the community''s admins can do that', 'a regular person can''t promote themselves');
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('sam'), 'committee')$q$) = 'You can''t change your own role', 'an admin can''t change their own role');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('dee'), 'boss')$q$) like 'Choose admin, committee or regular', 'only real roles');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('eve'), 'committee')$q$) like 'They''re not an active member%', 'only active members get roles');
select public.set_community_role(pg_temp.id('c'), pg_temp.u('hal'), 'admin');
select pg_temp.as_person('hal');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('sam'), 'regular')$q$) is null, 'a second admin can demote the first');
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('hal'), 'regular')$q$) = 'Only the community''s admins can do that', 'once demoted, Sam can''t set roles');
select pg_temp.as_person('ada');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('hal'), 'regular')$q$) = 'A community needs at least one admin. Make someone else an admin first', 'the last admin can''t be demoted, even by the Function team');
select pg_temp.expect(pg_temp.error_of($q$select public.set_community_role(pg_temp.id('c'), pg_temp.u('sam'), 'admin')$q$) is null, 'the Function team can set any role');
select pg_temp.as_server();
select pg_temp.expect((select string_agg(nickname || '=' || role, ',' order by nickname) from public.community_members where community_id = pg_temp.id('c') and role <> 'regular') = 'Bea=committee,Hal=admin,Sammy=admin', 'roles are as set');

-- ---------------------------------------------------------------------
-- 6. Removing people and leaving
-- ---------------------------------------------------------------------
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_community_member(pg_temp.id('c'), pg_temp.u('ivy'))$q$) like 'Only the community''s admins and committee%', 'a regular person can''t remove anyone');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_community_member(pg_temp.id('c'), pg_temp.u('hal'))$q$) = 'Only admins can remove committee members and admins', 'committee can''t remove an admin');
select pg_temp.as_person('sam');
select public.set_community_role(pg_temp.id('c'), pg_temp.u('lu'), 'committee');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_community_member(pg_temp.id('c'), pg_temp.u('lu'))$q$) = 'Only admins can remove committee members and admins', 'committee can''t remove other committee');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_community_member(pg_temp.id('c'), pg_temp.u('bea'))$q$) = 'To leave, use Leave community', 'nobody removes themselves');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_community_member(pg_temp.id('c'), pg_temp.u('gus'))$q$) = 'They''re not in this community', 'an outsider can''t be removed');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_community_member(pg_temp.id('c'), pg_temp.u('fin'))$q$) is null, 'committee removes a regular person (Fin)');
select pg_temp.as_person('sam');
select public.set_community_role(pg_temp.id('c'), pg_temp.u('lu'), 'regular');
select pg_temp.as_person('fin');
select pg_temp.expect(pg_temp.error_of($q$select public.request_to_join('test-comm', 'Fin again', false)$q$) = 'You can''t rejoin this community', 'someone removed can''t rejoin through the link');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_community(pg_temp.id('c'))$q$) = 'You''re not in this community', 'or leave again');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.thread_participants where user_id = pg_temp.u('fin')), 'Fin is out of every chat');
select pg_temp.expect((select status from public.community_members where community_id = pg_temp.id('c') and user_id = pg_temp.u('fin')) = 'removed', 'Fin is removed');

-- The last admin can't leave or be removed. (Hal and Sam are admins.)
select pg_temp.as_person('sam');
select public.set_community_role(pg_temp.id('c'), pg_temp.u('hal'), 'regular');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_community(pg_temp.id('c'))$q$) = 'You''re the only admin. Make someone else an admin before you leave', 'the last admin can''t leave');
select pg_temp.as_person('ada');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_community_member(pg_temp.id('c'), pg_temp.u('sam'))$q$) = 'A community needs at least one admin. Make someone else an admin first', 'the last admin can''t be removed, even by the Function team');
select public.set_community_role(pg_temp.id('c'), pg_temp.u('hal'), 'admin');
-- Leaving, and coming back.
select pg_temp.as_person('mo');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_community(pg_temp.id('c'))$q$) is null, 'Mo leaves');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.thread_participants where user_id = pg_temp.u('mo')), 'Mo is out of the chats');
select pg_temp.as_person('mo');
select pg_temp.expect(public.request_to_join('test-comm', 'Mo', false) = 'pending', 'someone who left can ask again');
select pg_temp.as_person('sam');
select public.approve_request(pg_temp.id('c'), pg_temp.u('mo'), false);
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.thread_participants where thread_id = pg_temp.id('main_chat') and user_id = pg_temp.u('mo')), 'and is back in the chat once approved');

-- Nicknames the Function team gives: the profile nickname, else the first name
-- (a reserved profile nickname such as Hal's "Admin" is skipped).
select pg_temp.as_person('ada');
select public.admin_set_community_admin(pg_temp.id('other'), pg_temp.u('hal'));
select pg_temp.as_server();
select pg_temp.expect((select nickname from public.community_members where community_id = pg_temp.id('other') and user_id = pg_temp.u('jo')) = 'Jo', 'Jo (no profile nickname) is nicknamed from her first name');
select pg_temp.expect((select nickname from public.community_members where community_id = pg_temp.id('other') and user_id = pg_temp.u('hal')) = 'Hal', 'Hal''s reserved profile nickname is skipped for his first name');

-- ---------------------------------------------------------------------
-- 7. Sub-groups
-- ---------------------------------------------------------------------
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.create_community_group(pg_temp.id('c'), 'Dee''s group', '')$q$) like 'Only the community''s admins and committee%', 'a regular person can''t create a group');
select pg_temp.as_person('jo');
select pg_temp.expect(pg_temp.error_of($q$select public.create_community_group(pg_temp.id('c'), 'Raid', '')$q$) like 'Only the community''s admins and committee%', 'another community''s admin can''t create a group here');
select pg_temp.as_person('bea');
insert into ids values ('poker', public.create_community_group(pg_temp.id('c'), 'Poker', 'Cards on Fridays'));
select pg_temp.expect(pg_temp.error_of($q$select public.create_community_group(pg_temp.id('c'), 'poker', '')$q$) = 'There''s already a group called that', 'group names are unique');
select pg_temp.expect(pg_temp.error_of($q$select public.create_community_group(pg_temp.id('c'), '  ', '')$q$) like 'Group names must be%', 'a group needs a name');
select pg_temp.as_server();
insert into ids select 'poker_chat', t.id from public.threads t where t.community_group_id = pg_temp.id('poker');
select pg_temp.expect(pg_temp.id('poker_chat') is not null, 'the new group has its chat');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.add_group_member(pg_temp.id('poker'), pg_temp.u('eve'))$q$) like 'They''re not an active member%', 'someone waiting can''t be added to a group');
select pg_temp.expect(pg_temp.error_of($q$select public.add_group_member(pg_temp.id('poker'), pg_temp.u('gus'))$q$) like 'They''re not an active member%', 'an outsider can''t be added');
select pg_temp.expect(pg_temp.error_of($q$select public.add_group_member(pg_temp.id('poker'), pg_temp.u('jo'))$q$) like 'They''re not an active member%', 'someone from another community can''t be added');
select pg_temp.expect(pg_temp.error_of($q$select public.add_group_member(pg_temp.id('main'), pg_temp.u('dee'))$q$) like 'That can''t be done to the main group', 'the main group has no member list to change');
select public.add_group_member(pg_temp.id('poker'), pg_temp.u('cas'));
select public.add_group_member(pg_temp.id('poker'), pg_temp.u('dee'));
select public.add_group_member(pg_temp.id('poker'), pg_temp.u('ivy'));
select public.add_group_member(pg_temp.id('poker'), pg_temp.u('bea'));
select public.add_group_member(pg_temp.id('poker'), pg_temp.u('bea'));
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.add_group_member(pg_temp.id('poker'), pg_temp.u('lu'))$q$) like 'Only the community''s admins and committee%', 'a regular person can''t add people');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_group_member(pg_temp.id('poker'), pg_temp.u('cas'))$q$) like 'Only the community''s admins and committee%', 'or remove them');
select pg_temp.expect(pg_temp.error_of($q$select public.rename_community_group(pg_temp.id('poker'), 'Dee''s now')$q$) like 'Only the community''s admins and committee%', 'or rename the group');
select pg_temp.expect(pg_temp.error_of($q$select public.archive_community_group(pg_temp.id('poker'))$q$) like 'Only the community''s admins and committee%', 'or archive it');
select pg_temp.as_server();
select pg_temp.expect((select string_agg(p.name, ',' order by p.name) from public.thread_participants tp join people p on p.id = tp.user_id where tp.thread_id = pg_temp.id('poker_chat')) = 'bea,cas,dee,ivy', 'the group''s chat has exactly its members');
select pg_temp.expect((select string_agg(kind || ':' || body, ',' order by kind, body) from public.messages where thread_id = pg_temp.id('poker_chat'))
  = 'added:added Cas,added:added Dee,added:added Ivy,joined:joined the group', 'the chat shows who was added and that Bea joined (once)');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.pin_message((select id from public.messages where thread_id = pg_temp.id('poker_chat') and kind = 'joined' limit 1))$q$) = 'That can''t be pinned', 'a "joined" note can''t be pinned');
select pg_temp.expect(pg_temp.error_of($q$select public.pin_message((select id from public.messages where thread_id = pg_temp.id('poker_chat') and kind = 'added' limit 1))$q$) = 'That can''t be pinned', 'nor an "added" note');
select pg_temp.as_server();
select pg_temp.expect((select last_read_at > now() - interval '1 minute' from public.thread_reads where thread_id = pg_temp.id('poker_chat') and user_id = pg_temp.u('cas')), 'someone added starts with the group read');

-- Who sees which groups.
select pg_temp.as_person('sam');
select pg_temp.expect((select string_agg((g->>'name') || ':' || (g->>'joined'), ',' order by g->>'kind', g->>'name') from jsonb_array_elements(public.community_home('test-comm')->'groups') g) = 'Test Community:true,Poker:false', 'an admin sees every group (Poker, not joined)');
select pg_temp.expect((select count(*) from public.group_members(pg_temp.id('poker'))) = 4, 'and who''s in it');
select pg_temp.expect((select count(*) from public.community_groups where community_id = pg_temp.id('c')) = 2, 'an admin can read every group of the community');
select pg_temp.expect((select count(*) from public.community_group_members where group_id = pg_temp.id('poker')) = 4, 'and its member rows');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('poker_chat')) = 0, 'but can''t read the group''s messages without being in it');
select pg_temp.expect(pg_temp.error_of($q$select public.send_message(pg_temp.id('poker_chat'), 'hi')$q$) = 'You can''t send messages here', 'or post in it');
select pg_temp.as_person('lu');
select pg_temp.expect((select string_agg(g->>'name', ',') from jsonb_array_elements(public.community_home('test-comm')->'groups') g) = 'Test Community', 'someone not in a sub-group only sees the main group');
select pg_temp.expect((select count(*) from public.group_members(pg_temp.id('poker'))) = 0, 'and not who''s in it');
select pg_temp.expect((select count(*) from public.community_groups where community_id = pg_temp.id('c')) = 1, 'nor its row');
select pg_temp.expect((select count(*) from public.community_group_members where group_id = pg_temp.id('poker')) = 0, 'nor its member rows');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('poker_chat')) = 0, 'nor its messages');
select pg_temp.as_person('dee');
select pg_temp.expect((select string_agg((g->>'name') || ':' || (g->>'joined'), ',' order by g->>'kind', g->>'name') from jsonb_array_elements(public.community_home('test-comm')->'groups') g) = 'Test Community:true,Poker:true', 'a group member sees the groups they''re in');
select pg_temp.expect((select count(*) from public.group_members(pg_temp.id('poker'))) = 4, 'and who''s in them');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('poker_chat')) = 4, 'and the group''s messages');
select pg_temp.as_person('gus');
select pg_temp.expect(public.community_home('test-comm')->'me' = 'null'::jsonb and jsonb_array_length(public.community_home('test-comm')->'groups') = 0, 'an outsider sees the community but no groups');
select pg_temp.expect((select count(*) from public.community_groups where community_id = pg_temp.id('c')) = 0, 'and no group rows');
select pg_temp.as_person('eve');
select pg_temp.expect(public.community_home('test-comm')->'me'->>'status' = 'pending' and jsonb_array_length(public.community_home('test-comm')->'groups') = 0, 'someone waiting sees their request but no groups');
select pg_temp.as_person('ada');
select pg_temp.expect(jsonb_array_length(public.community_home('test-comm')->'groups') = 2, 'the Function team sees every group');

-- Leaving and being taken out of a sub-group.
select pg_temp.as_person('bea');
select public.remove_group_member(pg_temp.id('poker'), pg_temp.u('dee'));
select pg_temp.as_person('dee');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('poker_chat')) = 0, 'once taken out of a group, Dee can''t read it');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_thread(pg_temp.id('main_chat'))$q$) = 'To leave this chat, leave the community instead', 'the main chat is left by leaving the community');
select pg_temp.expect(pg_temp.error_of($q$select public.rejoin_thread(pg_temp.id('poker_chat'))$q$) like 'Community chats are joined through the community%', 'nobody rejoins a community group by themselves');
select pg_temp.as_person('ivy');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_thread(pg_temp.id('poker_chat'))$q$) is null, 'Ivy leaves the Poker group');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_thread(pg_temp.id('poker_chat'))$q$) = 'Chat not found', 'and is no longer in it');
select pg_temp.as_server();
select pg_temp.expect((select string_agg(p.name, ',' order by p.name) from public.thread_participants tp join people p on p.id = tp.user_id where tp.thread_id = pg_temp.id('poker_chat')) = 'bea,cas', 'the group''s chat follows its members');
select pg_temp.expect((select string_agg(kind || ':' || body || ':' || (sender_id = pg_temp.u(case when kind = 'left' then 'ivy' else 'bea' end)), ',' order by kind) from public.messages where thread_id = pg_temp.id('poker_chat') and kind in ('left', 'removed'))
  = 'left:left the group:true,removed:removed Dee from the group:true', 'the chat shows who was removed (by Bea) and who left (Ivy)');

-- ---------------------------------------------------------------------
-- 8. Reading and writing in community chats, for every kind of person
-- ---------------------------------------------------------------------
select pg_temp.as_person('cas');
insert into ids values ('cas_main', public.send_message(pg_temp.id('main_chat'), 'Hello everyone'));
insert into ids values ('cas_poker', public.send_message(pg_temp.id('poker_chat'), 'Cards at 7'));
select pg_temp.as_person('dee');
insert into ids values ('dee_main', public.send_message(pg_temp.id('main_chat'), 'Hi from Dee'));
select pg_temp.as_person('sam');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('main_chat')) = 2, 'an admin reads the main chat');
select pg_temp.as_person('bea');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('main_chat')) = 2, 'committee reads the main chat');
select pg_temp.expect(pg_temp.error_of($q$select public.send_message(pg_temp.id('main_chat'), 'From committee')$q$) is null, 'and posts in it');
select pg_temp.as_person('lu');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('main_chat')) = 3, 'a regular person reads the main chat');
select pg_temp.expect(pg_temp.error_of($q$select public.send_message(pg_temp.id('main_chat'), 'From Lu')$q$) is null, 'and posts in it');
select pg_temp.expect((select count(*) from public.threads where id = pg_temp.id('main_chat')) = 1, 'and can see the chat itself');
select pg_temp.expect(pg_temp.fails($q$insert into public.messages (thread_id, sender_id, body) values (pg_temp.id('main_chat'), pg_temp.u('lu'), 'direct')$q$), 'messages can''t be inserted directly (send_message does it)');
create temp table outsiders (name text);
grant all on outsiders to anon, authenticated;
insert into outsiders values ('eve'), ('fin'), ('gus'), ('kit'), ('jo');
do $$
declare
  n text;
begin
  for n in select name from outsiders loop
    perform pg_temp.as_person(n);
    perform pg_temp.expect((select count(*) from public.messages where thread_id in (pg_temp.id('main_chat'), pg_temp.id('poker_chat'))) = 0, n || ' (not an active member) can''t read the community''s messages');
    perform pg_temp.expect((select count(*) from public.threads where id in (pg_temp.id('main_chat'), pg_temp.id('poker_chat'))) = 0, n || ' can''t see its chats');
    perform pg_temp.expect(pg_temp.error_of($q$select public.send_message(pg_temp.id('main_chat'), 'let me in')$q$) = 'You can''t send messages here', n || ' can''t post in the main chat');
    perform pg_temp.expect(not public.can_use_thread(pg_temp.id('main_chat')) and not public.thread_member(pg_temp.id('main_chat')), n || ' isn''t in the chat');
    perform pg_temp.expect(not exists (select 1 from public.my_chat_list() where id = pg_temp.id('main_chat')), n || ' doesn''t have it in their chat list');
    perform pg_temp.expect((select count(*) from public.thread_members(pg_temp.id('main_chat'))) = 0 and (select count(*) from public.thread_member_roles(pg_temp.id('main_chat'))) = 0, n || ' can''t list who''s in it');
    perform pg_temp.expect((select count(*) from public.community_roster(pg_temp.id('c'))) = 0, n || ' can''t read the roster');
    perform pg_temp.expect((select count(*) from public.community_requests(pg_temp.id('c'))) = 0, n || ' can''t read the requests');
  end loop;
end $$;
select pg_temp.act_as(null);
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('main_chat')) = 0, 'a logged-out visitor reads nothing');
select pg_temp.as_person('ada');
select pg_temp.expect((select count(*) from public.messages where thread_id in (pg_temp.id('main_chat'), pg_temp.id('poker_chat'))) = 11, 'the Function team can read community chats (for reports)');
select pg_temp.expect(not exists (select 1 from public.my_chat_list() where id = pg_temp.id('main_chat')), 'but they aren''t in the Function team''s own chat list');

-- ---------------------------------------------------------------------
-- 9. Nobody writes to the community tables directly
-- ---------------------------------------------------------------------
create temp table attempts (who text, statement text);
grant all on attempts to anon, authenticated;
insert into attempts
select w.who, s.statement from (values ('sam'), ('bea'), ('dee'), ('gus'), ('ada'), (null)) w (who)
cross join (values
  ($q$insert into public.communities (slug, name) values ('sneaky', 'Sneaky')$q$),
  ($q$update public.communities set name = 'Hacked' where id = pg_temp.id('c')$q$),
  ($q$delete from public.communities where id = pg_temp.id('c')$q$),
  ($q$insert into public.community_members (community_id, user_id, nickname, status, role) values (pg_temp.id('c'), pg_temp.u('gus'), 'Gus', 'active', 'admin')$q$),
  ($q$update public.community_members set role = 'admin' where community_id = pg_temp.id('c')$q$),
  ($q$delete from public.community_members where community_id = pg_temp.id('c')$q$),
  ($q$insert into public.community_groups (community_id, name) values (pg_temp.id('c'), 'Sneaky')$q$),
  ($q$update public.community_groups set archived_at = now() where community_id = pg_temp.id('c')$q$),
  ($q$insert into public.community_group_members (group_id, user_id) values (pg_temp.id('poker'), pg_temp.u('gus'))$q$),
  ($q$delete from public.community_group_members where group_id = pg_temp.id('poker')$q$),
  ($q$insert into public.thread_participants (thread_id, user_id) values (pg_temp.id('poker_chat'), pg_temp.u('gus'))$q$),
  ($q$delete from public.thread_participants where thread_id = pg_temp.id('main_chat')$q$),
  ($q$insert into public.thread_mutes (thread_id, user_id) values (pg_temp.id('main_chat'), pg_temp.u('gus'))$q$),
  ($q$update public.thread_mutes set muted_until = null$q$),
  ($q$insert into public.threads (community_group_id) values (pg_temp.id('poker'))$q$),
  ($q$update public.threads set community_group_id = null where id = pg_temp.id('main_chat')$q$),
  ($q$truncate public.thread_participants$q$)
) s (statement);
do $$
declare
  a record;
begin
  for a in select * from attempts loop
    perform pg_temp.act_as((select id::text from people where name = a.who));
    -- (Updating threads isn't a permission error: no rule lets anyone update
    -- a chat, so it changes nothing, which is checked below.)
    perform pg_temp.expect(pg_temp.fails(a.statement) or a.statement like 'update public.threads%',
                           'refused for ' || coalesce(a.who, 'anon') || ': ' || a.statement);
  end loop;
end $$;
select pg_temp.as_server();
select pg_temp.expect((select name from public.communities where id = pg_temp.id('c')) = 'Test Community', 'no direct update changed the community');
select pg_temp.expect((select count(*) from public.community_members where community_id = pg_temp.id('c')) = 11, 'no direct write changed the members');
select pg_temp.expect((select count(*) from public.community_members where community_id = pg_temp.id('c') and role = 'admin') = 2, 'nobody made themselves an admin');
select pg_temp.expect((select count(*) from public.thread_participants where thread_id = pg_temp.id('main_chat')) = 8, 'no direct write changed who''s in the chat (8 active)');
select pg_temp.expect(not exists (select 1 from public.community_groups where archived_at is not null), 'no direct write archived a group');
select pg_temp.expect((select community_group_id from public.threads where id = pg_temp.id('main_chat')) = pg_temp.id('main'), 'no direct write moved the chat');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.community_members', 'insert') and not has_table_privilege('authenticated', 'public.community_members', 'update')
  and not has_table_privilege('authenticated', 'public.community_members', 'delete') and not has_table_privilege('anon', 'public.community_members', 'select')
  and not has_table_privilege('anon', 'public.communities', 'select') and not has_table_privilege('authenticated', 'public.thread_participants', 'truncate'),
  'the default grants were taken back');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($q$select * from public.communities$q$) and pg_temp.fails($q$select * from public.community_members$q$)
  and pg_temp.fails($q$select * from public.thread_participants$q$), 'logged-out visitors can''t read the tables at all');

-- ---------------------------------------------------------------------
-- 10. Read rules on the tables
-- ---------------------------------------------------------------------
select pg_temp.as_person('dee');
select pg_temp.expect((select count(*) from public.communities where id in (pg_temp.id('c'), pg_temp.id('other'))) = 2, 'every logged-in person can read communities (for the join screen)');
select pg_temp.expect((select count(*) from public.community_members) = 1, 'a regular person reads only their own member row');
select pg_temp.expect((select count(*) from public.thread_participants) = (select count(*) from public.thread_participants where user_id = pg_temp.u('dee')), 'and only their own chat places');
select pg_temp.as_person('gus');
select pg_temp.expect((select count(*) from public.community_members) = 0, 'an outsider reads no member rows');
select pg_temp.as_person('bea');
select pg_temp.expect((select count(*) from public.community_members where community_id = pg_temp.id('c')) = 11, 'committee reads every member row of their community');
select pg_temp.expect((select count(*) from public.community_members where community_id = pg_temp.id('other')) = 0, 'but none of another community');
select pg_temp.as_person('ada');
select pg_temp.expect((select count(*) from public.community_members where community_id in (pg_temp.id('c'), pg_temp.id('other'))) = 13, 'the Function team reads every member row');

-- ---------------------------------------------------------------------
-- 11. What the read functions return, and never an email
-- ---------------------------------------------------------------------
select pg_temp.as_person('dee');
select pg_temp.expect((select string_agg(nickname || ':' || role || ':' || membership, ',' order by nickname) from public.community_roster(pg_temp.id('c')))
  = 'Bea:committee:non_member,Cas:regular:member,Dee:regular:non_member,Hal:admin:non_member,Ivy:regular:non_member,Lu:regular:non_member,Mo:regular:non_member,Sammy:admin:member',
  'members read the roster: nicknames, roles and membership of everyone active');
select pg_temp.expect(pg_get_function_result('public.community_roster(uuid)'::regprocedure) not like '%claimed%'
  and pg_get_function_result('public.community_roster(uuid)'::regprocedure) not like '%email%', 'the roster never includes the paying-member claim or an email');
select pg_temp.expect((select count(*) from public.community_requests(pg_temp.id('c'))) = 0, 'a regular person can''t read the requests');
select pg_temp.expect((select string_agg(name || ':' || status || ':' || role, ',' order by name) from public.my_communities()) = 'Test Community:active:regular', 'my communities');
select pg_temp.expect((select main_thread_id from public.my_communities()) = pg_temp.id('main_chat'), 'with the main chat');
select pg_temp.as_person('eve');
select pg_temp.expect((select status || ':' || coalesce(main_thread_id::text, 'none') from public.my_communities()) = 'pending:none', 'someone waiting sees their request, without the chat');
select pg_temp.as_person('bea');
select pg_temp.expect((select string_agg(nickname || ':' || membership_claimed || ':' || coalesce(referred_by_nickname, '-'), ',' order by nickname) from public.community_requests(pg_temp.id('c')))
  = 'Evie:false:-,Kit:false:-', 'committee reads the requests waiting (with the paying-member claim)');
select pg_temp.expect((public.community_home('test-comm')->>'pending_requests')::int = 2, 'and how many are waiting');
select pg_temp.as_person('dee');
select pg_temp.expect(public.community_home('test-comm')->'pending_requests' = 'null'::jsonb, 'a regular person isn''t told how many are waiting');
select pg_temp.expect(public.community_home('test-comm')->'me' = jsonb_build_object('status', 'active', 'role', 'regular', 'membership', 'non_member', 'nickname', 'Dee', 'membership_claimed', false), 'the community page shows your own place in it');
select pg_temp.expect(public.community_home('test-comm')->'role_colours'->'committee' = '{"light": "#7A1010", "dark": "#FF5A5A"}'::jsonb, 'and the role colours');

-- No email anywhere, for anyone (the fixtures' emails all contain "@").
create temp table outputs (who text, what text, output text);
grant all on outputs to anon, authenticated;
do $$
declare
  n text;
begin
  for n in select name from people where name in ('sam', 'bea', 'cas', 'dee', 'eve', 'gus', 'ada') loop
    perform pg_temp.as_person(n);
    insert into outputs select n, 'home', public.community_home('test-comm')::text;
    insert into outputs select n, 'public', (select string_agg(x::text, ',') from public.community_public('test-comm') x);
    insert into outputs select n, 'mine', (select string_agg(x::text, ',') from public.my_communities() x);
    insert into outputs select n, 'roster', (select string_agg(x::text, ',') from public.community_roster(pg_temp.id('c')) x);
    insert into outputs select n, 'requests', (select string_agg(x::text, ',') from public.community_requests(pg_temp.id('c')) x);
    insert into outputs select n, 'group', (select string_agg(x::text, ',') from public.group_members(pg_temp.id('poker')) x);
    insert into outputs select n, 'main group', (select string_agg(x::text, ',') from public.group_members(pg_temp.id('main')) x);
    insert into outputs select n, 'members', (select string_agg(x::text, ',') from public.thread_members(pg_temp.id('main_chat')) x);
    insert into outputs select n, 'roles', (select string_agg(x::text, ',') from public.thread_member_roles(pg_temp.id('main_chat')) x);
    insert into outputs select n, 'chats', (select string_agg(x::text, ',') from public.my_chat_list() x);
    insert into outputs select n, 'admin list', (select string_agg(x::text, ',') from public.admin_list_communities() x);
  end loop;
end $$;
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from outputs where output like '%@%'), 'no community function ever returns an email');
select pg_temp.expect((select count(*) from outputs where output is not null) > 40, '(and they did return things)');

-- ---------------------------------------------------------------------
-- 12. Live updates (Realtime broadcast from the database)
-- ---------------------------------------------------------------------
delete from realtime.messages;
select pg_temp.as_person('cas');
insert into ids values ('live_msg', public.send_message(pg_temp.id('main_chat'), 'Live!'));
select pg_temp.as_server();
select pg_temp.expect((select count(*) from realtime.messages) = 1, 'a new message makes exactly one broadcast');
select pg_temp.expect((select topic from realtime.messages) = 'thread:' || pg_temp.id('main_chat'), 'to the chat''s topic');
select pg_temp.expect((select payload from realtime.messages) = jsonb_build_object('id', pg_temp.id('live_msg'), 'op', 'insert'), 'with only the message id and "insert" (no text, no sender)');
select pg_temp.expect((select event = 'message' and private and extension = 'broadcast' from realtime.messages), 'as a private "message" broadcast');
select pg_temp.as_person('cas');
select public.delete_message(pg_temp.id('live_msg'));
select pg_temp.as_server();
select pg_temp.expect((select count(*) from realtime.messages where payload = jsonb_build_object('id', pg_temp.id('live_msg'), 'op', 'delete')) = 1, 'deleting it makes one "delete" broadcast');
update public.messages set body = body where id = pg_temp.id('cas_main');
select pg_temp.expect((select count(*) from realtime.messages) = 2, 'other changes make none');

-- Who may listen.
select set_config('realtime.topic', 'thread:' || pg_temp.id('main_chat'), false);
select pg_temp.as_person('dee');
select pg_temp.expect((select count(*) from realtime.messages) = 2, 'someone in the chat can listen to it');
do $$
declare
  n text;
begin
  for n in select name from people where name in ('eve', 'fin', 'gus', 'kit', 'jo', 'ada') loop
    perform pg_temp.as_person(n);
    perform pg_temp.expect((select count(*) from realtime.messages) = 0, n || ' (not in the chat) can''t listen to it');
  end loop;
end $$;
select pg_temp.act_as(null);
select pg_temp.expect((select count(*) from realtime.messages) = 0, 'a logged-out visitor can''t listen');
select set_config('realtime.topic', 'thread:not-a-chat', false);
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select count(*) from realtime.messages$q$) is null and (select count(*) from realtime.messages) = 0, 'a malformed topic is refused, not an error');
select set_config('realtime.topic', 'thread:' || pg_temp.id('poker_chat'), false);
select pg_temp.expect((select count(*) from realtime.messages) = 0, 'Dee (taken out of Poker) can''t listen to its chat');
select pg_temp.as_person('sam');
select pg_temp.expect((select count(*) from realtime.messages) = 0, 'nor can an admin who isn''t in it');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$insert into realtime.messages (topic, extension, payload, event, private) values ('thread:x', 'broadcast', '{}', 'message', true)$q$) like '%row-level security%', 'nobody can broadcast from the app');
select pg_temp.as_server();
-- Every kind of chat gets live updates, and a Realtime failure never stops a message.
insert into public.friendships (requester_id, addressee_id, status) values (pg_temp.u('sam'), pg_temp.u('bea'), 'accepted') on conflict do nothing;
insert into public.threads (user_a, user_b) values (pg_temp.u('sam'), pg_temp.u('bea')) on conflict do nothing;
insert into ids select 'dm', id from public.threads where user_a = pg_temp.u('sam') and user_b = pg_temp.u('bea');
delete from realtime.messages;
select pg_temp.as_person('sam');
insert into ids values ('dm_msg', public.send_message(pg_temp.id('dm'), 'Hi Bea'));
select pg_temp.as_server();
select pg_temp.expect((select topic from realtime.messages) = 'thread:' || pg_temp.id('dm'), 'private chats get live updates too');
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $$ begin raise exception 'realtime is down'; end $$;
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.error_of($q$select public.send_message(pg_temp.id('dm'), 'Still works')$q$) is null, 'a Realtime failure never stops a message being sent');
select pg_temp.as_server();
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.messages (topic, extension, payload, event, private) values ($3, 'broadcast', $1, $2, $4) $$;

-- ---------------------------------------------------------------------
-- 13. Mutes
-- ---------------------------------------------------------------------
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.set_thread_mute(pg_temp.id('main_chat'), '2h')$q$) like 'Choose 1 hour, 8 hours, 1 week, always or off', 'only the offered lengths');
select pg_temp.expect(pg_temp.error_of($q$select public.set_thread_mute(pg_temp.id('poker_chat'), '1h')$q$) = 'Chat not found', 'only chats you can use');
select public.set_thread_mute(pg_temp.id('main_chat'), '1h');
select pg_temp.expect((select muted_until between now() + interval '59 minutes' and now() + interval '61 minutes' from public.thread_mutes where thread_id = pg_temp.id('main_chat')), '1 hour');
select pg_temp.expect((select muted and muted_until is not null from public.my_chat_list() where id = pg_temp.id('main_chat')), 'the chat list says it''s muted, and until when');
select public.set_thread_mute(pg_temp.id('main_chat'), '8h');
select pg_temp.expect((select muted_until between now() + interval '479 minutes' and now() + interval '481 minutes' from public.thread_mutes where thread_id = pg_temp.id('main_chat')), '8 hours');
select public.set_thread_mute(pg_temp.id('main_chat'), '1w');
select pg_temp.expect((select muted_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.thread_mutes where thread_id = pg_temp.id('main_chat')), '1 week');
select public.set_thread_mute(pg_temp.id('main_chat'), 'always');
select pg_temp.expect((select muted_until is null from public.thread_mutes where thread_id = pg_temp.id('main_chat')), 'always');
select pg_temp.expect((select muted and muted_until is null from public.my_chat_list() where id = pg_temp.id('main_chat')), 'the chat list says muted until switched off');
select public.set_thread_mute(pg_temp.id('main_chat'), 'off');
select pg_temp.expect(not exists (select 1 from public.thread_mutes where thread_id = pg_temp.id('main_chat')), 'off');
select pg_temp.expect((select not muted from public.my_chat_list() where id = pg_temp.id('main_chat')), 'not muted any more');
select pg_temp.as_server();
insert into public.thread_mutes (thread_id, user_id, muted_until) values (pg_temp.id('main_chat'), pg_temp.u('dee'), now() - interval '1 minute');
select pg_temp.as_person('dee');
select pg_temp.expect((select not muted from public.my_chat_list() where id = pg_temp.id('main_chat')), 'a mute that has run out doesn''t count');
select public.set_thread_mute(pg_temp.id('main_chat'), 'always');

-- ---------------------------------------------------------------------
-- 14. Notifications for community chats
-- ---------------------------------------------------------------------
--   Sender: Cas. In the main chat: Sam (2 phones), Bea (Messages switched
--   off), Dee (muted it), Hal (blocked Cas), Ivy (banned), Lu (Cas blocked
--   her), Mo (no phone set up). Only Sam gets one, once.
select pg_temp.as_server();
insert into public.push_tokens (user_id, platform, token)
select p.id, 'ios', 'ExponentPushToken[c1-' || p.name || ']' from people p where p.name in ('sam', 'bea', 'cas', 'dee', 'hal', 'ivy', 'lu', 'gus', 'eve', 'fin')
on conflict (token) do nothing;
insert into public.push_tokens (user_id, platform, token) values (pg_temp.u('sam'), 'android', 'ExponentPushToken[c1-sam-2]') on conflict (token) do nothing;
delete from public.notification_settings where user_id in (select id from people);
insert into public.notification_settings (user_id, messages) values (pg_temp.u('bea'), false);
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.u('hal'), pg_temp.u('cas')), (pg_temp.u('cas'), pg_temp.u('lu'));
insert into public.account_bans (user_id, until, reason) values (pg_temp.u('ivy'), null, 'Test ban');
delete from public.push_queue;
select pg_temp.as_person('cas');
insert into ids values ('push_msg', public.send_message(pg_temp.id('main_chat'), 'Who''s coming tonight?'));
select pg_temp.as_server();
select pg_temp.expect((select string_agg(p.name, ',' order by p.name) from public.push_queue q join people p on p.id = q.user_id) = 'sam', 'one notification per eligible person: muted, blocked (either way), banned, switched off, no phone and the sender are skipped');
select pg_temp.expect((select title from public.push_queue) = 'Test Community', 'titled with the community''s name');
select pg_temp.expect((select body from public.push_queue) = 'Cas: Who''s coming tonight?', 'with the sender''s community nickname');
select pg_temp.expect((select url from public.push_queue) = '/chats/' || pg_temp.id('main_chat'), 'opening the chat');
delete from public.push_queue;
select pg_temp.as_person('bea');
select public.send_message(pg_temp.id('poker_chat'), repeat('long ', 60));
select pg_temp.as_server();
select pg_temp.expect((select title from public.push_queue where user_id = pg_temp.u('cas')) = 'Test Community · Poker', 'a sub-group''s notification names the community and the group');
select pg_temp.expect((select body from public.push_queue where user_id = pg_temp.u('cas')) = 'Bea: ' || left(repeat('long ', 60), 100), 'and cuts long messages short');
select pg_temp.expect((select count(*) from public.push_queue) = 1, 'only the group''s members hear about it');
delete from public.push_queue;
insert into public.messages (thread_id, sender_id, body, kind, media_path) values (pg_temp.id('poker_chat'), pg_temp.u('bea'), 'Sent a photo', 'photo', pg_temp.id('poker_chat') || '/x/y.jpg');
select pg_temp.expect((select body from public.push_queue where user_id = pg_temp.u('cas')) = 'Bea: Sent a photo', 'a photo reads "Sent a photo"');
delete from public.push_queue;
select pg_temp.as_person('bea');
select public.add_group_member(pg_temp.id('poker'), pg_temp.u('lu'));
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue), 'notes ("added", "joined") never notify');
select pg_temp.as_person('lu');
select public.leave_thread(pg_temp.id('poker_chat'));
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue), 'nor does "left"');

-- ---------------------------------------------------------------------
-- 15. The chat list
-- ---------------------------------------------------------------------
select pg_temp.as_person('cas');
select pg_temp.expect((select title || '|' || kind || '|' || group_kind || '|' || community_slug from public.my_chat_list() where id = pg_temp.id('main_chat')) = 'Test Community|community|main|test-comm', 'the main chat is titled with the community''s name');
select pg_temp.expect((select title || '|' || group_kind from public.my_chat_list() where id = pg_temp.id('poker_chat')) = 'Test Community · Poker|sub', 'a sub-group''s chat is "<community> · <group>"');
select pg_temp.expect((select title from public.my_threads() where id = pg_temp.id('poker_chat')) = 'Test Community · Poker', 'my_threads lists community chats too');
select pg_temp.expect(pg_get_function_result('public.my_threads()'::regprocedure)
  = 'TABLE(id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text, last_body text, last_at timestamp with time zone, last_sender uuid, unread bigint, social_event_id uuid)',
  'my_threads keeps exactly the columns it always had');
select pg_temp.as_server();
update public.communities set image_url = 'https://example.test/c.jpg' where id = pg_temp.id('c');
update public.thread_reads set last_read_at = now() - interval '1 hour' where thread_id = pg_temp.id('main_chat') and user_id = pg_temp.u('sam');
insert into public.messages (thread_id, sender_id, body, created_at)
select pg_temp.id('main_chat'), pg_temp.u('cas'), 'Spam ' || g, now() + make_interval(secs => g) from generate_series(1, 120) g;
select pg_temp.as_person('sam');
select pg_temp.expect((select unread from public.my_chat_list() where id = pg_temp.id('main_chat')) = 99, 'unread counts in community chats stop at 99');
select pg_temp.expect((select other_avatar || '|' || image_url || '|' || other_name from public.my_chat_list() where id = pg_temp.id('main_chat')) = 'https://example.test/c.jpg|https://example.test/c.jpg|Test Community', 'with the community''s picture');
select pg_temp.expect(public.unread_message_count() >= 99, 'and the badge counts them');
select pg_temp.as_server();
update public.thread_reads set last_read_at = now() + interval '1 day' where thread_id = pg_temp.id('main_chat') and user_id = pg_temp.u('sam');
select pg_temp.as_person('sam');
select pg_temp.expect((select unread from public.my_chat_list() where id = pg_temp.id('main_chat')) = 0, 'reading the chat clears the count');

-- ---------------------------------------------------------------------
-- 16. The other chat functions in community chats
-- ---------------------------------------------------------------------
select pg_temp.as_person('bea');
select pg_temp.expect(public.is_thread_admin(pg_temp.id('main_chat')) and public.may_pin(pg_temp.id('main_chat')), 'committee are admins of their community''s chats (and may pin)');
select pg_temp.expect(public.is_thread_admin(pg_temp.id('poker_chat')), 'including the sub-groups');
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('other_chat')), 'but not another community''s');
select pg_temp.as_person('sam');
select pg_temp.expect(public.is_thread_admin(pg_temp.id('main_chat')) and public.may_pin(pg_temp.id('main_chat')), 'admins too');
select pg_temp.expect(not public.may_pin(pg_temp.id('poker_chat')), 'but nobody pins in a chat they aren''t in');
select pg_temp.as_person('dee');
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('main_chat')) and not public.may_pin(pg_temp.id('main_chat')), 'a regular person isn''t a chat admin and can''t pin (it''s not a private chat)');
select pg_temp.expect(pg_temp.error_of($q$select public.pin_message(pg_temp.id('cas_main'))$q$) = 'Only the chat''s admins can pin messages', 'so pinning is refused');
select pg_temp.expect(public.may_share_events(pg_temp.id('main_chat')), 'members may share events in community chats');
select pg_temp.as_person('ada');
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('main_chat')), 'the Function team isn''t a chat admin (they can still delete anything)');
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.set_members_can_share_events(pg_temp.id('main_chat'), false)$q$) = 'Only the chat''s admins can change this', 'a regular person can''t switch event sharing off');
select pg_temp.as_person('bea');
select public.set_members_can_share_events(pg_temp.id('main_chat'), false);
select pg_temp.expect(public.may_share_events(pg_temp.id('main_chat')), 'committee can still share once it''s off');
select pg_temp.as_person('dee');
select pg_temp.expect(not public.may_share_events(pg_temp.id('main_chat')), 'members can''t once committee switch it off');
select pg_temp.as_person('bea');
select public.set_members_can_share_events(pg_temp.id('main_chat'), true);
select pg_temp.expect(pg_temp.error_of($q$select public.pin_message(pg_temp.id('cas_main'))$q$) is null, 'committee pin a message');
select pg_temp.expect(pg_temp.error_of($q$select public.remove_from_thread(pg_temp.id('main_chat'), pg_temp.u('dee'))$q$) like 'In a community, remove people%', 'people are removed through the community, not the chat');
select pg_temp.expect(pg_temp.error_of($q$select public.add_back_to_thread(pg_temp.id('main_chat'), pg_temp.u('fin'))$q$) like 'In a community, add people%', 'nor added back through it');
select pg_temp.expect(pg_temp.error_of($q$select public.set_thread_admin(pg_temp.id('main_chat'), pg_temp.u('dee'), true)$q$) like 'In a community, its admins and committee run the chats%', 'chat admins come from the community''s roles');
-- Deleting: your own; committee and admins anything in their community; nobody else.
select pg_temp.as_person('lu');
select public.delete_message(pg_temp.id('dee_main'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is null from public.messages where id = pg_temp.id('dee_main')), 'a regular person can''t delete someone else''s message');
select pg_temp.as_person('jo');
select public.delete_message(pg_temp.id('dee_main'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is null from public.messages where id = pg_temp.id('dee_main')), 'another community''s admin can''t either');
select pg_temp.as_person('bea');
select public.delete_message(pg_temp.id('dee_main'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is not null from public.messages where id = pg_temp.id('dee_main')), 'committee delete a message in their community''s chat');
select pg_temp.as_person('cas');
select public.delete_message(pg_temp.id('cas_main'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is not null from public.messages where id = pg_temp.id('cas_main')), 'the sender deletes their own');
select pg_temp.expect((select pinned_message_id is null from public.threads where id = pg_temp.id('main_chat')), 'deleting the pinned message unpins it');
select pg_temp.as_person('sam');
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('poker_chat')), 'an admin who isn''t in a sub-group isn''t its chat admin');
select public.delete_message(pg_temp.id('cas_poker'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is null from public.messages where id = pg_temp.id('cas_poker')), 'so he can''t delete its messages without being in it');
select pg_temp.as_person('ada');
select public.delete_message(pg_temp.id('cas_poker'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is not null from public.messages where id = pg_temp.id('cas_poker')), 'the Function team deletes anything');
-- Who's in the chat: nicknames, roles, membership.
select pg_temp.as_person('dee');
select pg_temp.expect((select string_agg(name || ':' || is_admin, ',' order by name) from public.thread_members(pg_temp.id('main_chat')))
  = 'Bea:true,Cas:false,Dee:false,Hal:true,Ivy:false,Lu:false,Mo:false,Sammy:true', 'the member list shows nicknames, with admins and committee as admins');
select pg_temp.expect((select string_agg(nickname || ':' || role || ':' || membership, ',' order by nickname) from public.thread_member_roles(pg_temp.id('poker_chat'))) is null, 'Dee (not in Poker) can''t list it');
select pg_temp.as_person('cas');
select pg_temp.expect((select string_agg(nickname || ':' || role || ':' || membership, ',' order by nickname) from public.thread_member_roles(pg_temp.id('poker_chat'))) = 'Bea:committee:non_member,Cas:regular:member', 'roles and membership for role colours');

-- ---------------------------------------------------------------------
-- 17. Private, event and Social chats behave as before
-- ---------------------------------------------------------------------
select pg_temp.as_server();
insert into public.societies (id, slug, name, university) values ('7e000000-0000-0000-0000-0000000000c1', 'c1-soc', 'C1 Society', 'LSE');
insert into public.society_admins (society_id, user_id) values ('7e000000-0000-0000-0000-0000000000c1', pg_temp.u('sam'));
with x as (
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience)
  values ('7e000000-0000-0000-0000-0000000000c1', 'C1 Night', 'social', (select id from public.venues order by id limit 1), now() + interval '2 days', now() + interval '2 days 3 hours', 'london')
  returning id)
insert into ids select 'event', id from x;
insert into public.event_entries (event_id, user_id, status) values (pg_temp.id('event'), pg_temp.u('bea'), 'going'), (pg_temp.id('event'), pg_temp.u('cas'), 'going');
insert into ids select 'event_chat', id from public.threads where event_id = pg_temp.id('event');
with x as (
  insert into public.social_events (host_id, title, category, starts_at, ends_at, area, lat, lng, spaces)
  values (pg_temp.u('sam'), 'C1 Drinks', (select enum_range(null::public.social_category))[1], now() + interval '1 day', now() + interval '1 day 2 hours', 'Holborn', 51.5, -0.12, 6)
  returning id)
insert into ids select 'social', id from x;
insert into public.social_event_members (event_id, user_id, status) values (pg_temp.id('social'), pg_temp.u('bea'), 'going');
insert into ids select 'social_chat', id from public.threads where social_event_id = pg_temp.id('social');
select pg_temp.expect((select string_agg(kind, ',' order by kind) from public.threads where id in (pg_temp.id('dm'), pg_temp.id('event_chat'), pg_temp.id('social_chat'))) = 'direct,event,social', 'threads.kind says what each chat is');
delete from public.push_queue;
delete from public.user_blocks where blocker_id = pg_temp.u('cas') or blocked_id = pg_temp.u('cas');
delete from public.notification_settings where user_id = pg_temp.u('bea');

-- thread_member, can_use_thread and the chat list.
select pg_temp.as_person('bea');
select pg_temp.expect(public.thread_member(pg_temp.id('dm')) and public.thread_member(pg_temp.id('event_chat')) and public.thread_member(pg_temp.id('social_chat')), 'Bea is in the private, event and Social chats');
select pg_temp.expect((select string_agg(title || ':' || kind, ',' order by title) from public.my_chat_list() where id in (pg_temp.id('dm'), pg_temp.id('event_chat'), pg_temp.id('social_chat')))
  = 'C1 Drinks:social,C1 Night:event,Sam Person:direct', 'with their usual titles');
select pg_temp.expect((select other_id from public.my_threads() where id = pg_temp.id('dm')) = pg_temp.u('sam') and (select other_name from public.my_threads() where id = pg_temp.id('dm')) = 'Sam Person', 'a private chat still names the other person');
select pg_temp.expect((select other_id is null and other_name = 'Member' from public.my_threads() where id = pg_temp.id('event_chat')), 'an event chat is as before (no other person)');
select pg_temp.as_person('dee');
select pg_temp.expect(not public.thread_member(pg_temp.id('dm')) and not public.thread_member(pg_temp.id('event_chat')) and not public.thread_member(pg_temp.id('social_chat')), 'Dee isn''t in any of them');
-- Pins and admins.
select pg_temp.as_person('bea');
select pg_temp.expect(public.may_pin(pg_temp.id('dm')) and not public.is_thread_admin(pg_temp.id('dm')), 'a private chat: either person pins, nobody is an admin');
select pg_temp.expect(not public.may_pin(pg_temp.id('event_chat')) and not public.is_thread_admin(pg_temp.id('event_chat')), 'an event chat: someone going isn''t an admin and can''t pin');
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('social_chat')), 'a Social chat: someone going isn''t an admin');
select pg_temp.expect(public.may_share_events(pg_temp.id('dm')), 'events can always be shared in private chats');
select pg_temp.as_person('sam');
select pg_temp.expect(public.is_thread_admin(pg_temp.id('event_chat')) and public.may_pin(pg_temp.id('event_chat')), 'the society''s committee runs its event''s chat');
select pg_temp.expect(public.is_thread_admin(pg_temp.id('social_chat')), 'the host runs a Social chat');
-- Pushes, now skipping anyone who muted the chat.
select pg_temp.as_person('bea');
select public.set_thread_mute(pg_temp.id('dm'), 'always');
select pg_temp.as_person('sam');
select public.send_message(pg_temp.id('dm'), 'Muted?');
select public.send_message(pg_temp.id('event_chat'), 'Doors at 7');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = pg_temp.u('bea') and url = '/chats/' || pg_temp.id('dm')), 'a muted private chat sends no push');
select pg_temp.expect((select string_agg(p.name || ':' || q.title, ',' order by p.name) from public.push_queue q join people p on p.id = q.user_id where q.url = '/chats/' || pg_temp.id('event_chat'))
  = 'bea:Sam Person in C1 Night,cas:Sam Person in C1 Night', 'an event chat pushes to everyone going, as before');
delete from public.push_queue;
select pg_temp.as_person('cas');
select public.set_thread_mute(pg_temp.id('event_chat'), '1h');
select pg_temp.as_person('bea');
select public.set_thread_mute(pg_temp.id('dm'), 'off');
select public.send_message(pg_temp.id('event_chat'), 'See you there');
select public.send_message(pg_temp.id('dm'), 'Unmuted');
select public.send_message(pg_temp.id('social_chat'), 'Drinks!');
select pg_temp.as_server();
select pg_temp.expect((select string_agg(p.name, ',' order by p.name) from public.push_queue q join people p on p.id = q.user_id where q.url = '/chats/' || pg_temp.id('event_chat')) = 'sam', 'a muted event chat sends no push to Cas; the committee still hears');
select pg_temp.expect((select title || ':' || body from public.push_queue where url = '/chats/' || pg_temp.id('dm')) = 'Bea Person:Unmuted', 'an unmuted private chat pushes as before');
select pg_temp.expect((select title from public.push_queue where url = '/chats/' || pg_temp.id('social_chat')) = 'Bea Person in C1 Drinks', 'a Social chat pushes as before');
-- Leaving and deleting.
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_thread(pg_temp.id('dm'))$q$) = 'You can only leave group chats', 'a private chat can''t be left');
select pg_temp.expect(pg_temp.error_of($q$select public.leave_thread(pg_temp.id('social_chat'))$q$) is null, 'a Social chat can');
select pg_temp.expect(exists (select 1 from public.thread_leaves where thread_id = pg_temp.id('social_chat') and user_id = pg_temp.u('bea')), 'recorded as before');
select pg_temp.expect(not public.can_use_thread(pg_temp.id('social_chat')) and public.thread_member(pg_temp.id('social_chat')), 'Bea can''t use it but still belongs (so she can rejoin)');
select public.rejoin_thread(pg_temp.id('social_chat'));
select pg_temp.expect(public.can_use_thread(pg_temp.id('social_chat')), 'and rejoins');
insert into ids values ('bea_dm', (select id from public.messages where thread_id = pg_temp.id('dm') and body = 'Unmuted'));
select pg_temp.as_person('sam');
select public.delete_message(pg_temp.id('bea_dm'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is null from public.messages where id = pg_temp.id('bea_dm')), 'the other person in a private chat can''t delete your message');
select pg_temp.as_person('bea');
select public.delete_message(pg_temp.id('bea_dm'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is not null from public.messages where id = pg_temp.id('bea_dm')), 'you can delete your own');

-- The same answers as before for every private, event and Social chat:
-- the previous definitions (20261128000000_reporting_blocking.sql's
-- my_threads, 20261124000000_leave_group_chat.sql's thread_member), compared
-- with the new ones for everyone.
select pg_temp.as_server();
create or replace function pg_temp.old_my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  with mine as materialized (
    select t.id from public.threads t
    where t.user_a = (select auth.uid()) or t.user_b = (select auth.uid())
       or t.event_id in (
            select en.event_id from public.event_entries en where en.user_id = (select auth.uid()) and en.status = 'going'
            union select ev.id from public.events ev where ev.host_user_id = (select auth.uid())
            union select ev.id from public.events ev join public.society_admins a on a.society_id = ev.society_id where a.user_id = (select auth.uid()))
       or t.social_event_id in (
            select s.id from public.social_events s where s.host_id = (select auth.uid())
            union select m.event_id from public.social_event_members m where m.user_id = (select auth.uid()) and m.status = 'going')
  ), ok as materialized (
    select mine.id from mine where public.can_use_thread(mine.id)
  )
  select t.id, t.event_id,
         coalesce(e.title, se.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.kind not in ('left', 'rejoined', 'removed')
            and not public.is_blocked_between(m.sender_id, (select auth.uid()))
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         t.social_event_id
  from public.threads t
  join ok on ok.id = t.id
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id and (m.sender_id is null or not public.is_blocked_between(m.sender_id, (select auth.uid())))
    order by created_at desc limit 1
  ) lm on true
  where (e.id is null or e.ends_at > now() - interval '7 days')
    and (se.id is null or se.ends_at > now() - interval '7 days')
    and (e.id is null or not e.is_draft
         or (e.society_id is not null and public.is_society_committee(e.society_id))
         or e.host_user_id = (select auth.uid()))
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;
create or replace function pg_temp.old_thread_member(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and (public.are_friends(t.user_a, t.user_b)
             or (t.via_social_event is not null and not public.is_blocked_between(t.user_a, t.user_b))))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id)
             or (public.is_going_to(t.event_id)
                 and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft))
             or exists (select 1 from public.events e where e.id = t.event_id and e.society_id is not null and public.is_society_committee(e.society_id))))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;
create temp table checked (who text, chats integer);
grant all on checked to anon, authenticated;
do $$
declare
  n text;
  differences integer;
begin
  for n in select name from people loop
    perform pg_temp.as_person(n);
    select count(*) into differences from (
      (select * from public.my_threads() where id not in (select t.id from public.threads t where t.community_group_id is not null)
       except select * from pg_temp.old_my_threads())
      union all
      (select * from pg_temp.old_my_threads() except select * from public.my_threads())
    ) x;
    perform pg_temp.expect(differences = 0, n || '''s chat list is unchanged for private, event and Social chats');
    select count(*) into differences from public.threads t
    where t.community_group_id is null and public.thread_member(t.id) is distinct from pg_temp.old_thread_member(t.id);
    perform pg_temp.expect(differences = 0, 'thread_member is unchanged for ' || n || ' in every private, event and Social chat');
    insert into checked select n, (select count(*) from pg_temp.old_my_threads());
  end loop;
end $$;
select pg_temp.as_server();
select pg_temp.expect((select string_agg(who || '=' || chats, ',' order by who) from checked where chats > 0) = 'bea=3,cas=1,sam=3', '(and there were chats to compare: Sam''s and Bea''s private, event and Social chats, Cas''s event chat)');

-- The same for chat admins, pins, event sharing and the member list.
select pg_temp.as_server();
create or replace function pg_temp.old_is_thread_admin(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (select 1 from public.threads t where t.id = tid and (t.event_id is not null or t.social_event_id is not null))
     and public.thread_admin_of(tid, (select auth.uid()));
$$;
create or replace function pg_temp.old_may_pin(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_use_thread(tid)
     and exists (select 1 from public.threads t where t.id = tid
                 and ((t.event_id is null and t.social_event_id is null) or public.is_thread_admin(tid)));
$$;
create or replace function pg_temp.old_may_share_events(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null)
      or t.members_can_share_events
      or public.is_thread_admin(tid)
    )
  );
$$;
create or replace function pg_temp.old_thread_members(tid uuid)
returns table (user_id uuid, name text, avatar_url text, is_admin boolean, is_organiser boolean, is_me boolean, removed boolean)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, coalesce(nullif(pr.display_name, ''), 'Member'), pr.avatar_url,
         public.thread_admin_of(tid, p.user_id), public.thread_organiser(tid, p.user_id), p.user_id = (select auth.uid()), false
  from public.thread_people(tid) p join public.profiles pr on pr.id = p.user_id
  where public.can_use_thread(tid)
    and exists (select 1 from public.threads t where t.id = tid and (t.event_id is not null or t.social_event_id is not null))
  union all
  -- Admins also see who was removed (to add them back), while they still belong in the chat.
  select l.user_id, coalesce(nullif(pr.display_name, ''), 'Member'), pr.avatar_url, false, false, false, true
  from public.thread_leaves l join public.profiles pr on pr.id = l.user_id
  where l.thread_id = tid and l.removed_by is not null and public.is_thread_admin(tid) and public.can_use_thread(tid)
    and public.thread_member_of(tid, l.user_id)
  order by 7, 4 desc, 2;
$$;
do $$
declare
  n text;
  differences integer;
begin
  for n in select name from people loop
    perform pg_temp.as_person(n);
    select count(*) into differences from public.threads t
    where t.community_group_id is null
      and (public.is_thread_admin(t.id) is distinct from pg_temp.old_is_thread_admin(t.id)
           or public.may_pin(t.id) is distinct from pg_temp.old_may_pin(t.id)
           or public.may_share_events(t.id) is distinct from pg_temp.old_may_share_events(t.id)
           or exists (select * from public.thread_members(t.id) except select * from pg_temp.old_thread_members(t.id))
           or exists (select * from pg_temp.old_thread_members(t.id) except select * from public.thread_members(t.id)));
    perform pg_temp.expect(differences = 0, 'chat admins, pins, sharing and member lists are unchanged for ' || n || ' in private, event and Social chats');
  end loop;
end $$;

-- Notifications: the same messages sent with the previous push_on_message
-- (20261128000000_reporting_blocking.sql) and the new one reach the same
-- people with the same words (nobody has muted anything here).
select pg_temp.as_server();
delete from public.thread_mutes;
delete from public.push_queue;
insert into public.push_tokens (user_id, platform, token) values (pg_temp.u('dee'), 'ios', 'ExponentPushToken[c1-dee-x]') on conflict (token) do nothing;
insert into public.event_entries (event_id, user_id, status) values (pg_temp.id('event'), pg_temp.u('dee'), 'going') on conflict do nothing;
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.u('dee'), pg_temp.u('bea')) on conflict do nothing;
create or replace function pg_temp.send_round() returns void language plpgsql as $$
begin
  perform pg_temp.as_person('sam');
  perform public.send_message(pg_temp.id('dm'), 'Round: private');
  perform public.send_message(pg_temp.id('event_chat'), 'Round: event');
  perform public.send_message(pg_temp.id('social_chat'), 'Round: social');
  perform pg_temp.as_person('bea');
  perform public.send_message(pg_temp.id('event_chat'), 'Round: event from Bea');
  perform public.send_message(pg_temp.id('social_chat'), 'Round: social from Bea');
  perform pg_temp.as_person('cas');
  perform public.send_message(pg_temp.id('event_chat'), 'Round: event from Cas');
  perform pg_temp.as_server();
end $$;
select pg_temp.send_round();
create temp table new_pushes as select user_id, kind, title, body, url from public.push_queue;
delete from public.push_queue;
create or replace function public.push_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  who text := public.push_name(new.sender_id);
  preview text := left(coalesce(new.body, ''), 100);
  r uuid;
begin
  if new.sender_id is null or new.kind in ('left', 'rejoined', 'removed') then return new; end if;
  if new.kind = 'event' then preview := left(regexp_replace(preview, ' https://\S+$', ''), 100); end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.event_id is null and t.social_event_id is null then
    perform public.queue_push(case when t.user_a = new.sender_id then t.user_b else t.user_a end, 'messages', who, preview, '/chats/' || t.id);
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
          and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft)
        union select a.user_id from public.society_admins a join public.events e on e.society_id = a.society_id where e.id = t.event_id
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;
select pg_temp.send_round();
select pg_temp.expect((select count(*) from new_pushes) >= 6, '(the round sent notifications)');
select pg_temp.expect(not exists (select user_id, kind, title, body, url from public.push_queue except all select * from new_pushes)
  and not exists (select * from new_pushes except all select user_id, kind, title, body, url from public.push_queue),
  'private, event and Social chats notify exactly the same people with the same words as before');
create or replace function public.push_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  grp record;
  who text := public.push_name(new.sender_id);
  preview text := left(coalesce(new.body, ''), 100);
  nick text;
  r uuid;
  other uuid;
begin
  if new.sender_id is null or new.kind in ('left', 'rejoined', 'removed', 'joined', 'added') then return new; end if;
  if new.kind = 'event' then preview := left(regexp_replace(preview, ' https://\S+$', ''), 100); end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.community_group_id is not null then
    select g.kind, g.name as group_name, c.id as community_id, c.name as community_name into grp
    from public.community_groups g join public.communities c on c.id = g.community_id
    where g.id = t.community_group_id;
    if not found then return new; end if;
    select m.nickname into nick from public.community_members m
    where m.community_id = grp.community_id and m.user_id = new.sender_id;
    insert into public.push_queue (user_id, kind, title, body, url)
    select p.user_id, 'messages',
           left(case when grp.kind = 'main' then grp.community_name else grp.community_name || ' · ' || grp.group_name end, 120),
           left(coalesce(nick, who) || ': ' || preview, 200),
           '/chats/' || t.id
    from public.thread_participants p
    where p.thread_id = t.id and p.user_id <> new.sender_id
      and exists (select 1 from public.push_tokens k where k.user_id = p.user_id)
      and not exists (select 1 from public.notification_settings s where s.user_id = p.user_id and s.messages is false)
      and not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = p.user_id
                        and (mu.muted_until is null or mu.muted_until > now()))
      and not exists (select 1 from public.user_blocks b where b.blocker_id = p.user_id and b.blocked_id = new.sender_id)
      and not exists (select 1 from public.user_blocks b where b.blocker_id = new.sender_id and b.blocked_id = p.user_id)
      and not exists (select 1 from public.account_bans ab where ab.user_id = p.user_id and (ab.until is null or ab.until > now()));
    return new;
  end if;
  if t.event_id is null and t.social_event_id is null then
    other := case when t.user_a = new.sender_id then t.user_b else t.user_a end;
    if not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = other
                     and (mu.muted_until is null or mu.muted_until > now())) then
      perform public.queue_push(other, 'messages', who, preview, '/chats/' || t.id);
    end if;
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
          and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft)
        union select a.user_id from public.society_admins a join public.events e on e.society_id = a.society_id where e.id = t.event_id
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
        and not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = x.u
                          and (mu.muted_until is null or mu.muted_until > now()))
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
        and not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = x.u
                          and (mu.muted_until is null or mu.muted_until > now()))
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;
delete from public.push_queue;
delete from public.user_blocks where blocker_id = pg_temp.u('dee');

-- ---------------------------------------------------------------------
-- 18. Report emails name the community chat
-- ---------------------------------------------------------------------
delete from public.email_queue;
select pg_temp.as_person('bea');
insert into ids values ('poker_msg', public.send_message(pg_temp.id('poker_chat'), 'Something bad'));
select pg_temp.as_person('cas');
insert into public.reports (message_id, reason) values (pg_temp.id('poker_msg'), 'Rude');
select pg_temp.as_server();
select pg_temp.expect((select body from public.email_queue) like '%Chat: a community chat: Test Community · Poker (id ' || pg_temp.id('poker_chat') || ')%', 'the report email names the community and the group');

-- ---------------------------------------------------------------------
-- 19. The community's page, settings and nicknames
-- ---------------------------------------------------------------------
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_profile(pg_temp.id('c'), 'Hacked', null, null)$q$) like 'Only the community''s admins and committee%', 'a regular person can''t edit the bio');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_profile(pg_temp.id('c'), repeat('x', 1001), null, null)$q$) like 'The bio can be up to%', 'the bio has a limit');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_profile(pg_temp.id('c'), 'Bio', 'javascript:alert(1)', null)$q$) = 'Images must be https:// links', 'images must be https links');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_profile(pg_temp.id('c'), '  New bio  ', 'https://example.test/i.jpg', '')$q$) is null, 'committee edit the bio, picture and banner');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_settings(pg_temp.id('c'), 'Renamed', null)$q$) = 'Only the community''s admins can do that', 'committee can''t rename the community or change settings');
select pg_temp.as_server();
select pg_temp.expect((select bio || '|' || image_url || '|' || coalesce(banner_url, 'none') from public.communities where id = pg_temp.id('c')) = 'New bio|https://example.test/i.jpg|none', 'saved (an empty banner means none)');
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_settings(pg_temp.id('c'), null, '{"role_colours": {"admin": {"light": "red", "dark": "#F5C04A"}, "committee": {"light": "#7A1010", "dark": "#FF5A5A"}, "member": {"light": "#C4362E", "dark": "#FFB8B3"}, "non_member": {"light": "#6B6B73", "dark": "#9A9AA3"}}}')$q$) = 'Colours must look like #RRGGBB', 'colours must be #RRGGBB');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_settings(pg_temp.id('c'), null, '{"role_colours": {"admin": {"light": "#000000", "dark": "#FFFFFF"}}}')$q$) like 'Give a light and a dark colour for committee', 'every role needs both colours');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_settings(pg_temp.id('c'), null, '{"roles": {"c0000000-0000-0000-0000-000000000004": "admin"}}')$q$) = 'Unknown setting: roles', 'settings can''t carry roles (or anything else unknown)');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_settings(pg_temp.id('c'), null, '{"membership_label": ""}')$q$) like 'The membership label%', 'the membership label can''t be empty');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_settings(pg_temp.id('c'), '', null)$q$) like 'The name must be%', 'the name can''t be empty');
select pg_temp.expect(pg_temp.error_of($q$select public.update_community_settings(pg_temp.id('c'), ' Test Community 2 ', '{"membership_label": "paid-up member", "role_colours": {"admin": {"light": "#000000", "dark": "#FFFFFF"}, "committee": {"light": "#7A1010", "dark": "#FF5A5A"}, "member": {"light": "#C4362E", "dark": "#FFB8B3"}, "non_member": {"light": "#6B6B73", "dark": "#9A9AA3"}}}')$q$) is null, 'an admin changes the name and settings');
select pg_temp.as_server();
select pg_temp.expect((select name || '|' || (settings->>'membership_label') || '|' || (settings->'role_colours'->'admin'->>'light') || '|' || (settings->>'marketplace_enabled')
  from public.communities where id = pg_temp.id('c')) = 'Test Community 2|paid-up member|#000000|false', 'saved, keeping the settings not mentioned');
select pg_temp.expect((select name from public.community_groups where id = pg_temp.id('main')) = 'Test Community 2', 'the main group takes the new name');
select pg_temp.expect((select string_agg(role, ',' order by role) from public.community_members where community_id = pg_temp.id('c') and role <> 'regular') = 'admin,admin,committee', 'and no roles changed');

select pg_temp.as_person('lu');
select pg_temp.expect(pg_temp.error_of($q$select public.update_my_community_nickname(pg_temp.id('c'), 'sammy')$q$) like 'That nickname is taken%', 'a nickname change must be free');
select pg_temp.expect(pg_temp.error_of($q$select public.update_my_community_nickname(pg_temp.id('c'), 'Moderator')$q$) like '%reserved%', 'and not reserved');
select pg_temp.expect(pg_temp.error_of($q$select public.update_my_community_nickname(pg_temp.id('c'), 'Admins')$q$) like '%reserved%', '"Admins" is reserved too');
select pg_temp.expect(pg_temp.error_of($q$select public.update_my_community_nickname(pg_temp.id('c'), 'LuLu')$q$) is null, 'Lu changes her nickname');
select pg_temp.expect(pg_temp.error_of($q$select public.update_my_community_nickname(pg_temp.id('c'), 'Lu')$q$) is null, 'and back (her own old nickname is fine)');
select pg_temp.as_person('fin');
select pg_temp.expect(pg_temp.error_of($q$select public.update_my_community_nickname(pg_temp.id('c'), 'Finn')$q$) = 'You''re not in this community', 'someone removed can''t');

-- ---------------------------------------------------------------------
-- 20. Leaving the community takes you out of its sub-groups; archiving a group hides it
-- ---------------------------------------------------------------------
select pg_temp.as_person('sam');
select public.remove_community_member(pg_temp.id('c'), pg_temp.u('cas'));
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.community_group_members where user_id = pg_temp.u('cas')), 'someone removed is out of every sub-group');
select pg_temp.expect(not exists (select 1 from public.thread_participants where user_id = pg_temp.u('cas') and thread_id in (pg_temp.id('main_chat'), pg_temp.id('poker_chat'))), 'and every chat of the community');
select pg_temp.as_person('cas');
select pg_temp.expect((select count(*) from public.messages where thread_id in (pg_temp.id('main_chat'), pg_temp.id('poker_chat'))) = 0, 'and can''t read them any more');
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of($q$select public.rename_community_group(pg_temp.id('main'), 'New main')$q$) = 'That can''t be done to the main group', 'the main group can''t be renamed');
select pg_temp.expect(pg_temp.error_of($q$select public.archive_community_group(pg_temp.id('main'))$q$) = 'That can''t be done to the main group', 'or archived');
select pg_temp.expect(pg_temp.error_of($q$select public.rename_community_group(pg_temp.id('poker'), 'Poker Club', 'Fridays')$q$) is null, 'committee rename a group');
select pg_temp.expect((select title from public.my_chat_list() where id = pg_temp.id('poker_chat')) = 'Test Community 2 · Poker Club', 'its chat follows the new names');
select pg_temp.expect(pg_temp.error_of($q$select public.archive_community_group(pg_temp.id('poker'))$q$) is null, 'committee archive a group');
select pg_temp.expect(not exists (select 1 from public.my_chat_list() where id = pg_temp.id('poker_chat')), 'an archived group''s chat leaves the chat list');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('poker_chat')) = 0, 'its messages can''t be read');
select pg_temp.expect(pg_temp.error_of($q$select public.send_message(pg_temp.id('poker_chat'), 'Anyone?')$q$) = 'You can''t send messages here', 'nobody can post in it');
select pg_temp.expect(not exists (select 1 from jsonb_array_elements(public.community_home('test-comm')->'groups') g where g->>'name' = 'Poker Club'), 'it''s gone from the community page');
select pg_temp.expect(pg_temp.error_of($q$select public.add_group_member(pg_temp.id('poker'), pg_temp.u('dee'))$q$) = 'This group is archived', 'and nobody can be added');
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('poker_chat')), 'and committee in it no longer run its chat');
select pg_temp.as_person('ada');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('poker_chat')) > 0, 'the Function team can still read it');

-- ---------------------------------------------------------------------
-- 21. Files: community pictures, and photos in community chats
-- ---------------------------------------------------------------------
select pg_temp.as_person('bea');
select pg_temp.expect(pg_temp.error_of(format($q$insert into storage.objects (bucket_id, name) values ('images', 'communities/%s/banner.jpg')$q$, pg_temp.id('c'))) is null, 'committee upload a community picture');
select pg_temp.expect(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('images', 'communities/%s/banner.jpg')$q$, pg_temp.id('other'))), 'but not into another community''s folder');
select pg_temp.expect(pg_temp.fails($q$insert into storage.objects (bucket_id, name) values ('images', 'communities/not-an-id/banner.jpg')$q$), 'or a made-up folder');
select pg_temp.as_person('dee');
select pg_temp.expect(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('images', 'communities/%s/mine.jpg')$q$, pg_temp.id('c'))), 'a regular person can''t upload one');
select pg_temp.as_person('gus');
select pg_temp.expect(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('images', 'communities/%s/mine.jpg')$q$, pg_temp.id('c'))), 'nor can an outsider');
select pg_temp.as_server();
insert into storage.objects (bucket_id, name) values ('chat-media', pg_temp.id('main_chat') || '/' || pg_temp.u('dee') || '/p.jpg');
select pg_temp.as_person('lu');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'chat-media' and name like pg_temp.id('main_chat') || '/%') = 1, 'someone in a community chat can open its photos');
select pg_temp.expect(pg_temp.error_of(format($q$insert into storage.objects (bucket_id, name) values ('chat-media', '%s/%s/q.jpg')$q$, pg_temp.id('main_chat'), pg_temp.u('lu'))) is null, 'and upload into it');
select pg_temp.as_person('gus');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'chat-media' and name like pg_temp.id('main_chat') || '/%') = 0, 'an outsider can''t open them');
select pg_temp.expect(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('chat-media', '%s/%s/q.jpg')$q$, pg_temp.id('main_chat'), pg_temp.u('gus'))), 'or upload');

-- Sharing an event into a community chat (the app inserts it; the rules check it).
select pg_temp.as_person('lu');
select pg_temp.expect(pg_temp.error_of(format($q$insert into public.messages (thread_id, sender_id, kind, body, social_event_id) values ('%s', '%s', 'event', 'x', '%s')$q$,
  pg_temp.id('main_chat'), pg_temp.u('lu'), pg_temp.id('social'))) is null, 'someone in a community chat can share an event into it');
select pg_temp.as_person('gus');
select pg_temp.expect(pg_temp.fails(format($q$insert into public.messages (thread_id, sender_id, kind, body, social_event_id) values ('%s', '%s', 'event', 'x', '%s')$q$,
  pg_temp.id('main_chat'), pg_temp.u('gus'), pg_temp.id('social'))), 'an outsider can''t');

-- ---------------------------------------------------------------------
-- 22. The send-push queue: bigger claims, and tidying up
-- ---------------------------------------------------------------------
select pg_temp.as_server();
delete from public.push_queue;
insert into public.push_queue (user_id, kind, title, body) select pg_temp.u('sam'), 'friends', 'Hi', 'n' || g from generate_series(1, 1200) g;
select pg_temp.expect((select count(*) from public.claim_push_batch(5000)) = 1000, 'a claim takes up to 1,000');
select pg_temp.expect((select count(*) from public.claim_push_batch(1000)) = 200, 'and the next one the rest');
select pg_temp.expect((select min(attempts) = 1 and max(attempts) = 1 from public.push_queue), 'each claim counts an attempt');
update public.push_queue set claimed_at = now() - interval '3 minutes', attempts = 5 where body = 'n1';
update public.push_queue set claimed_at = now() - interval '3 minutes' where body = 'n2';
select pg_temp.expect((select string_agg(body, ',') from public.claim_push_batch(10)) = 'n2', 'a stuck claim is retried, but not after 5 attempts');
delete from public.push_queue;
insert into public.push_queue (user_id, kind, title, body, created_at, sent_at) values
  (pg_temp.u('sam'), 'friends', 'Old', 'sent 8 days ago', now() - interval '9 days', now() - interval '8 days'),
  (pg_temp.u('sam'), 'friends', 'Recent', 'sent 6 days ago', now() - interval '6 days', now() - interval '6 days'),
  (pg_temp.u('sam'), 'friends', 'Stale', 'never sent, 8 days old', now() - interval '8 days', null),
  (pg_temp.u('sam'), 'friends', 'New', 'waiting', now(), null);
select pg_temp.expect(public.purge_push_queue() = 2, 'purging removes the two week-old rows');
select pg_temp.expect((select string_agg(title, ',' order by title) from public.push_queue) = 'New,Recent', 'and keeps the rest');
select pg_temp.as_person('sam');
select pg_temp.expect(pg_temp.fails($q$select public.purge_push_queue()$q$), 'nobody using the app can purge');
select pg_temp.as_server();
delete from public.push_queue;

rollback;
