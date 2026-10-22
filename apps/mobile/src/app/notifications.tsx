import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ago, dayWord, initialOf, loadNotifications, twoTruthsLine, type TwoTruthsDay } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { FriendButton } from "@/components/profile/people";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useMarkNotificationsSeen } from "@/lib/badges";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// What's happened lately: people playing your Two truths (by name, so you
// can tap through to them), seats opening
// up, friend requests, and new events from societies you're a member of.
export default function NotificationsScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const data = useQuery({ queryKey: ["notifications", myId], queryFn: () => loadNotifications(supabase, myId!), enabled: !!myId });
  useMarkNotificationsSeen();
  const n = data.data;
  const empty = n && n.posts.length === 0 && n.requests.length === 0 && n.moves.length === 0 && n.seats.length === 0 && n.plays.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10">
        <BackButton fallback={"/(tabs)/me"} />
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
                {n.plays.map((d, i) => (
                  <TwoTruthsRow key={d.day} d={d} myId={myId} first={i === 0} />
                ))}
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
            {n.seats.length > 0 && (
              <List>
                {n.seats.map((s, i) => (
                  <Link key={s.id} href={`/e/${s.eventId}` as never} asChild>
                    <Pressable className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`seat-change-${s.id}`}>
                      <T className="text-sm">Seats reshuffled: you&apos;re now in <T variant="bold" className="text-sm">Seat {s.seatNo ?? "?"}</T> at <T variant="bold" className="text-sm">{s.table}</T> for <T variant="semibold" className="text-sm text-brand">{s.event}</T></T>
                      <Muted className="text-xs">{ago(s.at)}</Muted>
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

// One day of people playing your Two truths and a lie. Each name opens that
// person's profile; with more than three, "See all" lists everyone and
// whether they spotted the lie.
function TwoTruthsRow({ d, myId, first }: { d: TwoTruthsDay; myId: string; first: boolean }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const line = twoTruthsLine(d);
  const open = (id: string) => router.push(`/u/${id}` as never);
  const badge = (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-soft">
      <T variant="display-bold" className="text-sm text-brand">2+1</T>
    </View>
  );
  // The older counts-only version (before the names migration has run).
  if (line.shown.length === 0) {
    return (
      <Link href={`/u/${myId}` as never} asChild>
        <Pressable className={`flex-row items-start gap-3 px-4 py-3 ${first ? "" : "border-t border-line"}`}>
          {badge}
          <T className="flex-1 text-sm"><T variant="bold" className="text-sm">{line.played}</T> {dayWord(d.day)}. {line.right}</T>
        </Pressable>
      </Link>
    );
  }
  return (
    <View className={`flex-row items-start gap-3 px-4 py-3 ${first ? "" : "border-t border-line"}`} testID={`two-truths-${d.day}`}>
      {line.shown.length === 1 ? <Pressable onPress={() => open(line.shown[0].id)}><Avatar name={line.shown[0].name} url={line.shown[0].avatarUrl} size={40} /></Pressable> : badge}
      <View className="min-w-0 flex-1 gap-1">
        <T className="text-sm">
          {line.shown.map((p, i) => (
            <T key={p.id}>
              {i > 0 && (i === line.shown.length - 1 && !line.more ? " and " : ", ")}
              <T variant="bold" className="text-sm text-brand" onPress={() => open(p.id)} testID={`played-${p.id}`}>{p.name}</T>
            </T>
          ))}
          {line.more > 0 && <T variant="bold" className="text-sm"> and {line.more} more</T>} played your Two truths and a lie {dayWord(d.day)}. {line.right}
        </T>
        {line.more > 0 && (
          <Pressable onPress={() => setAll((a) => !a)} className="min-h-9 justify-center self-start" testID={`see-all-${d.day}`}>
            <T variant="semibold" className="text-sm text-brand">{all ? "Show less" : `See all ${d.players.length}`}</T>
          </Pressable>
        )}
        {all && (
          <View className="mt-1 gap-1" testID={`all-players-${d.day}`}>
            {d.players.map((p) => (
              <Pressable key={p.id} onPress={() => open(p.id)} className="min-h-11 flex-row items-center gap-2.5 rounded-xl px-1 py-1 active:opacity-80">
                <Avatar name={p.name} url={p.avatarUrl} size={28} />
                <T variant="semibold" className="flex-1 text-sm" numberOfLines={1}>{p.name}</T>
                <Muted className={`text-xs ${p.right ? "text-ok" : ""}`}>{p.right ? "✓ Spotted the lie" : "Didn't spot it"}</Muted>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
