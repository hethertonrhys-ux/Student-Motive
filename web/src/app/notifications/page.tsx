import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { Avatar } from "@/components/avatar";
import { FriendButton } from "@/components/friend-button";
import { getFriendRequests, getSocietyPosts } from "@/lib/notifications";
import { getCards } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { MarkSeen } from "./mark-seen";

export const metadata: Metadata = { title: "Notifications" };

// "5 min ago", "3 h ago", "2 days ago".
function ago(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function NotificationsPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const [posts, requests] = await Promise.all([getSocietyPosts(supabase, me.id), getFriendRequests(supabase, me.id)]);
  const cards = await getCards(supabase, requests.map((r) => r.id));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <MarkSeen />
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Notifications</h1>

      {requests.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-muted">Friend requests</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {requests.map((r) => {
              const p = cards.get(r.id);
              const name = p?.name ?? "Someone";
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link href={`/u/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={name} url={p?.avatar_url} size={40} />
                    <span className="min-w-0">
                      <span className="block text-sm">
                        <span className="font-bold">{name}</span> sent you a friend request
                      </span>
                      <span className="text-xs text-muted">{ago(r.at)}</span>
                    </span>
                  </Link>
                  <FriendButton id={r.id} relation="incoming" compact />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {posts.length > 0 && requests.length > 0 && <h2 className="mt-8 mb-2 text-sm font-bold text-muted">Society events</h2>}
      {posts.length === 0 ? (
        requests.length === 0 && (
          <div className="card mt-6 space-y-1">
            <p className="font-semibold">Nothing new yet.</p>
            <p className="text-sm text-muted">Friend requests, and new events from societies you&apos;re a member of, show up here.</p>
          </div>
        )
      ) : (
        <ul className={`${requests.length ? "" : "mt-6 "}divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface`}>
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/e/${p.id}`} className="flex items-start gap-3 px-4 py-3 transition hover:bg-brand-soft">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-brand">
                  {p.society.replace(/^LSE\s+/i, "").charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    <span className="font-bold">{p.society}</span> posted a new event: <span className="font-semibold text-brand">{p.title}</span>
                  </span>
                  <span className="text-xs text-muted">{ago(p.at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
