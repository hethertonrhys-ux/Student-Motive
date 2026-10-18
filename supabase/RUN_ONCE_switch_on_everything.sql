-- Everything waiting, in one go. Run ONCE in Supabase > SQL Editor, then merge
-- the all-waiting-items branch on GitHub straight away.
-- It only ADDS things (new columns, tables, functions, rules). Nothing is deleted.

-- ===================== 20261024000000_food_category =====================
-- Item 4: a "Food" category for Social events. Only adds a new choice;
-- nothing existing changes.
alter type public.social_category add value if not exists 'food';

-- ===================== 20261024000001_learn_category =====================
-- Follow-up: a "Learn" category for Social events (workshops, skills,
-- talks by students). Only adds a new choice; nothing existing changes.
alter type public.social_category add value if not exists 'learn';

-- ===================== 20261025000000_social_event_cost =====================
-- Item 6: an optional cost on Social events, display only (no payments).
-- Stored in pence: empty = not given, 0 = Free, 600 = £6. Only adds a column.
alter table public.social_events add column if not exists cost_pence integer
  check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));

-- ===================== 20261026000000_society_event_cost =====================
-- Item 7: the same optional cost on society events, display only.
-- Stored in pence: empty = not given, 0 = Free, 600 = £6. Only adds a column.
alter table public.events add column if not exists cost_pence integer
  check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));

-- ===================== 20261027000000_social_event_chats =====================
-- Item 8: every Social event gets a group chat, named after the event.
-- It reuses the existing chats (threads and messages). Who's in the chat
-- isn't stored: the host and everyone going can use it, so joining adds you,
-- leaving or being removed takes you out, and the host is always in.
-- Only adds things: one new column, a trigger, and updated chat rules.

-- 1. A chat can now belong to a Social event.
alter table public.threads add column if not exists social_event_id uuid unique
  references public.social_events (id) on delete cascade;

-- The old rule said a chat is either an event chat or a two-person chat;
-- swap it for one that also allows a Social event chat (existing chats all
-- still pass).
alter table public.threads drop constraint if exists threads_check;
alter table public.threads add constraint threads_kind_check check (
  (event_id is not null and social_event_id is null and user_a is null and user_b is null)
  or (social_event_id is not null and event_id is null and user_a is null and user_b is null)
  or (event_id is null and social_event_id is null and user_a is not null and user_b is not null and user_a < user_b)
);

-- 2. Who can read and write in a chat: as before, plus the host and people
--    going for a Social event chat.
create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and public.are_friends(t.user_a, t.user_b))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id) or public.is_going_to(t.event_id)))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- 3. Every new Social event gets its chat straight away...
create or replace function public.social_event_create_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.threads (social_event_id) values (new.id) on conflict (social_event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists social_events_create_chat on public.social_events;
create trigger social_events_create_chat after insert on public.social_events
  for each row execute function public.social_event_create_chat();

-- ...and so does every Social event that already exists.
insert into public.threads (social_event_id)
select id from public.social_events
on conflict (social_event_id) do nothing;

-- 4. The chat list: as before, plus the Social event's title and id.
--    (Adding a column to what it returns means re-creating it.)
drop function if exists public.my_threads();
create function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.event_id,
         coalesce(e.title, se.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         t.social_event_id
  from public.threads t
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id order by created_at desc limit 1
  ) lm on true
  where public.can_use_thread(t.id)
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;

-- ===================== 20261028000000_photos_stay =====================
-- Item 12: profile photos no longer expire after 30 days. A photo stays on
-- the profile until its owner removes it (to the Archive) or deletes it.
-- Nothing is deleted; no tables or columns are removed or renamed.

-- 1. Photos that already ran out are in their owner's Archive today. Mark
--    them as archived (dated when they ran out) so they stay there.
update public.profile_photos
set archived_at = activated_at + interval '30 days'
where archived_at is null and not pinned and activated_at <= now() - interval '30 days';

-- 2. A photo is on the profile if it hasn't been archived. (These replace
--    the versions with the 30-day rule; same names and inputs.)
create or replace function public.current_photo_count(person uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.profile_photos p
  where p.user_id = person and p.archived_at is null;
$$;

create or replace function public.pin_profile_photo(pid uuid, pin boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos set pinned = pin
  where id = pid and user_id = (select auth.uid()) and archived_at is null;
$$;

-- 3. Who can see a photo: the owner always; other people while it's on the
--    profile (not archived), unless one of you has blocked the other.
alter policy profile_photos_select on public.profile_photos
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or (archived_at is null and not public.is_blocked_between(user_id, (select auth.uid())))
  );

alter policy profile_photos_files_select on storage.objects
  using (
    bucket_id = 'profile-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_motive_admin()
      or exists (
        select 1 from public.profile_photos p
        where p.path = name and p.archived_at is null
          and not public.is_blocked_between(p.user_id, (select auth.uid()))
      )
    )
  );

-- ===================== 20261029000000_photo_order =====================
-- Item 14: people choose the order of their profile photos (the first is
-- shown first). Only adds a column and a function.
alter table public.profile_photos add column if not exists position integer;

-- Save a new order: the ids of your photos, first to last.
create or replace function public.reorder_profile_photos(ids uuid[])
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos p set position = o.i
  from unnest(ids) with ordinality as o(id, i)
  where p.id = o.id and p.user_id = (select auth.uid());
$$;

-- ===================== 20261030000000_profile_prompts =====================
-- Item 17: profile prompts (like Hinge) replace "About me". Each person
-- answers up to 3 questions from the app's list. The old "About me" text
-- (profiles.bio) is kept exactly as it is, just no longer shown.
-- Only adds a table and a function.

create table if not exists public.profile_prompts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  prompt_id  text not null check (char_length(prompt_id) between 1 and 40),
  answer     text not null check (char_length(answer) between 1 and 150),
  position   smallint not null check (position between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (user_id, prompt_id)
);

alter table public.profile_prompts enable row level security;

-- Logged-in people can read answers, unless one of you has blocked the other.
-- Changes go through save_profile_prompts() below.
drop policy if exists profile_prompts_select on public.profile_prompts;
create policy profile_prompts_select on public.profile_prompts for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or not public.is_blocked_between(user_id, (select auth.uid()))
  );

-- Save your answers (a list of up to 3 {prompt_id, answer}), replacing the
-- ones you had.
create or replace function public.save_profile_prompts(answers jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  if jsonb_typeof(answers) <> 'array' then raise exception 'Something went wrong. Please try again.'; end if;
  if jsonb_array_length(answers) > 3 then raise exception 'You can answer up to 3 prompts'; end if;
  delete from public.profile_prompts where user_id = uid;
  insert into public.profile_prompts (user_id, prompt_id, answer, position)
  select uid, a->>'prompt_id', trim(a->>'answer'), (n - 1)::smallint
  from jsonb_array_elements(answers) with ordinality as t(a, n);
end;
$$;
revoke execute on function public.save_profile_prompts(jsonb) from public, anon;
grant execute on function public.save_profile_prompts(jsonb) to authenticated;

-- ===================== 20261031000000_mark_payments_paid =====================
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

-- ===================== 20261101000000_table_waiting_lists =====================
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

-- ===================== 20261102000000_message_the_host =====================
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

