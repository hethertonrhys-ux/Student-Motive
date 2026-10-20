# Launching the Function app: website switch-over and the app stores

This is phase 11 of `EXPO_PLAN.md`, written as a checklist you can follow
without a developer. Everything in the code is ready; what's left needs
your accounts (Vercel, Supabase, Apple, Google, Expo). Do the parts in
order. Each part says what you'll see when it's worked.

Nothing here changes the live website until part 4, and part 4 can be
undone in a minute.

---

## 1. Before anything else (10 minutes)

1. **Run the waiting SQL** in Supabase: SQL Editor → New query → paste the
   whole of `supabase/migrations/20261107000000_delete_my_account.sql` →
   Run. Then merge the `delete-account` branch into `expo-app`. (Apple
   won't accept the app without "Delete my account".)
2. **Review the legal pages.** `apps/mobile/src/app/privacy.tsx` and
   `terms.tsx` still show a red "Draft" banner. Read them, change anything
   that isn't true, then delete the `<DraftBanner />` line in each file.
3. **Contact email.** Decide the real one (e.g. hello@studentfunction.com).
   It's set with `EXPO_PUBLIC_CONTACT_EMAIL` in part 2; the default in the
   code is a placeholder.
4. **Supabase: allowed login URLs.** Supabase dashboard → Authentication →
   URL Configuration → Redirect URLs. Add these, keeping what's there:
   - `https://studentfunction.com/auth/callback`
   - `https://app.studentfunction.com/auth/callback` (the staging address, part 2)
   - `function://auth/callback` (the phone apps)
   - `exp://**` and `https://*.expo.dev/**` are only needed if you test
     login links in Expo Go.

---

## 2. Put the new web build on a staging address (half an hour)

The new site is a static build of `apps/mobile` plus one tiny function for
link previews. It gets its own Vercel project, next to the existing one.

1. Vercel → **Add New… → Project** → pick the `Student-Motive` repo.
2. Settings on the import screen:
   - **Root Directory:** `apps/mobile`
   - **Framework Preset:** Other
   - Build Command and Output Directory: leave as detected (`vercel.json`
     in `apps/mobile` sets them: `expo export` into `dist`).
   - **Environment Variables** (all three environments):
     - `EXPO_PUBLIC_SUPABASE_URL` = your Supabase project URL
     - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_…` key
       (Supabase → Project Settings → API Keys). Never the secret key.
     - `EXPO_PUBLIC_SITE_URL` = `https://studentfunction.com`
     - `EXPO_PUBLIC_CONTACT_EMAIL` = the contact email
   - **Production Branch** (Settings → Git after the first deploy): `expo-app`
     until it's merged to `main`, then `main`.
3. Deploy. The first build takes a few minutes.
4. Settings → Domains → add `app.studentfunction.com`. Vercel shows you the
   DNS record to add where the domain is managed (one CNAME).
5. **What you'll see:** `https://app.studentfunction.com` shows the red
   landing page; `/map` shows the live map; logging in with your LSE email
   works; `/lse`, `/privacy`, `/install` all load; a made-up address shows
   the 404 page.
6. **Check link previews:** paste `https://app.studentfunction.com/e/<an
   event id>` into a WhatsApp chat (don't send). The preview should show the
   event's title, time and place. If it shows "Function: London's student
   social life" instead, the event is members-only (previews only show what
   a logged-out visitor can see) or the environment variables are missing.

Use the staging address for a week with the committee and a few students
before part 4. The old site keeps running untouched.

---

## 3. Phone apps: first builds (an afternoon, mostly waiting)

**Accounts needed once:** Expo (free, expo.dev), Apple Developer Program
(£79/year, developer.apple.com; enrol as an individual or as the company
you want shown in the App Store, it takes a day or two to be approved),
Google Play Console (£20 once, play.google.com/console).

From the repo on your computer, on the `expo-app` branch after the
`app-store-prep` pull request is merged (`git pull`, then `npm install`):

```
cd apps/mobile
npx eas login
npx eas init            # links the app to your Expo account; say yes to writing the project id into app.json
git add app.json && git commit -m "EAS project id" && git push
npx eas build --profile production --platform ios
npx eas submit --platform ios --latest
```

- iOS: EAS asks to log in to your Apple account and sets up the
  certificates for you. Say **yes** when it offers to create a
  distribution certificate and provisioning profile, and **yes** when it
  asks "Set up Push Notifications?" (that creates the key notifications on
  iPhones need). If anything asks to install `expo-updates`, say **no**.
- A production build is what TestFlight and the App Store both take, so
  there's no separate "preview" step. The build takes 15 to 25 minutes;
  EAS shows a link where you can watch it.
- `eas submit` uploads it to App Store Connect. The first time it asks for
  an App Store Connect API key or your Apple login; follow the prompts.
  After a few minutes it appears under **App Store Connect → TestFlight**:
  add yourself and the committee as internal testers (they get an email
  with the TestFlight app link). Each new build is the same two commands.
- Android later: `npx eas build --profile production --platform android`
  gives an `.aab` for the Play Console (part 5).

**What to check on the phone** (the web tests can't cover these):

- The map: pins, clusters, the night look after dark, the campus outline,
  tapping a pin, "Near me" asking for location once, walking directions.
- Photos: profile picture and "My 5" from the photo library, with the
  phone's own cropper.
- A login link from the email opens the app (not Safari) and logs you in.
- Sharing an event opens the phone's share sheet.
- The committee screens for a real event.
- Dark mode.

If something is broken on the phone but fine on the web, note what and
where; that's the native half of the plan that hasn't been run on a device
yet.

### Links that open the app

`app.json` already asks iOS and Android to open `studentfunction.com`
links (`/e/…`, `/s/…`, `/social/…`, `/u/…` and the login callback) in the app
once it's installed. For that to work the website must publish two small
files that name your app, in `apps/mobile/public/.well-known/`.

The Apple one, `apple-app-site-association`, is already there with your
Team ID (`FVT2MCM7C9`), and `vercel.json` serves it as JSON. Apple reads it
from `https://studentfunction.com/.well-known/apple-app-site-association`,
so it only starts working once part 4 (the domain switch) is done.

The Android one, `assetlinks.json`, still needs the app's signing
fingerprint, which exists after the first Android build:

```json
[ { "relation": [ "delegate_permission/common.handle_all_urls" ], "target": { "namespace": "android_app", "package_name": "com.studentfunction.app", "sha256_cert_fingerprints": [ "AA:BB:…" ] } } ]
```

The fingerprint comes from `npx eas credentials --platform android`
(choose production → Keystore → it prints "SHA256 Fingerprint").

Until these files are live the links still work; they just open in the
browser instead of the app.

---

## 4. Switch studentfunction.com to the new build (15 minutes, reversible)

Do this on a quiet day, after the staging week.

1. Tell the committee the site will log everyone out once (the login moves
   from cookies to the browser's own storage). People who put Function on
   their home screen keep their icon; it loads the new site.
2. Vercel → the **old** (Next.js) project → Settings → Domains → add
   `legacy.studentfunction.com`, and remove `studentfunction.com` and
   `www.studentfunction.com` from it.
3. Vercel → the **new** project → Settings → Domains → add
   `studentfunction.com` and `www.studentfunction.com` (redirect www to the
   bare domain). Vercel moves them across within a minute; DNS doesn't change.
4. Check `https://studentfunction.com` in a private window: red landing
   page, log in, map, an event page, a society page. Check a shared event
   link's preview in WhatsApp.
5. Keep the legacy address for two weeks, then delete the old project's
   domain (not the project).

**Rollback:** do step 2 and 3 in reverse. One minute, no code.

**After the switch:**

- Merge `expo-app` into `main` and set the new Vercel project's production
  branch to `main`. (The old Vercel project's root directory is `apps/web`;
  leave it, it's your rollback.)
- Supabase → Authentication → URL Configuration → **Site URL** =
  `https://studentfunction.com` (it probably already is).
- The uni pages (`/lse`, `/ucl`, `/kings`, `/imperial`), privacy, terms,
  support and install links are the same as before, so nothing printed or
  posted needs changing.

---

## 5. App Store and Google Play (a few hours of forms, then waiting)

### The review account

Apple and Google reviewers must be able to log in. They can't receive your
email codes, so the app has a password path for review accounts only
("Have a password? (app review accounts only)" under the email box).

1. First allow the email, or the next step fails with "Database error
   creating new user": the app's Admin panel → "Who can join" → add
   `review@studentfunction.com` (any address you control). (Or SQL:
   `insert into allowed_emails (email) values ('review@studentfunction.com');`)
2. Supabase → Authentication → Users → **Add user** → Create new user:
   that email, a long password, and tick **Auto Confirm User**.
3. Log in with it once yourself (email + "Have a password?" in the app),
   finish the welcome screen (pick a university and graduation year), join
   a society and **approve that membership** from the society's dashboard →
   Members (otherwise it sits as "pending" and the reviewer sees a closed
   app), then join an upcoming event and a Social plan so the account
   looks lived-in.
4. Put the email and password in the review notes on both stores.
   Change the password after the apps are approved, or delete the user.

### Production builds and submission

```
cd apps/mobile
npx eas build --profile production --platform all
npx eas submit --platform ios        # uploads to App Store Connect
npx eas submit --platform android    # uploads to Play Console (first time: upload the .aab by hand, see below)
```

Each production build bumps the build number by itself. `version` in
`app.json` (1.0.0) is what people see; change it for later releases.

### App Store Connect (appstoreconnect.apple.com)

- **My Apps → + → New App:** iOS, name **Function**, primary language
  English (UK), bundle ID `com.studentfunction.app`, SKU `function-ios`.
- **App Information:** category **Social Networking**, secondary
  **Lifestyle**. Content rights: the app does contain third-party content
  (the map data, © OpenStreetMap contributors, under an open licence), so
  answer yes and confirm you have the rights. Age rating: answer the
  questionnaire honestly; "Unrestricted Web Access" is No; say yes to
  user-generated content and messaging, no to gambling (nothing is
  wagered through the app), then set the rating to **18+** to match the
  Terms (Function is for university students).
- **Privacy Policy URL** and **Support URL:** until part 4 is done,
  `studentfunction.com` is still the old website, whose privacy page
  carries a "Draft" banner, so use `https://app.studentfunction.com/privacy`
  and `https://app.studentfunction.com/support` for now and change them to
  `studentfunction.com` after the switch. Open whichever you enter in a
  private window first and check it has no "Draft" text.
- **App Privacy (the "nutrition label"):** everything is collected for app
  functionality, linked to the user, and **not** used for tracking:
  - Contact info: name, email address
  - User content: photos or videos; emails or text messages (chats); other
    user content (bio, course, prompts, Two truths, events you host and
    their addresses, RSVPs, society memberships, reports, poker results)
  - Identifiers: user ID; device ID (the push-notification token)
  - Usage data: product interaction (the sign-up funnel). Search history
    (the "all London unis" searches), for analytics.
  - Location: precise location, **not linked** to the user, app
    functionality only (it's sent to the routing service when someone asks
    for walking directions; "near me" never leaves the phone).
  - Financial info: answer **Other financial info**, linked, app
    functionality (the poker ledger records what players owe each other;
    no payments go through the app). Everything else: not collected.
- **Version page:** screenshots from the TestFlight build on an iPhone 16
  or 17 Pro Max (6.9", 1320 × 2868) and an iPhone 16 or 17 (6.3",
  1206 × 2622): map, an event, societies, social, a profile. App Store
  Connect makes the other sizes from those. Then the description below,
  keywords, support URL, marketing URL (`https://studentfunction.com`).
- **App Review Information:** sign-in required: yes; the review email and
  password; notes: "Function is for students at London universities.
  Students log in with a code emailed to their university address; the
  review account uses a password instead (tap 'Have a password?' under the
  email box). Account deletion is under Me → Edit profile → Delete my
  account. The LSE Poker Society feature lets a student society seat
  players at its own games and record results and who has settled up with
  whom afterwards; no money is wagered, paid or transferred through the
  app." Keep poker screens out of the screenshots.
- **Export compliance:** `app.json` already says the app uses no
  non-exempt encryption (only standard HTTPS and the usual encryption that
  secures the login session), so the question is skipped.
- **Email:** make sure `management@studentfunction.com` and
  `help@studentfunction.com` actually receive mail (they are on the privacy
  and support pages, and App Review may write to them).

### Google Play Console (play.google.com/console)

- **Create app:** name Function, default language English (UK), app, free.
- **Set up your app** checklist: privacy policy URL, app access (provide
  the review email and password under "All or some functionality is
  restricted"), ads (none), content rating questionnaire (Social; yes to
  user-generated content, messaging and sharing photos), target audience
  (18+), data safety (same answers as Apple's list above: email, photos,
  messages, user ID, app interactions; collected, not shared, encrypted in
  transit, users can request deletion in-app), government apps (no),
  financial features (none: the poker "who pays who" is a record people
  keep themselves, no money moves through the app).
- **Store listing:** short description and full description below,
  512×512 icon (`apps/mobile/public/icon-512.png`), feature graphic
  1024×500 (make one from the logo on red), phone screenshots.
- **Testing → Internal testing:** upload the `.aab` from the EAS build
  link, add the committee's Google accounts as testers. Google requires a
  period of closed testing with 12+ testers for new personal accounts
  before production is allowed; a company account does not.
- **Production:** create a release from the same `.aab`, roll out.

### Listing text (edit freely)

**Name:** Function

**Subtitle / short description (30 / 80 characters):**
London's student social life, in one place.

**Description:**

Function puts every society, every event and every social at London's
universities on one live map. Open it and see what's on tonight, whichever
London university you're at.

- The live map: what's happening right now and later, with walking
  directions.
- Societies: find yours, join, and get into their events and tables.
- Socials: host your own, or join other students' plans.
- Friends and chats: find people you've met at events, play Two truths
  and a lie, message hosts and groups.
- Your profile: your 5 photos, your prompts, your societies.

For societies: post once and reach every student, not just your members.
See who's coming. Run sign-ups, tables and results from your phone. Free,
always.

Log in with your university email. No passwords.

**Keywords (Apple, 100 characters):**
student,societies,university,London,LSE,UCL,KCL,Imperial,events,socials,map,freshers

---

## 5b. Settings for the overnight-updates changes (sign-up, 2FA, push)

These go with the `overnight-updates` branch. Each is a dashboard setting
or a one-off command; none changes existing data.

**Login codes (Supabase → Authentication → Providers → Email):**
- *Email OTP Length*: Supabase's minimum is **6** digits (it won't allow 4),
  so set it to 6. The app accepts 6 to 10 digits.
- *Email OTP Expiration*: 600 seconds (10 minutes).
- Authentication → Rate Limits: *Rate limit for verifying OTP* down to
  something like 10 per 5 minutes per IP, which caps guessing.

**Two-factor authentication (Supabase → Authentication → Multi-Factor):**
- *TOTP (authenticator app)*: switch on (free on every plan). That's enough
  for the "Authenticator app" option in Me → Account settings → Password &
  security.
- *Phone (SMS)*: needs the Pro plan plus an SMS provider (Twilio etc., set
  under Authentication → Providers → Phone). Until that's on, the "text
  message" option in the app shows "This kind of 2FA isn't switched on for
  Function yet".

**Push notifications:**
1. Run `supabase/migrations/20261109000000_push_notifications.sql` in the
   SQL Editor.
2. Make web-push keys once, on your computer: `npx web-push generate-vapid-keys`.
   It prints a public and a private key.
3. Deploy the sender and give it its secrets (Supabase CLI, from the repo
   root; `npx supabase login` and `npx supabase link --project-ref
   xrpbmcoptyrpgkdowfdt` first):
   ```
   npx supabase secrets set PUSH_SECRET=<a long random string> VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> VAPID_SUBJECT=mailto:help@studentfunction.com SITE_URL=https://studentfunction.com
   npx supabase functions deploy send-push --no-verify-jwt
   ```
4. Open `supabase/RUN_ONCE_push_cron.sql`, replace `<PROJECT_REF>` and
   `<PUSH_SECRET>`, and run it in the SQL Editor (Database → Extensions
   must have `pg_cron` and `pg_net` on; the file turns them on too).
5. In Vercel (the function-app project) add the environment variable
   `EXPO_PUBLIC_VAPID_PUBLIC_KEY` = the public key, and redeploy. Also add
   `EXPO_PUBLIC_SUPPORT_EMAIL` = `help@studentfunction.com`.
6. Phones: pushes to the iPhone/Android apps need the Expo project id from
   `npx eas init` (part 3) and an EAS build; they don't work in Expo Go.

## 6. After launch

- **Tell people:** the install page (`/install`) still explains "add to
  home screen" for the web; once the apps are live, add the App Store and
  Play links to that page and the landing page.
- **Updates:** small fixes can go out without the stores through EAS Update
  later; it isn't set up yet (needs `expo-updates`). For now, each release
  is `eas build --profile production` and `eas submit`.
- **Watch for:** the Supabase email rate limit (the free plan sends few
  auth emails per hour; set up a custom SMTP provider in Supabase →
  Authentication → SMTP before a big launch day).
