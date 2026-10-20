-- Test people and helpers, loaded before each *.test.sql file (each test
-- file runs in its own psql session against the same fresh database, so
-- fixtures use "on conflict do nothing").
--
--   ...0001  Sam   (LSE student)        ...0002  Bea  (LSE student)
--   ...0003  Cas   (UCL student)        ...00a0  Ada  (Function admin)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'sam@lse.ac.uk'),
  ('00000000-0000-0000-0000-000000000002', 'bea@lse.ac.uk'),
  ('00000000-0000-0000-0000-000000000003', 'cas@ucl.ac.uk'),
  ('00000000-0000-0000-0000-0000000000a0', 'ada@lse.ac.uk')
on conflict (id) do nothing;
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000a0';

-- Act as someone (or nobody): set_config's third argument false keeps it for the session.
create or replace function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
  select set_config('role', case when uid is null then 'anon' else 'authenticated' end, false);
$$;
create or replace function pg_temp.act_as_superuser() returns void language sql as $$
  select set_config('role', 'postgres', false);
  select set_config('request.jwt.claim.sub', '', false);
$$;
