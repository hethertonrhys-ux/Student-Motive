import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ago, dayWord, initialOf, loadNotifications, twoTruthsLine } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { FriendButton } from "@/components/profile/people";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useMarkNotificationsSeen } from "@/lib/badges";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// What's happened lately: people playing your Two truths, seats opening
// up, friend requests, and new events from societies you're a member of.
export default function NotificationsScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const data = useQuery({ queryKey: ["notifications", myId], queryFn: () => loadNotifications(supabase, myId!), enabled: !!myId });
  useMarkNotificationsSeen();
  const n = data.data;
  const empty = n && n.posts.length === 0 && n.requests.length === 0 && n.moves.length === 0 && n.plays.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10">
        <Link href="/(tabs)/me" asChild>
          <Pressable className="self-start">
            <T variant="semibold" className="text-sm text-muted">← Me</T>
          </Pressable>
        </Link>
        <Heading className="mt-3">Notifications</Heading>
        {!myId ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to see your notifications.</T>
            <Link href={{ pathname: "/login", params: { next: "/notifications" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : !n ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : (
          <>
            {n.plays.length > 0 && (
              <List>
                {n.plays.map((d, i) => {
                  const line = twoTruthsLine(d);
                  return (
                    <Link key={d.day} href={`/u/${myId}` as never} asChild>
                      <Pressable className={`flex-row items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-soft">
                          <T variant="display-bold" className="text-sm text-brand">2+1</T>
                        </View>
                        <T className="flex-1 text-sm"><T variant="bold" className="text-sm">{line.played}</T> {dayWord(d.day)}. {line.right}</T>
                      </Pressable>
                    </Link>
                  );
                })}
              </List>
            )}
            {n.moves.length > 0 && (
              <List>
                {n.moves.map((m, i) => (
                  <Link key={m.id} href={`/e/${m.eventId}` as never} asChild>
                    <Pressable className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                      <T className="text-sm">A seat opened up: you&apos;ve been moved to <T variant="bold" className="text-sm">{m.table}</T> at <T variant="semibold" className="text-sm text-brand">{m.event}</T></T>
                      <Muted className="text-xs">{ago(m.at)}</Muted>
                    </Pressable>
                  </Link>
                ))}
              </List>
            )}
            {n.requests.length > 0 && (
              <View className="mt-6" testID="friend-requests">
                <T variant="bold" className="mb-2 text-sm text-muted">Friend requests</T>
                <View className="overflow-hidden rounded-2xl border border-line bg-surface">
                  {n.requests.map((r, i) => {
                    const p = n.cards.get(r.id);
                    const name = p?.name ?? "Someone";
                    return (
                      <View key={r.id} className={`flex-row flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                        <Link href={`/u/${r.id}` as never} asChild>
                          <Pressable className="min-w-0 flex-1 flex-row items-center gap-3">
                            <Avatar name={name} url={p?.avatar_url} size={40} />
                            <View className="min-w-0 flex-1">
                              <T className="text-sm"><T variant="bold" className="text-sm">{name}</T> sent you a friend request</T>
                              <Muted className="text-xs">{ago(r.at)}</Muted>
                            </View>
                          </Pressable>
                        </Link>
                        <FriendButton id={r.id} relation="incoming" compact onChanged={() => void queryClient.invalidateQueries({ queryKey: ["notifications"] })} />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
            {n.posts.length > 0 && n.requests.length > 0 && <T variant="bold" className="mb-2 mt-8 text-sm text-muted">Society events</T>}
            {n.posts.length > 0 && (
              <List tight={n.requests.length > 0}>
                {n.posts.map((p, i) => (
                  <Link key={p.id} href={`/e/${p.id}` as never} asChild>
                    <Pressable className={`flex-row items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`post-${p.id}`}>
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-soft">
                        <T variant="display-bold" className="text-brand">{initialOf(p.society)}</T>
                      </View>
                      <View className="min-w-0 flex-1">
                        <T className="text-sm"><T variant="bold" className="text-sm">{p.society}</T> posted a new event: <T variant="semibold" className="text-sm text-brand">{p.title}</T></T>
                        <Muted className="text-xs">{ago(p.at)}</Muted>
                      </View>
                    </Pressable>
                  </Link>
                ))}
              </List>
            )}
            {empty && (
              <Card className="mt-6 gap-1">
                <T variant="semibold">Nothing new yet.</T>
                <Muted className="text-sm">Friend requests, and new events from societies you&apos;re a member of, show up here.</Muted>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function List({ children, tight = false }: { children: React.ReactNode; tight?: boolean }) {
  return <View className={`${tight ? "" : "mt-6 "}overflow-hidden rounded-2xl border border-line bg-surface`}>{children}</View>;
}
