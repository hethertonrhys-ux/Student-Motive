import type { ReactNode } from "react";

// Little drawings of what you'll see on your phone at each step of
// "Add to Home Screen". Used by the install page and the shareable poster.

const MOTIVE_URL = "student-motive.vercel.app";

export function ShareIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}
export function AddSquareIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}
function Dots({ vertical }: { vertical?: boolean }) {
  return (
    <span className={`flex gap-[3px] ${vertical ? "flex-col" : ""}`} aria-hidden>
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
    </span>
  );
}

// Where to tap: bright pink-red with a pointing finger, so it stands out
// from everything else in the drawing.
const HIT = "bg-[#f43f5e] text-white font-bold ring-4 ring-[#f43f5e]/35 shadow-md";

function Finger({ className = "-right-2 -bottom-3.5" }: { className?: string }) {
  return (
    <span className={`pointer-events-none absolute z-10 text-[20px] leading-none drop-shadow ${className}`} aria-hidden>
      👆
    </span>
  );
}

function Tap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center rounded-full ${HIT} ${className}`}>
      {children}
      <Finger />
    </span>
  );
}

// A highlighted row in a menu or list.
function TapRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-1 flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 ${HIT} ${className}`}>
      {children}
      <Finger className="-right-1 -bottom-3.5" />
    </div>
  );
}

function PageSketch({ className = "h-16" }: { className?: string }) {
  return (
    <div className={`bg-white p-2 ${className}`}>
      <div className="h-2 w-16 rounded bg-[#4338ca]/60" />
      <div className="mt-2 h-1.5 w-24 rounded bg-black/10" />
      <div className="mt-1 h-1.5 w-20 rounded bg-black/10" />
    </div>
  );
}

function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[1.4rem] border-[5px] border-ink bg-[#f2f2f7] text-[11px] text-[#1c1c1e] shadow-lg ${className}`}>
      {children}
    </div>
  );
}

export function AppTile({ size = 44 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[22%] bg-[#4338ca] font-display font-extrabold text-white"
      style={{ width: size, height: size }}
    >
      <span className="flex items-end" style={{ marginTop: -size * 0.08 }}>
        <span style={{ fontSize: size * 0.68, lineHeight: 1 }}>f</span>
        <span
          className="rounded-full bg-[#f43f5e]"
          style={{ width: size * 0.13, height: size * 0.13, marginLeft: size * 0.03, marginBottom: size * 0.06 }}
        />
      </span>
    </span>
  );
}

// ---------- iPhone (Safari) ----------
// Safari since iOS 26 hides Share inside the ••• menu next to the address,
// and "Add to Home Screen" is often under "View More" in the share sheet.

function SafariBar({ tapDots }: { tapDots: boolean }) {
  return (
    <div className="flex items-center gap-1.5 bg-[#f9f9fb] px-2 pt-2 pb-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-black/[0.07] text-black/50">‹</span>
      <span className="flex-1 truncate rounded-full bg-black/[0.07] px-2 py-1.5 text-center">{MOTIVE_URL}</span>
      {tapDots ? (
        <Tap className="size-7 shrink-0"><Dots /></Tap>
      ) : (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-black/[0.07] text-black/60"><Dots /></span>
      )}
    </div>
  );
}

export function IphoneDots() {
  return (
    <Screen>
      <PageSketch className="h-20" />
      <SafariBar tapDots />
    </Screen>
  );
}

export function IphoneMenu() {
  return (
    <Screen>
      <div className="relative h-24 bg-white p-2">
        <div className="h-2 w-16 rounded bg-[#4338ca]/60" />
        <div className="absolute right-2 bottom-1 w-[66%] rounded-xl bg-white py-1 text-[10px] shadow-lg ring-1 ring-black/10">
          <TapRow>Share <ShareIcon className="size-3.5" /></TapRow>
          <div className="px-2.5 pt-1.5 text-black/50">Add to Favourites</div>
        </div>
      </div>
      <SafariBar tapDots={false} />
    </Screen>
  );
}

function ShareSheetTop() {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-2">
      <AppTile size={22} />
      <span className="font-semibold">Function</span>
    </div>
  );
}

export function IphoneViewMore() {
  const row = "flex items-center justify-between border-b border-black/5 px-2.5 py-1.5 text-black/60";
  return (
    <Screen>
      <ShareSheetTop />
      <div className="mx-2 mb-2 rounded-xl bg-white py-1">
        <div className={row}><span>Copy</span><span className="text-black/30">⧉</span></div>
        <div className={`${row} border-0`}><span>Add to Favourites</span><span className="text-black/30">☆</span></div>
        <TapRow className="mt-1 justify-center">View More ⌄</TapRow>
      </div>
    </Screen>
  );
}

export function IphoneShareSheet() {
  const row = "flex items-center justify-between border-b border-black/5 px-2.5 py-1.5 text-black/60";
  return (
    <Screen>
      <ShareSheetTop />
      <div className="mx-2 mb-2 rounded-xl bg-white py-1">
        <div className={row}><span>Add to Reading List</span><span className="text-black/30">∞</span></div>
        <TapRow className="my-1">
          <span>Add to Home Screen</span>
          <AddSquareIcon className="size-4" />
        </TapRow>
        <div className={`${row} border-0`}><span>Add Bookmark</span><span className="text-black/30">□</span></div>
      </div>
    </Screen>
  );
}

export function IphoneAddDialog() {
  return (
    <Screen>
      <div className="flex items-center justify-between bg-[#f9f9fb] px-2.5 py-2">
        <span className="text-[#007aff]">Cancel</span>
        <span className="font-semibold whitespace-nowrap">Add to Home</span>
        <Tap className="px-2 py-0.5 font-bold">Add</Tap>
      </div>
      <div className="m-2 flex items-center gap-2 rounded-xl bg-white p-2">
        <AppTile size={34} />
        <div className="min-w-0">
          <p className="font-semibold">Function</p>
          <p className="truncate text-[9px] text-black/40">{MOTIVE_URL}</p>
        </div>
      </div>
      <div className="mx-2 mb-2 flex items-center justify-between rounded-xl bg-white px-2.5 py-2">
        <span>Open as Web App</span>
        <span className="flex h-4 w-7 items-center justify-end rounded-full bg-[#34c759] p-0.5"><span className="size-3 rounded-full bg-white" /></span>
      </div>
    </Screen>
  );
}

export function HomeScreen() {
  return (
    <Screen className="bg-gradient-to-b from-[#a5b4fc] to-[#f0abfc]">
      <div className="grid grid-cols-4 gap-2 p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="aspect-square rounded-[22%] bg-white/50" />
        ))}
        <span className="relative flex flex-col items-center gap-0.5">
          <span className="rounded-[22%] ring-4 ring-[#f43f5e]"><AppTile size={28} /></span>
          <span className="text-[9px] font-bold text-white drop-shadow">Function</span>
          <Finger className="-right-3 bottom-3" />
        </span>
      </div>
    </Screen>
  );
}

// ---------- Android (Chrome) ----------

export function AndroidChrome() {
  return (
    <Screen>
      <div className="flex items-center gap-1.5 bg-white px-2 py-2">
        <span className="flex-1 truncate rounded-full bg-black/[0.07] px-2 py-1.5">{MOTIVE_URL}</span>
        <Tap className="size-7"><Dots vertical /></Tap>
      </div>
      <PageSketch className="h-20" />
    </Screen>
  );
}

export function AndroidMenu() {
  const row = "px-2.5 py-1.5";
  return (
    <Screen>
      <div className="ml-auto w-[85%] space-y-0 rounded-b-xl bg-white py-1 shadow">
        <div className={row}>New tab</div>
        <div className={row}>History</div>
        <div className={row}>Share…</div>
        <TapRow>
          <span className="flex items-center gap-1.5"><AddSquareIcon className="size-4" /> Add to home screen</span>
        </TapRow>
        <div className={row}>Settings</div>
      </div>
      <p className="px-2 py-1.5 text-center text-[9px] text-black/50">May say &ldquo;Install app&rdquo; instead</p>
    </Screen>
  );
}

export function AndroidInstall() {
  return (
    <Screen>
      <div className="m-2 rounded-2xl bg-white p-3">
        <p className="font-semibold">Install app</p>
        <div className="mt-2 flex items-center gap-2">
          <AppTile size={30} />
          <div>
            <p className="font-semibold">Function</p>
            <p className="text-[9px] text-black/40">{MOTIVE_URL}</p>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-3">
          <span className="py-0.5 text-[#1a73e8]">Cancel</span>
          <Tap className="px-2.5 py-0.5 font-bold">Install</Tap>
        </div>
      </div>
    </Screen>
  );
}

export type InstallStep = {
  title: string;
  body: string;
  // Step 1 only: what to say when they're already in the right browser.
  titleHere?: string;
  bodyHere?: string;
  short: string;
  art: ReactNode;
};

export const IPHONE_STEPS: InstallStep[] = [
  {
    title: "Open the link in Safari, tap •••",
    titleHere: "Tap •••",
    body: "Open the link below in Safari. The ••• is at the bottom right, next to the web address.",
    bodyHere: "It's at the bottom right, next to the web address.",
    short: "Bottom right, next to the address.",
    art: <IphoneDots />,
  },
  {
    title: "Tap Share",
    body: "On older iPhones, skip step 1: the Share button is right at the bottom of the screen.",
    short: "In the menu that pops up.",
    art: <IphoneMenu />,
  },
  {
    title: "Tap “View More”",
    body: "Only if you can't see “Add to Home Screen” yet. Then scroll down the list.",
    short: "Only if you can't see step 4.",
    art: <IphoneViewMore />,
  },
  { title: "Tap “Add to Home Screen”", body: "Scroll down the list if you need to.", short: "Scroll down if you need to.", art: <IphoneShareSheet /> },
  { title: "Tap Add", body: "Keep “Open as Web App” switched on.", short: "Top right.", art: <IphoneAddDialog /> },
  { title: "Open Function from your home screen", body: "Log in once with your email code. You'll stay logged in.", short: "Log in once. That's it.", art: <HomeScreen /> },
];

export const ANDROID_STEPS: InstallStep[] = [
  {
    title: "Open Function in Chrome",
    body: "Open the link below in Chrome, then tap ⋮ in the top right.",
    titleHere: "Tap ⋮",
    bodyHere: "Tap ⋮ in the top right of Chrome.",
    short: "Then tap ⋮.",
    art: <AndroidChrome />,
  },
  { title: "Tap “Add to home screen”", body: "On some phones it's called “Install app”.", short: "Or “Install app”.", art: <AndroidMenu /> },
  { title: "Tap Install", body: "Function is added to your home screen and app drawer.", short: "", art: <AndroidInstall /> },
  { title: "Open it from your home screen", body: "Log in once with your email code. You'll stay logged in.", short: "", art: <HomeScreen /> },
];
