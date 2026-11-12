-- =====================================================================
-- Function TEST community roles and test messages. Paste into the SQL
-- Editor of the TEST project (function-staging) only, never the real
-- one. Run it AFTER 05-setup-communities.sql (and 90-test-accounts.sql).
--
-- The TEST project's web address contains pvldkzjrrhcnwctveemu.
-- If the address in your browser contains xrpbmcoptyrpgkdowfdt, that is
-- the REAL project: stop, and don't run anything.
--
-- It puts the test accounts into the UCL Abacus community, with these
-- nicknames, roles and memberships:
--   ada@staging.studentfunction.com               not in UCL Abacus (a Function admin sees it all anyway)
--   abacus-admin@staging.studentfunction.com      "Abby": admin, paying member (confirmed)
--   abacus-committee@staging.studentfunction.com  "Cole": committee, paying member (confirmed)
--   member-1@staging.studentfunction.com          "Mia": regular, paying member (confirmed)
--   member-2@staging.studentfunction.com          "Max": regular, paying member (confirmed)
--   member-3@staging.studentfunction.com          "Mo": regular, paying member (confirmed)
--   nonmember-1@staging.studentfunction.com       "Nina": regular, not a paying member
--   outsider@staging.studentfunction.com          not in UCL Abacus
--   pending-1@staging.studentfunction.com         "Penny": asked to join, ticked "paying member", waiting
-- Cole, Mia and Max are also in the AbaFam group.
--
-- Then it adds 130 test messages to the UCL Abacus chat, written by
-- Abby, Cole, Mia, Max, Mo and Nina over the last 4 days, numbered from
-- "Test message 001" (the oldest) to "Test message 130" (the newest), so a
-- missing or repeated message is easy to spot when scrolling back. Every
-- 20th one is longer. Messages 080, 081 and 082 have exactly the same
-- time, on purpose: the newest page of 50 ends at 081, so when you scroll
-- back the next page must start at 080 (until someone sends more). It also
-- adds 3 messages to the AbaFam chat.
--
-- Nobody gets a notification for any of this: notifications that the
-- test messages would queue (for anyone who has already logged in to the
-- test app on a phone) are taken off the queue again before this file
-- finishes, so they are never sent.
--
-- When it has worked you will see a small table: each test account's
-- place in UCL Abacus and how many test messages it wrote, and a last
-- row with the totals (the first time: 130 in the UCL Abacus chat and
-- 3 in AbaFam). Running it again is harmless: it adds nothing
-- twice, and it doesn't undo what testers changed in the app (someone
-- removed stays removed, a changed role or nickname stays changed,
-- someone who left and asked to join again stays waiting for an answer
-- in the app, and nobody is put back in AbaFam). So later runs show
-- bigger totals if testers have sent messages, and testers' changes.
--
-- Made by check/build_c5.py from code version 15ac248. Don't edit by hand.
-- =====================================================================

-- Safety check first. It changes nothing; it stops the whole paste (so
-- nothing at all is changed) if this isn't the test project, or if
-- 05-setup-communities.sql or 90-test-accounts.sql hasn't been run yet.
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
  -- 5. 05-setup-communities.sql must have been run first (it makes UCL Abacus).
  if to_regclass('public.community_members') is null then
    raise exception 'STOP: run 05-setup-communities.sql first (UCL Abacus is not here yet), then this file. Nothing was changed.';
  end if;
  if not exists (select 1 from public.communities where slug = 'ucl-abacus') then
    raise exception 'STOP: run 05-setup-communities.sql first (UCL Abacus is not here yet), then this file. Nothing was changed.';
  end if;
  -- 6. The test accounts must be here (90-test-accounts.sql).
  if (select count(distinct lower(email)) from public.profiles where lower(email) in ('ada@staging.studentfunction.com', 'abacus-admin@staging.studentfunction.com', 'abacus-committee@staging.studentfunction.com', 'member-1@staging.studentfunction.com', 'member-2@staging.studentfunction.com', 'member-3@staging.studentfunction.com', 'nonmember-1@staging.studentfunction.com', 'outsider@staging.studentfunction.com', 'pending-1@staging.studentfunction.com')) < 9 then
    raise exception 'STOP: run 90-test-accounts.sql first (some test accounts are missing; running it again is harmless), then this file. Nothing was changed.';
  end if;
end $$;

-- The rest is one block, so it can check each step as it goes.
do $$
declare
  cid uuid;
  main_tid uuid;
  sub_gid uuid;
  sub_tid uuid;
  ada uuid := (select p.id from public.profiles p where lower(p.email) = 'ada@staging.studentfunction.com');
  r record;
  mem record;
  uid uuid;
  nick text;
  asked timestamptz;
  decider uuid;
  confirmer uuid;
  adder uuid;
  set_up uuid[] := '{}';
  ran_before boolean;
  n integer;
begin
  -- Lock UCL Abacus, as the app's own community functions do, so nobody
  -- changes it while this runs.
  select c.id into cid from public.communities c where c.slug = 'ucl-abacus' for update;
  select t.id into main_tid from public.community_groups g join public.threads t on t.community_group_id = g.id
  where g.community_id = cid and g.kind = 'main';
  select g.id, t.id into sub_gid, sub_tid from public.community_groups g join public.threads t on t.community_group_id = g.id
  where g.community_id = cid and g.kind = 'sub' and lower(g.name) = lower('AbaFam') and g.archived_at is null
  order by g.created_at limit 1;
  if main_tid is null then raise exception 'UCL Abacus has no main chat: run 05-setup-communities.sql again'; end if;
  -- Has this file been run here before? Every message it writes has a
  -- fixed id in the range below (the app never makes one there), and a
  -- message only goes away with its whole chat (deleting one in the app
  -- only blanks it), so if any of them is here, it has.
  select exists (select 1 from public.messages x
                 where x.id between '57a9e000-0000-4000-c000-000000000000' and '57a9e000-0000-4000-d000-ffffffffffff')
  into ran_before;
  raise notice 'This file has been run here before: %', ran_before;

  -- 1. Places in the community. Someone with no row yet gets one, the way
  --    the app makes it (a request, then the decision): their nickname must
  --    pass the app's nickname rules and be free (if a tester already took
  --    it, they get the one the database picks for them instead). The FIRST
  --    time this file runs here, someone who asked to join in the app and is
  --    still waiting is approved as a UCL Abacus admin would. Anyone else (in
  --    already, removed, left, declined, and on later runs also waiting:
  --    that request is a tester's, for someone to answer in the app) is
  --    left as they are. Putting someone in (status 'active') adds them to
  --    the UCL Abacus chat through the database's own trigger.
  for r in
    select * from (values
      (1, 'abacus-admin@staging.studentfunction.com', 'Abby', 'admin', 'member', 'active', false, 'ada@staging.studentfunction.com', 'ada@staging.studentfunction.com', 8640),
      (2, 'abacus-committee@staging.studentfunction.com', 'Cole', 'committee', 'member', 'active', true, 'abacus-admin@staging.studentfunction.com', 'abacus-admin@staging.studentfunction.com', 8496),
      (3, 'member-1@staging.studentfunction.com', 'Mia', 'regular', 'member', 'active', true, 'abacus-admin@staging.studentfunction.com', 'abacus-admin@staging.studentfunction.com', 8352),
      (4, 'member-2@staging.studentfunction.com', 'Max', 'regular', 'member', 'active', true, 'abacus-admin@staging.studentfunction.com', 'abacus-admin@staging.studentfunction.com', 8208),
      (5, 'member-3@staging.studentfunction.com', 'Mo', 'regular', 'member', 'active', true, 'abacus-admin@staging.studentfunction.com', 'abacus-admin@staging.studentfunction.com', 8063),
      (6, 'nonmember-1@staging.studentfunction.com', 'Nina', 'regular', 'non_member', 'active', false, 'abacus-committee@staging.studentfunction.com', null, 7920),
      (7, 'pending-1@staging.studentfunction.com', 'Penny', 'regular', 'non_member', 'pending', true, null, null, 1440)
    ) as v(ord, email, nickname, role, membership, status, claimed, decided_by, confirmed_by, asked_mins)
    order by ord
  loop
    select p.id into uid from public.profiles p where lower(p.email) = r.email;
    asked := now() - make_interval(mins => r.asked_mins);
    -- Who decides: an active admin or committee (an admin to confirm a
    -- paying member), else the Function team (ada).
    decider := coalesce((select m.user_id from public.community_members m join public.profiles p on p.id = m.user_id
                         where m.community_id = cid and lower(p.email) = r.decided_by and m.user_id <> uid
                           and m.status = 'active' and m.role in ('admin', 'committee')), ada);
    confirmer := case when r.membership = 'member' then
                   coalesce((select m.user_id from public.community_members m join public.profiles p on p.id = m.user_id
                             where m.community_id = cid and lower(p.email) = r.confirmed_by and m.user_id <> uid
                               and m.status = 'active' and m.role = 'admin'), ada) end;
    select * into mem from public.community_members m where m.community_id = cid and m.user_id = uid for update;
    if not found then
      nick := public.clean_community_nickname(r.nickname);
      if public.community_nickname_taken(cid, nick, uid) then
        nick := public.community_default_nickname(cid, uid);
      end if;
      insert into public.community_members (community_id, user_id, nickname, role, membership, membership_claimed, status,
                                            requested_at, decided_by, decided_at, membership_confirmed_by, membership_confirmed_at)
      values (cid, uid, nick, r.role, r.membership, r.claimed, r.status, asked,
              case when r.status = 'active' then decider end,
              case when r.status = 'active' then asked + interval '30 minutes' end,
              confirmer, case when confirmer is not null then asked + interval '30 minutes' end);
      set_up := set_up || uid;
    elsif mem.status = 'pending' and r.status = 'active' and not ran_before then
      update public.community_members
      set status = 'active', role = r.role, membership = r.membership,
          decided_by = decider, decided_at = now(), membership_confirmed_by = confirmer,
          membership_confirmed_at = case when confirmer is not null then now() end
      where community_id = cid and user_id = uid;
      set_up := set_up || uid;
    else
      raise notice '% already has a place in UCL Abacus (%, %, %): left as it is', r.email, mem.status, mem.role, mem.membership;
    end if;
  end loop;

  -- 2. AbaFam: Cole (committee) adds himself and then the others, as the
  --    app's "add to group" does: each needs to be active in UCL Abacus, it's
  --    shown in the group's chat ("joined the group", "added ..."), and
  --    adding someone puts them in the group's chat (the database's trigger).
  --    Only for accounts given their place just now, and only once each:
  --    each one's note has a fixed id, so if it's there already they were
  --    added before (and have left AbaFam or UCL Abacus since, or their
  --    account was deleted and made again): they aren't put back.
  if sub_gid is null then
    raise notice 'No AbaFam group (renamed or archived?): nobody was added to it';
  else
    select m.user_id into adder from public.community_members m join public.profiles p on p.id = m.user_id
    where m.community_id = cid and lower(p.email) = 'abacus-committee@staging.studentfunction.com' and m.status = 'active' and m.role in ('admin', 'committee');
    for r in
      select * from (values
      (1, 'abacus-committee@staging.studentfunction.com', '57a9e000-0000-4000-d000-000000000101'::uuid, 5040),
      (2, 'member-1@staging.studentfunction.com', '57a9e000-0000-4000-d000-000000000102'::uuid, 5039),
      (3, 'member-2@staging.studentfunction.com', '57a9e000-0000-4000-d000-000000000103'::uuid, 5038)
      ) as v(ord, email, note_id, mins)
      order by ord
    loop
      select m.user_id, m.nickname into uid, nick from public.community_members m join public.profiles p on p.id = m.user_id
      where m.community_id = cid and lower(p.email) = r.email and m.status = 'active';
      continue when uid is null or not (uid = any (set_up));
      if exists (select 1 from public.messages x where x.id = r.note_id) then
        raise notice '% was not put back in AbaFam: added once before', r.email;
        continue;
      end if;
      if adder is null then
        raise notice '% was not added to AbaFam: abacus-committee@staging.studentfunction.com is not on the committee', r.email;
        continue;
      end if;
      insert into public.community_group_members (group_id, user_id, added_by, added_at)
      values (sub_gid, uid, adder, now() - make_interval(mins => r.mins))
      on conflict do nothing;
      continue when not found;
      insert into public.messages (id, thread_id, sender_id, body, kind, subject_user_id, created_at)
      values (r.note_id, sub_tid, adder,
              case when uid = adder then 'joined the group' else left('added ' || nick, 2000) end,
              case when uid = adder then 'joined' else 'added' end,
              case when uid = adder then null else uid end,
              now() - make_interval(mins => r.mins))
      on conflict (id) do nothing;
    end loop;
  end if;

  -- 3. The test messages. Each one is only added if its writer is in that
  --    chat (as the app requires), and only once (each has its own id).
  insert into public.messages (id, thread_id, sender_id, body, kind, created_at)
  select v.id, main_tid, p.id, v.body, 'message', now() - make_interval(mins => v.mins)
  from (values
    ('57a9e000-0000-4000-c000-000000000001'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 001', 5729),
    ('57a9e000-0000-4000-c000-000000000002'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 002', 5727),
    ('57a9e000-0000-4000-c000-000000000003'::uuid, 'member-1@staging.studentfunction.com', 'Test message 003', 5717),
    ('57a9e000-0000-4000-c000-000000000004'::uuid, 'member-1@staging.studentfunction.com', 'Test message 004', 5714),
    ('57a9e000-0000-4000-c000-000000000005'::uuid, 'member-1@staging.studentfunction.com', 'Test message 005', 5713),
    ('57a9e000-0000-4000-c000-000000000006'::uuid, 'member-1@staging.studentfunction.com', 'Test message 006', 5698),
    ('57a9e000-0000-4000-c000-000000000007'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 007', 5696),
    ('57a9e000-0000-4000-c000-000000000008'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 008', 5688),
    ('57a9e000-0000-4000-c000-000000000009'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 009', 5686),
    ('57a9e000-0000-4000-c000-000000000010'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 010', 5678),
    ('57a9e000-0000-4000-c000-000000000011'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 011', 5676),
    ('57a9e000-0000-4000-c000-000000000012'::uuid, 'member-1@staging.studentfunction.com', 'Test message 012', 5675),
    ('57a9e000-0000-4000-c000-000000000013'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 013', 5672),
    ('57a9e000-0000-4000-c000-000000000014'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 014', 5666),
    ('57a9e000-0000-4000-c000-000000000015'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 015', 5658),
    ('57a9e000-0000-4000-c000-000000000016'::uuid, 'member-1@staging.studentfunction.com', 'Test message 016', 5657),
    ('57a9e000-0000-4000-c000-000000000017'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 017', 5632),
    ('57a9e000-0000-4000-c000-000000000018'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 018', 5628),
    ('57a9e000-0000-4000-c000-000000000019'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 019', 5616),
    ('57a9e000-0000-4000-c000-000000000020'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 020: a longer one, to check that a long message wraps neatly onto several lines in the chat and is shortened properly in the chat list.', 5614),
    ('57a9e000-0000-4000-c000-000000000021'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 021', 5612),
    ('57a9e000-0000-4000-c000-000000000022'::uuid, 'member-2@staging.studentfunction.com', 'Test message 022', 5611),
    ('57a9e000-0000-4000-c000-000000000023'::uuid, 'member-1@staging.studentfunction.com', 'Test message 023', 5603),
    ('57a9e000-0000-4000-c000-000000000024'::uuid, 'member-2@staging.studentfunction.com', 'Test message 024', 5602),
    ('57a9e000-0000-4000-c000-000000000025'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 025', 5590),
    ('57a9e000-0000-4000-c000-000000000026'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 026', 5586),
    ('57a9e000-0000-4000-c000-000000000027'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 027', 5583),
    ('57a9e000-0000-4000-c000-000000000028'::uuid, 'member-2@staging.studentfunction.com', 'Test message 028', 5571),
    ('57a9e000-0000-4000-c000-000000000029'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 029', 5559),
    ('57a9e000-0000-4000-c000-000000000030'::uuid, 'member-1@staging.studentfunction.com', 'Test message 030', 5555),
    ('57a9e000-0000-4000-c000-000000000031'::uuid, 'member-1@staging.studentfunction.com', 'Test message 031', 4228),
    ('57a9e000-0000-4000-c000-000000000032'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 032', 4222),
    ('57a9e000-0000-4000-c000-000000000033'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 033', 4217),
    ('57a9e000-0000-4000-c000-000000000034'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 034', 4215),
    ('57a9e000-0000-4000-c000-000000000035'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 035', 4209),
    ('57a9e000-0000-4000-c000-000000000036'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 036', 4197),
    ('57a9e000-0000-4000-c000-000000000037'::uuid, 'member-3@staging.studentfunction.com', 'Test message 037', 4189),
    ('57a9e000-0000-4000-c000-000000000038'::uuid, 'member-3@staging.studentfunction.com', 'Test message 038', 4186),
    ('57a9e000-0000-4000-c000-000000000039'::uuid, 'member-3@staging.studentfunction.com', 'Test message 039', 4181),
    ('57a9e000-0000-4000-c000-000000000040'::uuid, 'member-2@staging.studentfunction.com', 'Test message 040: a longer one, to check that a long message wraps neatly onto several lines in the chat and is shortened properly in the chat list.', 4180),
    ('57a9e000-0000-4000-c000-000000000041'::uuid, 'member-2@staging.studentfunction.com', 'Test message 041', 4175),
    ('57a9e000-0000-4000-c000-000000000042'::uuid, 'member-2@staging.studentfunction.com', 'Test message 042', 4167),
    ('57a9e000-0000-4000-c000-000000000043'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 043', 4155),
    ('57a9e000-0000-4000-c000-000000000044'::uuid, 'member-2@staging.studentfunction.com', 'Test message 044', 4143),
    ('57a9e000-0000-4000-c000-000000000045'::uuid, 'member-1@staging.studentfunction.com', 'Test message 045', 4133),
    ('57a9e000-0000-4000-c000-000000000046'::uuid, 'member-3@staging.studentfunction.com', 'Test message 046', 4108),
    ('57a9e000-0000-4000-c000-000000000047'::uuid, 'member-2@staging.studentfunction.com', 'Test message 047', 4106),
    ('57a9e000-0000-4000-c000-000000000048'::uuid, 'member-1@staging.studentfunction.com', 'Test message 048', 4101),
    ('57a9e000-0000-4000-c000-000000000049'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 049', 4095),
    ('57a9e000-0000-4000-c000-000000000050'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 050', 4093),
    ('57a9e000-0000-4000-c000-000000000051'::uuid, 'member-2@staging.studentfunction.com', 'Test message 051', 4089),
    ('57a9e000-0000-4000-c000-000000000052'::uuid, 'member-2@staging.studentfunction.com', 'Test message 052', 3647),
    ('57a9e000-0000-4000-c000-000000000053'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 053', 3645),
    ('57a9e000-0000-4000-c000-000000000054'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 054', 3642),
    ('57a9e000-0000-4000-c000-000000000055'::uuid, 'member-1@staging.studentfunction.com', 'Test message 055', 3622),
    ('57a9e000-0000-4000-c000-000000000056'::uuid, 'member-2@staging.studentfunction.com', 'Test message 056', 3616),
    ('57a9e000-0000-4000-c000-000000000057'::uuid, 'member-2@staging.studentfunction.com', 'Test message 057', 3610),
    ('57a9e000-0000-4000-c000-000000000058'::uuid, 'member-1@staging.studentfunction.com', 'Test message 058', 3608),
    ('57a9e000-0000-4000-c000-000000000059'::uuid, 'member-1@staging.studentfunction.com', 'Test message 059', 3603),
    ('57a9e000-0000-4000-c000-000000000060'::uuid, 'member-1@staging.studentfunction.com', 'Test message 060: a longer one, to check that a long message wraps neatly onto several lines in the chat and is shortened properly in the chat list.', 3599),
    ('57a9e000-0000-4000-c000-000000000061'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 061', 3597),
    ('57a9e000-0000-4000-c000-000000000062'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 062', 3596),
    ('57a9e000-0000-4000-c000-000000000063'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 063', 3595),
    ('57a9e000-0000-4000-c000-000000000064'::uuid, 'member-3@staging.studentfunction.com', 'Test message 064', 3570),
    ('57a9e000-0000-4000-c000-000000000065'::uuid, 'member-3@staging.studentfunction.com', 'Test message 065', 3555),
    ('57a9e000-0000-4000-c000-000000000066'::uuid, 'member-3@staging.studentfunction.com', 'Test message 066', 3552),
    ('57a9e000-0000-4000-c000-000000000067'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 067', 3549),
    ('57a9e000-0000-4000-c000-000000000068'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 068', 3544),
    ('57a9e000-0000-4000-c000-000000000069'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 069', 3540),
    ('57a9e000-0000-4000-c000-000000000070'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 070', 3535),
    ('57a9e000-0000-4000-c000-000000000071'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 071', 2208),
    ('57a9e000-0000-4000-c000-000000000072'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 072', 2198),
    ('57a9e000-0000-4000-c000-000000000073'::uuid, 'member-1@staging.studentfunction.com', 'Test message 073', 2178),
    ('57a9e000-0000-4000-c000-000000000074'::uuid, 'member-1@staging.studentfunction.com', 'Test message 074', 2172),
    ('57a9e000-0000-4000-c000-000000000075'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 075', 2169),
    ('57a9e000-0000-4000-c000-000000000076'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 076', 2149),
    ('57a9e000-0000-4000-c000-000000000077'::uuid, 'member-2@staging.studentfunction.com', 'Test message 077', 2146),
    ('57a9e000-0000-4000-c000-000000000078'::uuid, 'member-2@staging.studentfunction.com', 'Test message 078', 2140),
    ('57a9e000-0000-4000-c000-000000000079'::uuid, 'member-2@staging.studentfunction.com', 'Test message 079', 2138),
    ('57a9e000-0000-4000-c000-000000000080'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 080: a longer one, to check that a long message wraps neatly onto several lines in the chat and is shortened properly in the chat list.', 2135),
    ('57a9e000-0000-4000-c000-000000000081'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 081', 2135),
    ('57a9e000-0000-4000-c000-000000000082'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 082', 2135),
    ('57a9e000-0000-4000-c000-000000000083'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 083', 2129),
    ('57a9e000-0000-4000-c000-000000000084'::uuid, 'member-1@staging.studentfunction.com', 'Test message 084', 2109),
    ('57a9e000-0000-4000-c000-000000000085'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 085', 2108),
    ('57a9e000-0000-4000-c000-000000000086'::uuid, 'member-1@staging.studentfunction.com', 'Test message 086', 2103),
    ('57a9e000-0000-4000-c000-000000000087'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 087', 2101),
    ('57a9e000-0000-4000-c000-000000000088'::uuid, 'member-3@staging.studentfunction.com', 'Test message 088', 2095),
    ('57a9e000-0000-4000-c000-000000000089'::uuid, 'member-3@staging.studentfunction.com', 'Test message 089', 2092),
    ('57a9e000-0000-4000-c000-000000000090'::uuid, 'member-1@staging.studentfunction.com', 'Test message 090', 2090),
    ('57a9e000-0000-4000-c000-000000000091'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 091', 2078),
    ('57a9e000-0000-4000-c000-000000000092'::uuid, 'member-3@staging.studentfunction.com', 'Test message 092', 1636),
    ('57a9e000-0000-4000-c000-000000000093'::uuid, 'member-2@staging.studentfunction.com', 'Test message 093', 1631),
    ('57a9e000-0000-4000-c000-000000000094'::uuid, 'member-3@staging.studentfunction.com', 'Test message 094', 1623),
    ('57a9e000-0000-4000-c000-000000000095'::uuid, 'member-3@staging.studentfunction.com', 'Test message 095', 1608),
    ('57a9e000-0000-4000-c000-000000000096'::uuid, 'member-3@staging.studentfunction.com', 'Test message 096', 1588),
    ('57a9e000-0000-4000-c000-000000000097'::uuid, 'member-3@staging.studentfunction.com', 'Test message 097', 1573),
    ('57a9e000-0000-4000-c000-000000000098'::uuid, 'member-2@staging.studentfunction.com', 'Test message 098', 1572),
    ('57a9e000-0000-4000-c000-000000000099'::uuid, 'member-1@staging.studentfunction.com', 'Test message 099', 1571),
    ('57a9e000-0000-4000-c000-000000000100'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 100: a longer one, to check that a long message wraps neatly onto several lines in the chat and is shortened properly in the chat list.', 1546),
    ('57a9e000-0000-4000-c000-000000000101'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 101', 1545),
    ('57a9e000-0000-4000-c000-000000000102'::uuid, 'member-1@staging.studentfunction.com', 'Test message 102', 1537),
    ('57a9e000-0000-4000-c000-000000000103'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 103', 1533),
    ('57a9e000-0000-4000-c000-000000000104'::uuid, 'member-2@staging.studentfunction.com', 'Test message 104', 1531),
    ('57a9e000-0000-4000-c000-000000000105'::uuid, 'member-2@staging.studentfunction.com', 'Test message 105', 1523),
    ('57a9e000-0000-4000-c000-000000000106'::uuid, 'member-1@staging.studentfunction.com', 'Test message 106', 196),
    ('57a9e000-0000-4000-c000-000000000107'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 107', 188),
    ('57a9e000-0000-4000-c000-000000000108'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 108', 187),
    ('57a9e000-0000-4000-c000-000000000109'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 109', 172),
    ('57a9e000-0000-4000-c000-000000000110'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 110', 160),
    ('57a9e000-0000-4000-c000-000000000111'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 111', 154),
    ('57a9e000-0000-4000-c000-000000000112'::uuid, 'member-2@staging.studentfunction.com', 'Test message 112', 144),
    ('57a9e000-0000-4000-c000-000000000113'::uuid, 'member-2@staging.studentfunction.com', 'Test message 113', 124),
    ('57a9e000-0000-4000-c000-000000000114'::uuid, 'member-2@staging.studentfunction.com', 'Test message 114', 122),
    ('57a9e000-0000-4000-c000-000000000115'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 115', 120),
    ('57a9e000-0000-4000-c000-000000000116'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 116', 108),
    ('57a9e000-0000-4000-c000-000000000117'::uuid, 'member-1@staging.studentfunction.com', 'Test message 117', 103),
    ('57a9e000-0000-4000-c000-000000000118'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 118', 99),
    ('57a9e000-0000-4000-c000-000000000119'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 119', 98),
    ('57a9e000-0000-4000-c000-000000000120'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 120: a longer one, to check that a long message wraps neatly onto several lines in the chat and is shortened properly in the chat list.', 78),
    ('57a9e000-0000-4000-c000-000000000121'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 121', 76),
    ('57a9e000-0000-4000-c000-000000000122'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 122', 71),
    ('57a9e000-0000-4000-c000-000000000123'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 123', 59),
    ('57a9e000-0000-4000-c000-000000000124'::uuid, 'abacus-committee@staging.studentfunction.com', 'Test message 124', 53),
    ('57a9e000-0000-4000-c000-000000000125'::uuid, 'member-1@staging.studentfunction.com', 'Test message 125', 51),
    ('57a9e000-0000-4000-c000-000000000126'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 126', 43),
    ('57a9e000-0000-4000-c000-000000000127'::uuid, 'member-1@staging.studentfunction.com', 'Test message 127', 18),
    ('57a9e000-0000-4000-c000-000000000128'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 128', 16),
    ('57a9e000-0000-4000-c000-000000000129'::uuid, 'abacus-admin@staging.studentfunction.com', 'Test message 129', 11),
    ('57a9e000-0000-4000-c000-000000000130'::uuid, 'nonmember-1@staging.studentfunction.com', 'Test message 130', 7)
  ) as v(id, email, body, mins)
  join public.profiles p on lower(p.email) = v.email
  where exists (select 1 from public.thread_participants tp where tp.thread_id = main_tid and tp.user_id = p.id)
  order by v.mins desc, v.id
  on conflict (id) do nothing;
  if sub_tid is not null then
    insert into public.messages (id, thread_id, sender_id, body, kind, created_at)
    select v.id, sub_tid, p.id, v.body, 'message', now() - make_interval(mins => v.mins)
    from (values
    ('57a9e000-0000-4000-d000-000000000001'::uuid, 'abacus-committee@staging.studentfunction.com', 'AbaFam test message 1 of 3', 3000),
    ('57a9e000-0000-4000-d000-000000000002'::uuid, 'member-1@staging.studentfunction.com', 'AbaFam test message 2 of 3', 1500),
    ('57a9e000-0000-4000-d000-000000000003'::uuid, 'member-2@staging.studentfunction.com', 'AbaFam test message 3 of 3', 200)
    ) as v(id, email, body, mins)
    join public.profiles p on lower(p.email) = v.email
    where exists (select 1 from public.thread_participants tp where tp.thread_id = sub_tid and tp.user_id = p.id)
    order by v.mins desc, v.id
    on conflict (id) do nothing;
  end if;
  update public.threads t
  set last_message_at = greatest(t.last_message_at, (select max(m.created_at) from public.messages m where m.thread_id = t.id))
  where t.id in (main_tid, sub_tid);

  -- 4. No notifications: take off the queue anything the lines above put
  --    on it for these chats (nothing outside this paste ever saw it, and
  --    nothing is sent until the paste has finished).
  delete from public.push_queue q
  where q.sent_at is null and q.created_at = now()
    and q.url in ('/chats/' || main_tid, '/chats/' || coalesce(sub_tid, main_tid));
  get diagnostics n = row_count;
  raise notice 'Notifications taken off the queue (never sent): %', n;
end $$;

-- 5. What's there now: each test account's place in UCL Abacus, then the totals.
with c as (
  select id from public.communities where slug = 'ucl-abacus'
), chats as (
  select g.kind, g.name, g.id as group_id, t.id as thread_id
  from public.community_groups g join public.threads t on t.community_group_id = g.id join c on c.id = g.community_id
  where g.archived_at is null and (g.kind = 'main' or lower(g.name) = lower('AbaFam'))
), accounts as (
  select v.ord, v.email, p.id from (values
    (1, 'ada@staging.studentfunction.com'),
    (2, 'abacus-admin@staging.studentfunction.com'),
    (3, 'abacus-committee@staging.studentfunction.com'),
    (4, 'member-1@staging.studentfunction.com'),
    (5, 'member-2@staging.studentfunction.com'),
    (6, 'member-3@staging.studentfunction.com'),
    (7, 'nonmember-1@staging.studentfunction.com'),
    (8, 'outsider@staging.studentfunction.com'),
    (9, 'pending-1@staging.studentfunction.com')
  ) as v(ord, email) join public.profiles p on lower(p.email) = v.email
)
select test_account, nickname, role, membership, status, says_paying_member, groups, main_chat_messages, abafam_messages
from (
  select a.ord, a.email as test_account,
         coalesce(m.nickname, '-') as nickname, coalesce(m.role, '-') as role, coalesce(m.membership, '-') as membership,
         coalesce(m.status, 'not in UCL Abacus') as status, coalesce(m.membership_claimed::text, '-') as says_paying_member,
         coalesce((select string_agg(case when ch.kind = 'main' then 'UCL Abacus' else ch.name end, ', ' order by ch.kind)
                   from chats ch
                   where (ch.kind = 'main' and m.status = 'active')
                      or exists (select 1 from public.community_group_members gm where gm.group_id = ch.group_id and gm.user_id = a.id)), '-') as groups,
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id
          where ch.kind = 'main' and x.sender_id = a.id and x.kind = 'message') as main_chat_messages,
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id
          where ch.kind = 'sub' and x.sender_id = a.id and x.kind = 'message') as abafam_messages
  from accounts a
  left join public.community_members m on m.community_id = (select id from c) and m.user_id = a.id
  union all
  select 99, 'TOTAL (everyone)', '', '', '', '', '', '',
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id where ch.kind = 'main' and x.kind = 'message'),
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id where ch.kind = 'sub' and x.kind = 'message')
) x
order by ord;
