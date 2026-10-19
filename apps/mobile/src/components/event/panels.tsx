import { Link } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { joinEvent, leaveEvent, saveName, type MotiveEvent, type Person } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Flag } from "@/components/flag";
import { Button, Card, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// The simpler "take part" cards of an event page: I'm going, the sign-up
// list, who's coming, the name form, and a student-hosted event's join card.

export type Tap = (run: () => Promise<{ error?: string }>) => Promise<void>;

// A link-style button that can ask "are you sure?" first.
export function LinkButton({ children, onPress, confirmText, disabled, testID, danger }: { children: string; onPress: () => void; confirmText?: string; disabled?: boolean; testID?: string; danger?: boolean }) {
  function press() {
    if (!confirmText) return onPress();
    if (Platform.OS === "web") {
      if (window.confirm(confirmText)) onPress();
      return;
    }
    Alert.alert(confirmText, undefined, [{ text: "Cancel", style: "cancel" }, { text: "Yes", style: "destructive", onPress }]);
  }
  return (
    <Pressable onPress={press} disabled={disabled} testID={testID} className={disabled ? "opacity-50" : ""}>
      <T variant="semibold" className={`text-sm ${danger ? "text-danger" : "text-muted"}`}>{children}</T>
    </Pressable>
  );
}

export function GoingPanel({ event, me, tap, busy }: { event: MotiveEvent; me: Person | null; tap: Tap; busy: boolean }) {
  return (
    <Card className="flex-row flex-wrap items-center justify-between gap-3">
      {me ? (
        <>
          <T variant="semibold"><T className="text-ok">✓</T> You&apos;re going</T>
          <LinkButton onPress={() => void tap(() => leaveEvent(supabase, event.id))} disabled={busy} testID="leave">Can&apos;t make it</LinkButton>
        </>
      ) : (
        <>
          <T variant="semibold">Coming?</T>
          <Button onPress={() => void tap(() => joinEvent(supabase, event.id, null))} disabled={busy} testID="join">I&apos;m going</Button>
        </>
      )}
    </Card>
  );
}

export function EntryPanel({ event, people, me, tap, busy }: { event: MotiveEvent; people: Person[]; me: Person | null; tap: Tap; busy: boolean }) {
  const entered = event.going_count;
  const full = event.capacity !== null && entered >= event.capacity;
  const waitlist = people.filter((p) => p.status === "waitlist");
  const myWaitPosition = me?.status === "waitlist" ? waitlist.findIndex((p) => p.userId === me.userId) + 1 : 0;
  return (
    <Card className="gap-3" testID="entry-panel">
      <View className="flex-row items-baseline justify-between gap-3">
        <T variant="display-bold" className="text-lg">Entries</T>
        <T variant="semibold" className="text-sm text-muted">{entered}{event.capacity ? ` / ${event.capacity}` : ""} entered{full ? " · Full" : ""}</T>
      </View>
      {event.capacity && (
        <View className="h-2 overflow-hidden rounded-full bg-line">
          <View className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (entered / event.capacity) * 100)}%` }} />
        </View>
      )}
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        {me?.status === "going" ? (
          <>
            <T variant="semibold"><T className="text-ok">✓</T> You&apos;re entered</T>
            <LinkButton onPress={() => void tap(() => leaveEvent(supabase, event.id))} confirmText="Withdraw your entry? If there's a waiting list, your place goes to the next person." disabled={busy} testID="leave">Withdraw</LinkButton>
          </>
        ) : me?.status === "waitlist" ? (
          <>
            <T variant="semibold">You&apos;re number {myWaitPosition} on the waiting list</T>
            <LinkButton onPress={() => void tap(() => leaveEvent(supabase, event.id))} disabled={busy} testID="leave">Leave waiting list</LinkButton>
          </>
        ) : (
          <Button onPress={() => void tap(() => joinEvent(supabase, event.id, null))} disabled={busy} testID="join">{full ? "Join the waiting list" : "Enter"}</Button>
        )}
      </View>
    </Card>
  );
}

export function WhosComing({ people, meId, numbered, finished }: { people: Person[]; meId: string; numbered: boolean; finished: boolean }) {
  const ordered = finished && people.some((p) => p.finishPosition) ? [...people].sort((a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999)) : people;
  return (
    <Card testID="whos-coming">
      <T variant="semibold" className="mb-3">{finished ? "Who came" : "Who's coming"} ({people.length})</T>
      <View className="gap-2">
        {ordered.map((p, i) => (
          <View key={p.userId} className="flex-row items-center gap-2">
            {numbered && <T className="w-6 text-right text-sm text-muted">{p.finishPosition ?? (finished ? "" : i + 1)}</T>}
            <Avatar name={p.name} url={p.avatarUrl} size={28} ring={p.userId === meId} />
            <T variant="semibold">{p.userId === meId ? `${p.name} (you)` : p.name}</T>
            <Flag code={p.country} size={14} />
          </View>
        ))}
      </View>
    </Card>
  );
}

// Asks for the name other members will see (e.g. at a poker table).
export function NameForm({ userId, onSaved }: { userId: string; onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveName(supabase, userId, name);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    await onSaved();
    setSaving(false);
  }
  return (
    <Card className="gap-2" testID="name-form">
      <T variant="semibold">First, what&apos;s your name?</T>
      <Muted className="text-sm">Other members see this when you join events.</Muted>
      <View className="flex-row gap-2">
        <Input value={name} onChangeText={setName} placeholder="First and last name" maxLength={60} className="flex-1" testID="your-name" />
        <Button onPress={() => void save()} disabled={saving} testID="save-name">{saving ? "Saving…" : "Save"}</Button>
      </View>
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </Card>
  );
}

export type HostedStatus = "going" | "waitlist" | "requested" | null;

// A student-hosted event: your status and the join button (the guest side).
export function HostedJoinCard({ event, mine, hostName, full, tap, busy, chat }: { event: MotiveEvent; mine: HostedStatus; hostName: string; full: boolean; tap: Tap; busy: boolean; chat?: ReactNode }) {
  return (
    <Card className="flex-row flex-wrap items-center justify-between gap-3" testID="hosted-join">
      {mine === "going" ? (
        <>
          <T variant="semibold"><T className="text-ok">✓</T> You&apos;re going</T>
          <View className="flex-row flex-wrap items-center gap-3">
            {chat}
            <LinkButton onPress={() => void tap(() => leaveEvent(supabase, event.id))} confirmText="Can't make it? You'll lose your place." disabled={busy} testID="leave">Can&apos;t make it</LinkButton>
          </View>
        </>
      ) : mine === "requested" ? (
        <>
          <T variant="semibold" className="flex-1">Request sent. {hostName} will let you know.</T>
          <LinkButton onPress={() => void tap(() => leaveEvent(supabase, event.id))} disabled={busy} testID="leave">Cancel request</LinkButton>
        </>
      ) : mine === "waitlist" ? (
        <>
          <T variant="semibold">You&apos;re on the waiting list</T>
          <LinkButton onPress={() => void tap(() => leaveEvent(supabase, event.id))} disabled={busy} testID="leave">Leave waiting list</LinkButton>
        </>
      ) : (
        <>
          <T variant="semibold" className="flex-1">{event.join_mode === "approval" ? `${hostName} approves who comes.` : full ? "It's full." : "Coming?"}</T>
          <Button onPress={() => void tap(() => joinEvent(supabase, event.id, null))} disabled={busy} testID="join">
            {event.join_mode === "approval" ? "Ask to join" : full ? "Join the waiting list" : "I'm going"}
          </Button>
        </>
      )}
    </Card>
  );
}

// A list of people with a title, like the website's bordered lists.
export function PeopleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <T variant="display" className="text-xl">{title}</T>
      <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">{children}</View>
    </View>
  );
}

export function PersonRow({ id, name, avatarUrl, detail, children, first, country }: { id: string; name: string; avatarUrl?: string | null; detail?: string | null; children?: ReactNode; first?: boolean; country?: string | null }) {
  return (
    <View className={`flex-row items-center gap-3 px-4 py-3 ${first ? "" : "border-t border-line"}`}>
      <Link href={`/u/${id}` as never} asChild>
        <Pressable className="min-w-0 flex-1 flex-row items-center gap-3">
          <Avatar name={name} url={avatarUrl} size={40} />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <T variant="semibold" numberOfLines={1} className="shrink">{name}</T>
              <Flag code={country} size={14} />
            </View>
            {detail && <Muted className="text-xs" numberOfLines={1}>{detail}</Muted>}
          </View>
        </Pressable>
      </Link>
      {children}
    </View>
  );
}
