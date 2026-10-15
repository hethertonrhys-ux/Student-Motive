# Supabase (database)

Project ID: `xrpbmcoptyrpgkdowfdt` (London region)

## Files

- `migrations/20261015000000_initial_schema.sql`: tables, security rules, sign-up restriction, image storage.
- `seed.sql`: starter data (LSE buildings, LSE halls, other universities, first society).

## Running them (first time only)

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole migration file → **Run**. You should see "Success. No rows returned".
3. New query → paste `seed.sql` → **Run**.

## What the database contains

| Table | What it holds |
|---|---|
| `profiles` | One row per logged-in person. `is_admin` = Motive team. |
| `allowed_emails` | Non-LSE emails allowed to sign up (e.g. Apple's reviewer). |
| `societies` | Societies, halls, other universities, promoters (`kind`). |
| `society_admins` | Who can post for which society. |
| `society_claims` | Committee requests to manage a society page, approved by us. |
| `venues` | Places with map coordinates. |
| `events` | Events. Located by `venue_id` or a custom `lat`/`lng`. |
| `follows` | Students following societies. |
| `going` | "I'm going" taps. `events.going_count` updates automatically. |
| `blocks` | Students hiding a society (App Store requirement). |
| `reports` | Reports of bad content (App Store requirement). |

## Security rules in plain English

- Only `@lse.ac.uk` emails (or ones in `allowed_emails`) can sign up.
- Anyone, even logged out, can read societies, venues and visible events, so shared event links work.
- Only a society's admins can create, edit or delete its events and edit its page.
- Students can only change their own follows, "going", blocks and reports.
- Nobody can make themselves an admin, fake a going count, or un-hide an event Motive has hidden.
- Images go in the `images` bucket under `<society-id>/...`; only that society's admins can upload there.
