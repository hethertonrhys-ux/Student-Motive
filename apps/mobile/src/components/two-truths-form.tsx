import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { exampleFor, promptById, TWO_TRUTHS_HELP, TWO_TRUTHS_ID, TWO_TRUTHS_MAX, type TwoTruthsOwn, type Uni } from "@function/shared";
import { Button, Input, Label, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// Write three statements and mark which one is the lie. Used on the
// welcome step (saves by itself once all three are filled in and a lie is
// picked) and in the profile editor (with a Save button).
export function TwoTruthsForm({
  initial,
  uni,
  autoSave = false,
  placeFirst = false,
  onSaved,
  onCancel,
  onReady,
}: {
  initial: TwoTruthsOwn | null;
  uni: Uni | null;
  autoSave?: boolean;
  placeFirst?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  // Tells the welcome step whether it's complete (so Continue can turn on).
  onReady?: (ready: boolean, save: () => Promise<boolean>) => void;
}) {
  const prompt = promptById(TWO_TRUTHS_ID)!;
  const examples = exampleFor(prompt, uni).split(" · ");
  const [s, setS] = useState<[string, string, string]>(initial ? [initial.s1, initial.s2, initial.s3] : ["", "", ""]);
  const [lie, setLie] = useState<number | null>(initial?.lie ?? null);
  const [status, setStatus] = useState<{ saved?: boolean; error?: string }>({});
  const [pending, setPending] = useState(false);
  const ready = s.every((t) => t.trim()) && lie !== null;
  const changed = !initial || s[0] !== initial.s1 || s[1] !== initial.s2 || s[2] !== initial.s3 || lie !== initial.lie;
  const latest = useRef({ s, lie, ready });
  latest.current = { s, lie, ready };

  async function save(): Promise<boolean> {
    const { s, lie, ready } = latest.current;
    if (!ready) return false;
    const { error } = await supabase.rpc("save_two_truths", { one_text: s[0].trim(), two_text: s[1].trim(), three_text: s[2].trim(), lie_is: lie });
    if (!error && placeFirst) {
      // Pin the game to the top of the prompts list, keeping any other answers.
      const { data } = await supabase.from("profile_prompts").select("prompt_id, answer").order("position");
      const others = ((data ?? []) as { prompt_id: string; answer: string }[]).filter((a) => a.prompt_id !== TWO_TRUTHS_ID);
      await supabase.rpc("save_profile_prompts", { answers: [{ prompt_id: TWO_TRUTHS_ID, answer: "Two truths and a lie" }, ...others].slice(0, 3) });
    }
    setStatus(error ? { error: "Couldn't save. Please try again." } : { saved: true });
    return !error;
  }

  useEffect(() => {
    onReady?.(ready, save);
    if (!autoSave || !ready) return;
    const timer = setTimeout(() => void save(), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, lie, ready]);

  return (
    <View className="gap-3">
      {initial && changed && (
        <View className="rounded-xl bg-brand-soft px-3 py-2">
          <T className="text-xs">Changing these resets everyone&apos;s guesses.</T>
        </View>
      )}
      {[0, 1, 2].map((i) => (
        <View key={i}>
          <Label className="text-muted">{TWO_TRUTHS_HELP[i]}</Label>
          <Input
            value={s[i]}
            maxLength={TWO_TRUTHS_MAX}
            onChangeText={(text) => setS((cur) => cur.map((t, j) => (j === i ? text : t)) as [string, string, string])}
            placeholder={examples[i] ?? ""}
            autoFocus={i === 0 && autoSave}
            testID={`truth-${i}`}
          />
          <View className="mt-1 flex-row items-center justify-between">
            <Pressable onPress={() => setLie(i + 1)} className="flex-row items-center gap-1.5" testID={`lie-${i}`}>
              <View className={`size-4 items-center justify-center rounded-full border-2 ${lie === i + 1 ? "border-danger" : "border-muted"}`}>
                {lie === i + 1 && <View className="size-2 rounded-full bg-danger" />}
              </View>
              <T variant="semibold" className={`text-sm ${lie === i + 1 ? "text-danger" : "text-muted"}`}>This one&apos;s the lie</T>
            </Pressable>
            <Muted className="text-xs">{s[i].length}/{TWO_TRUTHS_MAX}</Muted>
          </View>
        </View>
      ))}
      {!autoSave && (
        <View className="flex-row justify-end gap-2">
          {onCancel && <Button variant="ghost" onPress={onCancel}>Cancel</Button>}
          <Button
            disabled={!ready || pending}
            onPress={async () => {
              setPending(true);
              if (await save()) onSaved?.();
              setPending(false);
            }}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </View>
      )}
      {!ready && <Muted className="text-xs">Fill in all three and tick which one is the lie.</Muted>}
      {autoSave && status.saved && ready && <Muted className="text-xs">Saved ✓</Muted>}
      {status.error && <T variant="semibold" className="text-sm text-danger">{status.error}</T>}
    </View>
  );
}
