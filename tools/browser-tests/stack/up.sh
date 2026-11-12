# Starts every local test server if it isn't running.
S=/tmp/claude-0/-home-user-student-motive/0c73a7c3-526a-584d-9f1d-8c0b2ea6f4ee/scratchpad
up() { (echo > /dev/tcp/127.0.0.1/$1) 2>/dev/null; }
if ! up 5499; then rm -f /var/tmp/motivepg/data/postmaster.pid; (setsid nohup su postgres -c "/usr/lib/postgresql/16/bin/postgres -D /var/tmp/motivepg/data -p 5499 -k /var/tmp/motivepg" > /tmp/claude-0/pg.log 2>&1 < /dev/null &); sleep 3; fi
if ! up 3001; then (cd /tmp/claude-0/pgrst && setsid nohup ./postgrest pgrst.conf > out.log 2>&1 < /dev/null &); fi
if ! up 54321; then (cd /tmp/claude-0/fakeauth && setsid nohup node server.mjs > log.txt 2>&1 < /dev/null &); fi
if ! up 54400; then (DELAY=${DELAY:-0} LOG=$S/perf/db.log PORT=54400 setsid nohup node $S/perf/delayproxy.mjs > $S/perf/proxy.out 2>&1 < /dev/null &); fi
sleep 2; for p in 5499 3001 54321 54400; do up $p || echo "PORT $p DOWN"; done
