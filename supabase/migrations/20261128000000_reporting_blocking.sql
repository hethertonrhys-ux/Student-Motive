-- Reporting, blocking and removing content (safety, and an App Store
-- requirement for apps with things people post).
--
-- Builds on 20261127000000_chat_pins_admins.sql (run that first).
--
--   1. Reports. Messages (including photos, videos and shared events),
--      event listings, Social plans, profile photos and people can already
--      be reported (reports, social_reports, profile_photo_reports). Social
--      plan reports can now carry a note too.
--   2. Every new report is emailed to help@studentfunction.com: it's added
--      to email_queue here, and the send-email function (run every minute,
--      see RUN_ONCE_email_cron.sql) sends it with Resend. Nobody using the
--      app can read or write the queue.
--   3. Blocking works both ways, in the database:
--      - profile_cards hides each of you from the other, so neither can see
--        the other's profile or find them in search;
--      - in group chats neither sees the other's messages, isn't told about
--        them (pushes) and doesn't see them in the chat list's preview or
--        unread count;
--      (private chats already close: blocking unfriends you, and private
--      chats need friends). my_blocked_people() and unblock_user() are for
--      Settings → Privacy.
--   4. Bans: account_bans, set by Function admins only with
--      admin_set_ban(). A suspension (some days) or a ban (no end date)
--      stops the account logging in (Supabase Auth's banned_until) and logs
--      it out everywhere. admin_lift_ban() undoes it. Admins can't be banned
--      this way, and nobody can ban themselves.
--   5. Group chat admins (and Function admins) can delete messages in their
--      group chats. Function admins can open a reported chat photo or video.
--
-- Safe to run twice.

-- 1. A note on Social plan reports too, and reports can only be filed open.
alter table public.social_reports add column if not exists details text check (details is null or char_length(details) <= 2000);
drop policy if exists social_reports_insert on public.social_reports;
create policy social_reports_insert on public.social_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

-- 2. The email queue.
create table if not exists public.email_queue (
  id         bigserial primary key,
  to_address text not null,
  subject    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  error      text
);
alter table public.email_queue enable row level security;
revoke all on public.email_queue from anon, authenticated;

create or replace function public.report_email_address()
returns text language sql immutable set search_path = '' as $$ select 'help@studentfunction.com' $$;

-- Who someone is, for the team (name, email and id).
create or replace function public.report_person(uid uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(p.display_name, ''), 'Member') || coalesce(' <' || p.email || '>', '') || ' (id ' || p.id || ')' from public.profiles p where p.id = uid),
    'unknown (id ' || coalesce(uid::text, 'none') || ')');
$$;
revoke execute on function public.report_person(uuid) from public, anon, authenticated;

create or replace function public.queue_report_email(what text, reason text, details text, reporter uuid, subject_lines text, report_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.email_queue (to_address, subject, body)
  values (
    public.report_email_address(),
    left('[Function report] ' || what || ': ' || coalesce(reason, 'no reason'), 200),
    'A new report on Function. Please review it within 24 hours.' || chr(10) || chr(10)
      || 'What: ' || what || chr(10)
      || 'Reason: ' || coalesce(reason, '') || chr(10)
      || 'Note: ' || coalesce(nullif(details, ''), '(none)') || chr(10)
      || 'Reported by: ' || public.report_person(reporter) || chr(10)
      || 'When: ' || to_char(now() at time zone 'Europe/London', 'Dy DD Mon YYYY HH24:MI') || ' (London)' || chr(10) || chr(10)
      || subject_lines || chr(10) || chr(10)
      || 'Review and act on it in the admin panel: https://app.studentfunction.com/admin' || chr(10)
      || '(Report id ' || report_id || ')'
  );
end;
$$;
revoke execute on function public.queue_report_email(text, text, text, uuid, text, text) from public, anon, authenticated;

create or replace function public.email_on_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  what text;
  lines text := '';
  m record;
  e record;
begin
  if new.message_id is not null then
    select msg.*, t.event_id as t_event, t.social_event_id as t_social into m
      from public.messages msg join public.threads t on t.id = msg.thread_id where msg.id = new.message_id;
    what := case m.kind when 'photo' then 'a photo in a chat' when 'video' then 'a video in a chat' when 'event' then 'an event shared in a chat' else 'a chat message' end;
    lines := 'Sent by: ' || public.report_person(m.sender_id) || chr(10)
      || 'Content: ' || coalesce(m.body, '') || chr(10)
      || 'Chat: ' || case when m.t_event is not null or m.t_social is not null then 'a group chat' else 'a private chat' end || ' (id ' || m.thread_id || ')';
  elsif new.event_id is not null then
    select ev.title, ev.host_user_id, ev.society_id into e from public.events ev where ev.id = new.event_id;
    what := 'an event listing';
    lines := 'Event: ' || coalesce(e.title, '?') || ' — https://studentfunction.com/e/' || new.event_id || chr(10)
      || case when e.host_user_id is not null then 'Hosted by: ' || public.report_person(e.host_user_id) else 'Society event' end;
  elsif new.reported_user_id is not null then
    what := 'a person';
    lines := 'Person: ' || public.report_person(new.reported_user_id) || ' — https://studentfunction.com/u/' || new.reported_user_id;
  elsif new.society_id is not null then
    what := 'a society';
    lines := 'Society: ' || coalesce((select s.name from public.societies s where s.id = new.society_id), '?') || ' (id ' || new.society_id || ')';
  else
    what := 'something';
  end if;
  perform public.queue_report_email(what, new.reason, new.details, new.reporter_id, lines, new.id::text);
  return new;
end;
$$;
revoke execute on function public.email_on_report() from public, anon, authenticated;
drop trigger if exists reports_email on public.reports;
create trigger reports_email after insert on public.reports for each row execute function public.email_on_report();

create or replace function public.email_on_social_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
begin
  select se.title, se.host_id into s from public.social_events se where se.id = new.event_id;
  perform public.queue_report_email('a Social plan', new.reason, new.details, new.reporter_id,
    'Plan: ' || coalesce(s.title, '?') || ' — https://studentfunction.com/social/' || new.event_id || chr(10)
    || 'Hosted by: ' || public.report_person(s.host_id), new.id::text);
  return new;
end;
$$;
revoke execute on function public.email_on_social_report() from public, anon, authenticated;
drop trigger if exists social_reports_email on public.social_reports;
create trigger social_reports_email after insert on public.social_reports for each row execute function public.email_on_social_report();

create or replace function public.email_on_photo_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.queue_report_email('a profile photo', new.reason, null, new.reporter_id,
    'Photo of: ' || public.report_person((select p.user_id from public.profile_photos p where p.id = new.photo_id)) || chr(10)
    || 'Photo id: ' || new.photo_id, new.id::text);
  return new;
end;
$$;
revoke execute on function public.email_on_photo_report() from public, anon, authenticated;
drop trigger if exists profile_photo_reports_email on public.profile_photo_reports;
create trigger profile_photo_reports_email after insert on public.profile_photo_reports for each row execute function public.email_on_photo_report();

-- 3. Blocking, both ways.
-- profile_cards (20261111000000_profile_country.sql), without people either
-- of you has blocked.
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
  from public.profiles
  -- (The Function team still see everyone, so reports keep their names.)
  where (select auth.uid()) is null or public.is_motive_admin() or not public.is_blocked_between(id, (select auth.uid()));

-- Group chats: no messages from someone either of you has blocked.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using ((public.can_use_thread(thread_id) and (sender_id is null or not public.is_blocked_between(sender_id, (select auth.uid()))))
         or public.is_motive_admin());

-- The people you've blocked (names and photos), for Settings → Privacy.
create or replace function public.my_blocked_people()
returns table (user_id uuid, name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.blocked_id, coalesce(nullif(p.display_name, ''), 'Member'), p.avatar_url, b.created_at
  from public.user_blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;
revoke execute on function public.my_blocked_people() from public, anon;
grant execute on function public.my_blocked_people() to authenticated;

create or replace function public.unblock_user(target uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = target;
$$;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Did I block this person (not: did they block me)?
create or replace function public.i_blocked(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = target);
$$;
revoke execute on function public.i_blocked(uuid) from public, anon;
grant execute on function public.i_blocked(uuid) to authenticated;

-- 4. Bans and suspensions.
create table if not exists public.account_bans (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  until      timestamptz,             -- null: banned with no end date
  reason     text not null check (char_length(reason) between 1 and 500),
  banned_by  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.account_bans enable row level security;
revoke all on public.account_bans from anon, authenticated;
grant select on public.account_bans to authenticated;
drop policy if exists account_bans_admin_select on public.account_bans;
create policy account_bans_admin_select on public.account_bans for select to authenticated using (public.is_motive_admin());

-- days: how long (1 to 365), or null for a ban with no end date.
create or replace function public.admin_set_ban(target uuid, days integer, reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ends timestamptz := case when days is null then null else now() + make_interval(days => days) end;
begin
  if not public.is_motive_admin() then raise exception 'Only the Function team can do this'; end if;
  if target = auth.uid() then raise exception 'You can''t ban yourself'; end if;
  if exists (select 1 from public.profiles where id = target and is_admin) then raise exception 'Admins can''t be banned here'; end if;
  if days is not null and (days < 1 or days > 365) then raise exception 'Choose between 1 and 365 days'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Say why'; end if;
  insert into public.account_bans (user_id, until, reason, banned_by) values (target, ends, trim(reason), auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  -- Supabase Auth refuses to log in (or refresh) a banned account; log it out everywhere now.
  update auth.users set banned_until = coalesce(ends, 'infinity'::timestamptz) where id = target;
  if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using target; end if;
  if to_regclass('auth.refresh_tokens') is not null then execute 'delete from auth.refresh_tokens where user_id = $1::text' using target; end if;
end;
$$;
revoke execute on function public.admin_set_ban(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_ban(uuid, integer, text) to authenticated;

create or replace function public.admin_lift_ban(target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then raise exception 'Only the Function team can do this'; end if;
  delete from public.account_bans where user_id = target;
  update auth.users set banned_until = null where id = target;
end;
$$;
revoke execute on function public.admin_lift_ban(uuid) from public, anon;
grant execute on function public.admin_lift_ban(uuid) to authenticated;

-- The Function team can open a reported chat photo or video (to decide on it).
drop policy if exists chat_media_admin_select on storage.objects;
create policy chat_media_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.is_motive_admin());

-- 5. Deleting messages (20261127000000_chat_pins_admins.sql): group chat
--    admins can delete any message in their group chats.
create or replace function public.delete_message(mid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.messages set deleted_at = now(), body = '(deleted)', media_path = null
  where id = mid and deleted_at is null
    and (sender_id = (select auth.uid()) or public.is_motive_admin() or public.is_thread_admin(thread_id));
  if found then
    update public.threads set pinned_message_id = null, pinned_by = null, pinned_at = null where pinned_message_id = mid;
  end if;
end;
$$;

-- Pushes (20261127000000_chat_pins_admins.sql): none from someone either of you has blocked.
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
  if new.sender_id is null or new.kind in ('left', 'rejoined', 'removed') then return new; end if;
  if new.kind = 'event' then preview := left(regexp_replace(preview, ' https://\S+$', ''), 100); end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.event_id is null and t.social_event_id is null then
    perform public.queue_push(case when t.user_a = new.sender_id then t.user_b else t.user_a end, 'messages', who, preview, '/chats/' || t.id);
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
          and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft)
        union select a.user_id from public.society_admins a join public.events e on e.society_id = a.society_id where e.id = t.event_id
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

-- The chat list (20261127000000_chat_pins_admins.sql): blocked people's messages don't count or show.
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
            and m.kind not in ('left', 'rejoined', 'removed')
            and not public.is_blocked_between(m.sender_id, (select auth.uid()))
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
    where m.thread_id = t.id and (m.sender_id is null or not public.is_blocked_between(m.sender_id, (select auth.uid())))
    order by created_at desc limit 1
  ) lm on true
  where (e.id is null or e.ends_at > now() - interval '7 days')
    and (se.id is null or se.ends_at > now() - interval '7 days')
    and (e.id is null or not e.is_draft
         or (e.society_id is not null and public.is_society_committee(e.society_id))
         or e.host_user_id = (select auth.uid()))
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;
