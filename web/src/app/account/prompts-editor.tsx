"use client";

import { useState, useTransition } from "react";
import { MAX_ANSWER, MAX_PROMPTS, exampleFor, promptById, promptsFor, type Prompt, type Uni } from "@/lib/prompts";
import { useRouter } from "next/navigation";
import { TwoTruthsForm } from "@/components/two-truths-form";
import type { TwoTruthsOwn } from "@/lib/two-truths";
import { saveProfilePrompts } from "./actions";

type Answer = { prompt_id: string; answer: string };

const SHOWN = 5;

// The first few prompts in list order (the same every time, so the page looks
// the same while it loads); Shuffle picks others. Two truths and a lie stays
// pinned at the top until it's answered.
function firstPicks(offered: Prompt[], answered: Set<string>) {
  return offered.filter((p) => !answered.has(p.id)).slice(0, SHOWN);
}
const pinned = (offered: Prompt[], answered: Set<string>) => offered.filter((p) => p.game && !answered.has(p.id));

// Fun questions instead of a blank "About me": answer up to 3. Each change
// saves straight away. "uni" decides which prompts and examples you see.
export function PromptsEditor({ initial, uni, twoTruths }: { initial: Answer[]; uni: Uni | null; twoTruths: TwoTruthsOwn | null }) {
  const router = useRouter();
  const offered = promptsFor(uni);
  const [answers, setAnswers] = useState<Answer[]>(initial.filter((a) => promptById(a.prompt_id)));
  const [picks, setPicks] = useState<Prompt[]>(() => firstPicks(offered, new Set(initial.map((a) => a.prompt_id))));
  // "replacing": the retired prompt whose answer is moving to a new prompt.
  const [editing, setEditing] = useState<{ prompt: Prompt; text: string; replacing?: string } | null>(null);
  const [retiredPick, setRetiredPick] = useState<{ id: string; text: string } | null>(null);
  const [status, setStatus] = useState<{ saved?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  const answered = new Set(answers.map((a) => a.prompt_id));

  function save(next: Answer[]) {
    const before = answers;
    setAnswers(next);
    setStatus({});
    start(async () => {
      const r = await saveProfilePrompts(next);
      if (r.error) {
        setAnswers(before);
        setStatus({ error: r.error });
      } else setStatus({ saved: true });
    });
  }

  function shuffle() {
    const top = pinned(offered, answered);
    const pool = offered.filter((p) => !p.game && !answered.has(p.id) && !picks.some((x) => x.id === p.id));
    const fresh: Prompt[] = [...top];
    while (fresh.length < SHOWN && pool.length) fresh.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setPicks(fresh.length > top.length ? fresh : firstPicks(offered, answered));
  }

  function finish() {
    if (!editing) return;
    const text = editing.text.trim().replace(/\s+/g, " ");
    if (!text) return;
    const target = editing.replacing ?? editing.prompt.id;
    const exists = answers.some((a) => a.prompt_id === target);
    save(
      exists
        ? answers.map((a) => (a.prompt_id === target ? { prompt_id: editing.prompt.id, answer: text } : a))
        : [...answers, { prompt_id: editing.prompt.id, answer: text }],
    );
    setPicks((p) => p.filter((x) => x.id !== editing.prompt.id));
    setEditing(null);
  }

  // Older answers could be up to 150 characters; don't cut them short when editing.
  const limit = Math.max(MAX_ANSWER, editing?.prompt && answers.find((a) => a.prompt_id === (editing.replacing ?? editing.prompt.id))?.answer.length || 0);

  return (
    <section id="prompts" className="card mt-6 scroll-mt-20 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Prompts</h2>
          <p className="text-sm text-muted">Answer up to 3. They show on your profile so people get a feel for you.</p>
        </div>
        <span className={`shrink-0 text-sm font-bold ${answers.length === MAX_PROMPTS ? "text-ok" : "text-muted"}`}>
          {answers.length}/{MAX_PROMPTS} prompts answered
        </span>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: MAX_PROMPTS }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < answers.length ? "bg-brand" : "bg-line"}`} />
        ))}
      </div>

      {answers.length > 0 && (
        <ul className="space-y-2">
          {answers.map((a) => {
            const prompt = promptById(a.prompt_id)!;
            return (
              <li key={a.prompt_id} className="rounded-xl border border-line p-3">
                <p className="text-xs font-semibold text-muted">{prompt.text}</p>
                {prompt.game && twoTruths ? (
                  <ul className="mt-1 space-y-0.5 text-sm font-semibold">
                    {[twoTruths.s1, twoTruths.s2, twoTruths.s3].map((t, i) => (
                      <li key={i} className="[overflow-wrap:anywhere]">
                        {t}
                        {twoTruths.lie === i + 1 && <span className="ml-1.5 rounded-full bg-danger/10 px-1.5 py-0.5 text-[11px] font-bold text-danger">the lie</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 font-semibold [overflow-wrap:anywhere]">{a.answer}</p>
                )}
                <div className="mt-2 flex gap-4 text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      // Retired prompts can't be edited in place: pick a new prompt for the answer.
                      if (prompt.retired) {
                        setEditing(null);
                        setRetiredPick({ id: a.prompt_id, text: a.answer });
                      } else setEditing({ prompt, text: a.answer });
                    }}
                    className="text-brand"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirm("Remove this answer?") && save(answers.filter((x) => x.prompt_id !== a.prompt_id))}
                    className="text-muted hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing?.prompt.game ? (
        <div className="rounded-xl border-2 border-brand p-3">
          <p className="mb-2 font-semibold">{editing.prompt.text}</p>
          <TwoTruthsForm
            initial={twoTruths}
            uni={uni}
            focusFirst
            onCancel={() => setEditing(null)}
            onSaved={() => {
              if (!answers.some((a) => a.prompt_id === editing.prompt.id)) setAnswers([...answers, { prompt_id: editing.prompt.id, answer: editing.prompt.text }]);
              setPicks((p) => p.filter((x) => x.id !== editing.prompt.id));
              setEditing(null);
              setStatus({ saved: true });
              router.refresh();
            }}
          />
        </div>
      ) : editing ? (
        <div className="rounded-xl border-2 border-brand p-3">
          <label htmlFor="prompt-answer" className="block font-semibold">{editing.prompt.text}</label>
          <textarea
            id="prompt-answer"
            autoFocus
            rows={3}
            maxLength={limit}
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            placeholder={exampleFor(editing.prompt, uni)}
            className="input mt-2"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{editing.text.length}/{limit}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="btn-ghost py-2">Cancel</button>
              <button type="button" onClick={finish} disabled={!editing.text.trim()} className="btn py-2">Save answer</button>
            </span>
          </div>
        </div>
      ) : (
        (answers.length < MAX_PROMPTS || retiredPick) && (
          <div>
            {retiredPick && (
              <p className="mb-2 rounded-xl bg-brand-soft px-3 py-2 text-sm">
                That prompt isn&apos;t offered any more. Pick a new one for your answer (you can change the words too).{" "}
                <button type="button" onClick={() => setRetiredPick(null)} className="font-semibold text-muted">Cancel</button>
              </p>
            )}
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Pick a prompt</p>
              <button type="button" onClick={shuffle} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
                Shuffle
              </button>
            </div>
            <ul className="space-y-2">
              {picks.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(retiredPick ? { prompt: p, text: retiredPick.text, replacing: retiredPick.id } : { prompt: p, text: "" });
                      setRetiredPick(null);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3 text-left transition hover:border-brand"
                  >
                    <span className="font-semibold">{p.text}</span>
                    {p.uni && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">{p.uni}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {status.saved && !pending && <p className="text-sm font-semibold text-ok">Saved ✓</p>}
      {status.error && <p className="text-sm font-medium text-danger">{status.error}</p>}
    </section>
  );
}
