import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { adminDeletePastEvents, adminListEvents, adminPastEventsSummary, DEFAULT_ADMIN_EVENT_FILTERS, DEFAULT_CLEANUP_DAYS, formatEventTime, type AdminEventFilters } from "@function/shared";
import { AdminTabs } from "@/components/admin-tabs";
import { BackButton } from "@/components/back-button";
import { Chip } from "@/components/social/filters";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

// Admin panel → Events: every society event and Social plan with filters,
// and "Delete past events" (ended more than 90 days ago, images included),
// which shows the numbers and asks before doing anything. Events with
// published poker results and the LSE Poker Society's events are never
// touched here; their own committee can clear those from their dashboard.
export default function AdminEventsScreen() {
  const { profile, loading } = useProfile();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AdminEventFilters>(DEFAULT_ADMIN_EVENT_FILTERS);
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q })), 250);
    return () => clearTimeout(t);
  }, [q]);
  const events = useQuery({ queryKey: ["admin", "events", filters], queryFn: () => adminListEvents(supabase, filters), enabled: !!profile?.is_admin });
  const set = (changes: Partial<AdminEventFilters>) => setFilters((f) => ({ ...f, ...changes }));

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={"/(tabs)/me"} />
        <Heading className="mt-3">Admin panel</Heading>
        {loading ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : !profile?.is_admin ? (
          <Card className="mt-6"><Muted>This page is for the Function team.</Muted></Card>
        ) : (
          <>
            <AdminTabs current="events" />

            <Cleanup onDone={() => void queryClient.invalidateQueries({ queryKey: ["admin", "events"] })} />

            <T variant="display" className="mt-8 text-xl">All events</T>
            <Input value={q} onChangeText={setQ} placeholder="Search by title or society" autoCapitalize="none" autoCorrect={false} className="mt-3" accessibilityLabel="Search events" testID="admin-event-search" />
            <View className="mt-3 flex-row flex-wrap gap-2">
              <Chip active={filters.scope === "upcoming"} onPress={() => set({ scope: "upcoming" })} testID="admin-scope-upcoming">Upcoming</Chip>
              <Chip active={filters.scope === "past"} onPress={() => set({ scope: "past" })} testID="admin-scope-past">Past</Chip>
              <Chip active={filters.scope === "all"} onPress={() => set({ scope: "all" })} testID="admin-scope-all">All</Chip>
              <Chip active={!filters.includeCancelled} onPress={() => set({ includeCancelled: !filters.includeCancelled })} testID="admin-hide-cancelled">Hide cancelled</Chip>
            </View>
            {events.isError && <T variant="semibold" className="mt-3 text-sm text-danger">Couldn&apos;t load events. Try again.</T>}
            <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface" testID="admin-event-list">
              {(events.data ?? []).map((e, i) => (
                <Link key={`${e.kind}-${e.id}`} href={e.href as never} asChild>
                  <Pressable className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`admin-event-${e.id}`}>
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <T variant="bold" className="text-xs uppercase tracking-wide text-brand">{e.kind === "social" ? "Social plan" : "Society event"}</T>
                      {e.is_cancelled && <Tag>Cancelled</Tag>}
                      {e.is_hidden && <Tag>Hidden</Tag>}
                      {e.results_published && <Tag>Results published</Tag>}
                    </View>
                    <T variant="semibold" numberOfLines={1}>{e.title}</T>
                    <Muted className="text-xs" numberOfLines={1}>
                      {formatEventTime(e.starts_at, e.ends_at)} · {e.society_name ?? (e.host_name ? `Hosted by ${e.host_name}` : "Hosted by a student")} · {e.going} going
                    </Muted>
                  </Pressable>
                </Link>
              ))}
              {events.data && events.data.length === 0 && <Muted className="px-4 py-3 text-sm">No events match.</Muted>}
              {events.isPending && <Muted className="px-4 py-3 text-sm">Loading…</Muted>}
              {events.data && events.data.length >= 200 && <Muted className="px-4 py-3 text-xs">Showing the first 200. Narrow it down with the search.</Muted>}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <View className="rounded-full bg-danger/10 px-2 py-0.5">
      <T variant="bold" className="text-[11px] text-danger">{children}</T>
    </View>
  );
}

// Count first, confirm, then delete.
function Cleanup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"idle" | "counting" | "confirm" | "deleting" | "done">("idle");
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof adminPastEventsSummary>> | null>(null);
  const [result, setResult] = useState<{ society_events: number; social_events: number; images: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function count() {
    setError(null);
    setStep("counting");
    try {
      setSummary(await adminPastEventsSummary(supabase, DEFAULT_CLEANUP_DAYS));
      setStep("confirm");
    } catch {
      setError("Couldn't count them. Try again.");
      setStep("idle");
    }
  }
  async function run() {
    setStep("deleting");
    const r = await adminDeletePastEvents(supabase, DEFAULT_CLEANUP_DAYS);
    if (r.error) {
      setError(r.error);
      setStep("confirm");
      return;
    }
    setResult(r.deleted ?? null);
    setStep("done");
    onDone();
  }
  const total = summary ? summary.society_events + summary.social_events : 0;
  return (
    <Card className="mt-6 gap-3" testID="admin-cleanup">
      <View>
        <T variant="display-bold" className="text-lg">Delete past events</T>
        <Muted className="text-sm">Removes society events and Social plans that ended more than {DEFAULT_CLEANUP_DAYS} days ago, and their images, so old data doesn&apos;t pile up. Events with published poker results, and the LSE Poker Society&apos;s events, are left alone.</Muted>
      </View>
      {step === "idle" && <Button variant="ghost" className="self-start" onPress={() => void count()} testID="cleanup-count">See what would be deleted</Button>}
      {step === "counting" && <Muted>Counting…</Muted>}
      {(step === "confirm" || step === "deleting") && summary && (
        <View className="gap-3" testID="cleanup-summary">
          <T variant="semibold">
            {total === 0 ? "Nothing to delete." : `${summary.society_events} society ${summary.society_events === 1 ? "event" : "events"} and ${summary.social_events} Social ${summary.social_events === 1 ? "plan" : "plans"} (${summary.images} ${summary.images === 1 ? "image" : "images"}).`}
          </T>
          {(summary.skipped_results > 0 || summary.skipped_protected > 0) && (
            <Muted className="text-sm">Left alone: {summary.skipped_results} with published results, {summary.skipped_protected} from the LSE Poker Society.</Muted>
          )}
          <View className="flex-row flex-wrap gap-2">
            {total > 0 && <Button onPress={() => void run()} disabled={step === "deleting"} testID="cleanup-confirm">{step === "deleting" ? "Deleting…" : `Delete ${total} for good`}</Button>}
            <Button variant="ghost" onPress={() => setStep("idle")} disabled={step === "deleting"} testID="cleanup-cancel">{total > 0 ? "Keep them" : "Close"}</Button>
          </View>
          <Muted className="text-xs">This can&apos;t be undone.</Muted>
        </View>
      )}
      {step === "done" && result && (
        <View className="gap-2">
          <T variant="semibold" className="text-ok" testID="cleanup-done">Deleted {result.society_events} society {result.society_events === 1 ? "event" : "events"}, {result.social_events} Social {result.social_events === 1 ? "plan" : "plans"} and {result.images} {result.images === 1 ? "image" : "images"}.</T>
          <Button variant="ghost" className="self-start" onPress={() => setStep("idle")}>Done</Button>
        </View>
      )}
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </Card>
  );
}
