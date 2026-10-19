import { useState } from "react";
import { View } from "react-native";
import { getProfilePhotoOriginal, removeProfilePhoto, uploadProfilePhoto } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { CAN_RECROP, cropExisting, pickPhotos } from "@/components/photos/pick-photos";
import { Button, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const SIZE = 512;

// The profile picture: pick a photo and fit it in the circle, or (on the
// web) re-fit the current one later without uploading it again.
export function PhotoPicker({ myId, name, url, onChanged }: { myId: string; name: string; url: string | null; onChanged: () => Promise<unknown> }) {
  const [current, setCurrent] = useState(url);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || "That photo couldn't be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }
  const choose = () =>
    run(async () => {
      const [photo] = await pickPhotos({ count: 1, aspect: 1, shape: "circle", output: SIZE, keepOriginal: true });
      if (!photo) return;
      const result = await uploadProfilePhoto(supabase, myId, { bytes: photo.bytes, type: photo.type }, photo.original ?? null);
      if (result.error) throw new Error(result.error);
      setCurrent(result.url ?? null);
      await onChanged();
    });
  // Re-crop: start from the whole original photo if we have it, otherwise from the current picture.
  const adjust = () =>
    run(async () => {
      const source = (await getProfilePhotoOriginal(supabase, myId)) ?? current;
      if (!source) return;
      const photo = await cropExisting(source, { aspect: 1, shape: "circle", output: SIZE });
      if (!photo) return;
      const result = await uploadProfilePhoto(supabase, myId, { bytes: photo.bytes, type: photo.type }, null);
      if (result.error) throw new Error(result.error);
      setCurrent(result.url ?? null);
      await onChanged();
    });
  const remove = () =>
    run(async () => {
      await removeProfilePhoto(supabase, myId);
      setCurrent(null);
      await onChanged();
    });

  return (
    <View className="flex-row items-center gap-4">
      <Avatar name={name || "You"} url={current} size={80} />
      <View className="flex-1 gap-1.5">
        <View className="flex-row flex-wrap gap-2">
          <Button className="py-2" onPress={() => void choose()} disabled={pending} testID="change-photo">{pending ? "Working…" : current ? "Change photo" : "Add a photo"}</Button>
          {current && !pending && CAN_RECROP && <Button variant="ghost" className="py-2" onPress={() => void adjust()} testID="adjust-photo">Adjust</Button>}
          {current && !pending && <Button variant="ghost" className="py-2" onPress={() => void remove()} testID="remove-photo">Remove</Button>}
        </View>
        <Muted className="text-xs">A clear photo of you helps friends find you.</Muted>
        {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
      </View>
    </View>
  );
}
