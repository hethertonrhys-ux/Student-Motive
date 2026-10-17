"use client";

import { useActionState, useState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [emailState, emailAction, sending] = useActionState(sendCode, { step: "email" } as LoginState);
  const [codeState, codeAction, verifying] = useActionState(verifyCode, { step: "code" } as LoginState);
  const [changingEmail, setChangingEmail] = useState(false);

  const showCodeStep = emailState.step === "code" && !changingEmail;

  if (!showCodeStep) {
    return (
      <form action={(fd) => { setChangingEmail(false); emailAction(fd); }} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="label">LSE email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={emailState.email}
            placeholder="a.student@lse.ac.uk"
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
        We&apos;ve emailed a login code to <strong className="text-ink">{emailState.email}</strong>. It can take a
        minute, so check your junk folder too.
      </p>
      <form action={codeAction} className="space-y-4">
        <input type="hidden" name="email" value={emailState.email} />
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
      <button type="button" onClick={() => setChangingEmail(true)} className="text-sm font-semibold text-brand">
        Use a different email
      </button>
    </div>
  );
}
