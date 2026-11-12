#!/usr/bin/env python3
"""Checks 05-setup-communities.sql against the repo's files: after its
header and safety check, the rest must be exactly
"-- ===== <file> =====\\n" + <file's bytes> (+ newline if missing) + "\\n"
for every migration newer than the pasted cutoff, in filename order; the
safety check must refuse the real database the same ways as parts 1-4 and
must NOT refuse a second run. Also checks 91-test-community-roles.sql was
made from the same code version.
Usage: python3 -I verify_c5.py <staging dir> <repo dir (an extracted copy)> <pasted cutoff>
"""
import os
import re
import sys

staging, repo, cutoff = sys.argv[1], sys.argv[2], sys.argv[3]
mig = os.path.join(repo, "supabase", "migrations")
expected = [f for f in sorted(os.listdir(mig)) if f.endswith(".sql") and f[:14] > cutoff]
bad = 0


def say(ok, msg):
    global bad
    if not ok:
        bad += 1
    print(("OK: " if ok else "MISMATCH: ") + msg)


text = open(os.path.join(staging, "05-setup-communities.sql"), encoding="utf-8").read()
head_end = text.index("\n-- ===== ") + 1
header, body = text[:head_end], text[head_end:]
listed = re.findall(r"^--\s+\d+\. (\S+\.sql)$", header[:header.index("-- Made by")], re.M)
say(listed == expected, f"05 lists {listed}; the repo's migrations newer than {cutoff}: {expected}")
want = "".join(f"-- ===== {n} =====\n" + (s if s.endswith("\n") else s + "\n") + "\n"
               for n in listed for s in [open(os.path.join(mig, n), encoding="utf-8").read()])
say(body == want, f"05: {len(listed)} file(s) verbatim ({len(body.encode())} of {len(text.encode())} bytes; the rest is the header and safety check)")
guard = header[header.index("do $$"):]
for need in ["if (select count(*) from auth.users) > 50 then",
             "cron.job where command like ''%xrpbmcoptyrpgkdowfdt%''",
             "vault.decrypted_secrets where decrypted_secret like ''%xrpbmcoptyrpgkdowfdt%''",
             "if to_regclass('public.allowed_emails') is null then",
             "where email = '@staging.studentfunction.com') then",
             "if to_regclass('public.thread_leaves') is null then"]:
    say(need in guard, f"05 safety check has: {need}")
say("has already been run here" not in guard, "05 safety check does not refuse a second run")
say(guard.count("raise exception") == 5, f"05 safety check raises in {guard.count('raise exception')} places (real x2, not test x2, part 4 missing)")
v5 = re.search(r"^-- Made by check/build_c5\.py from code version (\w+)\.", text, re.M)
t91 = open(os.path.join(staging, "91-test-community-roles.sql"), encoding="utf-8").read()
v91 = re.search(r"^-- Made by check/build_c5\.py from code version (\w+)\.", t91, re.M)
say(bool(v5 and v91 and v5.group(1) == v91.group(1)), f"05 and 91 come from the same code version ({v5 and v5.group(1)}, {v91 and v91.group(1)})")
sys.exit(1 if bad else 0)
