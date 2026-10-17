import type { Metadata } from "next";
import { IPHONE_STEPS, AppTile } from "../illustrations";

// A phone-shaped poster of the iPhone steps (1080x1920 when captured at 3x).
// Not linked anywhere: open /install/poster and screenshot the poster.
export const metadata: Metadata = { title: "Add Function to your iPhone", robots: { index: false } };

export default function PosterPage() {
  return (
    <div className="grid place-items-center py-6">
      <div id="poster" className="flex h-[640px] w-[360px] flex-col bg-[#4338ca] px-4 pt-5 pb-4 text-white">
        <div className="flex items-center gap-3">
          <span className="rounded-[24%] ring-2 ring-white"><AppTile size={40} /></span>
          <div>
            <p className="font-display text-[19px] leading-tight font-extrabold">Get Function on your iPhone</p>
            <p className="text-[11px] text-white/80">
              Tap the <span className="rounded bg-[#f43f5e] px-1 font-bold text-white">pink</span> bits 👆 in Safari
            </p>
          </div>
        </div>
        <ol className="mt-3 grid flex-1 grid-cols-2 grid-rows-3 gap-2">
          {IPHONE_STEPS.map((step, i) => (
            <li key={step.title} className="flex min-h-0 flex-col rounded-2xl bg-white p-2 text-ink">
              <p className="flex items-start gap-1.5 text-[11px] leading-tight font-bold">
                <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-[#4338ca] text-[10px] text-white">{i + 1}</span>
                {step.titleHere ?? step.title}
              </p>
              <p className="mt-0.5 text-[9px] leading-snug text-muted">{step.short}</p>
              <div className="mt-auto pt-1 [zoom:0.62]">{step.art}</div>
            </li>
          ))}
        </ol>
        <p className="mt-2.5 text-center font-display text-[15px] font-extrabold">student-motive.vercel.app</p>
        <p className="text-center text-[10px] text-white/75">Android: Chrome → ⋮ → Add to home screen</p>
      </div>
    </div>
  );
}
