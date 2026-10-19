import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deletePhoto, getPhotos, MAX_PHOTOS, restorePhoto } from "@function/shared";
import { LinkButton } from "@/components/event/panels";
import { Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Photos you've removed from your 5: put them back, or delete them for good.
export default function ArchiveScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const photos = useQuery({ queryKey: ["my-photos", myId], queryFn: () => getPhotos(supabase, myId!), enabled: !!myId });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = (photos.data ?? []).filter((p) => p.current).length;
  const archived = (photos.data ?? []).filter((p) => !p.current);
  const canRestore = current < MAX_PHOTOS;

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["my-photos", myId] }), queryClient.invalidateQueries({ queryKey: ["my-profile", myId] }), queryClient.invalidateQueries({ queryKey: ["person", myId] })]);
    setBusy(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8">
        <Link href={"/account" as never} asChild>
          <Pressable className="self-start">
            <T variant="semibold" className="text-sm text-muted">← Your profile</T>
          </Pressable>
        </Link>
        <Heading className="mt-3">Archive</Heading>
        <Muted className="mt-1">Only you can see these. Restore one to put it back on your profile{current >= MAX_PHOTOS ? " (free up a space first: your 5 are full)" : ""}, or delete it for good.</Muted>
        {error && <T variant="semibold" className="mt-4 text-sm text-danger">{error}</T>}
        {photos.data && archived.length === 0 && (
          <Card className="mt-6 items-center py-10">
            <Muted>Nothing in your Archive yet.</Muted>
          </Card>
        )}
        <View className="mt-6 flex-row flex-wrap gap-3">
          {archived.map((p) => (
            <View key={p.id} className="w-[47%] overflow-hidden rounded-xl border border-line bg-surface" testID={`archived-${p.id}`}>
              <View className="aspect-square bg-line">{p.url && <Image source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />}</View>
              <View className="flex-row justify-between gap-2 px-2 py-2">
                <Pressable disabled={busy || !canRestore} onPress={() => void run(() => restorePhoto(supabase, p.id))} testID="restore-photo">
                  <T variant="semibold" className={`text-sm ${canRestore ? "text-brand" : "text-muted"}`}>Restore</T>
                </Pressable>
                <LinkButton onPress={() => void run(() => deletePhoto(supabase, myId!, p.id))} confirmText="Delete this photo for good?" disabled={busy} danger testID="delete-photo">Delete</LinkButton>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
