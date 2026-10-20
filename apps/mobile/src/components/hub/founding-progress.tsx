import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { foundingProgressLine, lastEventText, loadFoundingProgress, type HubSociety } from "@function/shared";
import { Icon } from "@/components/icon";
import { Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

// A Founding Society's progress on its Hub home: events posted since
// agreeing (of 3) with a small bar, whether the Founding badge is on, days
// since the last event, and whether they're in the prize draw. Worked out by
// the database from the society's events (see founding.ts for the rules).
export function FoundingProgressCard({ hub }: { hub: HubSociety }) {
  const s = hub.society;
  const progress = useQuery({ queryKey: ["founding-progress", s.id], queryFn: () => loadFoundingProgress(supabase, s.id) });
  const p = progress.data;

  return (
    <Card className="gap-3" testID="founding-progress">
      <View className="flex-row items-center gap-2">
        <Icon name="ribbon-outline" size={20} color="#DA291C" />
        <T variant="semibold" className="text-sm text-muted">Founding Society</T>
      </View>
      {progress.isPending && <Muted>Loading…</Muted>}
      {progress.isError && <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load your progress. Try again.</T>}
      {p && !p.agreedAt && (
        <>
          <T variant="display-bold" className="text-lg" testID="founding-line">{foundingProgressLine(p)}</T>
          <Link href={`/hub/${s.id}/setup?step=founding` as never} asChild>
            <Pressable className="min-h-[32px] justify-center" testID="founding-agree-link">
              <T variant="semibold" className="text-sm text-brand">Read the agreement →</T>
            </Pressable>
          </Link>
        </>
      )}
      {p && p.agreedAt && (
        <>
          <T variant="display-bold" className="text-lg" testID="founding-line">{foundingProgressLine(p)}</T>
          <Bar done={p.eventsTarget - p.toGo} total={p.eventsTarget} />
          <View className="gap-1.5">
            <Fact ok={p.badgeActive} testID="founding-badge-state">{p.badgeActive ? "Badge on" : "Badge paused: post an event to turn it back on"}</Fact>
            <Fact ok={p.eligible} testID="founding-prize">{p.eligible ? "You're in the prize draw" : "Not in the prize draw yet"}</Fact>
            <Muted className="text-sm" testID="founding-last-event">{lastEventText(p.daysSinceLastEvent)}</Muted>
          </View>
        </>
      )}
    </Card>
  );
}

// How many of the events needed for the prize draw count so far.
function Bar({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.round((Math.max(0, Math.min(done, total)) / total) * 100) : 0;
  return (
    <View className="h-2 overflow-hidden rounded-full bg-line" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: Math.min(done, total) }} testID="founding-bar">
      <View className="h-2 rounded-full bg-brand" style={{ width: `${percent}%` }} />
    </View>
  );
}

function Fact({ ok, testID, children }: { ok: boolean; testID: string; children: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-2">
      <Icon name={ok ? "checkmark-circle" : "ellipse-outline"} size={18} color={ok ? colors.ok : "#5e5d78"} />
      <T variant="semibold" className={`flex-1 text-sm ${ok ? "text-ok" : "text-muted"}`} testID={testID}>{children}</T>
    </View>
  );
}
