import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FEATURE_REQUEST_STATUSES,
  lastEventText,
  loadAdminFeatureRequests,
  loadAdminFounding,
  loadFeatureInterestRanking,
  REQUEST_TEXT_MAX,
  setFeatureRequestStatus,
  uniShort,
  type AdminFeatureRequest,
  type AdminFoundingRow,
  type FeatureRequestStatus,
} from "@function/shared";
import { AdminTabs } from "@/components/admin-tabs";
import { BackButton } from "@/components/back-button";
import { RequestStatusPill } from "@/components/hub/request-status";
import { Select } from "@/components/select";
import { Chip } from "@/components/social/filters";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));

type Filter = FeatureRequestStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [{ value: "all", label: "All" }, ...FEATURE_REQUEST_STATUSES];

// Admin panel → Hub: what committees have asked for and how Founding
// Societies are doing. The feature requests queue (filter by status, change
// a request's status: Live pushes the society's managers), the coming-soon
// features ranked by how many societies want each, and every Founding
// Society's events since agreeing, days since its last event, prize-draw
// eligibility and badge.
export default function AdminHubScreen() {
  const { profile, loading } = useProfile();
  const admin = !!profile?.is_admin;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={"/(tabs)/me"} />
        <Heading className="mt-3">Admin panel</Heading>
        {loading ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : !admin ? (
          <Card className="mt-6"><Muted>This page is for the Function team.</Muted></Card>
        ) : (
          <>
            <AdminTabs current="hub" />
            <Requests />
            <Wanted />
            <Founding />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <View className="mt-8">
      <T variant="display" className="text-xl">{title}</T>
      {intro && <Muted className="mt-1 text-sm">{intro}</Muted>}
      <View className="mt-3 gap-3">{children}</View>
    </View>
  );
}

// ---- Feature requests ----

function Requests() {
  const [filter, setFilter] = useState<Filter>("all");
  const requests = useQuery({ queryKey: ["admin", "hub", "requests", filter], queryFn: () => loadAdminFeatureRequests(supabase, filter === "all" ? null : filter) });
  return (
    <Section title="Feature requests" intro="What committees have asked for. Change a request's status as you go; setting it to Live sends the society's managers a push if they have notifications on.">
      <View className="flex-row flex-wrap gap-2" testID="requests-filters">
        {FILTERS.map((f) => (
          <Chip key={f.value} active={filter === f.value} onPress={() => setFilter(f.value)} testID={`requests-filter-${f.value}`}>{f.label}</Chip>
        ))}
      </View>
      {requests.isPending && <Muted>Loading…</Muted>}
      {requests.isError && <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load the requests. Try again.</T>}
      {requests.data && requests.data.length === 0 && <Muted testID="requests-empty">{filter === "all" ? "No requests yet." : "No requests with this status."}</Muted>}
      {requests.data?.map((r) => <RequestCard key={r.id} request={r} />)}
    </Section>
  );
}

function RequestCard({ request }: { request: AdminFeatureRequest }) {
  const queryClient = useQueryClient();
  // The status shown is the server's (so a list loaded earlier never shows
  // an old one once it reloads), except while a change is saving.
  const [pending, setPending] = useState<FeatureRequestStatus | null>(null);
  const status = pending ?? request.status;
  const [note, setNote] = useState(request.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "hub", "requests"] }),
      queryClient.invalidateQueries({ queryKey: ["feature-requests", request.society_id] }),
    ]);

  // A new status saves straight away.
  async function changeStatus(value: string) {
    const next = value as FeatureRequestStatus;
    if (next === status) return;
    setPending(next);
    setBusy(true);
    setMessage(null);
    const r = await setFeatureRequestStatus(supabase, request.id, next);
    if (r.error) {
      setPending(null);
      setBusy(false);
      return setMessage({ text: r.error, ok: false });
    }
    setMessage({ text: next === "live" ? "Saved. Managers with notifications on get a push (the first time it goes Live)." : "Saved.", ok: true });
    // Show the new status and stay busy until the list has it, so a note
    // saved straight after can't send the old one.
    await refresh();
    setPending(null);
    setBusy(false);
  }

  // The note only: it sends the server's status, so it never changes it.
  async function saveNote() {
    setBusy(true);
    setMessage(null);
    const r = await setFeatureRequestStatus(supabase, request.id, request.status, note);
    setBusy(false);
    if (r.error) return setMessage({ text: r.error, ok: false });
    setMessage({ text: "Note saved.", ok: true });
    await refresh();
  }

  return (
    <Card className="gap-3" testID={`admin-request-${request.id}`}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2">
          <Link href={`/s/${request.society_slug}` as never} asChild>
            <Pressable testID={`request-society-${request.id}`}><T variant="semibold" className="text-brand">{request.society_name}</T></Pressable>
          </Link>
          <Muted className="text-sm">{uniShort(request.university)} · {day(request.created_at)}</Muted>
        </View>
        <RequestStatusPill status={status} testID={`admin-request-state-${request.id}`} />
      </View>
      <T className="text-base">{request.need}</T>
      {request.current_process ? <Muted className="text-sm">How they do it now: {request.current_process}</Muted> : null}
      <Muted className="text-xs">Requested by {request.requested_by_name ?? "a deleted account"}</Muted>

      <View>
        <Label>Status</Label>
        <Select
          value={status}
          options={FEATURE_REQUEST_STATUSES}
          onChange={(v) => void changeStatus(v)}
          accessibilityLabel="Status"
          testID={`request-status-${request.id}`}
        />
        <Muted className="mt-1 text-xs">Saves straight away. Setting it to Live sends the society&apos;s managers a push if they have notifications on (once per request).</Muted>
      </View>

      <View>
        <Label>Note for the committee (optional)</Label>
        <Input value={note} onChangeText={setNote} placeholder="e.g. We're building this next week" maxLength={REQUEST_TEXT_MAX} accessibilityLabel="Note for the committee" testID={`request-note-${request.id}`} />
        <Button variant="ghost" onPress={() => void saveNote()} disabled={busy || note.trim() === (request.admin_note ?? "").trim()} className="mt-2 self-start" testID={`request-note-save-${request.id}`}>Save note</Button>
      </View>
      {message && <T variant="semibold" className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`} testID={`request-message-${request.id}`}>{message.text}</T>}
    </Card>
  );
}

// ---- Wanted features ----

function Wanted() {
  const wanted = useQuery({ queryKey: ["admin", "hub", "wanted"], queryFn: () => loadFeatureInterestRanking(supabase) });
  return (
    <Section title="Wanted features" intro="Coming-soon features societies have said they want, most wanted first.">
      {wanted.isPending && <Muted>Loading…</Muted>}
      {wanted.isError && <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load the wanted features. Try again.</T>}
      {wanted.data && wanted.data.length === 0 && <Muted testID="wanted-empty">No society has asked for a coming-soon feature yet.</Muted>}
      {wanted.data && wanted.data.length > 0 && (
        <View className="overflow-hidden rounded-2xl border border-line bg-surface" testID="wanted-list">
          {wanted.data.map((w, i) => (
            <View key={w.key} className={`gap-1 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`wanted-${w.key}`}>
              <View className="flex-row items-center justify-between gap-3">
                <T variant="semibold" className="flex-1">{w.name}</T>
                <T variant="bold" className="text-sm text-brand">{w.societies} {w.societies === 1 ? "society" : "societies"}</T>
              </View>
              <Muted className="text-sm">{w.societyNames.join(", ")}</Muted>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

// ---- Founding Societies ----

// "2 of 3 events since agreeing", or the real number once past the target.
function eventsLine(f: AdminFoundingRow): string {
  if (!f.agreedAt) return "Not agreed yet";
  const counted = f.eventsSince <= f.eventsTarget ? `${f.eventsSince} of ${f.eventsTarget} events since agreeing` : `${f.eventsSince} events since agreeing (${f.eventsTarget} needed)`;
  return `${counted} · ${f.eventsWithRsvp} with someone going`;
}

function Founding() {
  const founding = useQuery({ queryKey: ["admin", "hub", "founding"], queryFn: () => loadAdminFounding(supabase) });
  return (
    <Section title="Founding Societies" intro="Events posted since agreeing, days since the last one, the prize draw (3 events, each with someone going) and the badge (on while they've posted in the last 30 days).">
      {founding.isPending && <Muted>Loading…</Muted>}
      {founding.isError && <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load the Founding Societies. Try again.</T>}
      {founding.data && founding.data.length === 0 && <Muted testID="founding-empty">No Founding Societies yet. Mark one in the Societies tab.</Muted>}
      {founding.data && founding.data.length > 0 && (
        <View className="overflow-hidden rounded-2xl border border-line bg-surface" testID="founding-list">
          {founding.data.map((f, i) => (
            <View key={f.societyId} className={`gap-1.5 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`founding-${f.societyId}`}>
              <View className="flex-row flex-wrap items-center gap-x-2">
                <Link href={`/s/${f.slug}` as never} asChild>
                  <Pressable><T variant="semibold" className="text-brand">{f.name}</T></Pressable>
                </Link>
                <Muted className="text-sm">{uniShort(f.university)}</Muted>
              </View>
              <T className="text-sm" testID={`founding-events-${f.societyId}`}>{eventsLine(f)}</T>
              <Muted className="text-sm">{lastEventText(f.daysSinceLastEvent)}{f.agreedAt ? ` · Agreed ${day(f.agreedAt)}` : ""}</Muted>
              <View className="flex-row flex-wrap gap-2">
                <Pill ok={f.eligible} testID={`founding-prize-${f.societyId}`}>{f.eligible ? "Prize draw: yes" : "Prize draw: no"}</Pill>
                <Pill ok={f.badgeActive} testID={`founding-badge-${f.societyId}`}>{f.badgeActive ? "Badge on" : "Badge off"}</Pill>
              </View>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

function Pill({ ok, testID, children }: { ok: boolean; testID?: string; children: string }) {
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${ok ? "bg-ok/10" : "border border-line"}`} testID={testID}>
      <T variant="bold" className={`text-xs ${ok ? "text-ok" : "text-muted"}`}>{children}</T>
    </View>
  );
}
