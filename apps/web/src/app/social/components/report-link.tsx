"use client";

import { useState, useTransition } from "react";
import { reportSocialEvent } from "../actions";

export function ReportLink({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p className="text-sm text-muted">Thanks. The Function team will take a look.</p>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const reason = prompt("Why are you reporting this event?");
        if (!reason) return;
        start(async () => {
          const r = await reportSocialEvent(id, reason);
          if (r.error) alert(r.error);
          else setDone(true);
        });
      }}
      className="text-sm font-semibold text-muted hover:text-danger"
    >
      Report this event
    </button>
  );
}
