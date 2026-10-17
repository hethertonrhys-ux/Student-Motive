import type { Metadata } from "next";
import { ANDROID_STEPS, IPHONE_STEPS, MotiveTile } from "./illustrations";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Put Motive on your phone's home screen in four taps. Works on iPhone and Android.",
};

export default function InstallPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center gap-4">
        <MotiveTile size={56} />
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Get Motive on your phone</h1>
          <p className="mt-1 text-muted">Four taps. It opens full screen with its own icon, just like an app. Free, and no App Store needed.</p>
        </div>
      </div>
      <nav className="mt-6 flex gap-2 text-sm font-semibold">
        <a href="#iphone" className="btn-ghost py-2">iPhone</a>
        <a href="#android" className="btn-ghost py-2">Android</a>
      </nav>

      <Steps id="iphone" title="iPhone" steps={IPHONE_STEPS} />
      <Steps id="android" title="Android" steps={ANDROID_STEPS} />

      <p className="mt-10 text-sm text-muted">
        Already added it before? Remove the old icon and add it again to get the latest version.
      </p>
      <p className="mt-2 text-sm">
        <a href="/motive-iphone-story.png" download className="font-semibold text-brand">
          Download these steps as an image
        </a>{" "}
        <span className="text-muted">(sized for an Instagram story)</span>
      </p>
    </div>
  );
}

function Steps({ id, title, steps }: { id: string; title: string; steps: typeof IPHONE_STEPS }) {
  return (
    <section id={id} className="mt-10 scroll-mt-20">
      <h2 className="font-display text-2xl font-extrabold">{title}</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="card flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-extrabold text-brand-ink">{i + 1}</span>
              <div>
                <h3 className="font-bold leading-snug">{step.title}</h3>
                <p className="mt-0.5 text-sm text-muted">{step.body}</p>
              </div>
            </div>
            <div className="mt-auto">{step.art}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
