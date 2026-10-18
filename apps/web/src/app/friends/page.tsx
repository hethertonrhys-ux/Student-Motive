import type { Metadata } from "next";
import Link from "next/link";
import { FriendButton } from "@/components/friend-button";
import { PersonRow } from "@/components/person-row";
import { requireProfile } from "@/lib/auth";
import { getCards, getFriendships, getHiddenPeople, type PersonCard, type Relation } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { PeopleSearch } from "./people-search";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const { blocked } = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();

  const [relations, hidden, { data: suggestionRows }] = await Promise.all([
    getFriendships(supabase, me.id),
    getHiddenPeople(supabase),
    supabase.rpc("people_you_may_know"),
  ]);
  const cards = await getCards(supabase, [...relations.keys()]);
  const pick = (r: Relation) =>
    [...relations.entries()]
      .filter(([id, rel]) => rel === r && !hidden.has(id))
      .map(([id]) => cards.get(id))
      .filter((c): c is PersonCard => !!c);

  const friends = pick("friends").sort((a, b) => a.name.localeCompare(b.name));
  const incoming = pick("incoming");
  const outgoing = pick("outgoing");
  const suggestions = ((suggestionRows ?? []) as (PersonCard & { shared_events: number })[]).filter((s) => !hidden.has(s.id));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Friends</h1>
      {blocked && <p className="mt-4 rounded-2xl bg-ok/10 px-4 py-3 text-sm font-semibold text-ok">Blocked. They can&apos;t message you, add you or see your events.</p>}
      {!me.display_name && (
        <p className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-sm">
          Add your name so friends can find you. <Link href="/account" className="font-semibold text-brand">Edit your profile →</Link>
        </p>
      )}

      <div className="mt-6">
        <PeopleSearch />
      </div>

      {incoming.length > 0 && (
        <Section title={`Friend requests (${incoming.length})`}>
          {incoming.map((p) => (
            <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} detail={p.course}>
              <FriendButton id={p.id} relation="incoming" compact />
            </PersonRow>
          ))}
        </Section>
      )}

      <Section title={`Your friends (${friends.length})`}>
        {friends.map((p) => (
          <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} detail={p.course}>
            <FriendButton id={p.id} relation="friends" compact />
          </PersonRow>
        ))}
        {friends.length === 0 && (
          <li className="px-4 py-4 text-sm text-muted">No friends yet. Search for people above, or add people you&apos;ve been to events with.</li>
        )}
      </Section>

      {suggestions.length > 0 && (
        <Section title="People you've been to events with">
          {suggestions.map((p) => (
            <PersonRow
              key={p.id}
              id={p.id}
              name={p.name}
              avatarUrl={p.avatar_url}
              detail={`${p.shared_events} ${Number(p.shared_events) === 1 ? "event" : "events"} together${p.course ? ` · ${p.course}` : ""}`}
            >
              <FriendButton id={p.id} relation="none" compact />
            </PersonRow>
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title="Requests you've sent">
          {outgoing.map((p) => (
            <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} detail={p.course}>
              <FriendButton id={p.id} relation="outgoing" compact />
            </PersonRow>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</ul>
    </section>
  );
}
