// The website's address, for links to pages the app doesn't have yet
// (the committee dashboard until phase 9) and for links people share.
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? "https://studentfunction.com";

// Where people email the Function team.
// - CONTACT_EMAIL: the management address, for societies, claims and the
//   data controller (set EXPO_PUBLIC_CONTACT_EMAIL to override).
// - SUPPORT_EMAIL: help and support for students (EXPO_PUBLIC_SUPPORT_EMAIL).
export const CONTACT_EMAIL = process.env.EXPO_PUBLIC_CONTACT_EMAIL ?? "management@studentfunction.com";
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "help@studentfunction.com";
