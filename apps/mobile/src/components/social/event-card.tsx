import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { CATEGORY_STYLE, categoryInfo, formatCost, formatWhen, socialToMapCategory, spacesLeft, type MemberStatus, type SocialEvent } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { PIN_ICON } from "@/components/map/types";
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

// The weekday ("FRI") and day of the month ("24") in London, for the date square.
const dayParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso));
  return { weekday: parts.find((p) => p.type === "weekday")?.value.toUpperCase() ?? "", day: parts.find((p) => p.type === "day")?.value ?? "" };
};

// One event in a list, laid out like an events app: a picture tile with the
// date on it, then the title, who's hosting, when, and how many are going.
// Plans have no photo, so the tile is the category's colour and icon.
export function SocialEventCard({ event, host, status, pending = 0, note }: { event: SocialEvent; host?: { name: string; avatar_url: string | null } | null; status?: MemberStatus | null; pending?: number; note?: string }) {
  const cat = categoryInfo(event.category);
  const look = CATEGORY_STYLE[socialToMapCategory(event.category)];
  const left = spacesLeft(event);
  const full = left === 0;
  const cost = formatCost(event.cost_pence);
  const { weekday, day } = dayParts(event.starts_at);
  const hasPills = Boolean(event.is_cancelled || status || pending > 0 || event.friends_only || cost || event.is_private);
  return (
    <Link href={`/social/${event.id}` as never} asChild>
      <Pressable testID={`social-${event.id}`}>
        <Card className={`flex-row items-start gap-3 p-3 ${event.is_cancelled ? "opacity-60" : ""}`}>
          <View className="h-[88px] w-[88px] items-center justify-center rounded-xl" style={{ backgroundColor: look.colour }} accessibilityLabel={cat.label}>
            <View className="absolute bottom-2 right-2">
              <Icon name={PIN_ICON[socialToMapCategory(event.category)] as never} size={24} color="#FFFFFF" />
            </View>
            <View className="absolute left-1.5 top-1.5 min-w-[34px] items-center rounded-lg bg-white px-1 py-0.5">
              <T variant="caption2" className="text-brand">{weekday}</T>
              <T variant="headline" className="-mt-0.5 text-[#0A0A0A]">{day}</T>
            </View>
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            {note && (
              <View className="mb-1 self-start rounded-full bg-brand-soft px-2 py-0.5">
                <T variant="bold" className="text-[11px] text-brand" testID="recommend-note" numberOfLines={1}>{note}</T>
              </View>
            )}
            <T variant="footnote" className="font-sans-semibold text-brand" numberOfLines={1}>{formatWhen(event.starts_at)}</T>
            <T variant="headline" numberOfLines={2}>{event.title}</T>
            <Muted className="text-[13px]" numberOfLines={1}>{host ? `${host.name} · ${event.area}` : event.area}</Muted>
            <View className="mt-1 flex-row items-center gap-1.5">
              {host && <Avatar name={host.name} url={host.avatar_url} size={18} />}
              <Muted className="text-[13px]">{`${event.going_count} going`}</Muted>
              <Muted className="text-[13px]">·</Muted>
              <T variant="footnote" className={full ? "text-danger" : "text-ok"}>{full ? "Full" : `${left} of ${event.spaces} left`}</T>
            </View>
            {hasPills && (
              <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
                {event.is_cancelled && <Pill box="bg-danger/10" text="text-danger">Cancelled</Pill>}
                {status && <Pill box={STATUS[status].box} text={STATUS[status].text}>{STATUS[status].label}</Pill>}
                {pending > 0 && <Pill box="bg-live" text="text-white">{`${pending} request${pending === 1 ? "" : "s"}`}</Pill>}
                {event.friends_only && <Pill>Friends only</Pill>}
                {cost && <Pill>{cost}</Pill>}
                {event.is_private && <Pill box="bg-ink" text="text-bg">Private</Pill>}
              </View>
            )}
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
