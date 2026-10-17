import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chats" };

type Thread = {
  id: string;
  event_id: string | null;
  title: string;
  other_name: string | null;
  other_avatar: string | null;
  last_body: string | null;
  last_at: string;
  last_sender: string | null;
  unread: number;
};

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat("en-GB", sameDay ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" } : { day: "numeric", month: "short", timeZone: "Europe/London" }).format(d);
};

export default async function ChatsPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_threads");
  const threads = (data ?? []) as Thread[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Chats</h1>
      {threads.length === 0 ? (
        <div className="card mt-6 space-y-2">
          <p className="font-semibold">No chats yet.</p>
          <p className="text-sm text-muted">
            Message a friend from their profile, or join a student-hosted event to get its group chat.
          </p>
          <Link href="/friends" className="btn mt-2 w-fit">Find friends</Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/chats/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-brand-soft">
                {t.event_id ? (
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-xl">🎉</span>
                ) : (
                  <Avatar name={t.other_name ?? "Member"} url={t.other_avatar} size={44} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${t.unread ? "font-bold" : "font-semibold"}`}>{t.title}</span>
                    <span className="shrink-0 text-xs text-muted">{when(t.last_at)}</span>
                  </span>
                  <span className={`block truncate text-sm ${t.unread ? "font-semibold text-ink" : "text-muted"}`}>
                    {t.last_body ? `${t.last_sender === me.id ? "You: " : ""}${t.last_body}` : t.event_id ? "Event chat. Say hi to everyone going." : "Say hi 👋"}
                  </span>
                </span>
                {Number(t.unread) > 0 && (
                  <span className="grid min-w-6 shrink-0 place-items-center rounded-full bg-live px-1.5 text-xs font-bold text-white">{t.unread}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
