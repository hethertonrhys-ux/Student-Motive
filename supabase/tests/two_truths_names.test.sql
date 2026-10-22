-- Two truths and a lie: the owner sees who played (names, never emails);
-- nobody else does; blocked people aren't listed.
reset role;
update public.profiles set display_name = 'Sam' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Bea' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Cas' where id = '00000000-0000-0000-0000-000000000003';
insert into public.two_truths (user_id, s1, s2, s3, lie) values ('00000000-0000-0000-0000-000000000001', 'I have a cat', 'I can juggle', 'I met the King', 3) on conflict (user_id) do nothing;

-- Bea spots the lie, Cas doesn't.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.guess_two_truths('00000000-0000-0000-0000-000000000001', 3::smallint);
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select public.guess_two_truths('00000000-0000-0000-0000-000000000001', 1::smallint);

-- Sam (the owner) sees both, by name, with right/wrong.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.my_two_truths_plays()) = 2, 'owner sees both players');
select pg_temp.expect((select correct from public.my_two_truths_plays() where name = 'Bea'), 'Bea spotted the lie');
select pg_temp.expect((select not correct from public.my_two_truths_plays() where name = 'Cas'), 'Cas did not');
select pg_temp.expect(not exists (select 1 from public.my_two_truths_plays() where name like '%@%'), 'names, never emails');

-- Bea (a player, not the owner) sees nothing of Sam's game.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.my_two_truths_plays()) = 0, 'a player sees no one else''s plays');

-- Logged out: not allowed at all.
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails('select * from public.my_two_truths_plays()'), 'logged out cannot call it');

-- Sam blocks Cas: Cas drops off Sam's list.
reset role;
insert into public.user_blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003') on conflict do nothing;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.my_two_truths_plays()) = 1, 'blocked player not listed');
select pg_temp.expect((select name from public.my_two_truths_plays()) = 'Bea', 'only Bea left');
reset role;
delete from public.user_blocks where blocker_id = '00000000-0000-0000-0000-000000000001';
