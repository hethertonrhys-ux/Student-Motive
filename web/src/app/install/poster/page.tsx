import type { Metadata } from "next";
import { IPHONE_STEPS, MotiveTile } from "../illustrations";

// A phone-shaped poster of the iPhone steps, sized for an Instagram story.
// Not linked anywhere: open /install/poster and screenshot the poster.
export const metadata: Metadata = { title: "Add Motive to your iPhone", robots: { index: false } };

export default function PosterPage() {
  return (
    <div className="grid place-items-center py-6">
      <div id="poster" className="flex h-[640px] w-[360px] flex-col bg-[#4338ca] px-5 pt-7 pb-5 text-white">
        <div className="flex items-center gap-3">
          <span className="rounded-[24%] ring-2 ring-white"><MotiveTile size={44} /></span>
          <div>
            <p className="font-display text-[20px] leading-tight font-extrabold">Get Motive on your iPhone</p>
            <p className="text-[12px] text-white/75">Every LSE event on one live map</p>
          </div>
        </div>
        <ol className="mt-4 grid flex-1 grid-cols-2 gap-2.5">
          {IPHONE_STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col rounded-2xl bg-white p-2.5 text-ink">
              <p className="flex items-start gap-1.5 text-[12px] leading-tight font-bold">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#f43f5e] text-[11px] text-white">{i + 1}</span>
                {step.title}
              </p>
              <p className="mt-1 text-[10px] leading-snug text-muted">{step.short}</p>
              <div className="mt-auto pt-1.5 [zoom:0.72]">{step.art}</div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-center font-display text-[15px] font-extrabold">student-motive.vercel.app</p>
        <p className="text-center text-[10px] text-white/70">Android: Chrome → ⋮ → Add to home screen</p>
      </div>
    </div>
  );
}
