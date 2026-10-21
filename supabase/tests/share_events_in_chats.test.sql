-- 20261125000000_share_events_in_chats.sql: sharing events into chats.
--
--   S  sh-s  LSE society managed by Sam; a published event that Bea and Cas
--            are going to (its group chat); a draft; a cancelled event.
--   A friends-only Social plan hosted by Bea (Cas isn't her friend), and a
--   private Social plan hosted by Sam.
--   Sam and Bea are friends (a private chat between them).
--
-- Everything runs in one transaction that is rolled back at the end.
begin;

create or replace function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- ---------------------------------------------------------------------
-- 0. Running the migration a second time works
-- ---------------------------------------------------------------------
reset role;
\ir ../migrations/20261125000000_share_events_in_chats.sql
select pg_temp.expect((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
  where p.oid in ('public.is_thread_admin(uuid)'::regprocedure, 'public.may_share_events(uuid)'::regprocedure, 'public.set_members_can_share_events(uuid, boolean)'::regprocedure)),
  'the new functions are security definer with an empty search path');
select pg_temp.expect(not has_function_privilege('anon', 'public.set_members_can_share_events(uuid, boolean)', 'execute'), 'logged-out visitors cannot change the setting');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.fill_shared_event_message()', 'execute'), 'nobody using the app can call the trigger function');

-- ---------------------------------------------------------------------
-- Set-up
-- ---------------------------------------------------------------------
select pg_temp.as_server();
update public.profiles set display_name = 'Sam Student' where id = '00000000-0000-0000-0000-000000000001';
insert into public.societies (id, slug, name, university) values ('7c000000-0000-0000-0000-000000000001', 'sh-s', 'Share Society', 'LSE');
insert into public.society_admins (society_id, user_id) values ('7c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000002', 'ios', 'ExponentPushToken[sh-bea]'),
  ('00000000-0000-0000-0000-000000000003', 'ios', 'ExponentPushToken[sh-cas]')
on conflict (token) do nothing;
delete from public.notification_settings where user_id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted') on conflict do nothing;

create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;
create or replace function pg_temp.event(title text, draft boolean, cancelled boolean) returns uuid language sql as $$
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience, is_draft, is_cancelled)
  values ('7c000000-0000-0000-0000-000000000001', title, 'social', (select id from public.venues order by id limit 1), now() + interval '2 days', now() + interval '2 days 3 hours', 'london', draft, cancelled)
  returning id;
$$;
insert into ids values ('event', pg_temp.event('SH Quiz', false, false)), ('draft', pg_temp.event('SH Draft', true, false)), ('cancelled', pg_temp.event('SH Off', false, true));
insert into public.event_entries (event_id, user_id, status) values
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000002', 'going'),
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000003', 'going');
insert into public.threads (event_id) values (pg_temp.id('event')) on conflict (event_id) do nothing;
insert into ids select 'chat', id from public.threads where event_id = pg_temp.id('event');
with x as (
  insert into public.social_events (host_id, title, category, starts_at, ends_at, area, lat, lng, spaces, friends_only)
  values ('00000000-0000-0000-0000-000000000002', 'SH Bea''s friends only', (select enum_range(null::public.social_category))[1], now() + interval '1 day', now() + interval '1 day 2 hours', 'Soho', 51.51, -0.13, 6, true)
  returning id)
insert into ids select 'friends_plan', id from x;
with x as (
  insert into public.social_events (host_id, title, category, starts_at, ends_at, area, lat, lng, spaces, is_private)
  values ('00000000-0000-0000-0000-000000000001', 'SH Sam''s private dinner', (select enum_range(null::public.social_category))[1], now() + interval '1 day', now() + interval '1 day 2 hours', 'Holborn', 51.52, -0.12, 2, true)
  returning id)
insert into ids select 'private_plan', id from x;
insert into public.threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') on conflict do nothing;
insert into ids select 'dm', id from public.threads where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

create or replace function pg_temp.share(tid uuid, eid uuid, sid uuid) returns boolean language plpgsql as $$
begin
  insert into public.messages (thread_id, sender_id, body, kind, event_id, social_event_id)
  values (tid, nullif(current_setting('request.jwt.claim.sub', true), '')::uuid, '.', 'event', eid, sid);
  return true;
exception when others then
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 1. Sharing into a group chat and a private chat
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.share(pg_temp.id('chat'), pg_temp.id('event'), null), 'Bea shares the event into its group chat');
select pg_temp.expect((select body from public.messages where thread_id = pg_temp.id('chat') and kind = 'event' order by created_at desc limit 1)
  = 'Shared an event: SH Quiz https://studentfunction.com/e/' || pg_temp.id('event'), 'the server wrote the text (for app versions without cards)');
select pg_temp.expect(pg_temp.share(pg_temp.id('dm'), null, pg_temp.id('friends_plan')), 'Bea shares her own friends-only plan with Sam (a friend) in their private chat');
select pg_temp.expect(pg_temp.share(pg_temp.id('dm'), null, pg_temp.id('private_plan')), 'a private plan can be shared (people still have to ask to join)');
select pg_temp.expect((select unread from public.my_threads() where id = pg_temp.id('chat')) = 0, 'your own shared event is not unread for you');

-- Pushes: the others are told, like a message, without the link.
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000003' and body = 'Shared an event: SH Quiz'), 'Cas gets a push "Shared an event: SH Quiz"');

-- ---------------------------------------------------------------------
-- 2. What can't be shared
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not pg_temp.share(pg_temp.id('chat'), null, pg_temp.id('friends_plan')), 'Cas cannot share a friends-only plan he cannot see');
select pg_temp.expect(not pg_temp.share(pg_temp.id('chat'), pg_temp.id('draft'), null), 'a draft cannot be shared (even its existence)');
select pg_temp.expect(not pg_temp.share(pg_temp.id('chat'), pg_temp.id('cancelled'), null), 'a cancelled event cannot be shared');
select pg_temp.expect(not pg_temp.share(pg_temp.id('dm'), pg_temp.id('event'), null), 'Cas cannot post into a private chat he is not in');
select pg_temp.expect(pg_temp.fails($$insert into public.messages (thread_id, sender_id, body) values (pg_temp.id('chat'), '00000000-0000-0000-0000-000000000003', 'sneaky')$$), 'ordinary messages still cannot be inserted directly');
select pg_temp.expect(pg_temp.fails($$insert into public.messages (thread_id, sender_id, body, kind, event_id) values (pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002', '.', 'event', pg_temp.id('event'))$$), 'nobody can share as someone else');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(not pg_temp.share(pg_temp.id('chat'), pg_temp.id('draft'), null), 'even the committee cannot share a draft');

-- Sharing doesn't let anyone in: Cas still can't see the friends-only plan,
-- and the private plan still needs a request.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.social_events where id = pg_temp.id('friends_plan')), 'a shared friends-only plan stays hidden from non-friends');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.social_event_members where event_id = pg_temp.id('private_plan')), 'sharing the private plan added nobody to it');

-- ---------------------------------------------------------------------
-- 3. The group chat setting
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('chat')), 'Bea (going) is not an admin of the event chat');
select pg_temp.expect(pg_temp.fails($$select public.set_members_can_share_events(pg_temp.id('chat'), false)$$), 'Bea cannot switch sharing off');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(public.is_thread_admin(pg_temp.id('chat')), 'Sam (the society''s committee) is an admin of the event chat');
select public.set_members_can_share_events(pg_temp.id('chat'), false);
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not pg_temp.share(pg_temp.id('chat'), pg_temp.id('event'), null), 'with sharing off, Bea cannot share into the group chat');
select pg_temp.expect(pg_temp.share(pg_temp.id('dm'), pg_temp.id('event'), null), 'the setting does not apply to private chats');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.share(pg_temp.id('chat'), pg_temp.id('event'), null), 'with sharing off, the admin (Sam) still can');
select public.set_members_can_share_events(pg_temp.id('chat'), true);
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.share(pg_temp.id('chat'), pg_temp.id('event'), null), 'switched back on, Bea can share again');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$select public.set_members_can_share_events(pg_temp.id('chat'), false)$$), 'an app admin who is not in the chat cannot change it');

-- Someone who left the chat can't share into it.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select public.leave_thread(pg_temp.id('chat'));
select pg_temp.expect(not pg_temp.share(pg_temp.id('chat'), pg_temp.id('event'), null), 'after leaving, Cas cannot share into the chat');

rollback;
