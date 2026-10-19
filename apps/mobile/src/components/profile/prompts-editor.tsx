import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { exampleFor, MAX_ANSWER, MAX_PROMPTS, promptById, promptsFor, saveProfilePrompts, type Prompt, type PromptAnswer, type TwoTruthsOwn, type Uni } from "@function/shared";
import { Icon } from "@/components/icon";
import { TwoTruthsForm } from "@/components/two-truths-form";
import { Button, Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const SHOWN = 5;

// The first few prompts in list order; Shuffle picks others. Two truths and
// a lie stays pinned at the top until it's answered.
const firstPicks = (offered: Prompt[], answered: Set<string>) => offered.filter((p) => !answered.has(p.id)).slice(0, SHOWN);
const pinned = (offered: Prompt[], answered: Set<string>) => offered.filter((p) => p.game && !answered.has(p.id));

// Fun questions instead of a blank "About me": answer up to 3. Each change
// saves straight away. "uni" decides which prompts and examples you see.
export function PromptsEditor({ initial, uni, twoTruths, onChanged }: { initial: PromptAnswer[]; uni: Uni | null; twoTruths: TwoTruthsOwn | null; onChanged: () => Promise<unknown> }) {
  const offered = promptsFor(uni);
  const [answers, setAnswers] = useState<PromptAnswer[]>(initial.filter((a) => promptById(a.prompt_id)));
  const [picks, setPicks] = useState<Prompt[]>(() => firstPicks(offered, new Set(initial.map((a) => a.prompt_id))));
  // "replacing": the retired prompt whose answer is moving to a new prompt.
  const [editing, setEditing] = useState<{ prompt: Prompt; text: string; replacing?: string } | null>(null);
  const [retiredPick, setRetiredPick] = useState<{ id: string; text: string } | null>(null);
  const [status, setStatus] = useState<{ saved?: boolean; error?: string }>({});
  const [pending, setPending] = useState(false);
  const answered = new Set(answers.map((a) => a.prompt_id));

  async function save(next: PromptAnswer[]) {
    const before = answers;
    setAnswers(next);
    setStatus({});
    setPending(true);
    const r = await saveProfilePrompts(supabase, next);
    setPending(false);
    if (r.error) {
      setAnswers(before);
      setStatus({ error: r.error });
    } else {
      setStatus({ saved: true });
      await onChanged();
    }
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
    void save(exists ? answers.map((a) => (a.prompt_id === target ? { prompt_id: editing.prompt.id, answer: text } : a)) : [...answers, { prompt_id: editing.prompt.id, answer: text }]);
    setPicks((p) => p.filter((x) => x.id !== editing.prompt.id));
    setEditing(null);
  }

  // Older answers could be up to 150 characters; don't cut them short when editing.
  const limit = Math.max(MAX_ANSWER, (editing?.prompt && answers.find((a) => a.prompt_id === (editing.replacing ?? editing.prompt.id))?.answer.length) || 0);

  return (
    <Card className="mt-6 gap-4" testID="prompts">
      <View className="flex-row items-baseline justify-between gap-3">
        <View className="flex-1">
          <T variant="display" className="text-xl">Prompts</T>
          <Muted className="text-sm">Answer up to 3. They show on your profile so people get a feel for you.</Muted>
        </View>
        <T variant="bold" className={`text-sm ${answers.length === MAX_PROMPTS ? "text-ok" : "text-muted"}`} testID="prompt-count">{answers.length}/{MAX_PROMPTS}</T>
      </View>
      <View className="flex-row gap-1.5">
        {Array.from({ length: MAX_PROMPTS }, (_, i) => (
          <View key={i} className={`h-1.5 flex-1 rounded-full ${i < answers.length ? "bg-brand" : "bg-line"}`} />
        ))}
      </View>

      {answers.length > 0 && (
        <View className="gap-2">
          {answers.map((a) => {
            const prompt = promptById(a.prompt_id)!;
            return (
              <View key={a.prompt_id} className="rounded-xl border border-line p-3" testID={`answer-${a.prompt_id}`}>
                <Muted className="text-xs font-sans-semibold">{prompt.text}</Muted>
                {prompt.game && twoTruths ? (
                  <View className="mt-1 gap-0.5">
                    {[twoTruths.s1, twoTruths.s2, twoTruths.s3].map((t, i) => (
                      <View key={i} className="flex-row flex-wrap items-center gap-1.5">
                        <T variant="semibold" className="text-sm">{t}</T>
                        {twoTruths.lie === i + 1 && (
                          <View className="rounded-full bg-danger/10 px-1.5 py-0.5">
                            <T variant="bold" className="text-[11px] text-danger">the lie</T>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <T variant="semibold" className="mt-0.5">{a.answer}</T>
                )}
                <View className="mt-2 flex-row gap-4">
                  <Pressable
                    onPress={() => {
                      // Retired prompts can't be edited in place: pick a new prompt for the answer.
                      if (prompt.retired) {
                        setEditing(null);
                        setRetiredPick({ id: a.prompt_id, text: a.answer });
                      } else setEditing({ prompt, text: a.answer });
                    }}
                    testID="edit-answer"
                  >
                    <T variant="semibold" className="text-sm text-brand">Edit</T>
                  </Pressable>
                  <Pressable onPress={() => void save(answers.filter((x) => x.prompt_id !== a.prompt_id))} disabled={pending} testID="remove-answer">
                    <T variant="semibold" className="text-sm text-muted">Remove</T>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {editing?.prompt.game ? (
        <View className="rounded-xl border-2 border-brand p-3">
          <T variant="semibold" className="mb-2">{editing.prompt.text}</T>
          <TwoTruthsForm
            initial={twoTruths}
            uni={uni}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              if (!answers.some((a) => a.prompt_id === editing.prompt.id)) setAnswers([...answers, { prompt_id: editing.prompt.id, answer: editing.prompt.text }]);
              setPicks((p) => p.filter((x) => x.id !== editing.prompt.id));
              setEditing(null);
              setStatus({ saved: true });
              void onChanged();
            }}
          />
        </View>
      ) : editing ? (
        <View className="rounded-xl border-2 border-brand p-3">
          <T variant="semibold">{editing.prompt.text}</T>
          <TextInput
            autoFocus
            multiline
            maxLength={limit}
            value={editing.text}
            onChangeText={(text) => setEditing({ ...editing, text })}
            placeholder={exampleFor(editing.prompt, uni)}
            placeholderTextColor="rgba(94, 93, 120, 0.7)"
            className="mt-2 min-h-20 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-sans text-base text-ink web:outline-none web:focus:border-brand"
            style={{ textAlignVertical: "top" }}
            testID="prompt-answer"
          />
          <View className="mt-2 flex-row items-center justify-between gap-3">
            <Muted className="text-xs">{editing.text.length}/{limit}</Muted>
            <View className="flex-row gap-2">
              <Button variant="ghost" className="py-2" onPress={() => setEditing(null)}>Cancel</Button>
              <Button className="py-2" onPress={finish} disabled={!editing.text.trim()} testID="save-answer">Save answer</Button>
            </View>
          </View>
        </View>
      ) : (
        (answers.length < MAX_PROMPTS || retiredPick) && (
          <View>
            {retiredPick && (
              <T className="mb-2 rounded-xl bg-brand-soft px-3 py-2 text-sm">
                That prompt isn&apos;t offered any more. Pick a new one for your answer (you can change the words too).{" "}
                <T variant="semibold" className="text-sm text-muted" onPress={() => setRetiredPick(null)}>Cancel</T>
              </T>
            )}
            <View className="mb-2 flex-row items-center justify-between">
              <T variant="bold" className="text-sm">Pick a prompt</T>
              <Pressable onPress={shuffle} className="flex-row items-center gap-1.5" testID="shuffle">
                <Icon name="shuffle" size={16} color="#DA291C" />
                <T variant="semibold" className="text-sm text-brand">Shuffle</T>
              </Pressable>
            </View>
            <View className="gap-2">
              {picks.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setEditing(retiredPick ? { prompt: p, text: retiredPick.text, replacing: retiredPick.id } : { prompt: p, text: "" });
                    setRetiredPick(null);
                  }}
                  className="flex-row items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3"
                  testID={`pick-${p.id}`}
                >
                  <T variant="semibold" className="flex-1">{p.text}</T>
                  {p.uni && (
                    <View className="rounded-full bg-brand-soft px-2 py-0.5">
                      <T variant="bold" className="text-[11px] text-brand">{p.uni}</T>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )
      )}

      {status.saved && !pending && <T variant="semibold" className="text-sm text-ok">Saved ✓</T>}
      {status.error && <T variant="semibold" className="text-sm text-danger">{status.error}</T>}
    </Card>
  );
}
