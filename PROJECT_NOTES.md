# Project notes

Running notes on how Function is put together and how it's built. They're for whoever works on it next, human or Claude. See also `README.md` and `OVERNIGHT_REPORT.md`.

## Ground rules (from Rhys)

- **Plain English** in everything shown to Rhys.
- **Never share** the Supabase secret / service_role key.
- **Don't change Societies** code, pages or data unless Rhys approves that specific change.
  - Approved so far: the instant buttons and placeholder (speed work), item 7 (event cost), item 19 (settle-up) and item 20 (table waiting lists).
- **No emojis in the Social tab.** Keep the existing design style.
- **Database: only ever add** (tables, columns, functions). Never delete or rename existing tables, columns or data.
  - Changes needing SQL go on a branch named after the item, with the SQL in `supabase/migrations/`, for Rhys to run in the Supabase SQL Editor before merging.
- **No paid services or new accounts/API keys.**
- **Keep it fast.** Don't undo:
  - instant buttons (`useInstant` / `InstantArea`);
  - cached tabs (`experimental.staleTimes.static: 60` + bottom-bar prefetch);
  - the map kept alive between visits;
  - local login checks (`getClaims`).

## Map of the app

| Area | Where |
|---|---|
| Live map | `web/src/app/map/` |
| Map pins and categories | `pins.ts`, `src/lib/map-categories.ts` |
| Map data (society + Social events) | `src/lib/map-events.ts` |
| Walking directions | `src/app/map/directions.ts` (FOSSGIS OSRM `routing.openstreetmap.de`, foot) |
| Social tab | `web/src/app/social/` |
| Social helpers | `src/lib/social-events.ts` |
| Event hosting form | `social/components/event-form.tsx` |
| Location picker | `place-picker.tsx` |
| Who's going faces | `social/components/attendees.tsx` |
| Societies | `web/src/app/societies`, `s/`, `dashboard/`, `e/` (event page) |
| Poker results | `e/[id]/participation.tsx`, `dashboard/[societyId]/events/[eventId]/` |
| Chats | `web/src/app/chats/` (threads/messages; event chats via `threads.event_id`, Social chats via `threads.social_event_id` on its branch) |
| Notifications | `web/src/app/notifications/`, `src/lib/notifications.ts`, bell in `src/components/notification-bell.tsx` |
| Profiles | `web/src/app/u/[id]` (view), `web/src/app/account` (edit) |
| My 5 photos | `my-five.tsx` |
| Cropper | `src/components/photo-cropper.tsx` |
| Profile prompts bank | `src/lib/prompts.ts` (on its branch). Never change or reuse a prompt id. |
| Install / Home Screen | `src/app/manifest.ts`, `src/components/install-banner.tsx`, `src/app/install/` |

**How notifications work:** there's no notifications table. The list is built from:

- society events in your societies (last 30 days);
- pending friend requests;
- (on the item 20 branch) `table_moves`.

"Seen" is a timestamp in localStorage on each phone.

## Database changes waiting on branches (as of the overnight build)

These are in `supabase/migrations/20261024…` to `20261101…`, applied in date order. See `OVERNIGHT_REPORT.md` section 3 for the steps. Branch `all-waiting-items` has all of them merged together and tested.

## Tests (run locally, not in the repo)

**Local stack**

- Postgres + PostgREST + a small fake Supabase auth/storage gateway, behind a delay proxy (`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54400`).
- Every migration is applied from scratch before each test.

**Browser tests** (Playwright, phone-sized)

- **Societies:**
  - 4 end-to-end scripts covering members, tables, results, bank, self-report and seat confirm;
  - login, logout, sign-up and a forged-token check.
- **Social:** the security/flow test.
- **One test per overnight item:**
  - picker, socialmap, chatbadge, multicat, attendees, directions;
  - notifications, friendnotif, multiphoto, avatar, preview, homescreen;
  - on branches: food, cost, societycost, groupchat, photostay, reorder, prompts, settle, waitlist.

**Lessons**

- Because buttons are instant, tests must wait for the save (`networkidle`) before checking the database or another user's screen.

## Known gaps / ideas

- `dashboard/[societyId]/where-field.tsx` has the same blank-map bug item 1 fixed for Social: `absolute inset-0` on the MapLibre container. It's Societies code and not yet approved.
- Push notifications aren't built. They'd need:
  - a service worker;
  - VAPID keys as a Vercel secret;
  - a push-subscriptions table;
  - an iPhone Home Screen install.
- Item 20: the committee page doesn't show table queues yet.
- Emojis remain outside the Social tab (Messages, map cards, some Societies pages).
