import type { Factor } from "@supabase/supabase-js";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackButton } from "@/components/back-button";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { mfaErrorText, verifiedFactors } from "@/lib/mfa";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Account settings, security tab: a password (so you can log in without
// waiting for a code) and two-factor authentication (2FA) with an
// authenticator app or a text message to your phone.
export default function SecurityScreen() {
  const { session } = useSession();
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback="/(tabs)/me" className="mb-4" />
        <Heading>Account settings</Heading>
        <AccountTabs current="security" />
        {!session ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to manage your account.</T>
            <Link href={{ pathname: "/login", params: { next: "/account/security" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : (
          <>
            <PasswordCard />
            <TwoFactorCard />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Profile | Security, at the top of both account pages.
export function AccountTabs({ current }: { current: "profile" | "security" }) {
  return (
    <View className="mt-4 flex-row rounded-2xl border border-line bg-surface p-1">
      {([["profile", "Edit profile", "/account"], ["security", "Password & security", "/account/security"]] as const).map(([key, label, href]) => (
        <Link key={key} href={href as never} replace asChild>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: current === key }} className={`flex-1 items-center rounded-xl py-2.5 ${current === key ? "bg-brand" : ""}`} testID={`account-tab-${key}`}>
            <T variant="bold" className={`text-sm ${current === key ? "text-brand-ink" : "text-muted"}`}>{label}</T>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

function PasswordCard() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<{ saved?: boolean; error?: string }>({});
  const [pending, setPending] = useState(false);
  async function save() {
    if (password.length < 8) return setState({ error: "Use at least 8 characters." });
    if (password !== again) return setState({ error: "The two passwords don't match." });
    setPending(true);
    setState({});
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) return setState({ error: error.message.includes("same") ? "That's already your password." : "Couldn't save the password. Please try again." });
    setPassword("");
    setAgain("");
    setState({ saved: true });
  }
  return (
    <Card className="mt-6 gap-4">
      <View>
        <T variant="display-bold" className="text-lg">Password</T>
        <Muted className="text-sm">Optional. You can always log in with a code emailed to you; a password lets you skip the wait.</Muted>
      </View>
      <View>
        <Label>New password</Label>
        <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" testID="new-password" />
      </View>
      <View>
        <Label>Type it again</Label>
        <Input value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="Same again" testID="new-password-again" />
      </View>
      <View className="flex-row items-center gap-3">
        <Button onPress={() => void save()} disabled={pending} testID="save-password">{pending ? "Saving…" : "Save password"}</Button>
        {state.saved && <T variant="semibold" className="text-sm text-ok">Saved ✓</T>}
        {state.error && <T variant="semibold" className="text-sm text-danger">{state.error}</T>}
      </View>
    </Card>
  );
}

type Enrolling = { kind: "totp"; id: string; qr: string; secret: string } | { kind: "phone"; id: string; challengeId: string | null; phone: string };

function TwoFactorCard() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => verifiedFactors().then(setFactors);
  useEffect(() => {
    void refresh();
  }, []);

  async function startApp() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
    setBusy(false);
    if (error || !data) return setError(mfaErrorText(error?.message));
    setEnrolling({ kind: "totp", id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function startPhone() {
    const clean = phone.replace(/[\s-]/g, "");
    if (!/^\+\d{8,15}$/.test(clean)) return setError("Enter your number with the country code, e.g. +44 7700 900123.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "phone", phone: clean, friendlyName: "Text message" });
    if (error || !data) {
      setBusy(false);
      return setError(mfaErrorText(error?.message));
    }
    // Sends the first text.
    const challenge = await supabase.auth.mfa.challenge({ factorId: data.id });
    setBusy(false);
    if (challenge.error) return setError(mfaErrorText(challenge.error.message));
    setEnrolling({ kind: "phone", id: data.id, challengeId: challenge.data.id, phone: clean });
  }

  async function confirm() {
    if (!enrolling) return;
    const token = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    const { error } = enrolling.kind === "phone" && enrolling.challengeId ? await supabase.auth.mfa.verify({ factorId: enrolling.id, challengeId: enrolling.challengeId, code: token }) : await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: token });
    setBusy(false);
    if (error) return setError(mfaErrorText(error.message));
    setEnrolling(null);
    setCode("");
    await refresh();
  }

  async function cancelEnrol() {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.id });
    setEnrolling(null);
    setCode("");
    setError(null);
  }

  function remove(f: Factor) {
    const go = async () => {
      setBusy(true);
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      setBusy(false);
      if (error) return setError(mfaErrorText(error.message));
      await refresh();
    };
    const warning = "Turn off this 2FA method? Logging in will only need your email code or password.";
    if (Platform.OS === "web") {
      if (window.confirm(warning)) void go();
      return;
    }
    Alert.alert("Turn off 2FA?", warning, [{ text: "Cancel", style: "cancel" }, { text: "Turn off", style: "destructive", onPress: () => void go() }]);
  }

  return (
    <Card className="mt-6 gap-4" testID="two-factor">
      <View>
        <T variant="display-bold" className="text-lg">Two-factor authentication</T>
        <Muted className="text-sm">Optional. When it&apos;s on, logging in also asks for a code from an authenticator app or a text to your phone.</Muted>
      </View>

      {factors && factors.length > 0 && (
        <View className="gap-2">
          {factors.map((f) => (
            <View key={f.id} className="flex-row items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3" testID={`factor-${f.factor_type}`}>
              <View className="flex-1">
                <T variant="semibold">{f.factor_type === "phone" ? "Text message" : "Authenticator app"}</T>
                <Muted className="text-sm">{f.factor_type === "phone" ? ((f as Factor & { phone?: string }).phone ?? "") : "Codes from your app"} · on</Muted>
              </View>
              <Pressable onPress={() => remove(f)} disabled={busy}>
                <T variant="semibold" className="text-sm text-danger">Turn off</T>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {enrolling ? (
        <View className="gap-3 rounded-xl border border-line bg-bg p-3.5">
          {enrolling.kind === "totp" ? (
            <>
              <T variant="semibold">1. Scan this with your authenticator app (Google Authenticator, 1Password, Authy…)</T>
              <View className="items-center">
                <Image source={{ uri: enrolling.qr }} style={{ width: 180, height: 180, backgroundColor: "#fff", borderRadius: 12 }} contentFit="contain" />
              </View>
              <Muted className="text-xs">Or type this key into the app:</Muted>
              <Pressable onPress={() => void Clipboard.setStringAsync(enrolling.secret)} className="rounded-lg border border-line bg-surface px-3 py-2">
                <T variant="bold" className="text-xs" selectable>{enrolling.secret}</T>
              </Pressable>
              <T variant="semibold">2. Enter the 6-digit code it shows</T>
            </>
          ) : (
            <T variant="semibold">Enter the code we texted to {enrolling.phone}</T>
          )}
          <Input value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" autoComplete="one-time-code" className="text-center text-2xl tracking-[0.3em]" testID="factor-code" />
          <View className="flex-row gap-3">
            <Button onPress={() => void confirm()} disabled={busy} testID="factor-confirm">{busy ? "Checking…" : "Turn on"}</Button>
            <Button variant="ghost" onPress={() => void cancelEnrol()} disabled={busy}>Cancel</Button>
          </View>
        </View>
      ) : (
        <View className="gap-3">
          <Button variant="ghost" className="self-start" onPress={() => void startApp()} disabled={busy} testID="add-totp">+ Authenticator app</Button>
          <View>
            <Label>Or a text message to your phone</Label>
            <View className="flex-row gap-2">
              <Input value={phone} onChangeText={setPhone} placeholder="+44 7700 900123" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" className="flex-1" testID="phone" />
              <Button variant="ghost" onPress={() => void startPhone()} disabled={busy} testID="add-phone">Send code</Button>
            </View>
          </View>
        </View>
      )}
      {error && <T variant="semibold" className="text-sm text-danger" testID="mfa-error">{error}</T>}
    </Card>
  );
}
