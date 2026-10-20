# Plan: society onboarding, the Society Hub and event admin

Branch `society-onboarding` (from `expo-app`). Nothing here is merged or run
against the live database: every database change is a migration file you run
later. Built in the Expo app (`apps/mobile`, which is also the website) and the
shared code (`packages/shared`). The old Next.js site in `apps/web` is not
changed.

**Goal.** A committee goes from a link in an Instagram DM to a live,
SU-approved event in under 5 minutes, with the features they want switched on,
and gets the right SU paperwork for every new event without thinking about it.

---

## Ground rules used throughout

- **Who can do what is enforced by the database** (row-level security and
  checks inside database functions), never only by hiding buttons.
  - *App admins* (`profiles.is_admin`, `is_motive_admin()`): everything.
  - *Society managers* (a row in `society_admins`): only their own society.
    Checked with `is_society_committee(id)` where an app admin must not count
    as a committee member, and `is_society_admin(id)` (committee or app
    admin) elsewhere.
  - Nothing a manager can call touches `profiles.is_admin` (already protected
    by `protect_profile_fields`; the new functions never write to `profiles`).
  - Managers see attendee names, never emails: new functions return names
    from `profile_cards`, never `profiles.email`.
- **New server-only functions** are `security definer set search_path = ''`,
  revoked from `public, anon` and granted only to who needs them.
- **Existing societies see no change.** Every society that has a manager when
  the migration runs gets every existing feature switched on explicitly, and
  Event admin switched off.
- **Copy**: plain English, sentence case, "Function prepares drafts; your
  committee checks and submits them." We never say we handle compliance.

## Tooling (done first)

- The app had no lint config, so `expo lint` tried to download one and
  failed. It now has Expo's standard config and lint runs offline.
- `packages/shared` gets unit tests (vitest): rules, deadlines, eligibility,
  the feature helper.
- `supabase/tests/`: a runner that builds a throwaway local database from
  every migration and runs `*.test.sql` files (permission tests). Never points
  at Supabase.
- The browser tests (Playwright against a local copy of the app) keep running
  for every part, with a new test per part.

## Migrations (files only, run later in this order)

0. `20261116000000_security_fixes.sql`: fixes for three existing permission
   problems found while mapping the code (see below). Independent of the rest;
   safe to run straight away.
1. `20261117000000_society_features.sql` (Part 1)
2. `20261118000000_society_claim_links.sql` (Part 2)
3. `20261119000000_society_hub.sql` (Part 3)
4. `20261120000000_feature_requests_founding.sql` (Part 4)
5. `20261121000000_event_admin.sql` (Part 5)
6. `RUN_ONCE_hub_cron.sql`: one daily timer for the Hub reminders (Parts 4, 5)

**Existing permission problems found (fixed in migration 0).**
- Any logged-in student could edit or delete other people's profiles through
  the `profile_cards` view (Supabase's default grants allow writes on views,
  and this view runs with the owner's rights). It becomes read-only.
- Any logged-in student could call `queue_push` and send any notification to
  anyone (also `queue_event_reminders` and `push_name`). Now server-only.
- The committee's member list returned members' email addresses, which the
  new rule forbids. Committees now see names; the invite emails they typed in
  themselves are still listed; Function admins still see emails.

---

## Part 1: feature flags

**Database.** `society_features (society_id, feature_key, enabled, config
jsonb, updated_by, updated_at)`, one row per society per feature the society
has chosen. Anyone can read it. Only that society's managers (or app admins)
can add or change rows; there is no delete (switching off sets `enabled =
false`, so nothing is lost). A trigger stamps `updated_by` and `updated_at`.
A new column `societies.society_type` (social, sports, cultural, academic,
games, arts) records the type picked in the Hub. A small database helper
`society_feature_on(society, key)` answers the two questions the database
itself needs (event chats, event admin).

**Backfill.** Every society with at least one manager today (LSE Poker,
UCL Chess, UCL ABACUS and any other claimed society) gets explicit rows: the
six existing features on, Event admin off.

**Registry** (`packages/shared/src/features.ts`): one list with, for each
feature, its key, name, one-line description, example, group (Sign-ups, Money,
On the night, Community, Look & feel, Specialist, Event admin), the society
types it is pre-ticked for, status (`live` / `coming_soon`) and its settings.

| Key | Feature | Group | Status |
|---|---|---|---|
| `signup_lists` | Sign-up lists | Sign-ups | live |
| `tables` | Tables and numbered seating | On the night | live |
| `ledger` | Settle-up ledger | Money | live |
| `event_cost` | Event cost | Money | live |
| `member_invites` | Member invites | Community | live |
| `event_chats` | Event group chats | Community | live |
| `event_admin` | Event admin (SU paperwork) | Event admin | live (Part 5) |
| `custom_questions`, `host_approval`, `capacity_waitlist`, `members_only_events`, `google_form_import`, `check_in_qr`, `polls`, `announcements`, `recurring_events`, `pinned_event`, `society_branding`, `committee_page`, `photo_gallery`, `tournament_brackets`, `speaker_qa` | as listed in the brief | various | coming soon |

**`hasFeature(society, key)`**: an explicit row wins; otherwise, for a society
that hasn't picked a type (every society that existed before), the six
existing features are on; otherwise the registry default for its type (and
Event admin defaults on for LSE). Coming-soon features are always off.

**Where features are checked.** The event form (format choices, cost), the
manage-event screen and event page (ledger tools), the members screen
(invites), and new events' group chats (with chats off, a new event gets no
chat, so no "Open group chat" button and nothing in Chats). *Decision:*
turning a feature off hides it from the society's tools and from new events;
events already created with it keep working (their chat, their tables, their
settle-up), so nobody's night is broken mid-way.

**Tests.** Unit: `hasFeature` defaults, overrides, coming soon, legacy
societies. Database: anyone can read flags; a manager can change only their
own society's; nobody else can.

## Part 2: instant claim links

**Database.** `society_claim_links (id, society_id, token_hash, created_by,
created_at, expires_at, used_by, used_at, revoked_at)`. Only app admins can
read it. The link's secret is 64 random characters; only its SHA-256 hash is
stored, so a leaked database copy can't be used to claim a society.
- `create_society_claim_link(society)`: app admins only; returns the link
  secret once, valid 7 days.
- `claim_link_info(secret)`: anyone, even logged out; says whether the link
  is ready, used, expired or unknown, and which society it is for (name and
  logo only).
- `redeem_society_claim_link(secret)`: logged-in users; in one step marks the
  link used (by whom, when) and makes them a manager of that one society.
  Second use fails.
- `revoke_society_claim_link(id)`: app admins.

**App.** A new admin tab **Societies**: search, then per society: "Create
claim link" with Copy link and Copy DM message buttons, the list of links
(who used each and when, expired ones marked), and the Founding switch (used
in Part 3). New page `/claim/<secret>`: logged out it shows the society and
"Log in or sign up to claim" (returns here afterwards); logged in it claims at
once and opens the Hub's setup. Used or expired links get a friendly message.
The existing "Claim this page" request flow stays as it is.

*Decision:* the link isn't added to the app's universal links yet (an app
build without this screen would open to "not found"), so it opens in the
browser, which works on phones.

## Part 3: the Society Hub and onboarding wizard

**Routes** (phone screens; on screens wider than 1024px the Hub gets a
sidebar):
- `/hub`: the societies you manage (straight into the one if there's one).
- `/hub/<society>/setup`: the wizard, one decision per screen, progress bar.
- `/hub/<society>`: the Hub home afterwards: Overview, Features, Committee,
  Requests (Part 4), Events (links to the existing dashboard).

**Wizard steps.**
1. Welcome: "[Society] is on Function. Let's get you live in 5 minutes."
2. Check your page: name, logo, description, Instagram from the import; one
   tap if right, edit if wrong.
3. Society type: six big cards. Each pre-ticks a feature set.
4. Features: grouped checklist with a description and example each. Live
   features switch on instantly; coming-soon ones can be marked "We want
   this" (stored in `feature_interest`), showing "We'll tell you when it's
   ready".
5. Founding Society agreement (only if an app admin has marked the society
   Founding): both lists of commitments, the "stay active" line, "We're in"
   (stored in `founding_agreements`).
6. Invite your committee: search by name, or add by email (if they have no
   account yet, they become a manager when they sign up).
7. Post your first event: the existing event form with the chosen features.
   At LSE (Event admin on) it asks "Has the SU approved this event?" (Part 5).
8. You're live: the link, "Copy link for Instagram bio" (the society page),
   a story card to screenshot (and download as an image on the website), and
   WhatsApp share.

**Database** (`20261119000000_society_hub.sql`): `societies.is_founding`
(only app admins can change it), `societies.onboarded_at`,
`founding_agreements (society_id, agreed_by, agreed_at, events_target default
3)`, `feature_interest (society_id, feature_key, created_by, created_at)`,
`society_manager_invites (society_id, email, invited_by, created_at)` with a
trigger that turns an invite into a manager when that person's profile is
created, and functions `add_society_manager`, `invite_society_manager`,
`society_managers` (names only) and `leave_society_management` (refuses if
you're the last manager). A new push kind `hub` ("Society Hub" in
notification settings).

*Decision:* the story image is a 9:16 card shown on screen (screenshot it on a
phone; the website can also download it as a PNG drawn in the browser). This
needs no new app packages and works in the current app build.

## Part 4: feature requests and admin views

- `feature_requests (id, society_id, requested_by, need, current_process,
  status new/building/live/declined, admin_note, created_at, updated_at)`.
  Managers see and add their own society's; only app admins see all and change
  status. Setting `live` pushes a notification to that society's managers.
- Hub: "Request a feature" form and the list of your requests with status.
- Admin tab **Hub**: the requests queue (filter by status, change status), the
  coming-soon features ranked by how many societies want each, and the
  Founding Societies list: events posted since agreeing (of 3), days since the
  last event, prize-draw eligibility, badge on or off.
- **Founding badge** is worked out, not stored: on while the society has
  agreed and published an event in the last 30 days (or agreed in the last 30
  days); off otherwise; back on when they post again. Shown on the society page
  and in the Hub.
- **Prize draw eligibility**: 3 or more published events since agreeing, each
  with at least one person going. *Decision:* "events posted since agreeing"
  counts published, not-cancelled events created after the agreement.
- **Reminder**: a daily job pushes managers of a Founding Society 7 days after
  their last new event (once per week).
- **Committee handover** in the Hub's Committee page: add next year's
  managers, then "Remove me" (not allowed for the last manager).

## Part 5: event admin (LSE)

**Rules** (`packages/shared/src/event-admin/`): one config per university;
LSE now, others show "Event admin isn't available for your uni yet".
- Large / External Speaker Event Form if an external speaker or organisation,
  more than 75 attendees, alcohol is the focus, or a budget over £500; at
  least 1 month's notice.
- Otherwise the Regular Event Form; at least 10 working days' notice.
- The Trip Form instead if outside London / the M25 or overnight. *Decision:*
  the brief gives no notice period for trips, so the 1-month one is used
  (the safer choice); easy to change in one place.
- Working days skip weekends and England and Wales bank holidays (2026 to
  2028 listed; later years fall back to weekends only, flagged in the code).
- Notes: forms go through Podio with a risk assessment (and a budget if
  there are costs); events must be SU-approved before they're promoted; LSESU
  aims to reply within 5 working days; paid tickets only through Native,
  needed if non-LSE guests attend; external speakers need an LSE academic
  chair if open to the public, and speaker and guest names go to the
  building's Security reception by the day before.

**Database** (`20261121000000_event_admin.sql`):
- `events.is_draft`. Drafts are visible only to the society's managers (and
  app admins). Every database function that lists, notifies about or lets
  people join events skips drafts; publishing a draft sends the "new event"
  notification then.
- **Approval gate**: for an LSE society with Event admin on, an event can't
  go from draft to published until a manager has ticked "SU approved"
  (enforced by a database trigger).
- `event_admin (event_id, the answers, form, submit_by, su_approved_at/by,
  checklist, ...)`: managers of that society only.
- A private storage bucket `society-documents` that only that society's
  managers can read; files are written only by the server.
- `supabase/functions/event-documents`: the server-side function that will
  fill in the LSESU templates. Until you add them to `docs/lsesu-templates/`
  it checks who's asking and returns "Templates not added yet" (a clearly
  marked TODO).

**App.** An "Event admin" step in the committee event form for LSE societies,
pre-filled where we know the answer; "Has the SU approved this event?" Yes
publishes, No saves a draft. The event's manage screen shows which form, the
submit-by date, a warning if it's late, the checklist (form submitted, SU
approved, room confirmed, academic chair if needed, Native tickets if paid,
Security guest list if needed), "Risk assessment and budget: coming soon",
and "Draft email to Security" (opens an email with the speaker and the non-LSE
people going, from the RSVP list). The hazard library (crowding, alcohol,
travel, late finish, physical activity, food and allergens, external speaker,
weather) and the budget's cost lines are built from the answers and shown as
a preview. Paid LSE events link to their Native ticket page. Daily reminders
before each checklist deadline.

---

## How each part is checked before it's committed

Type check (shared + app), lint, unit tests, database tests, the full browser
test suite (all existing tests plus the part's new ones), and the web build.
Then an independent review of the part's changes, and fixes. Commit, push.
