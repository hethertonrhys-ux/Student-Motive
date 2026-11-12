-- =====================================================================
-- Function TEST accounts. Paste into the SQL Editor of the TEST project
-- (function-staging) only, never the real one. Run it AFTER all 4
-- setup parts.
--
-- The TEST project's web address contains pvldkzjrrhcnwctveemu.
-- If the address in your browser contains xrpbmcoptyrpgkdowfdt, that is
-- the REAL project: stop, and don't run anything.
--
-- It makes these log-ins (email + password; the password is in
-- test-accounts.txt, never in this file):
--   ada@staging.studentfunction.com   (Function admin)
--   abacus-admin@staging.studentfunction.com
--   abacus-committee@staging.studentfunction.com
--   member-1@staging.studentfunction.com
--   member-2@staging.studentfunction.com
--   member-3@staging.studentfunction.com
--   nonmember-1@staging.studentfunction.com
--   outsider@staging.studentfunction.com
--   pending-1@staging.studentfunction.com
-- Each one is fully set up (name, nickname, uni, graduation year), so
-- the app goes straight in without asking for account details.
--
-- When it has worked you will see a small table listing the 9
-- accounts. Running it again is harmless: it adds nothing twice and never
-- changes a password or anything a tester changed in the app (a nickname
-- or admin flag someone removed stays removed; a deleted account comes
-- back as new).
--
-- Made by check/build.py from code version 4b06cc0. Don't edit by hand.
-- =====================================================================

do $$
declare
  looks_real boolean := false;
begin
  -- 1. A real database has real accounts.
  if (select count(*) from auth.users) > 50 then
    raise exception 'STOP: this looks like your real Function database (it has real accounts). These files are only for the test project function-staging.';
  end if;
  -- 2. The real project's timers and push secret point at its own address.
  begin
    if to_regclass('cron.job') is not null then
      execute 'select exists (select 1 from cron.job where command like ''%xrpbmcoptyrpgkdowfdt%'')' into looks_real;
    end if;
    if not looks_real and to_regclass('vault.decrypted_secrets') is not null then
      execute 'select exists (select 1 from vault.decrypted_secrets where decrypted_secret like ''%xrpbmcoptyrpgkdowfdt%'')' into looks_real;
    end if;
  exception when others then
    null; -- can't look: check 1 still applies
  end;
  if looks_real then
    raise exception 'STOP: this looks like your real Function database (its timers or secrets point at the real project xrpbmcoptyrpgkdowfdt). These files are only for the test project function-staging.';
  end if;
  -- 3. Only the test project has the marker that part 1 adds at its end.
  if to_regclass('public.allowed_emails') is null then
    raise exception 'STOP: this is not the test project (part 1 of these files was never run here). Nothing was changed. Check the web address contains pvldkzjrrhcnwctveemu: if it does, part 1 was skipped, so run part 1 first; if it does not, stop, you are in the wrong project.';
  end if;
  if not exists (select 1 from public.allowed_emails where email = '@staging.studentfunction.com') then
    raise exception 'STOP: this is not the test project (part 1 of these files was never run here). Nothing was changed. Check the web address contains pvldkzjrrhcnwctveemu: if it does, part 1 was skipped, so run part 1 first; if it does not, stop, you are in the wrong project.';
  end if;
  -- 4. The test project has (almost) no accounts of its own.
  if (select count(*) from auth.users where coalesce(lower(email), '') not like '%@staging.studentfunction.com') > 5 then
    raise exception 'STOP: this database already has real accounts; these test accounts are only for function-staging (pvldkzjrrhcnwctveemu). Nothing was changed.';
  end if;
  -- 5. All 4 setup parts must have been run first.
  if to_regclass('public.profiles') is null or to_regclass('public.thread_leaves') is null then
    raise exception 'STOP: run all 4 setup parts first (01-setup-part-1.sql onwards), then this file. Nothing was changed.';
  end if;
end $$;

-- 1. Addresses at @staging.studentfunction.com may sign up: part 1 added that at its
--    end (only the test project has it; sign-up is otherwise for London
--    uni emails only), and the safety check above made sure it is here.

-- 2. The accounts, the way Supabase Auth stores them. The password is
--    stored only as a bcrypt hash. Every text field Supabase Auth reads
--    is an empty string rather than empty (NULL), which it can't read.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, email_change_confirm_status,
  phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid, v.id, 'authenticated', 'authenticated', v.email,
  '$2a$10$d9BaLRtB.8L7rpUR6oT74.tyEomCIXKjGL92mkrmBqF/3GQI.Ffea',
  now(), null,
  '', '', '', '',
  '', 0,
  '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, false,
  now(), now()
from (values
    ('57a9e000-0000-4000-a000-000000000001'::uuid, 'ada@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000002'::uuid, 'abacus-admin@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000003'::uuid, 'abacus-committee@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000004'::uuid, 'member-1@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000005'::uuid, 'member-2@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000006'::uuid, 'member-3@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000007'::uuid, 'nonmember-1@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000008'::uuid, 'outsider@staging.studentfunction.com'),
    ('57a9e000-0000-4000-a000-000000000009'::uuid, 'pending-1@staging.studentfunction.com')
) as v(id, email)
where not exists (select 1 from auth.users u where u.id = v.id or lower(u.email) = v.email)
on conflict do nothing;

-- 3. Each account's email log-in (Supabase Auth needs one per account).
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  v.identity_id, v.user_id::text, v.user_id,
  jsonb_build_object('sub', v.user_id::text, 'email', v.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from (values
    ('57a9e000-0000-4000-b000-000000000001'::uuid, '57a9e000-0000-4000-a000-000000000001'::uuid, 'ada@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000002'::uuid, '57a9e000-0000-4000-a000-000000000002'::uuid, 'abacus-admin@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000003'::uuid, '57a9e000-0000-4000-a000-000000000003'::uuid, 'abacus-committee@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000004'::uuid, '57a9e000-0000-4000-a000-000000000004'::uuid, 'member-1@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000005'::uuid, '57a9e000-0000-4000-a000-000000000005'::uuid, 'member-2@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000006'::uuid, '57a9e000-0000-4000-a000-000000000006'::uuid, 'member-3@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000007'::uuid, '57a9e000-0000-4000-a000-000000000007'::uuid, 'nonmember-1@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000008'::uuid, '57a9e000-0000-4000-a000-000000000008'::uuid, 'outsider@staging.studentfunction.com'),
    ('57a9e000-0000-4000-b000-000000000009'::uuid, '57a9e000-0000-4000-a000-000000000009'::uuid, 'pending-1@staging.studentfunction.com')
) as v(identity_id, user_id, email)
join auth.users u on u.id = v.user_id
where not exists (select 1 from auth.identities i where i.provider = 'email' and (i.provider_id = v.user_id::text or i.user_id = v.user_id))
on conflict do nothing;

-- 4. Their profiles (made automatically with each account): name,
--    nickname, uni and graduation year, so the app doesn't ask for them.
--    A profile with no full name yet is a new one: it gets everything.
--    On a later run only what's missing is filled in, so testers' own
--    changes stay: a nickname removed in the app (saved as no nickname)
--    or an admin flag someone took away stays removed.
update public.profiles p
set full_name = coalesce(nullif(btrim(p.full_name), ''), v.full_name),
    nickname = case when p.full_name is null then v.nickname else p.nickname end,
    display_name = coalesce(nullif(btrim(p.display_name), ''),
                            case when p.full_name is null then v.nickname else p.nickname end,
                            nullif(btrim(p.full_name), ''), v.full_name),
    graduation_year = coalesce(p.graduation_year, 2027),
    university = case when p.full_name is null then v.university else p.university end,
    is_admin = case when p.full_name is null then v.is_admin else p.is_admin end
from (values
    ('57a9e000-0000-4000-a000-000000000001'::uuid, 'Test Admin', 'Ada Test', 'LSE', true),
    ('57a9e000-0000-4000-a000-000000000002'::uuid, 'Test Abacus Admin', 'Abby Test', 'UCL', false),
    ('57a9e000-0000-4000-a000-000000000003'::uuid, 'Test Abacus Committee', 'Cole Test', 'UCL', false),
    ('57a9e000-0000-4000-a000-000000000004'::uuid, 'Test Member One', 'Mia Test', 'UCL', false),
    ('57a9e000-0000-4000-a000-000000000005'::uuid, 'Test Member Two', 'Max Test', 'UCL', false),
    ('57a9e000-0000-4000-a000-000000000006'::uuid, 'Test Member Three', 'Mo Test', 'UCL', false),
    ('57a9e000-0000-4000-a000-000000000007'::uuid, 'Test Nonmember One', 'Nina Test', 'UCL', false),
    ('57a9e000-0000-4000-a000-000000000008'::uuid, 'Test Outsider', 'Otto Test', 'UCL', false),
    ('57a9e000-0000-4000-a000-000000000009'::uuid, 'Test Pending One', 'Penny Test', 'UCL', false)
) as v(id, full_name, nickname, university, is_admin)
where p.id = v.id;

-- 5. What's there now (you should see 9 rows).
select p.email, p.display_name, p.full_name, p.university, p.graduation_year, p.is_admin as function_admin,
       (u.encrypted_password like '$2%') as has_password,
       exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email') as can_log_in
from public.profiles p
join auth.users u on u.id = p.id
where p.email like '%@staging.studentfunction.com'
order by p.email;
