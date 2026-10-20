# Function app (iOS, Android and web)

One Expo codebase for the phone apps and, later, the website. Built with
Expo Router, NativeWind (the website's Tailwind classes), supabase-js and
MapLibre. See `docs/EXPO_PLAN.md` at the repo root for the plan and build order.

## Run it

From the repository root, first time: `npm install`.

```
cd apps/mobile
cp .env.example .env     # fill in the Supabase values (same as the website's)
npm start                # then press i (iPhone simulator), a (Android) or w (web)
```

On a real phone, install **Expo Go** from the App Store / Play Store and
scan the QR code that `npm start` shows.

## Where things are

- `src/app/`: the screens. The folder structure is the URL structure
  (`src/app/e/[id].tsx` is `/e/<id>`), the same paths as the website.
- `src/components/ui.tsx`: the website's `.btn`, `.card`, `.input` styles as
  components.
- `src/lib/supabase.ts`: the Supabase client. The session lives in secure
  storage on phones and local storage on the web.
- `src/global.css` and `tailwind.config.js`: the design tokens, with the brand in Function red `#DA291C`.
- `assets/brand/`: the logo, icon, splash and favicon.
- `../../packages/shared`: types, config and query code shared with the website.

## Builds and the stores

`eas.json` has three profiles: `development`, `preview` (TestFlight /
internal testing) and `production`. Builds need an Expo account
(`npx eas login`) and, for iOS, the Apple Developer Program.
`docs/EXPO_LAUNCH.md` at the repo root is the step-by-step guide: staging
on Vercel, the domain switch, the first phone builds, and the App Store and
Google Play listings.

Over-the-air updates (most changes, no new build): from `apps/mobile`,
`npm run send-update -- "what changed"` (part 3b of the guide). Don't run
plain `eas update`: it bundles without the `EXPO_PUBLIC_*` settings from
`eas.json`, and the app would stop at launch on every phone that got it.
Bump `version` in `app.json` before any build that changes something
native; an update only reaches builds with the same version.

## The web build

`npx expo export --platform web` writes a static site to `dist/`. `vercel.json`
holds the Vercel settings for it: the build command, the rewrites for pages
with ids in the address (`/e/<id>` → `/e/[id].html`), the crawler rewrite to
`api/preview.js` (link previews for shared links), and cache headers.
`public/` holds the web app manifest, icons and the install poster.
