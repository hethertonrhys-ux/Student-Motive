import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteMessage, fetchMessages, loadThreadInfo, reportMessage, sendMessage, type ChatMessage } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { Button, Heading, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

const POLL_MS = 4000;
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

// One chat: a private one with a friend, or an event's group chat. New
// messages are checked for every few seconds while it's open.
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const info = useQuery({ queryKey: ["thread", id, myId], queryFn: () => loadThreadInfo(supabase, id, myId!), enabled: !!id && !!myId });
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("Harassment or bullying");
  const [sending, setSending] = useState(false);
  const lastAt = useRef<string | null>(null);
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
    const tick = async () => {
      if (AppState.currentState !== "active") return;
      const fresh = await fetchMessages(supabase, id, lastAt.current);
      if (!stopped) merge(fresh);
    };
    void tick().then(() => queryClient.invalidateQueries({ queryKey: ["unread"] }));
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
    const result = await sendMessage(supabase, id, text);
    if (result.error) setError(result.error);
    else {
      setDraft("");
      merge(await fetchMessages(supabase, id, lastAt.current));
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    }
    setSending(false);
  }

  const hidden = info.data?.hidden ?? new Set<string>();
  const visible = (messages ?? []).filter((m) => !m.sender_id || !hidden.has(m.sender_id));
  const header = info.data;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="mx-auto w-full max-w-2xl flex-1 px-4">
          <View className="flex-row items-center gap-3 border-b border-line py-3">
            <Link href="/(tabs)/chats" asChild>
              <Pressable className="px-1" accessibilityLabel="Back to chats">
                <Icon name="chevron-back" size={24} color="#5e5d78" />
              </Pressable>
            </Link>
            {header?.event ? (
              <Link href={`/e/${header.event.id}` as never} asChild>
                <Pressable className="min-w-0 flex-1">
                  <T variant="display-bold" className="text-lg" numberOfLines={1}>{header.event.title}</T>
                  <Muted className="text-xs">Event chat · {header.event.going_count + 1} people · tap for details</Muted>
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
          </View>

          <ScrollView ref={scroll} className="flex-1" contentContainerClassName="py-4" keyboardShouldPersistTaps="handled" testID="messages">
            {messages && visible.length === 0 && <Muted className="py-10 text-center text-sm">No messages yet. Say hi.</Muted>}
            {visible.map((m, i) => {
              const mine = m.sender_id === myId;
              const prev = visible[i - 1];
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const firstInRun = newDay || prev?.sender_id !== m.sender_id;
              return (
                <View key={m.id}>
                  {newDay && <Muted className="py-2 text-center text-xs font-sans-semibold">{day.format(new Date(m.created_at))}</Muted>}
                  <View className={`flex-row items-end gap-2 ${mine ? "justify-end" : ""} ${firstInRun ? "mt-2" : "mt-0.5"}`}>
                    {!mine && <View className="w-7">{firstInRun && <Avatar name={m.sender_name} url={m.sender_avatar} size={28} />}</View>}
                    <View className={`max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
                      {!mine && firstInRun && <Muted className="mb-0.5 ml-1 text-xs font-sans-semibold">{m.sender_name}</Muted>}
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
            <View className="flex-row items-end gap-2">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={2000}
                placeholder="Message"
                placeholderTextColor="rgba(94, 93, 120, 0.7)"
                accessibilityLabel="Message"
                onKeyPress={(e) => {
                  // On a keyboard, Enter sends (Shift+Enter for a new line).
                  if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !(e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                className="max-h-32 min-h-11 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 font-sans text-base text-ink web:outline-none web:focus:border-brand"
                testID="draft"
              />
              <Button className="h-11 px-4" onPress={() => void send()} disabled={sending || !draft.trim()} testID="send">Send</Button>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
