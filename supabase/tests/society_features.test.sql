-- 20261117000000_society_features.sql: feature flags per society.
--
--   A  feat-a   LSE, no type, managed by Sam
--   B  feat-b   UCL, no type, managed by Cas
--   C  feat-c   LSE, type games, no manager
--   D  feat-d   UCL, type academic, no manager
--   E  feat-e   LSE, no type, no manager (a legacy society)
reset role;
insert into public.societies (id, slug, name, university, society_type) values
  ('20000000-0000-0000-0000-00000000000a', 'feat-a', 'Feature A', 'LSE', null),
  ('20000000-0000-0000-0000-00000000000b', 'feat-b', 'Feature B', 'UCL', null),
  ('20000000-0000-0000-0000-00000000000c', 'feat-c', 'Feature C', 'LSE', 'games'),
  ('20000000-0000-0000-0000-00000000000d', 'feat-d', 'Feature D', 'UCL', 'academic'),
  ('20000000-0000-0000-0000-00000000000e', 'feat-e', 'Feature E', 'LSE', null)
on conflict do nothing;
insert into public.society_admins (society_id, user_id) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000003')
on conflict do nothing;
insert into public.society_features (society_id, feature_key, enabled) values
  ('20000000-0000-0000-0000-00000000000b', 'ledger', true)
on conflict do nothing;

-- The society type only takes the six known values.
select pg_temp.expect(pg_temp.fails($$update public.societies set society_type = 'party' where id = '20000000-0000-0000-0000-00000000000e'$$), 'society_type only takes the six types');

-- 1. Anyone, even logged out, can read which features are on, but not change them.
select pg_temp.act_as(null);
select pg_temp.expect((select enabled from public.society_features where society_id = '20000000-0000-0000-0000-00000000000b' and feature_key = 'ledger'), 'a logged-out visitor can read flags');
select pg_temp.expect(pg_temp.fails($$insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-00000000000e', 'tables', false)$$), 'a logged-out visitor cannot add a flag');
select pg_temp.expect(pg_temp.fails($$update public.society_features set enabled = false$$), 'a logged-out visitor cannot change flags');
select pg_temp.expect(pg_temp.fails($$delete from public.society_features$$), 'a logged-out visitor cannot delete flags');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'event_chats'), 'a logged-out visitor can call society_feature_on');
select pg_temp.expect(pg_temp.fails($$select updated_by from public.society_features$$), 'a logged-out visitor cannot see who changed a flag');

-- 2. A society's manager can add and change its own flags; who and when are stamped.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.society_features (society_id, feature_key, enabled, updated_by, updated_at)
  values ('20000000-0000-0000-0000-00000000000a', 'tables', false, '00000000-0000-0000-0000-000000000002', '2020-01-01');
select pg_temp.expect((select enabled from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables') = false, 'the manager switched tables off');
reset role;
select pg_temp.expect((select updated_by from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables') = '00000000-0000-0000-0000-000000000001', 'updated_by is stamped with the manager, whatever was sent');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select updated_at from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables') > now() - interval '1 minute', 'updated_at is stamped');
update public.society_features set enabled = true, config = '{"default_seats": 9}' where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables';
select pg_temp.expect((select enabled and config ->> 'default_seats' = '9' from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables'), 'the manager switched tables back on with a setting');
-- An upsert (what the app sends) works too.
insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-00000000000a', 'tables', false)
  on conflict (society_id, feature_key) do update set enabled = excluded.enabled;
select pg_temp.expect((select not enabled from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables'), 'the manager can upsert a flag');

-- 3. ...but not another society's, and cannot move a flag to another society.
select pg_temp.expect(pg_temp.fails($$insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-00000000000b', 'tables', false)$$), 'a manager cannot add a flag to another society');
update public.society_features set enabled = false where society_id = '20000000-0000-0000-0000-00000000000b';
select pg_temp.expect(pg_temp.fails($$update public.society_features set society_id = '20000000-0000-0000-0000-00000000000b' where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables'$$), 'a manager cannot move a flag to another society');
-- Nobody deletes flags (switching off sets enabled = false), not even the manager.
select pg_temp.fails($$delete from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a'$$);
reset role;
select pg_temp.expect((select enabled from public.society_features where society_id = '20000000-0000-0000-0000-00000000000b' and feature_key = 'ledger'), 'another society''s flag is unchanged');
select pg_temp.expect(exists (select 1 from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables'), 'the manager could not delete a flag');

-- 4. A plain student can't add, change or delete any flags.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-00000000000a', 'ledger', false)$$), 'a student cannot add a flag');
select pg_temp.expect(pg_temp.fails($$select updated_by from public.society_features$$), 'a student cannot see who changed a flag');
update public.society_features set enabled = true;
select pg_temp.fails($$delete from public.society_features$$);
reset role;
select pg_temp.expect((select not enabled from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables'), 'a student could not change a flag');
select pg_temp.expect((select count(*) from public.society_features where society_id in ('20000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b')) = 2, 'a student could not delete flags');

-- 5. A Function admin can change any society's flags (but still not delete them).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.society_features set enabled = false where society_id = '20000000-0000-0000-0000-00000000000b' and feature_key = 'ledger';
insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-00000000000e', 'member_invites', false);
select pg_temp.expect(pg_temp.fails($$delete from public.society_features where society_id = '20000000-0000-0000-0000-00000000000b'$$), 'even a Function admin cannot delete flags');
reset role;
select pg_temp.expect((select not enabled and updated_by = '00000000-0000-0000-0000-0000000000a0' from public.society_features where society_id = '20000000-0000-0000-0000-00000000000b' and feature_key = 'ledger'), 'a Function admin changed another society''s flag (and is stamped)');
-- Server-side changes (no one logged in) leave updated_by empty.
select set_config('request.jwt.claim.sub', '', false);
update public.society_features set enabled = true where society_id = '20000000-0000-0000-0000-00000000000e' and feature_key = 'member_invites';
select pg_temp.expect((select updated_by is null from public.society_features where society_id = '20000000-0000-0000-0000-00000000000e' and feature_key = 'member_invites'), 'a server-side change has no updated_by');
update public.society_features set enabled = false where society_id = '20000000-0000-0000-0000-00000000000e' and feature_key = 'member_invites';

-- 6. Defaults when a society has no row for a feature.
-- A legacy society (no type) keeps the six existing features, not Event admin.
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'signup_lists'), 'legacy: sign-up lists on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'tables'), 'legacy: tables on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'ledger'), 'legacy: ledger on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'event_cost'), 'legacy: event cost on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'event_chats'), 'legacy: event chats on');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'event_admin'), 'legacy: event admin off');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'polls'), 'legacy: coming-soon features off');
-- A typed LSE society gets event chats and Event admin; a typed UCL society only event chats.
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'event_chats'), 'typed LSE: event chats on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'event_admin'), 'typed LSE: event admin on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000d', 'event_chats'), 'typed UCL: event chats on');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000d', 'event_admin'), 'typed UCL: event admin off');
-- The rest follow the type, as in hasFeature(): a games society gets the lot...
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'tables'), 'typed games: tables on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'ledger'), 'typed games: ledger on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'signup_lists'), 'typed games: sign-up lists on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'event_cost'), 'typed games: event cost on');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'member_invites'), 'typed games: member invites on');
-- ...an academic society gets sign-up lists but not tables, the ledger or event cost.
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000d', 'tables'), 'typed academic: tables off');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000d', 'ledger'), 'typed academic: ledger off');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000d', 'event_cost'), 'typed academic: event cost off');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000d', 'signup_lists'), 'typed academic: sign-up lists on');
-- Unknown features and unknown societies are off.
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'no_such_feature'), 'an unknown feature is off');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-0000000000ff', 'event_chats'), 'an unknown society has nothing on');
-- 7. An explicit row wins, both ways.
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000a', 'tables'), 'override: tables switched off');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000e', 'member_invites'), 'override: member invites switched off');
insert into public.society_features (society_id, feature_key, enabled) values
  ('20000000-0000-0000-0000-00000000000c', 'event_admin', false),
  ('20000000-0000-0000-0000-00000000000d', 'event_admin', true),
  ('20000000-0000-0000-0000-00000000000c', 'event_chats', false);
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'event_admin'), 'override: event admin switched off at LSE');
select pg_temp.expect(public.society_feature_on('20000000-0000-0000-0000-00000000000d', 'event_admin'), 'override: event admin switched on at UCL');
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'event_chats'), 'override: event chats switched off');
-- ...except for coming-soon features, which stay off whatever the row says.
insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-00000000000c', 'polls', true);
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-00000000000c', 'polls'), 'a row cannot switch on a coming-soon feature');

-- 8. The backfill. The test database runs every migration before the seed,
--    so no society has a manager when the migration first runs here; run
--    it again (it is safe to repeat) with a claimed society G and an
--    unclaimed one H, then undo it all.
begin;
insert into public.societies (id, slug, name, university) values
  ('20000000-0000-0000-0000-000000000006', 'feat-g', 'Feature G', 'LSE'),
  ('20000000-0000-0000-0000-000000000007', 'feat-h', 'Feature H', 'LSE');
insert into public.society_admins (society_id, user_id) values ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002');
insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-000000000006', 'ledger', false);
\ir ../migrations/20261117000000_society_features.sql
select pg_temp.expect((select count(*) from public.society_features where society_id = '20000000-0000-0000-0000-000000000006') = 7, 'backfill: a claimed society gets a row for each existing feature and Event admin');
select pg_temp.expect((select count(*) from public.society_features where society_id = '20000000-0000-0000-0000-000000000006' and enabled and feature_key in ('signup_lists', 'tables', 'event_cost', 'member_invites', 'event_chats')) = 5, 'backfill: the existing features are on');
select pg_temp.expect((select not enabled from public.society_features where society_id = '20000000-0000-0000-0000-000000000006' and feature_key = 'event_admin'), 'backfill: Event admin is off');
select pg_temp.expect((select not enabled from public.society_features where society_id = '20000000-0000-0000-0000-000000000006' and feature_key = 'ledger'), 'backfill: a choice already made is kept');
select pg_temp.expect(not exists (select 1 from public.society_features where society_id = '20000000-0000-0000-0000-000000000007'), 'backfill: an unclaimed society gets no rows');
select pg_temp.expect((select not enabled from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'tables'), 'backfill: existing rows are left alone');
select pg_temp.expect((select count(*) from public.society_features where society_id = '20000000-0000-0000-0000-00000000000a') = 7, 'backfill: claimed society A gets the missing rows');
rollback;

-- 9. Switching event chats off doesn't break chats that already exist: the
--    chat stays in Sam's list, the committee can still send, and Sam is
--    still notified (so a notification never points at a missing chat).
reset role;
insert into public.societies (id, slug, name, university) values ('20000000-0000-0000-0000-000000000008', 'feat-chat', 'Feature Chat', 'LSE') on conflict do nothing;
insert into public.society_admins (society_id, user_id) values ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002') on conflict do nothing;
insert into public.society_members (society_id, user_id, status, approved_at) values ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'approved', now()) on conflict do nothing;
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at, audience)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000008', 'Feature chat night', 'social', 51.51, -0.12, now() + interval '1 day', now() + interval '1 day 3 hours', 'london')
  on conflict do nothing;
insert into public.event_entries (event_id, user_id, status) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'going') on conflict do nothing;
insert into public.push_tokens (user_id, platform, token) values ('00000000-0000-0000-0000-000000000001', 'web', 'feature-test-token-sam') on conflict do nothing;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(exists (select 1 from public.my_threads() where event_id = '30000000-0000-0000-0000-000000000001'), 'the event chat is in Sam''s list');
reset role;
insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-000000000008', 'event_chats', false)
  on conflict (society_id, feature_key) do update set enabled = excluded.enabled;
select pg_temp.expect(not public.society_feature_on('20000000-0000-0000-0000-000000000008', 'event_chats'), 'event chats switched off');
delete from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.send_message((select id from public.threads where event_id = '30000000-0000-0000-0000-000000000001'), 'Doors open at 7');
reset role;
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001' and url = '/chats/' || (select id from public.threads where event_id = '30000000-0000-0000-0000-000000000001')) = 1, 'event chats off: Sam is still notified of a message in an existing chat');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select unread from public.my_threads() where event_id = '30000000-0000-0000-0000-000000000001') = 1, 'event chats off: the existing chat stays in Sam''s list, with the new message unread');
select pg_temp.expect(public.unread_message_count() >= 1, 'event chats off: the unread count includes it');
select public.send_message((select id from public.threads where event_id = '30000000-0000-0000-0000-000000000001'), 'See you there');
select pg_temp.expect((select last_body from public.my_threads() where event_id = '30000000-0000-0000-0000-000000000001') = 'See you there', 'event chats off: Sam can still reply');

-- 10. Deleting your account clears your name from the flags you changed
--     (on delete set null), and nobody can pin a change on someone else.
--     Dee is a throwaway manager so the other people stay for later tests.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'dee@lse.ac.uk') on conflict (id) do nothing;
insert into public.societies (id, slug, name, university) values ('20000000-0000-0000-0000-000000000009', 'feat-del', 'Feature Delete', 'LSE') on conflict do nothing;
insert into public.society_admins (society_id, user_id) values ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000d1') on conflict do nothing;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-000000000009', 'tables', false);
update public.society_features set updated_by = '00000000-0000-0000-0000-000000000002' where society_id = '20000000-0000-0000-0000-000000000009' and feature_key = 'tables';
reset role;
select pg_temp.expect((select updated_by from public.society_features where society_id = '20000000-0000-0000-0000-000000000009' and feature_key = 'tables') = '00000000-0000-0000-0000-0000000000d1', 'a manager cannot set updated_by to someone else');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.delete_my_account();
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 'Dee''s account is gone');
select pg_temp.expect((select updated_by is null and not enabled from public.society_features where society_id = '20000000-0000-0000-0000-000000000009' and feature_key = 'tables'), 'deleting your account clears updated_by and keeps the flag');

-- 11. With event chats off, a new event of that society gets no chat; with
--     them on (or for a society that never chose), it does.
reset role;
insert into public.societies (id, slug, name, university) values ('20000000-0000-0000-0000-00000000000a', 'feat-nochat', 'Feature No Chat', 'LSE') on conflict do nothing;
insert into public.society_features (society_id, feature_key, enabled) values ('20000000-0000-0000-0000-00000000000a', 'event_chats', false) on conflict (society_id, feature_key) do update set enabled = false;
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at)
values ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'No chat night', 'social', 51.5, -0.11, now() + interval '1 day', now() + interval '1 day 2 hours');
select pg_temp.expect(not exists (select 1 from public.threads where event_id = '30000000-0000-0000-0000-0000000000a1'), 'event chats off: a new event gets no chat');
update public.society_features set enabled = true where society_id = '20000000-0000-0000-0000-00000000000a' and feature_key = 'event_chats';
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at)
values ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'Chat night', 'social', 51.5, -0.11, now() + interval '1 day', now() + interval '1 day 2 hours');
select pg_temp.expect(exists (select 1 from public.threads where event_id = '30000000-0000-0000-0000-0000000000a2'), 'event chats on: a new event gets its chat');
