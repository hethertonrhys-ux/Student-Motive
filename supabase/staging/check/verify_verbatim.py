#!/usr/bin/env python3
"""Checks that the setup parts are the repo's files, verbatim and in order:
after each part's header and safety check, the rest of the part must be
exactly "-- ===== <file> =====\n" + <file's bytes> (+ newline if missing) + "\n"
for the files the header lists, and all parts together must cover every
migration up to the cutoff, then seed.sql, each exactly once.
Usage: python3 -I verify_verbatim.py <staging dir> <repo> <cutoff>
"""
import os
import re
import sys

staging, repo, cutoff = sys.argv[1], sys.argv[2], sys.argv[3]
mig = os.path.join(repo, "supabase", "migrations")
expected = [f for f in sorted(os.listdir(mig)) if f.endswith(".sql") and f[:14] <= cutoff] + ["seed.sql"]


def source(name):
    return open(os.path.join(repo, "supabase", name) if name == "seed.sql" else os.path.join(mig, name), encoding="utf-8").read()


# The one thing allowed after the app's files: the test-project marker at
# the end of part 1 (comment lines + exactly this one insert).
MARKER = re.compile(r"\n(-- ===== test-project marker \(not from the app's code; added by check/build\.py\) =====\n"
                    r"(?:--[^\n]*\n)*"
                    r"insert into public\.allowed_emails \(email, note\) values \('@staging\.studentfunction\.com', "
                    r"'Test accounts \(test project only\)'\) on conflict \(email\) do nothing;\n)\Z")

seen = []
bad = 0
parts = sorted(f for f in os.listdir(staging) if re.match(r"^\d\d-setup-part-\d+\.sql$", f))
for x, p in enumerate(parts):
    text = open(os.path.join(staging, p), encoding="utf-8").read()
    listed = re.findall(r"^--\s+\d+\. (\S+\.sql)(?: \(piece (\d+) of (\d+)\))?$", text, re.M)
    first_banner = text.find("\n-- ===== ") + 1
    body = text[first_banner:]
    mk = MARKER.search(body)
    if x == 0:
        if not mk:
            bad += 1
            print(f"{p}: MISSING the test-project marker at the end")
        else:
            body = body[:mk.start() + 1]
            print(f"{p}: ends with the test-project marker ({len(mk.group(1).encode())} bytes, one insert into public.allowed_emails)")
    elif mk:
        bad += 1
        print(f"{p}: has a test-project marker, but only part 1 may")
    if any(pc for _n, pc, _t in listed):
        print(f"{p}: contains pieces of a file; checked by statement elsewhere")
        continue
    want = ""
    for (name, _pc, _t) in listed:
        src = source(name)
        want += f"-- ===== {name} =====\n" + (src if src.endswith("\n") else src + "\n") + "\n"
        seen.append(name)
    if body == want:
        print(f"{p}: OK, {len(listed)} files verbatim ({len(body.encode())} of {len(text.encode())} bytes; the rest is the header and safety check)")
    else:
        bad += 1
        print(f"{p}: MISMATCH")
if seen == expected:
    print(f"all parts together: OK, {len(seen)} files ({len(expected) - 1} migrations + seed.sql), each once, in filename order")
else:
    bad += 1
    print("all parts together: MISMATCH", [x for x in expected if x not in seen], [x for x in seen if x not in expected])
sys.exit(1 if bad else 0)
