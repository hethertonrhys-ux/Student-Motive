"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../actions";

// A button that runs a server action and shows any error under it.
export function ActionButton({
  action,
  children,
  className = "btn",
  confirmText,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        className={className}
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
