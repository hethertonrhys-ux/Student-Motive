import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadThreads } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat("en-GB", sameDay ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" } : { day: "numeric", month: "short", timeZone: "Europe/London" }).format(d);
};

// Your chats: private ones with friends, and the group chat of each event you're going to.
export default function ChatsScreen() {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const data = useQuery({ queryKey: ["threads", myId], queryFn: () => loadThreads(supabase, myId!), enabled: !!myId, refetchInterval: 30_000 });
  const threads = data.data?.threads ?? [];
  const requests = data.data?.requests ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => void data.refetch()} />}>
        <View className="flex-row items-center justify-between gap-3">
          <Heading>Messages</Heading>
          {myId && (
            <Link href={"/friends" as never} asChild>
              <Button variant="ghost" className="py-2" testID="friends-link">
                Friends
                {requests > 0 && (
                  <View className="min-w-5 items-center rounded-full bg-live px-1.5">
                    <T variant="bold" className="text-xs leading-5 text-white" testID="requests-badge">{requests}</T>
                  </View>
                )}
              </Button>
            </Link>
          )}
        </View>
        {!myId ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to see your messages.</T>
            <Link href={{ pathname: "/login", params: { next: "/chats" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : data.isPending ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : threads.length === 0 ? (
          <Card className="mt-6 gap-2">
            <T variant="semibold">No chats yet.</T>
            <Muted className="text-sm">Message a friend from their profile, or join a student-hosted event to get its group chat.</Muted>
            <Link href={"/friends" as never} asChild>
              <Button className="mt-2 self-start">Find friends</Button>
            </Link>
          </Card>
        ) : (
          <View className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface" testID="threads">
            {threads.map((t, i) => (
              <Link key={t.id} href={`/chats/${t.id}` as never} asChild>
                <Pressable className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`thread-${t.id}`}>
                  {t.event_id || t.social_event_id ? (
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
                      <Icon name="people" size={22} color="#DA291C" />
                    </View>
                  ) : (
                    <Avatar name={t.other_name ?? "Member"} url={t.other_avatar} size={44} />
                  )}
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-baseline justify-between gap-2">
                      <T variant={t.unread ? "bold" : "semibold"} className="flex-1" numberOfLines={1}>{t.title}</T>
                      <Muted className="text-xs">{when(t.last_at)}</Muted>
                    </View>
                    <T variant={t.unread ? "semibold" : "normal"} className={`text-sm ${t.unread ? "" : "text-muted"}`} numberOfLines={1}>
                      {t.last_body ? `${t.last_sender === myId ? "You: " : ""}${t.last_body}` : t.event_id || t.social_event_id ? "Event chat. Say hi to everyone going." : "Say hi"}
                    </T>
                  </View>
                  {t.unread > 0 && (
                    <View className="min-w-6 items-center rounded-full bg-live px-1.5" testID="unread-badge">
                      <T variant="bold" className="text-xs leading-5 text-white">{t.unread}</T>
                    </View>
                  )}
                </Pressable>
              </Link>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
