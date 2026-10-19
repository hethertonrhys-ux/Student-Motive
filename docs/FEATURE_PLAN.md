# Plan: recommendations, filters, flags, admin panel, time checks, poker seats, society chats

Everything is built in the Expo app (`apps/mobile`) and the shared code
(`packages/shared`). The old website in `apps/web` is not touched. Every
database change is a new migration file that only adds things, with row-level
security or an admin check on every new table and function.

**Branch and commits.** A new branch `feature-pack` made from
`overnight-updates` (so it includes last night's work). One commit per
feature, in the order below, each after its own browser test passes plus the
full existing test suite, the type check and the web build.

**How I'll test each one.** A new Playwright test per feature in the local
test setup (fake Supabase with seeded users Sam, Bea, Cas and admin), plus the
14 existing tests, before every commit.

---

## 1. Recommended events

**Where it shows.** Both the Societies tab and the Social tab get a small
switch directly under their search box: `All | Recommended`. Societies
recommends society events; Social recommends student-hosted plans. Each
recommended card says why ("Your society", "2 friends going", "Popular at
LSE"). Upcoming only, 14 days ahead, best match first then soonest.

**Scoring (rules, in one place so it's easy to tune).**
`packages/shared/src/recommend.ts` exports `RECOMMEND_WEIGHTS` and
`scoreEvent(event, signals)`. Signals: same university, I'm a member of the
society, a friend is hosting, how many friends are going, how many people are
going, how soon it starts. The database never ranks; it only supplies signals.

**Files.**
- New `packages/shared/src/recommend.ts` (scoring, `loadRecommendations`).
- New `apps/mobile/src/components/recommended-events.tsx` (the list and the
  `All | Recommended` switch, used by both tabs).
- Edit `apps/mobile/src/app/(tabs)/societies.tsx` and
  `apps/mobile/src/app/(tabs)/social.tsx` to mount it under the search box.
- Edit `packages/shared/src/index.ts` exports.

**Database.** Migration `20261110000000_recommendations.sql`: one function
`my_friend_event_signals()` (security definer, logged-in user only) returning,
per upcoming event, how many of *my accepted friends* are hosting or going.
It returns counts only, never names, and only for events I can already see.
Everything else (memberships, uni, popularity) is read with existing rules.

**Assumptions.** Events I'm already going to or hosting are left out (they're
listed elsewhere). Logged-out users see no Recommended switch.

## 2. Shared filters: friends' events and my societies' events

**One component, one function, one saved preference.**
- New `packages/shared/src/event-filters.ts`: `PersonalFilters`
  `{ friendsHosting, mySocieties }` and `matchesPersonalFilters(item, who,
  filters)`. Both ticked = either matches (OR), as asked.
- New `apps/mobile/src/components/personal-filters.tsx`: the two tick boxes,
  styled like the map's category rows.
- New `apps/mobile/src/lib/personal-filters.ts`: remembers the choice on the
  device (same approach as the map categories).
- `loadFilterContext` (friend ids + society ids) added to the shared code,
  loaded once and cached.

**Applied in** the map (`(tabs)/map.tsx` filter panel in
`components/map/controls.tsx`), the map's list view, the Social Discover
search (`(tabs)/social.tsx`), and both Recommended lists. `MapEvent`,
`FeedItem` and `SocialEvent` gain `hostId` / `societyId` so the one function
works on all of them.

**Database.** None.

**Assumption.** "Societies I'm a member of" = approved memberships plus
societies I run. "Friends" = accepted friendships only.

## 3. Country flag on profiles

- Migration `20261111000000_profile_country.sql`: `profiles.country`
  (two-letter country code, optional) and the same column on the
  `profile_cards` view. Only you can set yours (existing rule).
- New `packages/shared/src/countries.ts`: the country list; the flag is
  computed from the code, so no emoji is stored.
- `components/select.tsx` gets an optional search box at the top of its list
  (so the uni and year pickers are unchanged, and the country picker is
  searchable).
- `components/account/details-form.tsx`: "Where you're from (optional)".
- New `components/flag.tsx`; shown next to the name on: your profile page
  (`u/[id].tsx`), the Me card, event people lists (`event/panels.tsx`
  `PersonRow`), social attendee sheets, friends list and people search, the
  poker table seat labels, and the new poker profile card.

**Conflict to confirm.** Your standing rule is "no emojis in the Social
tab". A flag is an emoji. I'll keep flags off the Social tab's event list
unless you say otherwise (see question 2).

## 4. Admin panel

- Entry point moves to **Me → Admin panel** (row only shown when
  `profile.is_admin`). The "Function admin" button is removed from the
  society dashboard. The existing `/admin` screen is reorganised into three
  sections: **Overview** (today's claims, reports, reported photos, who can
  join, add society, all societies, kept as is), **Users**, **Events**.
- **Users:** search by name or email; a user card shows account info
  (name, nickname, email, uni, graduation year, country, signed up, email
  confirmed, 2FA on/off), societies with status, events hosted and joined
  (counts plus the last ten), and reports against them. No photos, prompts,
  chats or ledger money.
- **Events:** every society and social event with filters (search, society,
  upcoming/past, cancelled/hidden), and "Delete past events" which shows a
  count, asks to confirm, then deletes the events and their images from the
  `images` bucket.

**Backend enforcement.** Migration `20261112000000_admin_panel.sql` adds four
functions that each start with `if not is_motive_admin() then raise`:
`admin_search_users`, `admin_user_detail`, `admin_list_events`,
`admin_delete_past_events`. Non-admins get an error even if they guess the
URL. Nothing new is readable through ordinary table rules.

**Files.** `app/(tabs)/me.tsx`, `app/dashboard/index.tsx`, `app/admin.tsx`
(split into `admin/index.tsx`, `admin/users.tsx`, `admin/events.tsx`),
`packages/shared/src/admin.ts`.

**Assumption to confirm (question 4).** Deleting a past poker event also
deletes its tables, ledger and who-pays-who history (they hang off the
event). I'll exclude events with published results by default, and never
touch LSE Poker Society events unless you say so.

## 5. Event time validation

Both tables already have a database rule `ends_at > starts_at`, so **no
existing event can have an end before its start**; part two needs no work.
What's missing is a clear message before saving:
- `components/committee/event-form.tsx`: as soon as both times are filled, an
  inline warning under the finish field ("The finish time is before the start
  time") and the Post/Save button disabled until fixed.
- `components/social/event-form.tsx`: the social form has one date and two
  times, and today a finish earlier than the start means "after midnight"
  (22:00 to 02:00 is allowed on purpose). I'll show a note "Finishes 02:00 the
  next morning" and block only when finish equals start, unless you prefer a
  separate finish date (question 3).

**Database.** None.

## 6. Poker cash game seating

- Migration `20261113000000_poker_seats.sql`:
  - `event_entries.seat_no` (optional number, unique per table). A trigger
    gives everyone the lowest free seat whenever they land on a table (so the
    committee's existing "move" tools and the waiting list keep working), and
    clears it when they leave the table. Existing seated players get numbers.
  - `take_seat(event, table, seat)`: sit at a chosen empty seat, or a random
    empty one when no seat is given. Same checks as today's `choose_table`.
  - `randomise_table_seats(event, table)`: committee only; shuffles the seat
    numbers of everyone at that table.
  - `seat_changes` table (you can read only your own) feeding the
    Notifications page and a push ("You're now in Seat 4 at Table 1").
- `components/event/tables-picker.tsx`: seats drawn with numbers; tap an
  empty seat → "Sit here"; "Sit anywhere" button; tap a player → profile card.
- New `components/profile/person-card-sheet.tsx`: name, flag, uni, societies
  (respecting their "show societies" setting) and poker stats we already have
  (games played with this society, best finish). No money figures.
- `components/committee/tables-admin.tsx`: seat numbers in the list and a
  "Randomise seating" button per table with a confirmation.
- Notifications page lists seat changes; a `seating` switch is added to
  notification settings (on by default).

**Poker Society note.** This changes poker *code* and adds a seat number to
entries at upcoming tables events, which includes LSE Poker Society games.
Nothing is removed or renamed. Say if you'd rather I hold this one.

## 7. Society event group chats

The chat system already supports event chats, but only for student-hosted
events and only when someone opens it. Changes:
- Migration `20261114000000_society_event_chats.sql`: a trigger creates the
  chat the moment any event is inserted (society or hosted); existing
  upcoming society events get one too. Who can use it: people going, the
  host, and the society's committee. Joining adds you automatically (chat
  access follows the "going" list, exactly as social events work); leaving
  removes you. Push for new messages already covers event chats.
- `app/e/[id].tsx`: "Open group chat" button for people going and committee,
  same as the social event page. The going list and the chat show the Host
  badge (amber "Host" pill and ring, as on social events) on the committee
  members present (question 5).
- `app/chats/[id].tsx`: a small "Host" pill next to the sender name for hosts
  in both social and society chats, so the two feel the same.

---

## Questions before I start

1. **Recommended placement.** `All | Recommended` switch under the search box
   on both tabs, Societies showing society events and Social showing social
   plans. OK, or would you rather a separate "For you" tab on the Social tab?
2. **Flags vs "no emojis in the Social tab".** Keep flags off the Social
   tab's event list and attendee sheet (flags elsewhere only), or allow them
   there?
3. **Social finish time.** Keep the "finish earlier = after midnight" rule
   with a visible note, or add a finish date and block anything earlier?
4. **Bulk delete.** Skip events with published poker results by default, and
   never delete LSE Poker Society events? Default cut-off: older than 90 days?
5. **Society event host badge.** Mark all committee members as Host, only the
   committee member who posted the event, or show the society itself as the
   host?
6. **Poker profile card stats.** Games played and best finish only (no money)?
7. **Branch.** Build on `overnight-updates` so it includes last night's
   changes, and open a pull request into `expo-app` after you've merged #7?

## Refinements from the second review

A second, independent read of the code added these, all now part of the plan:

- **Recommendations.** The friend-signal function applies the same visibility
  rules as the event tables, so it can never reveal attendance at an event you
  can't see. Joining or leaving an event refreshes the recommended list.
  Limit: next 14 days, top 20.
- **Filters.** The map hides the two boxes when logged out (they'd hide every
  pin). The filter button's badge counts the new boxes too. Society events
  that students host through the old route count as "friends hosting" as well.
- **Flags.** Rendered as a separate element, never joined into the name
  string (so searches, pushes and tests are unaffected). Windows browsers show
  flags as two letters, so the two-letter code is the fallback. The country
  question is asked in Edit profile only, not during sign-up.
- **Admin.** "Verification status" = email confirmed, 2FA on/off, and uni
  email vs invited email, from one admin-only function. Images are removed by
  exact file path parsed from the stored URL, never by folder (society logos
  share the folder). Deletion runs server-side in one transaction. Optional
  extra: social event reports are currently stored but shown nowhere; adding
  them to the Reports section needs one new status column. I'll include it
  unless you say no.
- **Time checks.** A social with finish equal to start currently saves as a
  24-hour event; it will be blocked. Overnight socials (22:00 to 02:00) keep
  working with a visible "next morning" note.
- **Poker seats.** The seat trigger runs inside the same row lock the
  existing functions take; randomising clears seats first then reassigns.
  Reducing a table's seats re-seats anyone above the new number. The event
  page refreshes seating every 30 seconds while open, so a randomise shows up
  without a tap. The push kind `seating` is added to the queue rule, the
  settings table and the settings screen together in one migration. "Games
  played" comes from an admin-free function that counts only, and cash games
  have no finishing positions, so "best finish" only appears for tournaments.
- **Society chats.** Widening the chat rule touches one function that gates
  every chat, so it gets its own test with a non-member, a member going, a
  committee member and an outsider. Committee ids are exposed to chat members
  through a small function (they're not readable directly). Chats of finished
  events drop off the list seven days after the event ends, without deleting
  anything.

## Decisions (approved 19 Oct)

- Flags are allowed everywhere, including the Social tab.
- The admin bulk-delete never touches LSE Poker Society events. Instead, a
  society's own managers get a "Delete past events" control on their society
  dashboard (committee only, confirmation first, images removed too), which
  covers the Poker Society's committee deleting their own old games.
- All other defaults in the questions above are accepted.

## Order of work

1 Recommended → 2 Filters → 3 Flags → 4 Admin → 5 Time checks → 6 Poker seats
→ 7 Society chats. Features 1 and 2 share the filter context, so they go
first; 3 goes before 6 so the poker card can show the flag.

## Migrations you'd run (in order, SQL Editor, after I'm done)

`20261110000000_recommendations.sql`, `20261111000000_profile_country.sql`,
`20261112000000_admin_panel.sql`, `20261113000000_poker_seats.sql`,
`20261114000000_society_event_chats.sql`. All additive, each safe to re-run.
