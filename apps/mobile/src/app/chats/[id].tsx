import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { chatMediaPath, chatMediaUrls, deleteMessage, fetchMessages, leaveChat, loadSharedEvents, loadThreadInfo, rejoinChat, reportMessage, sendMedia, sendMessage, setMembersCanShareEvents, type ChatMessage, type MediaKind } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { MediaPreview, MediaViewer } from "@/components/chat/media";
import { SharedEventCard } from "@/components/chat/shared-event-card";
import { HostPill, LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { pickChatMedia, uploadChatMedia, type PickedMedia, type Upload } from "@/lib/chat-media";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

const POLL_MS = 4000; // right after a message
const QUIET_AFTER_MS = 60_000; // then every fourth check (16 s) once the chat has been quiet for a minute
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
// An id for a photo or video while it uploads, and the time (outside render).
const uploadId = () => `${Date.now()}-${Math.random()}`;
const now = () => Date.now();
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

// One chat: a private one with a friend, or an event's group chat. New
// messages are checked for every few seconds while it's open. A group chat
// has a ••• menu with "Leave group"; someone who left sees "Rejoin" instead
// of the message box (leaving never changes their place at the event).
// Shared events show as cards; a group chat's admins can let only admins
// share events (in the ••• menu). Photos and videos (the + button) upload
// with a progress bar, show as previews and open full screen.
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
  // Photos and videos on their way up, shown at the end of the chat with their progress.
  const [uploads, setUploads] = useState<(PickedMedia & { localId: string; progress: number; error: string | null })[]>([]);
  const uploading = useRef(new Map<string, Upload>());
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewer, setViewer] = useState<{ kind: MediaKind; url: string } | null>(null);
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

  // Pick (or take) a photo or video, then upload and post it.
  async function attach(source: "library" | "camera") {
    setAttachOpen(false);
    setError(null);
    let picked: PickedMedia | null;
    try {
      picked = await pickChatMedia(source);
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Couldn't open your photos.");
    }
    if (!picked) return;
    const item = { ...picked, localId: uploadId(), progress: 0, error: null };
    setUploads((cur) => [...cur, item]);
    void upload(item);
  }

  async function upload(item: PickedMedia & { localId: string }) {
    if (!myId) return;
    const update = (changes: Partial<{ progress: number; error: string | null }>) => setUploads((cur) => cur.map((u) => (u.localId === item.localId ? { ...u, ...changes } : u)));
    update({ progress: 0, error: null });
    lastActivity.current = now();
    const path = chatMediaPath(id, myId, item.ext);
    const job = uploadChatMedia(path, item, (fraction) => update({ progress: fraction }));
    uploading.current.set(item.localId, job);
    try {
      await job.promise;
      const result = await sendMedia(supabase, id, item.kind, path, item);
      if (result.error) throw new Error(result.error);
      setUploads((cur) => cur.filter((u) => u.localId !== item.localId));
      merge(await fetchMessages(supabase, id, lastAt.current));
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    } catch (e) {
      update({ error: e instanceof Error ? e.message : "Couldn't send. Try again." });
    } finally {
      uploading.current.delete(item.localId);
    }
  }

  function dropUpload(localId: string) {
    uploading.current.get(localId)?.abort();
    setUploads((cur) => cur.filter((u) => u.localId !== localId));
  }

  async function toggleSharing(allowed: boolean) {
    setBusy(true);
    setError(null);
    const result = await setMembersCanShareEvents(supabase, id, allowed);
    if (result.error) setError(result.error);
    await info.refetch();
    setBusy(false);
  }

  // The events shared in this chat, loaded with your own rights.
  const sharedIds = (messages ?? []).filter((m) => m.kind === "event" && !m.deleted);
  const eventIds = sharedIds.map((m) => m.event_id).filter((x): x is string => !!x).sort();
  const socialIds = sharedIds.map((m) => m.social_event_id).filter((x): x is string => !!x).sort();
  const shared = useQuery({
    queryKey: ["shared-events", id, eventIds.join(","), socialIds.join(",")],
    enabled: eventIds.length + socialIds.length > 0,
    queryFn: () => loadSharedEvents(supabase, eventIds, socialIds),
  });
  // Links to this chat's photos and videos (each lasts an hour).
  const mediaPaths = (messages ?? []).map((m) => m.media_path).filter((x): x is string => !!x).sort();
  const media = useQuery({
    queryKey: ["chat-media", id, mediaPaths.join(",")],
    enabled: mediaPaths.length > 0,
    staleTime: 45 * 60_000,
    queryFn: () => chatMediaUrls(supabase, mediaPaths),
  });

  // A photo or video starting to upload, or failing: show it (and its progress or error).
  const uploadState = uploads.map((u) => `${u.localId}:${u.error ? "x" : ""}`).join(",");
  useEffect(() => {
    if (uploadState) scroll.current?.scrollToEnd({ animated: true });
  }, [uploadState]);

  // Cards are taller than their placeholder once loaded: keep the newest message in view.
  useEffect(() => {
    if (shared.data) scroll.current?.scrollToEnd({ animated: false });
  }, [shared.data]);

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
              {header?.isAdmin && (
                <View className="min-h-14 flex-row items-center gap-3 border-b border-line px-4 py-2">
                  <Icon name="calendar-outline" size={20} color={colors.ink} />
                  <View className="flex-1">
                    <T variant="semibold">Allow members to share events</T>
                    <Muted className="text-xs">{header.membersCanShare ? "Everyone in the chat can share events." : "Only admins can share events."}</Muted>
                  </View>
                  <Switch value={header.membersCanShare} onValueChange={(v) => void toggleSharing(v)} disabled={busy} trackColor={{ true: colors.brand }} accessibilityLabel="Allow members to share events" testID="share-setting" />
                </View>
              )}
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
              const firstInRun = newDay || prev?.sender_id !== m.sender_id || prev?.kind === "left" || prev?.kind === "rejoined";
              // "Rhys left" / "Rhys rejoined": a small note, not a bubble.
              if (m.kind === "left" || m.kind === "rejoined") {
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
                      {(m.kind === "photo" || m.kind === "video") && !m.deleted ? (
                        <View className={mine ? "items-end" : "items-start"}>
                          <MediaPreview
                            kind={m.kind}
                            url={m.media_path ? (media.data?.get(m.media_path) ?? null) : null}
                            width={m.media_width}
                            height={m.media_height}
                            durationMs={m.media_duration_ms}
                            onOpen={() => {
                              const url = m.media_path ? media.data?.get(m.media_path) : null;
                              if (url && (m.kind === "photo" || m.kind === "video")) setViewer({ kind: m.kind, url });
                            }}
                            onLongPress={() => setMenuFor(menuFor === m.id ? null : m.id)}
                            testID={`media-${m.id}`}
                          />
                          <Muted className="mt-0.5 px-1 text-[10px]">{time.format(new Date(m.created_at))}</Muted>
                        </View>
                      ) : m.kind === "event" && !m.deleted ? (
                        <View className={mine ? "items-end" : "items-start"}>
                          <SharedEventCard event={shared.data?.get((m.event_id ?? m.social_event_id)!) ?? (shared.isPending ? undefined : null)} onLongPress={() => setMenuFor(menuFor === m.id ? null : m.id)} testID={`shared-event-${m.id}`} />
                          <Muted className="mt-0.5 px-1 text-[10px]">{time.format(new Date(m.created_at))}</Muted>
                        </View>
                      ) : (
                      <Pressable onPress={() => setMenuFor(menuFor === m.id ? null : m.id)} className={`rounded-2xl px-3.5 py-2 ${m.deleted ? "border border-dashed border-line" : mine ? "bg-brand" : "border border-line bg-surface"}`} testID={`message-${m.id}`}>
                        <T className={m.deleted ? "text-sm italic text-muted" : mine ? "text-brand-ink" : ""}>
                          {m.deleted ? "Message deleted" : m.body}
                          <T className={`text-[10px] ${mine ? "text-brand-ink" : "text-muted"}`}>  {time.format(new Date(m.created_at))}</T>
                        </T>
                      </Pressable>
                      )}
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
            {/* Photos and videos still uploading. */}
            {uploads.map((u) => (
              <View key={u.localId} className="mt-2 items-end" testID="upload">
                <MediaPreview kind={u.kind} url={u.kind === "photo" ? u.uri : null} width={u.width} height={u.height} durationMs={u.durationMs} dim />
                {u.error ? (
                  <View className="mt-1 items-end gap-1">
                    <T variant="semibold" className="text-xs text-danger" testID="upload-error">{u.error}</T>
                    <View className="flex-row gap-4">
                      <LinkButton onPress={() => void upload(u)} testID="upload-retry">Try again</LinkButton>
                      <LinkButton onPress={() => dropUpload(u.localId)} danger testID="upload-remove">Remove</LinkButton>
                    </View>
                  </View>
                ) : (
                  <View className="mt-1 w-40 items-end gap-1">
                    <View className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <View className="h-full rounded-full bg-brand" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                    </View>
                    <View className="flex-row items-center gap-3">
                      <Muted className="text-xs" testID="upload-progress">{u.progress >= 1 ? "Sending…" : `Uploading ${Math.round(u.progress * 100)}%`}</Muted>
                      <LinkButton onPress={() => dropUpload(u.localId)} testID="upload-cancel">Cancel</LinkButton>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
          <MediaViewer media={viewer} onClose={() => setViewer(null)} />

          <View className="border-t border-line py-3">
            {error && <T variant="semibold" className="mb-2 text-sm text-danger">{error}</T>}
            {header?.left ? (
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Muted className="flex-1 text-sm">You won&apos;t get this group&apos;s messages.</Muted>
                <Button onPress={() => void rejoin()} disabled={busy} testID="rejoin-group">{busy ? "Rejoining…" : "Rejoin group"}</Button>
              </View>
            ) : (
            <>
            {attachOpen && (
              <Card className="mb-2 p-0" testID="attach-menu">
                <Pressable onPress={() => void attach("library")} className="min-h-12 flex-row items-center gap-3 px-4 active:opacity-80" accessibilityRole="button" testID="attach-library">
                  <Icon name="images-outline" size={20} color={colors.ink} />
                  <T variant="semibold">Photo or video</T>
                </Pressable>
                {Platform.OS !== "web" && (
                  <Pressable onPress={() => void attach("camera")} className="min-h-12 flex-row items-center gap-3 border-t border-line px-4 active:opacity-80" accessibilityRole="button" testID="attach-camera">
                    <Icon name="camera-outline" size={20} color={colors.ink} />
                    <T variant="semibold">Take a photo or video</T>
                  </Pressable>
                )}
                <Muted className="border-t border-line px-4 py-2 text-xs">Videos can be up to a minute long.</Muted>
              </Card>
            )}
            <View className="flex-row items-end gap-2">
              <Pressable
                onPress={() => setAttachOpen(!attachOpen)}
                accessibilityRole="button"
                accessibilityLabel="Send a photo or video"
                hitSlop={6}
                className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface active:opacity-80"
                testID="attach"
              >
                <Icon name={attachOpen ? "close" : "add"} size={24} color={colors.ink} />
              </Pressable>
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
            </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
