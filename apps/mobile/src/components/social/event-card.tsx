import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { categoryInfo, formatCost, formatWhen, spacesLeft, type MemberStatus, type SocialEvent } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Card, Muted, T } from "@/components/ui";

const STATUS: Record<MemberStatus, { label: string; box: string; text: string }> = {
  going: { label: "Going ✓", box: "bg-ok/10", text: "text-ok" },
  pending: { label: "Pending", box: "bg-amber-100", text: "text-amber-800" },
  declined: { label: "Declined", box: "bg-danger/10", text: "text-danger" },
};

export function Pill({ children, box = "bg-brand-soft", text = "text-brand" }: { children: string; box?: string; text?: string }) {
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${box}`}>
      <T variant="bold" className={`text-xs ${text}`}>{children}</T>
    </View>
  );
}

// One event in a list: title, category, when, where, spaces and Open/Private.
export function SocialEventCard({ event, host, status, pending = 0, note }: { event: SocialEvent; host?: { name: string; avatar_url: string | null } | null; status?: MemberStatus | null; pending?: number; note?: string }) {
  const cat = categoryInfo(event.category);
  const left = spacesLeft(event);
  const full = left === 0;
  const cost = formatCost(event.cost_pence);
  return (
    <Link href={`/social/${event.id}` as never} asChild>
      <Pressable testID={`social-${event.id}`}>
        <Card className={`gap-3 p-4 ${event.is_cancelled ? "opacity-60" : ""}`}>
          {note && (
            <View className="self-start rounded-full bg-brand-soft px-2.5 py-0.5">
              <T variant="bold" className="text-xs text-brand" testID="recommend-note">{note}</T>
            </View>
          )}
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <T variant="bold" className="text-xs uppercase tracking-wide text-brand">{cat.label}</T>
              <T variant="display-bold" className="mt-0.5 text-lg leading-6">{event.title}</T>
            </View>
            <View className={`rounded-full px-2.5 py-1 ${event.is_private ? "bg-ink" : "bg-brand-soft"}`}>
              <T variant="bold" className={`text-xs ${event.is_private ? "text-bg" : "text-brand"}`}>{event.is_private ? "Private" : "Open"}</T>
            </View>
          </View>
          <View className="gap-0.5">
            <T variant="semibold" className="text-sm">{formatWhen(event.starts_at)}</T>
            <Muted className="text-sm" numberOfLines={1}>{event.area}</Muted>
          </View>
          <View className="flex-row flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            {host ? (
              <View className="flex-row items-center gap-2">
                <Avatar name={host.name} url={host.avatar_url} size={22} />
                <Muted className="text-sm" numberOfLines={1}>{host.name}</Muted>
              </View>
            ) : (
              <View />
            )}
            <View className="flex-row flex-wrap items-center gap-1.5">
              {event.is_cancelled && <Pill box="bg-danger/10" text="text-danger">Cancelled</Pill>}
              {event.friends_only && <Pill>Friends only</Pill>}
              {pending > 0 && <Pill box="bg-live" text="text-white">{`${pending} request${pending === 1 ? "" : "s"}`}</Pill>}
              {cost && <Pill>{cost}</Pill>}
              {status && <Pill box={STATUS[status].box} text={STATUS[status].text}>{STATUS[status].label}</Pill>}
              <Pill box={full ? "bg-danger/10" : "bg-ok/10"} text={full ? "text-danger" : "text-ok"}>{full ? "Full" : `${left} of ${event.spaces} spaces left`}</Pill>
            </View>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
