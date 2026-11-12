#!/usr/bin/env python3
"""Builds the paste-in SQL files for the Function TEST Supabase project
(function-staging, project ref pvldkzjrrhcnwctveemu).

Writes, into the staging folder (the parent of this check/ folder):
  01-setup-part-1.sql, 02-setup-part-2.sql, ...   every migration up to the
      cutoff, then seed.sql, verbatim, each behind a "-- ===== <file> ====="
      banner, split at file boundaries into parts of roughly 80-130 KB and
      wherever one paste (= one transaction) would break;
  90-test-accounts.sql                            the staging test accounts;
  test-accounts.txt                               the shared password (plaintext,
      ONLY here) and the email list;
  README.txt                                      the owner's step-by-step.

Re-run it after a new migration lands, e.g.
  python3 -I build.py --cutoff 20261202000000
It keeps the same password (read back from test-accounts.txt) and the same
bcrypt hash (check/password.bcrypt) so re-running changes nothing that
doesn't need to change. It needs the local PostgreSQL (for pgcrypto, to make
and check the bcrypt hash): PGHOST/PGPORT/PGUSER, default the local test
server. It never connects to Supabase.
"""
import argparse
import datetime
import os
import re
import secrets
import string
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STAGING_REF = "pvldkzjrrhcnwctveemu"
REAL_REF = "xrpbmcoptyrpgkdowfdt"
TEST_DOMAIN = "staging.studentfunction.com"

REAL_DB_MESSAGE = ("STOP: this looks like your real Function database (it has real accounts). "
                   "These files are only for the test project function-staging.")
REAL_DB_MESSAGE_2 = ("STOP: this looks like your real Function database (its timers or secrets point at the real project "
                     + REAL_REF + "). These files are only for the test project function-staging.")

# The test-project marker: an allowed_emails row that only a successful
# part 1 on an empty project creates (part 1 always stops on the real
# database, because the real one already has public.profiles). Every later
# file refuses to run unless it is there.
MARKER_EMAIL = "@" + TEST_DOMAIN
MARKER_NOTE = "Test accounts (test project only)"
MARKER_SQL = (f"insert into public.allowed_emails (email, note) values ('{MARKER_EMAIL}', '{MARKER_NOTE}') "
              "on conflict (email) do nothing;")
MARKER_BANNER = "-- ===== test-project marker (not from the app's code; added by check/build.py) ====="
NOT_TEST_MESSAGE = ("STOP: this is not the test project (part 1 of these files was never run here). Nothing was changed. "
                    f"Check the web address contains {STAGING_REF}: if it does, part 1 was skipped, so run part 1 first; "
                    "if it does not, stop, you are in the wrong project.")
NOT_TEST_MESSAGE_1 = ("STOP: this is not the test project (it already has the Function tables, but part 1 of these files "
                      "was never run here). Nothing was changed. These files are only for the test project "
                      f"function-staging ({STAGING_REF}).")
HAS_REAL_ACCOUNTS_MESSAGE = ("STOP: this database already has real accounts; these test accounts are only for "
                             f"function-staging ({STAGING_REF}). Nothing was changed.")
# The messages go inside '...' in the SQL, so they must not contain a quote.
for _msg in (REAL_DB_MESSAGE, REAL_DB_MESSAGE_2, NOT_TEST_MESSAGE, NOT_TEST_MESSAGE_1, HAS_REAL_ACCOUNTS_MESSAGE):
    assert "'" not in _msg, _msg


MARKER_HEADER_NOTE = f"""
-- At its very end it adds one line of its own: it lets addresses at
-- {MARKER_EMAIL} sign up (for the test accounts), and marks this
-- database as the test project, which the later files check for.
--"""
MARKER_TRAILER = f"""{MARKER_BANNER}
-- Lets the test accounts (@{TEST_DOMAIN}) sign up, and marks this
-- database as the TEST project: parts 2 onwards and 90-test-accounts.sql
-- refuse to run where this line is missing (like the real project).
{MARKER_SQL}
"""


def already_run_message(k, nxt):
    msg = (f"STOP: part {k} has already been run here, so nothing was changed. Only if your browser address "
           f"contains {STAGING_REF}, go on to {nxt}; otherwise stop, you are in the wrong project.")
    assert "'" not in msg, msg
    return msg


def marker_checks(num):
    """Two separate IFs: plpgsql plans the subquery only when that IF is
    reached, so a database without allowed_emails stops at the first one."""
    return f"""  -- {num}. Only the test project has the marker that part 1 adds at its end.
  if to_regclass('public.allowed_emails') is null then
    raise exception '{NOT_TEST_MESSAGE}';
  end if;
  if not exists (select 1 from public.allowed_emails where email = '{MARKER_EMAIL}') then
    raise exception '{NOT_TEST_MESSAGE}';
  end if;
"""


class BuildError(Exception):
    pass


# ---------------------------------------------------------------------------
# A small SQL lexer: splits a file into top-level statements, knowing about
# comments (-- and nested /* */), '...' and E'...' strings, "identifiers",
# $tag$ dollar quotes, BEGIN ATOMIC bodies and psql backslash commands.
# ---------------------------------------------------------------------------
DOLLAR = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$")
WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_$]*")


def split_statements(sql, name):
    """Returns (statements, trailing) where each statement is a dict with
    start, end, line, code (comments blanked out, strings kept) and
    trailing is the code after the last semicolon (should be empty)."""
    stmts = []
    i, n = 0, len(sql)
    start = 0
    buf = []
    has_code = False
    atomic_depth = None  # None = not inside a BEGIN ATOMIC body
    line_start = True
    meta = []
    while i < n:
        c = sql[i]
        if c == "\n":
            buf.append(c)
            i += 1
            line_start = True
            continue
        if line_start and c in " \t\r":
            buf.append(c)
            i += 1
            continue
        if line_start and c == "\\":
            meta.append(sql.count("\n", 0, i) + 1)
        line_start = False
        if sql.startswith("--", i):
            j = sql.find("\n", i)
            j = n if j == -1 else j
            buf.append(" ")
            i = j
            continue
        if sql.startswith("/*", i):
            depth, j = 1, i + 2
            while j < n and depth:
                if sql.startswith("/*", j):
                    depth, j = depth + 1, j + 2
                elif sql.startswith("*/", j):
                    depth, j = depth - 1, j + 2
                else:
                    j += 1
            if depth:
                raise BuildError(f"{name}: unterminated /* comment */ at line {sql.count(chr(10), 0, i) + 1}")
            buf.append(" ")
            i = j
            continue
        if c == "'":
            esc = i > 0 and sql[i - 1] in "eE" and not (i > 1 and (sql[i - 2].isalnum() or sql[i - 2] == "_"))
            j = i + 1
            while True:
                if j >= n:
                    raise BuildError(f"{name}: unterminated string at line {sql.count(chr(10), 0, i) + 1}")
                if esc and sql[j] == "\\":
                    j += 2
                    continue
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            buf.append(sql[i:j + 1])
            has_code = True
            i = j + 1
            continue
        if c == '"':
            j = i + 1
            while True:
                if j >= n:
                    raise BuildError(f"{name}: unterminated \"identifier\" at line {sql.count(chr(10), 0, i) + 1}")
                if sql[j] == '"':
                    if j + 1 < n and sql[j + 1] == '"':
                        j += 2
                        continue
                    break
                j += 1
            buf.append(sql[i:j + 1])
            has_code = True
            i = j + 1
            continue
        if c == "$" and not (i > 0 and (sql[i - 1].isalnum() or sql[i - 1] in "_$")):
            m = DOLLAR.match(sql, i)
            if m:
                tag = m.group(0)
                j = sql.find(tag, m.end())
                if j == -1:
                    raise BuildError(f"{name}: unterminated {tag} quote at line {sql.count(chr(10), 0, i) + 1}")
                buf.append(sql[i:j + len(tag)])
                has_code = True
                i = j + len(tag)
                continue
        if c.isalpha() or c == "_":
            m = WORD.match(sql, i)
            w = m.group(0).lower()
            buf.append(m.group(0))
            has_code = True
            i = m.end()
            if atomic_depth is None:
                if w == "atomic":
                    so_far = re.sub(r"\s+", " ", "".join(buf)).strip().lower()
                    if re.match(r"^create (or replace )?(function|procedure)\b", so_far) and re.search(r"\bbegin atomic$", so_far):
                        atomic_depth = 1
            else:
                if w in ("begin", "case"):
                    atomic_depth += 1
                elif w == "end":
                    atomic_depth -= 1
            continue
        if c == ";" and (atomic_depth is None or atomic_depth <= 0):
            buf.append(";")
            if has_code:
                stmts.append({"start": start, "end": i + 1, "line": 0, "code": "".join(buf)})
            start = i + 1
            buf = []
            has_code = False
            atomic_depth = None
            i += 1
            continue
        buf.append(c)
        if not c.isspace():
            has_code = True
        i += 1
    if meta:
        raise BuildError(f"{name}: psql backslash command(s) at line(s) {meta}: the SQL Editor can't run those")
    trailing = "".join(buf).strip() if has_code else ""
    lead = re.compile(r"(?:\s+|--[^\n]*(?:\n|$)|/\*.*?\*/)*", re.S)
    for s in stmts:
        s["norm"] = re.sub(r"\s+", " ", s["code"]).strip().lower()
        s["line"] = sql.count("\n", 0, s["start"] + lead.match(sql, s["start"], s["end"]).end() - s["start"] + s["start"] - s["start"]) + 1
    return stmts, trailing


# Statements that cannot run inside a transaction block (one paste = one
# transaction), so each needs a paste of its own with nothing else in it.
NON_TX = [
    r"^create (unique )?index concurrently\b",
    r"^create (unique )?index (if not exists )?\S* ?concurrently\b",
    r"^drop index concurrently\b",
    r"^reindex\b.*\bconcurrently\b",
    r"^reindex (database|system)\b",
    r"^vacuum\b",
    r"^alter system\b",
    r"^(create|drop) database\b",
    r"^alter database\b.*\bset tablespace\b",
    r"^(create|drop) tablespace\b",
    r"^cluster ?;$",
    r"^discard all\b",
    r"^(create|alter|drop) subscription\b",
    r"^(commit|rollback) prepared\b",
    r"^alter table\b.*\bdetach partition\b.*\bconcurrently\b",
]
# Transaction control would end the paste's transaction part-way through.
TX_CONTROL = r"^(begin|commit|rollback|end|abort|start transaction|savepoint|release|prepare transaction)\b"
# Session settings leak into every later file of the same paste.
SESSION_SET = [r"^set (?!local\b)", r"^reset\b", r"^select set_config\(.*, ?false\) ?;$", r"^set session authorization\b"]

ENUM_ADD = re.compile(r"^alter type (\S+) add value (?:if not exists )?'((?:[^']|'')*)'")
CREATE_REL = re.compile(r"^create (?:or replace )?(?:unlogged |temp |temporary )?(?:materialized )?(?:table|view) (?:if not exists )?public\.\"?(\w+)\"?")
CREATE_FN = re.compile(r"^create (?:or replace )?function public\.\"?(\w+)\"?")
RENAME_REL = re.compile(r"^alter (?:table|view) (?:if exists )?(?:only )?public\.(\w+) rename to \"?(\w+)\"?")
DROP_REL = re.compile(r"^drop (?:table|view|materialized view) (?:if exists )?(.+?)(?: cascade| restrict)? ?;$")
CREATE_IDX = re.compile(r"^create (?:unique )?index (?:concurrently )?(?:if not exists )?\"?(\w+)\"? on (?:only )?public\.")
DROP_IDX = re.compile(r"^drop index (?:concurrently )?(?:if exists )?(?:public\.)?\"?(\w+)\"?")
DROP_FN = re.compile(r"^drop function (?:if exists )?(.+?)(?: cascade| restrict)? ?;$")


def analyse(name, text):
    stmts, trailing = split_statements(text, name)
    info = {"name": name, "text": text, "stmts": stmts, "trailing": trailing,
            "enum_adds": [], "non_tx": [], "warnings": [], "creates": [], "drops": []}
    for s in stmts:
        norm = s["norm"]
        if re.match(TX_CONTROL, norm):
            raise BuildError(f"{name} line {s['line']}: transaction control ({norm[:40]}...) would break the one-transaction paste")
        if any(re.match(p, norm) for p in NON_TX):
            info["non_tx"].append(s)
        for p in SESSION_SET:
            if re.match(p, norm):
                info["warnings"].append(f"{name} line {s['line']}: session setting '{norm[:60]}' carries on into the later files of the same part")
        m = ENUM_ADD.match(norm)
        if m:
            label = re.search(r"add value (?:if not exists )?'((?:[^']|'')*)'", s["code"], re.I).group(1)
            info["enum_adds"].append((m.group(1), label, s["line"]))
        m = CREATE_REL.match(norm)
        if m:
            info["creates"].append(("rel", m.group(1), s["start"]))
        m = CREATE_FN.match(norm)
        if m:
            info["creates"].append(("fn", m.group(1), s["start"]))
        m = CREATE_IDX.match(norm)
        if m:
            info["creates"].append(("idx", m.group(1), s["start"]))
        m = DROP_IDX.match(norm)
        if m:
            info["drops"].append(("idx", m.group(1), s["start"]))
        m = RENAME_REL.match(norm)
        if m:
            info["drops"].append(("rel", m.group(1), s["start"]))
            info["creates"].append(("rel", m.group(2), s["start"]))
        m = DROP_REL.match(norm)
        if m:
            for obj in m.group(1).split(","):
                obj = obj.strip().strip('"')
                if obj.startswith("public."):
                    info["drops"].append(("rel", obj[7:].strip('"'), s["start"]))
        m = DROP_FN.match(norm)
        if m:
            for fm in re.finditer(r"public\.\"?(\w+)", m.group(1)):
                info["drops"].append(("fn", fm.group(1), s["start"]))
    if trailing:
        raise BuildError(f"{name}: the last statement has no closing semicolon; joining files would merge it with the next file")
    return info


# ---------------------------------------------------------------------------
# Units (a file, or a piece of one around a statement that must be pasted on
# its own) and the split into parts.
# ---------------------------------------------------------------------------
def make_units(files):
    units = []
    for f in files:
        text = f["text"]
        if not f["non_tx"]:
            units.append({"file": f, "text": text, "solo": False, "piece": None, "lo": 0, "hi": len(text)})
            continue
        cuts = []
        for s in f["non_tx"]:
            cuts += [s["start"], s["end"]]
        bounds = [0] + cuts + [len(text)]
        pieces = []
        for k in range(len(bounds) - 1):
            lo, hi = bounds[k], bounds[k + 1]
            seg = text[lo:hi]
            solo = any(s["start"] == lo for s in f["non_tx"])
            if not seg.strip():
                continue
            pieces.append({"file": f, "text": seg, "solo": solo, "lo": lo, "hi": hi})
        for idx, p in enumerate(pieces):
            p["piece"] = (idx + 1, len(pieces))
            units.append(p)
    return units


def unit_banner(u):
    name = u["file"]["name"]
    if u["piece"] is None:
        return f"-- ===== {name} =====\n"
    a, b = u["piece"]
    return f"-- ===== {name} (piece {a} of {b} of this file) =====\n"


def unit_body(u):
    t = u["text"]
    return t if t.endswith("\n") else t + "\n"


def mentions(text, label):
    return ("'" + label.replace("'", "''") + "'") in text


def segment_ok(units, i, j, max_bytes, overhead):
    seg = units[i:j]
    if len(seg) > 1 and any(u["solo"] for u in seg):
        return False
    size = sum(len(unit_banner(u)) + len(unit_body(u).encode()) for u in seg) + overhead
    if len(seg) > 1 and size > max_bytes:
        return False
    # A value added to an enum can't be used until the transaction that added
    # it has committed: no later file in the same part may mention it.
    for a in range(len(seg)):
        for (_typ, label, _line) in seg[a]["file"]["enum_adds"]:
            for b in range(a + 1, len(seg)):
                if seg[b]["file"] is not seg[a]["file"] and mentions(seg[b]["file"]["text"], label):
                    return False
    return True


def plan_parts(units, max_bytes, min_bytes, overhead):
    total = sum(len(unit_banner(u)) + len(unit_body(u).encode()) for u in units)
    nparts = max(1, -(-total // int(max_bytes * 0.85)))
    target = total / nparts
    INF = float("inf")
    m = len(units)
    best = [INF] * (m + 1)
    back = [None] * (m + 1)
    best[0] = 0.0
    for j in range(1, m + 1):
        for i in range(j - 1, -1, -1):
            if best[i] == INF:
                continue
            if not segment_ok(units, i, j, max_bytes, overhead):
                if any(u["solo"] for u in units[i:j]) and j - i > 1:
                    break
                size = sum(len(unit_banner(u)) + len(unit_body(u).encode()) for u in units[i:j]) + overhead
                if size > max_bytes:
                    break
                continue
            seg = units[i:j]
            size = sum(len(unit_banner(u)) + len(unit_body(u).encode()) for u in seg) + overhead
            if seg[0]["solo"]:
                cost = 0.0
            else:
                cost = ((size - target) / target) ** 2 + (1.0 if size < min_bytes else 0.0)
            if best[i] + cost < best[j]:
                best[j] = best[i] + cost
                back[j] = i
    if best[m] == INF:
        raise BuildError("couldn't split the files into parts (a single file over the size limit next to a hazard?)")
    cuts = []
    j = m
    while j > 0:
        cuts.append((back[j], j))
        j = back[j]
    return list(reversed(cuts))


def pick_signatures(parts, units):
    """For each part, an object it creates that no earlier part creates and
    nothing later drops: its existence means 'this part has been run'."""
    created_before = set()
    sigs = []
    all_drops = []
    for idx, (i, j) in enumerate(parts):
        for u in units[i:j]:
            for d in u["file"]["drops"]:
                if u["lo"] <= d[2] < u["hi"]:
                    all_drops.append((idx, u["file"]["name"], d[2], (d[0], d[1])))
    for idx, (i, j) in enumerate(parts):
        candidates = []
        for u in units[i:j]:
            for (kind, nm, pos) in u["file"]["creates"]:
                if not (u["lo"] <= pos < u["hi"]):
                    continue
                candidates.append((kind, nm, u, pos))
        sig = None
        for pref in ("rel", "fn", "idx"):
            for (kind, nm, u, pos) in candidates:
                if kind != pref or (kind, nm) in created_before:
                    continue
                dropped_later = any(dk == (kind, nm) and (didx > idx or (didx == idx and (dname, dpos) > (u["file"]["name"], pos)))
                                    for (didx, dname, dpos, dk) in all_drops)
                if dropped_later:
                    continue
                sig = (kind, nm)
                break
            if sig:
                break
        sigs.append(sig)
        for (kind, nm, u, pos) in candidates:
            created_before.add((kind, nm))
    return sigs


def sig_exists_sql(sig):
    kind, nm = sig
    if kind in ("rel", "idx"):
        return f"to_regclass('public.{nm}') is not null"
    return f"exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '{nm}')"


def sig_missing_sql(sig):
    kind, nm = sig
    if kind in ("rel", "idx"):
        return f"to_regclass('public.{nm}') is null"
    return "not " + sig_exists_sql(sig)


def real_db_checks():
    return f"""  -- 1. A real database has real accounts.
  if (select count(*) from auth.users) > 50 then
    raise exception '{REAL_DB_MESSAGE}';
  end if;
  -- 2. The real project's timers and push secret point at its own address.
  begin
    if to_regclass('cron.job') is not null then
      execute 'select exists (select 1 from cron.job where command like ''%{REAL_REF}%'')' into looks_real;
    end if;
    if not looks_real and to_regclass('vault.decrypted_secrets') is not null then
      execute 'select exists (select 1 from vault.decrypted_secrets where decrypted_secret like ''%{REAL_REF}%'')' into looks_real;
    end if;
  exception when others then
    null; -- can't look: check 1 still applies
  end;
  if looks_real then
    raise exception '{REAL_DB_MESSAGE_2}';
  end if;
"""


def guard_block(k, m, sigs):
    lines = ["-- Safety check first. It changes nothing; it stops the whole paste (so",
             "-- nothing at all is changed) if this isn't the test project, or if the",
             "-- parts are being run out of order or twice.",
             "do $$", "declare", "  looks_real boolean := false;", "begin", real_db_checks().rstrip("\n")]
    if k == 1:
        nxt = "part 2" if m > 1 else "90-test-accounts.sql"
        lines += ["  -- 3. Part 1 makes the profiles table, so if it's already here either part 1",
                  "  --    has run (then the marker part 1 adds at its end is here too) or this",
                  "  --    is a database that was set up some other way, like the real one.",
                  "  if to_regclass('public.profiles') is not null then",
                  "    if to_regclass('public.allowed_emails') is null then",
                  f"      raise exception '{NOT_TEST_MESSAGE_1}';",
                  "    end if;",
                  f"    if not exists (select 1 from public.allowed_emails where email = '{MARKER_EMAIL}') then",
                  f"      raise exception '{NOT_TEST_MESSAGE_1}';",
                  "    end if;",
                  f"    raise exception '{already_run_message(1, nxt)}';",
                  "  end if;"]
    else:
        lines += [marker_checks(3).rstrip("\n")]
        prev = next((sigs[x] for x in range(k - 2, -1, -1) if sigs[x]), None)
        if prev:
            lines += [f"  -- 4. Part {k - 1} must have been run first (it makes {prev[1]}{'()' if prev[0] == 'fn' else ''}).",
                      f"  if {sig_missing_sql(prev)} then",
                      f"    raise exception 'STOP: part {k - 1} has not been run here yet, so nothing was changed. Run the parts in order: part {k - 1} first.';",
                      "  end if;"]
        sig = sigs[k - 1]
        if sig:
            nxt = f"part {k + 1}" if k < m else "90-test-accounts.sql"
            lines += [f"  -- 5. This part makes {sig[1]}{'()' if sig[0] == 'fn' else ''}, so if it's already here this part has run.",
                      f"  if {sig_exists_sql(sig)} then",
                      f"    raise exception '{already_run_message(k, nxt)}';",
                      "  end if;"]
    lines += ["end $$;", ""]
    return "\n".join(lines) + "\n"


def part_header(k, m, seg_units, total_files, first_idx, commit):
    names = []
    for u in seg_units:
        nm = u["file"]["name"]
        if u["piece"]:
            nm += f" (piece {u['piece'][0]} of {u['piece'][1]})"
        names.append(nm)
    nxt = f"part {k + 1}" if k < m else "90-test-accounts.sql (the test accounts)"
    listing = "\n".join(f"--   {first_idx + x:>2}. {nm}" for x, nm in enumerate(names))
    return f"""-- =====================================================================
-- Function TEST database setup, part {k} of {m}. Paste into the SQL Editor
-- of the TEST project (function-staging) only, never the real one. Run
-- the parts in order.
--
-- The TEST project's web address contains {STAGING_REF}.
-- If the address in your browser contains {REAL_REF}, that is
-- the REAL project: stop, and don't run anything.
--
-- How: open this file in Notepad, press Ctrl+A then Ctrl+C, go to the
-- SQL Editor, click "New query", click in the empty box, press Ctrl+V,
-- then click "Run". It takes a few seconds. When it has worked you will
-- see "Success. No rows returned". Then do {nxt}.
--
-- If a red error appears instead, nothing has been changed (each part
-- runs all or nothing). Take a screenshot, send it, and don't change
-- anything in this file.
--
-- This part contains these files from the app's code, unchanged, in order
-- (files {first_idx} to {first_idx + len(names) - 1} of {total_files}):
{listing}
--{MARKER_HEADER_NOTE if k == 1 else ""}
-- Made by check/build.py from code version {commit}. Don't edit by hand.
-- =====================================================================

"""


# ---------------------------------------------------------------------------
# Test accounts.
# ---------------------------------------------------------------------------
ACCOUNTS = [
    # key, full name, nickname, university, Function admin
    ("ada", "Test Admin", "Ada Test", "LSE", True),
    ("abacus-admin", "Test Abacus Admin", "Abby Test", "UCL", False),
    ("abacus-committee", "Test Abacus Committee", "Cole Test", "UCL", False),
    ("member-1", "Test Member One", "Mia Test", "UCL", False),
    ("member-2", "Test Member Two", "Max Test", "UCL", False),
    ("member-3", "Test Member Three", "Mo Test", "UCL", False),
    ("nonmember-1", "Test Nonmember One", "Nina Test", "UCL", False),
    ("outsider", "Test Outsider", "Otto Test", "UCL", False),
    ("pending-1", "Test Pending One", "Penny Test", "UCL", False),
]
GRADUATION_YEAR = 2027


def user_id(n):
    return f"57a9e000-0000-4000-a000-{n:012d}"


def identity_id(n):
    return f"57a9e000-0000-4000-b000-{n:012d}"


def psql(sql, db="postgres"):
    env = dict(os.environ)
    env.setdefault("PGHOST", "/var/tmp/motivepg")
    env.setdefault("PGPORT", "5499")
    env.setdefault("PGUSER", "postgres")
    r = subprocess.run(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", "-"],
                       input=sql, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise BuildError("local psql failed (is the local test server up? see up.sh): " + r.stderr.strip())
    return r.stdout.strip()


def password_and_hash(out_dir):
    txt = os.path.join(out_dir, "test-accounts.txt")
    hash_file = os.path.join(HERE, "password.bcrypt")
    pw = None
    if os.path.exists(txt):
        m = re.search(r"^Password \(the same for every test account\): ([A-Za-z0-9]{20,})$", open(txt).read(), re.M)
        if m:
            pw = m.group(1)
    if pw is None:
        alphabet = string.ascii_letters + string.digits
        while True:
            pw = "".join(secrets.choice(alphabet) for _ in range(24))
            if any(c.isdigit() for c in pw) and any(c.islower() for c in pw) and any(c.isupper() for c in pw):
                break
    hashed = open(hash_file).read().strip() if os.path.exists(hash_file) else None
    db = "staging_sgbuild_hash"
    # The password only ever goes to the local server through stdin.
    out = psql(f"drop database if exists {db};\ncreate database {db};\n")
    try:
        psql("create extension if not exists pgcrypto;\n", db)
        if not hashed or psql(f"select crypt('{pw}', '{hashed}') = '{hashed}';\n", db) != "t":
            hashed = psql(f"select crypt('{pw}', gen_salt('bf', 10));\n", db)
        if not re.match(r"^\$2[ab]\$10\$[./A-Za-z0-9]{53}$", hashed):
            raise BuildError("unexpected bcrypt hash shape: " + hashed)
        if psql(f"select crypt('{pw}', '{hashed}') = '{hashed}';\n", db) != "t":
            raise BuildError("the bcrypt hash doesn't match the password")
    finally:
        psql(f"drop database if exists {db};\n")
    with open(hash_file, "w") as fh:
        fh.write(hashed + "\n")
    return pw, hashed


def accounts_sql(hashed, last_sig, m, commit):
    rows_users = ",\n".join(
        f"    ('{user_id(n)}'::uuid, '{key}@{TEST_DOMAIN}')" for n, (key, *_rest) in enumerate(ACCOUNTS, 1))
    rows_ident = ",\n".join(
        f"    ('{identity_id(n)}'::uuid, '{user_id(n)}'::uuid, '{key}@{TEST_DOMAIN}')" for n, (key, *_rest) in enumerate(ACCOUNTS, 1))
    rows_prof = ",\n".join(
        f"    ('{user_id(n)}'::uuid, '{full}', '{nick}', '{uni}', {'true' if admin else 'false'})"
        for n, (key, full, nick, uni, admin) in enumerate(ACCOUNTS, 1))
    emails = "\n".join(f"--   {key}@{TEST_DOMAIN}{'   (Function admin)' if admin else ''}" for (key, _f, _n, _u, admin) in ACCOUNTS)
    sig_check = ""
    if last_sig:
        sig_check = f"""  -- 5. All {m} setup parts must have been run first.
  if to_regclass('public.profiles') is null or {sig_missing_sql(last_sig)} then
    raise exception 'STOP: run all {m} setup parts first (01-setup-part-1.sql onwards), then this file. Nothing was changed.';
  end if;
"""
    test_checks = marker_checks(3) + f"""  -- 4. The test project has (almost) no accounts of its own.
  if (select count(*) from auth.users where coalesce(lower(email), '') not like '%{MARKER_EMAIL}') > 5 then
    raise exception '{HAS_REAL_ACCOUNTS_MESSAGE}';
  end if;
"""
    return f"""-- =====================================================================
-- Function TEST accounts. Paste into the SQL Editor of the TEST project
-- (function-staging) only, never the real one. Run it AFTER all {m}
-- setup parts.
--
-- The TEST project's web address contains {STAGING_REF}.
-- If the address in your browser contains {REAL_REF}, that is
-- the REAL project: stop, and don't run anything.
--
-- It makes these log-ins (email + password; the password is in
-- test-accounts.txt, never in this file):
{emails}
-- Each one is fully set up (name, nickname, uni, graduation year), so
-- the app goes straight in without asking for account details.
--
-- When it has worked you will see a small table listing the {len(ACCOUNTS)}
-- accounts. Running it again is harmless: it adds nothing twice and never
-- changes a password or anything a tester changed in the app (a nickname
-- or admin flag someone removed stays removed; a deleted account comes
-- back as new).
--
-- Made by check/build.py from code version {commit}. Don't edit by hand.
-- =====================================================================

do $$
declare
  looks_real boolean := false;
begin
{real_db_checks()}{test_checks}{sig_check}end $$;

-- 1. Addresses at @{TEST_DOMAIN} may sign up: part 1 added that at its
--    end (only the test project has it; sign-up is otherwise for London
--    uni emails only), and the safety check above made sure it is here.

-- 2. The accounts, the way Supabase Auth stores them. The password is
--    stored only as a bcrypt hash. Every text field Supabase Auth reads
--    is an empty string rather than empty (NULL), which it can't read.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, email_change_confirm_status,
  phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid, v.id, 'authenticated', 'authenticated', v.email,
  '{hashed}',
  now(), null,
  '', '', '', '',
  '', 0,
  '', '', '',
  '{{"provider": "email", "providers": ["email"]}}'::jsonb, '{{}}'::jsonb, false,
  now(), now()
from (values
{rows_users}
) as v(id, email)
where not exists (select 1 from auth.users u where u.id = v.id or lower(u.email) = v.email)
on conflict do nothing;

-- 3. Each account's email log-in (Supabase Auth needs one per account).
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  v.identity_id, v.user_id::text, v.user_id,
  jsonb_build_object('sub', v.user_id::text, 'email', v.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from (values
{rows_ident}
) as v(identity_id, user_id, email)
join auth.users u on u.id = v.user_id
where not exists (select 1 from auth.identities i where i.provider = 'email' and (i.provider_id = v.user_id::text or i.user_id = v.user_id))
on conflict do nothing;

-- 4. Their profiles (made automatically with each account): name,
--    nickname, uni and graduation year, so the app doesn't ask for them.
--    A profile with no full name yet is a new one: it gets everything.
--    On a later run only what's missing is filled in, so testers' own
--    changes stay: a nickname removed in the app (saved as no nickname)
--    or an admin flag someone took away stays removed.
update public.profiles p
set full_name = coalesce(nullif(btrim(p.full_name), ''), v.full_name),
    nickname = case when p.full_name is null then v.nickname else p.nickname end,
    display_name = coalesce(nullif(btrim(p.display_name), ''),
                            case when p.full_name is null then v.nickname else p.nickname end,
                            nullif(btrim(p.full_name), ''), v.full_name),
    graduation_year = coalesce(p.graduation_year, {GRADUATION_YEAR}),
    university = case when p.full_name is null then v.university else p.university end,
    is_admin = case when p.full_name is null then v.is_admin else p.is_admin end
from (values
{rows_prof}
) as v(id, full_name, nickname, university, is_admin)
where p.id = v.id;

-- 5. What's there now (you should see {len(ACCOUNTS)} rows).
select p.email, p.display_name, p.full_name, p.university, p.graduation_year, p.is_admin as function_admin,
       (u.encrypted_password like '$2%') as has_password,
       exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email') as can_log_in
from public.profiles p
join auth.users u on u.id = p.id
where p.email like '%@{TEST_DOMAIN}'
order by p.email;
"""


def accounts_txt(pw):
    lines = ["Function TEST project (function-staging) test accounts",
             "=======================================================",
             "",
             "Only for the TEST project (function-staging, " + STAGING_REF + ").",
             "These accounts don't exist in the real app, and must never be added there.",
             "Keep this file private: anyone with it can log in to the test project.",
             "",
             "Password (the same for every test account): " + pw,
             "",
             "Log in with email + password:"]
    for (key, full, nick, uni, admin) in ACCOUNTS:
        role = {"ada": "Function admin (can open the Admin panel)",
                "abacus-admin": "for testing: UCL Abacus community admin",
                "abacus-committee": "for testing: UCL Abacus committee",
                "member-1": "for testing: paying member",
                "member-2": "for testing: paying member",
                "member-3": "for testing: paying member",
                "nonmember-1": "for testing: in the community, not a paying member",
                "outsider": "for testing: not in the community",
                "pending-1": "for testing: asked to join, waiting for approval"}[key]
        lines.append(f"  {key + '@' + TEST_DOMAIN:<46} {nick} ({full}, {uni}): {role}")
    lines += ["",
              "The roles after the colons are what each account is meant for; the",
              "community roles themselves are set up once the communities part of",
              "the database exists. Only ada is special today (Function admin).",
              ""]
    return "\n".join(lines)


def readme(m, part_files, all_files):
    steps = []
    for k, pf in enumerate(part_files, 1):
        steps.append(f"   {k}. {pf}")
    steps.append(f"   {m + 1}. 90-test-accounts.sql   (the test accounts, last)")
    steps_txt = "\n".join(steps)
    return f"""FUNCTION TEST DATABASE: HOW TO SET IT UP
========================================

These files set up the database of your TEST Supabase project
(called function-staging; its project ID is {STAGING_REF}).
They must NEVER be pasted into the real project (its ID is {REAL_REF}).
Each file checks this itself and stops if it looks like the real one,
but please check too.

You will paste {m + 1} files, one at a time, in this order:

{steps_txt}

Each one takes a few seconds.


BEFORE YOU START
----------------
1. Go to supabase.com and log in.
2. Open the TEST project, function-staging.
3. Check the web address at the top of your browser. It must contain
      {STAGING_REF}
   If it contains {REAL_REF} instead, you are in the REAL project:
   stop, go back to the project list and open function-staging.
4. In the left-hand menu, click "SQL Editor".


FOR EACH FILE, IN THE ORDER ABOVE
---------------------------------
1. In the SQL Editor, click "New query" (or the "+" button) to get an
   empty box.
2. On your PC, open the file in Notepad (right-click the file, "Open
   with", "Notepad").
3. In Notepad, press Ctrl+A (selects everything), then Ctrl+C (copies it).
4. Back in the SQL Editor, click inside the empty box and press Ctrl+V.
   Don't type or change anything, and don't highlight any of the text
   (if some text is highlighted, Supabase only runs that bit).
5. Click "Run" (bottom right of the box), or press Ctrl+Enter.
   - Leave the role next to the Run button as "postgres" (the normal
     setting).
   - If a box pops up saying "Potential issue detected with your query"
     (Supabase says this because the files replace some old rules),
     check you're still in function-staging, then click "Run this query".
6. Wait until the results area under the box says:
      Success. No rows returned
   That file is done. Close Notepad and go on to the next file.
7. For the last file, 90-test-accounts.sql, the results area shows a
   small table listing the {len(ACCOUNTS)} test accounts instead (a plain
   "Success" is fine too). That means it worked. The test log-ins and
   their password are in test-accounts.txt (keep that file private).
   Use them on the test version of the app: "Log in", then email and
   password.


IF AN ERROR APPEARS
-------------------
- An error shows as red text in the results area.
- Nothing has been changed: each file runs completely or not at all.
- Don't change anything and don't try to fix it. Take a screenshot of
  the whole page (including the red text) and send it. Wait for an
  answer before running any more files.
- Some errors are the files protecting you, and say what to do:
    "STOP: part N has already been run here" - nothing was changed.
      First check the web address in your browser: only if it contains
      {STAGING_REF}, that file was already done, so go on to
      the next file. If it doesn't, stop: you are in the wrong project.
    "STOP: part N has not been run here yet" - a file was skipped. Go
      back and run part N first.
    "STOP: run all {m} setup parts first" - the test accounts file was run
      too early. Run the parts first, then the test accounts file.
    "STOP: this is not the test project" - nothing was changed. Check
      the web address: if it contains {STAGING_REF}, part 1
      was skipped, so run part 1 first. If it doesn't, you are in the
      wrong project (maybe the REAL one): stop and send a screenshot.
    "STOP: this looks like your real Function database" or "STOP: this
      database already has real accounts" - you are in the REAL
      project (or the wrong one). Stop and send a screenshot.


NEVER
-----
- Never paste these files into the real project ({REAL_REF}).
- Never paste the RUN_ONCE_... files from the app's code into the test
  project: they contain the real project's address.
- Never put the test accounts' password into a file other than
  test-accounts.txt, or share it outside the team.
"""


def git_commit(repo):
    try:
        r = subprocess.run(["git", "-C", repo, "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
        return r.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="/home/user/student-motive")
    ap.add_argument("--migrations", default=None, help="default: <repo>/supabase/migrations")
    ap.add_argument("--seed", default=None, help="default: <repo>/supabase/seed.sql")
    ap.add_argument("--cutoff", default="20261201000000", help="include migrations whose timestamp is <= this")
    ap.add_argument("--out", default=os.path.dirname(HERE))
    ap.add_argument("--max-kb", type=int, default=130)
    ap.add_argument("--min-kb", type=int, default=80)
    ap.add_argument("--no-accounts", action="store_true", help="skip the accounts file (no database needed)")
    args = ap.parse_args()

    mig_dir = args.migrations or os.path.join(args.repo, "supabase", "migrations")
    seed = args.seed or os.path.join(args.repo, "supabase", "seed.sql")
    names = sorted(f for f in os.listdir(mig_dir) if f.endswith(".sql"))
    included, skipped = [], []
    for f in names:
        m = re.match(r"^(\d{14})_", f)
        if not m:
            raise BuildError(f"migration without a 14-digit timestamp: {f}")
        (included if m.group(1) <= args.cutoff else skipped).append(f)
    files = []
    for f in included:
        with open(os.path.join(mig_dir, f), encoding="utf-8") as fh:
            files.append(analyse(f, fh.read()))
    with open(seed, encoding="utf-8") as fh:
        files.append(analyse("seed.sql", fh.read()))
    for f in files:
        if f["text"].startswith("﻿"):
            raise BuildError(f"{f['name']} starts with a byte-order mark")
    warnings = [w for f in files for w in f["warnings"]]

    units = make_units(files)
    overhead = 3200  # header + guard, roughly
    max_bytes, min_bytes = args.max_kb * 1024, args.min_kb * 1024
    parts = plan_parts(units, max_bytes, min_bytes, overhead)
    sigs = pick_signatures(parts, units)
    m = len(parts)
    commit = git_commit(args.repo)
    # The marker goes at the end of part 1, so part 1 must be an ordinary
    # (guarded, one-transaction) part that creates public.allowed_emails.
    p1 = units[parts[0][0]:parts[0][1]]
    if p1[0]["solo"]:
        raise BuildError("part 1 would be a statement that runs on its own; the test-project marker needs a normal part 1")
    if not any(c[:2] == ("rel", "allowed_emails") and u["lo"] <= c[2] < u["hi"] for u in p1 for c in u["file"]["creates"]):
        raise BuildError("public.allowed_emails is not created in part 1, so part 1 can't add the test-project marker")

    os.makedirs(args.out, exist_ok=True)
    for f in os.listdir(args.out):
        if re.match(r"^\d\d-setup-part-\d+\.sql$", f):
            os.remove(os.path.join(args.out, f))
    part_files = []
    report = []
    file_index = {id(f): x + 1 for x, f in enumerate(files)}
    for k, (i, j) in enumerate(parts, 1):
        seg = units[i:j]
        fname = f"{k:02d}-setup-part-{k}.sql"
        part_files.append(fname)
        body = "".join(unit_banner(u) + unit_body(u) + "\n" for u in seg)
        if k == 1:
            body += MARKER_TRAILER
        first_no = file_index[id(seg[0]["file"])]
        if seg[0]["solo"]:
            # Must be the only statement in its paste: header comments only.
            text = (part_header(k, m, seg, len(files), first_no, commit)
                    + "-- [runs on its own: not inside a transaction]\n"
                    + "-- This part is a single statement that Supabase has to run on its own,\n"
                    + "-- so it has no safety check: make sure you are in function-staging.\n\n" + body)
        else:
            text = part_header(k, m, seg, len(files), first_no, commit) + guard_block(k, m, sigs) + body
        with open(os.path.join(args.out, fname), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        report.append((fname, len(text.encode()), [u["file"]["name"] + (f" (piece {u['piece'][0]}/{u['piece'][1]})" if u["piece"] else "") for u in seg], sigs[k - 1]))

    if not args.no_accounts:
        pw, hashed = password_and_hash(args.out)
        last_sig = next((s for s in reversed(sigs) if s), None)
        with open(os.path.join(args.out, "90-test-accounts.sql"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(accounts_sql(hashed, last_sig, m, commit))
        txt = os.path.join(args.out, "test-accounts.txt")
        with open(txt, "w", encoding="utf-8", newline="\r\n") as fh:
            fh.write(accounts_txt(pw))
        os.chmod(txt, 0o600)
        for f in os.listdir(args.out):
            if f.endswith(".sql") and pw in open(os.path.join(args.out, f), encoding="utf-8").read():
                raise BuildError(f"the plaintext password ended up in {f}")
    with open(os.path.join(args.out, "README.txt"), "w", encoding="utf-8", newline="\r\n") as fh:
        fh.write(readme(m, part_files, files))

    print(f"included {len(included)} migrations (<= {args.cutoff}) + seed.sql; skipped newer: {skipped or 'none'}")
    for (fname, size, members, sig) in report:
        print(f"{fname}: {size} bytes ({size / 1024:.1f} KB), {len(members)} files: {members[0]} .. {members[-1]}; marker: {sig}")
    for f in files:
        for (typ, label, line) in f["enum_adds"]:
            later = [g["name"] for g in files[files.index(f) + 1:] if mentions(g["text"], label)]
            print(f"enum add: {f['name']} line {line}: {typ} + '{label}'; later files mentioning it: {later or 'none'}")
        for s in f["non_tx"]:
            print(f"needs its own paste: {f['name']} line {s['line']}: {s['norm'][:70]}")
    for w in warnings:
        print("WARNING:", w)


if __name__ == "__main__":
    try:
        main()
    except BuildError as e:
        print("build.py: " + str(e), file=sys.stderr)
        sys.exit(1)
