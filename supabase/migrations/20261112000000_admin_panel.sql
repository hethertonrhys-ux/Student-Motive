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
