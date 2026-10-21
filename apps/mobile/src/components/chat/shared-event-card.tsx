import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { formatEventTime, type SharedEvent } from "@function/shared";
import { Icon } from "@/components/icon";
import { Muted, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

// The weekday ("FRI") and day of the month ("24") in London, for the date box.
const dayParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso));
  return { weekday: parts.find((p) => p.type === "weekday")?.value.toUpperCase() ?? "", day: parts.find((p) => p.type === "day")?.value ?? "" };
};

// An event shared in a chat: the photo (or a date box), title, when, where
// and how many are going. Tapping opens the event, where you join or ask to
// join as usual. `event` is null when you can't see it (friends only,
// removed): then it says so instead; undefined while it's loading.
export function SharedEventCard({ event, onLongPress, testID }: { event: SharedEvent | null | undefined; onLongPress?: () => void; testID?: string }) {
  const { colors } = useTheme();
  if (event === undefined) {
    return (
      <View className="h-24 w-64 items-center justify-center rounded-2xl border border-line bg-surface" testID={testID}>
        <Muted className="text-sm">Loading event…</Muted>
      </View>
    );
  }
  if (!event) {
    return (
      <View className="w-64 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-3" testID={testID}>
        <View className="h-14 w-14 items-center justify-center rounded-xl bg-bg">
          <Icon name="calendar-outline" size={22} color={colors.muted} />
        </View>
        <Muted className="flex-1 text-sm">This event isn&apos;t available to you.</Muted>
      </View>
    );
  }
  const { weekday, day } = dayParts(event.starts_at);
  const tags = [event.is_cancelled && "Cancelled", event.is_private && "Private · ask to join", event.friends_only && "Friends only"].filter(Boolean) as string[];
  return (
    <Link href={event.href as never} asChild>
      <Pressable onLongPress={onLongPress} className="w-64 overflow-hidden rounded-2xl border border-line bg-surface active:opacity-80" accessibilityRole="link" accessibilityLabel={`Event: ${event.title}`} testID={testID}>
        <View className="flex-row gap-3 p-3">
          {event.image_url ? (
            <Image source={{ uri: event.image_url }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />
          ) : (
            <View className="h-16 w-16 items-center justify-center rounded-xl bg-brand-soft">
              <T variant="caption2" className="text-brand">{weekday}</T>
              <T variant="title2" className="-mt-0.5 text-brand">{day}</T>
            </View>
          )}
          <View className="min-w-0 flex-1 gap-0.5">
            <T variant="headline" numberOfLines={2}>{event.title}</T>
            <Muted className="text-[13px]" numberOfLines={1}>{formatEventTime(event.starts_at, event.ends_at)}</Muted>
            {event.place && <Muted className="text-[13px]" numberOfLines={1}>{event.place}</Muted>}
            <Muted className="text-[13px]">{event.going} going</Muted>
          </View>
        </View>
        {tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 px-3 pb-2">
            {tags.map((t) => (
              <View key={t} className={`rounded-full px-2 py-0.5 ${t === "Cancelled" ? "bg-danger/10" : "bg-brand-soft"}`}>
                <T variant="bold" className={`text-[11px] ${t === "Cancelled" ? "text-danger" : "text-brand"}`}>{t}</T>
              </View>
            ))}
          </View>
        )}
        <View className="flex-row items-center justify-between border-t border-line px-3 py-2">
          <T variant="semibold" className="text-sm text-brand">View event</T>
          <Icon name="chevron-forward" size={16} color={colors.brand} />
        </View>
      </Pressable>
    </Link>
  );
}
