# Supabase (database)

Project ID: `xrpbmcoptyrpgkdowfdt` (London region)

## Files

- `migrations/20261015000000_initial_schema.sql`: tables, security rules, sign-up restriction, image storage.
- `migrations/20261017000000_members_formats_ledger.sql`: society members, event formats (sign-up lists, tables), results ledger.
- `migrations/20261017120000_tables_flexibility_and_self_reporting.sql`: "also happy to play at", splitting a counting difference, players reporting their own result, committee adding late arrivals.
- `seed.sql`: starter data (LSE buildings, LSE halls, other universities, first society).

## Running them

Each migration file runs **once**, in date order. Never edit one that has already run; add a new file instead.

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole migration file → **Run**. You should see "Success. No rows returned".
3. First time only: new query → paste `seed.sql` → **Run**.

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
| `society_members` | Approved (or pending) members of each society. |
| `society_member_invites` | Emails the committee pre-approved (e.g. their SU list). |
| `event_tables` | Tables inside an event, each with a level and seats. |
| `event_entries` | Who's going / entered / on the waiting list, and their table. `events.going_count` updates automatically. |
| `ledger_rows` | Each player's result (pence) at a table. |
| `ledger_payments` | Payments already made, e.g. someone leaving early. |
| `blocks` | Students hiding a society (App Store requirement). |
| `reports` | Reports of bad content (App Store requirement). |

## Security rules in plain English

- Only `@lse.ac.uk` emails (or ones in `allowed_emails`) can sign up.
- Anyone, even logged out, can read societies, venues and visible events, so shared event links work.
- Only a society's admins can create, edit or delete its events and edit its page.
- Students can only change their own follows, blocks and reports.
- Joining events goes through `join_event` / `choose_table` / `leave_event`, which enforce members-only, limits, waiting lists and free seats.
- Only a society's committee approves members and edits results. Players see results only once the committee shares them.
- Before results are shared, a player can record their own result and payments with players at their own table (`record_my_result`, `record_my_payment`). The committee sees these labelled as entered by the player.
- Each table has its own ledger: players only settle with people at their table.
- Nobody can make themselves an admin, fake a going count, or un-hide an event Motive has hidden.
- Images go in the `images` bucket under `<society-id>/...`; only that society's admins can upload there.
