import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { guessTwoTruths, openFriendChat, removeFriend, respondToFriendRequest, sendFriendRequest, type Relation, type TwoTruthsView } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { ReportSheet } from "@/components/safety/report-sheet";
import { Button, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// Pieces of someone's profile page: the friend button, the
// photo gallery (with "Report photo"), the profile picture zoom and the Two truths game.

// Add friend / Requested / Accept / Friends, depending on how you're connected.
export function FriendButton({ id, relation, compact = false, onChanged }: { id: string; relation: Relation; compact?: boolean; onChanged?: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<Relation>(relation);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const size = compact ? "px-3 py-1.5" : "px-4 py-2";
  if (state === "self") return null;

  async function run(fn: () => Promise<{ error?: string; result?: string }>, next: Relation) {
    setPending(true);
    setError(null);
    const result = await fn();
    setPending(false);
    if (result.error) setError(result.error);
    else {
      setState(result.result === "accepted" ? "friends" : next);
      onChanged?.();
    }
  }
  async function message() {
    const thread = await openFriendChat(supabase, id);
    if (thread) router.push(`/chats/${thread}` as never);
  }

  return (
    <View className="items-end gap-1">
      <View className="flex-row flex-wrap justify-end gap-2">
        {state === "none" && <Button className={size} disabled={pending} onPress={() => void run(() => sendFriendRequest(supabase, id), "outgoing")} testID="add-friend">+ Add friend</Button>}
        {state === "outgoing" && <Button variant="ghost" className={size} disabled={pending} onPress={() => void run(() => removeFriend(supabase, id), "none")} testID="requested">Requested ✓</Button>}
        {state === "incoming" && (
          <>
            <Button className={size} disabled={pending} onPress={() => void run(() => respondToFriendRequest(supabase, id, true), "friends")} testID="accept-friend">Accept</Button>
            <Button variant="ghost" className={size} disabled={pending} onPress={() => void run(() => respondToFriendRequest(supabase, id, false), "none")} testID="decline-friend">Decline</Button>
          </>
        )}
        {state === "friends" && (
          <>
            <Button className={size} onPress={() => void message()} testID="message-friend">Message</Button>
            {!compact && <Button variant="ghost" className={size} disabled={pending} onPress={() => void run(() => removeFriend(supabase, id), "none")} testID="friends">Friends ✓</Button>}
          </>
        )}
      </View>
      {error && <T variant="semibold" className="text-xs text-danger">{error}</T>}
    </View>
  );
}


// The profile picture; tap it to see it big.
export function AvatarZoom({ name, url, size }: { name: string; url: string | null; size: number }) {
  const [open, setOpen] = useState(false);
  if (!url) return <Avatar name={name} url={url} size={size} />;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel={`See ${name}'s photo larger`}>
        <Avatar name={name} url={url} size={size} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 items-center justify-center gap-4 bg-black/85 p-6" onPress={() => setOpen(false)}>
          <Image source={{ uri: url }} style={{ width: "100%", maxWidth: 384, aspectRatio: 1, borderRadius: 999 }} contentFit="cover" />
          <T variant="display-bold" className="text-lg text-white">{name}</T>
        </Pressable>
      </Modal>
    </>
  );
}

// Swipe sideways through someone's current photos.
export function PhotoGallery({ photos, canReport }: { photos: { id: string; url: string | null }[]; canReport: boolean }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 32, 640);
  const [index, setIndex] = useState(0);
  const [reporting, setReporting] = useState<string | null>(null);
  const current = photos[index];
  return (
    <View>
      <View className="overflow-hidden rounded-2xl bg-line" style={{ width: w }} testID="gallery">
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / w))}>
          {photos.map((p, i) => (
            <View key={p.id} style={{ width: w, aspectRatio: 4 / 5 }}>
              {p.url && <Image source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} />}
            </View>
          ))}
        </ScrollView>
        {photos.length > 1 && (
          <View className="absolute inset-x-0 bottom-2 flex-row justify-center gap-1.5">
            {photos.map((p, i) => (
              <View key={p.id} className={`h-2 w-2 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`} />
            ))}
          </View>
        )}
      </View>
      {canReport && current && (
        <View className="mt-2 items-end">
          <Pressable onPress={() => setReporting(current.id)} hitSlop={8} className="min-h-8 justify-center" testID="report-photo">
            <Muted className="text-xs font-sans-semibold">Report photo</Muted>
          </Pressable>
        </View>
      )}
      <ReportSheet target={reporting ? { kind: "photo", id: reporting } : null} what="this photo" onClose={() => setReporting(null)} />
    </View>
  );
}

// Someone's Two truths and a lie: tap the one you think is the lie (one go),
// then see the answer and how many people got it right.
export function TwoTruthsGame({ person, initial }: { person: string; initial: TwoTruthsView }) {
  const [view, setView] = useState(initial);
  const [picking, setPicking] = useState<number | null>(null);
  const revealed = view.lie !== null;
  const pct = view.total ? Math.round(((view.right ?? 0) / view.total) * 100) : null;

  async function guess(n: number) {
    setPicking(n);
    const next = await guessTwoTruths(supabase, person, n);
    if (next) setView(next);
    setPicking(null);
  }

  return (
    <View testID="two-truths-game">
      {!revealed && <T variant="semibold" className="mb-1.5 text-xs text-brand">Tap the one you think is the lie</T>}
      <View className="gap-1.5">
        {view.statements.map((s) => {
          const isLie = revealed && s.n === view.lie;
          const mine = view.my_pick === s.n;
          return revealed ? (
            <View key={s.n} className={`flex-row items-center justify-between gap-2 rounded-lg px-3 py-2 ${isLie ? "bg-danger/10" : "bg-surface"}`}>
              <T variant="semibold" className={`flex-1 text-sm ${isLie ? "text-danger" : ""}`}>{s.text}</T>
              <T variant="bold" className={`text-[11px] ${isLie ? "text-danger" : ""}`}>{isLie ? "Lie" : "True"}{mine && !view.own ? " · your pick" : ""}</T>
            </View>
          ) : (
            <Pressable key={s.n} disabled={picking !== null} onPress={() => void guess(s.n)} className={`rounded-lg border bg-surface px-3 py-2 ${picking === s.n ? "border-brand" : "border-line"}`} testID={`guess-${s.n}`}>
              <T variant="semibold" className="text-sm">{s.text}</T>
            </Pressable>
          );
        })}
      </View>
      {revealed && (
        <Muted className="mt-2 text-xs font-sans-semibold" testID="two-truths-result">
          {view.own ? (view.total ? `${view.total} ${view.total === 1 ? "person has" : "people have"} played · ${pct}% guessed right` : "Nobody has played yet.") : `${view.my_pick === view.lie ? "You got it!" : "Not quite."} ${pct}% guessed right (${view.total} played)`}
        </Muted>
      )}
    </View>
  );
}

export { Link };
