import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  DEFAULT_UNI,
  exampleFor,
  formatEventTime,
  loadWelcome,
  logSignupEvent,
  MAX_ANSWER,
  MAX_PROMPTS,
  otherUnisText,
  promptsFor,
  UNIVERSITIES,
  uniById,
  uniFromEmail,
  type Prompt,
  type SignupEvent,
} from "@function/shared";
import { Avatar } from "@/components/avatar";
import { TwoTruthsForm } from "@/components/two-truths-form";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { useInvalidateProfile, useProfile } from "@/lib/profile";
import { welcomed } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

// Straight after signing up: a hello from your uni, its societies, what's
// coming up, and one optional prompt so people have something to say hi
// about. "Skip for now" is as easy to hit as "Continue"; the answer saves as
// you type, so nothing is lost if you leave.
export default function WelcomeScreen() {
  const router = useRouter();
  const { next: nextParam } = useLocalSearchParams<{ next?: string }>();
  const next = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/(tabs)/map";
  const { profile } = useProfile();
  const invalidateProfile = useInvalidateProfile();
  const uni = uniById(profile?.university) ?? uniById(DEFAULT_UNI)!;

  const { data } = useQuery({ queryKey: ["welcome", uni.id], queryFn: () => loadWelcome(supabase, uni.id), enabled: !!profile });

  // Two truths and a lie takes the most effort, so it's further down the list.
  const offered = promptsFor(uni.id);
  const prompts: Prompt[] = [...offered.filter((p) => !p.game).slice(0, 6), ...offered.filter((p) => p.game), ...offered.filter((p) => !p.game).slice(6)];

  const [chosen, setChosen] = useState<Prompt | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const saveGame = useRef<() => Promise<boolean>>(async () => false);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const game = Boolean(chosen?.game);

  useEffect(() => {
    if (profile) void logSignupEvent(supabase, "prompts_step_reached");
  }, [profile]);

  // Saves the one answer, replacing the prompt picked before if you switched.
  async function savePrompt(promptId: string, answer: string, previous: string | null) {
    const clean = answer.trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER);
    if (!clean) return null;
    const { data } = await supabase.from("profile_prompts").select("prompt_id, answer").order("position");
    const others = ((data ?? []) as { prompt_id: string; answer: string }[]).filter((a) => a.prompt_id !== promptId && a.prompt_id !== previous);
    const { error } = await supabase.rpc("save_profile_prompts", { answers: [{ prompt_id: promptId, answer: clean }, ...others].slice(0, MAX_PROMPTS) });
    return error ? "Couldn't save. Your answer is kept on this screen; try again." : null;
  }

  // Save a moment after typing stops.
  useEffect(() => {
    if (!chosen || chosen.game || !text.trim()) return;
    const timer = setTimeout(() => {
      const previous = saved !== chosen.id ? saved : null;
      saving.current = savePrompt(chosen.id, text, previous).then((err) => {
        setError(err);
        if (!err) setSaved(chosen.id);
      });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, text]);

  async function leave(event: Extract<SignupEvent, "prompts_skipped" | "prompts_completed">) {
    setLeaving(true);
    if (event === "prompts_completed" && game) {
      if (!(await saveGame.current())) return setLeaving(false);
    } else if (event === "prompts_completed" && chosen && text.trim()) {
      await saving.current;
      const err = await savePrompt(chosen.id, text, saved !== chosen.id ? saved : null);
      if (err) {
        setError(err);
        return setLeaving(false);
      }
    }
    await welcomed.set();
    await logSignupEvent(supabase, event);
    router.replace(next as never);
  }

  async function pickUni(id: string) {
    await supabase.from("profiles").update({ university: id }).eq("id", profile!.id);
    invalidateProfile();
  }

  if (!profile) return <View className="flex-1 bg-bg" />;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="mx-auto w-full max-w-md px-4 pb-32 pt-8">
        <Heading>
          Welcome to Function at <T variant="display" className="text-3xl" style={{ color: uni.accent }}>{uni.short}</T>!
        </Heading>

        {/* Invited with a non-uni email: they say which uni they're at. */}
        {!uniFromEmail(profile.email) && (
          <View className="mt-3">
            <T variant="semibold" className="text-sm text-muted">Which uni are you at?</T>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {UNIVERSITIES.map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => pickUni(u.id)}
                  className={`rounded-full border px-3.5 py-1.5 ${uni.id === u.id ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}
                  testID={`uni-${u.id}`}
                >
                  <T variant="semibold" className={`text-sm ${uni.id === u.id ? "text-brand" : ""}`}>{u.short}</T>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {data && data.counts.length > 0 && <T variant="semibold" className="mt-2">{data.counts.join(" and ")} at {uni.short}.</T>}
        {data && data.societies.length > 0 && (
          <View className="mt-4">
            <T variant="semibold">Find your societies at {uni.short}</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mt-2" contentContainerClassName="gap-2 px-4">
              {data.societies.map((s) => (
                <Link key={s.id} href={`/s/${s.slug}` as never} asChild>
                  <Pressable className="flex-row items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3.5">
                    <Avatar name={s.name} url={s.logo_url} size={26} />
                    <T variant="semibold" className="text-sm">{s.name}</T>
                  </Pressable>
                </Link>
              ))}
              <Link href={"/(tabs)/societies" as never} asChild>
                <Pressable className="justify-center px-3">
                  <T variant="semibold" className="text-sm text-brand">See all →</T>
                </Pressable>
              </Link>
            </ScrollView>
          </View>
        )}
        <Muted className="mt-3 text-sm">Plus open socials across {otherUnisText(uni.id)}.</Muted>
        <T className="mt-6 text-lg">Pick one prompt so people have something to say hi about.</T>
        <Muted className="mt-1 text-sm">Optional. You can add more later (up to {MAX_PROMPTS}).</Muted>

        {game && (
          <Card className="mt-5 gap-2">
            <T variant="semibold">{chosen!.text}</T>
            <TwoTruthsForm
              key={chosen!.id}
              initial={null}
              uni={uni.id}
              autoSave
              placeFirst
              onReady={(ready, save) => {
                setGameReady(ready);
                saveGame.current = save;
              }}
            />
          </Card>
        )}
        {!game && (
          <Card className="mt-5 gap-2">
            <T variant="semibold" className={chosen ? "" : "text-muted"}>{chosen ? chosen.text : "Tap a prompt below, then answer here"}</T>
            <Input
              value={text}
              onChangeText={setText}
              multiline
              maxLength={MAX_ANSWER}
              placeholder={chosen ? exampleFor(chosen, uni.id) : "Your answer"}
              editable={!!chosen}
              className="min-h-16"
              testID="welcome-answer"
            />
            <View className="flex-row items-center justify-between">
              <Muted className="text-xs">{saved === chosen?.id && text.trim() ? "Saved ✓" : " "}</Muted>
              <Muted className="text-xs">{text.length}/{MAX_ANSWER}</Muted>
            </View>
            {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
          </Card>
        )}

        <View className="mt-5 gap-2">
          {prompts.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setChosen(p)}
              className={`flex-row items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${chosen?.id === p.id ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}
              testID={`prompt-${p.id}`}
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

        {data && data.upcoming.length > 0 && (
          <View className="mt-8">
            <T variant="display" className="text-xl">Coming up</T>
            <View className="mt-3 gap-2">
              {data.upcoming.map((e) => (
                <Link key={e.href} href={e.href as never} asChild>
                  <Pressable>
                    <Card className="py-3">
                      <T variant="bold" numberOfLines={1}>{e.title}</T>
                      <Muted className="text-sm" numberOfLines={1}>{formatEventTime(e.starts_at, e.ends_at)} · {e.by}</Muted>
                    </Card>
                  </Pressable>
                </Link>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Both choices always in reach, equally easy to tap. */}
      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 py-3">
        <View className="mx-auto w-full max-w-md flex-row gap-3">
          <Button variant="ghost" className="flex-1 py-3" disabled={leaving} onPress={() => leave("prompts_skipped")} testID="skip">Skip for now</Button>
          <Button className="flex-1 py-3" disabled={leaving || !chosen || (game ? !gameReady : !text.trim())} onPress={() => leave("prompts_completed")} testID="continue">Continue</Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
