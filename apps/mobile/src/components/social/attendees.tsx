import { Link } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { Card, Muted, T } from "@/components/ui";

type Person = { id: string; name: string; avatar_url: string | null };

// How many faces fit on a phone before the "+N more" button.
const SHOWN = 6;

// Who's going, as small round photos. The host sits first in their own spot;
// tapping a face opens that person's profile, and "+N more" opens everyone.
// People who aren't going only see the host and how many are going.
export function Attendees({ host, people, guests }: { host: Person | null; people: Person[] | null; guests: number }) {
  const [open, setOpen] = useState(false);
  const extra = people ? people.length - SHOWN : 0;
  return (
    <Card className="mt-5" testID="attendees">
      <View className="flex-row items-start gap-4">
        {host && (
          <Link href={`/u/${host.id}` as never} asChild>
            <Pressable className="w-14 items-center gap-1">
              <Avatar name={host.name} url={host.avatar_url} size={48} ring />
              <View className="rounded-full bg-amber-100 px-2 py-0.5">
                <T variant="bold" className="text-[11px] text-amber-800">Host</T>
              </View>
            </Pressable>
          </Link>
        )}
        <View className="min-w-0 flex-1 border-l border-line pl-4">
          <Muted className="text-sm font-sans-semibold">{guests === 0 ? "Just the host so far" : `${guests + 1} going, including the host`}</Muted>
          {people && people.length > 0 ? (
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              {people.slice(0, SHOWN).map((p) => (
                <Link key={p.id} href={`/u/${p.id}` as never} asChild>
                  <Pressable accessibilityLabel={p.name}>
                    <Avatar name={p.name} url={p.avatar_url} size={36} />
                  </Pressable>
                </Link>
              ))}
              {extra > 0 && (
                <Pressable onPress={() => setOpen(true)} className="h-9 justify-center rounded-full bg-brand-soft px-3" testID="more-going">
                  <T variant="bold" className="text-sm text-brand">+{extra} more</T>
                </Pressable>
              )}
            </View>
          ) : (
            guests > 0 && !people && <Muted className="mt-1 text-sm">Join to see who.</Muted>
          )}
        </View>
      </View>

      <Modal visible={open && !!people} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          <Pressable className="max-h-[80%] rounded-t-3xl bg-surface p-5 pb-10" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between">
              <T variant="display" className="text-xl">Going ({(people?.length ?? 0) + (host ? 1 : 0)})</T>
              <Pressable onPress={() => setOpen(false)}>
                <T variant="semibold" className="text-sm text-muted">Close</T>
              </Pressable>
            </View>
            <ScrollView className="mt-3">
              {host && (
                <Link href={`/u/${host.id}` as never} asChild>
                  <Pressable className="flex-row items-center gap-3 py-2.5">
                    <Avatar name={host.name} url={host.avatar_url} size={40} ring />
                    <T variant="semibold" className="flex-1" numberOfLines={1}>{host.name}</T>
                    <View className="rounded-full bg-amber-100 px-2 py-0.5">
                      <T variant="bold" className="text-[11px] text-amber-800">Host</T>
                    </View>
                  </Pressable>
                </Link>
              )}
              {people?.map((p) => (
                <Link key={p.id} href={`/u/${p.id}` as never} asChild>
                  <Pressable className="flex-row items-center gap-3 border-t border-line py-2.5">
                    <Avatar name={p.name} url={p.avatar_url} size={40} />
                    <T variant="semibold" numberOfLines={1}>{p.name}</T>
                  </Pressable>
                </Link>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}
