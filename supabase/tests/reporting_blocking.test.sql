-- 20261128000000_reporting_blocking.sql: reports (and their emails),
-- blocking both ways, bans, and group chat admins deleting messages.
--
--   A society managed by Sam; an event that Bea and Cas are going to (its
--   group chat: Sam is its admin). Sam and Bea are friends. Ada is a
--   Function admin.
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
\ir ../migrations/20261128000000_reporting_blocking.sql
select pg_temp.expect((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
  where p.oid in ('public.admin_set_ban(uuid, integer, text)'::regprocedure, 'public.admin_lift_ban(uuid)'::regprocedure, 'public.my_blocked_people()'::regprocedure,
                  'public.unblock_user(uuid)'::regprocedure, 'public.email_on_report()'::regprocedure, 'public.queue_report_email(text, text, text, uuid, text, text)'::regprocedure)),
  'the new functions are security definer with an empty search path');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.queue_report_email(text, text, text, uuid, text, text)', 'execute'), 'nobody using the app can queue an email');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.email_queue', 'select') and not has_table_privilege('authenticated', 'public.email_queue', 'insert'), 'nobody using the app can read or write the email queue');

-- ---------------------------------------------------------------------
-- Set-up
-- ---------------------------------------------------------------------
select pg_temp.as_server();
update public.profiles set display_name = 'Sam' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Bea' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Cas' where id = '00000000-0000-0000-0000-000000000003';
insert into public.societies (id, slug, name, university) values ('7f000000-0000-0000-0000-000000000001', 'rb-s', 'Safety Society', 'LSE');
insert into public.society_admins (society_id, user_id) values ('7f000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000002', 'ios', 'ExponentPushToken[rb-bea]'),
  ('00000000-0000-0000-0000-000000000003', 'ios', 'ExponentPushToken[rb-cas]')
on conflict (token) do nothing;
delete from public.notification_settings where user_id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted') on conflict do nothing;
create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;
with x as (
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience)
  values ('7f000000-0000-0000-0000-000000000001', 'RB Night', 'social', (select id from public.venues order by id limit 1), now() + interval '2 days', now() + interval '2 days 3 hours', 'london')
  returning id)
insert into ids select 'event', id from x;
insert into public.event_entries (event_id, user_id, status) values
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000002', 'going'),
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000003', 'going');
insert into public.threads (event_id) values (pg_temp.id('event')) on conflict (event_id) do nothing;
insert into ids select 'chat', id from public.threads where event_id = pg_temp.id('event');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
insert into ids values ('cas_msg', public.send_message(pg_temp.id('chat'), 'You are all idiots'));
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
insert into ids values ('bea_msg', public.send_message(pg_temp.id('chat'), 'Hi everyone'));
select pg_temp.as_server();
delete from public.email_queue;
delete from public.push_queue;

-- ---------------------------------------------------------------------
-- 1. Reports are saved and emailed
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
insert into public.reports (message_id, reason, details) values (pg_temp.id('cas_msg'), 'Harassment or bullying', 'He keeps doing this');
insert into public.reports (reported_user_id, reason) values ('00000000-0000-0000-0000-000000000003', 'Fake account');
insert into public.reports (event_id, reason) values (pg_temp.id('event'), 'Spam');
select pg_temp.expect(pg_temp.fails($$insert into public.reports (reported_user_id, reason, reporter_id) values ('00000000-0000-0000-0000-000000000003', 'Spam', '00000000-0000-0000-0000-000000000001')$$), 'nobody can file a report as someone else');
select pg_temp.expect(pg_temp.fails($$insert into public.reports (reported_user_id, reason, status) values ('00000000-0000-0000-0000-000000000003', 'Spam', 'dismissed')$$), 'a report can only be filed open');
select pg_temp.expect((select count(*) from public.reports where reporter_id = '00000000-0000-0000-0000-000000000002') = 3, 'Bea''s three reports are saved (she can see her own)');
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.email_queue) = 3, 'each report queued one email');
select pg_temp.expect((select bool_and(to_address = 'help@studentfunction.com') from public.email_queue), 'to help@studentfunction.com');
select pg_temp.expect((select subject from public.email_queue where body like '%You are all idiots%') = '[Function report] a chat message: Harassment or bullying', 'the message email says what and why');
select pg_temp.expect((select body like '%Reported by: Bea <bea@lse.ac.uk>%' and body like '%Sent by: Cas <cas@ucl.ac.uk>%' and body like '%Note: He keeps doing this%' and body like '%within 24 hours%' from public.email_queue where body like '%You are all idiots%'), 'and who reported it, who sent it, the note and the 24-hour promise');
select pg_temp.expect(exists (select 1 from public.email_queue where subject like '%a person: Fake account' and body like '%https://studentfunction.com/u/00000000-0000-0000-0000-000000000003%'), 'a person report links to their profile');
-- A Social plan report with a note.
with x as (
  insert into public.social_events (host_id, title, category, starts_at, ends_at, area, lat, lng, spaces)
  values ('00000000-0000-0000-0000-000000000003', 'RB Plan', (select enum_range(null::public.social_category))[1], now() + interval '1 day', now() + interval '1 day 2 hours', 'Soho', 51.51, -0.13, 6)
  returning id)
insert into ids select 'plan', id from x;
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
insert into public.social_reports (event_id, reason, details) values (pg_temp.id('plan'), 'Inappropriate or explicit content', 'The description');
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.email_queue where subject like '%a Social plan%' and body like '%Note: The description%'), 'Social plan reports are emailed, with their note');

-- ---------------------------------------------------------------------
-- 2. Group chat admins delete messages; members can't delete others'
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.delete_message(pg_temp.id('cas_msg'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is null from public.messages where id = pg_temp.id('cas_msg')), 'Bea (a member) cannot delete Cas''s message');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.delete_message(pg_temp.id('cas_msg'));
select pg_temp.as_server();
select pg_temp.expect((select deleted_at is not null from public.messages where id = pg_temp.id('cas_msg')), 'Sam (the chat''s admin, the society organiser) deletes it');

-- ---------------------------------------------------------------------
-- 3. Blocking, both ways
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.block_user('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(public.i_blocked('00000000-0000-0000-0000-000000000003'), 'Bea blocked Cas');
select pg_temp.expect(not exists (select 1 from public.profile_cards where id = '00000000-0000-0000-0000-000000000003'), 'Bea can no longer see or find Cas''s profile');
select pg_temp.expect(exists (select 1 from public.profile_cards where id = '00000000-0000-0000-0000-000000000001'), 'Bea still sees everyone else');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.profile_cards where id = '00000000-0000-0000-0000-000000000002'), 'Cas can no longer see or find Bea''s profile (both ways)');
select pg_temp.expect(not public.i_blocked('00000000-0000-0000-0000-000000000002'), 'Cas didn''t block Bea (so he gets no Unblock button)');
select pg_temp.expect(not exists (select 1 from public.messages where id = pg_temp.id('bea_msg')), 'Cas no longer sees Bea''s messages in the group chat');
select public.send_message(pg_temp.id('chat'), 'Still here');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not exists (select 1 from public.messages where thread_id = pg_temp.id('chat') and sender_id = '00000000-0000-0000-0000-000000000003'), 'Bea no longer sees Cas''s messages in the group chat');
select pg_temp.expect((select unread from public.my_threads() where id = pg_temp.id('chat')) = 0, 'Cas''s new message isn''t unread for Bea');
select pg_temp.expect((select last_body from public.my_threads() where id = pg_temp.id('chat')) is distinct from 'Still here', 'nor shown as the chat''s latest message');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002' and body = 'Still here'), 'Bea gets no push for Cas''s message');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.error_of($$select public.send_friend_request('00000000-0000-0000-0000-000000000002')$$) is not null, 'Cas cannot add Bea');
select pg_temp.expect(pg_temp.fails($$select public.open_dm('00000000-0000-0000-0000-000000000002')$$), 'nor message her');
-- Settings → Privacy: Bea's list, and unblocking.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select name from public.my_blocked_people()) = 'Cas', 'Bea''s blocked list shows Cas by name');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.my_blocked_people()), 'Cas''s list is empty (he blocked nobody)');
select public.unblock_user('00000000-0000-0000-0000-000000000002');
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.user_blocks where blocker_id = '00000000-0000-0000-0000-000000000002'), 'Cas can''t undo Bea''s block');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.unblock_user('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(exists (select 1 from public.profile_cards where id = '00000000-0000-0000-0000-000000000003') and exists (select 1 from public.messages where thread_id = pg_temp.id('chat') and sender_id = '00000000-0000-0000-0000-000000000003'), 'after Bea unblocks, they see each other again');
-- The Function team keep seeing names on reports, even of someone they blocked.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select public.block_user('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(exists (select 1 from public.profile_cards where id = '00000000-0000-0000-0000-000000000003'), 'an admin who blocked Cas still sees his name (for reports)');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.profile_cards where id = '00000000-0000-0000-0000-0000000000a0'), 'but Cas no longer sees the admin who blocked him');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select public.unblock_user('00000000-0000-0000-0000-000000000003');

-- ---------------------------------------------------------------------
-- 4. Bans
-- ---------------------------------------------------------------------
select pg_temp.as_server();
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-000000000003');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$select public.admin_set_ban('00000000-0000-0000-0000-000000000003', 7, 'Abuse')$$) like '%Function team%', 'a society organiser cannot ban anyone');
select pg_temp.expect(pg_temp.fails($$select * from public.account_bans$$) or not exists (select 1 from public.account_bans), 'nor read the ban list');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.error_of($$select public.admin_set_ban('00000000-0000-0000-0000-0000000000a0', null, 'x')$$) like '%yourself%', 'an admin cannot ban themselves');
select pg_temp.expect(pg_temp.error_of($$select public.admin_set_ban('00000000-0000-0000-0000-000000000003', 7, '  ')$$) like '%Say why%', 'a reason is needed');
select public.admin_set_ban('00000000-0000-0000-0000-000000000003', 7, 'Abusive messages in a group chat');
select pg_temp.expect((select until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.account_bans where user_id = '00000000-0000-0000-0000-000000000003'), 'Ada suspends Cas for 7 days');
select pg_temp.as_server();
select pg_temp.expect((select banned_until > now() + interval '6 days' from auth.users where id = '00000000-0000-0000-0000-000000000003'), 'Supabase Auth won''t log him in until then');
select pg_temp.expect(not exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-000000000003'), 'and he is logged out everywhere');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select public.admin_set_ban('00000000-0000-0000-0000-000000000003', null, 'Repeated abuse');
select pg_temp.as_server();
select pg_temp.expect((select banned_until = 'infinity'::timestamptz from auth.users where id = '00000000-0000-0000-0000-000000000003'), 'a ban has no end date');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select public.admin_lift_ban('00000000-0000-0000-0000-000000000003');
select pg_temp.as_server();
select pg_temp.expect((select banned_until is null from auth.users where id = '00000000-0000-0000-0000-000000000003') and not exists (select 1 from public.account_bans), 'Ada lifts it');

rollback;
