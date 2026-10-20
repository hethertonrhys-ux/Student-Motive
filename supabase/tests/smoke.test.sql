-- The test database builds, and the fixtures work: an admin is an admin, a student isn't.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
do $$ begin if not public.is_motive_admin() then raise exception 'Ada should be a Function admin'; end if; end $$;
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
do $$ begin if public.is_motive_admin() then raise exception 'Sam should not be a Function admin'; end if; end $$;
