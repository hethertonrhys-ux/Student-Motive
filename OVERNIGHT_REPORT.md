# Overnight report

Good morning. All 20 items are built and tested.

- **10 are live** on studentfunction.com already.
- **10 are ready on branches.** They need a database change, which I can't make from here, so they wait for you. It's about 10 minutes of copy, paste and click; see section 3.

Every change was tested before it went anywhere:

- the build;
- all 4 Societies tests;
- logging in, logging out and signing up;
- the existing Social test;
- a new phone-sized browser test for each item.

Nothing that failed was pushed.

---

## 1. Status of every item

| # | Item | Status | One line |
|---|---|---|---|
| 1 | Location picker map blank | **Live** | The map shows when hosting. Tap or drag the pin, and the spot saves with the event. |
| 2 | Social events on the map | **Live** | Social events now appear on the map, with the same colours and icons, filter, search and Now/Tonight/Tomorrow. |
| 3 | Chat badge doesn't clear | **Live** | Opening a chat clears the badge straight away. It comes back only for new messages. |
| 4 | Multi-select categories + Food | **Live** (multi-select) + **Branch** `item-4-food-category` (Food) | Tick several categories at once. Food needs one database line. |
| 5 | Show who's attending | **Live** | Round faces with the host first, labelled "Host"; "+N more" opens everyone. |
| 6 | Social event cost | **Branch** `item-6-social-event-cost` | Optional cost: Free or £. Shown on the card and page. Display only. |
| 7 | Society event cost | **Branch** `item-7-society-event-cost` | The same cost field on society events (includes item 6). |
| 8 | Automatic event group chats | **Branch** `item-8-event-group-chats` | Every Social event has a group chat. Join to get in, leave to get out; the host is always in. |
| 9 | Walking route | **Live** | "Directions" on map event cards shows the walking route and time. It uses a free route service. |
| 10 | Society event notifications | **Live** | New bell with a badge. "LSE Poker Society posted a new event: …" |
| 11 | Friend request notifications | **Live** | Friend requests in Notifications, with Accept and Decline. |
| 12 | Photos stay permanently | **Branch** `item-12-photos-stay` | No expiry and no countdown. A clear "remove" X asks "Are you sure?". The Archive is kept. |
| 13 | Multi-photo upload + crop | **Live** | Pick several photos at once, then crop each to the profile shape. |
| 14 | Reorder photos | **Branch** `item-14-reorder-photos` | Press and hold, then drag. The first photo shows first (includes item 12). |
| 15 | Re-crop profile picture | **Live** | Zoom and drag to fit the circle; "Adjust" re-crops without uploading again. |
| 16 | "Preview profile" button | **Live** | A big button at the top of Your profile. |
| 17 | Prompts replace About me | **Branch** `item-17-profile-prompts` | 40 prompts, up to 3 answers, Shuffle, "2/3" progress, cards on the profile. A nudge on private requests. |
| 18 | Add to Home Screen | **Live** | iPhone steps in the banner, Android's install prompt, the app named "Function", and no emoji. |
| 19 | Simpler poker settle-up | **Branch** `item-19-poker-settle-up` | Method at the top, results, who pays who with "Mark paid", and what's outstanding. |
| 20 | Poker waiting lists | **Branch** `item-20-poker-waiting-lists` | Queue for a full table. The first in line moves automatically before the start and is notified. |

Nothing was skipped. Nothing costs money or needs a new account or key.

**Also ready:** `all-waiting-items` is all 10 branches already combined into one. I merged them, fixed where they overlapped, and ran every test together; the result is in section 6. If you want everything, you only need to merge this one branch.

---

## 2. Decisions I made for you

**Bugs**

- **Item 1:** the same blank-map bug is in the **Societies** event form ("Somewhere else, pick it on a map") and the old /host page. That's Societies code you hadn't approved, so I **didn't change it**. It's a one-line fix if you want it.
- **Item 2:**
  - The map only covers Now/Tonight/Tomorrow, so your padel event shows there only if it's within that window. One later in the week appears when it gets close.
  - I couldn't see your live data from here.
  - Social-only categories got their own pins: Study (teal book) and Other (grey star).

**Events**

- **Item 4:** multi-select went live on its own. Food needs a database change, so it's on a branch.
- **Item 5:** done on Social event pages only. Society event pages (/e/…) are Societies code and weren't approved for this item.
  - Only the host and people going can see faces, as before. Others see "N going".
  - The host keeps their list with Remove buttons.
- **Item 6:** cost has three choices: "Don't show", "Free" or "Costs money". A mistyped price is caught on the phone before sending.
- **Item 7:** built on top of item 6 (they share the cost box), so merging 7 brings 6 too.
- **Item 8:** group chats are for Social events.
  - Society events weren't approved for this item.
  - Old student-hosted events from /host already had chats.
  - Membership isn't a separate list. The database lets the host and everyone "going" use the chat, so join, leave, approve and remove all just work.
- **Item 9:**
  - The route comes from routing.openstreetmap.de (free, OpenStreetMap, no key).
  - If it's down, the app shows a dotted line and "About N min walk".
  - Social events route to the rough area only, so the exact address stays private.
  - When the route shows, the event card closes and a small bar takes its place.

**Notifications**

- **Items 10 and 11:**
  - "New since last time" is remembered on each phone, not per account, which avoided a database change.
  - A phone opening Notifications for the first time counts the last 3 days as new.
  - The app had no push notifications, so these are in-app only (see section 5).

**Profiles**

- **Item 12:**
  - "Remove" moves a photo to the Archive rather than deleting it, so nothing is lost by accident. Delete for good is still in the Archive.
  - Pin/Unpin was removed because everything stays now.
  - Photos that had **already** expired are kept in the Archive, as you asked; the SQL marks them archived so they don't jump back onto profiles.
- **Item 13:** photos are cropped to 4:5, the shape your profile shows them in.
- **Item 14:**
  - Built on top of item 12, so merging 14 brings 12.
  - Newly added photos go to the front until you reorder.
- **Item 15:** the whole original photo is now kept beside the circle, so re-cropping can zoom out again.
  - Pictures uploaded before today only have the circle, so Adjust can only zoom in on those, until the person changes photo once.
- **Item 17:**
  - Your "[your uni]" prompt reads "Unpopular opinion about LSE…".
  - 5 prompts are shown at a time, one per category.
  - Old About me text is untouched in the database. The profile form also no longer overwrites it.

**Poker**

- **Item 19:** for "one player is the bank" I kept the existing bank screen (buy-ins and cash-outs, plus "Paid?" ticks), because it already does exactly that and your Societies tests cover it. The new work is:
  - the method choice at the top;
  - "Mark paid" on every "who pays who" payment;
  - the "Still to pay" total;
  - players marking their own payments "I've paid" or "Got it", with Undo.

  Marks are saved as payments, so editing results recalculates automatically.
- **Item 20:**
  - One waiting list per player per event; joining another replaces it.
  - "Started" means the start time has passed, or any table was started early.
  - Moves happen inside the database, so they also work when the committee moves or removes someone.
  - The committee page doesn't list who's waiting yet. Players see counts and their place.

**Tests**

- Some older tests read the database before an "instant" button had finished saving (from the speed work). I added proper waits to those tests. The app itself was fine.

---

## 3. What you need to do (about 10 minutes)

Only needed for the branch items.

**Order matters for one item.** Run the SQL, then merge the code **straight away**. Between the two, the live site still shows the photo countdown (item 12), so don't leave a gap of hours.

### Step A: run the SQL in Supabase

1. Go to supabase.com, open your project, then **SQL Editor** in the left menu, then **New query**.
2. Open GitHub → your repo → switch the branch dropdown to **`all-waiting-items`** → folder `supabase/migrations`.
3. For each file below, **in this order**:
   - open the file, click "Raw", select all and copy;
   - paste it into the SQL Editor and click **Run**;
   - you should see "Success. No rows returned".
4. Run each file **once**.

| Order | File | For item |
|---|---|---|
| 1 | `20261024000000_food_category.sql` | 4 (Food) |
| 2 | `20261025000000_social_event_cost.sql` | 6 |
| 3 | `20261026000000_society_event_cost.sql` | 7 |
| 4 | `20261027000000_social_event_chats.sql` | 8 |
| 5 | `20261028000000_photos_stay.sql` | 12 |
| 6 | `20261029000000_photo_order.sql` | 14 |
| 7 | `20261030000000_profile_prompts.sql` | 17 |
| 8 | `20261031000000_mark_payments_paid.sql` | 19 |
| 9 | `20261101000000_table_waiting_lists.sql` | 20 |

All of them only **add** things: new columns, tables, functions and rules. Nothing is deleted or renamed. Two small notes:

- **Item 8** swaps one rule about what kinds of chat can exist. All existing chats still pass it.
- **Item 12** marks already-expired photos as archived, which is what users already saw.

The short ones, for reference:

```sql
-- 1. Food (item 4)
alter type public.social_category add value if not exists 'food';

-- 2. Social event cost (item 6)
alter table public.social_events add column if not exists cost_pence integer
  check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));

-- 3. Society event cost (item 7)
alter table public.events add column if not exists cost_pence integer
  check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));
```

The rest are longer, so copy those files whole.

### Step B: merge the code (makes it live)

- **Everything at once (simplest):** on GitHub, open the `all-waiting-items` branch, then "Compare & pull request", then "Create pull request", then **"Merge pull request"**. Vercel puts it live in about 2 minutes.
- **Or pick and choose:** do the same for any single branch, and only run that item's SQL.
  - Item 7 includes 6; item 14 includes 12.
  - Each branch merges cleanly into today's live code on its own.

If anything looks wrong after merging, the pull request page has a **"Revert"** button. The database additions are harmless to leave in place.

---

## 4. Phone test checklist

**Live now**

- [ ] **1:** Social → + Host. Under Location, the map shows. Tap it, then drag the pin, then post. The event page has the right spot.
- [ ] **2:** Map → Tonight/Tomorrow. Social events appear with the right icons; search finds them; the card opens the Social event.
- [ ] **3:** Get a friend to message you; the Messages badge appears. Open the chat, then go to another tab; the badge has gone.
- [ ] **4:** Social → tap search → Category → tick Social and Nightlife. Both kinds show.
- [ ] **5:** Open a Social event you're going to. You see the faces, the host is labelled "Host", "+N more" opens the list, and tapping a face opens their profile.
- [ ] **9:** Map → tap an event → Directions. Allow location; the route and "N min walk" appear; "Open in Maps" works.
- [ ] **10:** Post a test event in a society you're in (or ask the committee). Within a minute the bell shows a red number; Notifications lists it; tapping opens it.
- [ ] **11:** Ask someone to add you as a friend. The bell shows it; Accept works from Notifications.
- [ ] **13:** Your profile → My 5 → Add photos → pick 2–3. A cropper appears for each (drag/pinch) and they upload.
- [ ] **15:** Your profile → Change photo → fit it in the circle → Save. Then "Adjust" re-opens it to reposition.
- [ ] **16:** Your profile → the "Preview profile" button at the top shows your profile as others see it.
- [ ] **18:** In Safari on iPhone, in a private tab: the banner shows "tap Share, then Add to Home Screen" with no emoji. Add it; the app opens full screen with the "Function" name and icon. × hides the banner for good.

**After step 3 (branches)**

- [ ] **4:** Host a Social event and choose Food. It shows with the Food filter and on the map.
- [ ] **6:** Host with Cost £6. The card shows "£6"; the page shows "£6 per person".
- [ ] **7:** Society dashboard → new event → Cost £5. The event page shows "£5 per person".
- [ ] **8:** Join a Social event → "Open group chat". It's in Messages; leave the event and it disappears.
- [ ] **12:** My 5 has no countdown. Tap X, confirm, and it's in the Archive.
- [ ] **14:** Press and hold a photo, then drag it to the front. Your profile shows it first.
- [ ] **17:** Your profile → Prompts: answer 3 (Shuffle works; you see "3/3"). They show as cards on your profile. On a friend's phone with no prompts, requesting a private event suggests adding one, with Skip.
- [ ] **19:** On a finished poker event's committee page, choose the method, enter results (one negative) → Mark paid. As a player after "Share with players": "I've paid" works.
- [ ] **20:** On an upcoming poker event with a full table: "Join waiting list" shows your number. Someone leaves that table and you're moved; it's in Notifications.

---

## 5. Things that might break, or that I'm unsure about

- **Directions (9):** the free route service couldn't be reached from my test machine, so my test faked its answer. Please try it once for real. If it's down, people still get an estimate and "Open in Maps".
- **Adjust photo (15):** it loads the photo from Supabase Storage in the browser. Public Supabase files normally allow this; if "Adjust" says "Couldn't open your photo", tell me.
- **Push notifications** to the lock screen aren't built. They're free, but need:
  - a service worker;
  - "VAPID" keys stored as a Vercel secret;
  - a table of phones' push subscriptions;
  - on iPhone, the app added to the Home Screen first (iOS 16.4+).

  Happy to do it next if you want.
- **Notifications "seen"** is per phone, so reading them on your laptop doesn't clear your phone's badge.
- **Item 12 timing:** run its SQL and merge within minutes, as above.
- **Old profile pictures (15):** these can only be zoomed in, not out, until changed once.
- **Not changed, not in the Social tab:** emojis remain in Messages ("Say hi 👋", a 🎉 icon for event chats), on map cards (📍) and in some Societies pages. You only asked for the Social tab.
- **Item 20:** the committee view doesn't show the queues (players do).

---

## 6. Societies tests after the final change

The final run is on `all-waiting-items`, which has every item from tonight together. It passed **all 30 checks**:

- typecheck, lint and build;
- societies1, societies2, societies3 and societies4;
- login, logout and sign-up;
- the Social test;
- all 20 item tests.

The full list is in `PROJECT_NOTES.md` under "Tests". Live `main` (the last live change was item 18) also passed all 4 Societies tests. Every item branch passed them too.

---

## Follow-up (after your phone test)

**Live now**
- **Location map:** the blank map was on the older "Host an event" page (from the home screen) and a society's "Somewhere else" box, which still used an old copy. All three now share one fixed picker: the map shows, the pin is visible and draggable, and the chosen place stays in the search box (outlined in green).
- **LSE buildings in the search:** 45 LSE buildings, theatres, halls and spots come up first. Short names work too, e.g. "SAW", "NAB"/"CKK", "32L", "Tuns". The usual address search follows.
- **Home → "+ Host an event"** now opens the same Social hosting form as the Social tab.
- **Host colour:** the host has a gold ring and a gold "Host" label on Social event pages.
- **Profile pictures:** tap one on someone's profile to see it big; tap anywhere to close.
- **Crop photos already uploaded:** each My 5 photo has a small crop button (bottom right). It keeps its place.

**Waiting (SQL)**
- **"Learn" category:** added to the `item-4-food-category` branch. Extra SQL file `20261024000001_learn_category.sql`:
  `alter type public.social_category add value if not exists 'learn';`
- **Message the host without being friends:** "Message host" next to "Hosted by" opens a private chat. Blocking still stops it.
  - Branch `followup-message-host`, built on the group-chats branch.
  - SQL file `20261102000000_message_the_host.sql`; run it after the group-chats one.
- **Reordering photos** still needs the item 12 and 14 SQL plus a merge (section 3). It isn't live yet, which is why you couldn't move photos.

`all-waiting-items` now includes all of the above. Its SQL list is the 9 files in section 3 plus the 2 above, run in filename order (11 in total). After today's changes I re-ran the full test suite on it, everything at once: all **34 checks passed**, including the 4 Societies tests.

---

## Appendix: detailed notes per item

Test files mentioned below live in my scratch area, not in the repo; PROJECT_NOTES.md describes them.

### Item 1: Location picker map is blank
- Cause: the map library's own CSS sets the map box to `position: relative`, overriding Tailwind's `absolute inset-0`, so the box collapsed to 0 px tall (grey/white). The main Map tab already avoided this.
- Fix: the wrapper has the height, the map box is h-full w-full (Social hosting form).
- Same bug exists in the Societies event form ("Somewhere else (pick it on a map)") and the old /host page, which share src/app/dashboard/[societyId]/where-field.tsx. NOT changed (Societies code, not approved). One-line fix if approved.
- Test: tests/picker.mjs (map size, map data loads, tap = pin, drag moves it, saved exact spot matches).

### Item 2: Social events on the map
- Cause: the map only loaded society events (the `events` table); Social events live in `social_events` and were never fetched.
- Fix: the map now loads both at the same time. Social pins use the same colours/icons (Sport, Social, Nightlife) plus two new map categories for Social-only ones: Study (book, teal) and Other (star, slate). Filter, search and Now/Tonight/Tomorrow all include them. The pin card links to the Social event page. Friends-only events only show for the host's friends (the database decides).
- Your padel event: it will show if it's public (or you're friends) and happens before 6am the day after tomorrow, because the map only covers Now/Tonight/Tomorrow. A padel event later in the week won't be on the map until then. (Couldn't check the live data from here.)
- "N going" on Social pins counts the host too.
- Test: tests/socialmap.mjs.

### Item 3: Chat badge doesn't clear
- Cause: the chat WAS marked read in the database when opened, but the bottom bar's badge is part of the page frame, which isn't reloaded when you move between pages (and tabs are now cached), so it kept the old count.
- Fix: opening a chat marks it read and immediately updates the badge; the Messages list is refreshed. The bar also re-checks the unread count every minute and whenever you come back to the app, so a new message brings the badge back.
- Test: tests/chatbadge.mjs.

### Item 4: Multi-select categories + Food
- **Multi-select: LIVE** (commit 09d484d). Tick several categories on Discover; shows events in any of them. Kept in the address (?category=social,nightlife) so a reload keeps it. Menu stays open while ticking.
- **Food: BRANCH `item-4-food-category`** (needs a database change). Adds Food to hosting, Discover filter and the map (amber pin, fork-and-knife icon).
  SQL (Supabase > SQL Editor > New query > paste > Run):
  `alter type public.social_category add value if not exists 'food';`
  Then merge the branch into main (GitHub: open the branch, "Compare & pull request", Merge).
- Tests: multicat.mjs (live), food.mjs (branch): host a Food event, another student finds it with the Food filter. Full suite passed on both.

### Item 5: Who's attending: LIVE
- Social event pages: a "Who's going" card. Host first in a separate spot with a "Host" label, then up to 6 faces, then "+N more" which opens the full list (a sheet from the bottom). Tapping any face opens that profile.
- Privacy kept as before: only the host and people going can see who's going (the database enforces this). Others see the host, "N going, including the host" and "Join to see who."
- The host's own "Going (N)" list with Remove buttons stays, for the host only (guests now use the faces instead, so it isn't shown twice).
- Society event pages (/e/...) NOT changed: that's Societies code and item 5 isn't one of the approved Societies items. Easy to add the same card there if you approve.
- Test: tests/attendees.mjs (10 people: host first, 6 faces, "+3 more", full list of 10, face opens profile, stranger sees no faces, host keeps 9 Remove buttons).

### Item 6: Social event cost: BRANCH `item-6-social-event-cost`
- Hosting form: "Cost (optional)": Don't show / Free / Costs money (£ box, e.g. 6 or 6.50, up to £1,000). Display only, no payments.
- Shows on the event card as a chip ("£6", "£6.50", "Free") and on the event page as "Cost: £6 per person" / "Free". Nothing shown if the host didn't say.
- A mistyped price is caught on the phone before sending (otherwise the form would clear the other boxes, an existing quirk of these forms).
- Needs a new column. SQL:
  ```sql
  alter table public.social_events add column if not exists cost_pence integer
    check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));
  ```
- Test: branchtests/cost.mjs (bad price stopped, £6.50 saved as 650, card chip, page, edit to Free, no-cost shows nothing). Full suite passed.

### Item 7: Society event cost: BRANCH `item-7-society-event-cost` (approved Societies change)
- Built on top of the item 6 branch (they share the Cost box), so merging item 7 brings item 6 with it.
- Societies files changed, only for this field: dashboard/[societyId]/event-form.tsx (adds the Cost box), dashboard/[societyId]/actions.ts (reads it), e/[id]/page.tsx (shows "Cost"), s/[slug]/page.tsx (adds "· £5" to the society's event list), lib/types.ts (the field).
- SQL (run both item 6 and item 7 SQL before merging):
  ```sql
  alter table public.events add column if not exists cost_pence integer
    check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));
  ```
- Test: branchtests/societycost.mjs (committee posts a £5 event; saved as 500; event page "£5 per person"; society page shows £5; no cost = nothing shown). Full suite incl. all 4 Societies tests passed.

### Item 8: Automatic event group chats: BRANCH `item-8-event-group-chats`
- Every Social event gets a group chat, titled with the event name, made the moment the event is posted (and the SQL also makes one for every existing Social event).
- Reuses the existing chat feature (same Messages list, same chat screen, same unread badge). Who's in it isn't a separate list: the database lets the host and everyone "going" use it. So joining (or being approved, for private events) adds you, leaving or being removed takes you out, and the host is always in. Requests that aren't approved yet don't get in.
- "Open group chat" button on the event page (host and people going). The chat header links back to the event.
- Society events: not changed (Societies code; item 8 isn't one of the approved Societies items). Student-hosted events from the old /host page already had chats.
- Database: adds a `social_event_id` column to `threads`, swaps the "what kind of chat" rule to allow the new kind (all existing chats still pass), updates who-can-use-a-chat and the chat list function, adds a trigger. Nothing deleted. SQL: the whole file `supabase/migrations/20261027000000_social_event_chats.sql` on that branch (copy it all into the SQL Editor and Run).
- Test: branchtests/groupchat.mjs (chat made with event, host in it, guest not in until joining, join, open chat, send message, host sees it unread, outsider can't open it, leaving removes it, private: not in while pending, in once approved). Full suite passed.

### Item 9: Walking route to events: LIVE
- Map event card has a "Directions" button. Your location is asked for only when you tap it (if you already allowed location earlier, the map already shows your blue dot as before, and no new question is asked).
- Free route service: routing.openstreetmap.de (run by FOSSGIS, OpenStreetMap data, no account or key, fair-use). The route is drawn on the map; a bar at the bottom shows e.g. "9 min walk · 760 m", "Open in Maps" (Google Maps walking directions, a plain free link) and "Clear route". The card closes so the route can be seen.
- If the route service is down: a dotted straight line and "About N min walk" (estimate). If location is refused: a clear message plus "Open in Maps instead".
- Social events: route goes to the rough area (the exact spot stays private), with a note saying so.
- Also fixed: the map's credit line could sit on top of the bottom bar's buttons.
- Couldn't reach the route service from this test machine, so the test fakes its answer; worth one real try on your phone.
- Test: tests/directions.mjs.

### Item 10: New society event notifications: LIVE
- New bell in the top bar (next to the settings cog), with a red number for anything new. It opens a new Notifications page.
- When a society you're an approved member of posts an event, you get "LSE Poker Society posted a new event: Friday Tournament" (last 30 days). Tapping opens the event. Only reads society data; no Societies code changed.
- The badge counts things newer than when you last opened Notifications, remembered on each phone (so reading them on your laptop doesn't clear your phone's badge). A phone that's never opened Notifications counts the last 3 days as new. Checked when a page opens, every minute, and when you come back to the app.
- No database change needed: built from the existing events and memberships.
- Push notifications (to the phone's lock screen): the app doesn't support them yet, so these are in-app only. Push would need: a service worker, free "VAPID" keys stored as a Vercel secret, a new table to keep each phone's push subscription, a small server job to send them, and on iPhone the app must be added to the Home Screen first (iOS 16.4+). All free, but it needs a database table and a new secret, so I didn't add it tonight.
- Test: tests/notifications.mjs.

### Item 11: Friend request notifications: LIVE
- Friend requests now show at the top of Notifications ("Sam Sender sent you a friend request · 5 min ago") with Accept and Decline buttons; tapping the name/photo opens their profile. They count towards the bell badge. Once answered they disappear from the list.
- Blocked people's requests are hidden (same as the Friends page). The Messages > Friends page still shows requests too.
- No database change. Push: same as item 10 (in-app only for now).
- Test: tests/friendnotif.mjs (two requests, badge 2, accept one, decline the other, database checked, list empty afterwards).

### Item 12: Photos stay permanently: BRANCH `item-12-photos-stay`
- No more 30-day expiry and no "days left" countdown. Pin/Unpin removed (no longer needed: everything stays).
- Each photo in My 5 has a clear round X. Tapping asks "Remove this photo from your profile? It goes to your Archive, where you can put it back or delete it." Removing = moving to the Archive (nothing is deleted unless the person deletes it from the Archive).
- Archive unchanged: restore or delete for good. Its wording no longer mentions 30 days.
- Database: the expiry rule lives in the database (the "5 spaces" count and who-can-see-a-photo rules), so it has to change there. The SQL:
  1. marks photos that had ALREADY run out (unpinned, over 30 days old) as archived, dated when they ran out, so they stay in the Archive where people can see them today (nothing jumps back onto profiles);
  2. updates the space count, the pin rule and the two "who can see" rules to "not archived" instead of "under 30 days".
  Nothing is deleted. The full SQL is the file `supabase/migrations/20261028000000_photos_stay.sql` on the branch.
- IMPORTANT order: run the SQL, then merge the branch straight away (within minutes). In between, the live site still shows the old countdown.
- Test: branchtests/photostay.mjs (expired photo stays archived, pinned and recent stay, a 60-day-old photo stays, no countdown/pin, Remove asks first and moves it to the Archive, other people see only profile photos). Full suite passed.

### Item 13: Upload several photos at once, with cropping: LIVE
- "Add photos" now lets you pick several photos at once, up to your free spaces. If you pick more, the first ones that fit are kept and a note says so.
- Each photo then opens in a cropper ("Crop photo 1 of 3") in the 4:5 shape profiles show photos in: drag to move, pinch (or the Zoom slider) to zoom. Buttons: Next / Skip, and "Add photos" on the last one. Then they upload one after another ("Uploading 2 of 3…").
- Cropping is done on the phone (no new service); the saved photo is up to 1080x1350. HEIC iPhone photos still work (converted on the phone as before).
- Note: this is on the live site's current My 5 (with the countdown); item 12's branch removes the countdown. I've updated the item 12 branch to include this, so they merge cleanly.
- Test: tests/multiphoto.mjs (pick 3, drag + zoom, Next, Skip, Add: 2 saved, both exactly 4:5; pick 5 with 3 spaces: only 3 offered; skipping all saves nothing).

### Item 14: Reorder photos: BRANCH `item-14-reorder-photos` (built on item 12's branch)
- On a phone: press and hold a photo for about a third of a second (it lifts, with a little buzz on Android), then drag it to a new place. A quick swipe still scrolls the page as normal. On a computer: click and drag.
- The first photo gets a small "First" label and is shown first on your profile. New photos you add appear at the front until you reorder.
- Holding a photo no longer pops up the phone's "save image" menu.
- Needs a new column. SQL (after item 12's SQL):
  ```sql
  alter table public.profile_photos add column if not exists position integer;
  create or replace function public.reorder_profile_photos(ids uuid[])
  returns void language sql security definer set search_path = ''
  as $$
    update public.profile_photos p set position = o.i
    from unnest(ids) with ordinality as o(id, i)
    where p.id = o.id and p.user_id = (select auth.uid());
  $$;
  ```
- Merging item 14 brings item 12 with it.
- Test: branchtests/reorder.mjs (quick swipe doesn't reorder; hold + drag C to the front gives C A B; saved; kept after reload; profile shows C first; mouse drag on a computer). Full suite incl. item 12's test passed.

### Item 15: Crop the profile picture: LIVE
- Choosing a profile picture now opens the cropper with a circle guide: drag to move, pinch or the slider to zoom, then Save.
- New "Adjust" button next to Change photo / Remove: re-opens the picture to re-crop or reposition it, without uploading again. It works from the whole original photo, which is now kept next to the circle (in the same storage folder, replaced when you change photo, removed when you remove it).
- Pictures uploaded before tonight only have the small circle saved, so Adjust can zoom in and move but not zoom out further than the current picture. After someone changes their photo once, full re-cropping works.
- Needs nothing new: same storage bucket, no database change. One thing to check on your phone: Adjust loads the photo from Supabase Storage in the browser. Public Supabase files normally allow this; if Adjust shows "Couldn't open your photo", tell me.
- Test: tests/avatar.mjs (circle cropper, save keeps circle + original, Adjust starts from the whole photo, re-crop reuses the same original, picture is 512x512).

### Item 16: "Preview profile" button: LIVE
- A big full-width "Preview profile" button (with an eye icon) right under the "Your profile" heading. It opens your profile exactly as others see it. Replaces the small "See your profile →" link.
- Test: tests/preview.mjs (on a small iPhone SE screen the button is on the first screen, and opens /u/your-id).

### Item 17: Profile prompts replace About me: BRANCH `item-17-profile-prompts`
- Bank of 40 prompts in web/src/lib/prompts.ts, 8 per category (nightlife, sport, uni/academic, food, social), including all 10 of yours (the "[your uni]" one reads "Unpopular opinion about LSE…"). Each has a greyed-out example answer.
- Edit profile: the About me box is replaced by a "Prompts" card: "2/3 prompts answered" with a 3-step progress bar; 5 prompts shown at a time (one from each category) with a Shuffle button; tap one to answer (150 characters max, counter, example shown greyed); answered ones can be edited or removed. Saves straight away.
- Profile: answers show as small cards in exactly the spot where About me was. Nothing else on the profile changed. Your own profile with no prompts shows a small "Answer a few prompts" link there.
- Old About me text: kept in the database untouched (and the profile form no longer overwrites it), just not shown. To bring it back later is a one-line change.
- Private Social event: someone with no prompts who taps "Request to join" sees "Add a prompt so the host knows who you are" with "Add a prompt" (goes to the Prompts card) or "Skip and send request".
- Blocked people can't see each other's answers (same as photos).
- Needs a new table + function. SQL: the whole file `supabase/migrations/20261030000000_profile_prompts.sql` on the branch.
- Test: branchtests/prompts.mjs. Also found and fixed: a very long word could stretch the page sideways, so answers now wrap. The existing Social test was updated to tap "Skip" on the new suggestion.

### Item 18: Add to Home Screen: LIVE
- Most of this already existed (manifest, icons, full-screen mode, an install banner and /install help page). Improved:
  - App name is now just "Function" (was "Function: what's on at LSE"); portrait; splash background #f7f7fb with the app icon; Android "maskable" icon so it fits round/squircle icon shapes. iPhone already had full-screen ("apple-mobile-web-app-capable") and the iPhone icon.
  - Banner: the 📲 emoji (which showed on the Social tab) is replaced by the real app icon.
  - iPhone (Safari): the banner itself now says "Add Function to your Home Screen: tap [share icon] Share, then 'Add to Home Screen'". Other iPhone browsers / in-app browsers (Instagram etc.) still get "Show me", which opens the step-by-step page.
  - Android: "Install" opens the phone's own install prompt; after installing, the banner never comes back.
  - Closing the banner (×) or opening the app from the home screen hides it for good on that phone.
- Test: tests/homescreen.mjs.

### Item 19: Simpler poker bank / settling up: BRANCH `item-19-poker-settle-up` (approved Societies change)
- Committee results screen, per table, top to bottom:
  1. **How this table settles up**: "Auto-settle (fewest payments)" or "{player} is the bank", with a one-line explanation of each. ("One player is the bank" uses the existing bank screen: the bank player records buy-ins/cash-outs and everyone pays or is paid by them, with a Paid tick per player and "Still to pay".)
  2. **Results**: each player's result; minus for losses (e.g. -15). If they don't add up to zero, a red warning (with the existing "split the difference" button) and no payment list until it's fixed.
  3. **Who pays who**: "Sam Two pays Pat One £5" with a **Mark paid** button on each.
  4. **Settle up**: "Still to pay: £12 in 2 payments" or "All settled", plus the list of payments made (with Remove) and the existing form for payments made another way.
- Marks are saved as payments, so if results are edited afterwards, who pays who is worked out again (e.g. Sky had paid £7, then the result was corrected to -£8: it now just says Sky pays £1).
- Players (after you press "Share with players"): each of their own payments has "I've paid" (payer) or "Got it" (receiver). Their paid ones show with a tick and an Undo (for marks they made). When nothing is left: "All settled up".
- Needs 2 new database functions (players couldn't record payments after results were shared). SQL: the whole file `supabase/migrations/20261031000000_mark_payments_paid.sql` on the branch.
- Decision: I kept the existing bank-player screen (buy-ins and cash-outs) as the "one player is the bank" method rather than rebuilding it, as it already does exactly this and your Societies tests cover it.
- Test: branchtests/settle.mjs. All 4 Societies tests passed on the branch.

### Item 20: Poker waiting lists: BRANCH `item-20-poker-waiting-lists` (approved Societies change)
- A full table now shows "Table full · 2 waiting" and a "Join waiting list" button (for players going to the event, before it starts). You can sit at another table meanwhile.
- In the queue you see "You're number 1 on the waiting list" and "Leave waiting list". One waiting list per player per event (joining another replaces it).
- When a seat opens at that table BEFORE the event starts (someone leaves the table or the event, is moved or removed by the committee, or the table gets more seats), the first in line is moved across automatically, their old seat is freed (which can in turn fill from that table's own queue), and they get a notification: "A seat opened up: you've been moved to Table 1 at Friday Cash" (in the bell/Notifications; the existing "You've moved to Table 1 / Confirm change" card also shows on the event page).
- After the event starts (start time passed, or any table started early with "Start table now"), no more automatic moves and no new queueing.
- This is done in the database (so it also works when the committee moves people), via a new queue table, a moves table and triggers. SQL: the whole file `supabase/migrations/20261101000000_table_waiting_lists.sql` on the branch.
- Not done: the committee page doesn't list who's waiting yet (players see counts).
- Test: branchtests/waitlist.mjs. All 4 Societies tests passed on the branch.

