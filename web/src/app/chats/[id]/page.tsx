import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { requireProfile } from "@/lib/auth";
import { getCards, getHiddenPeople } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { fetchMessages } from "../actions";
import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "Chat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatPage({ params }: PageProps<"/chats/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireProfile();
  const supabase = await createClient();

  // You can only open chats you're part of (the database checks this too).
  const { data: thread } = await supabase.from("threads").select("id, event_id, social_event_id, user_a, user_b").eq("id", id).maybeSingle();
  if (!thread) notFound();

  const otherId = thread.event_id || thread.social_event_id ? null : thread.user_a === me.id ? thread.user_b : thread.user_a;
  const [cards, hidden, { data: event }, { data: socialEvent }, initial] = await Promise.all([
    getCards(supabase, otherId ? [otherId] : []),
    getHiddenPeople(supabase),
    thread.event_id
      ? supabase.from("events").select("id, title, going_count").eq("id", thread.event_id).maybeSingle()
      : Promise.resolve({ data: null }),
    thread.social_event_id
      ? supabase.from("social_events").select("id, title, going_count").eq("id", thread.social_event_id).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchMessages(id, null),
  ]);
  const other = otherId ? cards.get(otherId) : null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-57px-var(--banner-h,0px)-var(--tabbar-h))] max-w-2xl flex-col px-4">
      <header className="flex items-center gap-3 border-b border-line py-3">
        <Link href="/chats" className="px-1 text-xl text-muted" aria-label="Back to chats">‹</Link>
        {event ? (
          <Link href={`/e/${event.id}`} className="min-w-0">
            <span className="block truncate font-display text-lg font-bold">{event.title}</span>
            <span className="text-xs text-muted">Event chat · {event.going_count + 1} people · tap for details</span>
          </Link>
        ) : socialEvent ? (
          <Link href={`/social/${socialEvent.id}`} className="min-w-0">
            <span className="block truncate font-display text-lg font-bold">{socialEvent.title}</span>
            <span className="text-xs text-muted">Event chat · {socialEvent.going_count + 1} people · tap for details</span>
          </Link>
        ) : other ? (
          <Link href={`/u/${other.id}`} className="flex min-w-0 items-center gap-2.5">
            <Avatar name={other.name} url={other.avatar_url} size={36} />
            <span className="truncate font-display text-lg font-bold">{other.name}</span>
          </Link>
        ) : null}
      </header>
      <ChatView threadId={id} meId={me.id} initial={initial} hidden={[...hidden]} />
    </div>
  );
}
