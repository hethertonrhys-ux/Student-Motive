#!/bin/bash
# Restarts the static server for the Expo web build on :8123.
S=/tmp/claude-0/-home-user-student-motive/0c73a7c3-526a-584d-9f1d-8c0b2ea6f4ee/scratchpad
for pid in $(pgrep -f "serve-static.mjs"); do [ "$pid" != "$$" ] && [ "$pid" != "$PPID" ] && kill "$pid" 2>/dev/null; done
sleep 1
(setsid node $S/serve-static.mjs /home/user/student-motive/apps/mobile/dist 8123 > $S/serve-static.log 2>&1 < /dev/null &)
sleep 1; curl -s -o /dev/null -w "static server: %{http_code}\n" http://localhost:8123/login
