import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { loadShareTargets, loadSharedEvents, shareEventToChat, type ShareTarget } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { SharedEventCard } from "@/components/chat/shared-event-card";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Muted, Screen, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import { useSession } from "@/providers/session";

// "Send in a chat" from an event's page: pick one of your chats (group or
// private) and the event goes into it as a card. /share?event=<id> for a
// society event, /share?social=<id> for a Social plan.
export default function ShareEventScreen() {
  const { event, social } = useLocalSearchParams<{ event?: string; social?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const eventId = typeof event === "string" ? event : null;
  const socialId = typeof social === "string" ? social : null;
  const preview = useQuery({
    queryKey: ["share-preview", eventId, socialId, myId],
    enabled: !!myId && !!(eventId || socialId),
    queryFn: async () => (await loadSharedEvents(supabase, eventId ? [eventId] : [], socialId ? [socialId] : [])).get((eventId ?? socialId)!) ?? null,
  });
  const targets = useQuery({ queryKey: ["share-targets", myId], enabled: !!myId, queryFn: () => loadShareTargets(supabase) });
  const [q, setQ] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => (targets.data ?? []).filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase())), [targets.data, q]);

  async function send(t: ShareTarget) {
    if (!myId || !t.allowed) return;
    setSending(t.id);
    setError(null);
    const result = await shareEventToChat(supabase, t.id, myId, eventId ? { eventId } : { socialEventId: socialId! });
    if (result.error) {
      setSending(null);
      return setError(result.error);
    }
    void queryClient.invalidateQueries({ queryKey: ["threads"] });
    router.replace(`/chats/${t.id}` as never);
  }

  if (!session) {
    return (
      <Screen>
        <BackButton fallback="/(tabs)/map" />
        <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
          <T variant="semibold">Log in to send events to your chats.</T>
          <Link href={{ pathname: "/login", params: { next: eventId ? `/share?event=${eventId}` : `/share?social=${socialId}` } }} asChild>
            <Button>Log in</Button>
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <BackButton fallback={eventId ? `/e/${eventId}` : `/social/${socialId}`} />
      <Heading className="mt-3">Send in a chat</Heading>
      <View className="mt-4">
        {preview.isPending ? <Muted>Loading…</Muted> : preview.data ? <SharedEventCard event={preview.data} /> : <Muted>This event can&apos;t be shared.</Muted>}
      </View>
      {preview.data && (
        <>
          <Input value={q} onChangeText={setQ} placeholder="Search your chats" accessibilityLabel="Search your chats" className="mt-5" testID="share-search" />
          {error && <T variant="semibold" className="mt-3 text-sm text-danger" testID="share-error">{error}</T>}
          {targets.isPending ? (
            <Muted className="mt-4">Loading your chats…</Muted>
          ) : targets.isError ? (
            <Muted className="mt-4">Couldn&apos;t load your chats. Go back and try again.</Muted>
          ) : shown.length === 0 ? (
            <Card className="mt-4">
              <Muted>{q ? "No chats match that." : "You don't have any chats yet. Go to an event or message a friend, and your chats show up here."}</Muted>
            </Card>
          ) : (
            <View className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface" testID="share-targets">
              {shown.map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() => void send(t)}
                  disabled={!t.allowed || !!sending}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !t.allowed }}
                  className={`min-h-14 flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""} ${t.allowed ? "active:opacity-80" : "opacity-60"}`}
                  testID={`share-to-${t.id}`}
                >
                  {t.isGroup ? (
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-soft">
                      <Icon name="people" size={20} color={colors.brand} />
                    </View>
                  ) : (
                    <Avatar name={t.title} url={t.otherAvatar} size={40} />
                  )}
                  <View className="min-w-0 flex-1">
                    <T variant="semibold" numberOfLines={1}>{t.title}</T>
                    <Muted className="text-xs">{!t.allowed ? "Only the chat's admins can share events here" : t.isGroup ? "Group chat" : "Private chat"}</Muted>
                  </View>
                  {sending === t.id ? <Muted className="text-sm">Sending…</Muted> : t.allowed && <Icon name="paper-plane-outline" size={20} color={colors.brand} />}
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
