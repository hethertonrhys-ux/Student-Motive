# Function on Expo: one codebase for iOS, Android and web

Plan only. No app code yet. The live Next.js website is untouched by this
branch and keeps running on Vercel until the Expo version replaces it.

Audited against `main` on 18 October 2026.

---

## 1. Audit of the current project

### Size

- 36 pages, 2 API routes, 95 server actions in 21 files, 53 database functions.
- About 15,000 lines of TypeScript: 123 screen/component files, 59 of them
  browser-side ("use client").
- Nearly every rule (who can join what, who sees which event, poker tables,
  waiting lists, settle-ups, uni-only societies) lives in Postgres as security
  rules and `security definer` functions. **The app talks to the same database
  with the same rules, so none of that is rewritten.**

### Pages and screens

| Page | What it does | Expo |
|---|---|---|
| `/` | London-wide landing | Landing route; logged-in users go to the app |
| `/lse` `/ucl` `/kings` `/imperial` | Uni landing pages (remember the uni for sign-up) | Static routes |
| `/privacy` `/terms` `/support` | Legal and support | Static routes |
| `/install` `/install/poster` | PWA install guide | Drop on native; keep on web |
| `/login` | Email code login, remembers a code in progress | Screen |
| `/auth/callback` (route) | Swaps the email login link for a session | Deep link / web route |
| `/auth/signout` (route) | Log out | Client call |
| `/welcome` | Uni-personalised first screen, prompt picker, Two truths | Screen |
| `/map` | Live map: pins, clusters, campus overlay, filters, search, directions, "my location" | Screen, platform-specific map (section 4) |
| `/societies` | Search, own uni first, expand to all London unis | Screen |
| `/s/[slug]` | Society page, join/leave, unclaimed label, claim link | Screen |
| `/dashboard/claim` | Claim form | Screen |
| `/e/[id]` | Society event: going, sign-up list, tables, seat confirm, waiting lists, bank, self-report, results, settle-up | Screen (biggest logic surface) |
| `/social` | Social feed with filters in the URL | Screen |
| `/social/new` `/social/[id]/edit` | Host form with place picker | Screen |
| `/social/[id]` | Social event: attendees, join/request, message host | Screen |
| `/host/new` `/host/[id]/edit` | Older hosting pages | Retire into Social |
| `/u/[id]` | Profile: My 5 photos, avatar zoom, prompts, Two truths game | Screen |
| `/account` `/account/archive` | Profile editor, photo picker and cropper, drag to reorder, archive | Screen |
| `/chats` `/chats/[id]` | Threads and messages (polling) | Screen |
| `/friends` | Requests, blocks, search | Screen |
| `/notifications` | In-app notifications, last-seen | Screen |
| `/dashboard` | Committee home | Screen (phase 9) |
| `/dashboard/[societyId]` | Society details and logo | Screen (phase 9) |
| `/dashboard/[societyId]/events/new` `/edit` | Event form: venue/place picker, formats, tables, audience, image | Screen (phase 9) |
| `/dashboard/[societyId]/events/[eventId]` | Tables admin, ledger editor, late arrivals, results, bank | Screen (phase 9) |
| `/dashboard/[societyId]/members` | Invites and approvals | Screen (phase 9) |
| `/admin` | Claims, reports, societies, allowed emails | Screen (phase 9, web-only is fine) |

### Server actions (95) and API routes (2)

| File | Count | What they do | Secrets? | In Expo |
|---|---|---|---|---|
| `login/actions` | 2 | `signInWithOtp`, `verifyOtp` | no | supabase-js directly |
| `welcome/actions` | 4 | save prompt, finish welcome (cookie), pick uni, funnel event | no | direct; cookie becomes device storage |
| `account/actions` | 8 | name, profile, prompts, avatar upload, Two truths | no | direct; storage upload from device |
| `account/my-five-actions` | 9 | My 5 photos: upload, pin, reorder, archive, recrop, report | no | direct `rpc` + storage |
| `e/[id]/actions`, `bank-actions` | 13 | join, tables, waitlists, results, payments, bank | no | all already `rpc` |
| `social/actions` | 9 | host, join, requests, report, message host | no | direct |
| `host/actions` | 6 | older hosting | no | retire |
| `chats/actions` | 6 | messages, unread count, mark read | no | direct `rpc` |
| `friends/actions` | 8 | requests, blocks, report, search | no | direct `rpc` |
| `s/[slug]/actions` | 2 | join or leave a society | no | direct `rpc` |
| `societies/search-actions` | 2 | all-unis search, analytics row | no | direct |
| `map/actions` | 1 | load map events | no | direct query |
| `notifications/actions` | 1 | notification times | no | direct |
| `dashboard/[societyId]/actions` | 4 | society details, events CRUD, image upload | no | direct (phase 9) |
| `dashboard/.../events/[eventId]/actions` | 11 | tables, ledger, payments, results | no | direct (phase 9) |
| `dashboard/.../members/actions` | 4 | invites, approvals | no | direct (phase 9) |
| `dashboard/claim/actions` | 1 | claim | no | direct |
| `admin/actions`, `photo-actions` | 10 | moderation | no (RLS: `is_motive_admin`) | direct (phase 9) |
| `auth/callback` route | 1 | `exchangeCodeForSession` | no | PKCE deep link / web route |
| `auth/signout` route | 1 | `signOut` | no | client |

Finding: **no server action holds a secret or uses the service role.** Each one
forwards the logged-in user's request to Supabase, which enforces the rules.
So the Expo app can call Supabase directly with identical security. The only
things a server is still needed for are listed in section 5.

### Supabase usage

- **Auth:** email OTP (`signInWithOtp` with `shouldCreateUser`), `verifyOtp`
  (code), `exchangeCodeForSession` (link), `getClaims` (checked on our server
  using the public signing key), `signOut`. Session is kept in **cookies** via
  `@supabase/ssr`, refreshed by `proxy.ts` on every request. Sign-up is gated
  in the database by the `check_signup_email` trigger (four uni domains +
  `allowed_emails`); the profile row and its uni are created by triggers.
- **Tables read/written from the app (33):** events, social_events, societies,
  profiles, ledger_rows, event_entries, society_members, profile_prompts,
  event_tables, society_claims, social_event_members, reports,
  social_event_addresses, profile_photos, event_private_details,
  society_admins, profile_photo_reports, profile_cards (view),
  ledger_payments, friendships, allowed_emails, threads, profile_settings,
  venues, user_blocks, two_truths, table_moves, society_member_invites,
  social_reports, signup_events, search_events, messages, universities.
- **Database functions called (53):** join_event, choose_table, leave_event,
  confirm_seat, join/leave_table_waitlist, table_waitlist_summary,
  set_also_tables, record_my_result/payment, mark/undo_payment,
  request_membership, invite_members, society_member_list,
  is_society_admin/member, society_is_claimed, search_societies,
  social_join/leave/respond/remove_guest, send_message, my_threads,
  open_dm/open_event_chat/open_host_dm, mark_thread_read,
  unread_message_count, delete_message, send/respond_friend_request,
  remove_friend, block_user, hidden_people, people_you_may_know,
  mutual_friend_count, profile_societies, add/pin/reorder/archive/restore
  profile photo, current_photo_count, save_profile_prompts, save_two_truths,
  two_truths_view, guess_two_truths, my_two_truths_days.
- **Storage:** `images` (public: society logos, event images), `avatars`
  (public), `profile-photos` (private: My 5, read through signed URLs).
  Upload policies check the path against society admin / own user id.
- **RLS assumptions the app relies on:** every table has row-level security;
  anon can read societies, venues and visible events (so links work logged
  out); writes that need rules go through `security definer` functions;
  `profiles.university` and `societies.university` are set by triggers and
  can't be changed by users; admin checks use `is_motive_admin()`. None of
  this changes.
- **Realtime:** not used. Chats and the notification bell poll.
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_MAP_STYLE_URL`.
  Become `EXPO_PUBLIC_*`.

### Browser-only dependencies

| What | Where | On native | On web (react-native-web) |
|---|---|---|---|
| `maplibre-gl` (map, place picker) with HTML/SVG pins, clustering, campus 3D overlay, map kept alive between tabs | `map/*`, `components/place-picker.tsx` | `@maplibre/maplibre-react-native` | `maplibre-gl` (current code largely reusable) |
| Canvas cropping and compression | `photo-cropper.tsx`, `lib/compress-photo.ts` | `expo-image-manipulator` | canvas, kept |
| `heic2any` | photo picker | not needed (picker returns JPEG) | kept for web |
| `<input type="file">` | photo picker, logo, event image | `expo-image-picker` | `expo-image-picker` works on web too |
| Drag-to-reorder via `document.elementFromPoint` | `use-drag-order.ts` | gesture-handler + reanimated | same (RNW supports both) |
| `localStorage`/`sessionStorage` (login in progress, map settings, install banner, bell last-seen, profile nudge) | 5 files | AsyncStorage | AsyncStorage (backed by localStorage) |
| Cookies: auth session, welcome, arrival uni; `proxy.ts` middleware | server-wide | secure storage | localStorage; no middleware |
| `navigator.geolocation` / permissions | map, directions | `expo-location` | `expo-location` (web supported) |
| `navigator.share` / clipboard | share button, install guide | RN `Share`, `expo-clipboard` | same packages |
| `navigator.vibrate` | reorder | `expo-haptics` | no-op |
| `createPortal` to `document.body` (attendees, avatar zoom, cropper) | 3 files | RN `Modal` | RN `Modal` |
| URL state (`window.history`, `location`) for social filters | `social/components/filters.tsx` | router params | router params (URL works on web) |
| `document.visibilityState` for pausing polling | chats, bell, tab bar | `AppState` | `AppState` |
| Install detection (`matchMedia`, `userAgent`) | `lib/install.ts`, banner | drop | keep for web PWA |
| Next-only: `next/link`, `next/navigation`, `next/image`, `next/font`, `useActionState`, `generateMetadata`, `revalidatePath`, `redirect` | 89 files | Expo Router, `expo-image`, `expo-font`, React Query | same |
| Tailwind classes + `globals.css` (46 shared classes: `.btn`, `.card`, `.input`…) | everywhere | NativeWind; the 46 classes become small components | NativeWind on web |
| `fetch` to Photon (addresses) and OSRM (walking directions) | place picker, directions | unchanged | unchanged |

Note: "Notification" in the code is the in-app notifications data type, not
the browser Notification API. There are no push notifications today.

---

## 2. New structure

```
student-motive/
  apps/
    web/        the current Next.js site, moved as-is (git mv web apps/web)
    mobile/     the Expo app: iOS, Android and web from one codebase
  packages/
    shared/     TypeScript shared by both: types, universities config,
                prompts, time helpers, ledger/settle maths, Supabase query
                functions, a supabase client factory
  supabase/     unchanged: migrations, seed, README
  docs/         this plan and the others
  package.json  npm workspaces: ["apps/*", "packages/*"]
```

- **apps/web stays byte-for-byte the same.** Moving the folder changes
  nothing in how it runs, but Vercel's **Root Directory** setting must change
  from `web` to `apps/web` at the moment the move is merged (Project →
  Settings → General → Root Directory). Do the move in its own pull request,
  with nothing else in it, and check the deployment before anything further.
- **apps/mobile** is a fresh `create-expo-app` (TypeScript, Expo Router
  template). Name "Function", slug `function`, bundle/package id
  `com.studentfunction.app` on both platforms, scheme `function` for deep links.
- **packages/shared** starts as a copy of `apps/web/src/lib` with the
  Next-specific files left out (`supabase/server.ts`, `auth.ts`, `storage.ts`,
  `install.ts`, `site.ts` stays). Its public API is: types, config, pure
  helpers, and *query functions that take a `SupabaseClient`* so both apps
  can call them. The web app is **not** switched to use it until the Expo
  app is live, to keep the website untouched.

### Expo app layout (Expo Router)

```
apps/mobile/
  app/
    _layout.tsx            fonts, theme, QueryClient, session provider
    index.tsx              landing (logged out) / redirect to (tabs)/map (logged in)
    lse.tsx ucl.tsx kings.tsx imperial.tsx   uni landing pages (web)
    privacy.tsx terms.tsx support.tsx install.tsx
    login.tsx  welcome.tsx
    auth/callback.tsx      email-link landing (web) and deep link target (native)
    (tabs)/_layout.tsx     the five tabs: Map, Societies, Social, Chats, Me
      map.tsx  societies.tsx  social.tsx  chats.tsx  me.tsx
    e/[id].tsx             society event
    s/[slug].tsx           society page
    social/[id].tsx  social/new.tsx  social/[id]/edit.tsx
    u/[id].tsx             profile
    account/index.tsx  account/archive.tsx
    chats/[id].tsx  friends.tsx  notifications.tsx
    dashboard/...  admin.tsx     committee and admin (phase 9)
  components/   ported from apps/web/src/components, NativeWind-styled
  features/     per-area hooks (useMapEvents, useEvent, useSocialFeed…) on React Query
  lib/          supabase client (platform storage), session, storage uploads
```

Keeping the same paths (`/e/[id]`, `/s/[slug]`, `/u/[id]`, `/social/[id]`)
means every link already shared on WhatsApp keeps working after the switch.

---

## 3. Stack and conventions

- **Expo SDK:** current stable at build time; Expo Router; `react-native-web`.
- **Styling:** NativeWind v4 with the existing Tailwind tokens copied from
  `globals.css` (colours, fonts, radius). The 46 shared CSS classes
  (`.btn`, `.btn-ghost`, `.card`, `.input`, `.label`…) become components with
  the same names (`<Button>`, `<Card>`, `<Input>`), so screens read the same.
  Light and dark follow the system as today.
- **Brand colour `#DA291C`.** The website's current brand token is indigo
  `#4338ca` (buttons, links, pins, the app icon). This plan uses `#DA291C` as
  the app's brand colour, icon and splash as instructed. Decide before phase 1
  whether the whole design moves to red (recommended: one brand) or only the
  icon does; it's a one-line token either way, but it affects every screen.
- **Fonts:** Bricolage Grotesque and Figtree via `expo-font` (Google Fonts
  packages), same as the site.
- **Data:** `@tanstack/react-query` for reads (replaces server components and
  Next's cached tabs); mutations call Supabase directly with optimistic
  updates (replaces the "instant" buttons built on server actions).
- **Supabase client:** one factory in `packages/shared`, given a storage
  adapter per platform:
  - **iOS/Android:** session in secure storage. Supabase sessions are larger
    than SecureStore's 2 KB per-item limit, so use Supabase's documented
    pattern: a random AES key in `expo-secure-store`, the encrypted session in
    AsyncStorage. Auto-refresh tied to `AppState` (foreground only).
  - **Web:** supabase-js's default `localStorage` storage. The site stops using
    cookies; nothing is server-rendered, so no `@supabase/ssr`.
  - **Login flow:** PKCE. Email **code** works unchanged. Email **link** opens
    `function://auth/callback` on native (and `https://studentfunction.com/auth/callback`
    on web, same route). Supabase → Authentication → URL Configuration gets
    the new redirect URLs added (nothing removed).
- **Images:** `expo-image` everywhere (replaces `next/image` and `<img>`).
  Public buckets by URL; `profile-photos` by signed URL as now.
- **Uploads:** `expo-image-picker` → `expo-image-manipulator` (crop/compress
  on device, matching today's 1600px/0.85 web compression) → `storage.upload`
  with the file's bytes. HEIC is handled by the picker on iOS; `heic2any`
  stays for web.
- **Navigation state that lives in the URL today** (social filters, `?next=`
  after login, `?society=` on the claim form) stays in the URL on web and
  becomes route params on native; Expo Router gives both from one code path.
- **Polling** (chats every few seconds, bell every minute) stays; pause on
  `AppState` background. Supabase Realtime is a later upgrade, not needed
  for parity.
- **Testing:** the existing Playwright suite (40 tests) and local stand-in
  backend (fake auth, PostgREST, Postgres) run against the **Expo web build**
  with updated selectors, which gives the web version real end-to-end
  coverage from the start. Native: Maestro flows for login, map, join, and
  the Societies rules; unit tests for `packages/shared`.

---

## 4. The map: one component, two implementations

```
components/map/
  Map.tsx          shared props: events, windows, home (uni centre), onPin,
                   look (day/night), onMove; renders <MapView> per platform
  Map.native.tsx   @maplibre/maplibre-react-native
  Map.web.tsx      maplibre-gl (today's live-map.tsx, minus Next bits)
  pins.ts          shared: grouping events into clusters, category colours,
                   live/soon state, label text (pure TypeScript, from map/pins.ts)
  campus.ts        shared: the LSE campus geojson layers (map-theme.ts)
  directions.ts    shared: OSRM walking route fetch (unchanged)
```

Metro picks `Map.native.tsx` or `Map.web.tsx` by file extension, so the rest
of the app imports `components/map/Map` and never knows. Same for
`PlacePicker` (the small map on the host and event forms).

- **Tiles and style:** OpenFreeMap's `positron` style URL works in both
  libraries (vector tiles, no key). The day/night styles are the same JSON
  edits applied in both.
- **Pins:** on web, today's HTML pins with pulse and glow carry over. On
  native, MapLibre RN renders pins as a `ShapeSource` with `clusterRadius`
  plus `SymbolLayer`/`CircleLayer` (fast, hundreds of pins), with a small
  animated `MarkerView` only for the handful that are live right now. The
  grouping logic is shared, so both show the same numbered bubbles.
- **Campus overlay:** the geojson of LSE building outlines is a
  `FillExtrusionLayer` on native and the existing fill-extrusion on web.
- **Pop-up cards:** a bottom sheet on native, the existing popup on web, fed
  by the same event card component.
- **My location and directions:** `expo-location` on both; OSRM route drawn
  as a `LineLayer` on both.
- **"Map kept alive between tabs":** the Expo tab navigator keeps tab screens
  mounted, which gives the same instant return for free.
- **Known gaps to check in a spike (phase 3, day 1):** MapLibre RN's pitch
  (the 35° tilt) and `fill-extrusion` support on Android; the OpenFreeMap
  style's sprite/glyph URLs loading on native; cluster tap to zoom.

---

## 5. What still needs a server, and how

Everything in the server actions can be called directly (section 1). These
can't, and this is the replacement for each:

| Need | Today | Replacement |
|---|---|---|
| **Link previews when an event or society link is shared** (WhatsApp, iMessage show title, time, image) | Next server-renders `<meta>` tags per page | The Expo web build is client-rendered, so crawlers see an empty shell. Add **one small Vercel serverless function** (`api/preview/[...path]`) that builds the meta tags for `/e/[id]`, `/s/[slug]`, `/social/[id]` from Supabase, and a rewrite that sends only crawler user agents there. Humans get the app. About a day. |
| **Email login link landing** | `/auth/callback` route handler | PKCE: the web route and the native deep link both call `exchangeCodeForSession` on the client. No server. |
| **Push notifications** (new, not parity) | none | Supabase **edge function** triggered by a database webhook on `messages`, `friendships`, `event_entries` etc., sending via Expo's push API; device tokens in a new `push_tokens` table. Phase 10. |
| **Web app manifest / PWA** | `manifest.ts`, `icon.tsx` | Static files in `apps/mobile/public`. |
| **Protected pages redirecting to login** | `proxy.ts` middleware | A session guard in `(tabs)/_layout.tsx` and the dashboard/admin layouts. Data is still protected by RLS whatever the client does. |
| Society import tools | scripts, not the site | unchanged |

Supabase edge functions are free on the current plan within limits; the
preview function runs on Vercel's free tier. No new accounts.

---

## 6. Deploying the Expo web build on Vercel and switching over

- **Build:** `npx expo export --platform web` in `apps/mobile` produces a
  static site in `dist/`. Use Expo Router's **static output** so every known
  route (`/`, `/map`, `/login`, `/lse`, legal pages…) is a real HTML file and
  dynamic routes (`/e/[id]`) get a fallback page that loads client-side.
- **Vercel project "function-app"** (new, alongside the existing one):
  Root Directory `apps/mobile`, build command `npx expo export --platform web`,
  output `dist`, `EXPO_PUBLIC_*` env vars, a `vercel.json` with:
  - rewrite of unknown paths to the fallback page (client routing);
  - the crawler rewrite to the preview function (section 5);
  - headers for the manifest and long-cache static assets.
- **Landing page for logged-out visitors:** the `/` route renders the
  existing London-wide landing (same copy as today) when there's no session,
  with "Log in" and "See the live map"; the uni pages `/lse` etc. likewise.
  Logged-in visitors are sent straight to the map tab. The map stays viewable
  logged out, as now.
- **Staging first:** deploy to `app.studentfunction.com` (or the Vercel
  preview URL) and run the Playwright suite and a manual checklist against
  it with real accounts, for at least a week of real use by the committee
  and a few students.
- **Switch-over (phase 11):**
  1. Freeze changes on `apps/web` for the day.
  2. In Supabase URL configuration, confirm both callback URLs are listed.
  3. Move the `studentfunction.com` domain in Vercel from the Next project to
     the Expo project (minutes; DNS unchanged).
  4. Keep the old Next deployment reachable at `legacy.studentfunction.com`
     for two weeks as a rollback, and as the committee dashboard if phase 9
     isn't finished yet (then Vercel rewrites `/dashboard/*` and `/admin/*`
     to it, cookies and login included, until the Expo versions ship).
  5. Rollback is the same domain move in reverse.
- **PWA users:** people who added the site to their home screen keep working:
  same domain, same routes, new manifest. They'll be logged out once
  (cookies → localStorage) and log in again.
- **What's lost on web, knowingly:** server rendering. First paint shows a
  shell and then data (today's pages arrive with data). Mitigated by React
  Query caching, skeletons (the site already has `loading.tsx` skeletons to
  copy), and the static landing pages for first-time visitors.

---

## 7. Build order

Each phase ends with: typecheck, the shared Playwright tests green on the
web build, a TestFlight/internal build for you to try, and a short note on
what to look at. Nothing in `apps/web` changes until phase 11.

| Phase | What | Done when |
|---|---|---|
| **0. Foundations** | Move `web` → `apps/web` (own PR, update Vercel root). Create `packages/shared` and `apps/mobile` skeleton: Expo Router, NativeWind with the site's tokens, fonts, the `Button`/`Card`/`Input` components, React Query, Supabase client with platform storage, EAS config, bundle ids, `#DA291C` icon and splash. CI runs typecheck for all three. | Empty app runs on iPhone, Android and web with the brand look. Website unaffected. |
| **1. Login** | Login screen (code flow, remembers a code in progress), email-link deep link and web callback, session guard, welcome screen with uni greeting, prompts and Two truths, "Me" tab shell with log out. Test sign-up with all four unis against the real database. | You can sign up and log in on all three platforms and land on a welcome screen that knows your uni. |
| **2. Events feed** | A new home list (there isn't one today): your uni's society events, then "open to all London" events and socials, grouped Tonight / Tomorrow / Later, from the same query the map uses. Event page in its basic form: details, who can come, "I'm going" / leave, share link. Society event visibility rules verified from the app. | Students can see what's on and say they're going. |
| **3. Map** | Day-1 spike on MapLibre RN (tilt, extrusion, style loading). Then `Map.web` by porting `live-map.tsx`, then `Map.native`: pins, clusters, live state, campus overlay, day/night, filters, search, my location, walking directions, pop-up cards. | Map tab matches the website on web and feels native on phones. |
| **4. Societies** | Societies tab with own-uni search and "Search all London unis", society page, join/leave, unclaimed label and claim form, uni-only rules shown. | Joining a society works and other-uni students see the right message. |
| **5. Full event page** | Sign-up lists and capacity, tables picker, seat confirmation, table waiting lists, bank, self-report, results and settle-up view, "who's coming". Poker Society night run end to end. | A real poker night can run from the app. |
| **6. Social** | Feed with filters, host form with the shared place picker, social event page, join/request/approve, attendees, message host, report. | Hosting and joining socials works. |
| **7. Profile and photos** | Profile page, avatar zoom, prompts, Two truths game; account editor; My 5 with picker, on-device crop, reorder, archive. | Profiles are complete on all platforms. |
| **8. Chats, friends, notifications** | Threads, messages with polling and pause in background, friends (requests, blocks, search, people you may know), in-app notifications and the bell. | Messaging works. |
| **9. Committee and admin** | Dashboard, society form, event form (venue picker, formats, tables, audience, image), event admin (tables, ledger, late arrivals, results, bank), members, claim approvals, reports, allowed emails. These can be web-only screens in the same codebase if native isn't worth it. | Committees and you can run everything without the old site. |
| **10. Web parity and extras** | Landing and uni pages, legal pages, install guide, PWA manifest, link-preview function, analytics rows, push notifications (optional). | Nothing on the old site is missing. |
| **11. Switch-over and stores** | Staging week, Playwright suite green, domain move, legacy subdomain, rollback plan. EAS production builds, App Store and Play listings, Apple review (reviewer account via `allowed_emails`). | studentfunction.com is the Expo build; the apps are in the stores. |

Phases 1–3 are what you asked to see first. Phases 4–8 can be reordered;
9 is the one to leave for last.

### Progress

- **Phases 0–2: done** on the `expo-app` branch (login, welcome, the What's
  on list, the event page), tested on the web build with Playwright.
- **Phase 3: done on the web, written for the phone.** `Map.web.tsx` is a
  port of the website's map (same style in the red palette, groups, glow,
  campus buildings, day/night, directions). `Map.native.tsx` uses MapLibre
  Native (v11) with the same style and logic; the pins are small native
  views. It typechecks but hasn't run on a phone yet: the first EAS build
  is the moment to check tilt, the 3D buildings and the pin positions.
  Everything around the map (time pills, filter, search, the event card,
  the List view) is shared React Native.
- **Phase 4: done.** Societies tab (own-uni search, "Search all London
  unis", your societies, societies you run, upcoming events) and the
  society page (join with your name, request sent, leave, the other-uni
  message, the Unclaimed label and claim link). The committee dashboard
  and the claim form open on the website until phase 9.
- **Phase 5: done.** The full event page: the name form before a first
  join, I'm going, the sign-up list with a limit and waiting list, tables
  (sit, move, leave, also-tables, confirm your seat, waiting lists for
  full tables), the bank's screen (buy-ins, rebuys, cash-outs, paid, the
  even split), buy-in/cash-out line for players, your own result and
  settle-ups, and after results are published: your result, who pays who,
  "I've paid" / "Got it" and undo. Student-hosted events show the guest
  side (join, ask to join, waiting list, who's going); the host's tools
  come with Social in phase 6.
- **Phase 6: done.** Social: Discover with search and filters, Hosting
  (with the requests badge) and Going; the host form with the place
  picker (LSE places, then addresses from Photon, a tappable map; the
  phone's own date and time pickers on iOS/Android, the browser's on the
  web), rough spot for everyone and the exact address for people going,
  cost, open/private, friends only; the event page with who's going,
  I'm in / request / leave, the host's requests and guest list, edit,
  cancel, report, Message host and the group chat link (chats in phase 8).
- **Phase 7: done.** Profiles: someone's page (picture zoom, prompts,
  Two truths and a lie to play, societies, their 5 photos with report,
  what they're hosting, friends in common, add/accept/remove friend,
  block and report) and your editor (profile picture with a cropper,
  My 5 with add, reorder, remove, re-crop on the web, the Archive with
  restore and delete, show-societies, name and course, prompts and Two
  truths). On the phone the photo library's own cropper is used; the web
  has the site's drag-and-zoom cropper.
- **Phase 8: done.** Chats (private and event group chats, new messages
  picked up every few seconds while open, delete, report, unread badge on
  the Chats tab), Friends (search, requests, your friends, people you've
  been to events with, requests you've sent) and Notifications (Two truths
  plays, table moves, friend requests, society events; a badge on the Me
  tab until it's opened).
- **Phase 9: done, native too.** The committee dashboard (societies you
  run, requests to manage one, the claim form), one society's dashboard
  (events, society details with a logo), the event form (venues or a pin
  on the map, cost, standard / sign-up list / tables with levels and
  seats, who can see it, image, cancel), managing an event (tables with
  start, move, remove, late arrivals, the waiting list, finishing
  positions, results per table with who pays who and settling up, the
  bank per table, sharing results), members (approve, add by email,
  remove) and the Function admin page (claims, reports, reported photos,
  who can join, add a society). The app no longer sends anyone to the
  website for these.
- **Phase 10: done (push notifications left out).** The web build now has
  everything the old site had around the app: the landing page and the
  uni pages (/lse, /ucl, /kings, /imperial, which remember the uni for the
  login page's email example), Privacy, Terms and Support with the footer
  links, the install guide (steps for iPhone and Android, one-tap install
  on Android Chrome, the Instagram/TikTok in-app browser warning, the
  copy-link box, the poster picture), a proper 404 page, the web app
  manifest with the red theme and icons (`apps/mobile/public`), the page
  `<head>` for the web build (`src/app/+html.tsx`: description, theme
  colour, home-screen tags) with per-page titles via `generateMetadata`,
  and the link-preview function (`apps/mobile/api/preview.js`) that gives
  WhatsApp, iMessage and the like a title, time, place and picture for
  shared event, society and social links. `apps/mobile/vercel.json` holds
  the Vercel build settings, the crawler rewrite to that function, the
  rewrites for the dynamic pages (`/e/:id` → `/e/[id].html` and so on) and
  cache headers, ready for phase 11. The analytics rows (sign-up funnel
  events, all-unis search log) were already written in phases 1 and 4.
  Push notifications are not built: they need a new `push_tokens` table
  and a Supabase edge function, so they stay a separate item for later.
  Two things to know for the App Store: the privacy and terms pages still
  carry the website's "Draft" banner and must be reviewed, and "Delete my
  account" (which Apple requires for apps with sign-up; the website never
  had one) is ready on the `delete-account` branch: a button at the bottom
  of Me → Edit profile plus one new database function
  (`supabase/migrations/20261107000000_delete_my_account.sql`). The SQL has
  been run in Supabase and the branch is merged into `expo-app`.
- **Phase 11: prepared; the rest is yours.** Everything the code can do
  is done: `apps/mobile/vercel.json` (build, rewrites, link previews,
  cache headers), the app config for the stores (bundle ids, no non-exempt
  encryption, links that open the app), a password login path for the
  stores' review account, and `docs/EXPO_LAUNCH.md`, a step-by-step guide
  for the staging deploy, the domain switch, the first phone builds, and
  the App Store and Google Play listings (with the listing text and the
  privacy answers written out). The staging week, the domain move and the
  store submissions need your Vercel, Supabase, Apple, Google and Expo
  accounts, so they're the next thing to do, in the guide's order.

### Things to decide before phase 0

1. **Red or indigo everywhere?** (`#DA291C` vs the current `#4338ca`.)
2. **Should committee screens (phase 9) be native too, or web-only?** Web-only
   saves a lot and matches how committees work.
3. **Accounts and costs** (outside the codebase): Apple Developer Program
   (£79/year, needed for TestFlight and the App Store), Google Play (£20
   once). EAS Build's free tier is enough to start.
4. **Supabase redirect URLs** to add: `function://auth/callback` and the
   staging domain.

### Risks, honestly

- The map is the biggest technical risk: MapLibre RN is solid but the
  current map leans on browser tricks (HTML pins, kept DOM). The phase-3
  spike exists to find out early.
- Losing server rendering costs a little on first load and needs the
  preview function for shared links.
- The event page's poker machinery has the most states; it needs real use by
  the Poker Society before switch-over.
- The Playwright tests give web confidence; native needs real phones in
  hands, which is you.
