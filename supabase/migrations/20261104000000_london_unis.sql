-- =====================================================================
-- Function across London: LSE, UCL, King's and Imperial.
--
-- Only adds a table, columns and functions, and updates the rules for
-- who can sign up, join societies and see society events. Nothing is
-- deleted or renamed. Existing people and societies without a uni are LSE.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. The universities, and the email domains that prove you study there
--    (exact domains only). Keep in step with web/src/lib/universities.ts.
-- ---------------------------------------------------------------------

create table if not exists public.universities (
  id         text primary key,
  name       text not null,
  short_name text not null,
  domains    text[] not null
);
insert into public.universities (id, name, short_name, domains) values
  ('LSE',      'London School of Economics', 'LSE',      array['lse.ac.uk']),
  ('UCL',      'University College London',  'UCL',      array['ucl.ac.uk']),
  ('KCL',      'King''s College London',     'King''s',  array['kcl.ac.uk']),
  ('Imperial', 'Imperial College London',    'Imperial', array['imperial.ac.uk', 'ic.ac.uk'])
on conflict (id) do nothing;

alter table public.universities enable row level security;
drop policy if exists universities_select_all on public.universities;
create policy universities_select_all on public.universities for select to anon, authenticated using (true);

-- Which uni an email belongs to (null if it isn't a uni email).
create or replace function public.uni_from_email(address text)
returns text
language sql stable security definer set search_path = ''
as $$
  select u.id from public.universities u
  where lower(split_part(address, '@', 2)) = any (u.domains)
  limit 1;
$$;


-- ---------------------------------------------------------------------
-- 2. Sign-up: any of the four unis' emails, plus the Admin page's list.
-- ---------------------------------------------------------------------

create or replace function public.check_signup_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.uni_from_email(new.email) is not null
     or exists (
       select 1 from public.allowed_emails a
       where a.email = lower(new.email)
          or (a.email like '@%' and lower(new.email) like '%' || a.email)
     ) then
    return new;
  end if;
  raise exception 'Function is for students at LSE, UCL, King''s and Imperial. Use your uni email, or the email you were invited with.';
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Each person's uni. Set from their email; LSE for everyone else
--    (existing accounts and invited emails), who can pick their uni
--    after signing up. A uni email's uni can't be changed.
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists university text references public.universities (id);
update public.profiles set university = coalesce(public.uni_from_email(email), 'LSE') where university is null;
alter table public.profiles alter column university set default 'LSE';

create or replace function public.set_profile_university()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  from_email text := public.uni_from_email(new.email);
begin
  if tg_op = 'INSERT' then
    new.university := coalesce(from_email, new.university, 'LSE');
  elsif from_email is not null and (select auth.uid()) is not null and not public.is_motive_admin() then
    new.university := from_email;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_set_university on public.profiles;
create trigger profiles_set_university
  before insert or update of university, email on public.profiles
  for each row execute function public.set_profile_university();

-- The logged-in person's uni.
create or replace function public.my_university()
returns text
language sql stable security definer set search_path = ''
as $$
  select university from public.profiles where id = (select auth.uid());
$$;

-- Only the Function team can move a society to another uni.
create or replace function public.protect_society_university()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_motive_admin() then
    new.university := old.university;
  end if;
  return new;
end;
$$;
drop trigger if exists societies_protect_university on public.societies;
create trigger societies_protect_university
  before update of university on public.societies
  for each row execute function public.protect_society_university();

-- Is this society at the logged-in person's uni?
create or replace function public.same_uni_society(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.societies s
    where s.id = sid and s.university = public.my_university()
  );
$$;


-- ---------------------------------------------------------------------
-- 4. Societies are for their own uni's students.
-- ---------------------------------------------------------------------

-- Asking to join: only students at the society's uni.
create or replace function public.request_membership(sid uuid, your_name text)
returns public.membership_status
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  society_uni text;
  result public.membership_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select university into society_uni from public.societies where id = sid;
  if not found then raise exception 'Society not found'; end if;
  if society_uni is distinct from public.my_university() then
    raise exception 'This society is for % students', coalesce((select short_name from public.universities where id = society_uni), society_uni);
  end if;

  if nullif(trim(your_name), '') is not null then
    update public.profiles set display_name = left(trim(your_name), 60) where id = uid;
  end if;

  select email into user_email from public.profiles where id = uid;

  insert into public.society_members (society_id, user_id, status, approved_at)
  select sid, uid,
         case when inv.email is not null then 'approved'::public.membership_status else 'pending' end,
         case when inv.email is not null then now() end
  from (select 1) one
  left join public.society_member_invites inv on inv.society_id = sid and inv.email = user_email
  on conflict (society_id, user_id) do nothing;

  select status into result from public.society_members where society_id = sid and user_id = uid;
  return result;
end;
$$;

-- The committee pastes in member emails. Emails from another uni (and
-- existing users at another uni) are skipped; the website tells the
-- committee which ones.
create or replace function public.invite_members(sid uuid, emails text[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  e text;
  added integer := 0;
  uid uuid;
  their_uni text;
  society_uni text;
begin
  if not public.is_society_admin(sid) then raise exception 'Not allowed'; end if;
  select university into society_uni from public.societies where id = sid;
  foreach e in array emails loop
    e := lower(trim(e));
    continue when e !~ '^[^@\s]+@[^@\s]+$';
    continue when public.uni_from_email(e) is not null and public.uni_from_email(e) <> society_uni;
    uid := null;
    select id, university into uid, their_uni from public.profiles where email = e;
    continue when uid is not null and their_uni is distinct from society_uni;
    insert into public.society_member_invites (society_id, email) values (sid, e) on conflict do nothing;
    if uid is not null then
      insert into public.society_members (society_id, user_id, status, approved_at)
      values (sid, uid, 'approved', now())
      on conflict (society_id, user_id) do update set status = 'approved', approved_at = coalesce(public.society_members.approved_at, now());
    end if;
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- Following a society: same uni only.
alter policy follows_insert_own on public.follows
  with check (user_id = (select auth.uid()) and public.same_uni_society(society_id));

-- Asking to manage a society: same uni only.
alter policy society_claims_insert_own on public.society_claims
  with check (user_id = (select auth.uid()) and status = 'pending' and public.same_uni_society(society_id));


-- ---------------------------------------------------------------------
-- 5. Who can see a society's event, chosen by the society:
--      members  = members only
--      uni      = students at the society's uni (the default)
--      london   = open to all London students
--    Existing events become "uni". (Members-only joining still works as
--    before through members_only.)
-- ---------------------------------------------------------------------

alter table public.events add column if not exists audience text not null default 'uni'
  check (audience in ('members', 'uni', 'london'));

-- Logged-out visitors see "uni" and "london" events, so shared links and
-- the uni landing pages work; they must log in with the right uni to join.
create or replace function public.can_see_society_event(sid uuid, aud text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when aud = 'london' then true
    when (select auth.uid()) is null then aud = 'uni'
    when public.is_society_admin(sid) or public.is_society_member(sid) then true
    when aud = 'uni' then public.same_uni_society(sid)
    else false
  end;
$$;

-- Can this person (not necessarily the one logged in) join the event?
create or replace function public.can_join_society_event(sid uuid, aud text, person uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select aud = 'london'
    or exists (select 1 from public.society_members m where m.society_id = sid and m.user_id = person and m.status = 'approved')
    or exists (select 1 from public.society_admins a where a.society_id = sid and a.user_id = person)
    or (aud = 'uni' and exists (
      select 1 from public.profiles p join public.societies s on s.id = sid
      where p.id = person and p.university = s.university
    ));
$$;

alter policy events_select_visible on public.events
  using (
    (not is_hidden
      or (society_id is not null and public.is_society_admin(society_id))
      or host_user_id = (select auth.uid()))
    and (
      host_user_id is null
      or (
        not public.is_blocked_between(host_user_id, (select auth.uid()))
        and (visibility = 'public'
          or host_user_id = (select auth.uid())
          or public.are_friends(host_user_id, (select auth.uid()))
          or public.has_entry(id))
      )
    )
    and (
      society_id is null
      or public.can_see_society_event(society_id, audience)
      or public.has_entry(id)
    )
  );

-- Joining a society event checks the same rule on the server. The
-- committee adding someone by hand is always allowed.
create or replace function public.check_event_audience()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
begin
  -- Changes made in the Supabase dashboard (no logged-in user) are allowed.
  if (select auth.uid()) is null then return new; end if;
  select * into ev from public.events where id = new.event_id;
  if ev.society_id is null or public.is_society_admin(ev.society_id) then return new; end if;
  if not public.can_join_society_event(ev.society_id, ev.audience, new.user_id) then
    if ev.audience = 'members' then raise exception 'Only members of this society can join'; end if;
    raise exception 'This event is for % students', coalesce(
      (select u.short_name from public.universities u join public.societies s on s.university = u.id where s.id = ev.society_id), 'this uni');
  end if;
  return new;
end;
$$;
drop trigger if exists event_entries_check_audience on public.event_entries;
create trigger event_entries_check_audience
  before insert on public.event_entries
  for each row execute function public.check_event_audience();


revoke execute on function public.uni_from_email(text) from public, anon;
revoke execute on function public.same_uni_society(uuid) from public, anon;
revoke execute on function public.can_join_society_event(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.uni_from_email(text) to authenticated;
grant execute on function public.same_uni_society(uuid) to authenticated;
grant execute on function public.my_university() to authenticated;
-- Used by the events rule, which logged-out visitors also go through.
grant execute on function public.can_see_society_event(uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. To check afterwards (optional): anyone already in a society at a
--    different uni. Nothing is changed for them; decide case by case.
--
-- select s.name as society, s.university as society_uni, p.email, p.university as their_uni, m.status
-- from public.society_members m
-- join public.societies s on s.id = m.society_id
-- join public.profiles p on p.id = m.user_id
-- where p.university is distinct from s.university;
-- ---------------------------------------------------------------------
