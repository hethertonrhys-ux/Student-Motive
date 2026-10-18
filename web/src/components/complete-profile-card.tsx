"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { MAX_PROMPTS } from "@/lib/prompts";

const SHOWN_KEY = "fn-complete-profile-shown";
const noSubscribe = () => () => {};

// Decided once per page load: show it only if it hasn't been shown yet this
// session (and remember that it now has been).
let decided: boolean | null = null;
function firstTimeThisSession() {
  if (decided !== null) return decided;
  try {
    decided = sessionStorage.getItem(SHOWN_KEY) !== "1";
    sessionStorage.setItem(SHOWN_KEY, "1");
  } catch {
    decided = false;
  }
  return decided;
}

// A small nudge for people with fewer than 3 prompts: on their own profile,
// and after they join an event or a society. At most once per session.
export function CompleteProfileCard({ prompts }: { prompts: number }) {
  const show = useSyncExternalStore(noSubscribe, firstTimeThisSession, () => false);
  const [closed, setClosed] = useState(false);
  if (prompts >= MAX_PROMPTS || !show || closed) return null;
  const left = MAX_PROMPTS - prompts;
  return (
    <div className="card relative mt-4 flex items-center gap-3 border-brand/40 bg-brand-soft py-3 pr-10">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Complete your profile</p>
        <p className="text-sm text-muted">
          Add {left} more prompt{left === 1 ? "" : "s"} so people have something to say hi about.
        </p>
      </div>
      <Link href="/account#prompts" className="btn shrink-0 py-2 text-sm">Add</Link>
      <button type="button" onClick={() => setClosed(true)} aria-label="Dismiss" className="absolute top-2 right-2 px-1 text-lg leading-none text-muted">
        ×
      </button>
    </div>
  );
}
