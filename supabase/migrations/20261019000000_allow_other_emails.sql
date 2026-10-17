-- =====================================================================
-- Motive: let the Motive admin allow non-LSE emails to sign up, either
-- one address at a time (jo@gmail.com) or a whole domain (@kcl.ac.uk).
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- allowed_emails can now hold a whole domain, written as "@kcl.ac.uk".
alter table public.allowed_emails
  add constraint allowed_emails_format check (email ~ '^([^@\s]+)?@[^@\s]+\.[^@\s]+$');

create or replace function public.check_signup_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) like '%@lse.ac.uk'
     or exists (
       select 1 from public.allowed_emails a
       where a.email = lower(new.email)
          or (a.email like '@%' and lower(new.email) like '%' || a.email)
     ) then
    return new;
  end if;
  raise exception 'Motive is only open to @lse.ac.uk email addresses';
end;
$$;
