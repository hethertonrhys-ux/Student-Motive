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

// A pulsing ring that says "tap here".
function Tap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center rounded-full bg-brand text-brand-ink ring-4 ring-brand/30 ${className}`}>
      {children}
    </span>
  );
}

function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[1.4rem] border-[5px] border-ink bg-[#f2f2f7] text-[11px] text-[#1c1c1e] shadow-lg ${className}`}>
      {children}
    </div>
  );
}

export function MotiveTile({ size = 44 }: { size?: number }) {
  return (
    <span
      className="relative grid place-items-center rounded-[22%] bg-[#4338ca] font-display font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size * 0.6, lineHeight: 1 }}
    >
      <span className="-mt-[12%]">m</span>
      <span className="absolute rounded-full bg-[#f43f5e]" style={{ width: size * 0.13, height: size * 0.13, right: size * 0.13, bottom: size * 0.27 }} />
    </span>
  );
}

// ---------- iPhone (Safari) ----------

export function IphoneSafari() {
  return (
    <Screen>
      <div className="h-20 bg-white p-2">
        <div className="h-2 w-16 rounded bg-[#4338ca]/80" />
        <div className="mt-2 h-1.5 w-24 rounded bg-black/10" />
        <div className="mt-1 h-1.5 w-20 rounded bg-black/10" />
      </div>
      <div className="flex items-center gap-1.5 bg-[#f9f9fb] px-2 py-2">
        <span className="flex-1 truncate rounded-lg bg-black/[0.07] px-2 py-1.5 text-center">{MOTIVE_URL}</span>
        <Tap className="size-7"><ShareIcon className="size-4" /></Tap>
      </div>
      <p className="bg-[#f9f9fb] px-2 pb-2 text-center text-[9px] text-black/50">or tap ••• first, then Share</p>
    </Screen>
  );
}

export function IphoneShareSheet() {
  const row = "flex items-center justify-between border-b border-black/5 px-2.5 py-2";
  return (
    <Screen>
      <div className="space-y-1.5 p-2">
        <div className="rounded-xl bg-white">
          <div className={row}><span>Copy</span><span className="text-black/40">⧉</span></div>
          <div className={row}><span>Add to Reading List</span><span className="text-black/40">∞</span></div>
          <div className={`${row} rounded-lg border-0 bg-brand font-bold text-white ring-4 ring-brand/30`}>
            <span>Add to Home Screen</span>
            <AddSquareIcon className="size-4" />
          </div>
          <div className={`${row} border-0`}><span>Add Bookmark</span><span className="text-black/40">□</span></div>
        </div>
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
        <MotiveTile size={34} />
        <div className="min-w-0">
          <p className="font-semibold">Motive</p>
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
        <span className="flex flex-col items-center gap-0.5">
          <span className="rounded-[22%] ring-4 ring-white/70"><MotiveTile size={28} /></span>
          <span className="text-[9px] font-semibold text-white drop-shadow">Motive</span>
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
      <div className="h-20 bg-white p-2">
        <div className="h-2 w-16 rounded bg-[#4338ca]/80" />
        <div className="mt-2 h-1.5 w-24 rounded bg-black/10" />
        <div className="mt-1 h-1.5 w-20 rounded bg-black/10" />
      </div>
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
        <div className={`${row} mx-1 flex items-center gap-1.5 rounded-lg bg-brand font-bold text-white ring-4 ring-brand/30`}>
          <AddSquareIcon className="size-4" /> Add to home screen
        </div>
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
          <MotiveTile size={30} />
          <div>
            <p className="font-semibold">Motive</p>
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

export const IPHONE_STEPS = [
  { title: "Open Motive in Safari", body: `Go to ${MOTIVE_URL}, then tap the Share button.`, short: "Then tap Share.", art: <IphoneSafari /> },
  { title: "Tap “Add to Home Screen”", body: "Scroll down the list if you can't see it.", short: "Scroll down if you can't see it.", art: <IphoneShareSheet /> },
  { title: "Tap Add", body: "Keep “Open as Web App” switched on.", short: "Keep “Open as Web App” on.", art: <IphoneAddDialog /> },
  { title: "Open it from your home screen", body: "Log in once with your email code. You'll stay logged in.", short: "Log in once. You'll stay logged in.", art: <HomeScreen /> },
];

export const ANDROID_STEPS: typeof IPHONE_STEPS = [
  { title: "Open Motive in Chrome", body: `Go to ${MOTIVE_URL}, then tap ⋮ in the top right.`, short: "Then tap ⋮.", art: <AndroidChrome /> },
  { title: "Tap “Add to home screen”", body: "On some phones it's called “Install app”.", short: "Or “Install app”.", art: <AndroidMenu /> },
  { title: "Tap Install", body: "Motive is added to your home screen and app drawer.", short: "", art: <AndroidInstall /> },
  { title: "Open it from your home screen", body: "Log in once with your email code. You'll stay logged in.", short: "", art: <HomeScreen /> },
];
