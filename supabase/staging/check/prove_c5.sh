#!/usr/bin/env bash
# Proves 05-setup-communities.sql and 91-test-community-roles.sql LOCALLY
# (never touches Supabase). Every database it makes is called staging_c5_prove_*
# and is dropped at the end. The app's files come from a COMMIT of the repo
# (git archive, read only), by default the one 05 says it was made from.
#   0. the files: 01-04 still the repo's files at that commit; 05 = the newer
#      migration(s) verbatim behind the safety check; 05 and 91 are exactly what
#      build_c5.py makes; README.txt too; the password only in test-accounts.txt;
#   1. a reference database the normal way (repo stubs + every migration one by
#      one + seed), like supabase/tests/run.sh;
#   2. repo stubs + parts 01-04 + 05 twice, each with psql -1 (one transaction,
#      like the SQL Editor): public schema == reference after each run; the app's
#      own database tests (supabase/tests/*.test.sql) pass on it;
#   3. hosted-shaped auth (check/make_hosted_stubs.py) WITH the realtime stand-ins
#      + parts + 90 + 05 + 91 twice + 05 again + 91 again, with a phone registered
#      for every test account: places, chats, messages, no notifications, what
#      the app shows each account, paging, live-chat listeners, nothing doubled;
#   4. testers' changes in the app survive a re-run of 91, and a request made in
#      the app before 91's first run is approved the database's way;
#   4b. after 91 has run, a test account deleted and made again by 90: 91 gives
#      it its place again but doesn't put it back in AbaFam (no note for it);
#   4c. after 91 has run, testers leave and ask to join again in the app: 91
#      again leaves the requests waiting (row-for-row nothing changes);
#   5. the same WITHOUT the realtime schema: 05 skips the listener rule;
#   6. the guards of 05 and 91.
#   3j. a test project that already has chats and messages: 05 and 91 keep them;
#   3i. (with PREV_REV=<commit>) the upgrade: 05 and 91 as made from PREV_REV (what
#      was pasted before), then this 05 and 91 pasted over them.
# Usage: bash prove_c5.sh   (REV=<commit> to prove another commit's files;
#        PREV_REV=<commit already pasted> to prove pasting a newer 05 over it)
set -uo pipefail
export PGHOST=${PGHOST:-/var/tmp/motivepg} PGPORT=${PGPORT:-5499} PGUSER=${PGUSER:-postgres}
C="$(cd "$(dirname "$0")" && pwd)"
S=${STAGING:-$(dirname "$C")}
R=${REPO:-/home/user/student-motive}
F5="$S/05-setup-communities.sql" F91="$S/91-test-community-roles.sql" F90="$S/90-test-accounts.sql"
REV=${REV:-$(sed -n 's/^-- Made by check\/build_c5\.py from code version \([0-9a-f]*\)\. .*/\1/p' "$F5")}
PASTED_CUTOFF=20261201000000
W="$C/work_c5"; rm -rf "$W"; mkdir -p "$W/repo"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
P=staging_c5_prove_
REF=${P}ref PARTS=${P}parts TESTS=${P}tests HOSTED=${P}hosted EDGE=${P}edge RERUN=${P}rerun NORT=${P}nort G=${P}guard
fails=0
DOM='staging.studentfunction.com'
MARKER="@$DOM"
NOT_TEST='STOP: this is not the test project (part 1 of these files was never run here)'
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; fails=$((fails + 1)); }
check() { local want=$1 got=$2 msg=$3; if [ "$got" = "$want" ]; then pass "$msg"; else fail "$msg: wanted [$want] got [$got]"; fi; }
newdb() { "${PSQL[@]}" -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null 2>&1; }
q() { psql -X -At -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
# As a logged-in test account, the way the app's requests run (role authenticated, its id in the JWT claims).
# Ids are looked up first (as the server), so what "as" shows is only what that account may see.
as() { local db=$1 who=$2 sql=$3; psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" -c "select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where email = '$who@$DOM'), 'role', 'authenticated')::text, false)" -c "set role authenticated" -c "$sql" | tail -n +2; }
id_of() { q "$1" "select id from public.profiles where email = '$2@$DOM'"; }
ids() { MAIN_ID="'$(q "$1" "select $MAIN")'"; FAM_ID="'$(q "$1" "select $FAM")'"; CID_ID="'$(q "$1" "select $CID")'"; FAMG_ID="'$(q "$1" "select community_group_id from public.threads where id = $FAM")'"; }
run1() { local db=$1 f=$2 out t0 t; t0=$(date +%s.%N); if out=$("${PSQL[@]}" -1 -d "$db" -f "$f" 2>&1 >/dev/null); then t=$(echo "$(date +%s.%N) - $t0" | bc); echo "  $(basename "$f") -> OK (exit 0, ${t:0:4}s)${out:+, server notices: $(echo "$out" | grep -c NOTICE)}"; return 0; else echo "  $(basename "$f") -> ERROR: $(echo "$out" | grep -m1 ERROR)"; return 1; fi; }
expect_stop() { local db=$1 f=$2 want=$3 out; if out=$("${PSQL[@]}" -1 -d "$db" -f "$f" 2>&1 >/dev/null); then fail "$(basename "$f") on $db ran but should have stopped ($want)"; else if echo "$out" | grep -q -F "$want"; then pass "$(basename "$f") on $db stopped: $(echo "$out" | grep -m1 -o 'STOP:.*')"; else fail "$(basename "$f") on $db failed differently: $(echo "$out" | grep -m1 ERROR)"; fi; fi; }
dump() { pg_dump --schema-only --no-owner --no-privileges -n public -d "$1" | grep -v -E '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
dumpacl() { pg_dump --schema-only -n public -d "$1" | grep -v -E '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
same_schema() { # db label: public schema (and owners/grants) == the reference
  dump "$1" "$W/$1.sql"; dumpacl "$1" "$W/$1.acl.sql"
  if diff -q "$W/ref.sql" "$W/$1.sql" >/dev/null; then pass "$2: public schema == reference (exact)"
  elif diff <(sort "$W/ref.sql") <(sort "$W/$1.sql") >/dev/null; then pass "$2: public schema == reference apart from ordering"
  else fail "$2: public schema differs from the reference"; diff "$W/ref.sql" "$W/$1.sql" | head -20; fi
  if diff -q "$W/ref.acl.sql" "$W/$1.acl.sql" >/dev/null; then pass "$2: owners and grants == reference"
  elif diff <(sort "$W/ref.acl.sql") <(sort "$W/$1.acl.sql") >/dev/null; then pass "$2: owners and grants == reference apart from ordering"
  else fail "$2: owners/grants differ"; diff "$W/ref.acl.sql" "$W/$1.acl.sql" | head -20; fi
}
extras() {
  q "$1" "select 'realtime policy: '||policyname||' '||cmd||' '||array_to_string(roles, ',')||' '||coalesce(qual,'') from pg_policies where schemaname='realtime' order by 1"
  q "$1" "select 'storage policy: '||policyname||' '||cmd||' '||coalesce(qual,'')||' '||coalesce(with_check,'') from pg_policies where schemaname='storage' order by 1"
  q "$1" "select 'auth.users trigger: '||tgname||' '||tgfoid::regproc from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal order by 1"
  q "$1" "select 'bucket: '||id||' public='||public from storage.buckets order by 1"
  q "$1" "select 'realtime publication: '||schemaname||'.'||tablename from pg_publication_tables where pubname='supabase_realtime' order by 1"
  q "$1" "select 'community: '||c.slug||' '||c.name||' bio='''||c.bio||''' society='||coalesce(c.society_id::text,'none')||' groups='||(select string_agg(g.name||':'||g.kind||':'||(select count(*) from public.threads t where t.community_group_id = g.id), ',' order by g.kind, g.name) from public.community_groups g where g.community_id = c.id) from public.communities c order by 1"
  for t in $(q "$1" "select tablename from pg_tables where schemaname='public' order by 1"); do
    if [ "$t" = allowed_emails ]; then echo "rows public.$t (not counting the test-project marker): $(q "$1" "select count(*) from public.$t where email <> '$MARKER'")"
    else echo "rows public.$t: $(q "$1" "select count(*) from public.$t")"; fi
  done
}
# A fingerprint of every row 05 and 91 touch, table by table.
datahash() { q "$1" "select string_agg(tbl||'='||left(h, 8), ' ' order by tbl) from (
  select 'communities' tbl, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h from public.communities t
  union all select 'community_groups', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.community_groups t
  union all select 'community_members', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.community_members t
  union all select 'community_group_members', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.community_group_members t
  union all select 'thread_participants', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.thread_participants t
  union all select 'thread_reads', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.thread_reads t
  union all select 'thread_mutes', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.thread_mutes t
  union all select 'threads', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.threads t
  union all select 'messages', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.messages t
  union all select 'push_queue', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.push_queue t
  union all select 'profiles', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.profiles t
) s"; }
MAIN="(select t.id from public.threads t join public.community_groups g on g.id = t.community_group_id join public.communities c on c.id = g.community_id where c.slug = 'ucl-abacus' and g.kind = 'main')"
FAM="(select t.id from public.threads t join public.community_groups g on g.id = t.community_group_id join public.communities c on c.id = g.community_id where c.slug = 'ucl-abacus' and g.kind = 'sub' and g.name = 'AbaFam')"
CID="(select id from public.communities where slug = 'ucl-abacus')"
places() { q "$1" "select string_agg(split_part(p.email, '@', 1)||':'||coalesce(m.nickname||'/'||m.role||'/'||m.membership||'/'||m.status||'/'||m.membership_claimed, 'none'), ' ' order by p.email) from public.profiles p left join public.community_members m on m.user_id = p.id and m.community_id = $CID where p.email like '%@$DOM'"; }
phones() { q "$1" "insert into public.push_tokens (user_id, platform, token) select id, 'ios', 'ExponentPushToken[test-'||split_part(email, '@', 1)||']' from public.profiles where email like '%@$DOM' on conflict (token) do nothing" >/dev/null; }

echo "== prove_c5.sh $(date -u '+%Y-%m-%d %H:%M UTC'), code version $REV (repo HEAD is $(git -C "$R" rev-parse --short HEAD); files read from $REV with git archive), $(psql -X -At -d postgres -c 'show server_version')"
# Only what's needed (not the RUN_ONCE_ files, which hold the real project's address).
git -C "$R" archive "$REV" supabase/migrations supabase/seed.sql supabase/tests | tar -x -C "$W/repo" || { echo "can't read $REV from $R"; exit 99; }
STUBS="$W/repo/supabase/tests/stubs.sql"
echo "== stand-ins: repo stubs.sql at $REV (sha256 $(sha256sum "$STUBS" | cut -c1-12)); hosted-shaped: make_hosted_stubs.py of it (auth.users/identities like GoTrue, extensions, vault)"
python3 -I "$C/make_hosted_stubs.py" "$STUBS" "$W/stubs-hosted-realtime.sql"
grep -q '^create schema realtime;' "$W/stubs-hosted-realtime.sql" && pass "hosted-shaped stand-ins include the repo's realtime section (realtime.messages, realtime.topic(), realtime.send())" || fail "no realtime section in the stand-ins"
echo "== files"
( cd "$S" && ls -l --time-style=+ *.sql README.txt test-accounts.txt | awk '{print "  "$5" bytes  "$6}' )

echo "== 0a. what's already pasted is unchanged at $REV, and 05 is the newer migration(s) verbatim"
python3 -I "$C/verify_verbatim.py" "$S" "$W/repo" "$PASTED_CUTOFF" | sed 's/^/  /' && pass "parts 01-04: still the repo's 49 migrations + seed.sql at $REV, verbatim (nothing pasted needs re-pasting)" || fail "a file in parts 01-04 changed at $REV"
python3 -I "$C/verify_c5.py" "$S" "$W/repo" "$PASTED_CUTOFF" | sed 's/^/  /'; [ "${PIPESTATUS[0]}" = 0 ] && pass "05 verbatim + its safety check" || fail "verify_c5.py"
mkdir -p "$W/rebuild"; cp "$S"/[0-9][0-9]-setup-part-*.sql "$S/README.txt" "$W/rebuild/"
if python3 -I "$C/build_c5.py" --repo "$R" --rev "$REV" --out "$W/rebuild" > "$W/rebuild.log" 2>&1; then
  for f in 05-setup-communities.sql 91-test-community-roles.sql README.txt; do cmp -s "$S/$f" "$W/rebuild/$f" && pass "$f is exactly what build_c5.py makes from $REV" || fail "$f differs from a fresh build_c5.py --rev $REV"; done
else fail "build_c5.py --rev $REV: $(cat "$W/rebuild.log")"; fi
echo "== 0b. plaintext password is only in test-accounts.txt"
PW=$(sed -n 's/^Password (the same for every test account): \([A-Za-z0-9]*\)\r\{0,1\}$/\1/p' "$S/test-accounts.txt")
if [ ${#PW} -ge 20 ]; then hits=$(grep -r -l -F "$PW" "$S" 2>/dev/null | grep -v -x "$S/test-accounts.txt" || true); [ -z "$hits" ] && pass "password appears in no other file under staging/ (05, 91, README, check/ included)" || fail "password found in: $hits"; else fail "can't read the password's shape"; fi
grep -q -F '$2' "$F91" && fail "91 contains something that looks like a password hash" || pass "91 has no password or hash in it"

echo "== 1. reference database, the normal way (repo stubs + each migration on its own + seed)"
newdb $REF; "${PSQL[@]}" -d $REF -f "$STUBS" >/dev/null 2>&1
n=0; ok=1
for f in "$W"/repo/supabase/migrations/*.sql "$W/repo/supabase/seed.sql"; do
  "${PSQL[@]}" -d $REF -f "$f" >/dev/null 2>"$W/ref.err" || { fail "reference: $(basename "$f"): $(grep -m1 ERROR "$W/ref.err")"; ok=0; break; }; n=$((n + 1))
done
[ $ok = 1 ] && pass "reference: $((n - 1)) migrations (through $(ls "$W"/repo/supabase/migrations | tail -1)) + seed, one by one"
dump $REF "$W/ref.sql"; dumpacl $REF "$W/ref.acl.sql"; extras $REF > "$W/ref.extras"
echo "  reference dump: $(wc -l < "$W/ref.sql") lines"

echo "== 2. repo stubs + parts 01-04 + 05, then 05 again (each ONE transaction: psql -X -q -1 -v ON_ERROR_STOP=1 -f)"
newdb $PARTS; "${PSQL[@]}" -d $PARTS -f "$STUBS" >/dev/null 2>&1
ok=1; for p in "$S"/[0-9][0-9]-setup-part-*.sql; do run1 $PARTS "$p" || ok=0; done
[ $ok = 1 ] && pass "parts 01-04 applied" || fail "a part failed"
run1 $PARTS "$F5" && pass "05 run 1 -> OK" || fail "05 run 1"
same_schema $PARTS "after 05 run 1"; cp "$W/$PARTS.sql" "$W/parts-run1.sql"
run1 $PARTS "$F5" && pass "05 run 2 (pasted again) -> OK: no 'already run' stop" || fail "05 run 2"
same_schema $PARTS "after 05 run 2"
diff -q "$W/parts-run1.sql" "$W/$PARTS.sql" >/dev/null && pass "05 run 2 left the schema exactly as run 1 did" || fail "run 2 changed the schema"
extras $PARTS > "$W/parts.extras"
if diff -q "$W/ref.extras" "$W/parts.extras" >/dev/null; then pass "realtime listener rule, storage policies, auth triggers, buckets, publication, UCL Abacus + its groups/chats, row counts of every public table: identical to the reference ($(wc -l < "$W/ref.extras") lines)"; else fail "extras differ"; diff "$W/ref.extras" "$W/parts.extras" | head; fi
grep -E '^(realtime policy|community)' "$W/ref.extras" | sed 's/^/  /'
echo "== 2b. the app's own database tests (supabase/tests/*.test.sql at $REV, as run.sh runs them) on a database built from the paste files"
newdb $TESTS; "${PSQL[@]}" -d $TESTS -f "$STUBS" >/dev/null 2>&1
for p in "$S"/[0-9][0-9]-setup-part-*.sql "$F5" "$F5"; do "${PSQL[@]}" -1 -d $TESTS -f "$p" >/dev/null 2>&1 || fail "tests db: $(basename "$p")"; done
tp=0; tf=0
for t in "$W"/repo/supabase/tests/*.test.sql; do
  if out=$(cd "$W/repo/supabase/tests" && "${PSQL[@]}" -d $TESTS -f fixtures.sql -f "$(basename "$t")" 2>&1); then tp=$((tp + 1)); else tf=$((tf + 1)); fail "test $(basename "$t"): $(echo "$out" | grep -m1 ERROR)"; fi
done
[ $tf = 0 ] && pass "all $tp test files pass (communities.test.sql among them, which also re-runs the migration)"

echo "== 3. hosted-shaped auth + realtime stand-ins: parts + 90 + a phone for every test account, then 05, 91, 91, 05, 91"
newdb $HOSTED; "${PSQL[@]}" -d $HOSTED -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>"$W/hs.err" || fail "hosted stubs: $(cat "$W/hs.err")"
ok=1; for p in "$S"/[0-9][0-9]-setup-part-*.sql "$F90"; do run1 $HOSTED "$p" || ok=0; done
[ $ok = 1 ] && pass "parts 01-04 + 90 applied (what the test project has now)" || fail "parts/90 failed"
phones $HOSTED
echo "  phones registered: $(q $HOSTED "select count(*) from public.push_tokens") (one per test account, so any notification would be queued)"
run1 $HOSTED "$F5" && pass "05 -> OK on hosted-shaped auth with realtime" || fail "05 on hosted"
same_schema $HOSTED "hosted-shaped, after 05"
if out=$("${PSQL[@]}" -1 -d $HOSTED -f "$F91" 2>&1); then pass "91 run 1 -> OK"; echo "  results table (run 1):"; echo "$out" | grep -v NOTICE | sed 's/^/    /'; else fail "91 run 1: $(echo "$out" | grep -m1 ERROR)"; fi
removed=$(echo "$out" | sed -n 's/.*Notifications taken off the queue (never sent): \([0-9]*\).*/\1/p')
echo "== 3a. places in UCL Abacus"
want=$(python3 -I -c '
import sys; sys.path.insert(0, sys.argv[1]); import build_c5 as X
print(" ".join(k + ":" + ("none" if X.PLACES[k] is None else "/".join([X.PLACES[k][0], X.PLACES[k][1], X.PLACES[k][2], X.PLACES[k][3], "true" if X.PLACES[k][4] else "false"])) for k in sorted(X.PLACES)))' "$C")
check "$want" "$(places $HOSTED)" "every test account has exactly the place asked for (nickname/role/membership/status/claimed)"
echo "  $(places $HOSTED)"
check "0" "$(q $HOSTED "select count(*) from public.community_members where community_id = $CID and (decided_by = user_id or membership_confirmed_by = user_id)")" "nobody decided or confirmed their own place or membership"
check "abacus-admin:ada:ada abacus-committee:abacus-admin:abacus-admin member-1:abacus-admin:abacus-admin member-2:abacus-admin:abacus-admin member-3:abacus-admin:abacus-admin nonmember-1:abacus-committee:- pending-1:-:-" \
  "$(q $HOSTED "select string_agg(split_part(p.email,'@',1)||':'||coalesce(split_part(d.email,'@',1),'-')||':'||coalesce(split_part(cf.email,'@',1),'-'), ' ' order by p.email) from public.community_members m join public.profiles p on p.id = m.user_id left join public.profiles d on d.id = m.decided_by left join public.profiles cf on cf.id = m.membership_confirmed_by where m.community_id = $CID")" \
  "decided by / membership confirmed by follow the rules: the Function team (ada) set the first admin and confirmed her membership; only the admin confirmed paying members; the committee approved Nina as a non-member; Penny is undecided"
check "0" "$(q $HOSTED "select count(*) from public.community_members where community_id = $CID and (nickname <> public.clean_community_nickname(nickname) or public.community_nickname_problem(nickname) is not null)")" "every nickname passes the app's nickname rules"
echo "== 3b. chats"
check "abacus-admin,abacus-committee,member-1,member-2,member-3,nonmember-1" "$(q $HOSTED "select string_agg(split_part(p.email,'@',1), ',' order by p.email) from public.thread_participants tp join public.profiles p on p.id = tp.user_id where tp.thread_id = $MAIN")" "UCL Abacus chat: exactly the 6 active people (made by the database's trigger, not by 91)"
check "abacus-committee,member-1,member-2" "$(q $HOSTED "select string_agg(split_part(p.email,'@',1), ',' order by p.email) from public.thread_participants tp join public.profiles p on p.id = tp.user_id where tp.thread_id = $FAM")" "AbaFam chat: Cole, Mia and Max"
check "abacus-committee:abacus-committee,member-1:abacus-committee,member-2:abacus-committee" "$(q $HOSTED "select string_agg(split_part(p.email,'@',1)||':'||split_part(a.email,'@',1), ',' order by p.email) from public.community_group_members gm join public.profiles p on p.id = gm.user_id join public.profiles a on a.id = gm.added_by where gm.group_id = (select community_group_id from public.threads where id = $FAM)")" "AbaFam members, each added by Cole (committee)"
echo "== 3c. messages"
check "130|130|130|001|130" "$(q $HOSTED "select count(*)||'|'||count(distinct body)||'|'||count(*) filter (where kind = 'message')||'|'||min(substr(body, 14, 3))||'|'||max(substr(body, 14, 3)) from public.messages where thread_id = $MAIN")" "UCL Abacus chat: 130 messages, all different, kind 'message', numbered 001 to 130"
check "0" "$(q $HOSTED "select count(*) from generate_series(1, 130) g where not exists (select 1 from public.messages m where m.thread_id = $MAIN and m.body like 'Test message '||lpad(g::text, 3, '0')||'%')")" "no number missing"
check "6" "$(q $HOSTED "select count(distinct sender_id) from public.messages where thread_id = $MAIN")" "written by a mix of 6 people"
check "0" "$(q $HOSTED "select count(*) from public.messages m where m.thread_id in ($MAIN, $FAM) and not exists (select 1 from public.thread_participants tp where tp.thread_id = m.thread_id and tp.user_id = m.sender_id)")" "every writer is in the chat they wrote in"
check "0" "$(q $HOSTED "select count(*) from (select substr(body, 14, 3)::int n, created_at, lead(created_at) over (order by substr(body, 14, 3)::int) nxt from public.messages where thread_id = $MAIN) x where nxt is not null and not (nxt > created_at or (n in (80, 81) and nxt = created_at))")" "each message is newer than the one before, except 080 = 081 = 082 (on purpose)"
check "1" "$(q $HOSTED "select count(distinct created_at) from public.messages where thread_id = $MAIN and substr(body, 14, 3) in ('080', '081', '082')")" "080, 081 and 082 have exactly the same time"
echo "  oldest $(q $HOSTED "select to_char(now() - min(created_at), 'DD \"days\" HH24\"h\"MI') from public.messages where thread_id = $MAIN") ago, newest $(q $HOSTED "select to_char(now() - max(created_at), 'MI') from public.messages where thread_id = $MAIN") min ago; per day: $(q $HOSTED "select string_agg(d||'='||c, ' ' order by d) from (select (now()::date - created_at::date) d, count(*) c from public.messages where thread_id = $MAIN group by 1) x") (days ago=count)"
check "t" "$(q $HOSTED "select bool_and(created_at < now() and created_at > now() - interval '5 days') from public.messages where thread_id in ($MAIN, $FAM)")" "all within the last few days, none in the future"
check "joined the group:joined,added Mia:added,added Max:added,AbaFam test message 1 of 3:message,AbaFam test message 2 of 3:message,AbaFam test message 3 of 3:message" "$(q $HOSTED "select string_agg(body||':'||kind, ',' order by created_at) from public.messages where thread_id = $FAM")" "AbaFam chat: Cole's 'joined' and 'added' notes (as add_group_member makes them), then 3 test messages"
echo "== 3d. no notifications, nothing left behind"
qd=$(q $HOSTED "select count(*) from public.messages m join public.thread_participants tp on tp.thread_id = m.thread_id and tp.user_id <> m.sender_id where m.thread_id in ($MAIN, $FAM) and m.kind = 'message'")
check "$qd" "$removed" "the messages queued $qd notifications inside the paste (1 per message per other person with a phone), and 91 took exactly those off again"
check "0" "$(q $HOSTED "select count(*) from public.push_queue")" "the notification queue is empty afterwards (nothing to send to anyone)"
check "0" "$(q $HOSTED "select count(*) from public.thread_mutes")" "no mutes added or left behind"
check "0" "$(q $HOSTED "select count(*) from public.thread_leaves")" "nobody 'left' a chat"
check "136|true" "$(q $HOSTED "select count(*)||'|'||bool_and(payload ?& array['id','op'] and payload - 'id' - 'op' = '{}'::jsonb and private) from realtime.messages")" "live chat: one broadcast per new message (130 + 6), private, carrying only {id, op}"
echo "== 3e. what the app shows each account (role authenticated, as that account)"
ids $HOSTED
check "130|6" "$(as $HOSTED member-1 "select (select count(*) from public.messages where thread_id = $MAIN_ID)||'|'||(select count(*) from public.messages where thread_id = $FAM_ID)")" "member-1 (Mia) reads 130 in UCL Abacus and 6 in AbaFam (3 + notes)"
check "130|0" "$(as $HOSTED member-3 "select (select count(*) from public.messages where thread_id = $MAIN_ID)||'|'||(select count(*) from public.messages where thread_id = $FAM_ID)")" "member-3 (Mo) reads UCL Abacus but not AbaFam"
check "0|0" "$(as $HOSTED outsider "select (select count(*) from public.messages where thread_id = $MAIN_ID)||'|'||(select count(*) from public.messages where thread_id = $FAM_ID)")" "outsider reads neither"
check "0|0" "$(as $HOSTED pending-1 "select (select count(*) from public.messages where thread_id = $MAIN_ID)||'|'||(select count(*) from public.messages where thread_id = $FAM_ID)")" "pending-1 (waiting) reads neither"
check "130|6" "$(as $HOSTED ada "select (select count(*) from public.messages where thread_id = $MAIN_ID)||'|'||(select count(*) from public.messages where thread_id = $FAM_ID)")" "ada (Function admin, no place in UCL Abacus) reads both"
check "UCL Abacus:0,UCL Abacus · AbaFam:0" "$(as $HOSTED member-1 "select string_agg(title||':'||unread, ',' order by title) from public.my_chat_list() where kind = 'community'")" "member-1's Chats tab: UCL Abacus and UCL Abacus · AbaFam, nothing unread"
check "UCL Abacus:0" "$(as $HOSTED member-3 "select string_agg(title||':'||unread, ',' order by title) from public.my_chat_list() where kind = 'community'")" "member-3's Chats tab: UCL Abacus only"
check "" "$(as $HOSTED outsider "select string_agg(title, ',') from public.my_chat_list() where kind = 'community'")" "outsider's Chats tab: no community chats"
check "Abby:admin:member,Cole:committee:member,Max:regular:member,Mia:regular:member,Mo:regular:member,Nina:regular:non_member" "$(as $HOSTED member-1 "select string_agg(nickname||':'||role||':'||membership, ',' order by role, nickname) from public.thread_member_roles($MAIN_ID)")" "role colours and tags in the chat: Abby admin, Cole committee, Mia/Max/Mo paying members, Nina non-member"
check "active|regular|member|UCL Abacus,AbaFam|null" "$(as $HOSTED member-1 "select (h->'me'->>'status')||'|'||(h->'me'->>'role')||'|'||(h->'me'->>'membership')||'|'||(select string_agg(g->>'name', ',' order by (g->>'kind') <> 'main') from jsonb_array_elements(h->'groups') g)||'|'||coalesce(h->>'pending_requests', 'null') from public.community_home('ucl-abacus') h")" "member-1's community page: active paying member, sees UCL Abacus + AbaFam, no requests list"
check "active|committee|1|Penny:true" "$(as $HOSTED abacus-committee "select (h->'me'->>'status')||'|'||(h->'me'->>'role')||'|'||(h->>'pending_requests')||'|'||(select string_agg(nickname||':'||membership_claimed, ',') from public.community_requests($CID_ID)) from public.community_home('ucl-abacus') h")" "abacus-committee's Manage: 1 request waiting (Penny, says she's a paying member)"
check "pending|0" "$(as $HOSTED pending-1 "select (h->'me'->>'status')||'|'||jsonb_array_length(h->'groups') from public.community_home('ucl-abacus') h")" "pending-1's community page: waiting for approval, no groups"
check "null|0" "$(as $HOSTED outsider "select coalesce(h->>'me', 'null')||'|'||jsonb_array_length(h->'groups') from public.community_home('ucl-abacus') h")" "outsider's community page: not in it"
check "true|UCL Abacus,AbaFam" "$(as $HOSTED ada "select (h->>'is_function_admin')||'|'||(select string_agg(g->>'name', ',' order by (g->>'kind') <> 'main') from jsonb_array_elements(h->'groups') g) from public.community_home('ucl-abacus') h")" "ada's community page: Function admin, sees every group"
echo "== 3f. scrolling back through the UCL Abacus chat with the app's paging (pages of 50, newest first, keyset on created_at then id), as member-1"
pg=$(as $HOSTED member-1 "do \$\$ declare cur_t timestamptz; cur_id uuid; got int; seq text := ''; pages text := ''; r record; begin
  loop
    got := 0;
    for r in select id, created_at, body from public.messages where thread_id = $MAIN_ID and (cur_t is null or (created_at <= cur_t and (created_at < cur_t or id < cur_id))) order by created_at desc, id desc limit 50 loop
      got := got + 1; seq := seq || substr(r.body, 14, 3) || ' '; cur_t := r.created_at; cur_id := r.id;
    end loop;
    pages := pages || got || ' ';
    exit when got < 50;
  end loop;
  raise notice 'pages=% seq=%', btrim(pages), btrim(seq);
end \$\$" 2>&1 | sed -n 's/.*NOTICE:  //p')
want_seq=$(seq 130 -1 1 | xargs printf '%03d ' | sed 's/ $//')
check "pages=50 50 30 seq=$want_seq" "$pg" "3 pages (50, 50, 30): 130 down to 001, nothing missing, nothing twice"
naive=$(as $HOSTED member-1 "select string_agg(substr(body, 14, 3), ' ' order by created_at desc, id desc) from (select * from public.messages where thread_id = $MAIN_ID and created_at < (select min(created_at) from (select created_at from public.messages where thread_id = $MAIN_ID order by created_at desc, id desc limit 50) p) order by created_at desc, id desc limit 3) x")
check "079 078 077" "$naive" "(why the tie is there: paging by time alone would jump from 081 to 079 and lose 080)"
echo "== 3g. live chat: who may listen to the UCL Abacus chat's topic (the realtime.messages rule 05 adds)"
for who in member-1 nonmember-1 outsider pending-1; do
  n=$(psql -X -At -v ON_ERROR_STOP=1 -d $HOSTED -c "select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where email = '$who@$DOM'))::text, false), set_config('realtime.topic', 'thread:'||$MAIN, false)" -c "set role authenticated" -c "select count(*) from realtime.messages" | tail -1)
  echo "  $who sees $n broadcasts on thread:<UCL Abacus chat>"; eval "rt_$(echo $who | tr -d -)=$n"
done
[ "$rt_member1" -gt 0 ] && [ "$rt_nonmember1" -gt 0 ] && [ "$rt_outsider" = 0 ] && [ "$rt_pending1" = 0 ] && pass "people in the chat can listen; the outsider and the waiting request can't" || fail "realtime listener rule"
echo "== 3h. running things again"
h1=$(datahash $HOSTED)
if out=$("${PSQL[@]}" -1 -d $HOSTED -f "$F91" 2>&1); then pass "91 run 2 -> OK ($(echo "$out" | grep -c 'already has a place') accounts reported as already in place, left as they are)"; else fail "91 run 2: $(echo "$out" | grep -m1 ERROR)"; fi
check "$h1" "$(datahash $HOSTED)" "91 run 2 changed nothing at all (every row of communities, members, groups, chats, reads, mutes, messages, notifications, profiles)"
run1 $HOSTED "$F5" && pass "05 pasted again after 91 -> OK" || fail "05 again after 91"
check "$h1" "$(datahash $HOSTED)" "05 pasted again kept everything exactly (no row changed)"
same_schema $HOSTED "hosted-shaped, after 05 + 91 + 91 + 05"
"${PSQL[@]}" -1 -d $HOSTED -f "$F91" >/dev/null 2>&1 && check "$h1" "$(datahash $HOSTED)" "91 run 3 (after 05 again) -> OK, still nothing changed" || fail "91 run 3"
echo "  rows: $(q $HOSTED "select 'community_members='||(select count(*) from public.community_members)||' thread_participants='||(select count(*) from public.thread_participants)||' community_group_members='||(select count(*) from public.community_group_members)||' messages='||(select count(*) from public.messages)||' push_queue='||(select count(*) from public.push_queue)||' realtime.messages='||(select count(*) from realtime.messages)")"

echo "== 3i. a newer 05 pasted over an older one (PREV_REV=${PREV_REV:-unset})"
if [ -n "${PREV_REV:-}" ]; then
  U=${P}upgrade; mkdir -p "$W/prev"; cp "$S"/[0-9][0-9]-setup-part-*.sql "$W/prev/"
  if python3 -I "$C/build_c5.py" --repo "$R" --rev "$PREV_REV" --out "$W/prev" --no-readme > "$W/prev.log" 2>&1; then
    newdb $U; "${PSQL[@]}" -d $U -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1
    for p in "$S"/[0-9][0-9]-setup-part-*.sql "$F90"; do "${PSQL[@]}" -1 -d $U -f "$p" >/dev/null 2>&1 || fail "upgrade db: $(basename "$p")"; done
    phones $U
    run1 $U "$W/prev/05-setup-communities.sql" | sed "s/^/  [from $PREV_REV] /"; run1 $U "$W/prev/91-test-community-roles.sql" | sed "s/^/  [from $PREV_REV] /"
    u1=$(datahash $U)
    run1 $U "$F5" && pass "this 05 ($REV) pasted over the one from $PREV_REV -> OK" || fail "05 over $PREV_REV"
    same_schema $U "05 from $PREV_REV, then 05 from $REV"
    run1 $U "$F91" >/dev/null && pass "this 91 after it -> OK" || fail "91 after upgrade"
    check "$u1" "$(datahash $U)" "every row from before the upgrade kept, nothing doubled (if this fails, the diff shows which table: a newer 91 may add rows on purpose)"
    "${PSQL[@]}" -d postgres -c "drop database if exists $U" >/dev/null 2>&1
  else fail "build_c5.py --rev $PREV_REV: $(cat "$W/prev.log")"; fi
else echo "  skipped: set PREV_REV to the code version of the 05 last pasted (in its header) when proving a newer one"; fi

echo "== 3j. a lived-in test project: chats and messages already there before 05 (left by the app's own tests of the code in parts 01-04, kept instead of rolled back)"
PARTS_REV=$(sed -n 's/^-- Made by check\/build\.py from code version \([0-9a-f]*\)\. .*/\1/p' "$S/01-setup-part-1.sql")
L=${P}lived; mkdir -p "$W/old"; git -C "$R" archive "$PARTS_REV" supabase/tests supabase/migrations | tar -x -C "$W/old"
newdb $L; "${PSQL[@]}" -d $L -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1
for p in "$S"/[0-9][0-9]-setup-part-*.sql "$F90"; do "${PSQL[@]}" -1 -d $L -f "$p" >/dev/null 2>&1 || fail "lived db: $(basename "$p")"; done
kept=""; for t in leave_group_chat chat_pins_admins reporting_blocking split_payments; do
  sed 's/^rollback;$/commit;/' "$W/old/supabase/tests/$t.test.sql" > "$W/old/supabase/tests/_keep_$t.sql"
  (cd "$W/old/supabase/tests" && "${PSQL[@]}" -d $L -f fixtures.sql -f "_keep_$t.sql" >/dev/null 2>&1) && kept="$kept $t" || fail "keeping $t ($PARTS_REV)"
done
oldmsgs="select md5(string_agg(m.id||m.thread_id::text||coalesce(m.sender_id::text,'')||m.body||m.kind||m.created_at, '|' order by m.id)) from public.messages m"
oldpq="select md5(string_agg(q.id||q.user_id::text||q.title||q.body||coalesce(q.sent_at::text,''), '|' order by q.id)) from public.push_queue q"
before="$(q $L "select count(*) from public.threads")|$(q $L "select count(*) from public.messages")|$(q $L "select count(*) from public.push_queue")"
m0=$(q $L "$oldmsgs"); pq0=$(q $L "$oldpq")
echo "  before 05 (from$kept at $PARTS_REV): threads|messages|queued notifications = $before; event/social/private chats = $(q $L "select count(*) filter (where event_id is not null)||'/'||count(*) filter (where social_event_id is not null)||'/'||count(*) filter (where user_a is not null) from public.threads"); message kinds: $(q $L "select string_agg(distinct kind, ',') from public.messages")"
ok=1; for f in "$F5" "$F5" "$F91" "$F91"; do run1 $L "$f" >/dev/null || ok=0; done
[ $ok = 1 ] && pass "05, 05, 91, 91 on the lived-in database -> OK" || fail "lived-in database"
check "$(q $L "select count(*) filter (where event_id is not null)||'/'||count(*) filter (where social_event_id is not null)||'/'||count(*) filter (where user_a is not null)||'/'||count(*) filter (where community_group_id is not null) from public.threads")" "$(q $L "select count(*) filter (where kind = 'event')||'/'||count(*) filter (where kind = 'social')||'/'||count(*) filter (where kind = 'direct')||'/'||count(*) filter (where kind = 'community') from public.threads")" "the existing chats got the right threads.kind (event/social/private), the 2 new ones 'community'"
check "$m0" "$(q $L "$oldmsgs where m.thread_id not in (select id from public.threads where community_group_id is not null)")" "every message that was already there is unchanged"
check "$pq0" "$(q $L "$oldpq")" "the notification queue is exactly as it was (91 only takes off what its own messages queued)"
same_schema $L "lived-in, after 05, 05, 91, 91"
"${PSQL[@]}" -d postgres -c "drop database if exists $L" >/dev/null 2>&1

echo "== 4. testers' changes in the app survive a re-run; requests made in the app before 91's first run are approved the database's way"
newdb $EDGE; "${PSQL[@]}" -d $EDGE -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1
for p in "$S"/[0-9][0-9]-setup-part-*.sql "$F90" "$F5"; do "${PSQL[@]}" -1 -d $EDGE -f "$p" >/dev/null 2>&1 || fail "edge db: $(basename "$p")"; done
q $EDGE "insert into auth.users (id, email) values ('57a9e000-0000-4000-e000-000000000001', 'tester@lse.ac.uk')" >/dev/null
as $EDGE member-2 "select public.request_to_join('ucl-abacus', 'Maxi', false)" >/dev/null
psql -X -At -d $EDGE -c "select set_config('request.jwt.claims', '{\"sub\": \"57a9e000-0000-4000-e000-000000000001\"}', false)" -c "set role authenticated" -c "select public.request_to_join('ucl-abacus', 'Mia', true)" >/dev/null
echo "  before 91: member-2 asked to join in the app as 'Maxi' (not ticking paying member); a tester's own account asked as 'Mia'"
if out=$("${PSQL[@]}" -1 -d $EDGE -f "$F91" 2>&1); then pass "91 -> OK"; else fail "91 on edge: $(echo "$out" | grep -m1 ERROR)"; fi
check "Maxi/regular/member/active/false/abacus-admin" "$(q $EDGE "select m.nickname||'/'||m.role||'/'||m.membership||'/'||m.status||'/'||m.membership_claimed||'/'||split_part(c.email,'@',1) from public.community_members m join public.profiles p on p.id = m.user_id join public.profiles c on c.id = m.membership_confirmed_by where p.email = 'member-2@$DOM'")" "member-2's waiting request was approved as the admin would (paying member, confirmed by Abby), keeping the nickname and claim they chose"
check "Mia Test" "$(q $EDGE "select m.nickname from public.community_members m join public.profiles p on p.id = m.user_id where p.email = 'member-1@$DOM'")" "member-1: 'Mia' was taken by the tester, so the database's own choice was used ('Mia Test', the profile nickname)"
check "pending" "$(q $EDGE "select status from public.community_members where user_id = '57a9e000-0000-4000-e000-000000000001'")" "the tester's own request is untouched"
check "130" "$(q $EDGE "select count(*) from public.messages where thread_id = $MAIN")" "130 messages"
ids $EDGE
as $EDGE abacus-admin "select public.remove_community_member($CID_ID, '$(id_of $EDGE member-3)')" >/dev/null
as $EDGE abacus-admin "select public.set_community_role($CID_ID, '$(id_of $EDGE member-1)', 'committee')" >/dev/null
as $EDGE abacus-committee "select public.approve_request($CID_ID, '$(id_of $EDGE pending-1)', false)" >/dev/null
as $EDGE nonmember-1 "select public.update_my_community_nickname($CID_ID, 'Nina B')" >/dev/null
as $EDGE abacus-committee "select public.remove_group_member($FAMG_ID, '$(id_of $EDGE member-2)')" >/dev/null
as $EDGE member-1 "select public.delete_message('57a9e000-0000-4000-c000-000000000050')" >/dev/null
echo "  then in the app: Abby removed Mo and made Mia committee; Cole approved Penny (non-member) and took Max out of AbaFam; Nina renamed herself 'Nina B'; Mia deleted message 050"
e1=$(datahash $EDGE); pl1=$(places $EDGE)
if out=$("${PSQL[@]}" -1 -d $EDGE -f "$F91" 2>&1); then pass "91 run 2 -> OK"; else fail "91 run 2 on edge: $(echo "$out" | grep -m1 ERROR)"; fi
check "$e1" "$(datahash $EDGE)" "91 run 2 undid none of it and added nothing (every row identical)"
echo "  $pl1"
check "removed|(deleted)" "$(q $EDGE "select (select status from public.community_members m join public.profiles p on p.id = m.user_id where p.email = 'member-3@$DOM')||'|'||(select body from public.messages where id = '57a9e000-0000-4000-c000-000000000050')")" "Mo stays removed (so can't rejoin), message 050 stays deleted"

echo "== 4b. after 91 has run: a test account deleted and made again (90 run again), then 91 again"
newdb $RERUN; "${PSQL[@]}" -d $RERUN -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1
for p in "$S"/[0-9][0-9]-setup-part-*.sql "$F90" "$F5" "$F91"; do "${PSQL[@]}" -1 -d $RERUN -f "$p" >/dev/null 2>&1 || fail "rerun db: $(basename "$p")"; done
ids $RERUN
famrows() { q "$1" "select coalesce(string_agg(split_part(p.email,'@',1)||'@'||gm.added_at, ',' order by p.email), 'nobody') from public.community_group_members gm join public.profiles p on p.id = gm.user_id where gm.group_id = $FAMG_ID"; }
nonote="select count(*) from public.community_group_members gm where gm.group_id = $FAMG_ID and not exists (select 1 from public.messages x where x.thread_id = $FAM_ID and ((x.kind = 'joined' and x.sender_id = gm.user_id) or (x.kind = 'added' and x.subject_user_id = gm.user_id)))"
memrow() { q "$1" "select coalesce((select m.nickname||'/'||m.role||'/'||m.membership||'/'||m.status||'/'||m.membership_claimed||'/'||m.requested_at||'/'||coalesce(m.decided_at::text, '-')||'/'||coalesce(m.membership_confirmed_at::text, '-') from public.community_members m join public.profiles p on p.id = m.user_id where m.community_id = $CID and p.email = '$2@$DOM'), 'none')"; }
check "abacus-committee,member-1,member-2" "$(famrows $RERUN | sed 's/@[^,]*//g')" "after 91: Cole, Mia and Max in AbaFam"
q $RERUN "delete from auth.users where email = 'member-2@$DOM'" >/dev/null
check "none|abacus-committee,member-1" "$(memrow $RERUN member-2)|$(famrows $RERUN | sed 's/@[^,]*//g')" "member-2's account deleted: no place in UCL Abacus, out of AbaFam (the 'added Max' note stays, now about nobody)"
run1 $RERUN "$F90" >/dev/null && pass "90 run again: member-2 comes back as a new account" || fail "90 again"
others0="$(for a in abacus-admin abacus-committee member-1 member-3 nonmember-1 pending-1; do memrow $RERUN $a; done | md5sum | cut -c1-8)"
if out=$("${PSQL[@]}" -1 -d $RERUN -f "$F91" 2>&1); then pass "91 run 2 -> OK"; else fail "91 run 2 on rerun db: $(echo "$out" | grep -m1 ERROR)"; fi
echo "$out" | grep -o 'NOTICE:  .*\(run here before\|put back\).*' | sed 's/^/  /'
check "Max/regular/member/active/true|t|f" "$(memrow $RERUN member-2 | cut -d/ -f1-5)|$(q $RERUN "select exists (select 1 from public.thread_participants where thread_id = $MAIN and user_id = '$(id_of $RERUN member-2)')")|$(q $RERUN "select exists (select 1 from public.thread_participants where thread_id = $FAM and user_id = '$(id_of $RERUN member-2)')")" "member-2 gets a place again (as 90 says: a deleted account comes back as new) and is in the UCL Abacus chat, but NOT put back in AbaFam (its 'added' note is already there, so it would have no note)"
check "abacus-committee,member-1|0" "$(famrows $RERUN | sed 's/@[^,]*//g')|$(q $RERUN "$nonote")" "AbaFam: still Cole and Mia; nobody in it without their 'joined'/'added' note"
check "$others0" "$(for a in abacus-admin abacus-committee member-1 member-3 nonmember-1 pending-1; do memrow $RERUN $a; done | md5sum | cut -c1-8)" "everyone else's place untouched"

echo "== 4c. after 91 has run: testers leave UCL Abacus and ask to join again in the app, then 91 again: the requests stay waiting"
as $RERUN member-1 "select public.leave_community($CID_ID)" >/dev/null
as $RERUN member-1 "select public.request_to_join('ucl-abacus', 'Mia', true)" >/dev/null
as $RERUN abacus-committee "select public.leave_community($CID_ID)" >/dev/null
as $RERUN abacus-committee "select public.request_to_join('ucl-abacus', 'Cole', false)" >/dev/null
check "Mia/regular/non_member/pending/true|Cole/regular/non_member/pending/false|nobody" "$(memrow $RERUN member-1 | cut -d/ -f1-5)|$(memrow $RERUN abacus-committee | cut -d/ -f1-5)|$(famrows $RERUN)" "in the app: Mia and Cole left (so out of AbaFam) and asked to join again (Mia ticking paying member, Cole not)"
r1=$(datahash $RERUN); mm1="$(memrow $RERUN member-1) $(memrow $RERUN abacus-committee)"
if out=$("${PSQL[@]}" -1 -d $RERUN -f "$F91" 2>&1); then pass "91 run 3 -> OK"; else fail "91 run 3 on rerun db: $(echo "$out" | grep -m1 ERROR)"; fi
echo "$out" | grep -o 'NOTICE:  .*\(run here before\|member-1\|abacus-committee\).*' | sed 's/^/  /'
check "$mm1|nobody" "$(memrow $RERUN member-1) $(memrow $RERUN abacus-committee)|$(famrows $RERUN)" "both requests still waiting, exactly as the testers left them (not approved, role and paying-member status not given back); nobody put back in AbaFam"
check "$r1" "$(datahash $RERUN)" "91 run 3 changed nothing at all (every row identical)"
check "Mia:true,Cole:false" "$(as $RERUN abacus-admin "select string_agg(nickname||':'||membership_claimed, ',' order by requested_at desc) from public.community_requests($CID_ID) where nickname in ('Mia', 'Cole')")" "Abby (admin) sees both requests in Manage, to approve or decline in the app"

echo "== 5. WITHOUT the realtime schema (hosted-shaped auth, realtime dropped): parts + 90 + 05 twice + 91"
newdb $NORT; "${PSQL[@]}" -d $NORT -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1; q $NORT "drop schema realtime cascade" >/dev/null 2>&1
check "" "$(q $NORT "select nspname from pg_namespace where nspname = 'realtime'")" "no realtime schema"
ok=1; for p in "$S"/[0-9][0-9]-setup-part-*.sql "$F90"; do run1 $NORT "$p" >/dev/null || ok=0; done; [ $ok = 1 ] || fail "parts on no-realtime"
run1 $NORT "$F5" && pass "05 run 1 -> OK without realtime" || fail "05 without realtime"
run1 $NORT "$F5" && pass "05 run 2 -> OK without realtime" || fail "05 run 2 without realtime"
check "0" "$(q $NORT "select count(*) from pg_policies where policyname = 'function_thread_listeners'")" "the live-chat listener rule was skipped (there's nothing to put it on)"
same_schema $NORT "no realtime, after 05 twice"
if out=$("${PSQL[@]}" -1 -d $NORT -f "$F91" 2>&1); then pass "91 -> OK without realtime"; else fail "91 without realtime: $(echo "$out" | grep -m1 ERROR)"; fi
check "130|6" "$(q $NORT "select (select count(*) from public.messages where thread_id = $MAIN)||'|'||(select count(*) from public.messages where thread_id = $FAM)")" "130 + 6 messages: sending still works when the live broadcast can't (it's skipped, never an error)"

echo "== 6. guards (each refused paste changes nothing)"
newdb $G; "${PSQL[@]}" -d $G -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1
parts=("$S"/[0-9][0-9]-setup-part-*.sql); M=${#parts[@]}
echo "  -- an empty project:"
expect_stop $G "$F5" "$NOT_TEST"
expect_stop $G "$F91" "$NOT_TEST"
for p in "${parts[@]:0:$((M - 1))}"; do "${PSQL[@]}" -1 -d $G -f "$p" >/dev/null 2>&1; done
echo "  -- parts 1 to $((M - 1)) only (part $M skipped):"
expect_stop $G "$F5" "STOP: part $M has not been run here yet"
"${PSQL[@]}" -1 -d $G -f "${parts[$((M - 1))]}" >/dev/null 2>&1
echo "  -- all $M parts, no 05, no 90:"
expect_stop $G "$F91" "STOP: run 05-setup-communities.sql first"
"${PSQL[@]}" -1 -d $G -f "$F5" >/dev/null 2>&1
echo "  -- all $M parts + 05, no 90:"
expect_stop $G "$F91" "STOP: run 90-test-accounts.sql first"
"${PSQL[@]}" -1 -d $G -f "$F90" >/dev/null 2>&1
q $G "delete from auth.users where email = 'outsider@$DOM'" >/dev/null
echo "  -- 90 run, then one test account deleted:"
expect_stop $G "$F91" "STOP: run 90-test-accounts.sql first"
"${PSQL[@]}" -1 -d $G -f "$F90" >/dev/null 2>&1
q $G "insert into auth.users (id, email) select gen_random_uuid(), 'student'||g||'@lse.ac.uk' from generate_series(1, 6) g" >/dev/null
echo "  -- the test project plus 6 accounts that aren't test accounts:"
expect_stop $G "$F91" "STOP: this database already has real accounts"
q $G "delete from auth.users where email = 'student6@lse.ac.uk'" >/dev/null
run1 $G "$F91" | sed 's/$/   (with 5 such accounts it runs)/'
echo "  -- a real-like database: every migration (communities too, as the real one will have) + seed one by one, 40 @lse.ac.uk accounts, no cron/Vault rows:"
newdb $G; "${PSQL[@]}" -d $G -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1
for f in "$W"/repo/supabase/migrations/*.sql "$W/repo/supabase/seed.sql"; do "${PSQL[@]}" -d $G -f "$f" >/dev/null 2>"$W/rl.err" || { fail "real-like build: $(basename "$f"): $(grep -m1 ERROR "$W/rl.err")"; break; }; done
q $G "insert into auth.users (id, email) select gen_random_uuid(), 'student'||g||'@lse.ac.uk' from generate_series(1, 40) g" >/dev/null
dump $G "$W/rl-before.sql"; rl1=$(datahash $G)
expect_stop $G "$F5" "$NOT_TEST"
expect_stop $G "$F91" "$NOT_TEST"
dump $G "$W/rl-after.sql"
diff -q "$W/rl-before.sql" "$W/rl-after.sql" >/dev/null && [ "$rl1" = "$(datahash $G)" ] && pass "real-like database unchanged (same schema, every row the same)" || fail "real-like database changed"
echo "  -- more than 50 accounts, and the real project's timers/secrets:"
newdb $G; "${PSQL[@]}" -d $G -f "$W/stubs-hosted-realtime.sql" >/dev/null 2>&1
for p in "${parts[@]}" "$F90" "$F5"; do "${PSQL[@]}" -1 -d $G -f "$p" >/dev/null 2>&1; done
q $G "insert into auth.users (id, email) select gen_random_uuid(), 'someone'||g||'@lse.ac.uk' from generate_series(1, 51) g" >/dev/null
expect_stop $G "$F5" "STOP: this looks like your real Function database (it has real accounts)"
expect_stop $G "$F91" "STOP: this looks like your real Function database (it has real accounts)"
q $G "delete from auth.users where email like 'someone%@lse.ac.uk'" >/dev/null
"${PSQL[@]}" -d $G -c "create schema cron; create table cron.job (jobname text, command text);" >/dev/null
q $G "insert into cron.job values ('function-send-push', 'select net.http_post(url := ''https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/send-push'')')" >/dev/null
expect_stop $G "$F5" "its timers or secrets point at the real project"
expect_stop $G "$F91" "its timers or secrets point at the real project"
q $G "delete from cron.job; insert into vault.secrets (name, secret) values ('function_send_push_url', 'https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/send-push')" >/dev/null
expect_stop $G "$F5" "its timers or secrets point at the real project"
expect_stop $G "$F91" "its timers or secrets point at the real project"
q $G "update vault.secrets set secret = 'https://pvldkzjrrhcnwctveemu.supabase.co/functions/v1/send-push'" >/dev/null
run1 $G "$F5" | sed 's/$/   (staging-address secret: not mistaken for the real one)/'
run1 $G "$F91" | sed 's/$/   (likewise)/'

for d in $REF $PARTS $TESTS $HOSTED $EDGE $RERUN $NORT $G; do "${PSQL[@]}" -d postgres -c "drop database if exists $d" >/dev/null 2>&1; done
rm -rf "$W/repo" "$W/old" "$W/prev" "$W/rebuild"
echo "== dropped the ${P}* databases and the copies of the app's files (the dumps stay in check/work_c5/)"
echo "== RESULT: $fails failure(s)"
exit $fails
