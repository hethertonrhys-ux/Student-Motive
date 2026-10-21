-- 20261127000000_chat_pins_admins.sql: pinned messages and group chat admins.
--
--   A society managed by Sam; an event that Bea and Cas are going to (its
--   group chat; Sam is its organiser, so an admin). Sam and Bea are friends
--   (a private chat). Ada is a Function admin who isn't in the chats.
--
-- Everything runs in one transaction that is rolled back at the end.
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
\ir ../migrations/20261127000000_chat_pins_admins.sql
select pg_temp.expect((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
  where p.oid in ('public.thread_members(uuid)'::regprocedure, 'public.set_thread_admin(uuid, uuid, boolean)'::regprocedure, 'public.remove_from_thread(uuid, uuid)'::regprocedure,
                  'public.pin_message(uuid)'::regprocedure, 'public.unpin_message(uuid)'::regprocedure, 'public.add_back_to_thread(uuid, uuid)'::regprocedure)),
  'the new functions are security definer with an empty search path');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.thread_admin_of(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.thread_people(uuid)', 'execute'), 'the helpers can''t be called from the app');
select pg_temp.expect(not has_function_privilege('anon', 'public.remove_from_thread(uuid, uuid)', 'execute'), 'logged-out visitors can''t remove anyone');

-- ---------------------------------------------------------------------
-- Set-up
-- ---------------------------------------------------------------------
select pg_temp.as_server();
update public.profiles set display_name = 'Sam' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Bea' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Cas' where id = '00000000-0000-0000-0000-000000000003';
insert into public.societies (id, slug, name, university) values ('7e000000-0000-0000-0000-000000000001', 'pa-s', 'Pin Society', 'LSE');
insert into public.society_admins (society_id, user_id) values ('7e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000002', 'ios', 'ExponentPushToken[pa-bea]'),
  ('00000000-0000-0000-0000-000000000003', 'ios', 'ExponentPushToken[pa-cas]')
on conflict (token) do nothing;
delete from public.notification_settings where user_id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted') on conflict do nothing;
create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;
with x as (
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience)
  values ('7e000000-0000-0000-0000-000000000001', 'PA Night', 'social', (select id from public.venues order by id limit 1), now() + interval '2 days', now() + interval '2 days 3 hours', 'london')
  returning id)
insert into ids select 'event', id from x;
insert into public.event_entries (event_id, user_id, status) values
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000002', 'going'),
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000003', 'going');
insert into public.threads (event_id) values (pg_temp.id('event')) on conflict (event_id) do nothing;
insert into ids select 'chat', id from public.threads where event_id = pg_temp.id('event');
insert into public.threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') on conflict do nothing;
insert into ids select 'dm', id from public.threads where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
insert into ids values ('bea_msg', public.send_message(pg_temp.id('chat'), 'Bea here'));
insert into ids values ('dm_msg', public.send_message(pg_temp.id('dm'), 'Hi Sam'));
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into ids values ('sam_msg', public.send_message(pg_temp.id('chat'), 'Doors at 7'));
insert into ids values ('sam_msg2', public.send_message(pg_temp.id('chat'), 'Bring cash'));

-- ---------------------------------------------------------------------
-- 1. The member list
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.thread_members(pg_temp.id('chat'))) = 3, 'Bea sees the 3 people in the chat');
select pg_temp.expect((select is_admin and is_organiser from public.thread_members(pg_temp.id('chat')) where user_id = '00000000-0000-0000-0000-000000000001'), 'Sam (the society''s committee) is listed as an organiser and admin');
select pg_temp.expect(not exists (select 1 from public.thread_members(pg_temp.id('chat')) where user_id <> '00000000-0000-0000-0000-000000000001' and is_admin), 'nobody else is an admin yet');
select pg_temp.expect(not exists (select 1 from public.thread_members(pg_temp.id('dm'))), 'private chats have no member list');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(not exists (select 1 from public.thread_members(pg_temp.id('chat'))), 'someone not in the chat (even a Function admin) sees no members');

-- ---------------------------------------------------------------------
-- 2. Pinning
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.pin_message(pg_temp.id('sam_msg'))$$) like '%Only the chat''s admins%', 'Bea (not an admin) cannot pin in the group chat');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.pin_message(pg_temp.id('sam_msg'));
select pg_temp.expect((select pinned_message_id from public.threads where id = pg_temp.id('chat')) = pg_temp.id('sam_msg'), 'Sam (admin) pins a message');
select public.pin_message(pg_temp.id('bea_msg'));
select pg_temp.expect((select pinned_message_id from public.threads where id = pg_temp.id('chat')) = pg_temp.id('bea_msg'), 'pinning another message replaces it (one at a time)');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select pinned_message_id from public.threads where id = pg_temp.id('chat')) = pg_temp.id('bea_msg'), 'everyone in the chat sees the same pinned message');
select pg_temp.expect(pg_temp.fails($$select public.unpin_message(pg_temp.id('chat'))$$), 'Cas (not an admin) cannot unpin');
select pg_temp.expect(pg_temp.fails($$update public.threads set pinned_message_id = null where id = pg_temp.id('chat')$$) or (select pinned_message_id from public.threads where id = pg_temp.id('chat')) = pg_temp.id('bea_msg'), 'nobody can change the pin directly');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.unpin_message(pg_temp.id('chat'));
select pg_temp.expect((select pinned_message_id is null from public.threads where id = pg_temp.id('chat')), 'Sam unpins it');
select pg_temp.expect(pg_temp.fails($$select public.pin_message(pg_temp.id('dm_msg'))$$) is false, 'in a private chat Sam can pin');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.pin_message(pg_temp.id('dm_msg'));
select public.unpin_message(pg_temp.id('dm'));
select pg_temp.expect((select pinned_message_id is null from public.threads where id = pg_temp.id('dm')), 'and so can Bea (either person)');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.fails($$select public.pin_message(pg_temp.id('dm_msg'))$$), 'Cas cannot pin in a chat he is not in');
-- Deleting the pinned message unpins it.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.pin_message(pg_temp.id('sam_msg2'));
select public.delete_message(pg_temp.id('sam_msg2'));
select pg_temp.expect((select pinned_message_id is null from public.threads where id = pg_temp.id('chat')), 'deleting the pinned message unpins it');
select pg_temp.expect(pg_temp.fails($$select public.pin_message(pg_temp.id('sam_msg2'))$$), 'a deleted message cannot be pinned');

-- ---------------------------------------------------------------------
-- 3. Making admins, and never zero admins
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002', true)$$), 'Bea cannot make herself an admin');
select pg_temp.expect(pg_temp.fails($$insert into public.thread_admins (thread_id, user_id) values (pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002')$$), 'nor write to the admin list directly');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000001', false)$$) like '%always admins%', 'the organiser cannot be demoted');
select pg_temp.expect(pg_temp.error_of($$select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-0000000000a0', true)$$) like '%not in this chat%', 'someone not in the chat cannot be made admin');
select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002', true);
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.is_thread_admin(pg_temp.id('chat')), 'Sam made Bea an admin');
select public.pin_message(pg_temp.id('bea_msg'));
select pg_temp.expect((select pinned_message_id from public.threads where id = pg_temp.id('chat')) = pg_temp.id('bea_msg'), 'now Bea can pin');
-- The last admin can't leave: Sam leaves (Bea is still an admin), then Bea is the only one.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.leave_thread(pg_temp.id('chat'));
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.leave_thread(pg_temp.id('chat'))$$) like '%only admin%', 'Bea, the only admin left in the chat, cannot leave');
select pg_temp.expect(pg_temp.error_of($$select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002', false)$$) like '%at least one admin%', 'nor step down');
select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000003', true);
select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002', false);
select pg_temp.expect(not public.is_thread_admin(pg_temp.id('chat')), 'with Cas made admin, Bea can step down');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.rejoin_thread(pg_temp.id('chat'));

-- ---------------------------------------------------------------------
-- 4. Removing someone
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.remove_from_thread(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000003')$$) like '%Only the chat''s admins%', 'Bea (no longer an admin) cannot remove Cas');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.error_of($$select public.remove_from_thread(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000001')$$) like '%Organisers%', 'an admin cannot remove the organiser');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$select public.remove_from_thread(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000001')$$) like '%Leave group%', 'you remove yourself by leaving, not here');
select pg_temp.as_server();
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.remove_from_thread(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select body from public.messages where thread_id = pg_temp.id('chat') and kind = 'removed') = 'removed Bea from the group', 'everyone sees "Sam removed Bea"');
select pg_temp.expect(exists (select 1 from public.thread_members(pg_temp.id('chat')) where user_id = '00000000-0000-0000-0000-000000000002' and removed), 'the admin sees Bea under Removed');
select public.send_message(pg_temp.id('chat'), 'After Bea');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002'), 'Bea gets no more pushes from the chat');
select pg_temp.expect(not exists (select 1 from public.push_queue where body like 'removed%'), 'the removal note sends no push');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not public.can_use_thread(pg_temp.id('chat')) and not exists (select 1 from public.my_threads() where id = pg_temp.id('chat')), 'Bea can no longer use the chat or see it in her list');
select pg_temp.expect(public.is_going_to(pg_temp.id('event')), 'removing her from the chat kept her place at the event');
select pg_temp.expect(pg_temp.error_of($$select public.rejoin_thread(pg_temp.id('chat'))$$) like '%removed you%', 'Bea cannot rejoin by herself');
select pg_temp.expect(exists (select 1 from public.thread_leaves where thread_id = pg_temp.id('chat') and removed_by is not null), 'Bea can see that she was removed');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(exists (select 1 from public.thread_members(pg_temp.id('chat')) where removed), 'Cas (an admin) sees the Removed list');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.set_thread_admin(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000003', false);
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.thread_members(pg_temp.id('chat')) where removed), 'once he is no longer an admin, Cas does not see the Removed list');
select pg_temp.expect((select unread from public.my_threads() where id = pg_temp.id('chat')) >= 0, 'the list still works for Cas');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.add_back_to_thread(pg_temp.id('chat'), '00000000-0000-0000-0000-000000000002');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.can_use_thread(pg_temp.id('chat')), 'Sam added Bea back');

rollback;
