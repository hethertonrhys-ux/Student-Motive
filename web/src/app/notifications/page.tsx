import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getSocietyPosts } from "@/lib/notifications";
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
  const posts = await getSocietyPosts(supabase, me.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <MarkSeen />
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Notifications</h1>

      {posts.length === 0 ? (
        <div className="card mt-6 space-y-1">
          <p className="font-semibold">Nothing new yet.</p>
          <p className="text-sm text-muted">When a society you&apos;re a member of posts an event, it shows up here.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
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
