"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";

// Remember that a code was sent, so if the phone reloads the page while
// you're checking your email (home-screen apps on iPhone often do), the
// code box is still there when you come back.
const PENDING_KEY = "motive-login-pending";
const PENDING_FOR_MS = 60 * 60 * 1000;

function readPending(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as { email: string; at: number } | null;
    return saved && Date.now() - saved.at < PENDING_FOR_MS ? saved.email : null;
  } catch {
    return null;
  }
}
function writePending(email: string | null) {
  try {
    if (email) localStorage.setItem(PENDING_KEY, JSON.stringify({ email, at: Date.now() }));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked (e.g. private browsing): the form still works, it just won't remember.
  }
}
const noSubscribe = () => () => {};

export function LoginForm({ next, emailExample }: { next: string; emailExample: string }) {
  const [emailState, emailAction, sending] = useActionState(sendCode, { step: "email" } as LoginState);
  const [codeState, codeAction, verifying] = useActionState(verifyCode, { step: "code" } as LoginState);
  const [changingEmail, setChangingEmail] = useState(false);
  const savedEmail = useSyncExternalStore(noSubscribe, readPending, () => null);

  useEffect(() => {
    if (emailState.step === "code" && emailState.email) writePending(emailState.email);
  }, [emailState]);
  useEffect(() => {
    if (codeState.error && codeState.email) writePending(codeState.email);
  }, [codeState]);

  const codeEmail = emailState.step === "code" ? emailState.email : emailState.error ? undefined : (savedEmail ?? undefined);
  const showCodeStep = Boolean(codeEmail) && !changingEmail;

  if (!showCodeStep) {
    return (
      <form action={(fd) => { setChangingEmail(false); emailAction(fd); }} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={emailState.email ?? savedEmail ?? ""}
            placeholder={emailExample}
            className="input"
          />
        </div>
        {emailState.error && <p className="text-sm font-medium text-danger">{emailState.error}</p>}
        <button className="btn w-full" disabled={sending}>
          {sending ? "Sending…" : "Email me a login code"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted">
        We&apos;ve emailed a login code to <strong className="text-ink">{codeEmail}</strong>. It can take a
        minute, so check your junk folder too.
      </p>
      <form action={codeAction} onSubmit={() => writePending(null)} className="space-y-4">
        <input type="hidden" name="email" value={codeEmail} />
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="code" className="label">Login code</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="input text-center font-mono text-2xl tracking-[0.3em]"
          />
        </div>
        {codeState.error && <p className="text-sm font-medium text-danger">{codeState.error}</p>}
        <button className="btn w-full" disabled={verifying}>
          {verifying ? "Checking…" : "Log in"}
        </button>
      </form>
      <div className="flex flex-wrap justify-between gap-2">
        <form action={emailAction}>
          <input type="hidden" name="email" value={codeEmail} />
          <input type="hidden" name="next" value={next} />
          <button className="text-sm font-semibold text-brand" disabled={sending}>
            {sending ? "Sending…" : "Send a new code"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { writePending(null); setChangingEmail(true); }}
          className="text-sm font-semibold text-brand"
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}
