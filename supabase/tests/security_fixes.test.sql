-- 20261116000000_security_fixes.sql
reset role;
insert into public.societies (id, slug, name, university) values ('10000000-0000-0000-0000-000000000001', 'test-chess', 'Test Chess', 'LSE') on conflict do nothing;
insert into public.society_admins (society_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.society_members (society_id, user_id, status, approved_at) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'approved', now()) on conflict do nothing;
update public.profiles set display_name = 'Bea Brown', bio = 'original' where id = '00000000-0000-0000-0000-000000000002';

-- 1. Nobody can write to other people's profiles through profile_cards.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$update public.profile_cards set bio = 'hacked' where id = '00000000-0000-0000-0000-000000000002'$$), 'a student cannot update profile_cards');
select pg_temp.expect(pg_temp.fails($$delete from public.profile_cards where id = '00000000-0000-0000-0000-000000000003'$$), 'a student cannot delete through profile_cards');
select pg_temp.expect((select count(*) from public.profile_cards) >= 4, 'profile_cards is still readable');
reset role;
select pg_temp.expect((select bio from public.profiles where id = '00000000-0000-0000-0000-000000000002') = 'original', 'Bea''s bio is unchanged');

-- 2. Students can't call the server-only push helpers.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.queue_push('00000000-0000-0000-0000-000000000002', 'messages', 'Fake', 'Phishing')$$), 'a student cannot call queue_push');
select pg_temp.expect(pg_temp.fails($$select public.queue_event_reminders()$$), 'a student cannot call queue_event_reminders');
select pg_temp.expect(pg_temp.fails($$select public.push_name('00000000-0000-0000-0000-000000000002')$$), 'a student cannot call push_name');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.queue_push('00000000-0000-0000-0000-000000000002', 'messages', 'Fake', 'Phishing')$$), 'a logged-out visitor cannot call queue_push');

-- 3. The committee's member list has names but no member emails; an admin still sees them.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select name from public.society_member_list('10000000-0000-0000-0000-000000000001') where user_id = '00000000-0000-0000-0000-000000000002') = 'Bea Brown', 'the committee sees the member''s name');
select pg_temp.expect((select email from public.society_member_list('10000000-0000-0000-0000-000000000001') where user_id = '00000000-0000-0000-0000-000000000002') is null, 'the committee does not see the member''s email');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select email from public.society_member_list('10000000-0000-0000-0000-000000000001') where user_id = '00000000-0000-0000-0000-000000000002') = 'bea@lse.ac.uk', 'a Function admin still sees it');
-- And someone else's committee sees nothing at all.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.society_member_list('10000000-0000-0000-0000-000000000001')) = 0, 'another society''s manager sees no members');
