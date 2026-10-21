-- 20261124000000_leave_group_chat.sql: leaving and rejoining a group chat.
--
--   L  lg-l  LSE society managed by Sam; one published event that Bea and
--            Cas are going to (its group chat), with phones set up.
--   A Social plan hosted by Sam that Bea is going to.
--   Sam and Bea are friends (a private chat between them).
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
-- 0. Running the migration a second time works
-- ---------------------------------------------------------------------
reset role;
\ir ../migrations/20261124000000_leave_group_chat.sql

select pg_temp.expect((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
  where p.oid in ('public.leave_thread(uuid)'::regprocedure, 'public.rejoin_thread(uuid)'::regprocedure, 'public.thread_member(uuid)'::regprocedure, 'public.can_use_thread(uuid)'::regprocedure)),
  'the new functions are security definer with an empty search path');
select pg_temp.expect(not has_function_privilege('anon', 'public.leave_thread(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.rejoin_thread(uuid)', 'execute'), 'logged-out visitors cannot leave or rejoin');
select pg_temp.expect(has_function_privilege('authenticated', 'public.leave_thread(uuid)', 'execute'), 'logged-in people can call leave_thread (it checks who they are)');

-- ---------------------------------------------------------------------
-- Set-up
-- ---------------------------------------------------------------------
select pg_temp.as_server();
update public.profiles set display_name = 'Sam Student' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Bea' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Cas' where id = '00000000-0000-0000-0000-000000000003';
insert into public.societies (id, slug, name, university) values ('7a000000-0000-0000-0000-000000000001', 'lg-l', 'Leave Group Society', 'LSE');
insert into public.society_admins (society_id, user_id) values ('7a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000001', 'ios', 'ExponentPushToken[lg-sam]'),
  ('00000000-0000-0000-0000-000000000002', 'ios', 'ExponentPushToken[lg-bea]'),
  ('00000000-0000-0000-0000-000000000003', 'android', 'ExponentPushToken[lg-cas]')
on conflict (token) do nothing;
delete from public.notification_settings where user_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted') on conflict do nothing;

create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
with x as (
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience)
  values ('7a000000-0000-0000-0000-000000000001', 'LG Poker Night', 'social', (select id from public.venues order by id limit 1), now() + interval '2 days', now() + interval '2 days 3 hours', 'london')
  returning id)
insert into ids select 'event', id from x;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;
insert into public.event_entries (event_id, user_id, status) values
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000002', 'going'),
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000003', 'going');
insert into public.threads (event_id) values (pg_temp.id('event')) on conflict (event_id) do nothing;
insert into ids select 'chat', id from public.threads where event_id = pg_temp.id('event');

with x as (
  insert into public.social_events (host_id, title, category, starts_at, ends_at, area, lat, lng, spaces)
  values ('00000000-0000-0000-0000-000000000001', 'LG Picnic', (select enum_range(null::public.social_category))[1], now() + interval '1 day', now() + interval '1 day 2 hours', 'Regent''s Park', 51.52, -0.15, 8)
  returning id)
insert into ids select 'plan', id from x;
insert into public.social_event_members (event_id, user_id, status) values (pg_temp.id('plan'), '00000000-0000-0000-0000-000000000002', 'going');
insert into public.threads (social_event_id) values (pg_temp.id('plan')) on conflict (social_event_id) do nothing;
insert into ids select 'plan_chat', id from public.threads where social_event_id = pg_temp.id('plan');

insert into public.threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') on conflict do nothing;
insert into ids select 'dm', id from public.threads where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------
-- 1. Before leaving: Bea is in the chat
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.can_use_thread(pg_temp.id('chat')), 'Bea can use the event chat');
select pg_temp.expect(exists (select 1 from public.my_threads() where id = pg_temp.id('chat')), 'the event chat is in Bea''s list');
select public.send_message(pg_temp.id('chat'), 'Hi all');

-- ---------------------------------------------------------------------
-- 2. Private chats can't be left; people outside a chat can't leave it
-- ---------------------------------------------------------------------
select pg_temp.expect(pg_temp.error_of($$select public.leave_thread(pg_temp.id('dm'))$$) like '%only leave group chats%', 'a private chat cannot be left');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.leave_thread(pg_temp.id('chat'))$$), 'a logged-out visitor cannot leave');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.error_of($$select public.leave_thread(pg_temp.id('chat'))$$) like '%not found%', 'someone not in the chat (even an app admin) cannot leave it');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$insert into public.thread_leaves (thread_id, user_id) values (pg_temp.id('chat'), '00000000-0000-0000-0000-000000000003')$$), 'nobody can write leave rows directly (e.g. to remove someone else)');
select pg_temp.expect(pg_temp.fails($$insert into public.messages (thread_id, sender_id, body, kind) values (pg_temp.id('chat'), '00000000-0000-0000-0000-000000000003', 'left the group', 'left')$$), 'nobody can fake a "left" note');

-- ---------------------------------------------------------------------
-- 3. Bea leaves
-- ---------------------------------------------------------------------
select public.leave_thread(pg_temp.id('chat'));
select public.leave_thread(pg_temp.id('chat')); -- twice: no second note
select pg_temp.expect(not public.can_use_thread(pg_temp.id('chat')), 'Bea can no longer use the chat');
select pg_temp.expect(not exists (select 1 from public.my_threads() where id = pg_temp.id('chat')), 'the chat is gone from Bea''s list');
select pg_temp.expect(not exists (select 1 from public.messages where thread_id = pg_temp.id('chat')), 'Bea cannot read its messages');
select pg_temp.expect(exists (select 1 from public.threads where id = pg_temp.id('chat')), 'Bea can still see the chat exists (to rejoin from the event page)');
select pg_temp.expect(exists (select 1 from public.thread_leaves where thread_id = pg_temp.id('chat')), 'Bea can see that she left');
select pg_temp.expect(pg_temp.error_of($$select public.send_message(pg_temp.id('chat'), 'Still here?')$$) like '%can''t send%', 'Bea cannot send to it');
select pg_temp.expect(public.is_going_to(pg_temp.id('event')), 'leaving the chat keeps Bea''s place at the event');
select pg_temp.expect(exists (select 1 from public.my_threads() where id = pg_temp.id('dm')), 'Bea''s private chat is untouched');

-- Others see one note, from Bea, which doesn't count as unread.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('chat') and kind = 'left' and sender_id = '00000000-0000-0000-0000-000000000002') = 1, 'Cas sees exactly one "left" note from Bea');
select pg_temp.expect((select unread from public.my_threads() where id = pg_temp.id('chat')) = 1, 'for Cas only "Hi all" is unread, not the note');
select pg_temp.expect(pg_temp.fails($$select public.delete_message((select id from public.messages where thread_id = pg_temp.id('chat') and kind = 'left'))$$) is false
  and exists (select 1 from public.messages where thread_id = pg_temp.id('chat') and kind = 'left' and deleted_at is null), 'Cas cannot delete Bea''s note');

-- ---------------------------------------------------------------------
-- 4. Pushes: nothing for the note, nothing to Bea afterwards
-- ---------------------------------------------------------------------
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue where body = 'left the group'), 'leaving sends no push');
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select public.send_message(pg_temp.id('chat'), 'Who''s bringing chips?');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002'), 'Bea gets no push after leaving');
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001' and url = '/chats/' || pg_temp.id('chat')), 'Sam (still in it) does get the push');

-- ---------------------------------------------------------------------
-- 5. Rejoining
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.rejoin_thread(pg_temp.id('chat'));
select pg_temp.expect(public.can_use_thread(pg_temp.id('chat')), 'Bea can use the chat again');
select pg_temp.expect((select unread from public.my_threads() where id = pg_temp.id('chat')) = 0, 'messages from while she was away are not unread');
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('chat') and kind = 'rejoined') = 1, 'a "rejoined" note was added');
select public.rejoin_thread(pg_temp.id('chat')); -- already in: no second note
select pg_temp.expect((select count(*) from public.messages where thread_id = pg_temp.id('chat') and kind = 'rejoined') = 1, 'rejoining twice adds no second note');
select pg_temp.as_server();
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select public.send_message(pg_temp.id('chat'), 'Welcome back');
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002'), 'Bea gets pushes again after rejoining');

-- Someone who isn't going can't rejoin (or join) through it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$select public.rejoin_thread(pg_temp.id('chat'))$$), 'someone not going cannot rejoin');

-- No longer going: no longer in the chat, whether or not they left it.
select pg_temp.as_server();
delete from public.event_entries where event_id = pg_temp.id('event') and user_id = '00000000-0000-0000-0000-000000000003';
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not public.can_use_thread(pg_temp.id('chat')) and not exists (select 1 from public.threads where id = pg_temp.id('chat')), 'someone who stopped going is out of the chat as before');

-- ---------------------------------------------------------------------
-- 6. A Social plan's chat works the same way
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.leave_thread(pg_temp.id('plan_chat'));
select pg_temp.expect(not public.can_use_thread(pg_temp.id('plan_chat')), 'Bea left the Social plan''s chat');
select pg_temp.expect(public.social_is_going(pg_temp.id('plan')), 'and is still going to the plan');
select pg_temp.as_server();
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.send_message(pg_temp.id('plan_chat'), 'Bring a blanket');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002'), 'no push to Bea from the plan''s chat');

-- ---------------------------------------------------------------------
-- 7. Private chats still work as before
-- ---------------------------------------------------------------------
select pg_temp.as_server();
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.send_message(pg_temp.id('dm'), 'Hey Bea');
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002' and title = 'Sam Student'), 'private messages still push');

rollback;
