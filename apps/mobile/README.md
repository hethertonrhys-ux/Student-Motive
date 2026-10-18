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
