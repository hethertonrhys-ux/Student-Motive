"use client";

import Link from "next/link";
import { useState } from "react";
import { SITE_HOST, SITE_URL } from "@/lib/site";
import { oneTapInstall, useCanOneTapInstall, useDevice } from "@/lib/install";
import { ANDROID_STEPS, IPHONE_STEPS, type InstallStep } from "./illustrations";

type Tab = "iphone" | "android";

export function InstallGuide() {
  const device = useDevice();
  const canOneTap = useCanOneTapInstall();
  // Until they pick a tab, show the steps for the phone they're on.
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab | null = picked ?? (device?.platform === "iphone" || device?.platform === "android" ? device.platform : null);

  if (device?.installed) {
    return (
      <div className="card mt-8 bg-ok/10">
        <p className="font-display text-xl font-extrabold">✓ You&apos;re all set</p>
        <p className="mt-1 text-muted">You&apos;re using Function from your home screen.</p>
        <Link href="/map" className="btn mt-4">Open the live map</Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Opened from Instagram etc.: those browsers can't add to the home screen. */}
      {device?.inAppBrowser && (
        <div className="card border-live/40 bg-live/10">
          <p className="font-bold">First, open this page in {device.platform === "android" ? "Chrome" : "Safari"}</p>
          <p className="mt-1 text-sm">
            You&apos;re in {device.inAppBrowser}&apos;s browser, which can&apos;t add apps to your home screen. Tap the
            menu (<strong>•••</strong> or <strong>⋮</strong>) at the top, then{" "}
            <strong>Open in {device.platform === "android" ? "Chrome" : "Safari"}</strong> or &ldquo;Open in browser&rdquo;.
          </p>
          <p className="mt-3 text-sm">Or copy this link and paste it into {device.platform === "android" ? "Chrome" : "Safari"}:</p>
          <CopyLink />
        </div>
      )}

      {/* Android Chrome can install in one tap. */}
      {canOneTap && !device?.inAppBrowser && (
        <div className="card bg-brand-soft">
          <p className="font-display text-xl font-extrabold">
            {device?.platform === "other" ? "Want it on this computer too?" : "Install in one tap"}
          </p>
          <button type="button" onClick={() => oneTapInstall()} className="btn mt-3 px-6 py-3 text-base">
            {device?.platform === "other" ? "Install on this computer" : "Install Function"}
          </button>
          {device?.platform !== "other" && <p className="mt-2 text-sm text-muted">Or follow the steps below.</p>}
        </div>
      )}

      {device?.platform === "other" && (
        <p className="card text-sm">
          On a computer? Open this link on your phone:
          <CopyLink />
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-muted">Which phone do you have?</p>
        <div role="tablist" className="inline-flex rounded-2xl border border-line bg-surface p-1">
          {(["iphone", "android"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setPicked(t)}
              className={`rounded-xl px-6 py-2.5 font-display text-base font-bold transition ${
                tab === t ? "bg-brand text-brand-ink shadow" : "text-muted hover:text-ink"
              }`}
            >
              {t === "iphone" ? "iPhone" : "Android"}
            </button>
          ))}
        </div>
      </div>

      {tab === "iphone" && (
        <>
          {device?.platform === "iphone" && device.iphoneBrowser === "other" && !device.inAppBrowser && (
            <div className="card border-live/40 bg-live/10">
              <p className="font-bold">Open this page in Safari to continue</p>
              <p className="mt-1 text-sm">
                These steps only work in Safari. Copy this link, open the <strong>Safari</strong> app, and paste it
                into the address bar.
              </p>
              <CopyLink />
            </div>
          )}
          <Steps
            steps={IPHONE_STEPS}
            browserDone={
              device?.platform === "iphone" && device.iphoneBrowser === "safari" && !device.inAppBrowser ? "Safari" : null
            }
          />
        </>
      )}
      {tab === "android" && (
        <Steps
          steps={ANDROID_STEPS}
          browserDone={
            device?.platform === "android" && device.androidBrowser === "chrome" && !device.inAppBrowser ? "Chrome" : null
          }
        />
      )}
    </div>
  );
}

// browserDone: they're already in the right browser, so opening it is done.
function Steps({ steps, browserDone }: { steps: InstallStep[]; browserDone: string | null }) {
  return (
    <ol role="tabpanel" className={`grid gap-4 sm:grid-cols-2 ${steps.length % 3 === 0 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {steps.map((step, i) => (
        <li key={step.title} className="card flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-extrabold text-brand-ink">{i + 1}</span>
            <div>
              <h3 className="font-bold leading-snug">{browserDone && step.titleHere ? step.titleHere : step.title}</h3>
              <p className="mt-0.5 text-sm text-muted">{browserDone && step.bodyHere ? step.bodyHere : step.body}</p>
            </div>
          </div>
          {i === 0 &&
            (browserDone ? (
              <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">
                ✓ You&apos;re already in {browserDone}, so you&apos;re in the right place.
              </p>
            ) : (
              <CopyLink />
            ))}
          <div className="mt-auto">{step.art}</div>
        </li>
      ))}
    </ol>
  );
}

const INSTALL_LINK = `${SITE_URL}/install`;

// The link in a box you can see, select, and copy with one tap.
function CopyLink() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL_LINK);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the link is still there to press and hold.
    }
  }

  return (
    <span className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface p-1.5 pl-3">
      <span className="min-w-0 flex-1 text-sm font-bold text-ink select-all">
        {SITE_HOST}<wbr />/install
      </span>
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold transition ${copied ? "bg-ok text-white" : "bg-brand text-brand-ink"}`}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </span>
  );
}
