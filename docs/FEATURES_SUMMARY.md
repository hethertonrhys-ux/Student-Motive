# What changed: recommendations, filters, flags, admin panel, time checks, poker seats, society chats

Everything is on the `feature-pack` branch, one commit per feature, built on
top of `overnight-updates`. Nothing has been merged or deployed. The old
website in `apps/web` is untouched.

## The seven features

**1. Recommended events.** Under the search box on the Societies tab there
is now an "Events coming up" section with an `All events | Recommended`
switch; the Social tab's Discover search has `All plans | Recommended`.
Recommended picks are ranked by your university, the societies you're in,
friends hosting or going, how many people are going and how soon it starts,
and every card says why ("Your society · 2 friends going"). The rules live
in one place, `packages/shared/src/recommend.ts` (`RECOMMEND_WEIGHTS` and
`scoreEvent`), so they're easy to tune. Friend counts come from a database
function that only counts your accepted friends on events you can see.

**2. Shared filters.** Two tick boxes, "Only events my friends are hosting"
and "Only events from societies I'm a member of" (both ticked shows either),
work the same on the map (filter button), the map's list view, the Social
tab's search filters and both Recommended lists. Your choice is remembered
on the device. They don't appear when logged out.

**3. Country flag.** Edit profile has "Where you're from" (optional, a
searchable list; "UK" finds the United Kingdom; "Prefer not to say" clears
it). The flag shows next to your name on your profile, the Me tab, friends
lists, event guest lists, Social attendee sheets, poker seats and the poker
player card. Only the two-letter code is stored.

**4. Admin panel.** Me tab → "Admin panel" (admins only; the database refuses
everyone else). Three sections: Overview (requests to manage societies,
reports including reported Social plans, reported photos, who can join, add
a society, all societies), Users (search by name or email; see account
details, verification badges, societies, events hosted and joined, reports
against them; nothing else) and Events (every society event and Social plan
with search and filters, plus "Delete past events": events that ended more
than 90 days ago and their images, after showing the numbers and asking;
events with published poker results and the LSE Poker Society's events are
never touched, and the tool refuses to run at all if it can't find the
Poker Society). A society's own committee has "Delete past events" at the
bottom of their society dashboard for their own events; only people actually
on that committee can use it (a Function admin can't use it to get at the
Poker Society's events). Image files are removed through Supabase Storage,
so they really go, not just their database rows. The "Function admin"
button on the society dashboard is gone (it moved to Me).

**5. Event time checks.** Both event forms warn the moment the finish is
before (or the same as) the start, and Save stays off until it's fixed.
Social plans can still finish after midnight (22:00 to 02:00) with a note;
a finish equal to the start or a plan longer than 12 hours is blocked. The
database already required every event to end after it starts, so there
were no existing events to fix.

**6. Poker seating.** Tables show numbered seats (Seat 1 at the top,
clockwise). Tap an empty seat → "Sit here"; "Sit anywhere" takes a random
empty seat; anyone the committee moves, or the waiting list seats, gets the
lowest empty seat (someone moved onto a full table gets a number as soon as
a seat there frees up). Committee members at a table have an amber ring and
a "Host" badge on their card. The committee's manage page lists seat numbers and has
"Randomise seating" per table (confirmed first); everyone whose seat changed
gets a notification (in the app and as a push, with a new "Poker seating"
switch in notification settings). Tapping a player opens a small card:
name, flag, uni, their societies, games played and best tournament finish
(only counting games in societies you're in, or games you were at too).
The event page refreshes seating every 30 seconds while open.

**7. Society event chats.** Every event gets a group chat the moment it's
created (existing upcoming events got one too). People going, the student
host, and the society's committee can use it; joining adds you, leaving
removes you. "Open group chat" is on the event page (the chat header shows
how many are going). Committee members show
the amber "Host" badge in the going list and next to their name in the
chat, as on Social events. Chats of events that finished more than a week
ago drop off the chat list (nothing is deleted). Function admins' chat lists
stay their own: being an admin doesn't put you in every society's chats.

## Database migrations to run (Supabase → SQL Editor, in this order)

Each file only adds things and is safe to run again.

1. `supabase/migrations/20261110000000_recommendations.sql`
2. `supabase/migrations/20261111000000_profile_country.sql`
3. `supabase/migrations/20261112000000_admin_panel.sql`
4. `supabase/migrations/20261113000000_poker_seats.sql`
5. `supabase/migrations/20261114000000_society_event_chats.sql`

Notes:
- Migration 4 replaces the rule that lists allowed push kinds so it can add
  `seating`. No data is changed.
- Migration 5 creates a chat for every event that hasn't finished yet,
  including LSE Poker Society events (a chat row only; nothing else about
  them changes).
- After migration 4, players already sitting at a table get seat numbers in
  the order they joined.

## Go live

Open a pull request from `feature-pack` into `expo-app` (after
`overnight-updates` is merged, or merge `feature-pack` straight in, since it
contains `overnight-updates`). Run the five migrations first; the old app
version keeps working with them.

## What to test by hand

- Societies tab: `All events | Recommended` under the search box; cards show
  a reason; the two tick boxes narrow both lists.
- Social tab: `All plans | Recommended`; search still narrows Recommended;
  the tick boxes inside the filters; "Show all plans" from an empty list.
- Map: filter button → "Just for me" boxes; badge counts them; list view
  shares them; reload keeps them; logged out they're absent.
- Edit profile: pick a country, see the flag on your profile and Me; clear it.
- Admin (an admin account): Me → Admin panel; Users search; Events → past
  scope; "See what would be deleted" then "Keep them"; then delete once.
  Check an LSE Poker Society past event is still there afterwards.
- Society dashboard (committee): "Delete past events" at the bottom.
- Post a society event with the finish before the start: the warning and
  the disabled button. Social plan 22:00 to 02:00: the note; 22:00 to
  22:00: blocked.
- A cash game: tap Seat 3, Sit here; Sit anywhere on another table; tap a
  player's avatar; as committee, Randomise seating; the notification.
- Any society event: join → Open group chat; committee member's messages
  carry Host; leave → chat gone.

## Automated tests

All 22 browser tests pass against the final build (the 15 existing ones plus
recommend, filters, flags, times, admin, seats and society-chat), with the
type check. Two adversarial code reviews ran over the changes and their
confirmed findings were fixed (most notably: a waiting-list player moved into
a seat someone had just left now always gets a proper seat number). Lint
cannot run in this environment (it needs to download its config).
