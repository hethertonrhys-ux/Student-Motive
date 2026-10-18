-- Two truths and a lie (a profile prompt), and sign-up funnel counts.
-- Only adds tables and functions; nothing existing changes.

-- ---------------------------------------------------------------------
-- 1. Two truths and a lie
-- ---------------------------------------------------------------------

-- Each person's three statements, and which one is the lie. Only the owner
-- can read this row directly; everyone else goes through two_truths_view(),
-- which never reveals the lie before they've guessed.
create table if not exists public.two_truths (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  s1         text not null check (char_length(s1) between 1 and 80),
  s2         text not null check (char_length(s2) between 1 and 80),
  s3         text not null check (char_length(s3) between 1 and 80),
  lie        smallint not null check (lie between 1 and 3),
  updated_at timestamptz not null default now()
);

-- One guess per viewer. Cleared when the statements change.
create table if not exists public.two_truths_guesses (
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  guesser_id uuid not null references public.profiles (id) on delete cascade,
  pick       smallint not null check (pick between 1 and 3),
  correct    boolean not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, guesser_id)
);
create index if not exists two_truths_guesses_owner_idx on public.two_truths_guesses (owner_id, created_at desc);

alter table public.two_truths enable row level security;
alter table public.two_truths_guesses enable row level security;
drop policy if exists two_truths_own on public.two_truths;
create policy two_truths_own on public.two_truths for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists two_truths_guesses_select on public.two_truths_guesses;
create policy two_truths_guesses_select on public.two_truths_guesses for select to authenticated
  using (owner_id = (select auth.uid()) or guesser_id = (select auth.uid()));
-- Changes only go through the functions below.

-- Save your statements. Changing them clears everyone's guesses.
create or replace function public.save_two_truths(one_text text, two_text text, three_text text, lie_is smallint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  old public.two_truths;
begin
  if uid is null then raise exception 'Log in first'; end if;
  one_text := trim(one_text); two_text := trim(two_text); three_text := trim(three_text);
  if one_text = '' or two_text = '' or three_text = '' then raise exception 'Fill in all three'; end if;
  if lie_is not between 1 and 3 then raise exception 'Choose which one is the lie'; end if;
  select * into old from public.two_truths where user_id = uid;
  insert into public.two_truths (user_id, s1, s2, s3, lie, updated_at)
  values (uid, one_text, two_text, three_text, lie_is, now())
  on conflict (user_id) do update set s1 = excluded.s1, s2 = excluded.s2, s3 = excluded.s3, lie = excluded.lie, updated_at = now();
  if old.user_id is not null and (old.s1, old.s2, old.s3, old.lie) is distinct from (one_text, two_text, three_text, lie_is) then
    delete from public.two_truths_guesses where owner_id = uid;
  end if;
end;
$$;

-- What a viewer may see of someone's game: the statements in an order
-- shuffled for them; the lie and the results only once they've guessed
-- (or if it's their own).
create or replace function public.two_truths_view(person uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.two_truths;
  mine smallint;
  revealed boolean;
  total integer;
  right_count integer;
begin
  if uid is null or public.is_blocked_between(person, uid) then return null; end if;
  select * into r from public.two_truths where user_id = person;
  if r.user_id is null then return null; end if;
  select pick into mine from public.two_truths_guesses where owner_id = person and guesser_id = uid;
  revealed := mine is not null or person = uid;
  select count(*), count(*) filter (where correct) into total, right_count from public.two_truths_guesses where owner_id = person;
  return jsonb_build_object(
    'statements', (
      select jsonb_agg(jsonb_build_object('n', n, 'text', t) order by md5(uid::text || person::text || n::text))
      from (values (1, r.s1), (2, r.s2), (3, r.s3)) as s(n, t)
    ),
    'my_pick', mine,
    'own', person = uid,
    'lie', case when revealed then r.lie end,
    'total', case when revealed then total end,
    'right', case when revealed then right_count end
  );
end;
$$;

-- Guess which one is the lie (once). Returns the reveal.
create or replace function public.guess_two_truths(person uuid, choice smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lie_n smallint;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if person = uid then raise exception 'You can''t guess your own'; end if;
  if public.is_blocked_between(person, uid) then raise exception 'Not available'; end if;
  select lie into lie_n from public.two_truths where user_id = person;
  if lie_n is null then raise exception 'Not available'; end if;
  insert into public.two_truths_guesses (owner_id, guesser_id, pick, correct)
  values (person, uid, choice, choice = lie_n)
  on conflict (owner_id, guesser_id) do nothing;
  return public.two_truths_view(person);
end;
$$;

-- For the owner's notifications: who played their game, grouped by day (UK
-- time), so it's at most one notification a day.
create or replace function public.my_two_truths_days()
returns table (day date, first_at timestamptz, plays bigint, right_count bigint, right_names text[])
language sql stable security definer set search_path = ''
as $$
  select (g.created_at at time zone 'Europe/London')::date,
         min(g.created_at),
         count(*),
         count(*) filter (where g.correct),
         (array_agg(coalesce(nullif(p.display_name, ''), 'Someone') order by g.created_at) filter (where g.correct))[1:3]
  from public.two_truths_guesses g
  join public.profiles p on p.id = g.guesser_id
  where g.owner_id = (select auth.uid()) and g.created_at > now() - interval '30 days'
  group by 1
  order by 1 desc;
$$;

revoke execute on function public.save_two_truths(text, text, text, smallint) from public, anon;
revoke execute on function public.two_truths_view(uuid) from public, anon;
revoke execute on function public.guess_two_truths(uuid, smallint) from public, anon;
revoke execute on function public.my_two_truths_days() from public, anon;
grant execute on function public.save_two_truths(text, text, text, smallint) to authenticated;
grant execute on function public.two_truths_view(uuid) to authenticated;
grant execute on function public.guess_two_truths(uuid, smallint) to authenticated;
grant execute on function public.my_two_truths_days() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Sign-up funnel counts
-- ---------------------------------------------------------------------

-- One row per step reached (new account, saw the prompts step, skipped it,
-- completed it). Only the Function admins can read them.
create table if not exists public.signup_events (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  event      text not null check (event in ('signup_finished', 'prompts_step_reached', 'prompts_skipped', 'prompts_completed')),
  created_at timestamptz not null default now()
);
alter table public.signup_events enable row level security;
drop policy if exists signup_events_insert_own on public.signup_events;
create policy signup_events_insert_own on public.signup_events for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists signup_events_admin_read on public.signup_events;
create policy signup_events_admin_read on public.signup_events for select to authenticated
  using (public.is_motive_admin());
