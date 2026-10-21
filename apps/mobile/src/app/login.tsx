import type { AuthError, User } from "@supabase/supabase-js";
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
import { SUPPORT_EMAIL } from "@/lib/site";
import { useSession } from "@/providers/session";

type Mode = "login" | "signup";
type Step = "form" | "code" | "password";

// A code is only good for an hour, so an account made less than an hour
// before its code was checked was made by that code: it's a new sign-up.
const NEW_ACCOUNT_MS = 60 * 60 * 1000;

const isEmail = (address: string) => /^[^@\s]+@[^@\s]+$/.test(address);

// Log in or sign up, with two tabs at the top.
// - Log in: email and password. "Forgot password?" and "Log in with a code
//   instead" email a one-time code (only to an existing account), for anyone
//   who forgot their password or made their account before passwords existed.
// - Sign up: your uni email, then the six-digit code emailed to you.
// After any code, you choose a password for next time: a new account has to,
// an existing one can skip it. If the email has a link instead of a code, it
// opens auth/callback. Passwords are kept by Supabase Auth, never by us.
export default function LoginScreen() {
  const router = useRouter();
  const { next: nextParam, mode: modeParam } = useLocalSearchParams<{ next?: string; mode?: string }>();
  const next = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/(tabs)/map";
  const { session } = useSession();
  const [mode, setMode] = useState<Mode>(modeParam === "signup" ? "signup" : "login");
  const [step, setStep] = useState<Step>("form");
  // Which tab sent the code being typed in.
  const [codeFor, setCodeFor] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The error came from a log-in code sent to an email with no account: offer Sign up.
  const [noAccount, setNoAccount] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [example, setExample] = useState(`you@${uniById(DEFAULT_UNI)!.domains[0]}`);
  // Set once a code has logged you in, for the password step.
  const [user, setUser] = useState<User | null>(null);
  const [newAccount, setNewAccount] = useState(false);

  // Already logged in when you arrive: nothing to do here. (Not once you've
  // started logging in here: the steps decide where to go next.)
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

  function showError(message: string | null, missingAccount = false) {
    setError(message);
    setNoAccount(missingAccount);
  }

  function switchMode(to: Mode) {
    setMode(to);
    setPassword("");
    setNotice(null);
    showError(null);
  }

  // Emails a one-time code. From Sign up it can make a new account; from Log
  // in it only goes to an existing one.
  async function sendCode(forMode: Mode) {
    const address = email.trim().toLowerCase();
    if (!address) return showError("Enter your email first.");
    if (!isEmail(address)) return showError("Enter a valid email address.");
    setBusy(true);
    showError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: forMode === "signup",
        // Used when the email contains a login link rather than a code.
        emailRedirectTo: Platform.OS === "web" ? `${window.location.origin}/auth/callback` : Linking.createURL("auth/callback"),
      },
    });
    setBusy(false);
    if (error) return showError(...codeErrorText(error, address, forMode));
    setEmail(address);
    setCode("");
    setCodeFor(forMode);
    await loginPending.set(address);
    setStep("code");
  }

  async function verify() {
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) return showError("Enter the code from the email.");
    setBusy(true);
    showError(null);
    verifying.current = true;
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.user) {
      verifying.current = false;
      setBusy(false);
      // Supabase says "expired" for a mistyped code too, so this covers both.
      if (error?.code === "user_banned") return showError(SUSPENDED);
      return showError("That code didn't work or has expired. Check it, or send a new one.");
    }
    await loginPending.set(null);
    // Accounts with 2FA on give their code before anything else (and can
    // change their password afterwards, under Password & security).
    if (await needsSecondFactor()) return router.replace({ pathname: "/mfa", params: { next } } as never);
    const created = new Date(data.user.created_at).getTime();
    const isNew = Date.now() - created < NEW_ACCOUNT_MS;
    setNotice(codeFor === "signup" && !isNew ? "You already have an account with this email, so we've logged you in." : null);
    setUser(data.user);
    setNewAccount(isNew);
    setPassword("");
    setAgain("");
    setBusy(false);
    setStep("password");
  }

  async function logInWithPassword() {
    const address = email.trim().toLowerCase();
    if (!address || !password) return showError("Enter your email and password.");
    if (!isEmail(address)) return showError("Enter a valid email address.");
    setBusy(true);
    showError(null);
    verifying.current = true;
    const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
    if (error || !data.user) {
      verifying.current = false;
      setBusy(false);
      setEmail(address);
      return showError(passwordErrorText(error));
    }
    await arrive(data.user);
  }

  // After a code: save the password for next time (or skip, for an account
  // that already existed), then into the app.
  async function savePassword() {
    if (!user) return;
    if (password.length < 8) return showError("Use at least 8 characters.");
    if (password !== again) return showError("The two passwords don't match.");
    setBusy(true);
    showError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error && error.code !== "same_password") {
      setBusy(false);
      return showError(error.code === "weak_password" ? "That password is too easy to guess. Try a longer one, with a mix of letters and numbers." : "Couldn't save the password. Please try again.");
    }
    await arrive(user);
  }

  // Logged in: a brand-new account gets the account-details screen first, then on to the app.
  async function arrive(who: Pick<User, "id">) {
    setBusy(true);
    await loginPending.set(null);
    // Accounts with 2FA on give their code before anything else.
    if (await needsSecondFactor()) return router.replace({ pathname: "/mfa", params: { next } } as never);
    if (await needsAccountDetails(who.id)) {
      await logSignupEvent(supabase, "signup_finished");
      router.replace({ pathname: "/welcome", params: { next } });
    } else {
      router.replace(next as never);
    }
  }

  const errorLine = error && (
    <View className="gap-1">
      <T variant="semibold" className="text-sm text-danger" testID="login-error">{error}</T>
      {noAccount && (
        <Pressable onPress={() => switchMode("signup")} className="self-start py-1" testID="go-signup">
          <T variant="semibold" className="text-sm text-brand">Sign up instead</T>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="mx-auto w-full max-w-md px-4 py-10">
          <BackButton fallback="/" className="mb-6" />
          {step === "form" ? (
            <>
              <Heading>{mode === "signup" ? "Join Function" : "Log in to Function"}</Heading>
              <ModeTabs mode={mode} onChange={switchMode} />
              <Muted className="mb-6 mt-4">
                {mode === "signup"
                  ? "Sign up with your London university email, or the email you were invited with. We'll email you a code to check it's yours."
                  : "Log in with your email and password."}
              </Muted>
              <Card className="gap-4">
                {mode === "login" ? (
                  <>
                    <EmailField mode={mode} value={email} onChange={setEmail} placeholder={example} onSubmit={logInWithPassword} />
                    <View>
                      <View className="flex-row items-end justify-between">
                        <Label>Password</Label>
                        <Pressable onPress={() => void sendCode("login")} disabled={busy} hitSlop={8} className="mb-1.5" testID="forgot-password">
                          <T variant="semibold" className="text-sm text-brand">Forgot password?</T>
                        </Pressable>
                      </View>
                      <Input value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" onSubmitEditing={logInWithPassword} testID="password" />
                    </View>
                    {errorLine}
                    <Button onPress={logInWithPassword} disabled={busy} testID="log-in-password">{busy ? "Checking…" : "Log in"}</Button>
                    <View className="items-center gap-1 border-t border-line pt-4">
                      <Muted className="text-center text-sm">No password yet, or forgotten it?</Muted>
                      <Button variant="ghost" className="self-stretch" onPress={() => void sendCode("login")} disabled={busy} testID="use-code">Log in with a code instead</Button>
                    </View>
                  </>
                ) : (
                  <>
                    <EmailField mode={mode} value={email} onChange={setEmail} placeholder={example} onSubmit={() => void sendCode("signup")} />
                    {errorLine}
                    <Button onPress={() => void sendCode("signup")} disabled={busy} testID="send-code">{busy ? "Sending…" : "Email me a code"}</Button>
                    <View className="flex-row flex-wrap items-center gap-x-1" testID="agree">
                      <Muted className="text-xs">By signing up you agree to Function&apos;s</Muted>
                      <Link href="/terms" asChild><Pressable testID="agree-terms"><Muted className="text-xs underline">Terms of use</Muted></Pressable></Link>
                      <Muted className="text-xs">and</Muted>
                      <Link href="/privacy" asChild><Pressable testID="agree-privacy"><Muted className="text-xs underline">Privacy policy.</Muted></Pressable></Link>
                      <Muted className="text-xs">Abusive or objectionable content isn&apos;t tolerated.</Muted>
                    </View>
                  </>
                )}
              </Card>
            </>
          ) : step === "code" ? (
            <>
              <Heading>Check your email</Heading>
              <Muted className="mb-6 mt-2">
                We&apos;ve emailed a code to <T variant="bold">{email}</T>. It can take a minute, so check your junk folder too.
              </Muted>
              <Card className="gap-4">
                <View>
                  <Label>Code</Label>
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
                {errorLine}
                <Button onPress={verify} disabled={busy} testID="log-in">{busy ? "Checking…" : "Continue"}</Button>
                <View className="flex-row justify-between">
                  <Pressable onPress={() => void sendCode(codeFor)} disabled={busy} hitSlop={8} testID="resend-code">
                    <T variant="semibold" className="text-sm text-brand">{busy ? "Sending…" : "Send a new code"}</T>
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    onPress={async () => {
                      await loginPending.set(null);
                      setCode("");
                      showError(null);
                      setStep("form");
                    }}
                    testID="different-email"
                  >
                    <T variant="semibold" className="text-sm text-brand">Use a different email</T>
                  </Pressable>
                </View>
              </Card>
            </>
          ) : (
            <>
              <Heading>{newAccount ? "Choose a password" : "Set a password"}</Heading>
              <Muted className="mb-6 mt-2">
                {newAccount ? "You'll use it with your email to log in next time." : "So next time you can log in with your email and password, without waiting for a code."}
              </Muted>
              {notice && (
                <Card className="mb-4" testID="login-notice">
                  <T variant="semibold" className="text-sm">{notice}</T>
                </Card>
              )}
              <Card className="gap-4">
                {/* Lets password managers save the email with the new password. */}
                <View>
                  <Label>Email</Label>
                  <Input value={email} editable={false} autoComplete="email" textContentType="username" className="text-muted" accessibilityLabel="Email" />
                </View>
                <View>
                  <Label>New password</Label>
                  <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" testID="new-password" />
                </View>
                <View>
                  <Label>Type it again</Label>
                  <Input value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="Same again" onSubmitEditing={savePassword} testID="new-password-again" />
                </View>
                {errorLine}
                <Button onPress={() => void savePassword()} disabled={busy} testID="save-password">{busy ? "Saving…" : "Save password"}</Button>
                {!newAccount && user && (
                  <Button variant="ghost" onPress={() => void arrive(user)} disabled={busy} testID="skip-password">Skip for now</Button>
                )}
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// "Log in | Sign up", the same tab style as the admin and account pages.
function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <View className="mt-4 flex-row rounded-2xl border border-line bg-surface p-1" accessibilityRole="tablist">
      {([["login", "Log in"], ["signup", "Sign up"]] as const).map(([key, label]) => (
        <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="tab" accessibilityState={{ selected: mode === key }} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${mode === key ? "bg-brand" : ""}`} testID={`mode-${key}`}>
          <T variant="bold" className={`text-sm ${mode === key ? "text-brand-ink" : "text-muted"}`}>{label}</T>
        </Pressable>
      ))}
    </View>
  );
}

function EmailField({ mode, value, onChange, placeholder, onSubmit }: { mode: Mode; value: string; onChange: (value: string) => void; placeholder: string; onSubmit: () => void }) {
  return (
    <View>
      <Label>{mode === "signup" ? "University email" : "Email"}</Label>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType={mode === "signup" ? "emailAddress" : "username"}
        onSubmitEditing={onSubmit}
        testID="email"
      />
    </View>
  );
}

// What went wrong sending a code, and whether it was "no account with that email".
function codeErrorText(error: AuthError, address: string, mode: Mode): [string, boolean] {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return ["Too many attempts. Wait a few minutes and try again.", false];
  // A log-in code only goes to an account that exists.
  if (mode === "login" && (error.code === "otp_disabled" || error.code === "user_not_found" || /signups? not allowed/i.test(error.message))) {
    return ["There's no account with that email yet.", true];
  }
  // Other emails only work if the Function team has allowed them (Admin page).
  if (!uniFromEmail(address)) return ["Function is for London university students. Use your uni email, or the email you were invited with.", false];
  return ["We couldn't send the email. Please try again.", false];
}

// The Function team has suspended or banned the account (Admin → Users).
const SUSPENDED = `This account has been suspended. If you think it's a mistake, email ${SUPPORT_EMAIL}.`;

function passwordErrorText(error: AuthError | null) {
  if (error?.code === "user_banned") return SUSPENDED;
  if (error?.status === 429 || error?.code === "over_request_rate_limit") return "Too many attempts. Wait a few minutes and try again.";
  if (error?.code === "email_not_confirmed") return "That email isn't verified yet. Tap \"Log in with a code instead\" to verify it.";
  if (error?.code === "invalid_credentials" || error?.status === 400) return "Wrong email or password. If you've never set a password, log in with a code instead.";
  return "Couldn't log you in. Check your connection and try again.";
}
