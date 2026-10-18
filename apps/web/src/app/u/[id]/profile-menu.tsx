"use client";

import { useActionState, useState } from "react";
import { blockUser, reportUser, unblockUser, type ReportState } from "@/app/friends/actions";

const REASONS = ["Harassment or bullying", "Spam or fake account", "Inappropriate content", "Safety concern", "Something else"];

// Block or report, tucked away under a small link.
export function ProfileMenu({ id, name, blockedByMe }: { id: string; name: string; blockedByMe: boolean }) {
  const [open, setOpen] = useState<"menu" | "report" | null>(null);
  const [state, report, sending] = useActionState(reportUser.bind(null, id), {} as ReportState);

  if (open === null) {
    return (
      <button type="button" onClick={() => setOpen("menu")} className="text-xs font-semibold text-muted hover:text-ink">
        Block or report
      </button>
    );
  }

  if (state.sent) {
    return <p className="text-sm font-semibold text-ok">Thanks. The Function team will look at this.</p>;
  }

  return (
    <div className="w-full max-w-sm space-y-3 rounded-2xl border border-line p-4 text-left">
      {open === "menu" && (
        <>
          {blockedByMe ? (
            <form action={unblockUser.bind(null, id)}>
              <button className="btn-ghost w-full">Unblock {name}</button>
            </form>
          ) : (
            <form action={blockUser.bind(null, id)} onSubmit={(e) => !confirm(`Block ${name}? They won't be able to message you, add you or see your events.`) && e.preventDefault()}>
              <button className="btn-ghost w-full text-danger">Block {name}</button>
            </form>
          )}
          <button type="button" onClick={() => setOpen("report")} className="btn-ghost w-full">
            Report {name}
          </button>
          <button type="button" onClick={() => setOpen(null)} className="w-full text-sm text-muted">Cancel</button>
        </>
      )}
      {open === "report" && (
        <form action={report} className="space-y-3">
          <p className="font-semibold">Why are you reporting {name}?</p>
          <select name="reason" required defaultValue="" className="input">
            <option value="" disabled>Choose a reason</option>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <textarea name="details" rows={3} maxLength={2000} placeholder="Anything else we should know (optional)" className="input" />
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <button className="btn flex-1" disabled={sending}>{sending ? "Sending…" : "Send report"}</button>
            <button type="button" onClick={() => setOpen(null)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
