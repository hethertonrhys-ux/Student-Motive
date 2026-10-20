// The website has no over-the-air updates to announce: a web page always
// loads the newest version. So nothing is shown, and the phone updater
// (expo-updates, used by update-banner.native.tsx) is never part of the
// website's code.
export function UpdateBanner() {
  return null;
}
