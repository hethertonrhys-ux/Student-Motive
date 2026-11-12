#!/usr/bin/env python3
"""Builds the communities step for the Function TEST Supabase project
(function-staging, project ref pvldkzjrrhcnwctveemu), on top of the files
check/build.py made (parts 1-4 and 90-test-accounts.sql, already pasted).

Writes, into the staging folder (the parent of this check/ folder):
  05-setup-communities.sql       every migration newer than the ones in parts
      1-4 (today: 20261202000000_communities.sql), verbatim, behind a
      "-- ===== <file> =====" banner, after the same header and safety check
      as the other parts. Unlike parts 1-4 it does NOT stop when it has
      already been run, because the migration is made to be re-run (so a
      newer version can be pasted over it); check/prove_c5.sh proves that.
  91-test-community-roles.sql    the test accounts' places in UCL Abacus
      (roles, memberships, AbaFam) and ~130 numbered test messages.
  README.txt                     build.py's README with the steps for 05 and 91.

It reads the app's files from a COMMIT of the repo (git show <rev>:<path>),
never from the working tree, so another build editing the repo can't leak
half-finished changes in. Re-run it after the migration changes, e.g.
  python3 -I build_c5.py --rev cfe52c2
  python3 -I build_c5.py --rev HEAD
then bash prove_c5.sh (with PREV_REV=<the code version in the 05 last
pasted> to also prove pasting the new 05 over the old one). If build.py is
run again (it rewrites README.txt), run this again afterwards. It needs no
database and never connects to Supabase.
"""
import argparse
import os
import random
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # build.py, next to this file (python3 -I leaves it off the path)
import build as B  # noqa: E402

PASTED_CUTOFF = "20261201000000"  # the newest migration in parts 1-4 (already pasted)
PART5_FILE = "05-setup-communities.sql"
ROLES_FILE = "91-test-community-roles.sql"
COMMUNITY_SLUG = "ucl-abacus"
COMMUNITY_NAME = "UCL Abacus"
SUBGROUP = "AbaFam"
D = B.TEST_DOMAIN

# The README's "already done" line. DONE_LINES_SEEN: this line as earlier
# versions of this script wrote it, so their README is still recognised.
DONE_LINE = "YOU HAVE ALREADY DONE STEPS 1 TO {n}"
DONE_LINES_SEEN = ("YOU HAVE ALREADY DONE STEPS 1 TO {n} ", "YOU HAVE ALREADY DONE 1 TO {n} ")
PART5_NOT_RUN = ("STOP: run 05-setup-communities.sql first (UCL Abacus is not here yet), then this file. "
                 "Nothing was changed.")
ACCOUNTS_NOT_RUN = ("STOP: run 90-test-accounts.sql first (some test accounts are missing; running it again is "
                    "harmless), then this file. Nothing was changed.")
for _m in (PART5_NOT_RUN, ACCOUNTS_NOT_RUN):
    assert "'" not in _m, _m

# Each test account's place in UCL Abacus. None = no row (not in the community).
#   key: (nickname, role, membership, status, claimed, decided by, membership confirmed by, days ago asked)
# "decided by" / "confirmed by" follow the database's own rules: the Function
# team (ada) sets the first admin and confirms that admin's own membership
# (nobody changes their own); only admins confirm paying members; committee
# approvals are always as a non-member.
PLACES = {
    "ada": None,
    "abacus-admin": ("Abby", "admin", "member", "active", False, "ada", "ada", 6.0),
    "abacus-committee": ("Cole", "committee", "member", "active", True, "abacus-admin", "abacus-admin", 5.9),
    "member-1": ("Mia", "regular", "member", "active", True, "abacus-admin", "abacus-admin", 5.8),
    "member-2": ("Max", "regular", "member", "active", True, "abacus-admin", "abacus-admin", 5.7),
    "member-3": ("Mo", "regular", "member", "active", True, "abacus-admin", "abacus-admin", 5.6),
    "nonmember-1": ("Nina", "regular", "non_member", "active", False, "abacus-committee", None, 5.5),
    "outsider": None,
    "pending-1": ("Penny", "regular", "non_member", "pending", True, None, None, 1.0),
}
# AbaFam: Cole (committee) adds himself, then Mia and Max, the way
# add_group_member does it (a "joined" / "added" note in the group's chat).
SUBGROUP_MEMBERS = ["abacus-committee", "member-1", "member-2"]
SUBGROUP_ADDER = "abacus-committee"
SENDERS = ["abacus-admin", "abacus-committee", "member-1", "member-2", "member-3", "nonmember-1"]
MAIN_MESSAGES = 130
TIE = (80, 81, 82)  # same time on purpose: the newest page of 50 ends at 081
SUBGROUP_MESSAGES = [("abacus-committee", 3000), ("member-1", 1500), ("member-2", 200)]
SUBGROUP_NOTES_AT = 5040  # minutes ago: Cole joins AbaFam and adds Mia and Max

assert set(PLACES) == {a[0] for a in B.ACCOUNTS}, "PLACES must cover exactly build.py's test accounts"


def email(key):
    return f"{key}@{D}"


def main_msg_id(n):
    return f"57a9e000-0000-4000-c000-{n:012d}"


def sub_msg_id(n):
    return f"57a9e000-0000-4000-d000-{n:012d}"


# Every message 91 writes has an id between these two (uuids compare byte by
# byte). The app never makes one in this range: gen_random_uuid() gives
# version-4 ids, whose 4th group starts with 8, 9, a or b, never c or d.
MARKER_LO = "57a9e000-0000-4000-c000-000000000000"
MARKER_HI = "57a9e000-0000-4000-d000-ffffffffffff"
for _i in [main_msg_id(n) for n in range(1, MAIN_MESSAGES + 1)] + [sub_msg_id(n) for n in range(1, 200)]:
    assert MARKER_LO <= _i <= MARKER_HI, _i


def git(repo, *args):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise B.BuildError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout


def schedule():
    """130 messages over the last ~4 days: (n, sender key, minutes ago),
    strictly newer as n grows except the deliberate tie. Deterministic."""
    rng = random.Random(20261202)
    gaps = {}
    breaks = {31: "night", 52: "afternoon", 71: "night", 92: "afternoon", 106: "night"}
    for n in range(2, MAIN_MESSAGES + 1):
        if n in breaks:
            gaps[n] = None
        elif n in TIE[1:]:
            gaps[n] = 0
        else:
            gaps[n] = rng.choice([1, 1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25])
    inside = sum(g for g in gaps.values() if g)
    last = 7
    target = 4 * 24 * 60 - 30  # the first message about 4 days ago
    spare = target - last - inside
    weights = {"night": 3.0, "afternoon": 1.0}
    total_w = sum(weights[v] for v in breaks.values())
    for n, kind in breaks.items():
        gaps[n] = int(spare * weights[kind] / total_w)
    mins = {MAIN_MESSAGES: last}
    for n in range(MAIN_MESSAGES - 1, 0, -1):
        mins[n] = mins[n + 1] + gaps[n + 1]
    out = []
    prev, run = None, 0
    for n in range(1, MAIN_MESSAGES + 1):
        if prev is not None and run < 4 and rng.random() < 0.35:
            who = prev
        else:
            who = rng.choices([w for w in SENDERS if w != prev], weights=[x for w, x in zip(SENDERS, [3, 2, 3, 3, 1, 2]) if w != prev])[0]
        run = run + 1 if who == prev else 1
        prev = who
        out.append((n, who, mins[n]))
    # Checks: oldest first, strictly newer except the tie, all in the past.
    for (n, _w, m), (_n2, _w2, m2) in zip(out, out[1:]):
        if n + 1 in TIE[1:]:
            assert m == m2, (n, m, m2)
        else:
            assert m > m2, (n, m, m2)
    assert out[-1][2] >= 5 and out[0][2] <= 5 * 24 * 60
    assert {w for _n, w, _m in out} == set(SENDERS)
    return out


def body(n):
    if n % 20 == 0:
        return (f"Test message {n:03d}: a longer one, to check that a long message wraps neatly onto several "
                "lines in the chat and is shortened properly in the chat list.")
    return f"Test message {n:03d}"


def guard_part5(last_part, last_sig):
    lines = ["-- Safety check first. It changes nothing; it stops the whole paste (so",
             "-- nothing at all is changed) if this isn't the test project, or if part",
             f"-- {last_part} hasn't been run yet. It doesn't stop a second run (see above).",
             "do $$", "declare", "  looks_real boolean := false;", "begin", B.real_db_checks().rstrip("\n"),
             B.marker_checks(3).rstrip("\n"),
             f"  -- 4. Part {last_part} must have been run first (it makes {last_sig[1]}{'()' if last_sig[0] == 'fn' else ''}).",
             f"  if {B.sig_missing_sql(last_sig)} then",
             f"    raise exception 'STOP: part {last_part} has not been run here yet, so nothing was changed. Run the parts in order: part {last_part} first.';",
             "  end if;",
             "end $$;", ""]
    return "\n".join(lines) + "\n"


def header_part5(k, names, first_no, commit):
    listing = "\n".join(f"--   {first_no + x:>2}. {nm}" for x, nm in enumerate(names))
    many = len(names) > 1
    return f"""-- =====================================================================
-- Function TEST database setup, part {k} of {k}: communities. Paste into the
-- SQL Editor of the TEST project (function-staging) only, never the real
-- one. Run it after parts 1 to {k - 1} (and 90-test-accounts.sql).
--
-- The TEST project's web address contains {B.STAGING_REF}.
-- If the address in your browser contains {B.REAL_REF}, that is
-- the REAL project: stop, and don't run anything.
--
-- How: open this file in Notepad, press Ctrl+A then Ctrl+C, go to the
-- SQL Editor, click "New query", click in the empty box, press Ctrl+V,
-- then click "Run". It takes a few seconds. When it has worked you will
-- see "Success. No rows returned". Then do {ROLES_FILE}.
--
-- If a red error appears instead, nothing has been changed (it runs all
-- or nothing). Take a screenshot, send it, and don't change anything in
-- this file.
--
-- Running it again is fine. Unlike parts 1 to {k - 1}, this part doesn't stop
-- when it has already been run here: the app's file{'s' if many else ''} inside {'them' if many else 'it'} {'are' if many else 'is'} made
-- to be run more than once, and a second run changes nothing and keeps
-- everything (the communities, who is in them, and the messages). So
-- when a newer version of this file is sent, paste it in the same way.
--
-- This part contains {'these files' if many else 'this file'} from the app's code, unchanged
-- (after the {first_no - 1} files in parts 1 to {k - 1}):
{listing}
--
-- Made by check/build_c5.py from code version {commit}. Don't edit by hand.
-- =====================================================================

"""


def roles_sql(commit, main_sched):
    acct_rows = []
    for n, (key, _full, _nick, _uni, _adm) in enumerate(B.ACCOUNTS, 1):
        acct_rows.append(f"    ({n}, '{email(key)}')")
    accounts_values = ",\n".join(acct_rows)

    place_rows = []
    order = 0
    for key, _full, _nick, _uni, _adm in B.ACCOUNTS:
        p = PLACES[key]
        if p is None:
            continue
        order += 1
        nick, role, mem, status, claimed, decider, confirmer, days = p
        place_rows.append(
            f"      ({order}, '{email(key)}', '{nick}', '{role}', '{mem}', '{status}', {'true' if claimed else 'false'}, "
            f"{repr(email(decider)) if decider else 'null'}, {repr(email(confirmer)) if confirmer else 'null'}, {int(days * 24 * 60)})")
    places_values = ",\n".join(place_rows)

    sub_rows = []
    for i, key in enumerate(SUBGROUP_MEMBERS):
        sub_rows.append(f"      ({i + 1}, '{email(key)}', '{sub_msg_id(100 + i + 1)}'::uuid, {SUBGROUP_NOTES_AT - i})")
    sub_values = ",\n".join(sub_rows)

    main_rows = ",\n".join(f"    ('{main_msg_id(n)}'::uuid, '{email(who)}', '{body(n)}', {m})" for n, who, m in main_sched)
    sub_msg_rows = ",\n".join(
        f"    ('{sub_msg_id(i + 1)}'::uuid, '{email(who)}', '{SUBGROUP} test message {i + 1} of {len(SUBGROUP_MESSAGES)}', {m})"
        for i, (who, m) in enumerate(SUBGROUP_MESSAGES))

    nick_of = {k: (PLACES[k][0] if PLACES[k] else None) for k in PLACES}
    lines_people = []
    describe = {
        "ada": "not in UCL Abacus (a Function admin sees it all anyway)",
        "outsider": "not in UCL Abacus",
    }
    for key, _full, _nick, _uni, _adm in B.ACCOUNTS:
        p = PLACES[key]
        if p is None:
            what = describe[key]
            lines_people.append(f"--   {email(key):<45} {what}")
            continue
        nick, role, mem, status, claimed, *_ = p
        if status == "pending":
            what = f'"{nick}": asked to join, ticked "paying member", waiting'
        else:
            what = f'"{nick}": {role}, ' + ("paying member (confirmed)" if mem == "member" else "not a paying member")
        lines_people.append(f"--   {email(key):<45} {what}")
    people = "\n".join(lines_people)
    sub_names = ", ".join(nick_of[k] for k in SUBGROUP_MEMBERS[:-1]) + " and " + nick_of[SUBGROUP_MEMBERS[-1]]
    sender_names = ", ".join(nick_of[k] for k in SENDERS[:-1]) + " and " + nick_of[SENDERS[-1]]
    tie = ", ".join(f"{n:03d}" for n in TIE[:-1]) + f" and {TIE[-1]:03d}"
    page_end = MAIN_MESSAGES - 50 + 1
    assert TIE[0] < page_end <= TIE[-1], "the tie must straddle the end of the newest page of 50"

    guard = f"""do $$
declare
  looks_real boolean := false;
begin
{B.real_db_checks()}{B.marker_checks(3)}  -- 4. The test project has (almost) no accounts of its own.
  if (select count(*) from auth.users where coalesce(lower(email), '') not like '%{B.MARKER_EMAIL}') > 5 then
    raise exception '{B.HAS_REAL_ACCOUNTS_MESSAGE}';
  end if;
  -- 5. 05-setup-communities.sql must have been run first (it makes UCL Abacus).
  if to_regclass('public.community_members') is null then
    raise exception '{PART5_NOT_RUN}';
  end if;
  if not exists (select 1 from public.communities where slug = '{COMMUNITY_SLUG}') then
    raise exception '{PART5_NOT_RUN}';
  end if;
  -- 6. The test accounts must be here (90-test-accounts.sql).
  if (select count(distinct lower(email)) from public.profiles where lower(email) in ({", ".join(repr(email(a[0])) for a in B.ACCOUNTS)})) < {len(B.ACCOUNTS)} then
    raise exception '{ACCOUNTS_NOT_RUN}';
  end if;
end $$;
"""

    return f"""-- =====================================================================
-- Function TEST community roles and test messages. Paste into the SQL
-- Editor of the TEST project (function-staging) only, never the real
-- one. Run it AFTER {PART5_FILE} (and 90-test-accounts.sql).
--
-- The TEST project's web address contains {B.STAGING_REF}.
-- If the address in your browser contains {B.REAL_REF}, that is
-- the REAL project: stop, and don't run anything.
--
-- It puts the test accounts into the {COMMUNITY_NAME} community, with these
-- nicknames, roles and memberships:
{people}
-- {sub_names} are also in the {SUBGROUP} group.
--
-- Then it adds {MAIN_MESSAGES} test messages to the {COMMUNITY_NAME} chat, written by
-- {sender_names} over the last 4 days, numbered from
-- "Test message 001" (the oldest) to "Test message {MAIN_MESSAGES:03d}" (the newest), so a
-- missing or repeated message is easy to spot when scrolling back. Every
-- 20th one is longer. Messages {tie} have exactly the same
-- time, on purpose: the newest page of 50 ends at {page_end:03d}, so when you scroll
-- back the next page must start at {page_end - 1:03d} (until someone sends more). It also
-- adds {len(SUBGROUP_MESSAGES)} messages to the {SUBGROUP} chat.
--
-- Nobody gets a notification for any of this: notifications that the
-- test messages would queue (for anyone who has already logged in to the
-- test app on a phone) are taken off the queue again before this file
-- finishes, so they are never sent.
--
-- When it has worked you will see a small table: each test account's
-- place in {COMMUNITY_NAME} and how many test messages it wrote, and a last
-- row with the totals (the first time: {MAIN_MESSAGES} in the {COMMUNITY_NAME} chat and
-- {len(SUBGROUP_MESSAGES)} in {SUBGROUP}). Running it again is harmless: it adds nothing
-- twice, and it doesn't undo what testers changed in the app (someone
-- removed stays removed, a changed role or nickname stays changed,
-- someone who left and asked to join again stays waiting for an answer
-- in the app, and nobody is put back in {SUBGROUP}). So later runs show
-- bigger totals if testers have sent messages, and testers' changes.
--
-- Made by check/build_c5.py from code version {commit}. Don't edit by hand.
-- =====================================================================

-- Safety check first. It changes nothing; it stops the whole paste (so
-- nothing at all is changed) if this isn't the test project, or if
-- {PART5_FILE} or 90-test-accounts.sql hasn't been run yet.
{guard}
-- The rest is one block, so it can check each step as it goes.
do $$
declare
  cid uuid;
  main_tid uuid;
  sub_gid uuid;
  sub_tid uuid;
  ada uuid := (select p.id from public.profiles p where lower(p.email) = '{email("ada")}');
  r record;
  mem record;
  uid uuid;
  nick text;
  asked timestamptz;
  decider uuid;
  confirmer uuid;
  adder uuid;
  set_up uuid[] := '{{}}';
  ran_before boolean;
  n integer;
begin
  -- Lock UCL Abacus, as the app's own community functions do, so nobody
  -- changes it while this runs.
  select c.id into cid from public.communities c where c.slug = '{COMMUNITY_SLUG}' for update;
  select t.id into main_tid from public.community_groups g join public.threads t on t.community_group_id = g.id
  where g.community_id = cid and g.kind = 'main';
  select g.id, t.id into sub_gid, sub_tid from public.community_groups g join public.threads t on t.community_group_id = g.id
  where g.community_id = cid and g.kind = 'sub' and lower(g.name) = lower('{SUBGROUP}') and g.archived_at is null
  order by g.created_at limit 1;
  if main_tid is null then raise exception '{COMMUNITY_NAME} has no main chat: run {PART5_FILE} again'; end if;
  -- Has this file been run here before? Every message it writes has a
  -- fixed id in the range below (the app never makes one there), and a
  -- message only goes away with its whole chat (deleting one in the app
  -- only blanks it), so if any of them is here, it has.
  select exists (select 1 from public.messages x
                 where x.id between '{MARKER_LO}' and '{MARKER_HI}')
  into ran_before;
  raise notice 'This file has been run here before: %', ran_before;

  -- 1. Places in the community. Someone with no row yet gets one, the way
  --    the app makes it (a request, then the decision): their nickname must
  --    pass the app's nickname rules and be free (if a tester already took
  --    it, they get the one the database picks for them instead). The FIRST
  --    time this file runs here, someone who asked to join in the app and is
  --    still waiting is approved as a {COMMUNITY_NAME} admin would. Anyone else (in
  --    already, removed, left, declined, and on later runs also waiting:
  --    that request is a tester's, for someone to answer in the app) is
  --    left as they are. Putting someone in (status 'active') adds them to
  --    the {COMMUNITY_NAME} chat through the database's own trigger.
  for r in
    select * from (values
{places_values}
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
      raise notice '% already has a place in {COMMUNITY_NAME} (%, %, %): left as it is', r.email, mem.status, mem.role, mem.membership;
    end if;
  end loop;

  -- 2. {SUBGROUP}: {nick_of[SUBGROUP_ADDER]} (committee) adds himself and then the others, as the
  --    app's "add to group" does: each needs to be active in {COMMUNITY_NAME}, it's
  --    shown in the group's chat ("joined the group", "added ..."), and
  --    adding someone puts them in the group's chat (the database's trigger).
  --    Only for accounts given their place just now, and only once each:
  --    each one's note has a fixed id, so if it's there already they were
  --    added before (and have left {SUBGROUP} or {COMMUNITY_NAME} since, or their
  --    account was deleted and made again): they aren't put back.
  if sub_gid is null then
    raise notice 'No {SUBGROUP} group (renamed or archived?): nobody was added to it';
  else
    select m.user_id into adder from public.community_members m join public.profiles p on p.id = m.user_id
    where m.community_id = cid and lower(p.email) = '{email(SUBGROUP_ADDER)}' and m.status = 'active' and m.role in ('admin', 'committee');
    for r in
      select * from (values
{sub_values}
      ) as v(ord, email, note_id, mins)
      order by ord
    loop
      select m.user_id, m.nickname into uid, nick from public.community_members m join public.profiles p on p.id = m.user_id
      where m.community_id = cid and lower(p.email) = r.email and m.status = 'active';
      continue when uid is null or not (uid = any (set_up));
      if exists (select 1 from public.messages x where x.id = r.note_id) then
        raise notice '% was not put back in {SUBGROUP}: added once before', r.email;
        continue;
      end if;
      if adder is null then
        raise notice '% was not added to {SUBGROUP}: {email(SUBGROUP_ADDER)} is not on the committee', r.email;
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
{main_rows}
  ) as v(id, email, body, mins)
  join public.profiles p on lower(p.email) = v.email
  where exists (select 1 from public.thread_participants tp where tp.thread_id = main_tid and tp.user_id = p.id)
  order by v.mins desc, v.id
  on conflict (id) do nothing;
  if sub_tid is not null then
    insert into public.messages (id, thread_id, sender_id, body, kind, created_at)
    select v.id, sub_tid, p.id, v.body, 'message', now() - make_interval(mins => v.mins)
    from (values
{sub_msg_rows}
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

-- 5. What's there now: each test account's place in {COMMUNITY_NAME}, then the totals.
with c as (
  select id from public.communities where slug = '{COMMUNITY_SLUG}'
), chats as (
  select g.kind, g.name, g.id as group_id, t.id as thread_id
  from public.community_groups g join public.threads t on t.community_group_id = g.id join c on c.id = g.community_id
  where g.archived_at is null and (g.kind = 'main' or lower(g.name) = lower('{SUBGROUP}'))
), accounts as (
  select v.ord, v.email, p.id from (values
{accounts_values}
  ) as v(ord, email) join public.profiles p on lower(p.email) = v.email
)
select test_account, nickname, role, membership, status, says_paying_member, groups, main_chat_messages, {SUBGROUP.lower()}_messages
from (
  select a.ord, a.email as test_account,
         coalesce(m.nickname, '-') as nickname, coalesce(m.role, '-') as role, coalesce(m.membership, '-') as membership,
         coalesce(m.status, 'not in {COMMUNITY_NAME}') as status, coalesce(m.membership_claimed::text, '-') as says_paying_member,
         coalesce((select string_agg(case when ch.kind = 'main' then '{COMMUNITY_NAME}' else ch.name end, ', ' order by ch.kind)
                   from chats ch
                   where (ch.kind = 'main' and m.status = 'active')
                      or exists (select 1 from public.community_group_members gm where gm.group_id = ch.group_id and gm.user_id = a.id)), '-') as groups,
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id
          where ch.kind = 'main' and x.sender_id = a.id and x.kind = 'message') as main_chat_messages,
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id
          where ch.kind = 'sub' and x.sender_id = a.id and x.kind = 'message') as {SUBGROUP.lower()}_messages
  from accounts a
  left join public.community_members m on m.community_id = (select id from c) and m.user_id = a.id
  union all
  select 99, 'TOTAL (everyone)', '', '', '', '', '', '',
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id where ch.kind = 'main' and x.kind = 'message'),
         (select count(*) from public.messages x join chats ch on ch.thread_id = x.thread_id where ch.kind = 'sub' and x.kind = 'message')
) x
order by ord;
"""


def readme_c5(m, part_files, part5_file):
    base = B.readme(m, part_files, None)
    n_old = m + 1  # build.py's README lists the parts, then 90
    old_list = "\n".join(f"   {k}. {pf}" for k, pf in enumerate(part_files, 1)) + f"\n   {n_old}. 90-test-accounts.sql   (the test accounts, last)"
    new_list = ("\n".join(f"   {k}. {pf}" for k, pf in enumerate(part_files, 1))
                + f"\n   {n_old}. {'90-test-accounts.sql':<30}(the test accounts)"
                + f"\n   {n_old + 1}. {part5_file:<30}(communities, added later)"
                + f"\n   {n_old + 2}. {ROLES_FILE:<30}(the test accounts in UCL Abacus, last)")
    done_files = ", ".join(pf[:2] for pf in part_files) + " and 90"
    reps = [
        (f"You will paste {n_old} files, one at a time, in this order:\n\n{old_list}\n\nEach one takes a few seconds.\n",
         f"You will paste {n_old + 2} files, one at a time, in this order:\n\n{new_list}\n\nEach one takes a few seconds.\n\n"
         f"{DONE_LINE.format(n=n_old)} (files {done_files}),\n"
         f"so don't run those again. Now do only these two, in this order, in\n"
         f"the same way as before (see \"FOR EACH FILE\" below):\n\n"
         f"   {n_old + 1}. {part5_file}\n"
         f"   {n_old + 2}. {ROLES_FILE}\n"),
        ("     (Supabase says this because the files replace some old rules),\n"
         "     check you're still in function-staging, then click \"Run this query\".\n",
         "     (Supabase says this because the files replace some old rules or\n"
         "     tidy something away), check you're still in function-staging,\n"
         "     then click \"Run this query\".\n"),
        ("7. For the last file, 90-test-accounts.sql, the results area shows a\n"
         "   small table listing the 9 test accounts instead (a plain\n"
         "   \"Success\" is fine too). That means it worked. The test log-ins and\n",
         "7. For 90-test-accounts.sql, the results area shows a small table\n"
         "   listing the 9 test accounts instead (a plain \"Success\" is fine\n"
         "   too). That means it worked. The test log-ins and\n"),
        ("   Use them on the test version of the app: \"Log in\", then email and\n"
         "   password.\n",
         "   Use them on the test version of the app: \"Log in\", then email and\n"
         "   password.\n"
         f"8. {part5_file} also ends with \"Success. No rows returned\".\n"
         f"   Unlike parts 1 to {m}, it is fine to run it again (for example when\n"
         "   a newer version of it is sent): it doesn't stop, and it keeps\n"
         "   everything that's there.\n"
         f"9. For the last file, {ROLES_FILE}, the results area\n"
         "   shows a small table: each test account's place in UCL Abacus\n"
         "   (nickname, role, membership, status and groups) and how many test\n"
         "   messages it wrote, then a last row with the totals. The first time,\n"
         f"   that row shows {MAIN_MESSAGES} in the UCL Abacus chat and {len(SUBGROUP_MESSAGES)} in AbaFam, and that\n"
         "   means it worked. Running it again is harmless and adds nothing\n"
         "   twice. Later runs show bigger numbers if testers have sent\n"
         "   messages, and show any roles or places testers changed in the app;\n"
         "   that is fine. Log in as abacus-admin, abacus-committee, member-1 and\n"
         "   so on to see UCL Abacus as each of them.\n"),
        (f"    \"STOP: run all {m} setup parts first\" - the test accounts file was run\n"
         "      too early. Run the parts first, then the test accounts file.\n",
         f"    \"STOP: run all {m} setup parts first\" - the test accounts file was run\n"
         "      too early. Run the parts first, then the test accounts file.\n"
         f"    \"STOP: run {part5_file} first\" - the community roles\n"
         f"      file was run too early. Run {part5_file}, then\n"
         f"      {ROLES_FILE}.\n"
         "    \"STOP: run 90-test-accounts.sql first\" - some test accounts are\n"
         "      missing. Run 90-test-accounts.sql (running it again is\n"
         f"      harmless), then {ROLES_FILE}.\n"),
    ]
    text = base
    for old, new in reps:
        if text.count(old) != 1:
            raise B.BuildError("README: build.py's wording changed; can't find: " + old.splitlines()[0])
        text = text.replace(old, new)
    return base, text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="/home/user/student-motive")
    ap.add_argument("--rev", default="HEAD", help="the commit to read the app's files from (never the working tree)")
    ap.add_argument("--out", default=os.path.dirname(HERE))
    ap.add_argument("--max-kb", type=int, default=130)
    ap.add_argument("--no-readme", action="store_true", help="leave README.txt alone (e.g. building into a scratch folder)")
    args = ap.parse_args()

    commit = git(args.repo, "rev-parse", "--short", args.rev + "^{commit}").strip()
    names = sorted(os.path.basename(p) for p in git(args.repo, "ls-tree", "--name-only", commit, "supabase/migrations/").split("\n")
                   if p.endswith(".sql"))
    newer = [f for f in names if f[:14] > PASTED_CUTOFF]
    if not newer:
        raise B.BuildError(f"no migration newer than {PASTED_CUTOFF} at {commit}")
    files = []
    for f in newer:
        if not re.match(r"^\d{14}_\w+\.sql$", f):
            raise B.BuildError(f"odd migration name: {f}")
        text = git(args.repo, "show", f"{commit}:supabase/migrations/{f}")
        info = B.analyse(f, text)
        if info["non_tx"]:
            raise B.BuildError(f"{f} has a statement that can't run inside a transaction: {info['non_tx'][0]['norm'][:60]}")
        files.append(info)
    # A value added to an enum can't be used until the paste that added it
    # has committed: nothing after it in this one paste may mention it.
    for x, info in enumerate(files):
        for (typ, label, line) in info["enum_adds"]:
            after = [s for s in info["stmts"] if s["line"] > line]
            if any(B.mentions(s["code"], label) for s in after) or any(B.mentions(g["text"], label) for g in files[x + 1:]):
                raise B.BuildError(f"{info['name']} line {line}: enum value '{label}' ({typ}) is used later in the same paste")

    # What's already pasted: the parts build.py made, and part 4's marker.
    part_files = sorted(f for f in os.listdir(args.out) if re.match(r"^\d\d-setup-part-\d+\.sql$", f))
    m = len(part_files)
    if m == 0:
        raise B.BuildError("no NN-setup-part-N.sql files in " + args.out)
    last_text = open(os.path.join(args.out, part_files[-1]), encoding="utf-8").read()
    sm = re.search(r"^  -- 5\. This part makes (\w+)(\(\))?, so if it's already here this part has run\.\n"
                   r"  if (to_regclass\('public\.(\w+)'\) is not null|exists \(select 1 from pg_proc p .*? p\.proname = '(\w+)'\)) then$",
                   last_text, re.M)
    if not sm:
        raise B.BuildError(f"can't find part {m}'s 'this part makes' check in {part_files[-1]}")
    last_sig = ("fn", sm.group(5)) if sm.group(2) else ("rel", sm.group(4))
    assert last_sig[1] == sm.group(1), sm.groups()
    head = last_text[:last_text.index("\n-- Made by check/build.py")]
    listed = re.findall(r"^--\s+(\d+)\. (\S+)$", head, re.M)
    first_no = int(listed[-1][0]) + 1

    k = m + 1
    body = "".join(f"-- ===== {f['name']} =====\n" + (f["text"] if f["text"].endswith("\n") else f["text"] + "\n") + "\n"
                   for f in files)
    text5 = header_part5(k, [f["name"] for f in files], first_no, commit) + guard_part5(m, last_sig) + body
    if len(text5.encode()) > args.max_kb * 1024:
        raise B.BuildError(f"{PART5_FILE} would be {len(text5.encode())} bytes, over {args.max_kb} KB: split it")
    sched = schedule()
    text91 = roles_sql(commit, sched)
    for t in (text5, text91):
        B.analyse("generated", t)  # same lexer: every statement closed, no psql commands, no transaction control
    if B.REAL_REF in text91.replace(f"contains {B.REAL_REF}, that is", "").replace(f"point at the real project {B.REAL_REF})", "").replace(f"%{B.REAL_REF}%", ""):
        raise B.BuildError("the real project's ref appears in 91 outside the safety checks")

    readme = None
    if not args.no_readme:
        base, readme = readme_c5(m, part_files, PART5_FILE)
        cur = open(os.path.join(args.out, "README.txt"), encoding="utf-8", newline="").read().replace("\r\n", "\n")
        # Only replace build.py's README or one this script made (any version
        # of it), never one somebody edited by hand.
        made_here = cur.startswith(base.split("You will paste")[0]) and any("\n" + d.format(n=m + 1) in cur for d in DONE_LINES_SEEN)
        if cur not in (base, readme) and not made_here:
            raise B.BuildError("README.txt isn't build.py's README (or this script's version of it): not overwriting it")
    with open(os.path.join(args.out, PART5_FILE), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text5)
    with open(os.path.join(args.out, ROLES_FILE), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text91)
    if readme is not None:
        with open(os.path.join(args.out, "README.txt"), "w", encoding="utf-8", newline="\r\n") as fh:
            fh.write(readme)
    # The password lives only in test-accounts.txt; this script never reads it,
    # so it can't be in what it wrote (prove_c5.sh checks every file anyway).

    print(f"code version {commit}; already pasted: {m} parts (files 1-{first_no - 1}, migrations <= {PASTED_CUTOFF}); "
          f"part {m}'s marker: {last_sig}")
    print(f"{PART5_FILE}: {len(text5.encode())} bytes ({len(text5.encode()) / 1024:.1f} KB), files {first_no}-{first_no + len(files) - 1}: "
          f"{', '.join(f['name'] for f in files)}; {sum(len(f['stmts']) for f in files)} statements; needs part {m} ({last_sig[1]})")
    print(f"{ROLES_FILE}: {len(text91.encode())} bytes; {MAIN_MESSAGES} + {len(SUBGROUP_MESSAGES)} messages, "
          f"oldest {sched[0][2]} min ago ({sched[0][2] / 1440:.2f} days), newest {sched[-1][2]} min ago; "
          f"senders: {', '.join(f'{w}={sum(1 for _n, x, _m in sched if x == w)}' for w in SENDERS)}")
    print("README.txt: " + ("left alone" if args.no_readme else f"steps {m + 2} ({PART5_FILE}) and {m + 3} ({ROLES_FILE}) added"))


if __name__ == "__main__":
    try:
        main()
    except B.BuildError as e:
        print("build_c5.py: " + str(e), file=sys.stderr)
        sys.exit(1)
