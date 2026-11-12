-- =====================================================================
-- Function TEST database setup, part 2 of 4. Paste into the SQL Editor
-- of the TEST project (function-staging) only, never the real one. Run
-- the parts in order.
--
-- The TEST project's web address contains pvldkzjrrhcnwctveemu.
-- If the address in your browser contains xrpbmcoptyrpgkdowfdt, that is
-- the REAL project: stop, and don't run anything.
--
-- How: open this file in Notepad, press Ctrl+A then Ctrl+C, go to the
-- SQL Editor, click "New query", click in the empty box, press Ctrl+V,
-- then click "Run". It takes a few seconds. When it has worked you will
-- see "Success. No rows returned". Then do part 3.
--
-- If a red error appears instead, nothing has been changed (each part
-- runs all or nothing). Take a screenshot, send it, and don't change
-- anything in this file.
--
-- This part contains these files from the app's code, unchanged, in order
-- (files 19 to 33 of 50):
--   19. 20261031000000_mark_payments_paid.sql
--   20. 20261101000000_table_waiting_lists.sql
--   21. 20261102000000_message_the_host.sql
--   22. 20261103000000_two_truths_and_signup_counts.sql
--   23. 20261104000000_london_unis.sql
--   24. 20261105000000_society_search.sql
--   25. 20261106000000_society_import.sql
--   26. 20261107000000_delete_my_account.sql
--   27. 20261108000000_accounts_and_london_unis.sql
--   28. 20261109000000_push_notifications.sql
--   29. 20261110000000_recommendations.sql
--   30. 20261111000000_profile_country.sql
--   31. 20261112000000_admin_panel.sql
--   32. 20261113000000_poker_seats.sql
--   33. 20261114000000_society_event_chats.sql
--
-- Made by check/build.py from code version 4b06cc0. Don't edit by hand.
-- =====================================================================

-- Safety check first. It changes nothing; it stops the whole paste (so
-- nothing at all is changed) if this isn't the test project, or if the
-- parts are being run out of order or twice.
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
  -- 4. Part 1 must have been run first (it makes profiles).
  if to_regclass('public.profiles') is null then
    raise exception 'STOP: part 1 has not been run here yet, so nothing was changed. Run the parts in order: part 1 first.';
  end if;
  -- 5. This part makes table_waitlist, so if it's already here this part has run.
  if to_regclass('public.table_waitlist') is not null then
    raise exception 'STOP: part 2 has already been run here, so nothing was changed. Only if your browser address contains pvldkzjrrhcnwctveemu, go on to part 3; otherwise stop, you are in the wrong project.';
  end if;
end $$;

-- ===== 20261031000000_mark_payments_paid.sql =====
-- Item 19 (approved Societies change): players can mark a "who pays who"
-- payment as paid once results are shared, and undo their own mark.
-- A mark is saved as a payment (the same "payments already made" the
-- committee uses), so "who pays who" recalculates from it automatically.
-- Only adds two functions.

create or replace function public.mark_payment_paid(eid uuid, from_row uuid, to_row uuid, amount_pence integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  committee boolean := public.is_society_admin(public.event_society(eid));
  pid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if amount_pence is null or amount_pence < 1 or amount_pence > 10000000 then raise exception 'Enter an amount'; end if;
  if (select count(*) from public.ledger_rows r where r.event_id = eid and r.id in (from_row, to_row)) <> 2 then
    raise exception 'Those players aren''t in this game';
  end if;
  if not committee then
    if not exists (select 1 from public.events e where e.id = eid and e.results_published) then
      raise exception 'The results haven''t been shared yet';
    end if;
    if not exists (select 1 from public.ledger_rows r where r.id in (from_row, to_row) and r.user_id = uid) then
      raise exception 'Only the two players in a payment can mark it paid';
    end if;
  end if;
  insert into public.ledger_payments (event_id, from_row, to_row, amount_pence, created_by)
  values (eid, from_row, to_row, amount_pence, uid)
  returning id into pid;
  return pid;
end;
$$;

-- Undo a mark you made (the committee can undo any).
create or replace function public.undo_payment_mark(pid uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.ledger_payments p
  where p.id = pid
    and (p.created_by = (select auth.uid()) or public.is_society_admin(public.event_society(p.event_id)));
$$;

revoke execute on function public.mark_payment_paid(uuid, uuid, uuid, integer) from public, anon;
revoke execute on function public.undo_payment_mark(uuid) from public, anon;
grant execute on function public.mark_payment_paid(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.undo_payment_mark(uuid) to authenticated;

-- ===== 20261101000000_table_waiting_lists.sql =====
-- Item 20 (approved Societies change): a waiting list for each poker table.
-- A player going to the event can queue for a full table while sitting at
-- another one. Before the event starts, when a seat opens up at that table,
-- the first person in its queue is moved across automatically (freeing
-- their old seat for others) and gets a notification. Once the event has
-- started (its start time, or any table started early), moves stop.
-- Only adds two tables, functions and triggers.

-- 1. The queues: one place per player per event.
create table if not exists public.table_waitlist (
  event_id   uuid not null,
  user_id    uuid not null,
  table_id   uuid not null references public.event_tables (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  -- Leaving the event takes you off the list.
  foreign key (event_id, user_id) references public.event_entries (event_id, user_id) on delete cascade
);
create index if not exists table_waitlist_table_idx on public.table_waitlist (table_id, created_at);

-- 2. Moves made automatically, so the player can be told.
create table if not exists public.table_moves (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  from_table uuid references public.event_tables (id) on delete set null,
  to_table   uuid references public.event_tables (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists table_moves_user_idx on public.table_moves (user_id, created_at desc);

alter table public.table_waitlist enable row level security;
alter table public.table_moves enable row level security;
drop policy if exists table_waitlist_select on public.table_waitlist;
create policy table_waitlist_select on public.table_waitlist for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(public.event_society(event_id)));
drop policy if exists table_moves_select on public.table_moves;
create policy table_moves_select on public.table_moves for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(public.event_society(event_id)));
-- Changes only go through the functions below.

-- Has the event started? Its start time has passed, or a table started early.
create or replace function public.event_has_started(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = eid and e.starts_at <= now())
      or exists (select 1 from public.event_tables t where t.event_id = eid and t.started_at is not null);
$$;

-- 3. Fill free seats at a table from its queue (before the start only).
create or replace function public.fill_table_from_waitlist(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  next record;
begin
  select id, event_id, seats into t from public.event_tables where id = tid;
  if t.id is null or public.event_has_started(t.event_id) then return; end if;
  loop
    exit when (select count(*) from public.event_entries e where e.table_id = tid and e.status = 'going') >= t.seats;
    select w.user_id, e.table_id as old_table into next
    from public.table_waitlist w
    join public.event_entries e on e.event_id = w.event_id and e.user_id = w.user_id
    where w.table_id = tid and e.status = 'going'
    order by w.created_at
    limit 1;
    exit when next.user_id is null;
    delete from public.table_waitlist where event_id = t.event_id and user_id = next.user_id;
    insert into public.table_moves (event_id, user_id, from_table, to_table) values (t.event_id, next.user_id, next.old_table, tid);
    -- Moving them frees their old seat, which (via the trigger below) can
    -- in turn be filled from that table's queue.
    update public.event_entries set table_id = tid where event_id = t.event_id and user_id = next.user_id;
  end loop;
end;
$$;
revoke execute on function public.fill_table_from_waitlist(uuid) from public, anon, authenticated;

-- 4. Whenever a seat is freed (someone stands up, moves, leaves or is
--    removed), try to fill it. Sitting at the table you queued for takes
--    you off its queue.
create or replace function public.event_entries_waitlist()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() > 20 then return null; end if;
  if tg_op = 'UPDATE' and new.table_id is not null then
    delete from public.table_waitlist where event_id = new.event_id and user_id = new.user_id and table_id = new.table_id;
  end if;
  if old.table_id is not null and old.status = 'going'
     and (tg_op = 'DELETE' or new.table_id is distinct from old.table_id or new.status <> 'going') then
    perform public.fill_table_from_waitlist(old.table_id);
  end if;
  return null;
end;
$$;
drop trigger if exists event_entries_waitlist on public.event_entries;
create trigger event_entries_waitlist after update or delete on public.event_entries
  for each row execute function public.event_entries_waitlist();

-- More seats added to a table: fill them too.
create or replace function public.event_tables_waitlist()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.seats > old.seats then perform public.fill_table_from_waitlist(new.id); end if;
  return null;
end;
$$;
drop trigger if exists event_tables_waitlist on public.event_tables;
create trigger event_tables_waitlist after update of seats on public.event_tables
  for each row execute function public.event_tables_waitlist();

-- 5. What players can do.
create or replace function public.join_table_waitlist(eid uuid, tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_table uuid;
  seats integer;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  select table_id into my_table from public.event_entries where event_id = eid and user_id = uid and status = 'going';
  if not found then raise exception 'Say you''re going first'; end if;
  select t.seats into seats from public.event_tables t where t.id = tid and t.event_id = eid;
  if seats is null then raise exception 'That table isn''t part of this event'; end if;
  if my_table is not distinct from tid then raise exception 'You''re already at that table'; end if;
  if public.event_has_started(eid) then raise exception 'The event has started, so the waiting lists are closed'; end if;
  if (select count(*) from public.event_entries e where e.table_id = tid and e.status = 'going') < seats then
    raise exception 'There''s a free seat there: just sit down';
  end if;
  insert into public.table_waitlist (event_id, user_id, table_id) values (eid, uid, tid)
  on conflict (event_id, user_id) do update set table_id = excluded.table_id, created_at = now();
end;
$$;

create or replace function public.leave_table_waitlist(eid uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.table_waitlist where event_id = eid and user_id = (select auth.uid());
$$;

-- How many are waiting at each table, and your place in the queue.
create or replace function public.table_waitlist_summary(eid uuid)
returns table (table_id uuid, waiting bigint, my_position bigint)
language sql stable security definer set search_path = ''
as $$
  select w.table_id,
         count(*),
         (select count(*) from public.table_waitlist x
          join public.table_waitlist me on me.event_id = eid and me.user_id = (select auth.uid()) and me.table_id = w.table_id
          where x.table_id = w.table_id and x.created_at <= me.created_at)
  from public.table_waitlist w
  where w.event_id = eid
  group by w.table_id;
$$;

revoke execute on function public.join_table_waitlist(uuid, uuid) from public, anon;
revoke execute on function public.leave_table_waitlist(uuid) from public, anon;
revoke execute on function public.table_waitlist_summary(uuid) from public, anon;
grant execute on function public.join_table_waitlist(uuid, uuid) to authenticated;
grant execute on function public.leave_table_waitlist(uuid) to authenticated;
grant execute on function public.table_waitlist_summary(uuid) to authenticated;

-- ===== 20261102000000_message_the_host.sql =====
-- Follow-up: anyone who can see a Social event can message its host, even
-- if they aren't friends (e.g. to ask a question before joining). The chat
-- is an ordinary private chat between the two of them. Blocking still
-- stops it. Run this AFTER 20261027000000_social_event_chats.sql.
-- Only adds a column and a function, and widens one rule.

-- The event a non-friend chat was started from.
alter table public.threads add column if not exists via_social_event uuid
  references public.social_events (id) on delete set null;

-- Who can read and write in a chat: as before, plus a chat started with an
-- event's host (unless one of you has blocked the other).
create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and (public.are_friends(t.user_a, t.user_b)
             or (t.via_social_event is not null and not public.is_blocked_between(t.user_a, t.user_b))))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id) or public.is_going_to(t.event_id)))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- Open (or create) a private chat with the host of a Social event you can see.
create or replace function public.open_host_dm(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  host uuid;
  tid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select e.host_id into host from public.social_events e
  where e.id = eid and not e.is_cancelled
    and (not e.friends_only or public.are_friends(e.host_id, uid) or e.host_id = uid);
  if host is null then raise exception 'Event not found'; end if;
  if host = uid then raise exception 'This is your event'; end if;
  if public.is_blocked_between(host, uid) then raise exception 'You can''t message this person'; end if;
  insert into public.threads (user_a, user_b, via_social_event) values (least(uid, host), greatest(uid, host), eid)
  on conflict (user_a, user_b) do update set via_social_event = coalesce(public.threads.via_social_event, excluded.via_social_event);
  select id into tid from public.threads where user_a = least(uid, host) and user_b = greatest(uid, host);
  return tid;
end;
$$;
revoke execute on function public.open_host_dm(uuid) from public, anon;
grant execute on function public.open_host_dm(uuid) to authenticated;

-- ===== 20261103000000_two_truths_and_signup_counts.sql =====
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

-- ===== 20261104000000_london_unis.sql =====
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

-- ===== 20261105000000_society_search.sql =====
-- =====================================================================
-- Society search across all London unis, and counting how often people
-- widen their search beyond their own uni.
--
-- Only adds a function and a table; nothing existing changes.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- Lower case, no apostrophes or punctuation, so "kings" finds "King's".
-- (The website's own-uni search does the same in the browser.)
create or replace function public.society_search_text(t text)
returns text
language sql immutable set search_path = ''
as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(t, '')), '[''’]', '', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Societies whose name contains every word typed, from every uni.
-- first_uni's societies come first (the searcher's own uni), then names
-- that start with the first word, then A to Z. At most 20.
create or replace function public.search_societies(q text, first_uni text default null)
returns table (id uuid, name text, slug text, kind public.org_kind, logo_url text, university text)
language sql stable set search_path = ''
as $$
  with words as (
    select w from unnest(string_to_array(public.society_search_text(q), ' ')) as w where w <> ''
  )
  select s.id, s.name, s.slug, s.kind, s.logo_url, s.university
  from public.societies s
  cross join lateral (select public.society_search_text(s.name) as n) x
  where exists (select 1 from words)
    and not exists (select 1 from words where strpos(x.n, w) = 0)
  order by (s.university = first_uni) desc nulls last,
           (x.n like (select w from words limit 1) || '%') desc,
           s.name
  limit 20;
$$;

grant execute on function public.society_search_text(text) to anon, authenticated;
grant execute on function public.search_societies(text, text) to anon, authenticated;


-- One row each time someone taps "Search all London unis". Only the
-- Function team can read them.
create table if not exists public.search_events (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  event      text not null check (event in ('societies_search_all_unis')),
  university text,
  query      text check (char_length(query) <= 100),
  created_at timestamptz not null default now()
);
alter table public.search_events enable row level security;
drop policy if exists search_events_insert_own on public.search_events;
create policy search_events_insert_own on public.search_events for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists search_events_admin_read on public.search_events;
create policy search_events_admin_read on public.search_events for select to authenticated
  using (public.is_motive_admin());

-- ===== 20261106000000_society_import.sql =====
-- =====================================================================
-- Societies imported from the students' union directories.
--
-- Only adds columns and functions, and updates the rule for what a
-- committee can edit (they can now fix their society's name). Nothing is
-- deleted or renamed.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- Where a society came from ('su_directory' for imported ones; empty for
-- ones added by hand), the SU page it came from, when it was imported,
-- and when its committee last edited it (the importer never overwrites a
-- society its committee has edited or claimed).
alter table public.societies add column if not exists source text;
alter table public.societies add column if not exists source_url text;
alter table public.societies add column if not exists imported_at timestamptz;
alter table public.societies add column if not exists committee_edited_at timestamptz;

-- Is anyone running this society on Function yet? (The list of who runs a
-- society is private, so the public page asks this instead.)
create or replace function public.society_is_claimed(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.society_admins where society_id = sid);
$$;
grant execute on function public.society_is_claimed(uuid) to anon, authenticated;

-- What app users can change on a society. Committees can now also fix
-- the name; the link, type, uni, verification and import details stay
-- with the Function team. Any committee edit is timestamped.
create or replace function public.protect_society_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and (select auth.uid()) is not null
     and not public.is_motive_admin() then
    new.slug := old.slug;
    new.kind := old.kind;
    new.university := old.university;
    new.is_verified := old.is_verified;
    new.source := old.source;
    new.source_url := old.source_url;
    new.imported_at := old.imported_at;
    new.committee_edited_at := now();
    new.name := coalesce(nullif(trim(new.name), ''), old.name);
  end if;
  return new;
end;
$$;

-- ===== 20261107000000_delete_my_account.sql =====
-- =====================================================================
-- "Delete my account" (needed for the App Store: Apple requires it for
-- any app with sign-up).
--
-- Only adds one function; nothing existing changes. Deleting the login
-- row removes the profile, and everything already linked to the profile
-- goes with it (friends, follows, events you host, "going" history, your
-- prompts and photos' records). Messages stay, shown as from a "Former
-- member", as the privacy policy says. Your profile picture and photos
-- are removed from storage too.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not logged in';
  end if;
  -- The files behind your profile picture and your 5 photos.
  delete from storage.objects
   where bucket_id in ('avatars', 'profile-photos')
     and name like me::text || '/%';
  -- The login itself; the profile and everything linked to it cascade.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ===== 20261108000000_accounts_and_london_unis.sql =====
-- =====================================================================
-- Accounts with a full name, nickname and graduation year, and sign-up
-- open to every London university.
--
-- Only ADDS things: three new columns on profiles, new rows in
-- universities, two extra columns on the profile_cards view, and one more
-- allowed sign-up event. Nothing existing is deleted or overwritten.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- 1. What an account needs: the person's real name, an optional nickname
--    (what others see when set), and the year they graduate.
alter table public.profiles
  add column if not exists full_name text check (char_length(full_name) <= 80),
  add column if not exists nickname text check (char_length(nickname) <= 40),
  add column if not exists graduation_year smallint check (graduation_year between 2020 and 2040);

-- 2. Every London university. Same list as packages/shared/src/universities.ts.
--    Existing rows (LSE, UCL, KCL, Imperial) are left exactly as they are.
insert into public.universities (id, name, short_name, domains) values
  ('LSE', 'London School of Economics', 'LSE', array['lse.ac.uk']),
  ('UCL', 'University College London', 'UCL', array['ucl.ac.uk']),
  ('KCL', 'King''s College London', 'King''s', array['kcl.ac.uk']),
  ('Imperial', 'Imperial College London', 'Imperial', array['imperial.ac.uk', 'ic.ac.uk']),
  ('QMUL', 'Queen Mary University of London', 'QMUL', array['qmul.ac.uk']),
  ('City', 'City St George''s, University of London', 'City St George''s', array['city.ac.uk', 'citystgeorges.ac.uk', 'sgul.ac.uk']),
  ('Goldsmiths', 'Goldsmiths, University of London', 'Goldsmiths', array['gold.ac.uk']),
  ('RHUL', 'Royal Holloway, University of London', 'Royal Holloway', array['rhul.ac.uk', 'live.rhul.ac.uk']),
  ('Birkbeck', 'Birkbeck, University of London', 'Birkbeck', array['bbk.ac.uk']),
  ('SOAS', 'SOAS University of London', 'SOAS', array['soas.ac.uk']),
  ('Brunel', 'Brunel University of London', 'Brunel', array['brunel.ac.uk']),
  ('Westminster', 'University of Westminster', 'Westminster', array['westminster.ac.uk', 'my.westminster.ac.uk']),
  ('Greenwich', 'University of Greenwich', 'Greenwich', array['gre.ac.uk', 'greenwich.ac.uk']),
  ('Kingston', 'Kingston University London', 'Kingston', array['kingston.ac.uk']),
  ('LondonMet', 'London Metropolitan University', 'London Met', array['londonmet.ac.uk']),
  ('Middlesex', 'Middlesex University', 'Middlesex', array['mdx.ac.uk', 'live.mdx.ac.uk']),
  ('Roehampton', 'University of Roehampton', 'Roehampton', array['roehampton.ac.uk']),
  ('UAL', 'University of the Arts London', 'UAL', array['arts.ac.uk']),
  ('UEL', 'University of East London', 'UEL', array['uel.ac.uk']),
  ('LSBU', 'London South Bank University', 'LSBU', array['lsbu.ac.uk']),
  ('StMarys', 'St Mary''s University, Twickenham', 'St Mary''s', array['stmarys.ac.uk', 'live.stmarys.ac.uk']),
  ('UWL', 'University of West London', 'UWL', array['uwl.ac.uk']),
  ('RVC', 'Royal Veterinary College', 'RVC', array['rvc.ac.uk']),
  ('LSHTM', 'London School of Hygiene & Tropical Medicine', 'LSHTM', array['lshtm.ac.uk']),
  ('ICR', 'Institute of Cancer Research', 'ICR', array['icr.ac.uk']),
  ('LBS', 'London Business School', 'LBS', array['london.edu']),
  ('Regents', 'Regent''s University London', 'Regent''s', array['regents.ac.uk']),
  ('Courtauld', 'The Courtauld Institute of Art', 'Courtauld', array['courtauld.ac.uk']),
  ('RCA', 'Royal College of Art', 'RCA', array['rca.ac.uk']),
  ('RAM', 'Royal Academy of Music', 'RAM', array['ram.ac.uk']),
  ('RCM', 'Royal College of Music', 'RCM', array['rcm.ac.uk']),
  ('Guildhall', 'Guildhall School of Music & Drama', 'Guildhall', array['gsmd.ac.uk']),
  ('TrinityLaban', 'Trinity Laban Conservatoire of Music and Dance', 'Trinity Laban', array['trinitylaban.ac.uk']),
  ('CSSD', 'Royal Central School of Speech and Drama', 'Central', array['cssd.ac.uk']),
  ('Ravensbourne', 'Ravensbourne University London', 'Ravensbourne', array['ravensbourne.ac.uk', 'rave.ac.uk']),
  ('UoL', 'University of London (Senate House and intercollegiate halls)', 'UoL', array['london.ac.uk']),
  ('Richmond', 'Richmond American University London', 'Richmond', array['richmond.ac.uk']),
  ('NUL', 'Northeastern University London', 'Northeastern', array['nulondon.ac.uk', 'nchlondon.ac.uk']),
  ('Hult', 'Hult International Business School (London)', 'Hult', array['hult.edu'])
on conflict (id) do nothing;

-- Imperial also uses ic.ac.uk; City St George's absorbed St George's (sgul).
-- Add any domains missing from rows that already existed, without removing any.
update public.universities set domains = array(select distinct d from unnest(domains || array['ic.ac.uk']) d) where id = 'Imperial';

-- 3. A listed domain now also covers its subdomains, so "live.rhul.ac.uk"
--    counts as Royal Holloway. Exact matches still win.
create or replace function public.uni_from_email(address text)
returns text
language sql stable security definer set search_path = ''
as $$
  select u.id from public.universities u
  where lower(split_part(address, '@', 2)) = any (u.domains)
  union all
  select u.id from public.universities u
  where exists (select 1 from unnest(u.domains) d where lower(split_part(address, '@', 2)) like '%.' || d)
  limit 1;
$$;

-- 4. The sign-up rule's wording (the rule itself is unchanged: a London
--    university email, or an email the Function team has allowed).
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
  raise exception 'Function is for London university students. Use your uni email, or the email you were invited with.';
end;
$$;

-- 5. What other students can see of a profile: now also the full name and
--    nickname (shown together on a profile page), the uni and the year.
create or replace view public.profile_cards as
  select id,
    coalesce(nullif(display_name, ''), 'Member') as name,
    avatar_url,
    course,
    bio,
    nullif(full_name, '') as full_name,
    nullif(nickname, '') as nickname,
    university,
    graduation_year
  from public.profiles;

-- 6. The sign-up funnel can record that the account details step was finished.
alter table public.signup_events drop constraint if exists signup_events_event_check;
alter table public.signup_events add constraint signup_events_event_check
  check (event in ('signup_finished', 'prompts_step_reached', 'prompts_skipped', 'prompts_completed', 'account_details_completed'));

-- ===== 20261109000000_push_notifications.sql =====
-- =====================================================================
-- Push notifications.
--
-- Only ADDS things: three new tables, a few trigger functions and triggers
-- that write to an outbox table ("push_queue") when something happens.
-- Nothing existing is changed; nothing is deleted. The actual sending is
-- done by the send-push edge function (supabase/functions/send-push),
-- which reads the queue. See supabase/RUN_ONCE_push_cron.sql for the
-- timers that call it.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- 1. Where to send: one row per phone or browser a person has allowed.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null unique,            -- Expo push token, or the web push endpoint
  subscription jsonb,                    -- web only: the full PushSubscription (endpoint + keys)
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2. What each person wants to hear about. No row means everything on.
create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,        -- someone messages you
  friends boolean not null default true,         -- friend requests and acceptances
  society_events boolean not null default true,  -- a society you're in posts an event
  reminders boolean not null default true,       -- an event you've joined is starting soon
  hosting boolean not null default true,         -- someone joins or asks to join your event
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
drop policy if exists notification_settings_own on public.notification_settings;
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3. The outbox. Only the server (service role) reads it.
create table if not exists public.push_queue (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('messages', 'friends', 'society_events', 'reminders', 'hosting')),
  title text not null,
  body text not null,
  url text,                              -- where tapping it opens, e.g. /chats/<id>
  dedupe_key text unique,                -- stops the same reminder going twice
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index if not exists push_queue_unsent_idx on public.push_queue (created_at) where sent_at is null;
alter table public.push_queue enable row level security;
-- (no policies: clients can't read or write it; the edge function uses the service role)

-- 4. Queue one notification for one person, if they haven't turned that kind off.
create or replace function public.queue_push(target uuid, kind text, title text, body text, url text default null, dedupe text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  wanted boolean;
begin
  if target is null then return; end if;
  select case kind
           when 'messages' then s.messages
           when 'friends' then s.friends
           when 'society_events' then s.society_events
           when 'reminders' then s.reminders
           when 'hosting' then s.hosting
         end
    into wanted
    from public.notification_settings s where s.user_id = target;
  if coalesce(wanted, true) is false then return; end if;
  -- Only people who have allowed notifications somewhere get rows at all.
  if not exists (select 1 from public.push_tokens t where t.user_id = target) then return; end if;
  insert into public.push_queue (user_id, kind, title, body, url, dedupe_key)
  values (target, kind, left(title, 120), left(body, 200), url, dedupe)
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke all on function public.queue_push(uuid, text, text, text, text, text) from public;

-- The name other students see for someone.
create or replace function public.push_name(person uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(p.display_name, ''), 'Someone') from public.profiles p where p.id = person;
$$;

-- 5a. Someone messages you (private chat: the other person; event chat: everyone going).
create or replace function public.push_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  who text := public.push_name(new.sender_id);
  preview text := left(coalesce(new.body, ''), 100);
  r uuid;
begin
  if new.sender_id is null then return new; end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.event_id is null and t.social_event_id is null then
    perform public.queue_push(case when t.user_a = new.sender_id then t.user_b else t.user_a end, 'messages', who, preview, '/chats/' || t.id);
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages for each row execute function public.push_on_message();

-- 5b. Friend requests, and when one is accepted.
create or replace function public.push_on_friendship()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(new.addressee_id, 'friends', 'New friend request', public.push_name(new.requester_id) || ' wants to be friends.', '/friends');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.queue_push(new.requester_id, 'friends', 'Friend request accepted', public.push_name(new.addressee_id) || ' accepted your friend request.', '/u/' || new.addressee_id);
  end if;
  return new;
end;
$$;
drop trigger if exists friendships_push on public.friendships;
create trigger friendships_push after insert or update on public.friendships for each row execute function public.push_on_friendship();

-- 5c. A society you're a member of posts a new event.
create or replace function public.push_on_society_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  soc text;
  r uuid;
begin
  if new.society_id is null or new.is_hidden or new.is_cancelled then return new; end if;
  select name into soc from public.societies where id = new.society_id;
  for r in select m.user_id from public.society_members m where m.society_id = new.society_id and m.status = 'approved' and m.user_id is distinct from new.created_by loop
    perform public.queue_push(r, 'society_events', coalesce(soc, 'Your society') || ' posted an event', new.title, '/e/' || new.id, 'society-event:' || new.id || ':' || r);
  end loop;
  return new;
end;
$$;
drop trigger if exists events_push on public.events;
create trigger events_push after insert on public.events for each row execute function public.push_on_society_event();

-- 5d. Someone joins, or asks to join, an event you're hosting.
create or replace function public.push_on_social_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  select id, host_id, title into ev from public.social_events where id = new.event_id;
  if ev is null or ev.host_id = new.user_id then return new; end if;
  if tg_op = 'INSERT' and new.status = 'going' then
    perform public.queue_push(ev.host_id, 'hosting', public.push_name(new.user_id) || ' is going', ev.title, '/social/' || ev.id);
  elsif tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(ev.host_id, 'hosting', public.push_name(new.user_id) || ' asked to join', ev.title, '/social/' || ev.id);
  end if;
  return new;
end;
$$;
drop trigger if exists social_members_push on public.social_event_members;
create trigger social_members_push after insert on public.social_event_members for each row execute function public.push_on_social_member();

-- Someone joins a society event you're hosting (student-hosted society-less events).
create or replace function public.push_on_event_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  select id, host_user_id, title into ev from public.events where id = new.event_id;
  if ev is null or ev.host_user_id is null or ev.host_user_id = new.user_id then return new; end if;
  if tg_op = 'INSERT' and new.status in ('going', 'requested') then
    perform public.queue_push(ev.host_user_id, 'hosting', public.push_name(new.user_id) || case when new.status = 'going' then ' is going' else ' asked to join' end, ev.title, '/e/' || ev.id);
  end if;
  return new;
end;
$$;
drop trigger if exists event_entries_push on public.event_entries;
create trigger event_entries_push after insert on public.event_entries for each row execute function public.push_on_event_entry();

-- 6. "Starting soon": run every 5 minutes (see RUN_ONCE_push_cron.sql).
--    Finds events starting in 30 to 35 minutes and queues one reminder per
--    person going. The dedupe key stops repeats.
create or replace function public.queue_event_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  when_text text;
begin
  for r in
    select e.id, e.title, e.starts_at, en.user_id, '/e/' || e.id as url
    from public.events e join public.event_entries en on en.event_id = e.id and en.status = 'going'
    where not e.is_cancelled and not e.is_hidden and e.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
    union all
    select se.id, se.title, se.starts_at, m.user_id, '/social/' || se.id
    from public.social_events se join public.social_event_members m on m.event_id = se.id and m.status = 'going'
    where not se.is_cancelled and not se.is_hidden and se.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
    union all
    select se.id, se.title, se.starts_at, se.host_id, '/social/' || se.id
    from public.social_events se
    where not se.is_cancelled and not se.is_hidden and se.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
  loop
    when_text := to_char(r.starts_at at time zone 'Europe/London', 'HH24:MI');
    perform public.queue_push(r.user_id, 'reminders', 'Starting soon: ' || r.title, 'Starts at ' || when_text || '.', r.url, 'reminder:' || r.id || ':' || r.user_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.queue_event_reminders() from public;

-- ===== 20261110000000_recommendations.sql =====
-- Recommended events: how many of your friends are hosting or going to an
-- event. Only adds one function. It returns counts, never names, and only
-- for events the caller can already see (the same rules as the event
-- tables' security policies), and only about the caller's accepted friends.
--
-- The app passes the ids of the events it has already loaded; the scoring
-- itself happens in the app (packages/shared/src/recommend.ts). The count
-- covers accepted friends only, so "2 friends going" is the one thing a
-- friend learns about you here: that you're going to an event they can see.

create or replace function public.my_friend_event_signals(society_ids uuid[] default '{}', social_ids uuid[] default '{}')
returns table (kind text, event_id uuid, hosting boolean, going integer)
language sql stable security definer set search_path = ''
as $$
  with friends as materialized (
    select case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and (select auth.uid()) in (f.requester_id, f.addressee_id)
  ),
  -- The counts first (cheap), then the visibility rules only for events with a signal.
  soc as materialized (
    select e.id, e.society_id, e.audience, e.host_user_id, e.visibility,
           (e.host_user_id is not null and e.host_user_id in (select fid from friends)) as hosting,
           (select count(*)::integer from public.event_entries en
             where en.event_id = e.id and en.status = 'going' and en.user_id in (select fid from friends)) as going
    from public.events e
    where (select auth.uid()) is not null
      and e.id = any(coalesce(society_ids, '{}'))
      and not e.is_hidden and not e.is_cancelled
  ),
  sol as materialized (
    select se.id, se.host_id, se.friends_only,
           (se.host_id in (select fid from friends)) as hosting,
           (select count(*)::integer from public.social_event_members m
             where m.event_id = se.id and m.status = 'going' and m.user_id in (select fid from friends)) as going
    from public.social_events se
    where (select auth.uid()) is not null
      and se.id = any(coalesce(social_ids, '{}'))
      and not se.is_hidden and not se.is_cancelled
  )
  select 'society'::text, s.id, s.hosting, s.going
  from soc s
  where (s.hosting or s.going > 0)
    and (s.society_id is null or public.can_see_society_event(s.society_id, s.audience) or public.has_entry(s.id))
    and (s.host_user_id is null
         or (not public.is_blocked_between(s.host_user_id, (select auth.uid()))
             and (s.visibility = 'public' or public.are_friends(s.host_user_id, (select auth.uid())) or public.has_entry(s.id))))
  union all
  select 'social'::text, s.id, s.hosting, s.going
  from sol s
  where (s.hosting or s.going > 0)
    and not public.is_blocked_between(s.host_id, (select auth.uid()))
    and (not s.friends_only or public.are_friends(s.host_id, (select auth.uid())) or public.social_is_member(s.id));
$$;

revoke execute on function public.my_friend_event_signals(uuid[], uuid[]) from public, anon;
grant execute on function public.my_friend_event_signals(uuid[], uuid[]) to authenticated;

-- ===== 20261111000000_profile_country.sql =====
-- Country flag on profiles: an optional two-letter country code on each
-- profile, shown as a flag next to the person's name. Only adds a column and
-- widens the profile_cards view; existing rules stay (you can only set your
-- own; the view already hides email).

alter table public.profiles add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');

-- The same view as before with `country` added at the end (a replaced view
-- must keep its existing columns in the same order).
create or replace view public.profile_cards as
  select id,
    coalesce(nullif(display_name, ''), 'Member') as name,
    avatar_url,
    course,
    bio,
    nullif(full_name, '') as full_name,
    nullif(nickname, '') as nickname,
    university,
    graduation_year,
    country
  from public.profiles;

-- ===== 20261112000000_admin_panel.sql =====
-- The Function team's admin panel: looking a user up, listing every event,
-- clearing out old events (and their images), and letting a society's own
-- committee clear out their past events. Everything here starts by checking
-- the caller is a Function admin (profiles.is_admin, via is_motive_admin)
-- or, for the committee tools, runs that society. Only adds things.

-- 1. Reports about Social plans gain a status, like other reports.
alter table public.social_reports add column if not exists status public.report_status not null default 'open';

-- ---------------------------------------------------------------------
-- 2. User lookup (support only: no photos, prompts, chats or money)
-- ---------------------------------------------------------------------

create or replace function public.admin_search_users(q text, max integer default 20)
returns table (id uuid, email text, name text, full_name text, university text, graduation_year integer, country text, created_at timestamptz, is_admin boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  needle text := '%' || btrim(coalesce(q, '')) || '%';
begin
  if not public.is_motive_admin() then raise exception 'Function admins only'; end if;
  return query
    select p.id, p.email, coalesce(nullif(p.display_name, ''), 'Member'), p.full_name, p.university, p.graduation_year::integer, p.country, p.created_at, p.is_admin
    from public.profiles p
    where btrim(coalesce(q, '')) = ''
       or p.email ilike needle
       or coalesce(p.display_name, '') ilike needle
       or coalesce(p.full_name, '') ilike needle
       or coalesce(p.nickname, '') ilike needle
    order by p.created_at desc
    limit least(greatest(coalesce(max, 20), 1), 100);
end;
$$;

create or replace function public.admin_user_detail(uid uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_motive_admin() then raise exception 'Function admins only'; end if;
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'name', coalesce(nullif(p.display_name, ''), 'Member'),
    'full_name', p.full_name,
    'nickname', p.nickname,
    'university', p.university,
    'graduation_year', p.graduation_year,
    'country', p.country,
    'course', p.course,
    'created_at', p.created_at,
    'is_admin', p.is_admin,
    'email_confirmed_at', u.email_confirmed_at,
    'last_sign_in_at', u.last_sign_in_at,
    'two_factor', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status::text = 'verified'),
    'uni_email', public.uni_from_email(p.email) is not null,
    'details_complete', p.full_name is not null and p.graduation_year is not null,
    'societies', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'status', m.status) order by s.name), '[]'::jsonb)
      from public.society_members m join public.societies s on s.id = m.society_id where m.user_id = p.id),
    'runs', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug) order by s.name), '[]'::jsonb)
      from public.society_admins a join public.societies s on s.id = a.society_id where a.user_id = p.id),
    'hosted_count', (select count(*) from public.events e where e.host_user_id = p.id) + (select count(*) from public.social_events se where se.host_id = p.id),
    'joined_count', (select count(*) from public.event_entries en where en.user_id = p.id) + (select count(*) from public.social_event_members sm where sm.user_id = p.id and sm.status = 'going'),
    'hosted', (
      select coalesce(jsonb_agg(x.row order by x.starts_at desc), '[]'::jsonb) from (
        (select jsonb_build_object('kind', 'society', 'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'href', '/e/' || e.id) as row, e.starts_at
           from public.events e where e.host_user_id = p.id order by e.starts_at desc limit 10)
        union all
        (select jsonb_build_object('kind', 'social', 'id', se.id, 'title', se.title, 'starts_at', se.starts_at, 'href', '/social/' || se.id), se.starts_at
           from public.social_events se where se.host_id = p.id order by se.starts_at desc limit 10)
      ) x),
    'joined', (
      select coalesce(jsonb_agg(x.row order by x.starts_at desc), '[]'::jsonb) from (
        (select jsonb_build_object('kind', 'society', 'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'status', en.status::text, 'href', '/e/' || e.id) as row, e.starts_at
           from public.event_entries en join public.events e on e.id = en.event_id where en.user_id = p.id order by e.starts_at desc limit 10)
        union all
        (select jsonb_build_object('kind', 'social', 'id', se.id, 'title', se.title, 'starts_at', se.starts_at, 'status', sm.status::text, 'href', '/social/' || se.id), se.starts_at
           from public.social_event_members sm join public.social_events se on se.id = sm.event_id where sm.user_id = p.id order by se.starts_at desc limit 10)
      ) x),
    'reports_against', (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status::text, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
      from public.reports r where r.reported_user_id = p.id)
  ) into result
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = uid;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Every event, for the Events section
-- ---------------------------------------------------------------------

create or replace function public.admin_list_events(q text default null, society uuid default null, scope text default 'upcoming', include_cancelled boolean default true, max integer default 100)
returns table (kind text, id uuid, title text, starts_at timestamptz, ends_at timestamptz, society_id uuid, society_name text, host_name text, going integer, is_cancelled boolean, is_hidden boolean, results_published boolean, image_url text, href text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  needle text := '%' || btrim(coalesce(q, '')) || '%';
  lim integer := least(greatest(coalesce(max, 100), 1), 500);
begin
  if not public.is_motive_admin() then raise exception 'Function admins only'; end if;
  return query
    select * from (
      select 'society'::text as kind, e.id, e.title, e.starts_at, e.ends_at, e.society_id, s.name as society_name, nullif(hp.display_name, '') as host_name,
             e.going_count as going, e.is_cancelled, e.is_hidden, e.results_published, e.image_url, '/e/' || e.id as href
      from public.events e
      left join public.societies s on s.id = e.society_id
      left join public.profiles hp on hp.id = e.host_user_id
      where (btrim(coalesce(q, '')) = '' or e.title ilike needle or coalesce(s.name, '') ilike needle)
        and (society is null or e.society_id = society)
        and (scope = 'all' or (scope = 'past' and e.ends_at < now()) or (scope <> 'past' and e.ends_at >= now()))
        and (include_cancelled or not e.is_cancelled)
      union all
      select 'social', se.id, se.title, se.starts_at, se.ends_at, null, null, nullif(hp.display_name, ''),
             se.going_count + 1, se.is_cancelled, se.is_hidden, false, null, '/social/' || se.id
      from public.social_events se
      left join public.profiles hp on hp.id = se.host_id
      where society is null
        and (btrim(coalesce(q, '')) = '' or se.title ilike needle)
        and (scope = 'all' or (scope = 'past' and se.ends_at < now()) or (scope <> 'past' and se.ends_at >= now()))
        and (include_cancelled or not se.is_cancelled)
    ) x
    order by case when scope = 'past' then x.starts_at end desc, x.starts_at asc
    limit lim;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Clearing out old events, images included
-- ---------------------------------------------------------------------

-- The storage path behind a public image URL ("<society>/<file>.jpg" in the
-- images bucket), or null when the URL isn't one of ours.
create or replace function public.image_storage_path(url text)
returns text
language sql immutable
as $$
  select case when url like '%/object/public/images/%' then split_part(url, '/object/public/images/', 2) end;
$$;

-- The society whose events the admin tools never touch (its own committee can).
create or replace function public.protected_society_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select id from public.societies where slug = 'lse-poker-society' limit 1 $$;

-- What "Delete past events" would remove, so the admin can be shown the
-- numbers before confirming. Cut-off: ended more than `older_than_days` ago
-- (never less than 30). Skips events with published poker results and the
-- protected society's events.
create or replace function public.admin_past_events_summary(older_than_days integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(older_than_days, 90), 30));
  protected uuid := public.protected_society_id();
begin
  if not public.is_motive_admin() then raise exception 'Function admins only'; end if;
  if protected is null then raise exception 'The LSE Poker Society could not be found, so nothing was counted'; end if;
  return jsonb_build_object(
    'cutoff', cutoff,
    'society_events', (select count(*) from public.events e where e.ends_at < cutoff and not e.results_published and e.society_id is distinct from protected),
    'social_events', (select count(*) from public.social_events se where se.ends_at < cutoff),
    'images', (select count(*) from public.events e where e.ends_at < cutoff and not e.results_published and e.society_id is distinct from protected and public.image_storage_path(e.image_url) is not null),
    'skipped_results', (select count(*) from public.events e where e.ends_at < cutoff and e.results_published and e.society_id is distinct from protected),
    'skipped_protected', (select count(*) from public.events e where e.ends_at < cutoff and e.society_id = protected)
  );
end;
$$;

create or replace function public.admin_delete_past_events(older_than_days integer default 90)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(older_than_days, 90), 30));
  protected uuid := public.protected_society_id();
  ids uuid[];
  paths text[];
  images integer;
  society_count integer;
  social_count integer;
begin
  if not public.is_motive_admin() then raise exception 'Function admins only'; end if;
  if protected is null then raise exception 'The LSE Poker Society could not be found, so nothing was deleted'; end if;
  select coalesce(array_agg(e.id), '{}'), coalesce(array_agg(public.image_storage_path(e.image_url)) filter (where public.image_storage_path(e.image_url) is not null), '{}')
    into ids, paths
    from public.events e
    where e.ends_at < cutoff and not e.results_published and e.society_id is distinct from protected;
  delete from storage.objects o where o.bucket_id = 'images' and o.name = any(paths);
  get diagnostics images = row_count;
  delete from public.events e where e.id = any(ids);
  get diagnostics society_count = row_count;
  delete from public.social_events se where se.ends_at < cutoff;
  get diagnostics social_count = row_count;
  return jsonb_build_object('society_events', society_count, 'social_events', social_count, 'images', images);
end;
$$;

-- The image files those events use. The app removes them through the
-- Storage API first (a row deleted here would leave the file itself behind),
-- then calls the delete function above, which clears any rows left over.
create or replace function public.admin_past_event_images(older_than_days integer default 90)
returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(older_than_days, 90), 30));
  protected uuid := public.protected_society_id();
begin
  if not public.is_motive_admin() then raise exception 'Function admins only'; end if;
  if protected is null then raise exception 'The LSE Poker Society could not be found'; end if;
  return (select coalesce(array_agg(public.image_storage_path(e.image_url)) filter (where public.image_storage_path(e.image_url) is not null), '{}')
          from public.events e
          where e.ends_at < cutoff and not e.results_published and e.society_id is distinct from protected);
end;
$$;

-- Function admins may delete event images through the Storage API (the
-- committee already can, for their own society's folder).
drop policy if exists images_delete_by_function_admins on storage.objects;
create policy images_delete_by_function_admins on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.is_motive_admin());

-- ---------------------------------------------------------------------
-- 5. A society's own committee clearing out their past events
-- ---------------------------------------------------------------------

-- On the committee itself (a row in society_admins), as opposed to
-- is_society_admin(), which is also true for every Function admin. Used
-- where a Function admin should not be treated as a committee member.
create or replace function public.is_society_committee(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.society_admins a where a.society_id = sid and a.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_society_committee(uuid) from public, anon;
grant execute on function public.is_society_committee(uuid) to authenticated;

create or replace function public.society_past_events_summary(sid uuid, older_than_days integer default 90, keep_results boolean default true)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(older_than_days, 90), 7));
begin
  if not public.is_society_committee(sid) then raise exception 'Only the committee can do this'; end if;
  return jsonb_build_object(
    'cutoff', cutoff,
    'events', (select count(*) from public.events e where e.society_id = sid and e.ends_at < cutoff and (not keep_results or not e.results_published)),
    'images', (select count(*) from public.events e where e.society_id = sid and e.ends_at < cutoff and (not keep_results or not e.results_published) and public.image_storage_path(e.image_url) is not null),
    'skipped_results', case when keep_results then (select count(*) from public.events e where e.society_id = sid and e.ends_at < cutoff and e.results_published) else 0 end
  );
end;
$$;

create or replace function public.delete_society_past_events(sid uuid, older_than_days integer default 90, keep_results boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(older_than_days, 90), 7));
  ids uuid[];
  paths text[];
  images integer;
  events_count integer;
begin
  if not public.is_society_committee(sid) then raise exception 'Only the committee can do this'; end if;
  select coalesce(array_agg(e.id), '{}'), coalesce(array_agg(public.image_storage_path(e.image_url)) filter (where public.image_storage_path(e.image_url) is not null), '{}')
    into ids, paths
    from public.events e
    where e.society_id = sid and e.ends_at < cutoff and (not keep_results or not e.results_published);
  delete from storage.objects o where o.bucket_id = 'images' and o.name = any(paths);
  get diagnostics images = row_count;
  delete from public.events e where e.id = any(ids);
  get diagnostics events_count = row_count;
  return jsonb_build_object('events', events_count, 'images', images);
end;
$$;

create or replace function public.society_past_event_images(sid uuid, older_than_days integer default 90, keep_results boolean default true)
returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(older_than_days, 90), 7));
begin
  if not public.is_society_committee(sid) then raise exception 'Only the committee can do this'; end if;
  return (select coalesce(array_agg(public.image_storage_path(e.image_url)) filter (where public.image_storage_path(e.image_url) is not null), '{}')
          from public.events e
          where e.society_id = sid and e.ends_at < cutoff and (not keep_results or not e.results_published));
end;
$$;

revoke execute on function public.admin_past_event_images(integer) from public, anon;
grant execute on function public.admin_past_event_images(integer) to authenticated;
revoke execute on function public.society_past_event_images(uuid, integer, boolean) from public, anon;
grant execute on function public.society_past_event_images(uuid, integer, boolean) to authenticated;
revoke execute on function public.admin_search_users(text, integer) from public, anon;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
revoke execute on function public.admin_list_events(text, uuid, text, boolean, integer) from public, anon;
revoke execute on function public.admin_past_events_summary(integer) from public, anon;
revoke execute on function public.admin_delete_past_events(integer) from public, anon;
revoke execute on function public.society_past_events_summary(uuid, integer, boolean) from public, anon;
revoke execute on function public.delete_society_past_events(uuid, integer, boolean) from public, anon;
revoke execute on function public.protected_society_id() from public, anon;
grant execute on function public.admin_search_users(text, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_list_events(text, uuid, text, boolean, integer) to authenticated;
grant execute on function public.admin_past_events_summary(integer) to authenticated;
grant execute on function public.admin_delete_past_events(integer) to authenticated;
grant execute on function public.society_past_events_summary(uuid, integer, boolean) to authenticated;
grant execute on function public.delete_society_past_events(uuid, integer, boolean) to authenticated;
grant execute on function public.protected_society_id() to authenticated;

-- ===== 20261113000000_poker_seats.sql =====
-- Poker cash games: numbered seats. Every player at a table has a seat
-- number (Seat 1, Seat 2, ...) so it's clear who sits where in real life.
-- Players can take a specific empty seat or any seat; the committee can
-- reshuffle a table, and each player is told their new seat. Only adds
-- things: one column, one table, one setting, a few functions and triggers.

-- ---------------------------------------------------------------------
-- 1. The seat number, unique per table
-- ---------------------------------------------------------------------

alter table public.event_entries add column if not exists seat_no integer check (seat_no between 1 and 20);
create unique index if not exists event_entries_seat_idx on public.event_entries (table_id, seat_no) where seat_no is not null;

-- The lowest empty seat at a table (ignoring one person, who may be moving).
create or replace function public.lowest_free_seat(tid uuid, skip_user uuid default null)
returns integer
language sql stable security definer set search_path = ''
as $$
  select s from generate_series(1, (select t.seats from public.event_tables t where t.id = tid)) s
  where not exists (select 1 from public.event_entries e where e.table_id = tid and e.seat_no = s and (skip_user is null or e.user_id <> skip_user))
  order by s limit 1;
$$;
revoke execute on function public.lowest_free_seat(uuid, uuid) from public, anon, authenticated;

-- Whenever someone lands on a table (joining, moving, the committee moving
-- them, the waiting list filling a seat) they get the lowest empty seat
-- unless a seat was chosen; leaving a table clears it. The functions below
-- switch this off for one person at a time (the "function.seating" setting
-- holds their id) so that other rows touched in the same statement, such as
-- a waiting-list player being moved into the seat they vacate, are still
-- seated normally.
create or replace function public.event_entries_seat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cap integer;
begin
  if current_setting('function.seating', true) = new.user_id::text then return new; end if;
  if new.table_id is null or new.status <> 'going' then
    new.seat_no := null;
    return new;
  end if;
  -- Moved to another table with the old number still on the row: pick afresh.
  if tg_op = 'UPDATE' and new.table_id is distinct from old.table_id and new.seat_no is not distinct from old.seat_no then
    new.seat_no := null;
  end if;
  select t.seats into cap from public.event_tables t where t.id = new.table_id;
  if new.seat_no is not null and (cap is null or new.seat_no > cap) then new.seat_no := null; end if;
  if new.seat_no is not null and exists (select 1 from public.event_entries e where e.table_id = new.table_id and e.seat_no = new.seat_no and e.user_id <> new.user_id) then
    raise exception 'That seat has just been taken. Pick another.';
  end if;
  if new.seat_no is null then new.seat_no := public.lowest_free_seat(new.table_id, new.user_id); end if;
  return new;
end;
$$;
drop trigger if exists event_entries_seat on public.event_entries;
create trigger event_entries_seat before insert or update on public.event_entries
  for each row execute function public.event_entries_seat();

-- Fewer seats at a table (the committee edited it): anyone above the new
-- number moves down to an empty seat.
create or replace function public.event_tables_reseat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if new.seats < old.seats then
    for r in select e.event_id, e.user_id from public.event_entries e where e.table_id = new.id and e.seat_no > new.seats order by e.seat_no loop
      update public.event_entries set seat_no = null where event_id = r.event_id and user_id = r.user_id;
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists event_tables_reseat on public.event_tables;
create trigger event_tables_reseat after update of seats on public.event_tables
  for each row execute function public.event_tables_reseat();

-- Someone the committee moved onto a table that was already full has no
-- number. When a seat there frees up (someone leaves, moves or is removed),
-- they take it.
create or replace function public.event_entries_seat_gap()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if pg_trigger_depth() > 20 then return null; end if;
  if old.table_id is not null and old.status = 'going'
     and (tg_op = 'DELETE' or new.table_id is distinct from old.table_id or new.status <> 'going') then
    for r in select e.event_id, e.user_id from public.event_entries e
             where e.table_id = old.table_id and e.status = 'going' and e.seat_no is null order by e.created_at loop
      update public.event_entries set seat_no = null where event_id = r.event_id and user_id = r.user_id;
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists event_entries_seat_gap on public.event_entries;
create trigger event_entries_seat_gap after update or delete on public.event_entries
  for each row execute function public.event_entries_seat_gap();

-- Players already at a table get numbers now, earliest joiner first.
do $$
declare r record;
begin
  for r in select e.event_id, e.user_id from public.event_entries e where e.table_id is not null and e.status = 'going' and e.seat_no is null order by e.created_at loop
    update public.event_entries set seat_no = null where event_id = r.event_id and user_id = r.user_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Taking a seat: a chosen one, or any empty one
-- ---------------------------------------------------------------------

create or replace function public.take_seat(eid uuid, tid uuid, seat integer default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cap integer;
  picked integer;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  select t.seats into cap from public.event_tables t where t.id = tid and t.event_id = eid;
  if cap is null then raise exception 'That table isn''t part of this event'; end if;
  if not exists (select 1 from public.event_entries where event_id = eid and user_id = uid and status = 'going') then
    perform public.join_event(eid, null);
    if not exists (select 1 from public.event_entries where event_id = eid and user_id = uid and status = 'going') then
      raise exception 'Join the event first';
    end if;
  end if;
  perform public.assert_seat_free(eid, tid);
  if seat is not null then
    if seat < 1 or seat > cap then raise exception 'That seat doesn''t exist'; end if;
    if exists (select 1 from public.event_entries e where e.table_id = tid and e.seat_no = seat and e.user_id <> uid) then
      raise exception 'That seat has just been taken. Pick another.';
    end if;
    picked := seat;
  else
    -- "Sit anywhere": a random empty seat.
    select s into picked from generate_series(1, cap) s
    where not exists (select 1 from public.event_entries e where e.table_id = tid and e.seat_no = s and e.user_id <> uid)
    order by random() limit 1;
    if picked is null then raise exception 'That table is full'; end if;
  end if;
  perform set_config('function.seating', uid::text, true);
  update public.event_entries set table_id = tid, seat_no = picked where event_id = eid and user_id = uid;
  perform set_config('function.seating', '', true);
end;
$$;
revoke execute on function public.take_seat(uuid, uuid, integer) from public, anon;
grant execute on function public.take_seat(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Telling players about a new seat
-- ---------------------------------------------------------------------

create table if not exists public.seat_changes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  table_id   uuid references public.event_tables (id) on delete set null,
  seat_no    integer,
  reason     text not null default 'randomised' check (reason in ('randomised', 'moved')),
  created_at timestamptz not null default now()
);
create index if not exists seat_changes_user_idx on public.seat_changes (user_id, created_at desc);
alter table public.seat_changes enable row level security;
drop policy if exists seat_changes_select on public.seat_changes;
create policy seat_changes_select on public.seat_changes for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(public.event_society(event_id)));
-- Rows are only written by the functions below.

-- A new kind of push: "seating".
alter table public.notification_settings add column if not exists seating boolean not null default true;
alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check check (kind in ('messages', 'friends', 'society_events', 'reminders', 'hosting', 'seating'));

create or replace function public.queue_push(target uuid, kind text, title text, body text, url text default null, dedupe text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  wanted boolean;
begin
  if target is null then return; end if;
  select case kind
           when 'messages' then s.messages
           when 'friends' then s.friends
           when 'society_events' then s.society_events
           when 'reminders' then s.reminders
           when 'hosting' then s.hosting
           when 'seating' then s.seating
         end
    into wanted
    from public.notification_settings s where s.user_id = target;
  if coalesce(wanted, true) is false then return; end if;
  -- Only people who have allowed notifications somewhere get rows at all.
  if not exists (select 1 from public.push_tokens t where t.user_id = target) then return; end if;
  insert into public.push_queue (user_id, kind, title, body, url, dedupe_key)
  values (target, kind, left(title, 120), left(body, 200), url, dedupe)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. The committee reshuffling a table
-- ---------------------------------------------------------------------

create or replace function public.randomise_table_seats(eid uuid, tid uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  players uuid[];
  olds integer[];
  moved integer := 0;
  tname text;
  ename text;
  i integer;
begin
  if not public.is_society_admin(public.event_society(eid)) then raise exception 'Only the committee can do this'; end if;
  perform 1 from public.events where id = eid for update;
  select t.name into tname from public.event_tables t where t.id = tid and t.event_id = eid;
  if tname is null then raise exception 'That table isn''t part of this event'; end if;
  select e.title into ename from public.events e where e.id = eid;
  -- A random order of the players at the table; position i becomes Seat i.
  select coalesce(array_agg(s.user_id order by s.rnd), '{}'), coalesce(array_agg(s.seat_no order by s.rnd), '{}')
    into players, olds
    from (select e.user_id, e.seat_no, random() as rnd from public.event_entries e where e.event_id = eid and e.table_id = tid and e.status = 'going') s;
  -- Two passes so no two players ever share a number mid-way.
  for i in 1 .. coalesce(array_length(players, 1), 0) loop
    perform set_config('function.seating', players[i]::text, true);
    update public.event_entries e set seat_no = null where e.event_id = eid and e.user_id = players[i];
  end loop;
  for i in 1 .. coalesce(array_length(players, 1), 0) loop
    perform set_config('function.seating', players[i]::text, true);
    update public.event_entries e set seat_no = i where e.event_id = eid and e.user_id = players[i];
    if i is distinct from olds[i] then
      moved := moved + 1;
      insert into public.seat_changes (event_id, user_id, table_id, seat_no, reason) values (eid, players[i], tid, i, 'randomised');
      perform public.queue_push(players[i], 'seating', 'Seats reshuffled', 'You''re now in Seat ' || i || ' at ' || tname || ' for ' || ename, '/e/' || eid);
    end if;
  end loop;
  perform set_config('function.seating', '', true);
  return moved;
end;
$$;
revoke execute on function public.randomise_table_seats(uuid, uuid) from public, anon;
grant execute on function public.randomise_table_seats(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Poker stats for the little profile card at the table
-- ---------------------------------------------------------------------

-- Games played (tables-format events they went to that have finished) and
-- best tournament finish, if any. Counts only; nothing about money. Only
-- counts games in societies the person asking is in (or games they were
-- at too), and nothing between people who have blocked each other.
create or replace function public.poker_stats(person uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or public.is_blocked_between(person, (select auth.uid())) then jsonb_build_object('games_played', 0, 'best_finish', null)
    else jsonb_build_object(
      'games_played', (select count(*) from public.event_entries en join public.events e on e.id = en.event_id
                        where en.user_id = person and en.status = 'going' and e.format = 'tables' and e.ends_at < now() and not e.is_cancelled
                          and (public.is_society_member(e.society_id) or public.is_society_admin(e.society_id) or public.has_entry(e.id))),
      'best_finish', (select min(en.finish_position) from public.event_entries en join public.events e on e.id = en.event_id
                        where en.user_id = person and en.finish_position is not null and not e.is_cancelled
                          and (public.is_society_member(e.society_id) or public.is_society_admin(e.society_id) or public.has_entry(e.id)))
    ) end;
$$;
revoke execute on function public.poker_stats(uuid) from public, anon;
grant execute on function public.poker_stats(uuid) to authenticated;

-- ===== 20261114000000_society_event_chats.sql =====
-- Society event group chats. Every event (society or student-hosted) gets
-- its chat the moment it's created, like Social plans already do. Who can
-- use it follows the event: people going, the host, and (for a society's
-- event) its committee, so joining the event adds you and leaving removes
-- you. Chats of finished events drop off the list a week after the end
-- (nothing is deleted). Only adds things.

-- 1. A chat the moment an event is created...
create or replace function public.event_create_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.threads (event_id) values (new.id) on conflict (event_id) do nothing;
  return new;
end;
$$;
drop trigger if exists events_create_chat on public.events;
create trigger events_create_chat after insert on public.events
  for each row execute function public.event_create_chat();

-- ...and for every event that hasn't finished yet.
insert into public.threads (event_id)
select e.id from public.events e where e.ends_at > now()
on conflict (event_id) do nothing;

-- 2. Who can use a chat: as before, plus a society's committee in its
--    events' chats (the committee itself, not Function admins, whose Chats
--    list stays their own).
create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and (public.are_friends(t.user_a, t.user_b)
             or (t.via_social_event is not null and not public.is_blocked_between(t.user_a, t.user_b))))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id)
             or public.is_going_to(t.event_id)
             or exists (select 1 from public.events e where e.id = t.event_id and e.society_id is not null and public.is_society_committee(e.society_id))))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- Opening an event's chat no longer needs a student host; the same people
-- as above may open it (it already exists for every new event).
create or replace function public.open_event_chat(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  tid uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not (public.is_event_host(eid) or public.is_going_to(eid)
          or exists (select 1 from public.events e where e.id = eid and e.society_id is not null and public.is_society_committee(e.society_id))) then
    raise exception 'Only people going can see the chat';
  end if;
  insert into public.threads (event_id) values (eid) on conflict (event_id) do nothing;
  select id into tid from public.threads where event_id = eid;
  return tid;
end;
$$;

-- 3. Who counts as the host of an event: the student hosting it, or the
--    society's committee. Shown with the Host badge in the chat and the
--    going list. Only for events the caller is part of or allowed to see.
create or replace function public.event_hosts(eid uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.host_user_id from public.events e
  where e.id = eid and e.host_user_id is not null
    and ((select auth.uid()) is not null)
    and (public.is_event_host(eid) or public.is_going_to(eid)
         or (not e.is_hidden
             and not public.is_blocked_between(e.host_user_id, (select auth.uid()))
             and (e.visibility = 'public' or public.are_friends(e.host_user_id, (select auth.uid())))))
  union
  select a.user_id from public.society_admins a
  join public.events e on e.society_id = a.society_id
  where e.id = eid
    and ((select auth.uid()) is not null)
    and (public.is_going_to(eid) or public.is_society_admin(e.society_id) or public.is_society_member(e.society_id));
$$;
revoke execute on function public.event_hosts(uuid) from public, anon;
grant execute on function public.event_hosts(uuid) to authenticated;

-- 4. The chat list: as before, but chats of events that finished more than
--    a week ago drop off (the chat itself stays). Now that every event has
--    a chat, the list first narrows down to the chats that could be mine
--    (my DMs, events I'm going to, host or run, Social plans I'm in) with
--    plain lookups, and only then applies the full can_use_thread check,
--    so the badge and the Chats tab stay quick however many events exist.
create or replace function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  with mine as materialized (
    select t.id from public.threads t
    where t.user_a = (select auth.uid()) or t.user_b = (select auth.uid())
       or t.event_id in (
            select en.event_id from public.event_entries en where en.user_id = (select auth.uid()) and en.status = 'going'
            union select ev.id from public.events ev where ev.host_user_id = (select auth.uid())
            union select ev.id from public.events ev join public.society_admins a on a.society_id = ev.society_id where a.user_id = (select auth.uid()))
       or t.social_event_id in (
            select s.id from public.social_events s where s.host_id = (select auth.uid())
            union select m.event_id from public.social_event_members m where m.user_id = (select auth.uid()) and m.status = 'going')
  ), ok as materialized (
    select mine.id from mine where public.can_use_thread(mine.id)
  )
  select t.id, t.event_id,
         coalesce(e.title, se.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         t.social_event_id
  from public.threads t
  join ok on ok.id = t.id
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id order by created_at desc limit 1
  ) lm on true
  where (e.id is null or e.ends_at > now() - interval '7 days')
    and (se.id is null or se.ends_at > now() - interval '7 days')
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;

-- 5. New messages in an event chat also reach the society's committee
--    (they can turn "Messages" off in their notification settings).
create or replace function public.push_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  who text := public.push_name(new.sender_id);
  preview text := left(coalesce(new.body, ''), 100);
  r uuid;
begin
  if new.sender_id is null then return new; end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.event_id is null and t.social_event_id is null then
    perform public.queue_push(case when t.user_a = new.sender_id then t.user_b else t.user_a end, 'messages', who, preview, '/chats/' || t.id);
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
        union select a.user_id from public.society_admins a join public.events e on e.society_id = a.society_id where e.id = t.event_id
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

