#!/usr/bin/env bash
# Database tests: builds a throwaway database from every migration, then runs
# each *.test.sql file in this folder. A test fails by raising an exception.
#
# Needs a local PostgreSQL 16 you can connect to as a superuser, e.g.
#   PGHOST=/var/tmp/motivepg PGPORT=5499 PGUSER=postgres bash supabase/tests/run.sh
# Never point this at the real Supabase project: it creates and drops a
# database called function_test.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
db="${TEST_DB:-function_test}"
psql_admin=(psql -X -q -v ON_ERROR_STOP=1 -d postgres)
psql_db=(psql -X -q -v ON_ERROR_STOP=1 -d "$db")

"${psql_admin[@]}" -c "drop database if exists $db" -c "create database $db" >/dev/null
"${psql_db[@]}" -f "$here/stubs.sql" >/dev/null 2>&1
for f in "$root"/supabase/migrations/*.sql "$root"/supabase/seed.sql; do
  "${psql_db[@]}" -f "$f" >/dev/null 2>"$here/.last-migration.log" || { echo "Migration failed: $f"; cat "$here/.last-migration.log"; exit 1; }
done
rm -f "$here/.last-migration.log"

fail=0
for t in "$here"/*.test.sql; do
  [ -e "$t" ] || continue
  name="$(basename "$t")"
  if out="$("${psql_db[@]}" -f "$here/fixtures.sql" -f "$t" 2>&1)"; then echo "PASS $name"; else echo "FAIL $name"; echo "$out" | grep -E "ERROR|NOTICE" | head -20; fail=1; fi
done
"${psql_admin[@]}" -c "drop database if exists $db" >/dev/null
exit $fail
