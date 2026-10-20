import { useLocalSearchParams, useRouter, Link } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_UNI, logSignupEvent, uniById, uniFromEmail } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { needsSecondFactor } from "@/lib/mfa";
import { needsAccountDetails } from "@/lib/profile";
import { arrivalUni, loginPending } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Log in with a code sent to your uni email (no passwords). The same two
// steps as the website: email, then the six-digit code. If the email has a
// link instead, it opens auth/callback.
export default function LoginScreen() {
  const router = useRouter();
  const { next: nextParam } = useLocalSearchParams<{ next?: string }>();
  const next = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/(tabs)/map";
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [example, setExample] = useState(`you@${uniById(DEFAULT_UNI)!.domains[0]}`);

  // Already logged in when you arrive: nothing to do here. (Not while a code
  // is being checked: verify() decides where to go next.)
  const verifying = useRef(false);
  useEffect(() => {
    if (session && !verifying.current) router.replace(next as never);
  }, [session, next, router]);

  // A code already on its way (e.g. the app reloaded while you checked your
  // email), and the email example for the uni page you arrived from.
  useEffect(() => {
    loginPending.get().then((saved) => {
      if (saved) {
        setEmail(saved);
        setStep("code");
      }
    });
    arrivalUni.get().then((id) => {
      const uni = uniById(id);
      if (uni) setExample(`you@${uni.domains[0]}`);
    });
  }, []);

  async function sendCode() {
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(address)) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        // Used when the email contains a login link rather than a code.
        emailRedirectTo: Platform.OS === "web" ? `${window.location.origin}/auth/callback` : Linking.createURL("auth/callback"),
      },
    });
    setBusy(false);
    if (error) {
      if (error.status === 429) return setError("Too many attempts. Wait a few minutes and try again.");
      // Other emails only work if the Function team has allowed them (Admin page).
      if (!uniFromEmail(address)) return setError("Function is for London university students. Use your uni email, or the email you were invited with.");
      return setError("We couldn't send the email. Please try again.");
    }
    setEmail(address);
    await loginPending.set(address);
    setStep("code");
  }

  async function verify() {
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) return setError("Enter the code from the email.");
    setBusy(true);
    setError(null);
    verifying.current = true;
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.user) {
      verifying.current = false;
      setBusy(false);
      return setError("That code didn't work. Check it, or send a new one.");
    }
    await arrive(data.user);
  }

  // Accounts with a password (set under Me → Password & security; the
  // app-review account uses one too). Most students just use a code.
  async function logInWithPassword() {
    const address = email.trim().toLowerCase();
    if (!address || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    verifying.current = true;
    const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
    if (error || !data.user) {
      verifying.current = false;
      setBusy(false);
      return setError("That email and password didn't match.");
    }
    await arrive(data.user);
  }

  // Logged in: a brand-new account gets one optional "pick a prompt" screen, then on to the app.
  async function arrive(user: { id: string; created_at: string }) {
    await loginPending.set(null);
    // Accounts with 2FA on give their code before anything else.
    if (await needsSecondFactor()) return router.replace({ pathname: "/mfa", params: { next } } as never);
    if (await needsAccountDetails(user.id)) {
      await logSignupEvent(supabase, "signup_finished");
      router.replace({ pathname: "/welcome", params: { next } });
    } else {
      router.replace(next as never);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="mx-auto w-full max-w-md px-4 py-10">
          <BackButton fallback="/" className="mb-6" />
          <Heading>Log in to Function</Heading>
          <Muted className="mb-8 mt-2">
            Use your London university email, or the email you were invited with. We&apos;ll email you a code.
          </Muted>
          <Card className="gap-4">
            {step === "email" ? (
              <>
                <View>
                  <Label>Email</Label>
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    placeholder={example}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    onSubmitEditing={sendCode}
                    testID="email"
                  />
                </View>
                {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
                <Button onPress={sendCode} disabled={busy} testID="send-code">{busy ? "Sending…" : "Email me a login code"}</Button>
                <View className="flex-row flex-wrap items-center gap-x-1" testID="agree">
                  <Muted className="text-xs">By continuing you agree to Function&apos;s</Muted>
                  <Link href="/terms" asChild><Pressable testID="agree-terms"><Muted className="text-xs underline">Terms of use</Muted></Pressable></Link>
                  <Muted className="text-xs">and</Muted>
                  <Link href="/privacy" asChild><Pressable testID="agree-privacy"><Muted className="text-xs underline">Privacy policy.</Muted></Pressable></Link>
                </View>
                <Pressable onPress={() => { setError(null); setStep("password"); }} className="self-start" testID="use-password">
                  <Muted className="text-xs">Have a password? Log in with it instead</Muted>
                </Pressable>
              </>
            ) : step === "password" ? (
              <>
                <View>
                  <Label>Email</Label>
                  <Input value={email} onChangeText={setEmail} placeholder={example} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" testID="email" />
                </View>
                <View>
                  <Label>Password</Label>
                  <Input value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoCapitalize="none" autoComplete="password" textContentType="password" onSubmitEditing={logInWithPassword} testID="password" />
                </View>
                {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
                <Button onPress={logInWithPassword} disabled={busy} testID="log-in-password">{busy ? "Checking…" : "Log in"}</Button>
                <Pressable onPress={() => { setError(null); setStep("email"); }} className="self-start">
                  <T variant="semibold" className="text-sm text-brand">Use a login code instead</T>
                </Pressable>
              </>
            ) : (
              <>
                <Muted>
                  We&apos;ve emailed a login code to <T variant="bold">{email}</T>. It can take a minute, so check your junk folder too.
                </Muted>
                <View>
                  <Label>Login code</Label>
                  <Input
                    value={code}
                    onChangeText={setCode}
                    placeholder="123456"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    className="text-center text-2xl tracking-[0.3em]"
                    onSubmitEditing={verify}
                    testID="code"
                  />
                </View>
                {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
                <Button onPress={verify} disabled={busy} testID="log-in">{busy ? "Checking…" : "Log in"}</Button>
                <View className="flex-row justify-between">
                  <Pressable onPress={sendCode} disabled={busy}>
                    <T variant="semibold" className="text-sm text-brand">{busy ? "Sending…" : "Send a new code"}</T>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      await loginPending.set(null);
                      setCode("");
                      setError(null);
                      setStep("email");
                    }}
                  >
                    <T variant="semibold" className="text-sm text-brand">Use a different email</T>
                  </Pressable>
                </View>
              </>
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
