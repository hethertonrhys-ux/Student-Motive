"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TwoTruthsForm } from "@/components/two-truths-form";
import { MAX_ANSWER, exampleFor, type Prompt, type Uni } from "@/lib/prompts";
import { finishWelcome, saveWelcomePrompt, welcomeReached } from "./actions";

// The one optional step after signing up. Nothing here is required: "Skip
// for now" is as easy to hit as "Continue", and the account already exists.
// The answer saves as you type, so nothing is lost if they leave.
export function WelcomePrompt({
  prompts,
  uni,
  next,
  intro,
  after,
}: {
  prompts: Prompt[];
  uni: Uni | null;
  next: string;
  // The hello from their uni (above), and what's coming up (below).
  intro: ReactNode;
  after?: ReactNode;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Prompt | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null); // the prompt id last saved
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  // Two truths and a lie: ready once all three are filled in and a lie picked.
  const [gameReady, setGameReady] = useState(false);
  const saveGame = useRef<() => Promise<boolean>>(async () => false);
  const game = Boolean(chosen?.game);

  useEffect(() => {
    void welcomeReached();
  }, []);

  // Save a moment after typing stops.
  useEffect(() => {
    if (!chosen || chosen.game || !text.trim()) return;
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
    if (event === "prompts_completed" && game) {
      if (!(await saveGame.current())) {
        setLeaving(false);
        return;
      }
    } else if (event === "prompts_completed" && chosen && text.trim()) {
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
      {intro}
      <p className="mt-1 text-sm text-muted">Optional. You can add more later (up to 3).</p>

      {game && (
        <div className="card mt-5 space-y-2">
          <p className="font-semibold">{chosen!.text}</p>
          <TwoTruthsForm
            key={chosen!.id}
            initial={null}
            uni={uni}
            autoSave
            placeFirst
            focusFirst
            onReady={(ready, save) => {
              setGameReady(ready);
              saveGame.current = save;
            }}
          />
        </div>
      )}
      <div className={`card mt-5 space-y-2 ${game ? "hidden" : ""}`}>
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

      {after}

      {/* Both choices always in reach, equally easy to tap. */}
      <div className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-40 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <button type="button" disabled={leaving} onClick={() => leave("prompts_skipped")} className="btn-ghost w-full py-3 text-base">
            Skip for now
          </button>
          <button type="button" disabled={leaving || !chosen || (game ? !gameReady : !text.trim())} onClick={() => leave("prompts_completed")} className="btn w-full py-3 text-base">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
