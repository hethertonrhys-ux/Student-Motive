import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { FriendButton } from "@/components/friend-button";
import { requireProfile } from "@/lib/auth";
import { getCards, getFriendships, getHiddenPeople, relationFor } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { formatEventTime, nowMs } from "@/lib/time";
import { ProfileMenu } from "./profile-menu";
import { PhotoGallery } from "./photo-gallery";
import { getPhotos, getProfileSocieties } from "@/lib/profile-photos";

export const metadata: Metadata = { title: "Profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProfilePage({ params }: PageProps<"/u/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireProfile();
  const supabase = await createClient();

  const [cards, relations, hidden] = await Promise.all([
    getCards(supabase, [id]),
    getFriendships(supabase, me.id),
    getHiddenPeople(supabase),
  ]);
  const person = cards.get(id);
  if (!person) notFound();
  const isBlocked = hidden.has(id);
  const relation = relationFor(relations, me.id, id);
  const friendCount = [...relations.values()].filter((r) => r === "friends").length;
  const incomingCount = [...relations.values()].filter((r) => r === "incoming").length;

  // Their upcoming events you're allowed to see (public, or friends-only if you're friends).
  const { data: events } = isBlocked
    ? { data: [] }
    : await supabase
        .from("events")
        .select("id, title, starts_at, ends_at, visibility, location_note")
        .eq("host_user_id", id)
        .eq("is_cancelled", false)
        .gt("ends_at", new Date(nowMs()).toISOString())
        .order("starts_at")
        .limit(10);

  // Their current photos and societies (both empty if either of you has blocked the other).
  const [photos, societies] = isBlocked
    ? [[], []]
    : await Promise.all([getPhotos(supabase, id), getProfileSocieties(supabase, id)]);
  const currentPhotos = photos.filter((p) => p.current);

  // Friends in common.
  const theirFriends = relation === "self" || isBlocked ? 0 : await mutualCount(supabase, id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="card flex flex-col items-center gap-3 text-center">
        <Avatar name={person.name} url={person.avatar_url} size={88} />
        <div>
          <h1 className="font-display text-2xl font-extrabold">{person.name}</h1>
          {person.course && <p className="text-muted">{person.course}</p>}
        </div>
        {person.bio && <p className="max-w-md whitespace-pre-line">{person.bio}</p>}
        {theirFriends ? <p className="text-sm text-muted">{theirFriends} friend{theirFriends === 1 ? "" : "s"} in common</p> : null}
        {relation === "self" ? (
          <span className="flex flex-wrap justify-center gap-2">
            <Link href="/account" className="btn-ghost">Edit your profile</Link>
            <Link href="/friends" className="btn-ghost">
              Friends{friendCount ? ` (${friendCount})` : ""}
              {incomingCount ? <span className="ml-1.5 rounded-full bg-live px-1.5 text-xs font-bold text-white">{incomingCount} new</span> : null}
            </Link>
          </span>
        ) : isBlocked ? (
          <p className="text-sm font-semibold text-muted">You&apos;ve blocked this person, or they&apos;ve blocked you.</p>
        ) : (
          <FriendButton id={id} relation={relation} />
        )}
        {relation !== "self" && <ProfileMenu id={id} name={person.name} blockedByMe={isBlocked} />}
      </div>

      {societies.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Societies</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {societies.map((s) => (
              <li key={s.id}>
                <Link href={`/s/${s.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm font-semibold transition hover:border-brand">
                  <Avatar name={s.name} url={s.logo_url} size={24} />
                  {s.name}
                  {s.is_committee && <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">Committee</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {currentPhotos.length > 0 && (
        <section className="mt-6">
          <PhotoGallery photos={currentPhotos.map((p) => ({ id: p.id, url: p.url }))} canReport={relation !== "self"} />
        </section>
      )}
      {relation === "self" && currentPhotos.length === 0 && (
        <p className="card mt-6 text-sm text-muted">
          Add up to 5 photos of things you like or get up to. <Link href="/account" className="font-semibold text-brand">Add photos →</Link>
        </p>
      )}

      {(events ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Hosting</h2>
          <ul className="mt-3 space-y-2">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/e/${e.id}`} className="card flex items-center justify-between gap-3 py-3 transition hover:border-brand">
                  <span>
                    <span className="block font-bold">{e.title}</span>
                    <span className="text-sm text-muted">
                      {formatEventTime(e.starts_at, e.ends_at)}
                      {e.location_note ? ` · ${e.location_note}` : ""}
                    </span>
                  </span>
                  {e.visibility === "friends" && <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand">Friends only</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// How many friends you have in common.
async function mutualCount(supabase: Awaited<ReturnType<typeof createClient>>, them: string) {
  const { data } = await supabase.rpc("mutual_friend_count", { other: them });
  return Number(data ?? 0);
}
