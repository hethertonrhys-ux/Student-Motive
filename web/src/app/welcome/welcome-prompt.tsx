"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MAX_ANSWER, exampleFor, type Prompt, type Uni } from "@/lib/prompts";
import { finishWelcome, saveWelcomePrompt, welcomeReached } from "./actions";

// The one optional step after signing up. Nothing here is required: "Skip
// for now" is as easy to hit as "Continue", and the account already exists.
// The answer saves as you type, so nothing is lost if they leave.
export function WelcomePrompt({ prompts, uni, next }: { prompts: Prompt[]; uni: Uni | null; next: string }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Prompt | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null); // the prompt id last saved
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    void welcomeReached();
  }, []);

  // Save a moment after typing stops.
  useEffect(() => {
    if (!chosen || !text.trim()) return;
    const timer = setTimeout(() => {
      const previous = saved !== chosen.id ? saved : null;
      saving.current = saveWelcomePrompt(chosen.id, text, previous).then((r) => {
        if (r.error) setError(r.error);
        else {
          setError(null);
          setSaved(chosen.id);
        }
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [chosen, text, saved]);

  function pick(p: Prompt) {
    setChosen(p);
    // Focus straight away, during the tap, so phones open the keyboard.
    box.current?.focus();
  }

  async function leave(event: "prompts_skipped" | "prompts_completed") {
    setLeaving(true);
    if (event === "prompts_completed" && chosen && text.trim()) {
      await saving.current;
      const r = await saveWelcomePrompt(chosen.id, text, saved !== chosen.id ? saved : null);
      if (r.error) {
        setError(r.error);
        setLeaving(false);
        return;
      }
    }
    await finishWelcome(event);
    router.replace(next);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-8 pb-40">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">You&apos;re in!</h1>
      <p className="mt-2 text-lg">Pick one prompt so people have something to say hi about.</p>
      <p className="mt-1 text-sm text-muted">Optional. You can add more later (up to 3).</p>

      <div className="card mt-5 space-y-2">
        <label htmlFor="welcome-answer" className={`block font-semibold ${chosen ? "" : "text-muted"}`}>
          {chosen ? chosen.text : "Tap a prompt below, then answer here"}
        </label>
        <textarea
          id="welcome-answer"
          ref={box}
          rows={2}
          maxLength={MAX_ANSWER}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={chosen ? exampleFor(chosen, uni) : "Your answer"}
          className="input"
        />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{saved === chosen?.id && text.trim() ? "Saved ✓" : " "}</span>
          <span>{text.length}/{MAX_ANSWER}</span>
        </div>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>

      <ul className="mt-5 space-y-2">
        {prompts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => pick(p)}
              aria-pressed={chosen?.id === p.id}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                chosen?.id === p.id ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand"
              }`}
            >
              <span className="font-semibold">{p.text}</span>
              {p.uni && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">{p.uni}</span>}
            </button>
          </li>
        ))}
      </ul>

      {/* Both choices always in reach, equally easy to tap. */}
      <div className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-40 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <button type="button" disabled={leaving} onClick={() => leave("prompts_skipped")} className="btn-ghost w-full py-3 text-base">
            Skip for now
          </button>
          <button type="button" disabled={leaving || !chosen || !text.trim()} onClick={() => leave("prompts_completed")} className="btn w-full py-3 text-base">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
