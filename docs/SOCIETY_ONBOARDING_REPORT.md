# Society onboarding + event admin: overnight report

This is everything built overnight on the branch `society-onboarding`, in plain English.

**Nothing is live yet.**
- Nothing was merged.
- Nothing was run against the live database.
- The App Store version (built from `expo-app`) is untouched.

This pull request is waiting for you. It goes live only when you:
1. run the database changes listed in section 3, and
2. merge the pull request.

## Start here

1. **Run the security fix first.** It's `20261116000000_security_fixes.sql`, and section 3 shows how to run it.
   - It closes three holes I found in the live app. The worst: any logged-in student could edit other people's profiles.
   - It doesn't depend on anything else in this branch.
   - It's safe for the App Store version and the current website.
2. **When you want to try the new features,** run the other database files in order (section 3).
   - They change nothing for the three live societies.
   - The current app and website keep working with them.
3. **Test the new features on your phone, before merging.** Open the Vercel preview link that appears on this pull request, then use the checklist in section 4.
4. **Merge** when you're happy. That updates app.studentfunction.com.
   - Phones get the new screens only with the next App Store build.
5. **Read section 5.** It lists the things only you can do, such as adding the LSESU templates.

---

## 1. What was built

The goal: a society committee goes from a link in an Instagram DM to a live, SU-approved event in under 5 minutes.

### Before Part 1: tooling and three security fixes

**Automatic checks.**
- The app had no lint set up, so `expo lint` could never run. It now runs with Expo's standard rules.
- The shared code now has unit tests.
- There is now a database test runner. It builds a throwaway copy of the database from every migration file and checks the permission rules. It never touches Supabase.
- GitHub now runs the shared tests and the app's lint on every pull request.

**Three security problems already in the live app, fixed in `20261116000000_security_fixes.sql`:**
1. Any logged-in student could edit or delete anyone's profile, through the public "profile cards" list. It is now read-only.
2. Any logged-in student could send any push notification to anyone. The push helpers are now server-only.
3. A committee's member list showed members' email addresses. Committees now see names only, as your rules ask.
   - The emails they typed in themselves as invites are still shown.
   - Function admins still see emails.
   - **This is a visible change for committees.**

### Part 1: feature switches for each society

Each society now has its own set of features it can switch on or off.

Live features:
- Sign-up lists
- Tables and numbered seating
- Settle-up ledger (the poker bank and who pays who)
- Event cost
- Member invites (adding members by email)
- Event group chats
- Event admin (SU paperwork), LSE only

There are also 15 "coming soon" features, such as custom sign-up questions, QR check-in and polls. Committees can say "We want this" to them.

- Each society type (social, sports, cultural, academic, games, arts) gets a sensible set ticked by default.
- **Existing societies see no change.** Every society that already has a manager gets every existing feature switched on, and Event admin switched off.
- The event form, event page, manage screen and members screen hide what a society has switched off.
- Events already created keep their formats and costs.
- Switching group chats off stops new events getting a chat. Chats that already exist keep working.

### Part 2: instant claim links

- In **Me → Admin panel → Societies**, an app admin searches for a society and taps **Create claim link**. They then get:
  - **Copy link**
  - **Copy DM message**, a ready-written Instagram DM
- When a committee member taps the link and logs in with their uni email, they become the society's manager straight away. They then land in the Society Hub's setup.
- Each link:
  - works once,
  - lasts 7 days,
  - can be cancelled from the same screen.
- Used, expired and cancelled links each show a clear message.
- Safety rules:
  - The secret part of the link is stored scrambled, so not even admins can read it back.
  - Only app admins can make links.
  - If an admin opens a link, it isn't claimed automatically. They get a "Claim it myself" button instead, so you can't use up a link by tapping it in your own DMs.

### Part 3: the Society Hub and the setup wizard

**Where to find it:**
- **Me → Society Hub**, for anyone who manages a society
- **Open Society Hub**, on a society's own page

**The setup has 8 steps:**
1. Welcome
2. Check your page (logo, description, Instagram)
3. Society type
4. Features (pre-ticked for the type)
5. Founding Society agreement (only shown for societies you've marked Founding)
6. Your committee (add other managers)
7. First event
8. You're live (share to your Instagram story, share on WhatsApp, copy the link)

Committees can leave with **Finish later** and pick up where they left off.

**The Hub itself has these pages:**
- Overview
- Setup
- Features
- Committee
- Requests (added in Part 4)
- The existing dashboard for events and members

The Hub is built for phones first. On screens wider than 1024px, it shows a sidebar on the left with the page beside it.

**Committee handover:**
- Managers add other managers by name, or by uni email.
  - An email with no account yet becomes a manager invite. It turns them into a manager the moment they sign up.
- **Remove me** lets a manager step down. The last manager can't leave, so a society always has someone in charge.
- You can't add someone who has blocked you, or whom you've blocked.

**Founding Society:** app admins can mark a society Founding with a switch in the admin Societies tab. The committee then sees the agreement step.

### Part 4: feature requests, Founding progress and admin views

**Requests page in the Hub.**
- A committee writes "What do you need?" and, optionally, "How do you do it now?"
- They see each request's status: New, Building, Live or Declined.

**Admin panel → new Hub tab**, with three sections:
- **Feature requests**:
  - every society's requests, with filters;
  - a status picker on each request;
  - an optional note to the committee.
  - Setting a request to **Live** sends its managers a push.
- **Wanted features**: the coming-soon features, ranked by how many societies want each.
- **Founding Societies**: for each one:
  - events since agreeing,
  - days since the last event,
  - whether it's in the prize draw,
  - whether its badge is on.

**Founding progress card** in the Hub, for Founding Societies. It reads like "2 of 3 events posted, 1 to go for the prize draw".
- **Prize draw**: 3 published events since agreeing, each with at least one person going.

**Founding badge** on the society's public page.
- It switches off by itself after 30 days without a published event.
- It comes back when they post again.

**Weekly nudge.** A daily timer sends a "Time to post your next event?" push to Founding Societies that haven't posted for 7 days. Each manager gets it at most once a week.

### Part 5: event admin for LSE societies

**What it is.** Event admin is a feature switch. It's only available to LSE societies, and it's ticked by default for new LSE societies that pick a type. When it's on, the event form gets a short **Event admin** section asking:
- expected attendees
- where the event is: on campus, elsewhere in London, or away
- alcohol
- an external speaker (with names and organisation)
- non-LSE guests
- open to the public
- physical activity
- food
- budget and cost lines
- the Native ticket link

**From the answers, Function works out:**
- **Which LSESU form**, and why:
  - **Regular Event Form**: 10 working days' notice.
  - **Large / External Speaker Event Form**: 1 month's notice. It applies when there's an external speaker or organisation, more than 75 people, alcohol as the focus, or a budget over £500.
  - **Trip Form**: 1 month's notice. See the decisions section.
- **The submit-by date.**
  - It counts working days and skips weekends and UK bank holidays. The holiday list covers 2026 to 2028.
  - Example: a Regular event on 31 Dec 2026 must be submitted by 15 Dec 2026.
  - If the date has already passed, the card says so in red.
- **LSESU notes**, for example:
  - Podio
  - SU approval before promotion
  - the 5-working-day reply
  - Native as the only approved ticketing
  - an academic chair for public events with external speakers
  - the Security guest list
- **A list of likely hazards**, such as crowding, alcohol, travel, late finish, sport, food, external speaker and weather. Each comes with who's at risk, sensible controls and a rating.
- **The budget's cost lines and total.**

**Drafts and the approval gate.**
- An event at a society with Event admin on is saved as a **draft** until a committee member ticks **"SU approved"**.
- Drafts are invisible to everyone except the society's committee. That covers the map, feed, society page, notifications, search, chats and reminders.
- The database itself refuses to publish without the tick, so an old app version can't get round it.
- Publishing a draft sends the usual "new event" push at that moment.

**The Event admin card** (Part 5b) sits on the event's manage screen (Dashboard → the event). It brings the paperwork together in one place, so the committee knows what to do and by when. It shows:
- "Function prepares drafts; your committee checks and submits them."
- Which LSESU form, and why.
- **The submit-by date**: "Submit by <date> (n working days left)".
  - It changes to "(submitted)" once "Form submitted" is ticked.
  - If it's already late, a red warning says: "This is already late. LSESU asks for <notice> notice: submit it as soon as you can and tell the SU it's late."
- The LSESU notes for this event.
- **The checklist**, as big tick rows, each with its deadline:
  - Form submitted on Podio
  - SU approved
  - Room confirmed
  - Academic chair secured
  - Native tickets set up
  - Security guest list sent

  Items the event doesn't need are listed in one line underneath. Ticking saves straight away and shows "Done <date>". Overdue items say "Was due <date>" in red.
- **Publish now**, for a draft once "SU approved" is ticked.
- **"Risk assessment and budget: coming soon"**, with no download buttons.
- A preview of the hazards and the budget's cost lines and total. It's labelled as what Function will use to prepare the drafts.
- **Draft email to Security**, when the event has external speakers or non-LSE guests. It opens the committee's email app with a ready-written email containing:
  - the event, date, time and venue
  - the speakers and their organisation
  - the names (never emails) of the non-LSE people going

  The committee adds their building's Security address and sends it themselves. If anyone going can't be looked up, the button stays off and says so, rather than quietly leaving them out.
- **Edit answers**, which opens the event form.

**Checklist reminders.** The daily timer sends each manager a push 2 days before an unticked item is due, the day before, and on the day. Each one goes at most once a day, for example "Form submitted on Podio due Tue 3 Nov".

**Wording.** Everywhere it says Function *prepares* drafts and the committee checks and submits them. It never says Function handles compliance.

**Paid events.** Paid LSE events link to their Native ticket page through the event's existing ticket button. Function never takes payment.

**The forms themselves are not built, as you asked.**
- The risk assessment and budget files will be filled from the LSESU templates once you add them to `docs/lsesu-templates/`.
- Until then, the app says **"Risk assessment and budget: coming soon"**.
- The server function `event-documents` exists, checks who's asking, and replies "Templates not added yet". A clearly marked to-do in it says exactly what to do with the templates.

### Tests

- **Unit tests for the shared code** cover:
  - the feature helper
  - claim links
  - the Hub steps
  - Founding eligibility
  - the form choice
  - the deadline calculator, including bank holidays
  - hazards and cost lines
  - drafts
  - the Security email
- **Database tests** cover:
  - every permission rule
  - claim links
  - Founding progress
  - the reminders
  - the approval gate
  - storage
  - `permissions.test.sql`, which proves in one place that:
    - a society manager can't read or change another society's data,
    - they never see anyone's email,
    - they can't use admin panel data or tools,
    - nothing they do makes anyone an app admin.
- **Browser tests** run the real website build (28 tests, all passing). They cover:
  - the existing features, including the live societies' screens
  - one new test per part
- All of the above passed before every commit, along with lint and type checks. At the end:
  - 136 unit tests
  - 9 database test files
  - 28 browser tests
- **Review.** Each part was also checked by two separate reviewers, one for database security and one for how the app behaves. Every problem they found was double-checked, then fixed before the commit.
- **Technical detail** for a developer is in `docs/SOCIETY_ONBOARDING_PLAN.md`, including a list of decisions for each part.

### Not finished, or worth knowing

- **Template filling** waits for the LSESU templates, as you asked (section 5).
- **No "Unpublish" button.** Unpublishing would hide a live event from everyone going to it. To call an event off, use **Edit → Mark as cancelled**, as now.
- **The new screens aren't in the current App Store build.** The Hub and claim links work on the website now, and on phones after the next build. That's why some notification links open the society dashboard for now (see decisions).
- **The "Share to your story" card** was only tested on the website, where it can be downloaded as an image. On phones it asks the committee to screenshot it. Neither has been tried on a real phone yet.
- **One small back-button quirk.** If you open setup straight from a claim link and tap **Finish later**, pressing back from the Hub home goes back into the setup, not to the page before it.
- **The old Next.js site** (`apps/web`, the purple-logo one still on studentfunction.com) was not changed. It doesn't know about drafts, but the database hides drafts from anyone who isn't on the committee.
- **The browser tests** live on the build machine, not in the repository. The unit and database tests are in the repository and run on GitHub.

---

## 2. Assumptions and decisions I made

These are the choices I made when something wasn't specified. Each one is easy to change. Tell me which you'd like different.

### Permissions and privacy
- **Who counts as a manager.**
  - "Society managers" means anyone listed as the society's committee in the database.
  - App admins can see and do everything, but they don't count as committee members, so they never claim a society or mark its setup finished by accident.
- **Names, not emails.** Managers see attendees' and members' names, never emails. The emails they typed in themselves as invites are the exception.
- **Default permissions are switched off.** Every new database function is locked down to exactly who needs it. Supabase gives everyone access to new functions unless told otherwise.
- **The three existing security holes were fixed** in their own file, so you can run it straight away.

### Existing societies
- **Nothing changes for them.**
  - LSE Poker and the other live societies keep every existing feature on, and Event admin off.
  - They aren't marked "set up", so their committees will see "Finish setting up" in the Hub if they open it.
- **The ledger switch hides bank tools completely.** That includes bank tools on events that already have a bank. No live society has the ledger off.
- **Claim links for societies already running events.** If you send a claim link to a society that already runs events on Function with no manager, its setup ticks features for its type. Check its Features page afterwards.

### Claim links
- **Links don't cancel each other.** A new link doesn't cancel older ones. Links can be made for societies that already have managers, which is useful for handovers.
- **Used links stay used.** A link stays "used" even if the person who used it later deletes their account.
- **Removed managers can't get back in** using their old link.
- **The help address on the claim page** is help@studentfunction.com. Say if you'd rather it was management@.

### Society Hub
- **Founding agreement step.** It has a **Decide later** button.
- **Finish later.** Every setup step has **Finish later**.
- **First visit to the Features step.** The pre-ticked features are saved once, the first time a new society reaches the step. Picking a different type later doesn't overwrite features already saved.
- **Adding managers.**
  - There's no same-university check when adding a manager.
  - Adding someone by name asks "Add {name} as a manager?" first.
- **Society Hub notification setting.** The setting shows for everyone, not just managers.

### Founding Societies
- **What counts as a "published event".** One that isn't cancelled, hidden or a draft.
- **When counting starts.** Events count from the moment of agreeing (the same second counts).
- **Losing Founding status.** Taking Founding away turns the badge off and removes them from the prize draw.
- **Progress and nudges never go over the target.** The progress line and the weekly nudge never say "5 of 3". The admin list shows the real count.
- **The 24-hour promise.** The Requests page tells Founding Societies "we aim to build one feature around how you run within 24 hours of your request". It's softened to "aim to".
- **Nudge timing.** The weekly nudge goes at most once per week per manager.
- **Event dates can't be faked.** Committees can't change an event's "created" time, so they can't fake progress.

### Event admin (LSE)
- **Trip notice is 1 month.** Your brief gave no notice period for trips, so I used the safer 1 month. It's one line to change in `packages/shared/src/event-admin/lse.ts`.
- **Checklist deadlines:**

  | Item | Due |
  |---|---|
  | Form submitted on Podio | the submit-by date |
  | SU approved | 2 working days before the event |
  | Room confirmed (campus events) | 5 working days before |
  | Academic chair secured | 10 working days before |
  | Native tickets set up | 5 working days before |
  | Security guest list sent | 1 working day before |

- **Months of notice.** "1 month's notice" means the same date the month before. If that isn't a working day, it moves earlier.
- **Late finish.** It means after 11pm London time, or past midnight.
- **Weather hazard.** The weather and outdoors hazard is added for away trips and physical activity.
- **Hazard ratings your brief didn't give:**
  - Late finish: low (medium when away)
  - Physical activity: medium
  - Food: low
  - Weather: low
- **"SU approved?" starts at "Not yet"**, so nothing is published by accident.
- **Unticking "SU approved" never unpublishes an event.**
- **Native link.** For paid events or events with non-LSE guests, the Native link replaces the general ticket link field.
- **Events after 2028.** For events after 2028, the card says the bank holiday list doesn't reach that far yet.
- **Who can tick the checklist.** Checklist ticks are saved by the server, and the tick buttons are the only way to change them, so nobody can fake who ticked what or when. Two committee members ticking at once can't overwrite each other, and re-ticking keeps the first person's tick. App admins can tick too.
- **Reminders only go to the society's own managers**, not app admins. They stop if the society switches Event admin off, or if the event is cancelled or taken down.
- **Who counts as "non-LSE" in the Security email.**
  - Anyone going whose profile university isn't the society's, or isn't filled in.
  - It uses their full name, since Security checks ID.
  - Only people marked going are included; people on the waiting list aren't.
- **The Security email doesn't tick the checklist.** Sending it doesn't tick "Security guest list sent". The committee ticks it themselves once they've actually sent it.
- **When the late warning shows.** The red warning only shows until "Form submitted" is ticked.

### Push notifications
- **Notification links open the society dashboard for now.** This covers being added as a manager, a request going Live, the Founding nudge and checklist reminders.
  - The current App Store build has no Hub screens, so a Hub link would open "not found".
  - After the next App Store build, these can point at the Hub (section 5).
- **Claim links and Hub links open in the browser on phones.** They aren't yet in the app's universal links, for the same reason.

---

## 3. Database changes to run, in order

There are seven files in `supabase/migrations/`, plus one timer file. Run them in the Supabase SQL Editor, one at a time, in this order.

**How to run one file:**
1. Click the file's name in the table below. It opens on GitHub.
2. Click the **Copy raw file** button at the top right of the file (two overlapping squares).
3. Go to supabase.com → your project (`xrpbmcoptyrpgkdowfdt`) → **SQL Editor** → **New query**.
4. Paste (Ctrl+V) and click **Run**.
5. You should see **"Success. No rows returned"** (or a small table of results).

**If any file shows an error,** stop there, don't run the next one, and send me a screenshot.

These files expect every earlier one to have been run already, up to `20261115000000_push_token_handover.sql`, which you ran last time.

| # | File | What it does |
|---|---|---|
| 1 | [`20261116000000_security_fixes.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/migrations/20261116000000_security_fixes.sql) | **Run this one now.** Fixes the three security holes. Safe on its own. |
| 2 | [`20261117000000_society_features.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/migrations/20261117000000_society_features.sql) | Part 1: feature switches. Switches every existing feature on for societies that already have managers. |
| 3 | [`20261118000000_society_claim_links.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/migrations/20261118000000_society_claim_links.sql) | Part 2: claim links. |
| 4 | [`20261119000000_society_hub.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/migrations/20261119000000_society_hub.sql) | Part 3: the Hub, Founding agreements, manager invites, the Hub notification setting. |
| 5 | [`20261120000000_feature_requests_founding.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/migrations/20261120000000_feature_requests_founding.sql) | Part 4: feature requests, Founding progress, the admin views, the weekly nudge. |
| 6 | [`20261121000000_event_admin.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/migrations/20261121000000_event_admin.sql) | Part 5: event admin answers, drafts and the "SU approved" gate. |
| 7 | [`20261122000000_event_admin_documents.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/migrations/20261122000000_event_admin_documents.sql) | Part 5: the private storage for the forms, and the checklist reminders. |
| 8 | [`RUN_ONCE_hub_cron.sql`](https://github.com/hethertonrhys-ux/Student-Motive/blob/society-onboarding/supabase/RUN_ONCE_hub_cron.sql) | The daily 8:05am timer that sends the Founding nudges and checklist reminders. Run it once, after file 7. It relies on the push timer you set up before. |

**Notes:**
- **Timing.**
  - Files 2 to 7 can be run any time before you merge.
  - The current website and App Store build keep working with them, and the three live societies see no change.
  - The new screens need them, so run them before testing the preview link.
- **The `event-documents` server function** (`supabase/functions/event-documents`) doesn't need deploying yet. It only replies "Templates not added yet" until the templates are in.

---

## 4. Phone test checklist

**Where to test.** Use the Vercel preview link on this pull request, after running the database files in section 3.
- It's the **Visit Preview** link in the Vercel bot's comment, for **function-app**.
- The preview uses the live database, so use a test society rather than a real one.
- If the preview shows an error about Supabase settings:
  1. Go to Vercel → function-app → Settings → Environment Variables.
  2. Tick **Preview** on the two `EXPO_PUBLIC_SUPABASE_…` variables.
  3. Redeploy.

**Setting up a test society:**
1. Pick an unclaimed society in Admin → Societies, or ask me to add a "Function Test Society".
2. Make yourself a claim link and open it.

**Check the live societies don't change.** After every part, open LSE Poker Society's page and dashboard. They should look and behave exactly as before.

### Security fixes
- [ ] As a committee member, open Dashboard → Members. You see names but no email addresses. Invites you typed still show their email.
- [ ] As an app admin, the same screen still shows emails.

### Part 1: feature switches
- [ ] Open LSE Poker's event form, an event page, the members screen and the manage screen. Everything is exactly as before.
- [ ] In a test society's Hub → Features, switch **Member invites** off. Dashboard → Members no longer shows "Add members by email", but any pending invites still show with **Remove**.
- [ ] Switch **Settle-up ledger** off. "Results & who pays who" disappears from an event with no bank. Switch it back on and it returns.
- [ ] Switch **Event group chats** off, then post a new event. It has no group chat. An older event's chat still opens.

### Part 2: claim links
- [ ] As an admin: Me → Admin panel → Societies → search → tap a society → **Create claim link**.
  - You see **Copy link** and **Copy DM message**.
  - The DM reads well.
- [ ] Open the link in a private browser tab (logged out). You see "<Society> is on Function" and **Log in to claim it**.
- [ ] Log in with a uni email. You land on the Hub setup's Welcome step, as the manager.
- [ ] Open the same link again, logged out. You see "This link has already been used".
- [ ] Cancel a fresh link in the admin screen, then open it. You see "This link has been cancelled".
- [ ] As an admin, open a ready link. It isn't claimed automatically; you see **Claim it myself**.

### Part 3: the Society Hub
- [ ] Me → **Society Hub** appears once you manage a society.
- [ ] Go through all the setup steps. Check each one, then **Finish later** and come back: you return to the same step.
  - Check your page
  - Society type (check the features are pre-ticked to match)
  - Features
  - Your committee
  - First event
  - You're live (share to story, WhatsApp, copy link)
- [ ] Back (swipe or Android back) moves to the previous step.
- [ ] Committee: search a name. Results show their course and uni.
  - Adding asks "Add {name} as a manager?".
  - They get a push, "You're now a manager of …", and tapping it opens the dashboard.
- [ ] Add by email:
  - A gmail address is refused.
  - An unused @lse.ac.uk address is listed as invited.
- [ ] **Remove me** works when there are two managers. It's refused for the last manager.
- [ ] Turn on dark mode. All Hub screens are readable.
- [ ] On a laptop wider than 1024px, the Hub shows a sidebar.
- [ ] As an admin, mark a society **Founding** (Admin → Societies). Its committee sees the Founding Society step and can agree.

### Part 4: requests and Founding
- [ ] Hub → Requests: send a request. It shows as **New**.
- [ ] Admin panel → Hub → filter **New** → set it to **Live**.
  - The committee gets a push.
  - Their Requests page shows **Live**.
- [ ] Add an admin note. The committee sees "From Function: …".
- [ ] "Wanted features" ranks the features committees tapped "We want this" on.
- [ ] A Founding Society that has agreed:
  - The Hub card says "0 of 3 events posted, 3 to go for the prize draw" and **Badge on**.
  - Its public page shows the **Founding Society** pill.
- [ ] Post an event and have someone tap "I'm going". The count goes up.
- [ ] LSE Poker shows no Founding badge.

### Part 5: event admin

Use an LSE test society with Event admin on. Picking a type in its setup ticks Event admin automatically; you can also switch it on in Hub → Features.

- [ ] Post an event. The **Event admin** questions appear, and the form shows which LSESU form, why, and the submit-by date.
- [ ] Leave "Has the SU approved this event?" on **Not yet** and post. It's saved as a **Draft**.
  - Students who aren't on the committee can't see it anywhere (map, feed, society page).
- [ ] On the draft's page, tick **SU approved**, then **Publish**. It appears on the map, and members get the new-event push.
- [ ] Pick a date less than 10 working days away. The red "already late" warning shows.
- [ ] Open the event's manage screen (Dashboard → the event). The **Event admin** card shows:
  - "Function prepares drafts…"
  - the form name and why
  - the submit-by date
  - the checklist
  - "Risk assessment and budget: coming soon"
  - the hazards and budget preview
- [ ] Tick **Form submitted on Podio**, then reload. It stays ticked and shows "Done <date>".
- [ ] For an event with an external speaker and non-LSE guests, tap **Draft email to Security**. Your email app opens with:
  - the subject "Guest list: …"
  - the speaker's name and organisation
  - the non-LSE people's names (no emails)
- [ ] On a draft, tick **SU approved** in the card. **Publish now** appears, and publishing works.
- [ ] Set up an item due tomorrow and leave it unticked. The next morning (after the timer file has been run), the managers get a "… due …" push.
- [ ] For a paid event, the ticket button goes to the Native link, and nothing suggests paying in Function.
- [ ] Wording check: Function never says it handles compliance. It always says it prepares drafts and the committee checks and submits them.

---

## 5. Things that need you

### Needed to finish Part 5
1. **Add the LSESU templates** to `docs/lsesu-templates/`:
   - "Risk Assessment Template (Events).docx"
   - "Budget Template (Events).xlsx"

   Then ask me to build the template filling. It will fill them from the committee's answers and give the committee a download link. Until then the app says "coming soon".
2. **Deploy the `event-documents` server function** after that. It's one command, which I'll walk you through: `npx supabase functions deploy event-documents`.
3. **Run `RUN_ONCE_hub_cron.sql`** after the migrations. Without it, the weekly Founding nudge and the checklist reminders never go out.

### Decisions only you can make
4. **Trip notice period.** I used 1 month. Is that what LSESU wants?
5. **Security reception email.** The "Draft email to Security" button leaves the To field empty, because I don't know each building's Security address. If LSE has one address for all buildings, tell me and I'll fill it in.
6. **Which societies are Founding?** Mark them with the switch in Admin → Societies.
7. **Committee emails.** Committees no longer see members' email addresses (your rule). If LSE Poker's committee relies on seeing them, let me know.
8. **Claim page help address:** help@ or management@?

### After the next App Store build (with this branch merged)
9. **Point notification links at the Hub.** Notifications open the society dashboard for now. Once the new build is live, ask me to switch them to the Hub. It's a small migration.
10. **Open claim and Hub links in the app.** Ask me to add `/claim` and `/hub` to the app's universal links, so they open in the app rather than the browser.

### Housekeeping
11. **Fix studentfunction.com.** It still shows the old purple-logo site from `apps/web`. Point it at the new app (the domain switch we talked about).
12. **The failing "student-motive" check.** Vercel's old "student-motive" project shows a failing check on pull requests. That's the old website, and it was already failing before this branch. The "function-app" check is the one that matters.
