# Importing societies from the students' union directories

These tools put every LSE, UCL, King's and Imperial society on Function
from the SUs' public society directories. They're separate from the app
and don't run on the website.

There are two steps, with a review in between:

1. **Collect.** Reads the SU websites and writes a spreadsheet (CSV) plus a
   folder of logos. Nothing is written to the database.
2. **Import.** Run it only after you've checked the CSV. It always shows
   you what it will do first (`--dry-run`).

## What it collects, and what it doesn't

**Which groups:** societies and sports clubs from all four unis. Imperial's
"projects" (student-run ventures listed alongside its clubs) are left out.

**It keeps:** the society's name, short description, category, SU page link,
the logo shown on the SU page, and its Instagram handle and website if the
SU page lists them (links only).

**It never collects:** committee names, personal emails, phone numbers or
photos of people. Any sentence in a description containing an email
address or phone number is left out. It never visits Instagram or any
other social network.

**It's polite to the SU websites:**
- it checks robots.txt and skips anything that isn't allowed;
- it makes at most one request per second per site;
- it says who it is (`FunctionBot/1.0 (+https://studentfunction.com; …; your email)`);
- it saves every page in `out/cache`, so running it again doesn't hit the
  sites again. Delete that folder to fetch fresh pages.

If an SU site blocks it, needs a login, or can't be read, that uni is
skipped and reported, and the others carry on.

## Step 1: collect

```
cd web
npm run societies:collect -- --contact you@yourdomain.com
```

Optional: `--only lse,ucl` does just those unis.

This writes:
- `scripts/society-import/out/societies.csv`, with one row per society: uni,
  name, category, description, SU link, Instagram, website, logo file and
  issues;
- `scripts/society-import/out/logos/<uni>/…`.

The **issues** column flags:
- no logo;
- placeholder logos (the same picture on 3+ societies at one uni);
- very short or missing descriptions;
- possible duplicates.

Open the CSV in Excel or Google Sheets. **Delete any rows you don't want**,
fix names if needed, save it as CSV, and keep it in the same place.

## Step 2: import (on your own computer)

The import needs your Supabase **secret** key, so it runs on your computer
and the key never leaves it:

1. Supabase → **Project Settings** → **API Keys** → copy the **Secret key**.
2. Add it to `web/.env.local`, which is never committed, as a new line:
   `SUPABASE_SECRET_KEY=sb_secret_...`
3. See what would change: `npm run societies:import -- --dry-run`
4. If it looks right, run it: `npm run societies:import`

**What the import does:**
- Each new society is created **unclaimed**, at the right uni, with
  `source = su_directory` and its SU page link.
- Societies already on Function are matched by uni and name, or by the
  same SU page, and aren't added twice:
  - claimed ones, or ones their committee has edited, are **never touched**;
  - other existing ones only get their empty fields filled in.
- Logos are uploaded to the same storage as logos uploaded in the app.
  Missing or placeholder logos are left empty, so the page shows the usual
  initials avatar.
- It's safe to run again later (collect, review, import) to pick up new
  societies.

## When an SU website changes

Each SU's reading code is a small file in `sites/` (`lse.mjs`, `ucl.mjs`,
`kcl.mjs`, `imperial.mjs`). If a site's layout changes, only that file needs
updating.
