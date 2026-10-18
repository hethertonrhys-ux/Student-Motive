# Supabase (database)

Project ID: `xrpbmcoptyrpgkdowfdt` (London region)

## Files

- `migrations/20261015000000_initial_schema.sql`: tables, security rules, sign-up restriction, image storage.
- `migrations/20261017000000_members_formats_ledger.sql`: society members, event formats (sign-up lists, tables), results ledger.
- `migrations/20261017120000_tables_flexibility_and_self_reporting.sql`: "also happy to play at", splitting a counting difference, players reporting their own result, committee adding late arrivals.
- `migrations/20261018000000_table_bank.sql`: a "bank" player per table who records buy-ins and cash-outs.
- `migrations/20261018120000_confirm_seat_and_start_tables.sql`: confirming your seat, and starting a table early.
- `migrations/20261019000000_allow_other_emails.sql`: lets the Motive admin allow non-LSE emails, one address or a whole domain (e.g. `@kcl.ac.uk`).
- `migrations/20261020000000_social.sql`: friends, profiles, student-hosted events, event chats and private messages.
- `migrations/20261021000000_profile_photos.sql`: profile photos (the `avatars` storage bucket).
- `migrations/20261022000000_social_section.sql`: the Social section (students hosting their own events), in its own tables: `social_events`, `social_event_members`, `social_event_addresses`, `social_reports`.
- `migrations/20261023000000_profile_upgrade.sql`: profile upgrade. Societies on profiles (a read-only `profile_societies` function, no Societies changes), "My 5" photos (`profile_photos`, private `profile-photos` bucket), `profile_settings`, and `profile_photo_reports`.
- `migrations/20261104000000_london_unis.sql`: London expansion. A `universities` table (LSE, UCL, King's, Imperial and their email domains), `profiles.university`, sign-up for all four unis, societies only for their own uni's students, and `events.audience` (members / uni / london) for who can see a society's event.
- `migrations/20261105000000_society_search.sql`: society search across all London unis (`search_societies`, own uni first), and `search_events`, which counts taps on "Search all London unis" (readable by the Function team only).
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
| `universities` | The unis Function is open to, and the email domains that prove you study there. Keep in step with `web/src/lib/universities.ts`. |
| `allowed_emails` | Other emails (or whole domains like `@kcl.ac.uk`) allowed to sign up. Managed on the Admin page. |
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

- Only LSE, UCL, King's and Imperial emails (or ones in `allowed_emails`) can sign up. Everyone has a uni (`profiles.university`): from their email, otherwise LSE until they pick.
- Societies are for their own uni's students: only they can ask to join, follow, be invited or ask to manage it.
- A society's event is seen by its members only, its uni's students (the default; logged-out visitors too, so links work), or all London students, as the society chooses (`events.audience`).
- Anyone, even logged out, can read societies, venues and visible events, so shared event links work.
- Only a society's admins can create, edit or delete its events and edit its page.
- Students can only change their own follows, blocks and reports.
- Joining events goes through `join_event` / `choose_table` / `leave_event`, which enforce members-only, limits, waiting lists and free seats.
- Only a society's committee approves members and edits results. Players see results only once the committee shares them.
- Before results are shared, a player can record their own result and payments with players at their own table (`record_my_result`, `record_my_payment`). The committee sees these labelled as entered by the player.
- Each table has its own ledger: players only settle with people at their table.
- A table can have a bank (`event_tables.bank_user_id`). The bank can edit only that table's ledger: buy-ins, cash-outs and whether each cash-out has been paid.
- Nobody can make themselves an admin, fake a going count, or un-hide an event Motive has hidden.
- Images go in the `images` bucket under `<society-id>/...`; only that society's admins can upload there.
