-- 20261120000000_feature_requests_founding.sql: feature requests, Founding
-- Society progress, the Function team's Hub lists and the weekly nudge.
--
--   R  fr-r  LSE, managed by Sam, Eve and Fay (Sam and Eve have phones set
--            up for pushes; Fay doesn't)
--   O  fr-o  UCL, managed by Cas (another society's manager)
--   F  fr-f  LSE, a Founding Society managed by Sam, agreed 10 days ago
--   G  fr-g  LSE, a Founding Society that hasn't agreed yet
--   H  fr-h  LSE, a Founding Society that posted 2 days ago
--   Bea is a student who manages nothing; Ada is a Function admin.
--
-- Everything runs in one transaction that is rolled back at the end, so the
-- other test files never see these societies.
begin;

-- Set up data as the database itself (no logged-in user).
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

select pg_temp.as_server();
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'eve@lse.ac.uk'),
  ('00000000-0000-0000-0000-0000000000f1', 'fay@lse.ac.uk')
on conflict (id) do nothing;
update public.profiles set display_name = 'Sam Student' where id = '00000000-0000-0000-0000-000000000001';
insert into public.societies (id, slug, name, university) values
  ('50000000-0000-0000-0000-000000000001', 'fr-r', 'Requests Society', 'LSE'),
  ('50000000-0000-0000-0000-000000000002', 'fr-o', 'Other Society', 'UCL'),
  ('50000000-0000-0000-0000-000000000003', 'fr-f', 'Founding Society F', 'LSE'),
  ('50000000-0000-0000-0000-000000000004', 'fr-g', 'Founding Society G', 'LSE'),
  ('50000000-0000-0000-0000-000000000005', 'fr-h', 'Founding Society H', 'LSE');
insert into public.society_admins (society_id, user_id) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1'),
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e1'),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1');
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000001', 'ios', 'ExponentPushToken[fr-sam]'),
  ('00000000-0000-0000-0000-0000000000e1', 'android', 'ExponentPushToken[fr-eve]')
on conflict (token) do nothing;
delete from public.push_queue;

-- ---------------------------------------------------------------------
-- 1. Managers send requests for their own society only
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.feature_requests (id, society_id, need, current_process)
values ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Check people in at the door with a QR code', 'A printed list and a pen');
select pg_temp.as_server();
select pg_temp.expect((select status = 'new' and requested_by = '00000000-0000-0000-0000-000000000001' and admin_note is null
  and status_changed_at is null and created_at > now() - interval '1 minute'
  from public.feature_requests where id = '51000000-0000-0000-0000-000000000001'), 'a manager''s request is stored as new, in their name');

select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need, status) values ('50000000-0000-0000-0000-000000000001', 'Already live please', 'live')$$), 'a manager cannot send a request that is already live');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need, admin_note) values ('50000000-0000-0000-0000-000000000001', 'With a note', 'Approved')$$), 'a manager cannot write the admin note');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need, requested_by) values ('50000000-0000-0000-0000-000000000001', 'In Bea''s name', '00000000-0000-0000-0000-000000000002')$$), 'a request cannot be sent in someone else''s name');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need) values ('50000000-0000-0000-0000-000000000002', 'For another society')$$), 'a manager cannot send a request for another society');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need) values ('50000000-0000-0000-0000-000000000001', '  ab  ')$$), 'a need under 3 characters is refused');
select pg_temp.expect(pg_temp.fails(format($$insert into public.feature_requests (society_id, need) values ('50000000-0000-0000-0000-000000000001', %L)$$, repeat('x', 1001))), 'a need over 1000 characters is refused');
select pg_temp.expect(pg_temp.fails(format($$insert into public.feature_requests (society_id, need, current_process) values ('50000000-0000-0000-0000-000000000001', 'Fine', %L)$$, repeat('x', 1001))), 'how they do it now over 1000 characters is refused');
-- Dates are the server's.
insert into public.feature_requests (id, society_id, need, created_at, status_changed_at)
values ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'Polls in the group chat', '2020-01-01', '2020-01-01');
select pg_temp.as_server();
select pg_temp.expect((select created_at > now() - interval '1 minute' and status_changed_at is null
  from public.feature_requests where id = '51000000-0000-0000-0000-000000000002'), 'the app cannot backdate a request');

select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need) values ('50000000-0000-0000-0000-000000000001', 'A student asks')$$), 'a student cannot send a request');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need) values ('50000000-0000-0000-0000-000000000001', 'The admin asks')$$), 'a Function admin who isn''t a manager cannot send one for the society');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need) values ('50000000-0000-0000-0000-000000000001', 'Logged out')$$), 'a logged-out visitor cannot send a request');

select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
insert into public.feature_requests (id, society_id, need) values ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'Chess tournament brackets');

-- ---------------------------------------------------------------------
-- 2. Who reads requests
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.feature_requests) = 2, 'a manager reads their own society''s requests');
select pg_temp.expect((select count(*) from public.feature_requests where society_id = '50000000-0000-0000-0000-000000000002') = 0, 'but not another society''s');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.feature_requests) = 1, 'another society''s manager reads only their own');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.feature_requests) = 0, 'a student reads none');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select count(*) from public.feature_requests$$), 'a logged-out visitor cannot read requests');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from public.feature_requests) = 3, 'a Function admin reads every request');

-- ---------------------------------------------------------------------
-- 3. Only Function admins change requests
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.feature_requests set status = 'live' where id = '51000000-0000-0000-0000-000000000001';
update public.feature_requests set admin_note = 'Done' where id = '51000000-0000-0000-0000-000000000001';
update public.feature_requests set need = 'Something else entirely' where id = '51000000-0000-0000-0000-000000000001';
delete from public.feature_requests where id = '51000000-0000-0000-0000-000000000001';
select pg_temp.as_server();
select pg_temp.expect((select status = 'new' and admin_note is null and need like 'Check people in%'
  from public.feature_requests where id = '51000000-0000-0000-0000-000000000001'), 'a manager cannot change the status, the note or the request, nor delete it');
select pg_temp.expect((select count(*) from public.push_queue) = 0, 'and nobody was told it went live');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
update public.feature_requests set status = 'declined';
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.feature_requests where status = 'declined') = 0, 'a student cannot change any request');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.feature_requests set status = 'building', admin_note = 'On it this week' where id = '51000000-0000-0000-0000-000000000001';
select pg_temp.as_server();
select pg_temp.expect((select status = 'building' and admin_note = 'On it this week' and status_changed_at is not null and updated_at is not null
  from public.feature_requests where id = '51000000-0000-0000-0000-000000000001'), 'a Function admin changes the status and the note; the change is stamped');
select pg_temp.expect((select count(*) from public.push_queue) = 0, 'building tells nobody');
-- Changing only the note leaves status_changed_at alone.
update public.feature_requests set status_changed_at = '2026-01-01' where id = '51000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.feature_requests set admin_note = 'Nearly there' where id = '51000000-0000-0000-0000-000000000001';
select pg_temp.as_server();
select pg_temp.expect((select status_changed_at = '2026-01-01'::timestamptz from public.feature_requests where id = '51000000-0000-0000-0000-000000000001'), 'a note alone doesn''t change status_changed_at');
-- The admin can't move a request to another society (its managers are told when it goes live).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.feature_requests set society_id = '50000000-0000-0000-0000-000000000002', requested_by = '00000000-0000-0000-0000-000000000003' where id = '51000000-0000-0000-0000-000000000001';
select pg_temp.as_server();
select pg_temp.expect((select society_id = '50000000-0000-0000-0000-000000000001' and requested_by = '00000000-0000-0000-0000-000000000001'
  from public.feature_requests where id = '51000000-0000-0000-0000-000000000001'), 'which society and who asked never change');

-- Live: each manager with a phone set up gets one Society Hub push.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.feature_requests set status = 'live' where id = '51000000-0000-0000-0000-000000000001';
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.push_queue where kind = 'hub' and title = 'Your feature request is live'
  and body = 'Check people in at the door with a QR code' and url = '/hub/50000000-0000-0000-0000-000000000001/requests'
  and user_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1')) = 2, 'Sam and Eve each get a push opening the Hub''s Requests page');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-0000000000f1') = 0, 'Fay, with no phone set up, gets no push row');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-000000000003') = 0, 'another society''s manager is not told');
select pg_temp.expect((select count(*) from public.push_queue where dedupe_key = 'request-live:51000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000001') = 1, 'the dedupe key names the request and the person');
-- Back to building and live again: no second push.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.feature_requests set status = 'building' where id = '51000000-0000-0000-0000-000000000001';
update public.feature_requests set status = 'live' where id = '51000000-0000-0000-0000-000000000001';
update public.feature_requests set admin_note = 'Live now' where id = '51000000-0000-0000-0000-000000000001';
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.push_queue) = 2, 'going live again doesn''t push twice');
-- The body is the first 100 characters of the request.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.feature_requests (id, society_id, need) values ('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', repeat('Long request ', 20));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.feature_requests set status = 'live' where id = '51000000-0000-0000-0000-000000000004';
select pg_temp.as_server();
select pg_temp.expect((select length(body) from public.push_queue where dedupe_key like 'request-live:51000000-0000-0000-0000-000000000004:%' limit 1) = 100, 'the push body is the request''s first 100 characters');
-- Function admins can delete a request.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
delete from public.feature_requests where id = '51000000-0000-0000-0000-000000000004';
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.feature_requests where id = '51000000-0000-0000-0000-000000000004') = 0, 'a Function admin can delete a request');
select pg_temp.expect(pg_temp.fails($$update public.feature_requests set status = 'maybe' where id = '51000000-0000-0000-0000-000000000001'$$), 'an unknown status is refused');

-- ---------------------------------------------------------------------
-- 4. Founding Society progress
-- ---------------------------------------------------------------------
-- F is Founding and agreed 10 days ago. Its published events since then:
-- e1 and e2 have someone going, e3 doesn't. e0 (before agreeing, with
-- someone going), e4 (cancelled) and e5 (hidden) don't count.
select pg_temp.as_server();
update public.societies set is_founding = true where id in ('50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005');
insert into public.founding_agreements (society_id, agreed_by, agreed_at) values
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', now() - interval '10 days'),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1', now() - interval '20 days');
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at, audience, is_cancelled) values
  ('52000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000003', 'Before agreeing', 'social', 51.5, -0.11, now() - interval '19 days', now() - interval '19 days' + interval '2 hours', 'london', false),
  ('52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'First', 'social', 51.5, -0.11, now() + interval '1 day', now() + interval '1 day 2 hours', 'london', false),
  ('52000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'Second', 'social', 51.5, -0.11, now() + interval '2 days', now() + interval '2 days 2 hours', 'london', false),
  ('52000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 'Third', 'social', 51.5, -0.11, now() + interval '3 days', now() + interval '3 days 2 hours', 'london', false),
  ('52000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000003', 'Cancelled', 'social', 51.5, -0.11, now() + interval '4 days', now() + interval '4 days 2 hours', 'london', true),
  ('52000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000003', 'Hidden', 'social', 51.5, -0.11, now() + interval '5 days', now() + interval '5 days 2 hours', 'london', false);
update public.events set is_hidden = true where id = '52000000-0000-0000-0000-000000000005';
update public.events set created_at = now() - interval '20 days' where id = '52000000-0000-0000-0000-000000000000';
update public.events set created_at = now() - interval '6 days' where id = '52000000-0000-0000-0000-000000000001';
update public.events set created_at = now() - interval '4 days' where id = '52000000-0000-0000-0000-000000000002';
update public.events set created_at = now() - interval '3 days' where id = '52000000-0000-0000-0000-000000000003';
update public.events set created_at = now() - interval '1 day' where id in ('52000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005');
insert into public.event_entries (event_id, user_id, status) values
  ('52000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002', 'going'),
  ('52000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'going'),
  ('52000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'going'),
  ('52000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'going'),
  ('52000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'going');

select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.founding_progress('50000000-0000-0000-0000-000000000003')) = 1, 'the manager gets one progress row');
select pg_temp.expect((select is_founding and agreed_at is not null and events_target = 3 and events_since = 3 and events_with_rsvp = 2
  and not eligible and badge_active and days_since_last_event = 3
  and last_event_at = (select created_at from public.events where id = '52000000-0000-0000-0000-000000000003')
  from public.founding_progress('50000000-0000-0000-0000-000000000003')), '3 events since agreeing, 2 with someone going: not eligible yet, badge on, last event 3 days ago');
select pg_temp.as_server();
insert into public.event_entries (event_id, user_id, status) values ('52000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'going');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select events_with_rsvp = 3 and eligible from public.founding_progress('50000000-0000-0000-0000-000000000003')), 'someone going to the third event: in the prize draw');
-- A waiting list place isn't "going".
select pg_temp.as_server();
delete from public.event_entries where event_id = '52000000-0000-0000-0000-000000000003';
insert into public.event_entries (event_id, user_id, status) values ('52000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'waitlist');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select not eligible from public.founding_progress('50000000-0000-0000-0000-000000000003')), 'someone on the waiting list doesn''t count');
select pg_temp.as_server();
update public.event_entries set status = 'going' where event_id = '52000000-0000-0000-0000-000000000003';

-- Who can see progress.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.founding_progress('50000000-0000-0000-0000-000000000003')) = 0, 'a student gets no progress rows');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.founding_progress('50000000-0000-0000-0000-000000000003')) = 0, 'another society''s manager gets none');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select eligible from public.founding_progress('50000000-0000-0000-0000-000000000003')), 'a Function admin sees the progress');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select * from public.founding_progress('50000000-0000-0000-0000-000000000003')$$), 'a logged-out visitor cannot ask for progress');
-- The helpers behind it are server-only.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select * from public.founding_status('50000000-0000-0000-0000-000000000003')$$), 'founding_status is server-only');
select pg_temp.expect(pg_temp.fails($$select * from public.society_published_events('50000000-0000-0000-0000-000000000003')$$), 'society_published_events is server-only');
-- G hasn't agreed: nothing counts yet.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect((select is_founding and agreed_at is null and events_since = 0 and not eligible and not badge_active
  from public.founding_progress('50000000-0000-0000-0000-000000000004')), 'not agreed yet: nothing counts and no badge');
-- A society that isn't Founding.
select pg_temp.expect((select not is_founding and not eligible and not badge_active
  from public.founding_progress('50000000-0000-0000-0000-000000000001')), 'a society that isn''t Founding has no badge');

-- Managers can't change when an event was created (every Founding number
-- comes from it). Sam moves e0 (before agreeing, someone going) forward,
-- e3 into the future and backdates e1; the other changes (the titles) go
-- through, the dates don't.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.events set title = 'Moved forward', created_at = now() where id = '52000000-0000-0000-0000-000000000000';
update public.events set title = 'Into the future', created_at = '2099-01-01' where id = '52000000-0000-0000-0000-000000000003';
update public.events set title = 'Backdated', created_at = now() - interval '100 days' where id = '52000000-0000-0000-0000-000000000001';
select pg_temp.as_server();
select pg_temp.expect((select title = 'Moved forward' and created_at = now() - interval '20 days'
  from public.events where id = '52000000-0000-0000-0000-000000000000'), 'a manager cannot move an event from before agreeing forward (it stays 20 days old)');
select pg_temp.expect((select title = 'Into the future' and created_at = now() - interval '3 days'
  from public.events where id = '52000000-0000-0000-0000-000000000003'), 'nor move one into the future');
select pg_temp.expect((select title = 'Backdated' and created_at = now() - interval '6 days'
  from public.events where id = '52000000-0000-0000-0000-000000000001'), 'nor backdate one');
-- A new event is created now, whatever the app sent.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at, audience, created_at) values
  ('52000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000003', 'Sent from 2099', 'social', 51.5, -0.11, now() + interval '7 days', now() + interval '7 days 2 hours', 'london', '2099-01-01');
select pg_temp.as_server();
select pg_temp.expect((select created_at between now() - interval '1 minute' and now() + interval '1 minute'
  from public.events where id = '52000000-0000-0000-0000-000000000008'), 'a new event is created now, not when the app says');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select events_since = 4 and events_with_rsvp = 3 and days_since_last_event = 0 and last_event_at <= now()
  from public.founding_progress('50000000-0000-0000-0000-000000000003')), 'progress is unchanged apart from the one real new event');
select pg_temp.as_server();
delete from public.events where id = '52000000-0000-0000-0000-000000000008';
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select events_since = 3 and events_with_rsvp = 3 and eligible and days_since_last_event = 3
  from public.founding_progress('50000000-0000-0000-0000-000000000003')), 'without it, progress is just as before');

-- ---------------------------------------------------------------------
-- 5. The badge, across the 30-day line, for anyone
-- ---------------------------------------------------------------------
select pg_temp.act_as(null);
select pg_temp.expect(public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'logged out: F''s badge is on');
select pg_temp.expect(not public.founding_badge_active('50000000-0000-0000-0000-000000000004'), 'G (not agreed) has no badge');
select pg_temp.expect(not public.founding_badge_active('50000000-0000-0000-0000-000000000001'), 'R (not Founding) has no badge');
select pg_temp.expect(not public.founding_badge_active('59999999-0000-0000-0000-000000000000'), 'an unknown society has no badge');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'a student sees F''s badge');
-- Everything 29 days old: on. 31 days old: off. Post again: back on.
select pg_temp.as_server();
update public.founding_agreements set agreed_at = now() - interval '29 days' where society_id = '50000000-0000-0000-0000-000000000003';
update public.events set created_at = now() - interval '29 days' where society_id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as(null);
select pg_temp.expect(public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'last event 29 days ago: badge on');
select pg_temp.as_server();
update public.founding_agreements set agreed_at = now() - interval '31 days' where society_id = '50000000-0000-0000-0000-000000000003';
update public.events set created_at = now() - interval '31 days' where society_id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as(null);
select pg_temp.expect(not public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'last event 31 days ago: badge off');
-- Agreed 10 days ago with no events since: on (the agreement counts).
select pg_temp.as_server();
update public.founding_agreements set agreed_at = now() - interval '10 days' where society_id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as(null);
select pg_temp.expect(public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'agreed 10 days ago: badge on');
select pg_temp.as_server();
update public.founding_agreements set agreed_at = now() - interval '40 days' where society_id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select events_since = 4 and not badge_active and days_since_last_event = 31
  from public.founding_progress('50000000-0000-0000-0000-000000000003')), 'agreed 40 days ago, last event 31 days ago: the badge is off');
-- Sam can't turn it back on by moving his events' dates.
update public.events set created_at = '2099-01-01' where society_id = '50000000-0000-0000-0000-000000000003';
update public.events set created_at = now() where society_id = '50000000-0000-0000-0000-000000000003';
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.events where society_id = '50000000-0000-0000-0000-000000000003'
  and created_at <> now() - interval '31 days') = 0, 'a manager cannot move their events'' dates');
select pg_temp.act_as(null);
select pg_temp.expect(not public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'so the badge stays off');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select events_since = 4 and not badge_active and days_since_last_event = 31
  from public.founding_progress('50000000-0000-0000-0000-000000000003')), 'and the progress is unchanged');
-- A hidden or cancelled event doesn't turn it back on; a new one does.
select pg_temp.as_server();
update public.events set created_at = now() where id in ('52000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005');
select pg_temp.act_as(null);
select pg_temp.expect(not public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'a new cancelled or hidden event doesn''t count');
select pg_temp.as_server();
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at, audience) values
  ('52000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000003', 'Back again', 'social', 51.5, -0.11, now() + interval '6 days', now() + interval '6 days 2 hours', 'london');
select pg_temp.act_as(null);
select pg_temp.expect(public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'posting again turns the badge back on');
-- An admin taking Founding away turns the badge off.
select pg_temp.as_server();
update public.societies set is_founding = false where id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as(null);
select pg_temp.expect(not public.founding_badge_active('50000000-0000-0000-0000-000000000003'), 'no longer Founding: no badge');
select pg_temp.as_server();
update public.societies set is_founding = true where id = '50000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------
-- 6. The Function team's lists
-- ---------------------------------------------------------------------
select pg_temp.as_server();
insert into public.feature_interest (society_id, feature_key) values
  ('50000000-0000-0000-0000-000000000001', 'polls'),
  ('50000000-0000-0000-0000-000000000003', 'polls'),
  ('50000000-0000-0000-0000-000000000001', 'check_in_qr');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$select * from public.admin_founding_societies()$$) like '%Function admins only%', 'a manager cannot list Founding Societies');
select pg_temp.expect(pg_temp.error_of($$select * from public.admin_feature_interest()$$) like '%Function admins only%', 'nor the wanted features');
select pg_temp.expect(pg_temp.error_of($$select * from public.admin_feature_requests()$$) like '%Function admins only%', 'nor every request');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$select * from public.admin_feature_requests('new')$$), 'a student cannot list requests');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select * from public.admin_founding_societies()$$), 'a logged-out visitor cannot list Founding Societies');
select pg_temp.expect(pg_temp.fails($$select * from public.admin_feature_interest()$$), 'nor the wanted features');
select pg_temp.expect(pg_temp.fails($$select * from public.admin_feature_requests()$$), 'nor requests');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select string_agg(slug, ',' order by name) from public.admin_founding_societies() where slug like 'fr-%') = 'fr-f,fr-g,fr-h', 'Ada sees the three Founding Societies, and not R');
select pg_temp.expect((select agreed_at is null and events_since = 0 and not badge_active from public.admin_founding_societies() where slug = 'fr-g'), 'G shows as not agreed yet');
select pg_temp.expect((select agreed_at is not null and events_since = 5 and events_with_rsvp = 4 and events_target = 3 and badge_active and eligible and days_since_last_event = 0
  from public.admin_founding_societies() where slug = 'fr-f'), 'F shows its progress (agreed 40 days ago, 5 published events since, 4 with someone going)');
select pg_temp.expect((select feature_key from public.admin_feature_interest() limit 1) = 'polls', 'the most wanted feature comes first');
select pg_temp.expect((select societies = 2 and society_names = array['Founding Society F', 'Requests Society'] from public.admin_feature_interest() where feature_key = 'polls'), 'with how many societies want it, and which');
select pg_temp.expect((select societies from public.admin_feature_interest() where feature_key = 'check_in_qr') = 1, 'check-in is wanted by one');
select pg_temp.expect((select count(*) from public.admin_feature_requests() r where r.society_id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002')) = 3, 'every request is listed');
select pg_temp.expect((select count(*) from public.admin_feature_requests('live') r where r.society_id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002')) = 1, 'filtered by status');
select pg_temp.expect((select requested_by_name = 'Sam Student' and society_name = 'Requests Society' and society_slug = 'fr-r' and university = 'LSE'
  and current_process = 'A printed list and a pen' and status = 'live' and admin_note = 'Live now' and status_changed_at is not null
  from public.admin_feature_requests() where id = '51000000-0000-0000-0000-000000000001'), 'each request has the society, who asked (by name) and its status');
select pg_temp.expect((select count(*) from public.admin_feature_requests() r where r::text like '%@%') = 0, 'no email anywhere in the requests');
select pg_temp.expect(not exists (select 1 from pg_proc where proname = 'admin_feature_requests' and 'email' = any (proargnames)), 'admin_feature_requests has no email column');
-- Fay sends a request, then deletes her account: the request stays, with
-- nobody's name on it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
insert into public.feature_requests (id, society_id, need) values ('51000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000001', 'Announcements to members');
select public.delete_my_account();
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'Fay could delete her account');
select pg_temp.expect((select requested_by is null from public.feature_requests where id = '51000000-0000-0000-0000-000000000005'), 'her request stays, with requested_by cleared');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select requested_by_name is null from public.admin_feature_requests() where id = '51000000-0000-0000-0000-000000000005'), 'a request from a deleted account has no name');
delete from public.feature_requests where id = '51000000-0000-0000-0000-000000000005';

-- ---------------------------------------------------------------------
-- 7. The weekly nudge
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.queue_hub_reminders()$$), 'a student cannot send the reminders');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$select public.queue_hub_reminders()$$), 'nor a Function admin from the app');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.queue_hub_reminders()$$), 'nor a logged-out visitor');

-- F: agreed 40 days ago, every event 8 days old (idle for 8 days; 5
-- published events since agreeing). H: agreed 20 days ago, posted 2 days
-- ago. G hasn't agreed.
select pg_temp.as_server();
delete from public.push_queue;
update public.events set created_at = now() - interval '8 days' where society_id = '50000000-0000-0000-0000-000000000003';
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at, audience) values
  ('52000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000005', 'H night', 'social', 51.5, -0.11, now() + interval '6 days', now() + interval '6 days 2 hours', 'london');
update public.events set created_at = now() - interval '2 days' where id = '52000000-0000-0000-0000-000000000007';
select pg_temp.expect(public.queue_hub_reminders() = 1, 'one nudge queued (Sam, F''s only manager)');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001' and kind = 'hub'
  and title = 'Time to post your next event?' and body = '3 of 3 events posted. Post your next one to keep your Founding badge.'
  and url = '/hub/50000000-0000-0000-0000-000000000003'
  and dedupe_key = 'founding-nudge:50000000-0000-0000-0000-000000000003:00000000-0000-0000-0000-000000000001:' || floor(extract(epoch from now()) / 604800)::bigint) = 1, 'Sam is nudged about F, with its progress (5 events shown as 3 of 3)');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-0000000000e1') = 0, 'H (posted 2 days ago) and G (not agreed) get no nudge');
select pg_temp.expect(public.queue_hub_reminders() = 0, 'running it again queues nothing');
select pg_temp.expect((select count(*) from public.push_queue) = 1, 'and no duplicate');
-- At most once every 7 days, even across the change of week: a nudge sent
-- yesterday in last week's numbering stops today's; one sent 7 days ago
-- doesn't.
update public.push_queue set created_at = now() - interval '1 day',
  dedupe_key = 'founding-nudge:50000000-0000-0000-0000-000000000003:00000000-0000-0000-0000-000000000001:' || (floor(extract(epoch from now()) / 604800)::bigint - 1)
  where user_id = '00000000-0000-0000-0000-000000000001';
select pg_temp.expect(public.queue_hub_reminders() = 0, 'nudged yesterday (last week by number): not nudged again today');
update public.push_queue set created_at = now() - interval '7 days' where user_id = '00000000-0000-0000-0000-000000000001';
select pg_temp.expect(public.queue_hub_reminders() = 1, 'nudged 7 days ago: nudged again');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001') = 2, 'the second nudge is queued');
-- Agreed 7 days 23 hours ago, after those events: idle since the
-- agreement, and nothing posted since.
delete from public.push_queue;
update public.founding_agreements set agreed_at = now() - interval '7 days 23 hours' where society_id = '50000000-0000-0000-0000-000000000003';
select pg_temp.expect(public.queue_hub_reminders() = 1, 'idle for more than 7 days since agreeing: nudged');
select pg_temp.expect((select body from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001') = '0 of 3 events posted. Post your next one to keep your Founding badge.', 'nothing posted since agreeing: 0 of 3');
update public.founding_agreements set agreed_at = now() - interval '6 days' where society_id = '50000000-0000-0000-0000-000000000003';
delete from public.push_queue;
select pg_temp.expect(public.queue_hub_reminders() = 0, 'agreed 6 days ago: not nudged yet');
-- F agreed 10 days ago and H idle for 8 days too: Sam (F) and Eve (H's
-- manager, with a phone) are nudged; Bea, also made H's manager, has no phone.
delete from public.push_queue;
update public.founding_agreements set agreed_at = now() - interval '10 days' where society_id = '50000000-0000-0000-0000-000000000003';
update public.events set created_at = now() - interval '8 days' where id = '52000000-0000-0000-0000-000000000007';
insert into public.society_admins (society_id, user_id) values ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.queue_hub_reminders() = 2, 'F''s and H''s managers with phones are nudged');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-0000000000e1' and url = '/hub/50000000-0000-0000-0000-000000000005') = 1, 'Eve is nudged about H, opening its Hub');
-- Pushes switched off: none.
delete from public.push_queue;
insert into public.notification_settings (user_id, hub) values ('00000000-0000-0000-0000-0000000000e1', false)
on conflict (user_id) do update set hub = false;
select pg_temp.expect(public.queue_hub_reminders() = 1, 'someone with Society Hub pushes off isn''t nudged (and isn''t counted)');

-- ---------------------------------------------------------------------
-- 8. The live societies are untouched
-- ---------------------------------------------------------------------
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.societies where slug = 'lse-poker-society' and is_founding = false) = 1, 'LSE Poker Society is not Founding');
select pg_temp.act_as(null);
select pg_temp.expect(not public.founding_badge_active((select id from public.societies where slug = 'lse-poker-society')), 'LSE Poker Society shows no badge');
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.feature_requests where society_id = (select id from public.societies where slug = 'lse-poker-society')) = 0, 'and has no requests');

rollback;
