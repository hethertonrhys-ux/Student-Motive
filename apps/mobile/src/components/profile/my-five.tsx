import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { archivePhoto, recropMyFivePhoto, reorderPhotos, uploadMyFivePhoto, type ProfilePhoto } from "@function/shared";
import { LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { CAN_RECROP, cropExisting, pickPhotos } from "@/components/photos/pick-photos";
import { Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// The owner's view of their 5 photos: add, reorder and remove. Photos stay
// until removed; removed ones go to the Archive (restore or delete them there).
export function MyFive({ myId, photos, archived, onChanged }: { myId: string; photos: ProfilePhoto[]; archived: number; onChanged: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = photos.length >= 5;

  async function run(fn: () => Promise<{ error?: string } | void>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (r?.error) setError(r.error);
      else await onChanged();
    } catch (e) {
      setError((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  // Pick up to the free spaces, crop each to the shape it's shown in, then upload.
  const add = () =>
    run(async () => {
      const picked = await pickPhotos({ count: 5 - photos.length, aspect: 4 / 5, output: 1080 });
      for (const [i, photo] of picked.entries()) {
        setProgress(picked.length > 1 ? `Uploading ${i + 1} of ${picked.length}…` : "Uploading…");
        const r = await uploadMyFivePhoto(supabase, myId, { bytes: photo.bytes, type: photo.type });
        if (r.error) return r;
      }
    });
  const recrop = (p: ProfilePhoto) =>
    run(async () => {
      if (!p.url) return;
      const photo = await cropExisting(p.url, { aspect: 4 / 5, output: 1080 });
      if (!photo) return;
      return recropMyFivePhoto(supabase, myId, p.id, { bytes: photo.bytes, type: photo.type }, photo.original ?? null);
    });
  // Move a photo one place earlier or later; the first shows first on your profile.
  const move = (index: number, by: -1 | 1) =>
    run(() => {
      const ids = photos.map((p) => p.id);
      const [id] = ids.splice(index, 1);
      ids.splice(index + by, 0, id);
      return reorderPhotos(supabase, ids);
    });

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between gap-3">
        <View className="flex-1">
          <T variant="display" className="text-xl">My 5</T>
          <Muted className="text-sm">Photos of things you like or get up to. They stay until you remove them.</Muted>
        </View>
        <T variant="bold" className="text-sm text-muted" testID="my-five-count">{photos.length}/5</T>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {photos.map((p, index) => (
          <View key={p.id} className="relative aspect-square w-[31%] overflow-hidden rounded-xl border border-line bg-line" testID={`photo-${p.id}`}>
            {p.url && <Image source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />}
            {index === 0 && photos.length > 1 && (
              <View className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5">
                <T variant="bold" className="text-[11px] text-white">First</T>
              </View>
            )}
            <Pressable onPress={() => void run(() => archivePhoto(supabase, p.id))} disabled={busy} accessibilityLabel="Remove photo" className="absolute right-1.5 top-1.5 h-7 w-7 items-center justify-center rounded-full bg-black/60" testID="archive-photo">
              <Icon name="close" size={16} color="#fff" />
            </Pressable>
            {CAN_RECROP && p.url && (
              <Pressable onPress={() => void recrop(p)} disabled={busy} accessibilityLabel="Crop photo" className="absolute bottom-1.5 right-1.5 h-7 w-7 items-center justify-center rounded-full bg-black/60" testID="crop-photo">
                <Icon name="crop" size={14} color="#fff" />
              </Pressable>
            )}
            {photos.length > 1 && (
              <View className="absolute left-1.5 top-1.5 flex-row gap-1">
                {index > 0 && (
                  <Pressable onPress={() => void move(index, -1)} disabled={busy} accessibilityLabel="Move earlier" className="h-7 w-7 items-center justify-center rounded-full bg-black/60" testID="move-earlier">
                    <Icon name="chevron-back" size={16} color="#fff" />
                  </Pressable>
                )}
                {index < photos.length - 1 && (
                  <Pressable onPress={() => void move(index, 1)} disabled={busy} accessibilityLabel="Move later" className="h-7 w-7 items-center justify-center rounded-full bg-black/60" testID="move-later">
                    <Icon name="chevron-forward" size={16} color="#fff" />
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}
        {!full && (
          <Pressable onPress={() => void add()} disabled={busy} className="aspect-square w-[31%] items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line" testID="add-photos">
            <T className="text-2xl text-muted">{busy ? "…" : "+"}</T>
            <T variant="semibold" className="text-xs text-muted">{busy ? (progress ?? "Working…") : photos.length < 4 ? "Add photos" : "Add photo"}</T>
          </Pressable>
        )}
      </View>

      {photos.length > 1 && <Muted className="text-xs">Use the arrows to change the order. The first one shows first on your profile.</Muted>}
      {full && <Muted className="text-sm font-sans-semibold">All 5 spaces are full. Remove one to add another.</Muted>}
      {error && <T variant="semibold" className="text-sm text-danger" testID="photos-error">{error}</T>}
      <Link href={"/account/archive" as never} asChild>
        <Pressable className="self-start" testID="archive-link">
          <T variant="semibold" className="text-sm text-brand">Archive{archived ? ` (${archived})` : ""} →</T>
        </Pressable>
      </Link>
    </View>
  );
}

export { LinkButton };
