import { useQuery } from "@tanstack/react-query";
import { Link, useIsFocused } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isGroupChat, isMutedNow, loadChatsTab, unreadLabel } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { CommunityLogo } from "@/components/community/community-header";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { usePullToRefresh, useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat("en-GB", sameDay ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" } : { day: "numeric", month: "short", timeZone: "Europe/London" }).format(d);
};

// Your chats, in two sections: the group chats of events, societies and
// communities ("UCL Abacus", "UCL Abacus · AbaFam", with the community's
// picture), and personal chats with friends. Each section shows how many
// unread messages it has; a muted chat has a bell with a line through it.
type Section = "events" | "personal";

export default function ChatsScreen() {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const focused = useIsFocused();
  const data = useQuery({ queryKey: ["threads", myId], queryFn: () => loadChatsTab(supabase, myId!), enabled: !!myId, refetchInterval: focused ? 30_000 : false });
  useRefetchOnFocus(data);
  const pull = usePullToRefresh(data.refetch);
  const all = data.data?.threads ?? [];
  const requests = data.data?.requests ?? 0;
  const [section, setSection] = useState<Section>("events");
  const groups = all.filter(isGroupChat);
  const personal = all.filter((t) => !isGroupChat(t));
  const threads = section === "events" ? groups : personal;
  const unread = { events: groups.reduce((n, t) => n + t.unread, 0), personal: personal.reduce((n, t) => n + t.unread, 0) };
  // A community chat's count stops at 99, so a total that includes one at 99 is "99+".
  const capped = groups.some((t) => t.kind === "community" && t.unread >= 99);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
        <View className="flex-row items-center justify-between gap-3">
          <Heading>Messages</Heading>
          {myId && (
            <Link href={"/friends" as never} asChild>
              {/* Its words are in a text block of their own: loose words beside the
                  number showed an empty box on phones. */}
              <Button variant="ghost" className="py-2" accessibilityLabel={requests > 0 ? `Friends, ${requests} ${requests === 1 ? "request" : "requests"} waiting` : "Friends"} testID="friends-link">
                <Icon name="people-outline" size={18} color="#15142b" />
                <T variant="semibold" className="text-base text-ink">Friends</T>
                {requests > 0 && (
                  <View className="min-w-5 items-center rounded-full bg-live px-1.5">
                    <T variant="bold" className="text-xs leading-5 text-white" testID="requests-badge">{requests}</T>
                  </View>
                )}
              </Button>
            </Link>
          )}
        </View>
        {myId && (
          <View className="mt-4 flex-row rounded-2xl border border-line bg-surface p-1" accessibilityRole="tablist">
            {([["events", "Events & Societies"], ["personal", "Personal"]] as const).map(([key, label]) => (
              <Pressable key={key} onPress={() => setSection(key)} accessibilityRole="tab" accessibilityState={{ selected: section === key }} testID={`chats-tab-${key}`} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-2.5 ${section === key ? "bg-brand" : ""}`}>
                <T variant="bold" className={`text-sm ${section === key ? "text-brand-ink" : "text-muted"}`}>{label}</T>
                {unread[key] > 0 && (
                  <View className={`min-w-5 items-center rounded-full px-1.5 ${section === key ? "bg-white" : "bg-live"}`}>
                    <T variant="bold" className={`text-xs leading-5 ${section === key ? "text-brand" : "text-white"}`}>{key === "events" && capped ? unreadLabel(unread[key], true) : unread[key]}</T>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}
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
          <Card className="mt-4 gap-2">
            <T variant="semibold">{section === "events" ? "No event chats yet." : "No personal chats yet."}</T>
            <Muted className="text-sm">{section === "events" ? "Join an event and its group chat appears here." : "Message a friend from their profile and it shows up here."}</Muted>
            <Link href={(section === "events" ? "/(tabs)/social" : "/friends") as never} asChild>
              <Button className="mt-2 self-start">{section === "events" ? "Find an event" : "Find friends"}</Button>
            </Link>
          </Card>
        ) : (
          <View className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface" testID="threads">
            {threads.map((t, i) => (
              <Link key={t.id} href={`/chats/${t.id}` as never} asChild>
                <Pressable className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`thread-${t.id}`}>
                  {t.kind === "community" ? (
                    <CommunityLogo name={t.other_name ?? t.title} url={t.image_url} size={44} />
                  ) : t.event_id || t.social_event_id ? (
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
                      <Icon name="people" size={22} color="#DA291C" />
                    </View>
                  ) : (
                    <Avatar name={t.other_name ?? "Member"} url={t.other_avatar} size={44} />
                  )}
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-baseline justify-between gap-2">
                      <T variant={t.unread ? "bold" : "semibold"} className="flex-1" numberOfLines={1}>{t.title}</T>
                      {isMutedNow(t) && (
                        <View accessibilityLabel="Muted" testID="thread-muted">
                          <Icon name="notifications-off-outline" size={14} color="#5e5d78" />
                        </View>
                      )}
                      <Muted className="text-xs">{when(t.last_at)}</Muted>
                    </View>
                    <T variant={t.unread ? "semibold" : "normal"} className={`text-sm ${t.unread ? "" : "text-muted"}`} numberOfLines={1}>
                      {t.last_body ? `${t.last_sender === myId ? "You: " : ""}${t.last_body}` : t.kind === "community" ? "Community chat. Say hi to everyone." : t.event_id || t.social_event_id ? "Event chat. Say hi to everyone going." : "Say hi"}
                    </T>
                  </View>
                  {t.unread > 0 && (
                    <View className="min-w-6 items-center rounded-full bg-live px-1.5" testID="unread-badge">
                      <T variant="bold" className="text-xs leading-5 text-white">{t.kind === "community" ? unreadLabel(t.unread, true) : t.unread}</T>
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
