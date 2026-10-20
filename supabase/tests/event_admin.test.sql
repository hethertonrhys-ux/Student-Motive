-- 20261121000000_event_admin.sql: draft events, event admin answers and the
-- LSE approval gate.
--
--   A  ea-a  LSE, Event admin on, managed by Sam; Bea is a member (with a phone set up)
--   C  ea-c  LSE, Event admin off, managed by Sam; Bea is a member
--   U  ea-u  UCL, Event admin on, managed by Cas (another society's manager)
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

-- A society event (as the server, so the gate doesn't apply): returns its id.
create or replace function pg_temp.event(sid uuid, title text, draft boolean, starts timestamptz default now() + interval '2 days') returns uuid language sql as $$
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience, is_draft)
  values (sid, title, 'social', (select id from public.venues order by id limit 1), starts, starts + interval '3 hours', 'london', draft)
  returning id;
$$;

select pg_temp.as_server();
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e2', 'eaz@lse.ac.uk') on conflict (id) do nothing;
insert into public.societies (id, slug, name, university) values
  ('60000000-0000-0000-0000-00000000000a', 'ea-a', 'Event Admin A', 'LSE'),
  ('60000000-0000-0000-0000-00000000000c', 'ea-c', 'Event Admin C', 'LSE'),
  ('60000000-0000-0000-0000-0000000000a1', 'ea-u', 'Event Admin U', 'UCL');
insert into public.society_admins (society_id, user_id) values
  ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e2'),
  ('60000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003');
insert into public.society_features (society_id, feature_key, enabled) values
  ('60000000-0000-0000-0000-00000000000a', 'event_admin', true),
  ('60000000-0000-0000-0000-00000000000c', 'event_admin', false),
  ('60000000-0000-0000-0000-0000000000a1', 'event_admin', true);
insert into public.society_members (society_id, user_id, status, approved_at) values
  ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'approved', now()),
  ('60000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000002', 'approved', now());
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000002', 'ios', 'ExponentPushToken[ea-bea]'),
  ('00000000-0000-0000-0000-000000000001', 'android', 'ExponentPushToken[ea-sam]')
on conflict (token) do nothing;
insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted') on conflict do nothing;

create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
insert into ids values
  ('draft', pg_temp.event('60000000-0000-0000-0000-00000000000a', 'EA Draft', true)),
  ('published', pg_temp.event('60000000-0000-0000-0000-00000000000a', 'EA Published', false)),
  ('soon_draft', pg_temp.event('60000000-0000-0000-0000-00000000000a', 'EA Soon Draft', true, now() + interval '32 minutes')),
  ('soon_published', pg_temp.event('60000000-0000-0000-0000-00000000000a', 'EA Soon Published', false, now() + interval '32 minutes'));
insert into public.event_entries (event_id, user_id, status)
select id, '00000000-0000-0000-0000-000000000002', 'going' from ids;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;

-- ---------------------------------------------------------------------
-- 1. A draft is seen only by the society's managers and Function admins
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not exists (select 1 from public.events where id = pg_temp.id('draft')), 'a student (even a member who is going) cannot see a draft');
select pg_temp.expect(exists (select 1 from public.events where id = pg_temp.id('published')), 'the student sees the published event');
select pg_temp.act_as(null);
select pg_temp.expect(not exists (select 1 from public.events where id = pg_temp.id('draft')), 'a logged-out visitor cannot see a draft');
select pg_temp.expect(exists (select 1 from public.events where id = pg_temp.id('published')), 'a logged-out visitor sees the published event');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.events where id = pg_temp.id('draft')), 'another society''s manager cannot see a draft');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(exists (select 1 from public.events where id = pg_temp.id('draft')), 'the society''s manager sees its draft');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(exists (select 1 from public.events where id = pg_temp.id('draft')), 'a Function admin sees a draft');
-- Its tables follow the event.
select pg_temp.as_server();
insert into public.event_tables (event_id, name, seats, position) values (pg_temp.id('draft'), 'Table 1', 8, 0);
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not exists (select 1 from public.event_tables where event_id = pg_temp.id('draft')), 'a student cannot see a draft''s tables');

-- ---------------------------------------------------------------------
-- 2. Joining, reminders and friends' signals skip drafts
-- ---------------------------------------------------------------------
select pg_temp.as_server();
delete from public.event_entries where event_id = pg_temp.id('draft');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.join_event((select id from ids where name = 'draft'))$$) like '%isn''t published yet%', 'joining a draft fails: ' || coalesce(pg_temp.error_of($$select public.join_event((select id from ids where name = 'draft'))$$), 'no error'));
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.join_event((select id from ids where name = 'draft'))$$), 'not even the manager can join a draft');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$select public.queue_event_reminders()$$), 'a student still cannot call queue_event_reminders');

select pg_temp.as_server();
delete from public.push_queue;
select public.queue_event_reminders();
select pg_temp.expect(exists (select 1 from public.push_queue where dedupe_key = 'reminder:' || pg_temp.id('soon_published') || ':00000000-0000-0000-0000-000000000002'), 'a published event starting soon gets a reminder');
select pg_temp.expect(not exists (select 1 from public.push_queue where dedupe_key like 'reminder:' || pg_temp.id('soon_draft') || ':%'), 'a draft starting soon gets no reminder');

select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.my_friend_event_signals(array[pg_temp.id('soon_draft'), pg_temp.id('soon_published')], '{}') where event_id = pg_temp.id('soon_published') and going = 1) = 1, 'friends going to a published event are counted');
select pg_temp.expect(not exists (select 1 from public.my_friend_event_signals(array[pg_temp.id('soon_draft'), pg_temp.id('soon_published')], '{}') where event_id = pg_temp.id('soon_draft')), 'no friend signals for a draft, even for its manager');

-- ---------------------------------------------------------------------
-- 3. A draft's chat: only the committee until it's published
-- ---------------------------------------------------------------------
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.threads where event_id = pg_temp.id('soon_draft')), 'a draft still gets its chat');
insert into public.messages (thread_id, sender_id, body) select id, '00000000-0000-0000-0000-000000000001', 'Draft chat' from public.threads where event_id = pg_temp.id('soon_draft');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not exists (select 1 from public.my_threads() where event_id = pg_temp.id('soon_draft')), 'a draft''s chat is not in a non-committee member''s list');
select pg_temp.expect(exists (select 1 from public.my_threads() where event_id = pg_temp.id('soon_published')), 'a published event''s chat is in their list');
select pg_temp.expect(not public.can_use_thread((select id from public.threads where event_id = pg_temp.id('soon_draft'))), 'someone going cannot use a draft''s chat');
select pg_temp.expect(pg_temp.fails($$select public.open_event_chat((select id from ids where name = 'soon_draft'))$$), 'someone going cannot open a draft''s chat');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(exists (select 1 from public.my_threads() where event_id = pg_temp.id('soon_draft')), 'the committee sees its draft''s chat');
select pg_temp.expect(public.can_use_thread((select id from public.threads where event_id = pg_temp.id('soon_draft'))), 'the committee can use its draft''s chat');
select pg_temp.as_server();
delete from public.push_queue;
insert into public.messages (thread_id, sender_id, body) select id, '00000000-0000-0000-0000-0000000000e2', 'Committee note' from public.threads where event_id = pg_temp.id('soon_draft');
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002'), 'a message in a draft''s chat is not pushed to people going');
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001' and kind = 'messages'), 'the committee still hears about it');

-- ---------------------------------------------------------------------
-- 4. The approval gate
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$insert into public.events (society_id, title, category, venue_id, starts_at, ends_at) values ('60000000-0000-0000-0000-00000000000a', 'EA Straight Out', 'social', (select id from public.venues order by id limit 1), now() + interval '20 days', now() + interval '20 days 2 hours')$$)
  = 'Tick "SU approved" before publishing. LSESU must approve events before they''re promoted.', 'a manager of an LSE society with Event admin on cannot post a published event');
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, is_draft)
values ('60000000-0000-0000-0000-00000000000a', 'EA Gate', 'social', (select id from public.venues order by id limit 1), now() + interval '20 days', now() + interval '20 days 2 hours', true);
insert into ids select 'gate', id from public.events where title = 'EA Gate';
select pg_temp.expect(pg_temp.id('gate') is not null, 'the manager can post a draft');
select pg_temp.expect(pg_temp.fails($$update public.events set is_draft = false where title = 'EA Gate'$$), 'publishing without event admin answers fails');
insert into public.event_admin (event_id, expected_attendees, external_speaker, speaker_names) values (pg_temp.id('gate'), 120, true, 'Dr Speaker');
select pg_temp.expect(pg_temp.fails($$update public.events set is_draft = false where title = 'EA Gate'$$), 'publishing before "SU approved" is ticked fails');
update public.event_admin set su_approved_at = now() where event_id = pg_temp.id('gate');
select pg_temp.as_server();
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.events set is_draft = false where title = 'EA Gate';
select pg_temp.expect((select not is_draft from public.events where id = pg_temp.id('gate')), 'once "SU approved" is ticked, the manager can publish');

-- Publishing sends the "new event" push to members with a phone, once.
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.push_queue where dedupe_key = 'society-event:' || pg_temp.id('gate') || ':00000000-0000-0000-0000-000000000002' and kind = 'society_events') = 1, 'publishing queues the new-event push for the member');
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001' and dedupe_key like 'society-event:%'), 'the manager who posted it gets no push');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.events set is_draft = true where id = pg_temp.id('gate');
select pg_temp.expect((select is_draft from public.events where id = pg_temp.id('gate')), 'a manager can unpublish');
update public.events set is_draft = false where id = pg_temp.id('gate');
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.push_queue where dedupe_key like 'society-event:' || pg_temp.id('gate') || ':%') = 1, 'publishing again does not push twice');
-- A draft created by a manager queued nothing.
select pg_temp.expect(not exists (select 1 from public.push_queue q join ids on q.dedupe_key like 'society-event:' || ids.id || ':%' where ids.name in ('draft', 'soon_draft')), 'drafts queue no new-event push');

-- Unticking "SU approved" doesn't unpublish, and other changes to a published event are fine.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.event_admin set su_approved_at = null where event_id = pg_temp.id('gate');
update public.events set title = 'EA Gate (renamed)' where id = pg_temp.id('gate');
select pg_temp.expect((select not is_draft and title = 'EA Gate (renamed)' from public.events where id = pg_temp.id('gate')), 'a published event stays published and can be edited');
update public.events set title = 'EA Published (renamed)' where id = pg_temp.id('published');
select pg_temp.expect((select not is_draft from public.events where id = pg_temp.id('published')), 'an event published before is never affected');

-- With Event admin off (C), or at another uni (U), publishing needs no approval.
select pg_temp.as_server();
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at) values ('60000000-0000-0000-0000-00000000000c', 'EA Off', 'social', (select id from public.venues order by id limit 1), now() + interval '3 days', now() + interval '3 days 2 hours');
select pg_temp.expect(exists (select 1 from public.events where title = 'EA Off' and not is_draft), 'with Event admin off, a manager posts a published event as before');
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, is_draft) values ('60000000-0000-0000-0000-00000000000c', 'EA Off Draft', 'social', (select id from public.venues order by id limit 1), now() + interval '3 days', now() + interval '3 days 2 hours', true);
update public.events set is_draft = false where title = 'EA Off Draft';
select pg_temp.expect(exists (select 1 from public.events where title = 'EA Off Draft' and not is_draft), 'with Event admin off, a draft is published without approval');
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.push_queue q join public.events e on q.dedupe_key = 'society-event:' || e.id || ':00000000-0000-0000-0000-000000000002' where e.title = 'EA Off') = 1, 'posting a published event still pushes to members');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at) values ('60000000-0000-0000-0000-0000000000a1', 'EA UCL', 'social', (select id from public.venues order by id limit 1), now() + interval '3 days', now() + interval '3 days 2 hours');
select pg_temp.expect(exists (select 1 from public.events where title = 'EA UCL' and not is_draft), 'a UCL society publishes without approval');
-- A Function admin can always publish.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at) values ('60000000-0000-0000-0000-00000000000a', 'EA Admin', 'social', (select id from public.venues order by id limit 1), now() + interval '3 days', now() + interval '3 days 2 hours');
select pg_temp.expect(exists (select 1 from public.events where title = 'EA Admin' and not is_draft), 'a Function admin bypasses the gate');
-- Switching Event admin on later unpublishes nothing.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.society_features set enabled = true where society_id = '60000000-0000-0000-0000-00000000000c' and feature_key = 'event_admin';
select pg_temp.expect((select count(*) from public.events where title in ('EA Off', 'EA Off Draft') and not is_draft) = 2, 'switching Event admin on keeps published events published');
select pg_temp.expect(pg_temp.fails($$insert into public.events (society_id, title, category, venue_id, starts_at, ends_at) values ('60000000-0000-0000-0000-00000000000c', 'EA Now Gated', 'social', (select id from public.venues order by id limit 1), now() + interval '3 days', now() + interval '3 days 2 hours')$$), 'once it is on, new events need approval');

-- Founding progress counts published events only.
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.society_published_events('60000000-0000-0000-0000-00000000000a') e join ids on ids.id = e.id where ids.name in ('draft', 'soon_draft')) = 0, 'drafts are not published events');
select pg_temp.expect(exists (select 1 from public.society_published_events('60000000-0000-0000-0000-00000000000a') e where e.id = pg_temp.id('published')), 'published events are');

-- ---------------------------------------------------------------------
-- 5. Event admin answers: the society's managers only
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
-- The society is always the event's, whatever was sent.
insert into public.event_admin (event_id, society_id, venue_type, alcohol, cost_lines, su_approved_at, su_approved_by, updated_by)
values (pg_temp.id('draft'), '60000000-0000-0000-0000-0000000000a1', 'london', 'available', '[{"label": "Room", "pence": 5000}]', now(), '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select society_id = '60000000-0000-0000-0000-00000000000a' from public.event_admin where event_id = pg_temp.id('draft')), 'society_id is forced from the event');
select pg_temp.expect((select su_approved_by = '00000000-0000-0000-0000-000000000001' and updated_by = '00000000-0000-0000-0000-000000000001' from public.event_admin where event_id = pg_temp.id('draft')), 'su_approved_by and updated_by are the manager, whatever was sent');
-- Another manager of the society changes the answers: "SU approved" keeps who ticked it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
update public.event_admin set alcohol = 'focus', su_approved_at = now() + interval '1 day', su_approved_by = '00000000-0000-0000-0000-0000000000e2' where event_id = pg_temp.id('draft');
select pg_temp.expect((select alcohol = 'focus' and su_approved_by = '00000000-0000-0000-0000-000000000001' and su_approved_at < now() + interval '1 hour' and updated_by = '00000000-0000-0000-0000-0000000000e2' from public.event_admin where event_id = pg_temp.id('draft')), 'who ticked "SU approved" (and when) stays while it stays ticked');
update public.event_admin set su_approved_at = null where event_id = pg_temp.id('draft');
select pg_temp.expect((select su_approved_by is null from public.event_admin where event_id = pg_temp.id('draft')), 'unticking clears who approved it');
update public.event_admin set su_approved_at = now() where event_id = pg_temp.id('draft');
select pg_temp.expect((select su_approved_by = '00000000-0000-0000-0000-0000000000e2' from public.event_admin where event_id = pg_temp.id('draft')), 'ticking again stamps the person who ticked it');
-- An upsert (what the app sends) works.
insert into public.event_admin (event_id, expected_attendees) values (pg_temp.id('draft'), 80)
  on conflict (event_id) do update set expected_attendees = excluded.expected_attendees;
select pg_temp.expect((select expected_attendees = 80 and su_approved_at is not null from public.event_admin where event_id = pg_temp.id('draft')), 'the manager can upsert answers');
select pg_temp.expect(pg_temp.fails($$update public.event_admin set event_id = (select id from ids where name = 'published') where event_id = (select id from ids where name = 'draft')$$) or exists (select 1 from public.event_admin where event_id = pg_temp.id('draft')), 'the event of a row never changes');
select pg_temp.expect(pg_temp.fails($$update public.event_admin set venue_type = 'moon' where event_id = (select id from ids where name = 'draft')$$), 'venue_type only takes the three values');
select pg_temp.expect(pg_temp.fails(format($$update public.event_admin set speaker_names = %L where event_id = (select id from ids where name = 'draft')$$, repeat('x', 501))), 'speaker names over 500 characters are refused');

-- Another society's manager, a student and a logged-out visitor can't read or write them.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.event_admin where event_id = pg_temp.id('draft')), 'another society''s manager cannot read them');
select pg_temp.expect(pg_temp.fails($$insert into public.event_admin (event_id) values ((select id from ids where name = 'soon_draft'))$$), 'another society''s manager cannot add them');
update public.event_admin set alcohol = 'none' where event_id = pg_temp.id('draft');
delete from public.event_admin where event_id = pg_temp.id('draft');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not exists (select 1 from public.event_admin), 'a student cannot read them');
select pg_temp.expect(pg_temp.fails($$insert into public.event_admin (event_id) values ((select id from ids where name = 'published'))$$), 'a student cannot add them');
update public.event_admin set alcohol = 'none';
delete from public.event_admin;
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select 1 from public.event_admin$$), 'a logged-out visitor cannot read them');
select pg_temp.expect(pg_temp.fails($$insert into public.event_admin (event_id) values ((select id from ids where name = 'published'))$$), 'a logged-out visitor cannot add them');
select pg_temp.as_server();
select pg_temp.expect((select alcohol = 'focus' from public.event_admin where event_id = pg_temp.id('draft')), 'nobody else changed or deleted the answers');
-- A Function admin can read them.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(exists (select 1 from public.event_admin where event_id = pg_temp.id('draft')), 'a Function admin can read them');
-- Only society events have event admin.
select pg_temp.as_server();
insert into public.events (host_user_id, title, category, lat, lng, starts_at, ends_at)
values ('00000000-0000-0000-0000-000000000002', 'EA Hosted', 'social', 51.5, -0.1, now() + interval '1 day', now() + interval '1 day 2 hours');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$insert into public.event_admin (event_id) values ((select id from public.events where title = 'EA Hosted'))$$), 'a student-hosted event has no event admin');
-- The manager can delete their own society's answers.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
delete from public.event_admin where event_id = pg_temp.id('gate');
select pg_temp.expect(not exists (select 1 from public.event_admin where event_id = pg_temp.id('gate')), 'the manager can delete their society''s answers');

-- Deleting an account that changed (and approved) answers clears it from them.
select pg_temp.as_server();
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.expect((select su_approved_by is null and updated_by is null and su_approved_at is not null from public.event_admin where event_id = pg_temp.id('draft')), 'deleting an account clears who changed and approved the answers');

-- A deleted event takes its answers with it.
delete from public.events where id = pg_temp.id('draft');
select pg_temp.expect(not exists (select 1 from public.event_admin where event_id = pg_temp.id('draft')), 'deleting the event deletes its answers');


-- ---------------------------------------------------------------------
-- 6. A draft's people: the committee only, and no seat pushes
-- ---------------------------------------------------------------------
-- Cas joins A as a member; Eay is another student. Sam adds Bea (in Seat 5)
-- and Eay to a draft, and Bea (in Seat 5) to a published event with tables.
select pg_temp.as_server();
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e3', 'eay@lse.ac.uk') on conflict (id) do nothing;
insert into public.society_members (society_id, user_id, status, approved_at) values
  ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000003', 'approved', now())
on conflict do nothing;
insert into ids values
  ('seats_draft', pg_temp.event('60000000-0000-0000-0000-00000000000a', 'EA Secret Draft Title', true)),
  ('seats_live', pg_temp.event('60000000-0000-0000-0000-00000000000a', 'EA Seats Live', false));
update public.events set format = 'tables' where id in (pg_temp.id('seats_draft'), pg_temp.id('seats_live'));
insert into public.event_tables (event_id, name, seats, position) values
  (pg_temp.id('seats_draft'), 'T1', 8, 0),
  (pg_temp.id('seats_live'), 'T1', 8, 0);
delete from public.push_queue;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.event_entries (event_id, user_id, status, table_id, seat_no) values
  (pg_temp.id('seats_draft'), '00000000-0000-0000-0000-000000000002', 'going', (select id from public.event_tables where event_id = pg_temp.id('seats_draft')), 5),
  (pg_temp.id('seats_draft'), '00000000-0000-0000-0000-0000000000e3', 'going', null, null),
  (pg_temp.id('seats_live'), '00000000-0000-0000-0000-000000000002', 'going', (select id from public.event_tables where event_id = pg_temp.id('seats_live')), 5);
select pg_temp.expect(public.randomise_table_seats(pg_temp.id('seats_draft'), (select id from public.event_tables where event_id = pg_temp.id('seats_draft'))) = 1, 'the manager reshuffles a draft''s table (Bea moves to Seat 1)');
select pg_temp.expect(public.randomise_table_seats(pg_temp.id('seats_live'), (select id from public.event_tables where event_id = pg_temp.id('seats_live'))) = 1, 'and a published event''s table');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002' and kind = 'seating' and url = '/e/' || pg_temp.id('seats_draft')), 'a reshuffle on a draft pushes nothing to the person added');
select pg_temp.expect(not exists (select 1 from public.push_queue where body like '%Secret Draft Title%'), 'no push names the draft');
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002' and kind = 'seating' and url = '/e/' || pg_temp.id('seats_live')), 'a reshuffle on a published event still pushes');
select pg_temp.expect(exists (select 1 from public.seat_changes where event_id = pg_temp.id('seats_draft') and user_id = '00000000-0000-0000-0000-000000000002'), 'the draft''s seat change is still recorded');

-- Who can list a draft's entries.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.event_entries where event_id = pg_temp.id('seats_draft')) = 0, 'a member who was not added sees none of a draft''s entries');
select pg_temp.expect((select count(*) from public.event_entries where event_id = pg_temp.id('seats_live')) = 1, 'that member still sees a published event''s entries');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.event_entries where event_id = pg_temp.id('seats_draft')) = 1
  and exists (select 1 from public.event_entries where event_id = pg_temp.id('seats_draft') and user_id = '00000000-0000-0000-0000-000000000002'), 'someone added to a draft sees only their own entry');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.event_entries where event_id = pg_temp.id('seats_draft')) = 2, 'the manager still sees all of a draft''s entries');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from public.event_entries where event_id = pg_temp.id('seats_draft')) = 2, 'and so does a Function admin');
select pg_temp.as_server();
update public.events set is_draft = false where id = pg_temp.id('seats_draft');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.event_entries where event_id = pg_temp.id('seats_draft')) = 2, 'once published, members see its entries again');

-- ---------------------------------------------------------------------
-- 7. A draft published later counts from when it's published
-- ---------------------------------------------------------------------
-- F: a Founding LSE society with Event admin on, agreed 20 days ago,
-- managed by Sam (with a phone set up). Its draft was created 8 days ago
-- and is published today, once "SU approved" is ticked.
select pg_temp.as_server();
insert into public.societies (id, slug, name, university, is_founding) values
  ('60000000-0000-0000-0000-00000000000f', 'ea-f', 'Event Admin F', 'LSE', true);
insert into public.society_admins (society_id, user_id) values ('60000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000001');
insert into public.society_features (society_id, feature_key, enabled) values ('60000000-0000-0000-0000-00000000000f', 'event_admin', true);
insert into public.founding_agreements (society_id, agreed_by, agreed_at) values ('60000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000001', now() - interval '20 days');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, is_draft, published_at)
values ('60000000-0000-0000-0000-00000000000f', 'EA Late Publish', 'social', (select id from public.venues order by id limit 1), now() + interval '20 days', now() + interval '20 days 2 hours', true, now() - interval '50 days');
insert into ids select 'late', id from public.events where title = 'EA Late Publish';
select pg_temp.expect((select published_at is null from public.events where id = pg_temp.id('late')), 'a new draft has no published time, whatever the app sent');
select pg_temp.as_server();
update public.events set created_at = now() - interval '8 days' where id = pg_temp.id('late');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.event_admin (event_id, su_approved_at) values (pg_temp.id('late'), now());
update public.events set is_draft = false where id = pg_temp.id('late');
select pg_temp.expect((select not is_draft and published_at = now() and created_at = now() - interval '8 days' from public.events where id = pg_temp.id('late')), 'publishing stamps the published time (and leaves created_at alone)');
select pg_temp.as_server();
delete from public.push_queue;
select pg_temp.expect((select days_since_last_event = 0 and last_event_at = now() and events_since = 1 and badge_active from public.founding_status('60000000-0000-0000-0000-00000000000f')), 'Founding progress dates it by when it was published: '
  || (select format('%s days since, last %s', days_since_last_event, last_event_at) from public.founding_status('60000000-0000-0000-0000-00000000000f')));
select pg_temp.expect(public.queue_hub_reminders() = 0, 'no "post your next event" nudge straight after publishing');
-- Nobody using the app can move it.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.events set published_at = now() - interval '40 days' where id = pg_temp.id('late');
select pg_temp.expect((select published_at = now() from public.events where id = pg_temp.id('late')), 'a manager cannot change the published time');
-- Unpublished and published again: it keeps the first publish time.
select pg_temp.as_server();
update public.events set published_at = now() - interval '2 days' where id = pg_temp.id('late');
select pg_temp.expect((select published_at = now() from public.events where id = pg_temp.id('late')), 'nor can the database''s own scripts by setting it directly');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.events set is_draft = true where id = pg_temp.id('late');
select pg_temp.expect((select is_draft and published_at = now() from public.events where id = pg_temp.id('late')), 'unpublishing keeps the published time');
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.society_published_events('60000000-0000-0000-0000-00000000000f')), 'but it no longer counts');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.events set is_draft = false where id = pg_temp.id('late');
select pg_temp.expect((select not is_draft and published_at = now() from public.events where id = pg_temp.id('late')), 'publishing again keeps the first publish time');
-- A draft created before agreeing and published after it counts as since agreeing.
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, is_draft)
values ('60000000-0000-0000-0000-00000000000f', 'EA Old Draft', 'social', (select id from public.venues order by id limit 1), now() + interval '21 days', now() + interval '21 days 2 hours', true);
select pg_temp.as_server();
update public.events set created_at = now() - interval '25 days' where title = 'EA Old Draft';
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.event_admin (event_id, su_approved_at) select id, now() from public.events where title = 'EA Old Draft';
update public.events set is_draft = false where title = 'EA Old Draft';
select pg_temp.as_server();
select pg_temp.expect((select events_since = 2 from public.founding_status('60000000-0000-0000-0000-00000000000f')), 'a draft created before agreeing and published after it counts');
-- An event published straight away was published when it was created, and
-- stays so if the database's own scripts move created_at.
insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, created_at)
values ('60000000-0000-0000-0000-00000000000f', 'EA Straight Away', 'social', (select id from public.venues order by id limit 1), now() + interval '22 days', now() + interval '22 days 2 hours', now() - interval '3 days');
select pg_temp.expect((select published_at = created_at and created_at = now() - interval '3 days' from public.events where title = 'EA Straight Away'), 'published straight away: published when it was created');
update public.events set created_at = now() - interval '9 days' where title = 'EA Straight Away';
select pg_temp.expect((select published_at = now() - interval '9 days' from public.events where title = 'EA Straight Away'), 'and it follows created_at');
update public.events set created_at = now() - interval '30 days' where id = pg_temp.id('late');
select pg_temp.expect((select published_at = now() from public.events where id = pg_temp.id('late')), 'a draft published later keeps its publish time when created_at moves');
-- Every event already published before this migration has a published time.
select pg_temp.expect(not exists (select 1 from public.events where not is_draft and published_at is null), 'every published event has a published time');

rollback;
