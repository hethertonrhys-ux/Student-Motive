-- The permission rules for societies, in one place (each part's own test file
-- covers its details). Two societies: "Perm A" run by Sam (LSE) and "Perm B"
-- run by Cas (UCL); Bea is a plain student; Ada is a Function admin.
-- A society manager:
--   1. can't read or change another society's data,
--   2. never sees other people's email addresses,
--   3. can't read admin panel data or use admin tools,
--   4. can't make anyone (including themselves) an app admin.
-- Everything runs inside one transaction that is rolled back at the end.
begin;
reset role;
insert into public.societies (id, slug, name, university, is_founding) values
  ('90000000-0000-0000-0000-00000000000a', 'perm-a', 'Perm A', 'LSE', false),
  ('90000000-0000-0000-0000-00000000000b', 'perm-b', 'Perm B', 'UCL', true);
insert into public.society_admins (society_id, user_id) values
  ('90000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000003');
insert into public.society_members (society_id, user_id, status, approved_at) values
  ('90000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'approved', now()),
  ('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000002', 'approved', now());
-- Society B's private data, written as the database owner.
insert into public.feature_requests (society_id, requested_by, need) values ('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000003', 'A bracket for our chess tournament');
insert into public.feature_interest (society_id, feature_key, created_by) values ('90000000-0000-0000-0000-00000000000b', 'polls', '00000000-0000-0000-0000-000000000003');
insert into public.founding_agreements (society_id, agreed_by) values ('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000003');
insert into public.society_manager_invites (society_id, email, invited_by) values ('90000000-0000-0000-0000-00000000000b', 'next.year@ucl.ac.uk', '00000000-0000-0000-0000-000000000003');
insert into public.events (id, society_id, title, category, lat, lng, starts_at, ends_at, is_draft)
values ('90000000-0000-0000-0000-0000000000e1', '90000000-0000-0000-0000-00000000000b', 'Perm B draft', 'social', 51.52, -0.13, now() + interval '20 days', now() + interval '20 days 2 hours', true);
insert into public.event_admin (event_id, society_id, expected_attendees) values ('90000000-0000-0000-0000-0000000000e1', '90000000-0000-0000-0000-00000000000b', 40);
insert into public.society_features (society_id, feature_key, enabled) values ('90000000-0000-0000-0000-00000000000b', 'tables', true);

-- 1. Sam (manager of A) can't read or change B's data.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.feature_requests where society_id = '90000000-0000-0000-0000-00000000000b') = 0, 'another society''s feature requests are hidden');
select pg_temp.expect((select count(*) from public.feature_interest where society_id = '90000000-0000-0000-0000-00000000000b') = 0, 'another society''s "we want this" list is hidden');
select pg_temp.expect((select count(*) from public.founding_agreements where society_id = '90000000-0000-0000-0000-00000000000b') = 0, 'another society''s Founding agreement is hidden');
select pg_temp.expect((select count(*) from public.society_manager_invites where society_id = '90000000-0000-0000-0000-00000000000b') = 0, 'another society''s manager invites are hidden');
select pg_temp.expect((select count(*) from public.event_admin where society_id = '90000000-0000-0000-0000-00000000000b') = 0, 'another society''s event admin answers are hidden');
select pg_temp.expect((select count(*) from public.events where id = '90000000-0000-0000-0000-0000000000e1') = 0, 'another society''s draft event is hidden');
select pg_temp.expect((select count(*) from public.society_member_list('90000000-0000-0000-0000-00000000000b')) = 0, 'another society''s member list is empty');
select pg_temp.expect((select count(*) from public.society_managers('90000000-0000-0000-0000-00000000000b')) = 0, 'another society''s manager list is empty');
select pg_temp.expect((select count(*) from public.founding_progress('90000000-0000-0000-0000-00000000000b')) = 0, 'another society''s Founding progress is hidden');
update public.society_features set enabled = false where society_id = '90000000-0000-0000-0000-00000000000b' and feature_key = 'tables';
update public.event_admin set expected_attendees = 999 where event_id = '90000000-0000-0000-0000-0000000000e1';
update public.feature_requests set need = 'changed by someone else' where society_id = '90000000-0000-0000-0000-00000000000b';
select pg_temp.expect(pg_temp.fails($$insert into public.society_features (society_id, feature_key, enabled) values ('90000000-0000-0000-0000-00000000000b', 'ledger', false)$$), 'can''t add a feature flag for another society');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_requests (society_id, need) values ('90000000-0000-0000-0000-00000000000b', 'sneaky request')$$), 'can''t send a request as another society');
select pg_temp.expect(pg_temp.fails($$insert into public.society_admins (society_id, user_id) values ('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001')$$), 'can''t make yourself a manager of another society');
select pg_temp.expect(pg_temp.fails($$select public.add_society_manager('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001')$$), 'can''t add a manager to another society');
select pg_temp.expect(pg_temp.fails($$select public.invite_society_manager('90000000-0000-0000-0000-00000000000b', 'friend@lse.ac.uk')$$), 'can''t invite a manager to another society');
select pg_temp.expect(pg_temp.fails($$select public.agree_to_founding('90000000-0000-0000-0000-00000000000b')$$), 'can''t sign another society''s Founding agreement');
select pg_temp.expect(pg_temp.fails($$update public.societies set is_founding = true where id = '90000000-0000-0000-0000-00000000000a'$$) or not (select is_founding from public.societies where id = '90000000-0000-0000-0000-00000000000a'), 'can''t make your own society Founding');
reset role;
select pg_temp.expect((select enabled from public.society_features where society_id = '90000000-0000-0000-0000-00000000000b' and feature_key = 'tables'), 'B''s feature flag is unchanged');
select pg_temp.expect((select expected_attendees from public.event_admin where event_id = '90000000-0000-0000-0000-0000000000e1') = 40, 'B''s event admin answers are unchanged');
select pg_temp.expect((select need from public.feature_requests where society_id = '90000000-0000-0000-0000-00000000000b') = 'A bracket for our chess tournament', 'B''s request is unchanged');
select pg_temp.expect(not exists (select 1 from public.society_admins where society_id = '90000000-0000-0000-0000-00000000000b' and user_id = '00000000-0000-0000-0000-000000000001'), 'Sam is still not a manager of B');

-- 2. No emails: not other people's profiles, not in the member list, not in the manager list.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.profiles where id <> '00000000-0000-0000-0000-000000000001') = 0, 'other people''s profiles (and their emails) aren''t readable');
select pg_temp.expect(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_cards' and column_name = 'email'), 'the public profile cards have no email');
select pg_temp.expect((select count(*) from public.society_member_list('90000000-0000-0000-0000-00000000000a') where user_id = '00000000-0000-0000-0000-000000000002' and email is null) = 1, 'own member list: Bea''s name but no email');
select pg_temp.expect(not exists (select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'public' and r.routine_name = 'society_managers' and p.parameter_mode = 'OUT' and p.parameter_name = 'email'), 'the manager list has no email column');

-- 3. Admin panel data and tools are refused.
select pg_temp.expect(pg_temp.fails($$select * from public.admin_search_users('bea')$$), 'admin user search refused');
select pg_temp.expect(pg_temp.fails($$select public.admin_user_detail('00000000-0000-0000-0000-000000000002')$$), 'admin user detail refused');
select pg_temp.expect(pg_temp.fails($$select * from public.admin_list_events()$$), 'admin event list refused');
select pg_temp.expect(pg_temp.fails($$select * from public.admin_founding_societies()$$), 'admin Founding list refused');
select pg_temp.expect(pg_temp.fails($$select * from public.admin_feature_interest()$$), 'admin wanted-features list refused');
select pg_temp.expect(pg_temp.fails($$select * from public.admin_feature_requests()$$), 'admin requests queue refused');
select pg_temp.expect(pg_temp.fails($$select * from public.create_society_claim_link('90000000-0000-0000-0000-00000000000a')$$), 'creating claim links refused');
select pg_temp.expect((select count(*) from public.society_claim_links) = 0, 'claim links aren''t readable');
select pg_temp.expect((select count(*) from public.allowed_emails) = 0, 'the "who can join" list isn''t readable');
select pg_temp.expect(pg_temp.fails($$update public.feature_requests set status = 'live' where society_id = '90000000-0000-0000-0000-00000000000a'$$) or true, 'status changes are refused (checked below)');
insert into public.feature_requests (society_id, need) values ('90000000-0000-0000-0000-00000000000a', 'A poll before each social');
update public.feature_requests set status = 'live', admin_note = 'self-approved' where society_id = '90000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select status from public.feature_requests where society_id = '90000000-0000-0000-0000-00000000000a') = 'new', 'a manager can''t mark their own request live');

-- 4. Nothing a manager does makes anyone an app admin.
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000001';
select pg_temp.expect(pg_temp.fails($$update public.profile_cards set name = 'x' where id = '00000000-0000-0000-0000-000000000001'$$), 'profile cards are read-only');
select public.add_society_manager('90000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002');
select public.invite_society_manager('90000000-0000-0000-0000-00000000000a', 'someone.new@lse.ac.uk');
reset role;
select pg_temp.expect(not (select is_admin from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'Sam is still not an app admin');
select pg_temp.expect(not (select is_admin from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'Bea, added as a manager, is not an app admin');
select pg_temp.expect((select count(*) from public.profiles where is_admin) = 1, 'Ada is still the only app admin');

-- Ada (app admin) sees everything.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from public.feature_requests where society_id in ('90000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-00000000000b')) = 2, 'an app admin sees every society''s requests');
select pg_temp.expect((select count(*) from public.event_admin where society_id = '90000000-0000-0000-0000-00000000000b') = 1, 'an app admin sees event admin answers');
select pg_temp.expect((select count(*) from public.admin_founding_societies() where society_id = '90000000-0000-0000-0000-00000000000b') = 1, 'an app admin sees the Founding list');

reset role;
rollback;
