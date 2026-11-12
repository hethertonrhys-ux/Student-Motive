#!/usr/bin/env bash
# Proves the staging paste files LOCALLY (never touches Supabase):
#   1. a reference database built the normal way (repo stubs + every migration
#      up to the cutoff, one file at a time, + seed), like supabase/tests/run.sh;
#   2. a fresh database (repo stubs) + each part with psql -1 (one transaction,
#      like the SQL Editor);
#   3. a fresh database with hosted-shaped auth (check/stubs-hosted.sql) + each
#      part with -1 + 90-test-accounts.sql twice, then sign-in readiness checks;
#   4. public-schema dumps of 1, 2 and 3 compared (exactly, and ignoring order),
#      plus auth.users triggers, storage policies/buckets, realtime tables, row counts;
#   5. the guards: re-running a part, skipping a part, a "real" database.
# Usage: bash prove.sh   (CUTOFF=20261201000000 by default)
set -uo pipefail
export PGHOST=${PGHOST:-/var/tmp/motivepg} PGPORT=${PGPORT:-5499} PGUSER=${PGUSER:-postgres}
C="$(cd "$(dirname "$0")" && pwd)"
S="$(dirname "$C")"
R=${REPO:-/home/user/student-motive}
CUTOFF=${CUTOFF:-20261201000000}
STUBS=${STUBS:-$R/supabase/tests/stubs.sql}   # the repo's local Supabase stand-ins (read only)
W="$C/work"; rm -rf "$W"; mkdir -p "$W"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
REF=staging_sgprove_ref PARTS=staging_sgprove_parts HOSTED=staging_sgprove_hosted
fails=0
MARKER='@staging.studentfunction.com'
NOT_TEST='STOP: this is not the test project (part 1 of these files was never run here)'
NOT_TEST_1='STOP: this is not the test project (it already has the Function tables'
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; fails=$((fails + 1)); }
newdb() { "${PSQL[@]}" -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null 2>&1; }
q() { psql -X -At -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
# Runs a file as ONE transaction, like the SQL Editor; prints one line.
run1() { local db=$1 f=$2 out t0 t one=-1; grep -q '^-- \[runs on its own' "$f" && one=; t0=$(date +%s.%N); if out=$("${PSQL[@]}" $one -d "$db" -f "$f" 2>&1 >/dev/null); then t=$(echo "$(date +%s.%N) - $t0" | bc); echo "  $(basename "$f") -> OK (exit 0, ${t:0:4}s)${out:+, server notices: $(echo "$out" | grep -c NOTICE)}"; return 0; else echo "  $(basename "$f") -> ERROR: $(echo "$out" | grep -m1 ERROR)"; return 1; fi; }
# Runs a file that must be refused by its guard with a given message.
expect_stop() { local db=$1 f=$2 want=$3 out; if out=$("${PSQL[@]}" -1 -d "$db" -f "$f" 2>&1 >/dev/null); then fail "$(basename "$f") on $db ran but should have stopped ($want)"; else if echo "$out" | grep -q -F "$want"; then pass "$(basename "$f") on $db stopped: $(echo "$out" | grep -m1 -o 'STOP:.*')"; else fail "$(basename "$f") on $db failed differently: $(echo "$out" | grep -m1 ERROR)"; fi; fi; }
dump() { pg_dump --schema-only --no-owner --no-privileges -n public -d "$1" | grep -v -E '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
dumpacl() { pg_dump --schema-only -n public -d "$1" | grep -v -E '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
extras() {
  q "$1" "select 'auth.users trigger: '||tgname||' '||tgfoid::regproc from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal order by 1"
  q "$1" "select 'storage policy: '||policyname||' '||cmd||' '||coalesce(qual,'')||' '||coalesce(with_check,'') from pg_policies where schemaname='storage' order by 1"
  q "$1" "select 'bucket: '||id||' public='||public||' limit='||coalesce(file_size_limit::text,'-')||' types='||coalesce(allowed_mime_types::text,'-') from storage.buckets order by 1"
  q "$1" "select 'realtime: '||schemaname||'.'||tablename from pg_publication_tables where pubname='supabase_realtime' order by 1"
  q "$1" "select 'enum '||t.typname||': '||string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' group by t.typname order by 1"
  # The test-project marker that part 1 adds is the one row a normal build doesn't have: left out here, checked on its own.
  for t in $(q "$1" "select tablename from pg_tables where schemaname='public' order by 1"); do
    if [ "$t" = allowed_emails ]; then echo "rows public.$t (not counting the test-project marker): $(q "$1" "select count(*) from public.$t where email <> '$MARKER'")"
    else echo "rows public.$t: $(q "$1" "select count(*) from public.$t")"; fi
  done
}

echo "== prove.sh $(date -u '+%Y-%m-%d %H:%M UTC'), repo $(git -C "$R" rev-parse --short HEAD), cutoff $CUTOFF, $(psql -X -At -d postgres -c 'show server_version')"
echo "== stand-ins: $STUBS (sha256 $(sha256sum "$STUBS" | cut -c1-12))"
echo "== files"
( cd "$S" && ls -l --time-style=+ *.sql README.txt test-accounts.txt | awk '{print "  "$5" bytes  "$6}' )

echo "== 0a. the parts are the repo's files, verbatim, in order"
python3 -I "$C/verify_verbatim.py" "$S" "$R" "$CUTOFF" && pass "verbatim check" || fail "verbatim check"
echo "== 0. plaintext password is only in test-accounts.txt"
PW=$(sed -n 's/^Password (the same for every test account): \([A-Za-z0-9]*\)\r\{0,1\}$/\1/p' "$S/test-accounts.txt")
if [ ${#PW} -ge 20 ] && [[ "$PW" =~ ^[A-Za-z0-9]+$ ]]; then pass "password is ${#PW} letters/digits"; else fail "password missing or wrong shape"; fi
hits=$(grep -r -l -F "$PW" "$S" 2>/dev/null | grep -v -x "$S/test-accounts.txt" || true)
if [ -z "$hits" ]; then pass "password appears in no other file under staging/"; else fail "password found in: $hits"; fi

echo "== 1. reference database, the normal way (repo stubs + each file on its own + seed)"
newdb $REF
"${PSQL[@]}" -d $REF -f "$STUBS" >/dev/null 2>&1
n=0; ok=1
for f in "$R"/supabase/migrations/*.sql; do
  b=$(basename "$f"); [[ "${b:0:14}" > "$CUTOFF" ]] && { echo "  skipped (newer than cutoff): $b"; continue; }
  "${PSQL[@]}" -d $REF -f "$f" >/dev/null 2>"$W/ref.err" || { fail "reference build: $b: $(grep -m1 ERROR "$W/ref.err")"; ok=0; break; }
  n=$((n + 1))
done
"${PSQL[@]}" -d $REF -f "$R/supabase/seed.sql" >/dev/null 2>"$W/ref.err" || { fail "reference seed: $(grep -m1 ERROR "$W/ref.err")"; ok=0; }
[ $ok = 1 ] && pass "reference: $n migrations + seed applied one by one"

echo "== 2. fresh database (repo stubs) + each part as ONE transaction (psql -X -q -1 -v ON_ERROR_STOP=1 -f)"
newdb $PARTS
"${PSQL[@]}" -d $PARTS -f "$STUBS" >/dev/null 2>&1
ok=1; for p in "$S"/[0-9][0-9]-setup-part-*.sql; do run1 $PARTS "$p" || ok=0; done
[ $ok = 1 ] && pass "all parts applied in order, each in one transaction" || fail "a part failed"
mk_parts=$(q $PARTS "select count(*) from public.allowed_emails where email = '$MARKER' and note = 'Test accounts (test project only)'")
mk_ref=$(q $REF "select count(*) from public.allowed_emails where email = '$MARKER'")
[ "$mk_parts" = 1 ] && [ "$mk_ref" = 0 ] && pass "part 1 added the test-project marker (allowed_emails '$MARKER'); the normal build has none" || fail "marker: parts=$mk_parts reference=$mk_ref"

echo "== 3. fresh database (hosted-shaped auth: check/stubs-hosted.sql) + parts + 90-test-accounts.sql twice"
python3 -I "$C/make_hosted_stubs.py" "$STUBS" "$C/stubs-hosted.sql"
newdb $HOSTED
"${PSQL[@]}" -d $HOSTED -f "$C/stubs-hosted.sql" >/dev/null 2>"$W/hs.err" || fail "hosted stubs: $(cat "$W/hs.err")"
ok=1; for p in "$S"/[0-9][0-9]-setup-part-*.sql; do run1 $HOSTED "$p" || ok=0; done
[ $ok = 1 ] && pass "all parts applied on hosted-shaped auth" || fail "a part failed on hosted-shaped auth"
for round in 1 2; do
  if out=$("${PSQL[@]}" -1 -d $HOSTED -f "$S/90-test-accounts.sql" 2>&1); then
    rows=$(echo "$out" | grep -c '@staging.studentfunction.com'); pass "90-test-accounts.sql run $round -> OK, summary lists $rows accounts"
    [ $round = 2 ] && { echo "  summary table (run 2):"; echo "$out" | sed 's/^/    /'; }
  else fail "90-test-accounts.sql run $round: $(echo "$out" | grep -m1 ERROR)"; fi
  echo "  after run $round: users=$(q $HOSTED "select count(*) from auth.users") identities=$(q $HOSTED "select count(*) from auth.identities") profiles=$(q $HOSTED "select count(*) from public.profiles") allowed_emails=$(q $HOSTED "select string_agg(email, ',') from public.allowed_emails")"
done
[ "$(q $HOSTED "select count(*) from auth.users")" = 9 ] && [ "$(q $HOSTED "select count(*) from auth.identities")" = 9 ] && pass "exactly 9 users and 9 identities after two runs" || fail "row counts after two runs"

echo "== 3b. sign-in readiness (what GoTrue needs) and the app's account gate"
nulls=$(q $HOSTED "select count(*) from auth.users where email like '%@staging.studentfunction.com' and (instance_id is distinct from '00000000-0000-0000-0000-000000000000' or aud is distinct from 'authenticated' or role is distinct from 'authenticated' or email is null or encrypted_password is null or email_confirmed_at is null or confirmed_at is null or confirmation_token is null or recovery_token is null or email_change_token_new is null or email_change is null or email_change_token_current is null or email_change_confirm_status is null or phone_change is null or phone_change_token is null or reauthentication_token is null or raw_app_meta_data is distinct from '{\"provider\": \"email\", \"providers\": [\"email\"]}'::jsonb or raw_user_meta_data is distinct from '{}'::jsonb or created_at is null or updated_at is null or is_sso_user or is_anonymous or deleted_at is not null or banned_until is not null or phone is not null)")
[ "$nulls" = 0 ] && pass "all 9 users: instance_id/aud/role right, every GoTrue string column '' (not NULL), confirmed, app/user metadata right" || fail "$nulls users have a NULL/wrong GoTrue column"
bad=$(q $HOSTED "select count(*) from auth.identities i join auth.users u on u.id = i.user_id where i.provider <> 'email' or i.provider_id <> u.id::text or i.identity_data is distinct from jsonb_build_object('sub', u.id::text, 'email', u.email::text, 'email_verified', true, 'phone_verified', false) or i.email is distinct from lower(u.email) or i.last_sign_in_at is null or i.created_at is null or i.updated_at is null")
[ "$bad" = 0 ] && pass "all 9 identities: provider email, provider_id = user id, identity_data {sub,email,email_verified,phone_verified}, generated email matches" || fail "$bad identities wrong"
# The password goes to the local server through stdin only.
hashok=$(psql -X -At -v ON_ERROR_STOP=1 -d $HOSTED -f - <<EOF
select count(*) from auth.users where email like '%@staging.studentfunction.com' and substr(encrypted_password, 1, 7) in ('\$2a\$10\$', '\$2b\$10\$') and length(encrypted_password) = 60 and extensions.crypt('$PW', encrypted_password) = encrypted_password;
EOF
)
[ "$hashok" = 9 ] && pass "the password in test-accounts.txt matches all 9 bcrypt hashes (cost 10, checked with pgcrypto crypt())" || fail "bcrypt check matched $hashok of 9"
wrong=$(q $HOSTED "select count(*) from auth.users where extensions.crypt('wrong-password-123', encrypted_password) = encrypted_password")
[ "$wrong" = 0 ] && pass "a wrong password matches none" || fail "wrong password matched $wrong"
gate=$(q $HOSTED "select count(*) from public.profiles where email like '%@staging.studentfunction.com' and btrim(coalesce(full_name, '')) <> '' and array_length(regexp_split_to_array(btrim(full_name), ' '), 1) >= 2 and graduation_year between extract(year from now())::int and extract(year from now())::int + 7 and coalesce(display_name, '') <> '' and university is not null")
[ "$gate" = 9 ] && pass "9 profiles pass the app's account gate (full_name with first+last, graduation_year in the app's list, display_name, university)" || fail "only $gate profiles pass the gate"
adm=$(q $HOSTED "select string_agg(email, ',') from public.profiles where is_admin")
[ "$adm" = "ada@staging.studentfunction.com" ] && pass "only ada is a Function admin" || fail "admins: $adm"
mfa=$(q $HOSTED "select count(*) from auth.mfa_factors")
[ "$mfa" = 0 ] && pass "no 2FA factors (the gate's first check passes)" || fail "mfa factors: $mfa"
q $HOSTED "select '  '||p.email||' | '||p.display_name||' | '||p.full_name||' | '||coalesce(p.nickname,'-')||' | '||p.university||' | '||p.graduation_year||' | admin='||p.is_admin from public.profiles p order by p.email"

echo "== 3c. a re-run keeps what testers changed (nickname removed as the app saves it, admin flag removed, details and password changed)"
q $HOSTED "update public.profiles set nickname = null, display_name = full_name where email = 'member-1@staging.studentfunction.com'; update public.profiles set is_admin = false where email = 'ada@staging.studentfunction.com'; update public.profiles set full_name = 'Max Changed Name', nickname = 'Maxi', display_name = 'Maxi', university = 'KCL', graduation_year = 2028 where email = 'member-2@staging.studentfunction.com'; update auth.users set encrypted_password = extensions.crypt('another-password-1', extensions.gen_salt('bf', 10)) where email = 'member-3@staging.studentfunction.com'" >/dev/null
before=$(q $HOSTED "select string_agg(p.email||'|'||coalesce(p.nickname,'NULL')||'|'||p.display_name||'|'||p.full_name||'|'||p.university||'|'||p.graduation_year||'|'||p.is_admin||'|'||u.encrypted_password, ';' order by p.email) from public.profiles p join auth.users u on u.id = p.id")
if out=$("${PSQL[@]}" -1 -d $HOSTED -f "$S/90-test-accounts.sql" 2>&1 >/dev/null); then pass "90-test-accounts.sql run 3 (after the testers' changes) -> OK"; else fail "90-test-accounts.sql run 3: $(echo "$out" | grep -m1 ERROR)"; fi
after=$(q $HOSTED "select string_agg(p.email||'|'||coalesce(p.nickname,'NULL')||'|'||p.display_name||'|'||p.full_name||'|'||p.university||'|'||p.graduation_year||'|'||p.is_admin||'|'||u.encrypted_password, ';' order by p.email) from public.profiles p join auth.users u on u.id = p.id")
[ "$before" = "$after" ] && pass "run 3 changed nothing in any profile or password" || fail "run 3 changed something"
q $HOSTED "select '  '||p.email||': nickname='||coalesce(p.nickname,'NULL')||', display_name='||p.display_name||', card name='||c.name||', card nickname='||coalesce(c.nickname,'NULL')||', admin='||p.is_admin from public.profiles p left join public.profile_cards c on c.id = p.id where p.email in ('member-1@staging.studentfunction.com', 'ada@staging.studentfunction.com') order by 1"
m1=$(q $HOSTED "select coalesce(nickname,'NULL')||'|'||display_name from public.profiles where email = 'member-1@staging.studentfunction.com'")
[ "$m1" = "NULL|Test Member One" ] && pass "member-1: removed nickname stays removed, shown name stays 'Test Member One'" || fail "member-1 after run 3: $m1"
[ "$(q $HOSTED "select is_admin from public.profiles where email = 'ada@staging.studentfunction.com'")" = f ] && pass "ada: removed admin flag stays removed" || fail "ada got her admin flag back"
[ "$(q $HOSTED "select full_name||'|'||nickname||'|'||university||'|'||graduation_year from public.profiles where email = 'member-2@staging.studentfunction.com'")" = "Max Changed Name|Maxi|KCL|2028" ] && pass "member-2: changed name, nickname, uni and year stay" || fail "member-2 changed back"
[ "$(q $HOSTED "select extensions.crypt('another-password-1', encrypted_password) = encrypted_password from auth.users where email = 'member-3@staging.studentfunction.com'")" = t ] && pass "member-3: changed password stays" || fail "member-3 password reset"
# Put them back for the rest of the checks.
q $HOSTED "delete from auth.users where email like '%@staging.studentfunction.com'" >/dev/null
if out=$("${PSQL[@]}" -1 -d $HOSTED -f "$S/90-test-accounts.sql" 2>&1 >/dev/null); then pass "after deleting all 9 accounts, run 4 -> OK"; else fail "run 4: $(echo "$out" | grep -m1 ERROR)"; fi
[ "$(q $HOSTED "select count(*)||'|'||count(*) filter (where is_admin)||'|'||count(*) filter (where nickname is not null and display_name = nickname) from public.profiles where email like '%@staging.studentfunction.com'")" = "9|1|9" ] && [ "$(q $HOSTED "select count(*) from auth.identities")" = 9 ] && pass "deleted accounts come back fully set up (9 profiles, 1 admin, nicknames shown, 9 identities)" || fail "accounts not restored"

echo "== 4. schema comparison (pg_dump --schema-only -n public)"
dump $REF "$W/ref.sql"; dump $PARTS "$W/parts.sql"; dump $HOSTED "$W/hosted.sql"
dumpacl $REF "$W/ref.acl.sql"; dumpacl $PARTS "$W/parts.acl.sql"
echo "  reference dump: $(wc -l < "$W/ref.sql") lines"
if diff -q "$W/ref.sql" "$W/parts.sql" >/dev/null; then pass "parts == reference (exact, no reordering needed)"; else
  if diff <(sort "$W/ref.sql") <(sort "$W/parts.sql") >/dev/null; then pass "parts == reference apart from ordering"; else fail "parts differ from reference"; diff "$W/ref.sql" "$W/parts.sql" | head -20; fi; fi
if diff -q "$W/ref.acl.sql" "$W/parts.acl.sql" >/dev/null; then pass "parts == reference including owners and grants"; else fail "owners/grants differ"; diff "$W/ref.acl.sql" "$W/parts.acl.sql" | head -20; fi
if diff -q "$W/ref.sql" "$W/hosted.sql" >/dev/null; then pass "hosted-shaped == reference (exact)"; else
  if diff <(sort "$W/ref.sql") <(sort "$W/hosted.sql") >/dev/null; then pass "hosted-shaped == reference apart from ordering"; else fail "hosted-shaped differs from reference"; diff "$W/ref.sql" "$W/hosted.sql" | head -20; fi; fi
extras $REF > "$W/ref.extras"; extras $PARTS > "$W/parts.extras"
if diff -q "$W/ref.extras" "$W/parts.extras" >/dev/null; then pass "auth.users triggers, storage policies, buckets, realtime tables, enums, row counts of every public table: identical ($(wc -l < "$W/ref.extras") lines)"; else fail "extras differ"; diff "$W/ref.extras" "$W/parts.extras" | head; fi
grep -E '^(auth.users trigger|bucket|realtime)' "$W/ref.extras" | sed 's/^/  /'

echo "== 5. guards (each refused paste changes nothing)"
dump $PARTS "$W/before-guards.sql"
for p in "$S"/[0-9][0-9]-setup-part-*.sql; do grep -q "^-- \[runs on its own" "$p" && continue; k=$(basename "$p" | sed 's/^[0-9]*-setup-part-\([0-9]*\)\.sql/\1/'); expect_stop $PARTS "$p" "part $k has already been run here"; done
dump $PARTS "$W/after-guards.sql"
diff -q "$W/before-guards.sql" "$W/after-guards.sql" >/dev/null && pass "schema unchanged after the refused re-runs" || fail "schema changed by a refused re-run"
G=staging_sgprove_guard
newdb $G; "${PSQL[@]}" -d $G -f "$C/stubs-hosted.sql" >/dev/null 2>&1
parts=("$S"/[0-9][0-9]-setup-part-*.sql); M=${#parts[@]}
echo "  -- an empty project (part 1 skipped):"
expect_stop $G "$S/90-test-accounts.sql" "$NOT_TEST"
if [ $M -ge 2 ]; then expect_stop $G "${parts[1]}" "$NOT_TEST"; fi
run1 $G "${parts[0]}" >/dev/null
echo "  -- after part 1 only:"
if [ $M -ge 3 ]; then expect_stop $G "${parts[2]}" "part 2 has not been run here yet"; fi
expect_stop $G "$S/90-test-accounts.sql" "run all $M setup parts first"
# A real-like database: built the normal way (each migration on its own + seed, like the
# real project), 40 real-looking accounts (50 or fewer), no timers or Vault secrets.
echo "  -- a real-like database: every migration + seed one by one, 40 @lse.ac.uk accounts, no cron/Vault rows:"
newdb $G; "${PSQL[@]}" -d $G -f "$C/stubs-hosted.sql" >/dev/null 2>&1; ok=1
for f in "$R"/supabase/migrations/*.sql "$R/supabase/seed.sql"; do b=$(basename "$f"); [ "$b" != seed.sql ] && [[ "${b:0:14}" > "$CUTOFF" ]] && continue; "${PSQL[@]}" -d $G -f "$f" >/dev/null 2>"$W/rl.err" || { fail "real-like build: $b: $(grep -m1 ERROR "$W/rl.err")"; ok=0; break; }; done
q $G "insert into auth.users (id, email) select gen_random_uuid(), 'student'||g||'@lse.ac.uk' from generate_series(1, 40) g" >/dev/null
echo "  real-like: users=$(q $G "select count(*) from auth.users") profiles=$(q $G "select count(*) from public.profiles") allowed_emails=$(q $G "select count(*) from public.allowed_emails") cron.job=$(q $G "select coalesce(to_regclass('cron.job')::text, 'absent')") vault.secrets=$(q $G "select count(*) from vault.secrets")"
dump $G "$W/rl-before.sql"; rl_before=$(q $G "select count(*)||'|'||(select count(*) from public.allowed_emails)||'|'||(select count(*) from public.profiles) from auth.users")
expect_stop $G "${parts[0]}" "$NOT_TEST_1"
for p in "${parts[@]:1}"; do expect_stop $G "$p" "$NOT_TEST"; done
expect_stop $G "$S/90-test-accounts.sql" "$NOT_TEST"
dump $G "$W/rl-after.sql"; rl_after=$(q $G "select count(*)||'|'||(select count(*) from public.allowed_emails)||'|'||(select count(*) from public.profiles) from auth.users")
diff -q "$W/rl-before.sql" "$W/rl-after.sql" >/dev/null && [ "$rl_before" = "$rl_after" ] && [ "$(q $G "select count(*) from public.profiles where email like '%@staging.studentfunction.com'")" = 0 ] && pass "real-like database unchanged: same schema, users|allowed_emails|profiles still $rl_after, no test accounts" || fail "real-like database changed ($rl_before -> $rl_after)"
# The test project after all parts, but with more than 5 accounts of its own.
echo "  -- the test project after all parts, plus 6 accounts that aren't test accounts:"
newdb $G; "${PSQL[@]}" -d $G -f "$C/stubs-hosted.sql" >/dev/null 2>&1
for p in "${parts[@]}"; do run1 $G "$p" >/dev/null; done
q $G "insert into auth.users (id, email) select gen_random_uuid(), 'student'||g||'@lse.ac.uk' from generate_series(1, 6) g" >/dev/null
expect_stop $G "$S/90-test-accounts.sql" "STOP: this database already has real accounts"
q $G "delete from auth.users where email = 'student6@lse.ac.uk'" >/dev/null
run1 $G "$S/90-test-accounts.sql" | sed 's/$/   (with 5 such accounts it runs)/'
echo "  -- a database with more than 50 accounts (like the real one):"
# A database with more than 50 accounts (like the real one).
newdb $G; "${PSQL[@]}" -d $G -f "$C/stubs-hosted.sql" >/dev/null 2>&1
q $G "insert into auth.users (id, email) select gen_random_uuid(), 'someone'||g||'@example.com' from generate_series(1, 51) g" >/dev/null
expect_stop $G "${parts[0]}" "STOP: this looks like your real Function database (it has real accounts)"
expect_stop $G "$S/90-test-accounts.sql" "STOP: this looks like your real Function database (it has real accounts)"
"${PSQL[@]}" -d $G -c "create schema cron; create table cron.job (jobname text, command text);" >/dev/null
q $G "delete from auth.users" >/dev/null
q $G "insert into cron.job values ('function-send-push', 'select net.http_post(url := ''https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/send-push'')')" >/dev/null
expect_stop $G "${parts[0]}" "its timers or secrets point at the real project"
expect_stop $G "$S/90-test-accounts.sql" "its timers or secrets point at the real project"
q $G "delete from cron.job; insert into vault.secrets (name, secret) values ('function_send_push_url', 'https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/send-push')" >/dev/null
expect_stop $G "${parts[0]}" "its timers or secrets point at the real project"
q $G "update vault.secrets set secret = 'https://pvldkzjrrhcnwctveemu.supabase.co/functions/v1/send-push'" >/dev/null
run1 $G "${parts[0]}" | sed 's/$/   (staging-address secret and an empty timer list: not mistaken for the real one)/'

echo "== 6. for the record: every file in ONE transaction, no split (shows whether the split is required today)"
O=staging_sgprove_onetx; newdb $O; "${PSQL[@]}" -d $O -f "$STUBS" >/dev/null 2>&1
cat "$S"/[0-9][0-9]-setup-part-*.sql > "$W/all-in-one.sql"
if out=$("${PSQL[@]}" -1 -d $O -f "$W/all-in-one.sql" 2>&1 >/dev/null); then echo "  all parts as one transaction: OK (no enum hazard is triggered by today's files)"; else echo "  all parts as one transaction: $(echo "$out" | grep -m1 ERROR)"; fi

for d in $REF $PARTS $HOSTED $G $O; do "${PSQL[@]}" -d postgres -c "drop database if exists $d" >/dev/null 2>&1; done
echo "== dropped the staging_sgprove_* databases"
echo "== RESULT: $fails failure(s)"
exit $fails
