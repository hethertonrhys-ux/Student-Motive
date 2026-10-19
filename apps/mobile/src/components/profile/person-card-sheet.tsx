import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Modal, Pressable, View } from "react-native";
import { getCards, getProfileSocieties, loadPokerStats } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { HostPill } from "@/components/event/panels";
import { Flag } from "@/components/flag";
import { Button, Muted, T } from "@/components/ui";
import { UniTag } from "@/components/uni-tag";
import { supabase } from "@/lib/supabase";

// The small card that opens when you tap a player at a poker table: name,
// flag, uni, their societies (if they show them) and the poker stats we
// keep (games played, best tournament finish). No money.
export function PersonCardSheet({ userId, host = false, onClose }: { userId: string | null; host?: boolean; onClose: () => void }) {
  const info = useQuery({
    queryKey: ["person-card", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [cards, societies, stats] = await Promise.all([getCards(supabase, [userId!]), getProfileSocieties(supabase, userId!), loadPokerStats(supabase, userId!)]);
      return { card: cards.get(userId!) ?? null, societies, stats };
    },
  });
  const d = info.data;
  return (
    <Modal visible={!!userId} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-surface p-5 pb-10" onPress={(e) => e.stopPropagation()} testID="person-card-sheet">
          {info.isError ? (
            <View className="gap-3">
              <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load this person. Try again.</T>
              <Button variant="ghost" className="self-start py-2" onPress={onClose}>Close</Button>
            </View>
          ) : !d ? (
            <Muted>Loading…</Muted>
          ) : !d.card ? (
            <Muted>This person isn&apos;t on Function any more.</Muted>
          ) : (
            <View className="gap-4">
              <View className="flex-row items-center gap-3">
                <Avatar name={d.card.name} url={d.card.avatar_url} size={56} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <T variant="display-bold" className="shrink text-xl" numberOfLines={1}>{d.card.name}</T>
                    <Flag code={d.card.country} size={18} />
                    {host && <HostPill testID="person-card-host" />}
                  </View>
                  <View className="mt-1 flex-row flex-wrap items-center gap-2">
                    <UniTag id={d.card.university} />
                    {d.card.graduation_year && <Muted className="text-sm">Class of {d.card.graduation_year}</Muted>}
                  </View>
                </View>
              </View>
              {d.societies.length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {d.societies.map((s) => (
                    <View key={s.id} className="flex-row items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5">
                      <Avatar name={s.name} url={s.logo_url} size={20} />
                      <T variant="semibold" className="text-xs">{s.name}</T>
                    </View>
                  ))}
                </View>
              )}
              <View className="flex-row gap-3">
                <Stat label="Games played" value={String(d.stats.games_played)} />
                {d.stats.best_finish && <Stat label="Best finish" value={ordinal(d.stats.best_finish)} />}
              </View>
              <View className="flex-row gap-2">
                <Link href={`/u/${d.card.id}` as never} asChild>
                  <Button className="flex-1 py-2" onPress={onClose} testID="person-card-profile">View profile</Button>
                </Link>
                <Button variant="ghost" className="py-2" onPress={onClose}>Close</Button>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl bg-bg px-3 py-2">
      <T variant="display-bold" className="text-xl">{value}</T>
      <Muted className="text-xs">{label}</Muted>
    </View>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
