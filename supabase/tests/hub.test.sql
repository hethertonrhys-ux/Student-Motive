-- 20261119000000_society_hub.sql: the Society Hub.
--
--   H  hub-h  LSE, managed by Sam (the Hub's society)
--   O  hub-o  LSE, managed only by Cas (another society's manager)
--   B  hub-b  LSE, managed by Sam (for the blocks check)
--   Dee  ...0d  an LSE student with an account, added by email
reset role;
insert into public.societies (id, slug, name, university) values
  ('40000000-0000-0000-0000-000000000001', 'hub-h', 'Hub H Society', 'LSE'),
  ('40000000-0000-0000-0000-000000000002', 'hub-o', 'Hub O Society', 'LSE')
on conflict do nothing;
insert into public.society_admins (society_id, user_id) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')
on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'dee@lse.ac.uk') on conflict (id) do nothing;
update public.profiles set display_name = 'Sam Student' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set display_name = null, full_name = 'Bea Brown' where id = '00000000-0000-0000-0000-000000000002';
-- Bea and Dee have phones set up for pushes.
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000002', 'ios', 'ExponentPushToken[hub-bea]'),
  ('00000000-0000-0000-0000-00000000000d', 'ios', 'ExponentPushToken[hub-dee]')
on conflict (token) do nothing;

create or replace function pg_temp.error_of(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- 1. Only Function admins make a society Founding; committees can set its
--    type and when it finished setting up.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.societies set is_founding = true where id = '40000000-0000-0000-0000-000000000001';
update public.societies set society_type = 'games', onboarded_at = now() where id = '40000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select is_founding from public.societies where id = '40000000-0000-0000-0000-000000000001') = false, 'a manager cannot make their society Founding');
select pg_temp.expect((select society_type = 'games' and onboarded_at is not null from public.societies where id = '40000000-0000-0000-0000-000000000001'), 'a manager can set the society type and onboarded_at');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
update public.societies set onboarded_at = null, society_type = 'arts' where id = '40000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select society_type = 'games' and onboarded_at is not null from public.societies where id = '40000000-0000-0000-0000-000000000001'), 'a student cannot change another society');

-- 2. Agreeing to be a Founding Society.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$select public.agree_to_founding('40000000-0000-0000-0000-000000000001')$$) like '%isn''t a Founding Society%', 'agreeing is refused while the society is not Founding');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.societies set is_founding = true where id = '40000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select is_founding from public.societies where id = '40000000-0000-0000-0000-000000000001'), 'a Function admin can make a society Founding');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.agree_to_founding('40000000-0000-0000-0000-000000000001')$$) like '%Only the society''s managers%', 'a student cannot agree for a society');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.fails($$select public.agree_to_founding('40000000-0000-0000-0000-000000000001')$$), 'another society''s manager cannot agree for it');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.agree_to_founding('40000000-0000-0000-0000-000000000001')$$), 'a logged-out visitor cannot agree');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.agree_to_founding('40000000-0000-0000-0000-000000000001');
select public.agree_to_founding('40000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.expect((select count(*) from public.founding_agreements where society_id = '40000000-0000-0000-0000-000000000001'
  and agreed_by = '00000000-0000-0000-0000-000000000001' and events_target = 3 and agreed_at > now() - interval '1 minute') = 1, 'the manager''s agreement is stored once, with a target of 3 events');

-- Who can read agreements; nobody writes them directly.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.founding_agreements) = 1, 'the society''s manager reads its agreement');
select pg_temp.expect(pg_temp.fails($$insert into public.founding_agreements (society_id) values ('40000000-0000-0000-0000-000000000002')$$), 'a manager cannot insert an agreement directly');
select pg_temp.expect(pg_temp.fails($$update public.founding_agreements set events_target = 1$$), 'a manager cannot update the agreement');
select pg_temp.expect(pg_temp.fails($$delete from public.founding_agreements$$), 'a manager cannot delete the agreement');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select events_target from public.founding_agreements where society_id = '40000000-0000-0000-0000-000000000001') = 3, 'a manager cannot change the agreement');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.founding_agreements) = 0, 'another society''s manager cannot read it');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.founding_agreements) = 0, 'a student cannot read it');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select count(*) from public.founding_agreements$$), 'a logged-out visitor cannot read it');

-- 3. "We want this" for coming-soon features.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.feature_interest (society_id, feature_key) values ('40000000-0000-0000-0000-000000000001', 'polls');
insert into public.feature_interest (society_id, feature_key) values ('40000000-0000-0000-0000-000000000001', 'check_in_qr');
select pg_temp.expect((select count(*) from public.feature_interest where created_by = '00000000-0000-0000-0000-000000000001') = 2, 'a manager adds wishes for their society');
delete from public.feature_interest where society_id = '40000000-0000-0000-0000-000000000001' and feature_key = 'check_in_qr';
select pg_temp.expect((select count(*) from public.feature_interest) = 1, 'a manager removes a wish');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_interest (society_id, feature_key) values ('40000000-0000-0000-0000-000000000002', 'polls')$$), 'a manager cannot add a wish for another society');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_interest (society_id, feature_key, created_by) values ('40000000-0000-0000-0000-000000000001', 'announcements', '00000000-0000-0000-0000-000000000002')$$), 'a wish cannot be added in someone else''s name');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_interest (society_id, feature_key) values ('40000000-0000-0000-0000-000000000001', 'Not A Key!')$$), 'a malformed feature key is refused');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.feature_interest) = 0, 'another society''s manager cannot read its wishes');
delete from public.feature_interest where society_id = '40000000-0000-0000-0000-000000000001';
select pg_temp.expect(pg_temp.fails($$insert into public.feature_interest (society_id, feature_key) values ('40000000-0000-0000-0000-000000000001', 'announcements')$$), 'another society''s manager cannot add a wish for it');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.feature_interest) = 0, 'a student cannot read wishes');
select pg_temp.expect(pg_temp.fails($$insert into public.feature_interest (society_id, feature_key) values ('40000000-0000-0000-0000-000000000001', 'announcements')$$), 'a student cannot add a wish');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select count(*) from public.feature_interest$$), 'a logged-out visitor cannot read wishes');
reset role;
select pg_temp.expect((select count(*) from public.feature_interest where society_id = '40000000-0000-0000-0000-000000000001' and feature_key = 'polls') = 1, 'another society''s manager could not delete the wish');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from public.feature_interest) = 1, 'a Function admin reads wishes');

-- 4. Adding a manager by name.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.add_society_manager('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$$) like '%Only the society''s managers%', 'a student cannot make themselves a manager');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.fails($$select public.add_society_manager('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003')$$), 'another society''s manager cannot add themselves');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.add_society_manager('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ff')$$), 'nobody is added for an unknown person');
select public.add_society_manager('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
select public.add_society_manager('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
reset role;
select pg_temp.expect(exists (select 1 from public.society_admins where society_id = '40000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000002'), 'Sam added Bea as a manager');
select pg_temp.expect((select is_admin from public.profiles where id = '00000000-0000-0000-0000-000000000002') = false, 'Bea is still not a Function admin');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002' and kind = 'hub'
  and title = 'You''re now a manager of Hub H Society' and body = 'Open Function to see it.'
  and url = '/dashboard/40000000-0000-0000-0000-000000000001') = 1, 'Bea gets one Society Hub push, opening the society''s dashboard');

-- Blocks: nobody is made a manager by someone they've blocked (or who has
-- blocked them). Cas blocks Sam; Sam manages Hub B.
reset role;
insert into public.societies (id, slug, name, university) values
  ('40000000-0000-0000-0000-000000000003', 'hub-b', 'Hub B Society', 'LSE')
on conflict do nothing;
insert into public.society_admins (society_id, user_id) values
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001')
on conflict do nothing;
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001')
on conflict do nothing;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$select public.add_society_manager('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003')$$) like '%You can''t add this person%', 'Sam cannot add Cas, who has blocked him');
select pg_temp.expect(pg_temp.fails($$select public.invite_society_manager('40000000-0000-0000-0000-000000000003', 'cas@ucl.ac.uk')$$), 'nor add her by email');
select public.add_society_manager('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002');
reset role;
select pg_temp.expect(not exists (select 1 from public.society_admins where society_id = '40000000-0000-0000-0000-000000000003' and user_id = '00000000-0000-0000-0000-000000000003'), 'Cas was not made a manager');
select pg_temp.expect((select count(*) from public.society_admins where society_id = '40000000-0000-0000-0000-000000000003') = 2, 'Bea, who has blocked nobody, is still added: Hub B has 2 managers');
delete from public.user_blocks where blocker_id = '00000000-0000-0000-0000-000000000003' and blocked_id = '00000000-0000-0000-0000-000000000001';

-- 5. Adding a manager by email.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.invite_society_manager('40000000-0000-0000-0000-000000000001', '  New.Person@LSE.ac.uk ') = 'invited', 'an email with no account is invited');
select pg_temp.expect((select count(*) from public.society_manager_invites where email = 'new.person@lse.ac.uk' and invited_by = '00000000-0000-0000-0000-000000000002') = 1, 'the invite is stored in lower case, by who invited');
select pg_temp.expect(public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'new.person@lse.ac.uk') = 'invited', 'inviting again is fine');
select pg_temp.expect(pg_temp.error_of($$select public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'not an email')$$) like '%doesn''t look like an email address%', 'a bad email is refused');
select pg_temp.expect(pg_temp.error_of($$select public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'someone@gmail.com')$$) like '%Use their uni email%', 'an email that can never sign up is refused');
select pg_temp.expect((select count(*) from public.society_manager_invites where email = 'someone@gmail.com') = 0, 'and no invite is kept for it');
-- Emails the Function team has allowed (one address, or a whole domain) can
-- sign up, so they can be invited.
reset role;
insert into public.allowed_emails (email) values ('@partner.example.org'), ('guest@elsewhere.example.com') on conflict do nothing;
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'x@partner.example.org') = 'invited', 'an email on an allowed domain is invited');
select pg_temp.expect(public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'guest@elsewhere.example.com') = 'invited', 'an allowed email is invited');
delete from public.society_manager_invites where email in ('x@partner.example.org', 'guest@elsewhere.example.com');
reset role;
delete from public.allowed_emails where email in ('@partner.example.org', 'guest@elsewhere.example.com');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'dee@lse.ac.uk') = 'added', 'an email with an account is added straight away');
select pg_temp.expect(pg_temp.fails($$insert into public.society_manager_invites (society_id, email) values ('40000000-0000-0000-0000-000000000001', 'x@lse.ac.uk')$$), 'invites are not inserted directly');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.fails($$select public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'cas2@ucl.ac.uk')$$), 'another society''s manager cannot invite');
select pg_temp.expect((select count(*) from public.society_manager_invites) = 0, 'another society''s manager cannot see the invites');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'x@lse.ac.uk')$$), 'a logged-out visitor cannot invite');
reset role;
select pg_temp.expect(exists (select 1 from public.society_admins where society_id = '40000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000d'), 'Dee is a manager');
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'hub') = 1, 'Dee gets a Society Hub push');
-- The invited person signs up: they're a manager and the invite is used up.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'new.person@lse.ac.uk') on conflict (id) do nothing;
select pg_temp.expect(exists (select 1 from public.society_admins where society_id = '40000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000e'), 'signing up makes the invited person a manager');
select pg_temp.expect((select count(*) from public.society_manager_invites where email = 'new.person@lse.ac.uk') = 0, 'the invite is used up');
select pg_temp.expect((select is_admin from public.profiles where id = '00000000-0000-0000-0000-00000000000e') = false, 'the new manager is not a Function admin');
-- A manager can cancel an invite.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(public.invite_society_manager('40000000-0000-0000-0000-000000000001', 'later@lse.ac.uk') = 'invited', 'another invite');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
delete from public.society_manager_invites where email = 'later@lse.ac.uk';
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.society_manager_invites where email = 'later@lse.ac.uk') = 1, 'another society''s manager cannot cancel it');
delete from public.society_manager_invites where email = 'later@lse.ac.uk';
select pg_temp.expect((select count(*) from public.society_manager_invites) = 0, 'the society''s manager cancels it');

-- 6. The list of managers: names, never emails, and only for managers.
select pg_temp.expect(not exists (select 1 from pg_proc where proname = 'society_managers' and 'email' = any (proargnames)), 'society_managers has no email column');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.society_managers('40000000-0000-0000-0000-000000000001')) = 4, 'a manager sees all four managers');
select pg_temp.expect((select name from public.society_managers('40000000-0000-0000-0000-000000000001') where user_id = '00000000-0000-0000-0000-000000000001') = 'Sam Student', 'names come from the display name');
select pg_temp.expect((select name from public.society_managers('40000000-0000-0000-0000-000000000001') where user_id = '00000000-0000-0000-0000-000000000002') = 'Bea Brown', 'or else the full name');
select pg_temp.expect((select string_agg(user_id::text, ',') from public.society_managers('40000000-0000-0000-0000-000000000001') where is_me) = '00000000-0000-0000-0000-000000000001', 'only Sam''s row is marked as him');
select pg_temp.expect((select count(*) from public.society_managers('40000000-0000-0000-0000-000000000001') m where m::text like '%@%') = 0, 'no email anywhere in the rows');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.society_managers('40000000-0000-0000-0000-000000000001')) = 0, 'a non-manager gets nothing');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from public.society_managers('40000000-0000-0000-0000-000000000001')) = 4, 'a Function admin sees the managers');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select * from public.society_managers('40000000-0000-0000-0000-000000000001')$$), 'a logged-out visitor cannot list managers');

-- 7. Stepping down: never the last manager.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.error_of($$select public.leave_society_management('40000000-0000-0000-0000-000000000002')$$) like '%You''re the last manager. Add someone else first, then remove yourself.%', 'the last manager cannot leave');
select pg_temp.expect(pg_temp.error_of($$select public.leave_society_management('40000000-0000-0000-0000-000000000001')$$) like '%Only the society''s managers%', 'a non-manager cannot "leave"');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$select public.leave_society_management('40000000-0000-0000-0000-000000000001')$$), 'a Function admin who is not a manager cannot "leave"');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.leave_society_management('40000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.expect(not exists (select 1 from public.society_admins where society_id = '40000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000001'), 'Sam stepped down');
select pg_temp.expect((select count(*) from public.society_admins where society_id = '40000000-0000-0000-0000-000000000001') = 3, 'the others are still managers');
select pg_temp.expect(exists (select 1 from public.society_admins where society_id = '40000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-000000000003'), 'Cas is still O''s manager');
-- Sam can't add himself back now.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.add_society_manager('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')$$), 'a former manager cannot add themselves back');

-- 8. The 'hub' push kind: allowed, respects the setting, server-only.
reset role;
delete from public.push_queue;
select public.queue_push('00000000-0000-0000-0000-000000000002', 'hub', 'Hub news', 'Something happened', '/hub/x', 'hub-test:1');
select pg_temp.expect((select count(*) from public.push_queue where kind = 'hub' and dedupe_key = 'hub-test:1') = 1, 'queue_push accepts the hub kind');
insert into public.notification_settings (user_id, hub) values ('00000000-0000-0000-0000-000000000002', false)
on conflict (user_id) do update set hub = false;
select public.queue_push('00000000-0000-0000-0000-000000000002', 'hub', 'Hub news', 'Something else', '/hub/x', 'hub-test:2');
select pg_temp.expect((select count(*) from public.push_queue where dedupe_key = 'hub-test:2') = 0, 'hub = false stops Society Hub pushes');
select public.queue_push('00000000-0000-0000-0000-000000000002', 'messages', 'Hi', 'A message', '/chats/x', 'hub-test:3');
select pg_temp.expect((select count(*) from public.push_queue where dedupe_key = 'hub-test:3') = 1, 'other kinds still arrive');
select pg_temp.expect((select count(*) from public.notification_settings where user_id = '00000000-0000-0000-0000-000000000001' and hub is false) = 0, 'everyone else keeps hub pushes on');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.queue_push('00000000-0000-0000-0000-000000000002', 'hub', 'x', 'y', null, 'hub-test:4')$$), 'a student cannot call queue_push');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.queue_push('00000000-0000-0000-0000-000000000002', 'hub', 'x', 'y', null, 'hub-test:5')$$), 'a logged-out visitor cannot call queue_push');

-- 9. The live societies are untouched: nobody was made Founding or
--    onboarded by this migration.
reset role;
select pg_temp.expect((select count(*) from public.societies where slug = 'lse-poker-society' and is_founding = false and onboarded_at is null) = 1, 'LSE Poker Society is unchanged');
select pg_temp.expect(not exists (select 1 from public.societies where is_founding and id not in ('40000000-0000-0000-0000-000000000001')), 'no other society was made Founding');
