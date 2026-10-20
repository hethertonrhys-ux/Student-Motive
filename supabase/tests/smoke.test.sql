-- The test database builds, and the fixtures work: an admin is an admin, a student isn't.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(public.is_motive_admin(), 'Ada is a Function admin');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(not public.is_motive_admin(), 'Sam is not a Function admin');
select pg_temp.expect(pg_temp.fails('select 1/0'), 'fails() spots an error');
