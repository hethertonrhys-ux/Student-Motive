import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteMessage, fetchMessages, leaveChat, loadThreadInfo, rejoinChat, reportMessage, sendMessage, type ChatMessage } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { HostPill, LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

const POLL_MS = 4000; // right after a message
const QUIET_AFTER_MS = 60_000; // then every fourth check (16 s) once the chat has been quiet for a minute
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

// One chat: a private one with a friend, or an event's group chat. New
// messages are checked for every few seconds while it's open. A group chat
// has a ••• menu with "Leave group"; someone who left sees "Rejoin" instead
// of the message box (leaving never changes their place at the event).
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { colors } = useTheme();
  const myId = session?.user.id ?? null;
  const info = useQuery({ queryKey: ["thread", id, myId], queryFn: () => loadThreadInfo(supabase, id, myId!), enabled: !!id && !!myId });
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("Harassment or bullying");
  const [sending, setSending] = useState(false);
  // The ••• menu: closed, open, or asking "Leave this group?".
  const [groupMenu, setGroupMenu] = useState<"closed" | "open" | "confirm">("closed");
  const [busy, setBusy] = useState(false);
  const lastAt = useRef<string | null>(null);
  // eslint-disable-next-line react-hooks/purity -- only the initial value is used; it marks when the chat was opened
  const lastActivity = useRef(Date.now());
  const focused = useIsFocused();
  const focusedRef = useRef(true);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  const scroll = useRef<ScrollViewInstance>(null);

  const merge = (incoming: ChatMessage[]) =>
    setMessages((cur) => {
      const current = cur ?? [];
      if (incoming.length === 0) return cur ?? [];
      const seen = new Set(current.map((m) => m.id));
      const next = [...current, ...incoming.filter((m) => !seen.has(m.id))];
      lastAt.current = next.at(-1)?.created_at ?? lastAt.current;
      return next;
    });

  // Load, then check for new messages every few seconds while the chat is open and the app is in front.
  useEffect(() => {
    if (!myId || !id) return;
    let stopped = false;
    let ticks = 0;
    const tick = async () => {
      if (AppState.currentState !== "active" || !focusedRef.current) return;
      ticks += 1;
      if (Date.now() - lastActivity.current > QUIET_AFTER_MS && ticks % 4 !== 0) return;
      const fresh = await fetchMessages(supabase, id, lastAt.current);
      if (fresh.length) lastActivity.current = Date.now();
      if (!stopped) merge(fresh);
    };
    // Opening marks the chat read: refresh the badge and the chats list behind this screen.
    void tick().then(() => Promise.all([queryClient.invalidateQueries({ queryKey: ["unread"] }), queryClient.invalidateQueries({ queryKey: ["threads"] })]));
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, myId]);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: false });
  }, [messages?.length]);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    lastActivity.current = Date.now();
    const result = await sendMessage(supabase, id, text);
    if (result.error) setError(result.error);
    else {
      setDraft("");
      merge(await fetchMessages(supabase, id, lastAt.current));
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    }
    setSending(false);
  }

  const refreshLists = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["threads"] }), queryClient.invalidateQueries({ queryKey: ["unread"] })]);

  async function leave() {
    setBusy(true);
    setError(null);
    const result = await leaveChat(supabase, id);
    if (result.error) {
      setBusy(false);
      return setError(result.error);
    }
    await refreshLists();
    router.replace("/(tabs)/chats");
  }

  async function rejoin() {
    setBusy(true);
    setError(null);
    const result = await rejoinChat(supabase, id);
    if (result.error) {
      setBusy(false);
      return setError(result.error);
    }
    lastAt.current = null;
    setMessages(null);
    await info.refetch();
    merge(await fetchMessages(supabase, id, null));
    await refreshLists();
    setBusy(false);
  }

  const hidden = info.data?.hidden ?? new Set<string>();
  const visible = (messages ?? []).filter((m) => !m.sender_id || !hidden.has(m.sender_id));
  const header = info.data;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="mx-auto w-full max-w-2xl flex-1 px-4">
          <View className="flex-row items-center gap-3 border-b border-line py-3">
            <BackButton fallback="/(tabs)/chats" label="Back to chats" />
            {header?.event ? (
              <Link href={`/e/${header.event.id}` as never} asChild>
                <Pressable className="min-w-0 flex-1">
                  <T variant="display-bold" className="text-lg" numberOfLines={1}>{header.event.title}</T>
                  <Muted className="text-xs">Event chat · {header.event.going_count} going · tap for details</Muted>
                </Pressable>
              </Link>
            ) : header?.socialEvent ? (
              <Link href={`/social/${header.socialEvent.id}` as never} asChild>
                <Pressable className="min-w-0 flex-1">
                  <T variant="display-bold" className="text-lg" numberOfLines={1}>{header.socialEvent.title}</T>
                  <Muted className="text-xs">Event chat · {header.socialEvent.going_count + 1} people · tap for details</Muted>
                </Pressable>
              </Link>
            ) : header?.other ? (
              <Link href={`/u/${header.other.id}` as never} asChild>
                <Pressable className="min-w-0 flex-1 flex-row items-center gap-2.5">
                  <Avatar name={header.other.name} url={header.other.avatar_url} size={36} />
                  <T variant="display-bold" className="text-lg" numberOfLines={1} testID="chat-title">{header.other.name}</T>
                </Pressable>
              </Link>
            ) : info.data === null ? (
              <Heading className="text-xl">Chat not found</Heading>
            ) : null}
            {header?.isGroup && !header.left && (
              <Pressable
                onPress={() => setGroupMenu(groupMenu === "closed" ? "open" : "closed")}
                accessibilityRole="button"
                accessibilityLabel="Chat options"
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface active:opacity-80"
                testID="chat-options"
              >
                <Icon name="ellipsis-horizontal" size={20} color={colors.ink} />
              </Pressable>
            )}
          </View>
          {groupMenu === "open" && (
            <Card className="mt-2 p-0" testID="chat-options-menu">
              <Pressable onPress={() => setGroupMenu("confirm")} className="min-h-12 flex-row items-center gap-3 px-4 active:opacity-80" accessibilityRole="button" testID="leave-group">
                <Icon name="exit-outline" size={20} color={colors.danger} />
                <T variant="semibold" className="text-danger">Leave group</T>
              </Pressable>
            </Card>
          )}
          {groupMenu === "confirm" && (
            <Card className="mt-2 gap-3" testID="leave-group-confirm">
              <View>
                <T variant="bold">Leave this group?</T>
                <Muted className="text-sm">You won&apos;t get its messages any more. You&apos;re still going to the event.</Muted>
              </View>
              <View className="flex-row gap-2">
                <Button onPress={() => void leave()} disabled={busy} testID="leave-group-yes">{busy ? "Leaving…" : "Leave group"}</Button>
                <Button variant="ghost" onPress={() => setGroupMenu("closed")} disabled={busy} testID="leave-group-cancel">Cancel</Button>
              </View>
            </Card>
          )}

          <ScrollView ref={scroll} className="flex-1" contentContainerClassName="py-4" keyboardShouldPersistTaps="handled" testID="messages">
            {header?.left ? (
              <Muted className="py-10 text-center text-sm" testID="left-note">You left this group. Rejoin to see its messages.</Muted>
            ) : (
              messages && visible.length === 0 && <Muted className="py-10 text-center text-sm">No messages yet. Say hi.</Muted>
            )}
            {visible.map((m, i) => {
              const mine = m.sender_id === myId;
              const prev = visible[i - 1];
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const firstInRun = newDay || prev?.sender_id !== m.sender_id || prev?.kind !== "message";
              // "Rhys left" / "Rhys rejoined": a small note, not a bubble.
              if (m.kind !== "message") {
                const who = mine ? "You" : m.sender_name;
                return (
                  <View key={m.id}>
                    {newDay && <Muted className="py-2 text-center text-xs font-sans-semibold">{day.format(new Date(m.created_at))}</Muted>}
                    <Muted className="py-2 text-center text-xs" testID={`note-${m.id}`}>{who} {m.kind === "left" ? "left" : "rejoined"} · {time.format(new Date(m.created_at))}</Muted>
                  </View>
                );
              }
              return (
                <View key={m.id}>
                  {newDay && <Muted className="py-2 text-center text-xs font-sans-semibold">{day.format(new Date(m.created_at))}</Muted>}
                  <View className={`flex-row items-end gap-2 ${mine ? "justify-end" : ""} ${firstInRun ? "mt-2" : "mt-0.5"}`}>
                    {!mine && (
                      <View className="w-7">
                        {firstInRun && (m.sender_id ? (
                          <Link href={`/u/${m.sender_id}` as never} asChild>
                            <Pressable accessibilityLabel={`${m.sender_name}'s profile`} testID={`sender-avatar-${m.id}`}><Avatar name={m.sender_name} url={m.sender_avatar} size={28} /></Pressable>
                          </Link>
                        ) : <Avatar name={m.sender_name} url={m.sender_avatar} size={28} />)}
                      </View>
                    )}
                    <View className={`max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
                      {!mine && firstInRun && (
                        <View className="mb-0.5 ml-1 flex-row items-center gap-1.5">
                          {m.sender_id ? (
                            <Link href={`/u/${m.sender_id}` as never} asChild>
                              <Pressable testID={`sender-${m.id}`}><Muted className="text-xs font-sans-semibold">{m.sender_name}</Muted></Pressable>
                            </Link>
                          ) : (
                            <Muted className="text-xs font-sans-semibold">{m.sender_name}</Muted>
                          )}
                          {!!m.sender_id && header?.hostIds.has(m.sender_id) && <HostPill testID={`host-pill-${m.id}`} />}
                        </View>
                      )}
                      <Pressable onPress={() => setMenuFor(menuFor === m.id ? null : m.id)} className={`rounded-2xl px-3.5 py-2 ${m.deleted ? "border border-dashed border-line" : mine ? "bg-brand" : "border border-line bg-surface"}`} testID={`message-${m.id}`}>
                        <T className={m.deleted ? "text-sm italic text-muted" : mine ? "text-brand-ink" : ""}>
                          {m.deleted ? "Message deleted" : m.body}
                          <T className={`text-[10px] ${mine ? "text-brand-ink" : "text-muted"}`}>  {time.format(new Date(m.created_at))}</T>
                        </T>
                      </Pressable>
                      {menuFor === m.id && !m.deleted && (
                        <View className="mt-1 flex-row gap-3">
                          {mine ? (
                            <LinkButton
                              onPress={() =>
                                void deleteMessage(supabase, m.id).then(() => {
                                  setMessages((cur) => (cur ?? []).map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x)));
                                  setMenuFor(null);
                                })
                              }
                              confirmText="Delete this message for everyone?"
                              danger
                              testID="delete-message"
                            >
                              Delete
                            </LinkButton>
                          ) : (
                            <LinkButton onPress={() => setReportFor(m.id)} danger testID="report-message">Report</LinkButton>
                          )}
                        </View>
                      )}
                      {reportFor === m.id && (
                        <View className="mt-1 w-64 gap-2">
                          <Input value={reportReason} onChangeText={setReportReason} className="py-2" testID="report-message-reason" />
                          <View className="flex-row gap-2">
                            <Button
                              className="py-1.5"
                              onPress={async () => {
                                const r = await reportMessage(supabase, m.id, reportReason);
                                setError(r.error ?? null);
                                setReportFor(null);
                                setMenuFor(null);
                              }}
                              testID="send-message-report"
                            >
                              Send report
                            </Button>
                            <Button variant="ghost" className="py-1.5" onPress={() => setReportFor(null)}>Cancel</Button>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View className="border-t border-line py-3">
            {error && <T variant="semibold" className="mb-2 text-sm text-danger">{error}</T>}
            {header?.left ? (
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Muted className="flex-1 text-sm">You won&apos;t get this group&apos;s messages.</Muted>
                <Button onPress={() => void rejoin()} disabled={busy} testID="rejoin-group">{busy ? "Rejoining…" : "Rejoin group"}</Button>
              </View>
            ) : (
            <View className="flex-row items-end gap-2">
              <Input
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={2000}
                placeholder="Message"
                accessibilityLabel="Message"
                onKeyPress={(e) => {
                  // On a keyboard, Enter sends (Shift+Enter for a new line).
                  if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !(e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                className="max-h-32 min-h-11 flex-1"
                testID="draft"
              />
              <Button className="h-11 px-4" onPress={() => void send()} disabled={sending || !draft.trim()} testID="send">Send</Button>
            </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
