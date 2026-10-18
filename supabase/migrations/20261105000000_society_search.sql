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
