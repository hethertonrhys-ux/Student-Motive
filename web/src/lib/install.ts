"use client";

import { useSyncExternalStore } from "react";

// Works out what phone and browser someone is on, so we can show them
// the right "add to home screen" steps (or an install button).

export type Device = {
  platform: "iphone" | "android" | "other";
  // Instagram, TikTok etc. open links in their own browser, which can't
  // add to the home screen. People need to open the page in Safari/Chrome.
  inAppBrowser: string | null;
  // On iPhone, Safari is easiest. Chrome/Edge/Firefox work too on newer iPhones.
  iphoneBrowser: "safari" | "other";
  // Already opened from the home screen icon.
  installed: boolean;
};

const IN_APP: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS|MESSENGER/i, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Twitter/i, "X"],
  [/GSA\//i, "the Google app"],
];

function detect(): Device {
  const ua = navigator.userAgent;
  // iPads say they're Macs, but have touch screens.
  const iphone = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    platform: iphone ? "iphone" : android ? "android" : "other",
    inAppBrowser: IN_APP.find(([re]) => re.test(ua))?.[1] ?? null,
    iphoneBrowser: /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "other" : "safari",
    installed,
  };
}

let cached: Device | null = null;
const getDevice = () => (cached ??= detect());
const noSubscribe = () => () => {};

// Null while the page is first drawn on the server, then the real answer.
export function useDevice(): Device | null {
  return useSyncExternalStore(noSubscribe, getDevice, () => null);
}

// ---- Android's one-tap install ----
// Chrome on Android fires "beforeinstallprompt" when the site can be
// installed. We keep it so an "Install" button can show Chrome's own prompt.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// True when a one-tap install is available (Android Chrome and similar).
export function useCanOneTapInstall() {
  return useSyncExternalStore(subscribe, () => deferred !== null, () => false);
}

export async function oneTapInstall() {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}
