# Runs the Expo browser tests against the static build on :8123, resetting the test database before each.
S=/tmp/claude-0/-home-user-student-motive/0c73a7c3-526a-584d-9f1d-8c0b2ea6f4ee/scratchpad
TESTS=${TESTS:-"login web events map societies eventfull social profile chats committee delete-account account chats-tabs notify recommend"}
fail=0
for t in $TESTS; do
  timeout 110 bash $S/reset-db.sh > $S/reset.log 2>&1 < /dev/null
  (cd $S && timeout 500 node expo/$t.mjs $S > $S/run-$t.txt 2>&1 < /dev/null)
  if grep -q "errors: \[\]" $S/run-$t.txt && ! grep -q "TimeoutError\|Error:" $S/run-$t.txt; then echo "PASS $t"; else echo "FAIL $t"; tail -6 $S/run-$t.txt; fail=1; fi
done
echo "suite exit: $fail"; exit $fail
