-- 20261122000000_event_admin_documents.sql: the private documents bucket,
-- ticking off the checklist, the checklist reminders and a draft's hosts.
--
--   D  ead-d  LSE, Event admin on, managed by Sam and Dee (both with a phone); Bea is a member
--   O  ead-o  LSE, Event admin on, managed by Cas (another society's manager)
--   X  ead-x  LSE, Event admin switched off again, managed by Sam
--   F  ead-f  a Founding Society managed by Fin (with a phone), idle for 10 days
--   Bea is a student who manages nothing; Ada is a Function admin.
--
-- Everything runs in one transaction that is rolled back at the end.
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

-- A society event (as the server, so the approval gate doesn't apply).
create or replace function pg_temp.event(sid uuid, title text, draft boolean, starts timestamptz default now() + interval '20 days') returns uuid language sql as $$
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience, is_draft)
  values (sid, title, 'talks', (select id from public.venues order by id limit 1), starts, starts + interval '2 hours', 'london', draft)
  returning id;
$$;

-- London's today, and a date n days from it, as 'YYYY-MM-DD'.
create or replace function pg_temp.day(n integer) returns text language sql as $$
  select to_char((now() at time zone 'Europe/London')::date + n, 'YYYY-MM-DD')
$$;

select pg_temp.as_server();
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'dee@lse.ac.uk'),
  ('00000000-0000-0000-0000-0000000000f2', 'fin@lse.ac.uk')
on conflict (id) do nothing;
insert into public.societies (id, slug, name, university) values
  ('70000000-0000-0000-0000-00000000000d', 'ead-d', 'Docs D', 'LSE'),
  ('70000000-0000-0000-0000-00000000000e', 'ead-o', 'Docs O', 'LSE'),
  ('70000000-0000-0000-0000-00000000000f', 'ead-x', 'Docs X', 'LSE'),
  ('70000000-0000-0000-0000-0000000000f0', 'ead-f', 'Docs F', 'LSE');
insert into public.society_admins (society_id, user_id) values
  ('70000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000d1'),
  ('70000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000003'),
  ('70000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000f2');
insert into public.society_features (society_id, feature_key, enabled) values
  ('70000000-0000-0000-0000-00000000000d', 'event_admin', true),
  ('70000000-0000-0000-0000-00000000000e', 'event_admin', true),
  ('70000000-0000-0000-0000-00000000000f', 'event_admin', false);
insert into public.society_members (society_id, user_id, status, approved_at) values
  ('70000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000002', 'approved', now());
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000001', 'ios', 'ExponentPushToken[ead-sam]'),
  ('00000000-0000-0000-0000-0000000000d1', 'android', 'ExponentPushToken[ead-dee]'),
  ('00000000-0000-0000-0000-0000000000f2', 'ios', 'ExponentPushToken[ead-fin]')
on conflict (token) do nothing;

create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
insert into ids values
  ('draft', pg_temp.event('70000000-0000-0000-0000-00000000000d', 'Docs Draft Talk', true)),
  ('published', pg_temp.event('70000000-0000-0000-0000-00000000000d', 'Docs Published Talk', false)),
  ('other', pg_temp.event('70000000-0000-0000-0000-00000000000e', 'Docs Other Talk', true));
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;
insert into public.event_admin (event_id, external_speaker, speaker_names) values
  (pg_temp.id('draft'), true, 'Dr Speaker'),
  (pg_temp.id('other'), false, null);

-- ---------------------------------------------------------------------
-- 1. The private documents bucket
-- ---------------------------------------------------------------------
select pg_temp.expect((select not public and file_size_limit = 10485760 from storage.buckets where id = 'society-documents'), 'the bucket exists, is private and takes up to 10 MB');
select pg_temp.expect((select allowed_mime_types @> array['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'] and cardinality(allowed_mime_types) = 3 from storage.buckets where id = 'society-documents'), 'it takes .docx, .xlsx and .pdf only');

insert into storage.objects (bucket_id, name) values
  ('society-documents', '70000000-0000-0000-0000-00000000000d/' || pg_temp.id('draft') || '/risk_assessment.docx'),
  ('society-documents', '70000000-0000-0000-0000-00000000000e/' || pg_temp.id('other') || '/budget.xlsx'),
  ('society-documents', 'not-a-uuid/x'),
  ('society-documents', 'loose-file.pdf');

select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'society-documents') = 1, 'a manager sees only their own society''s files');
select pg_temp.expect(exists (select 1 from storage.objects where bucket_id = 'society-documents' and name like '70000000-0000-0000-0000-00000000000d/%'), 'Sam can read D''s risk assessment');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect(exists (select 1 from storage.objects where bucket_id = 'society-documents' and name like '70000000-0000-0000-0000-00000000000d/%'), 'so can Dee, D''s other manager');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from storage.objects where bucket_id = 'society-documents' and name like '70000000-0000-0000-0000-00000000000d/%'), 'another society''s manager cannot read D''s files');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'society-documents') = 1, 'Cas sees only O''s file');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select count(*) from storage.objects where bucket_id = 'society-documents'$$) is null, 'an odd file name (not-a-uuid/x) causes no error for a student');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'society-documents') = 0, 'a student sees no files at all');
select pg_temp.act_as(null);
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'society-documents') = 0, 'a logged-out visitor sees no files');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'society-documents') = 4, 'a Function admin can read every file');

-- Nobody using the app can add, change or delete a file there, not even a
-- manager or a Function admin: only the server writes files.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('society-documents', '70000000-0000-0000-0000-00000000000d/x/budget.xlsx')$$), 'a manager cannot upload a file');
update storage.objects set name = name || '.old' where bucket_id = 'society-documents';
delete from storage.objects where bucket_id = 'society-documents';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('society-documents', '70000000-0000-0000-0000-00000000000d/x/budget.xlsx')$$), 'nor can a Function admin from the app');
update storage.objects set name = name || '.old' where bucket_id = 'society-documents';
delete from storage.objects where bucket_id = 'society-documents';
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('society-documents', 'not-a-uuid/y.pdf')$$), 'nor a student');
update storage.objects set name = name || '.old' where bucket_id = 'society-documents';
delete from storage.objects where bucket_id = 'society-documents';
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('society-documents', 'not-a-uuid/z.pdf')$$), 'nor a logged-out visitor');
select pg_temp.as_server();
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'society-documents') = 4, 'every file is still there');
select pg_temp.expect(not exists (select 1 from storage.objects where bucket_id = 'society-documents' and name like '%.old'), 'and none was renamed');
-- The other buckets work as before: a manager can still upload the society's images.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name) values ('images', '70000000-0000-0000-0000-00000000000d/poster.jpg');
select pg_temp.expect(exists (select 1 from storage.objects where bucket_id = 'images' and name = '70000000-0000-0000-0000-00000000000d/poster.jpg'), 'images still upload as before');

-- ---------------------------------------------------------------------
-- 2. Ticking off the checklist
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.set_event_checklist_item(pg_temp.id('draft'), 'form_submitted', true);
select pg_temp.expect((select checklist -> 'form_submitted' ->> 'done_by' = '00000000-0000-0000-0000-000000000001'
                         and (checklist -> 'form_submitted' ->> 'done_at')::timestamptz > now() - interval '1 minute'
                       from public.event_admin where event_id = pg_temp.id('draft')), 'a manager ticks "Form submitted": when and who are recorded');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.set_event_checklist_item(pg_temp.id('draft'), 'form_submitted', true);
select pg_temp.expect((select checklist -> 'form_submitted' ->> 'done_by' = '00000000-0000-0000-0000-000000000001' from public.event_admin where event_id = pg_temp.id('draft')), 'ticking it again keeps who ticked it first');
select public.set_event_checklist_item(pg_temp.id('draft'), 'security_list', true);
select pg_temp.expect((select checklist ? 'security_list' and checklist ? 'form_submitted' from public.event_admin where event_id = pg_temp.id('draft')), 'another item is ticked alongside');
select public.set_event_checklist_item(pg_temp.id('draft'), 'security_list', false);
select pg_temp.expect((select not (checklist ? 'security_list') and checklist ? 'form_submitted' from public.event_admin where event_id = pg_temp.id('draft')), 'unticking removes only that item');
select pg_temp.expect((select updated_by = '00000000-0000-0000-0000-0000000000d1' from public.event_admin where event_id = pg_temp.id('draft')), 'the row records who changed it last');
select pg_temp.expect(pg_temp.fails($$select public.set_event_checklist_item((select id from ids where name = 'draft'), 'su_approved', true)$$), '"SU approved" is ticked with su_approved_at, not here');
select pg_temp.expect(pg_temp.fails($$select public.set_event_checklist_item((select id from ids where name = 'draft'), 'bogus', true)$$), 'only real checklist items');
select pg_temp.expect(pg_temp.error_of($$select public.set_event_checklist_item((select id from ids where name = 'published'), 'form_submitted', true)$$) = 'Add the event admin answers first', 'an event without answers says so');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.fails($$select public.set_event_checklist_item((select id from ids where name = 'draft'), 'room_confirmed', true)$$), 'another society''s manager cannot tick it');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$select public.set_event_checklist_item((select id from ids where name = 'draft'), 'room_confirmed', true)$$), 'nor can a student');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.set_event_checklist_item((select id from ids where name = 'draft'), 'room_confirmed', true)$$), 'nor a logged-out visitor');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select public.set_event_checklist_item(pg_temp.id('draft'), 'room_confirmed', true);
select pg_temp.expect((select checklist -> 'room_confirmed' ->> 'done_by' = '00000000-0000-0000-0000-0000000000a0' from public.event_admin where event_id = pg_temp.id('draft')), 'a Function admin can tick it');
select pg_temp.as_server();
select pg_temp.expect((select not (checklist ? 'room_confirmed') or checklist -> 'room_confirmed' ->> 'done_by' = '00000000-0000-0000-0000-0000000000a0' from public.event_admin where event_id = pg_temp.id('draft')), 'nobody else changed it');

-- Ticks only go through set_event_checklist_item: writing event_admin
-- directly can't backdate a tick, credit it to someone else, or tick it at
-- all (the rest of the row still saves as before).
create temp table before_direct as select checklist from public.event_admin where event_id = pg_temp.id('draft');
grant all on before_direct to anon, authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.event_admin
   set checklist = jsonb_build_object('form_submitted', jsonb_build_object('done_at', '2020-01-01T00:00:00Z', 'done_by', '00000000-0000-0000-0000-000000000002'), 'junk', repeat('x', 1000)),
       speaker_names = 'Dr Direct'
 where event_id = pg_temp.id('draft');
select pg_temp.expect((select a.checklist = b.checklist and a.speaker_names = 'Dr Direct' from public.event_admin a, before_direct b where a.event_id = pg_temp.id('draft')), 'a manager writing the checklist directly leaves it unchanged (the answers still save)');
insert into public.event_admin (event_id, checklist) values (pg_temp.id('published'), '{"form_submitted": {"done_at": "x", "done_by": "00000000-0000-0000-0000-000000000003"}}'::jsonb);
select pg_temp.expect((select checklist = '{}'::jsonb from public.event_admin where event_id = pg_temp.id('published')), 'a new row written directly starts with nothing ticked');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.event_admin set checklist = '{}'::jsonb where event_id = pg_temp.id('draft');
select pg_temp.expect((select a.checklist = b.checklist from public.event_admin a, before_direct b where a.event_id = pg_temp.id('draft')), 'nor can a Function admin from the app');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.set_event_checklist_item(pg_temp.id('published'), 'native_tickets', true);
select pg_temp.expect((select checklist -> 'native_tickets' ->> 'done_by' = '00000000-0000-0000-0000-000000000001' from public.event_admin where event_id = pg_temp.id('published')), 'ticking through the server still works');
update public.event_admin set checklist = '{}'::jsonb where event_id = pg_temp.id('published');
select pg_temp.expect((select checklist ? 'native_tickets' from public.event_admin where event_id = pg_temp.id('published')), 'and straight after it, a direct write still can''t change the checklist');
select pg_temp.as_server();
delete from public.event_admin where event_id = pg_temp.id('published');

-- ---------------------------------------------------------------------
-- 3. Reminders before each checklist deadline
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$select public.queue_hub_reminders()$$), 'a student cannot send the reminders');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.queue_hub_reminders()$$), 'nor a manager');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$select public.queue_hub_reminders()$$), 'nor a Function admin from the app');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.queue_hub_reminders()$$), 'nor a logged-out visitor');

-- The draft: "Form submitted" due tomorrow (not ticked), "Academic chair"
-- due in 2 days (not ticked), "Room confirmed" due tomorrow but ticked,
-- "Native tickets" due in 10 days, "Security list" due yesterday, "SU
-- approved" due today but approved. Two of them are reminded, to each of
-- D's two managers.
select pg_temp.as_server();
delete from public.push_queue;
update public.event_admin set checklist = '{"room_confirmed": {"done_at": "2026-10-01T10:00:00Z", "done_by": null}}'::jsonb,
  su_approved_at = now(),
  deadlines = jsonb_build_object('form_submitted', pg_temp.day(1), 'academic_chair', pg_temp.day(2), 'room_confirmed', pg_temp.day(1),
                                 'native_tickets', pg_temp.day(10), 'security_list', pg_temp.day(-1), 'su_approved', pg_temp.day(0))
  where event_id = pg_temp.id('draft');
select pg_temp.expect(public.queue_hub_reminders() = 4, 'two items due soon and not ticked, to two managers: 4 reminders');
select pg_temp.expect((select count(*) from public.push_queue
  where user_id = '00000000-0000-0000-0000-000000000001' and kind = 'hub'
    and title = 'Form submitted on Podio due ' || to_char((now() at time zone 'Europe/London')::date + 1, 'Dy FMDD Mon')
    and body = 'Docs Draft Talk: tick it off in the Society Hub once it''s done.'
    and url = '/dashboard/70000000-0000-0000-0000-00000000000d/events/' || pg_temp.id('draft')
    and dedupe_key = 'ea:' || pg_temp.id('draft') || ':form_submitted:00000000-0000-0000-0000-000000000001:' || pg_temp.day(0)) = 1,
  'Sam is reminded that the form is due tomorrow (a draft counts), opening the event''s manage screen');
select pg_temp.expect((select title from public.push_queue where user_id = '00000000-0000-0000-0000-0000000000d1' and dedupe_key like 'ea:%:academic_chair:%')
  = 'Academic chair secured due ' || to_char((now() at time zone 'Europe/London')::date + 2, 'Dy FMDD Mon'), 'Dee is reminded about the academic chair, due in 2 days');
select pg_temp.expect(not exists (select 1 from public.push_queue where dedupe_key like 'ea:%:room_confirmed:%'), 'an item already ticked: no reminder');
select pg_temp.expect(not exists (select 1 from public.push_queue where dedupe_key like 'ea:%:native_tickets:%'), 'an item due in 10 days: no reminder yet');
select pg_temp.expect(not exists (select 1 from public.push_queue where dedupe_key like 'ea:%:security_list:%'), 'an item whose deadline has passed: no reminder');
select pg_temp.expect(not exists (select 1 from public.push_queue where dedupe_key like 'ea:%:su_approved:%'), '"SU approved" once su_approved_at is set: no reminder');
select pg_temp.expect(not exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002'), 'members aren''t reminded, only managers');
select pg_temp.expect(public.queue_hub_reminders() = 0, 'running it again the same day queues nothing');
select pg_temp.expect((select count(*) from public.push_queue) = 4, 'and no duplicate');
-- The next day (yesterday's reminders went): reminded again.
update public.push_queue set dedupe_key = replace(dedupe_key, ':' || pg_temp.day(0), ':' || pg_temp.day(-1)), created_at = now() - interval '1 day';
select pg_temp.expect(public.queue_hub_reminders() = 4, 'one a day per item: reminded again the next day');
-- Ticking it off stops its reminders; unticking "SU approved" with it due today brings one.
delete from public.push_queue;
update public.event_admin set checklist = checklist || jsonb_build_object('form_submitted', jsonb_build_object('done_at', now(), 'done_by', null)),
  su_approved_at = null
  where event_id = pg_temp.id('draft');
select pg_temp.expect(public.queue_hub_reminders() = 4, 'form ticked; "SU approved" due today and not approved: chair and SU approved, 2 managers each');
select pg_temp.expect(not exists (select 1 from public.push_queue where dedupe_key like 'ea:%:form_submitted:%'), 'no reminder for the form once it''s ticked');
select pg_temp.expect((select count(*) from public.push_queue where dedupe_key like 'ea:%:su_approved:%' and title = 'SU approved due ' || to_char((now() at time zone 'Europe/London')::date, 'Dy FMDD Mon')) = 2, '"SU approved" is due today');
-- Someone with Society Hub pushes off isn't reminded (and isn't counted).
delete from public.push_queue;
insert into public.notification_settings (user_id, hub) values ('00000000-0000-0000-0000-0000000000d1', false)
on conflict (user_id) do update set hub = false;
select pg_temp.expect(public.queue_hub_reminders() = 2, 'Dee has Society Hub pushes off: only Sam''s 2');
delete from public.notification_settings where user_id = '00000000-0000-0000-0000-0000000000d1';

-- No reminders for an event that's cancelled, hidden, over, or of a
-- society that has switched Event admin off; odd deadlines are skipped.
delete from public.push_queue;
update public.events set is_cancelled = true where id = pg_temp.id('draft');
select pg_temp.expect(public.queue_hub_reminders() = 0, 'a cancelled event: no reminders');
update public.events set is_cancelled = false, is_hidden = true where id = pg_temp.id('draft');
select pg_temp.expect(public.queue_hub_reminders() = 0, 'a hidden event: no reminders');
update public.events set is_hidden = false, starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = pg_temp.id('draft');
select pg_temp.expect(public.queue_hub_reminders() = 0, 'an event that has happened: no reminders');
update public.events set starts_at = now() + interval '20 days', ends_at = now() + interval '20 days 2 hours' where id = pg_temp.id('draft');
update public.society_features set enabled = false where society_id = '70000000-0000-0000-0000-00000000000d' and feature_key = 'event_admin';
select pg_temp.expect(public.queue_hub_reminders() = 0, 'Event admin switched off: no reminders');
update public.society_features set enabled = true where society_id = '70000000-0000-0000-0000-00000000000d' and feature_key = 'event_admin';
update public.event_admin set deadlines = jsonb_build_object('form_submitted', 'soon', 'academic_chair', '2026-13-45', 'bogus', pg_temp.day(1), 'room_confirmed', pg_temp.day(1) || 'T00:00')
  where event_id = pg_temp.id('draft');
select pg_temp.expect(pg_temp.error_of($$select public.queue_hub_reminders()$$) is null, 'odd deadlines cause no error');
select pg_temp.expect(not exists (select 1 from public.push_queue where dedupe_key like 'ea:%'), 'and send nothing');
-- X has Event admin off: its rows send nothing.
insert into ids values ('x_event', pg_temp.event('70000000-0000-0000-0000-00000000000f', 'Docs X Talk', true));
insert into public.event_admin (event_id, deadlines) values (pg_temp.id('x_event'), jsonb_build_object('form_submitted', pg_temp.day(1)));
select pg_temp.expect(public.queue_hub_reminders() = 0, 'a society with Event admin off: no reminders');

-- The Founding nudge still goes: F agreed 10 days ago and hasn't posted.
delete from public.push_queue;
update public.societies set is_founding = true where id = '70000000-0000-0000-0000-0000000000f0';
insert into public.founding_agreements (society_id, agreed_by, agreed_at) values ('70000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000f2', now() - interval '10 days');
update public.event_admin set deadlines = jsonb_build_object('academic_chair', pg_temp.day(2)) where event_id = pg_temp.id('draft');
select pg_temp.expect(public.queue_hub_reminders() = 3, 'the Founding nudge (Fin) and the event admin reminders (Sam, Dee) together');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-0000000000f2' and title = 'Time to post your next event?'
  and dedupe_key like 'founding-nudge:70000000-0000-0000-0000-0000000000f0:%') = 1, 'Fin gets the Founding nudge as before');

-- ---------------------------------------------------------------------
-- 4. A draft's hosts
-- ---------------------------------------------------------------------
select pg_temp.as_server();
insert into public.event_entries (event_id, user_id, status) values (pg_temp.id('draft'), '00000000-0000-0000-0000-000000000002', 'going'), (pg_temp.id('published'), '00000000-0000-0000-0000-000000000002', 'going');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not exists (select 1 from public.event_hosts(pg_temp.id('draft'))), 'a member added to a draft learns nothing about its hosts');
select pg_temp.expect((select count(*) from public.event_hosts(pg_temp.id('published'))) = 2, 'a published event''s hosts (D''s two managers) as before');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.event_hosts(pg_temp.id('draft'))), 'another society''s manager: nothing');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.event_hosts(pg_temp.id('draft'))) = 2, 'the society''s committee sees its draft''s hosts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from public.event_hosts(pg_temp.id('draft'))) = 2, 'so does a Function admin');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select * from public.event_hosts((select id from ids where name = 'published'))$$), 'logged out: not allowed, as before');
-- A student-hosted event's host, as before.
select pg_temp.as_server();
insert into public.events (id, host_user_id, title, category, lat, lng, starts_at, ends_at, visibility)
values ('70000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000001', 'Docs Hosted', 'social', 51.5, -0.11, now() + interval '3 days', now() + interval '3 days 2 hours', 'public');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select array_agg(h) from public.event_hosts('70000000-0000-0000-0000-0000000000e1') h) = array['00000000-0000-0000-0000-000000000001'::uuid], 'a student-hosted event''s host as before');

-- ---------------------------------------------------------------------
-- 5. The live societies are untouched
-- ---------------------------------------------------------------------
select pg_temp.as_server();
select pg_temp.expect(not exists (select 1 from public.event_admin a join public.societies s on s.id = a.society_id where s.slug = 'lse-poker-society'), 'LSE Poker Society has no event admin rows');
delete from public.push_queue;
select pg_temp.expect(not exists (select 1 from public.event_admin where society_id not in (select id from public.societies where slug like 'ead-%')) , 'only this test''s event admin rows exist');

rollback;
