-- Instant claim links (Part 2 of the Society Hub). A Function admin makes a
-- one-off link for a society and sends it to the committee (usually in an
-- Instagram DM). Whoever opens it while logged in becomes a manager of that
-- one society straight away, with no request to approve.
--
-- The link's secret is 64 random characters made inside the database. Only
-- its SHA-256 hash is stored, so a leaked copy of the database can't be used
-- to claim a society. The secret is returned once, to the admin who made it,
-- and never stored or logged.
--
-- Only adds things (a table and four functions), and is safe to run more
-- than once. The existing "Claim this page" request flow is unchanged.

-- 1. The links. Only Function admins can read them, and nobody writes to
--    the table directly: every change goes through the functions below.
create table if not exists public.society_claim_links (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists society_claim_links_society_idx on public.society_claim_links (society_id);
alter table public.society_claim_links enable row level security;

drop policy if exists society_claim_links_select_admin on public.society_claim_links;
create policy society_claim_links_select_admin on public.society_claim_links
  for select to authenticated using (public.is_motive_admin());

revoke all on table public.society_claim_links from public, anon, authenticated;
-- Admins read everything but the hash, which nothing in the app needs.
grant select (id, society_id, created_by, created_at, expires_at, used_by, used_at, revoked_at)
  on public.society_claim_links to authenticated;

-- 2. Make a link (Function admins only). Returns the new link's id and its
--    secret, once. It works for 7 days and only once.
create or replace function public.create_society_claim_link(sid uuid)
returns table (id uuid, token text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  secret text;
  new_id uuid;
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  if sid is null or not exists (select 1 from public.societies s where s.id = sid) then
    raise exception 'Society not found';
  end if;
  -- 64 lowercase hex characters from two random UUIDs (core Postgres, no
  -- extension needed).
  secret := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
         || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  insert into public.society_claim_links (society_id, token_hash, created_by, expires_at)
  values (sid, pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(secret, 'UTF8')), 'hex'), auth.uid(), now() + interval '7 days')
  returning public.society_claim_links.id into new_id;
  return query select new_id, secret;
end;
$$;
revoke execute on function public.create_society_claim_link(uuid) from public, anon;
grant execute on function public.create_society_claim_link(uuid) to authenticated;

-- 3. What a link is for, and whether it still works. Anyone can ask, even
--    logged out (the claim page shows the society before you log in).
--    status: 'ready', 'used', 'used_by_you' (you used it), 'expired',
--    'revoked' or 'unknown' (a malformed secret, or no such link). It never
--    says who used a link.
create or replace function public.claim_link_info(token text)
returns table (status text, society_id uuid, society_name text, society_slug text, logo_url text, university text, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.society_claim_links%rowtype;
begin
  if token is null or token !~ '^[0-9a-f]{64}$' then
    return query select 'unknown'::text, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  select c.* into l from public.society_claim_links c
  where c.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex');
  if not found then
    return query select 'unknown'::text, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  return query
  select case
           when l.revoked_at is not null then 'revoked'
           when l.used_at is not null and l.used_by = auth.uid() then 'used_by_you'
           when l.used_at is not null then 'used'
           when l.expires_at <= now() then 'expired'
           else 'ready'
         end::text,
         s.id, s.name, s.slug, s.logo_url, s.university, l.expires_at
  from public.societies s
  where s.id = l.society_id;
end;
$$;
revoke execute on function public.claim_link_info(text) from public, anon;
grant execute on function public.claim_link_info(text) to anon, authenticated;

-- 4. Use a link: in one step, mark it used (by whom, when) and make the
--    person a manager of that one society. A second use by someone else
--    fails; the same person using it again (e.g. refreshing the page) just
--    gets the society back.
--    There is deliberately no same-uni check: a Function admin chose who
--    to send the link to. It never writes to profiles, so it can never
--    change who is a Function admin.
create or replace function public.redeem_society_claim_link(token text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l public.society_claim_links%rowtype;
begin
  if me is null then
    raise exception 'Log in first';
  end if;
  if token is null or token !~ '^[0-9a-f]{64}$' then
    raise exception 'This link isn''t valid';
  end if;
  -- Lock the link so two people opening it at once can't both claim it.
  select c.* into l from public.society_claim_links c
  where c.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex')
  for update;
  if not found then
    raise exception 'This link isn''t valid';
  end if;
  if l.revoked_at is not null then
    raise exception 'This link has been cancelled';
  end if;
  if l.used_at is not null then
    if l.used_by = me then
      return l.society_id;
    end if;
    raise exception 'This link has already been used';
  end if;
  if l.expires_at <= now() then
    raise exception 'This link has expired';
  end if;

  update public.society_claim_links c set used_by = me, used_at = now() where c.id = l.id;
  insert into public.society_admins (society_id, user_id) values (l.society_id, me)
  on conflict do nothing;
  -- A "Claim this page" request they had already sent is now done.
  update public.society_claims c set status = 'approved', reviewed_at = now()
  where c.society_id = l.society_id and c.user_id = me and c.status = 'pending';
  return l.society_id;
end;
$$;
revoke execute on function public.redeem_society_claim_link(text) from public, anon;
grant execute on function public.redeem_society_claim_link(text) to authenticated;

-- 5. Cancel a link that hasn't been used (Function admins only).
create or replace function public.revoke_society_claim_link(link_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  update public.society_claim_links c set revoked_at = now()
  where c.id = link_id and c.used_at is null and c.revoked_at is null;
end;
$$;
revoke execute on function public.revoke_society_claim_link(uuid) from public, anon;
grant execute on function public.revoke_society_claim_link(uuid) to authenticated;
