import type { Factor } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { mfaErrorText, verifiedFactors } from "@/lib/mfa";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The second step of logging in for accounts with 2FA on: the code from
// the authenticator app, or the one texted to the phone.
export default function MfaScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { next: nextParam } = useLocalSearchParams<{ next?: string }>();
  const next = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/(tabs)/map";
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    verifiedFactors().then((list) => {
      setFactors(list);
      setFactor(list.find((f) => f.factor_type === "totp") ?? list[0] ?? null);
    });
  }, [session]);

  // A text-message factor needs a code sent first.
  useEffect(() => {
    if (!factor || factor.factor_type !== "phone") return;
    supabase.auth.mfa.challenge({ factorId: factor.id }).then(({ data, error }) => {
      if (error) setError(mfaErrorText(error.message));
      else setChallengeId(data.id);
    });
  }, [factor]);

  async function verify() {
    if (!factor) return;
    const token = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    const { error } = factor.factor_type === "phone" && challengeId ? await supabase.auth.mfa.verify({ factorId: factor.id, challengeId, code: token }) : await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: token });
    setBusy(false);
    if (error) return setError(mfaErrorText(error.message));
    router.replace(next as never);
  }

  async function logOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (!session) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="mx-auto w-full max-w-md px-4 py-16">
          <Heading>Log in first</Heading>
          <Button className="mt-4 self-start" onPress={() => router.replace("/login")}>Log in</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="mx-auto w-full max-w-md px-4 py-16">
          <Heading>Two-factor check</Heading>
          <Muted className="mb-8 mt-2">{factor?.factor_type === "phone" ? "We've texted a code to your phone." : "Enter the code from your authenticator app."}</Muted>
          <Card className="gap-4">
            {factors && factors.length === 0 && <Muted>No 2FA method is set up on this account.</Muted>}
            <View>
              <Label>Code</Label>
              <Input value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" className="text-center text-2xl tracking-[0.3em]" onSubmitEditing={verify} testID="mfa-code" />
            </View>
            {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
            <Button onPress={() => void verify()} disabled={busy || !factor} testID="mfa-verify">{busy ? "Checking…" : "Continue"}</Button>
            {factors && factors.length > 1 && (
              <View className="flex-row flex-wrap gap-3">
                {factors.map((f) => (
                  <Pressable key={f.id} onPress={() => { setFactor(f); setChallengeId(null); setError(null); }}>
                    <T variant="semibold" className={`text-sm ${factor?.id === f.id ? "text-brand" : "text-muted"}`}>{f.factor_type === "phone" ? "Text message" : "Authenticator app"}</T>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable onPress={() => void logOut()} className="self-start">
              <T variant="semibold" className="text-sm text-muted">Log out instead</T>
            </Pressable>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
