import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadFriends, searchPeople, type SearchResult } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { PeopleSection, PersonRow } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { FriendButton } from "@/components/profile/people";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Friends: requests, your friends, people you've been to events with, and search.
export default function FriendsScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const data = useQuery({ queryKey: ["friends", myId], queryFn: () => loadFriends(supabase, myId!), enabled: !!myId });
  const refresh = () => void Promise.all([queryClient.invalidateQueries({ queryKey: ["friends"] }), queryClient.invalidateQueries({ queryKey: ["threads"] }), queryClient.invalidateQueries({ queryKey: ["notification-times"] })]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={"/(tabs)/chats"} />
        <Heading className="mt-3">Friends</Heading>
        {!myId ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to see your friends.</T>
            <Link href={{ pathname: "/login", params: { next: "/friends" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : (
          <>
            {profile && !profile.display_name && (
              <T className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-sm">
                Add your name so friends can find you.{" "}
                <Link href={"/account" as never} asChild>
                  <T variant="semibold" className="text-sm text-brand">Edit your profile →</T>
                </Link>
              </T>
            )}
            <View className="mt-6">
              <PeopleSearch myId={myId} onChanged={refresh} />
            </View>
            {data.data && (
              <>
                {data.data.incoming.length > 0 && (
                  <View className="mt-8" testID="incoming">
                    <PeopleSection title={`Friend requests (${data.data.incoming.length})`}>
                      {data.data.incoming.map((p, i) => (
                        <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} country={p.country} detail={p.course} first={i === 0}>
                          <FriendButton id={p.id} relation="incoming" compact onChanged={refresh} />
                        </PersonRow>
                      ))}
                    </PeopleSection>
                  </View>
                )}
                <View className="mt-8" testID="friends">
                  <PeopleSection title={`Your friends (${data.data.friends.length})`}>
                    {data.data.friends.map((p, i) => (
                      <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} country={p.country} detail={p.course} first={i === 0}>
                        <FriendButton id={p.id} relation="friends" compact onChanged={refresh} />
                      </PersonRow>
                    ))}
                    {data.data.friends.length === 0 && <Muted className="px-4 py-4 text-sm">No friends yet. Search for people above, or add people you&apos;ve been to events with.</Muted>}
                  </PeopleSection>
                </View>
                {data.data.suggestions.length > 0 && (
                  <View className="mt-8" testID="suggestions">
                    <PeopleSection title="People you've been to events with">
                      {data.data.suggestions.map((p, i) => (
                        <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} country={p.country} detail={`${p.shared_events} ${Number(p.shared_events) === 1 ? "event" : "events"} together${p.course ? ` · ${p.course}` : ""}`} first={i === 0}>
                          <FriendButton id={p.id} relation="none" compact onChanged={refresh} />
                        </PersonRow>
                      ))}
                    </PeopleSection>
                  </View>
                )}
                {data.data.outgoing.length > 0 && (
                  <View className="mt-8" testID="outgoing">
                    <PeopleSection title="Requests you've sent">
                      {data.data.outgoing.map((p, i) => (
                        <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} country={p.country} detail={p.course} first={i === 0}>
                          <FriendButton id={p.id} relation="outgoing" compact onChanged={refresh} />
                        </PersonRow>
                      ))}
                    </PeopleSection>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PeopleSearch({ myId, onChanged }: { myId: string; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Search after a short pause in typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await searchPeople(supabase, myId, q);
      if (!stale) {
        setResults(found);
        setSearching(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, myId]);
  const showing = query.trim().length >= 2;
  return (
    <View>
      <View className="relative">
        <View className="pointer-events-none absolute left-3.5 top-0 z-10 h-full justify-center">
          <Icon name="search" size={20} color="#5e5d78" />
        </View>
        <Input value={query} onChangeText={setQuery} placeholder="Find people by name" accessibilityLabel="Find people by name" autoCorrect={false} className="pl-11" testID="people-search" />
      </View>
      {showing && (
        <View className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface" testID="people-results">
          {searching && !results && <Muted className="px-4 py-3 text-sm">Searching…</Muted>}
          {results?.length === 0 && <Muted className="px-4 py-3 text-sm">Nobody called &ldquo;{query.trim()}&rdquo; yet.</Muted>}
          {results?.map((p, i) => (
            <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} country={p.country} detail={p.course} first={i === 0}>
              <FriendButton id={p.id} relation={p.relation} compact onChanged={onChanged} />
            </PersonRow>
          ))}
        </View>
      )}
    </View>
  );
}
