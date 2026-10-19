import { Link } from "expo-router";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import { formatEventTime, isLive, mapCategoryLabel, type FeedItem } from "@function/shared";
import { Card, Muted, T } from "@/components/ui";

// One event in a list: when, where, who by, how many are going.
export function EventCard({ item }: { item: FeedItem }) {
  const live = isLive(item.startsAt, item.endsAt);
  return (
    <Link href={item.href as never} asChild>
      <Pressable testID={`event-${item.id}`}>
        <Card className="flex-row gap-3 p-4">
          {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />}
          <View className="flex-1 gap-0.5">
            <View className="flex-row flex-wrap items-center gap-1.5">
              {live && (
                <View className="rounded-full bg-live px-2 py-0.5">
                  <T variant="bold" className="text-[11px] text-white">LIVE</T>
                </View>
              )}
              <T variant="bold" className="text-xs text-brand">{mapCategoryLabel(item.category)}</T>
              {item.freeFood && <T variant="bold" className="text-xs text-brand">· Free food</T>}
            </View>
            <T variant="display-bold" className="text-lg leading-6" numberOfLines={2}>{item.title}</T>
            <Muted className="text-sm" numberOfLines={1}>{formatEventTime(item.startsAt, item.endsAt)}{item.place ? ` · ${item.place}` : ""}</Muted>
            <View className="flex-row items-center justify-between gap-2">
              <Muted className="flex-1 text-sm" numberOfLines={1}>{item.by}</Muted>
              <T variant="semibold" className="text-sm text-muted">{item.going} going</T>
            </View>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
