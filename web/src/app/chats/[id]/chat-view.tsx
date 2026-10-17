"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { deleteMessage, fetchMessages, reportMessage, sendMessage, type ChatMessage } from "../actions";

const POLL_MS = 4000;
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

export function ChatView({ threadId, meId, initial, hidden }: { threadId: string; meId: string; initial: ChatMessage[]; hidden: string[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(initial.at(-1)?.created_at ?? null);
  const blocked = new Set(hidden);

  const merge = (incoming: ChatMessage[]) =>
    setMessages((cur) => {
      if (incoming.length === 0) return cur;
      const seen = new Set(cur.map((m) => m.id));
      const next = [...cur, ...incoming.filter((m) => !seen.has(m.id))];
      lastAt.current = next.at(-1)?.created_at ?? lastAt.current;
      return next;
    });

  // Check for new messages every few seconds while the chat is open.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const fresh = await fetchMessages(threadId, lastAt.current);
      if (!stopped) merge(fresh);
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    start(async () => {
      setError(null);
      const result = await sendMessage(threadId, text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDraft("");
      merge(await fetchMessages(threadId, lastAt.current));
    });
  }

  const visible = messages.filter((m) => !m.sender_id || !blocked.has(m.sender_id));

  return (
    <>
      <div className="flex-1 space-y-1 overflow-y-auto py-4">
        {visible.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hi 👋</p>}
        {visible.map((m, i) => {
          const mine = m.sender_id === meId;
          const prev = visible[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const firstInRun = newDay || prev?.sender_id !== m.sender_id;
          return (
            <div key={m.id}>
              {newDay && <p className="py-2 text-center text-xs font-semibold text-muted">{day.format(new Date(m.created_at))}</p>}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""} ${firstInRun ? "mt-2" : ""}`}>
                {!mine && <span className="w-7 shrink-0">{firstInRun && <Avatar name={m.sender_name} url={m.sender_avatar} size={28} />}</span>}
                <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {!mine && firstInRun && <span className="mb-0.5 ml-1 text-xs font-semibold text-muted">{m.sender_name}</span>}
                  <button
                    type="button"
                    onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                    className={`rounded-2xl px-3.5 py-2 text-left whitespace-pre-wrap break-words ${
                      m.deleted ? "border border-dashed border-line text-sm italic text-muted" : mine ? "bg-brand text-brand-ink" : "bg-surface ring-1 ring-line"
                    }`}
                  >
                    {m.deleted ? "Message deleted" : m.body}
                    <span className={`ml-2 align-bottom text-[10px] ${mine ? "text-brand-ink/70" : "text-muted"}`}>{time.format(new Date(m.created_at))}</span>
                  </button>
                  {menuFor === m.id && !m.deleted && (
                    <MessageMenu
                      mine={mine}
                      onDelete={() => start(async () => {
                        await deleteMessage(m.id);
                        setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x)));
                        setMenuFor(null);
                      })}
                      onReport={() => start(async () => {
                        const reason = prompt("Why are you reporting this message?", "Harassment or bullying");
                        if (reason === null) return;
                        const result = await reportMessage(m.id, reason);
                        alert(result.error ?? "Thanks. The Function team will look at this.");
                        setMenuFor(null);
                      })}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-line py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {error && <p className="mb-2 text-sm font-medium text-danger">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message"
            aria-label="Message"
            className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
          />
          <button className="btn h-11 shrink-0 px-4" disabled={sending || !draft.trim()}>Send</button>
        </div>
      </form>
    </>
  );
}

function MessageMenu({ mine, onDelete, onReport }: { mine: boolean; onDelete: () => void; onReport: () => void }) {
  return (
    <span className="mt-1 flex gap-3 text-xs font-semibold">
      {mine ? (
        <button type="button" onClick={() => confirm("Delete this message for everyone?") && onDelete()} className="text-danger">Delete</button>
      ) : (
        <button type="button" onClick={onReport} className="text-danger">Report</button>
      )}
    </span>
  );
}
