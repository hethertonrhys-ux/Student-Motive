#!/bin/bash
# Brings the test services up, rebuilds the web app, restarts the static server and runs a set of tests.
S=/tmp/claude-0/-home-user-student-motive/0c73a7c3-526a-584d-9f1d-8c0b2ea6f4ee/scratchpad
bash $S/up.sh
for port in 5499 3001 54321 54400; do (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null && echo "port $port: open" || echo "port $port: CLOSED"; done
cd /home/user/student-motive/apps/mobile && rm -rf dist && npx expo export --platform web --output-dir dist > $S/build.log 2>&1; echo "build exit $?"
bash $S/restart-static.sh
TESTS="${TESTS:-login web events profile account notify societies}" bash $S/run-expo.sh
