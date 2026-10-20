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

-- Act as someone (a uuid) or nobody (null). Works from any role, so tests can
-- switch people freely. `reset role;` goes back to the all-powerful test user
-- for setting up data.
create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, false);
end $$;

-- Fail the test with a message unless the condition holds.
create or replace function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
end $$;

-- True when running the statement raises an error (e.g. permission denied).
create or replace function pg_temp.fails(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end $$;
