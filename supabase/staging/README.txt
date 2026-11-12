FUNCTION TEST DATABASE: HOW TO SET IT UP
========================================

These files set up the database of your TEST Supabase project
(called function-staging; its project ID is pvldkzjrrhcnwctveemu).
They must NEVER be pasted into the real project (its ID is xrpbmcoptyrpgkdowfdt).
Each file checks this itself and stops if it looks like the real one,
but please check too.

You will paste 7 files, one at a time, in this order:

   1. 01-setup-part-1.sql
   2. 02-setup-part-2.sql
   3. 03-setup-part-3.sql
   4. 04-setup-part-4.sql
   5. 90-test-accounts.sql          (the test accounts)
   6. 05-setup-communities.sql      (communities, added later)
   7. 91-test-community-roles.sql   (the test accounts in UCL Abacus, last)

Each one takes a few seconds.

YOU HAVE ALREADY DONE STEPS 1 TO 5 (files 01, 02, 03, 04 and 90),
so don't run those again. Now do only these two, in this order, in
the same way as before (see "FOR EACH FILE" below):

   6. 05-setup-communities.sql
   7. 91-test-community-roles.sql


BEFORE YOU START
----------------
1. Go to supabase.com and log in.
2. Open the TEST project, function-staging.
3. Check the web address at the top of your browser. It must contain
      pvldkzjrrhcnwctveemu
   If it contains xrpbmcoptyrpgkdowfdt instead, you are in the REAL project:
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
     (Supabase says this because the files replace some old rules or
     tidy something away), check you're still in function-staging,
     then click "Run this query".
6. Wait until the results area under the box says:
      Success. No rows returned
   That file is done. Close Notepad and go on to the next file.
7. For 90-test-accounts.sql, the results area shows a small table
   listing the 9 test accounts instead (a plain "Success" is fine
   too). That means it worked. The test log-ins and
   their password are in test-accounts.txt (keep that file private).
   Use them on the test version of the app: "Log in", then email and
   password.
8. 05-setup-communities.sql also ends with "Success. No rows returned".
   Unlike parts 1 to 4, it is fine to run it again (for example when
   a newer version of it is sent): it doesn't stop, and it keeps
   everything that's there.
9. For the last file, 91-test-community-roles.sql, the results area
   shows a small table: each test account's place in UCL Abacus
   (nickname, role, membership, status and groups) and how many test
   messages it wrote, then a last row with the totals. The first time,
   that row shows 130 in the UCL Abacus chat and 3 in AbaFam, and that
   means it worked. Running it again is harmless and adds nothing
   twice. Later runs show bigger numbers if testers have sent
   messages, and show any roles or places testers changed in the app;
   that is fine. Log in as abacus-admin, abacus-committee, member-1 and
   so on to see UCL Abacus as each of them.


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
      pvldkzjrrhcnwctveemu, that file was already done, so go on to
      the next file. If it doesn't, stop: you are in the wrong project.
    "STOP: part N has not been run here yet" - a file was skipped. Go
      back and run part N first.
    "STOP: run all 4 setup parts first" - the test accounts file was run
      too early. Run the parts first, then the test accounts file.
    "STOP: run 05-setup-communities.sql first" - the community roles
      file was run too early. Run 05-setup-communities.sql, then
      91-test-community-roles.sql.
    "STOP: run 90-test-accounts.sql first" - some test accounts are
      missing. Run 90-test-accounts.sql (running it again is
      harmless), then 91-test-community-roles.sql.
    "STOP: this is not the test project" - nothing was changed. Check
      the web address: if it contains pvldkzjrrhcnwctveemu, part 1
      was skipped, so run part 1 first. If it doesn't, you are in the
      wrong project (maybe the REAL one): stop and send a screenshot.
    "STOP: this looks like your real Function database" or "STOP: this
      database already has real accounts" - you are in the REAL
      project (or the wrong one). Stop and send a screenshot.


NEVER
-----
- Never paste these files into the real project (xrpbmcoptyrpgkdowfdt).
- Never paste the RUN_ONCE_... files from the app's code into the test
  project: they contain the real project's address.
- Never put the test accounts' password into a file other than
  test-accounts.txt, or share it outside the team.
