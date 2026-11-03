// Switches for whole parts of the app, for everyone. (Features a society can
// switch on or off for itself, such as tables or member invites, live in
// packages/shared/src/features.ts instead.)
//
// To change one: edit the value here and merge the change into expo-app.
// The website updates by itself within a few minutes; phones get it with
// the next phone update (npm run send-update in apps/mobile).

// The live map: the Map tab and every link to it. Switched off for the
// Abacus launch. All of its code is kept (app/(tabs)/map.tsx and
// components/map/), so set this to true to bring it back.
export const MAP_ENABLED: boolean = false;

// The Map tab's address, for the links that open it while it's switched on.
export const MAP_ROUTE = "/(tabs)/map";

// The tab people land on when they open the app logged in or finish logging
// in, and where a Back button goes when there's nowhere to go back to.
export const HOME_ROUTE = MAP_ENABLED ? MAP_ROUTE : "/(tabs)/societies";
// The same tab as the address bar shows it (what usePathname() returns).
export const HOME_PATH = MAP_ENABLED ? "/map" : "/societies";
