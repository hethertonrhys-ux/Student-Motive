"use client";

import { useState, useTransition } from "react";
import type { JoinResult } from "./actions";

// A button that runs a server action and shows any error under it.
export function ActionButton({
  action,
  children,
  variant = "primary",
  className = "",
  confirmText,
}: {
  action: () => Promise<JoinResult>;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "link";
  className?: string;
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const styles = {
    primary: "btn",
    ghost: "btn-ghost",
    link: "text-sm font-semibold text-muted hover:text-danger",
  }[variant];

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        className={`${styles} ${className}`}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          setError(null);
          start(async () => {
            const result = await action();
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "…" : children}
      </button>
      {error && <span className="mt-1 text-sm font-medium text-danger">{error}</span>}
    </span>
  );
}
