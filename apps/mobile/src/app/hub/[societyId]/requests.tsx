import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { loadSocietyFeatureRequests, REQUEST_TEXT_MAX, submitFeatureRequest, type FeatureRequest, type HubSociety } from "@function/shared";
import { BigButton, HubGate, HubLayout } from "@/components/hub/hub-layout";
import { RequestStatusPill } from "@/components/hub/request-status";
import { Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));

// The Hub's Requests page: ask the Function team for a feature built around
// how your society runs ("What do you need?", "How do you do it now?"), and
// see each request you've sent and where it is (New, Building, Live or
// Declined). Only the society's managers can send requests; the database
// checks that too.
export default function HubRequestsScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  return (
    <HubGate societyId={societyId}>
      {(hub) => (
        <HubLayout hub={hub} current="requests">
          <Requests hub={hub} />
        </HubLayout>
      )}
    </HubGate>
  );
}

function Requests({ hub }: { hub: HubSociety }) {
  const s = hub.society;
  const requests = useQuery({ queryKey: ["feature-requests", s.id], queryFn: () => loadSocietyFeatureRequests(supabase, s.id) });

  return (
    <View className="gap-6">
      <View>
        <Heading>Requests</Heading>
        <Muted className="mt-1">Tell us what would make running {s.name} easier. We read every request and build features around how societies run.</Muted>
      </View>

      {hub.isCommittee ? (
        <RequestForm hub={hub} />
      ) : (
        <Card testID="request-committee-only"><Muted>Only the society&apos;s managers can send requests.</Muted></Card>
      )}

      <View>
        <T variant="display-bold" className="text-lg">Your requests</T>
        {requests.isPending && <Muted className="mt-2">Loading…</Muted>}
        {requests.isError && <T variant="semibold" className="mt-2 text-sm text-danger">Couldn&apos;t load your requests. Try again.</T>}
        {requests.data && requests.data.length === 0 && <Muted className="mt-2" testID="requests-none">No requests yet.</Muted>}
        {requests.data && requests.data.length > 0 && (
          <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface" testID="request-list">
            {requests.data.map((r, i) => <RequestRow key={r.id} request={r} first={i === 0} />)}
          </View>
        )}
      </View>
    </View>
  );
}

function RequestForm({ hub }: { hub: HubSociety }) {
  const s = hub.society;
  const queryClient = useQueryClient();
  const [need, setNeed] = useState("");
  const [now, setNow] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const founding = s.is_founding && !!hub.agreement;

  async function send() {
    setError(null);
    setSent(false);
    setSending(true);
    const r = await submitFeatureRequest(supabase, s.id, need, now);
    setSending(false);
    if (r.error) return setError(r.error);
    setNeed("");
    setNow("");
    setSent(true);
    await queryClient.invalidateQueries({ queryKey: ["feature-requests", s.id] });
  }

  return (
    <Card className="gap-4" testID="request-form">
      <View>
        <T variant="display-bold" className="text-lg">Request a feature</T>
        {founding && <Muted className="mt-1 text-sm">You&apos;re a Founding Society, so we aim to build one feature around how you run within 24 hours of your request.</Muted>}
      </View>
      <View>
        <Label>What do you need?</Label>
        <Input
          value={need}
          onChangeText={(t) => {
            setNeed(t);
            setSent(false);
          }}
          placeholder="e.g. Check people in at the door with a QR code"
          multiline
          maxLength={REQUEST_TEXT_MAX}
          className="min-h-[96px]"
          style={{ textAlignVertical: "top" }}
          accessibilityLabel="What do you need?"
          testID="request-need"
        />
      </View>
      <View>
        <Label>How do you do it now? (optional)</Label>
        <Input
          value={now}
          onChangeText={setNow}
          placeholder="e.g. A printed list and a pen"
          multiline
          maxLength={REQUEST_TEXT_MAX}
          className="min-h-[72px]"
          style={{ textAlignVertical: "top" }}
          accessibilityLabel="How do you do it now?"
          testID="request-now"
        />
      </View>
      <BigButton onPress={() => void send()} disabled={sending || need.trim().length === 0} testID="request-send">{sending ? "Sending…" : "Send request"}</BigButton>
      {error && <T variant="semibold" className="text-sm text-danger" testID="request-error">{error}</T>}
      {sent && <T variant="semibold" className="rounded-xl bg-ok/10 px-4 py-3 text-ok" testID="request-thanks">Thanks. We&apos;ll be in touch.</T>}
    </Card>
  );
}

function RequestRow({ request, first }: { request: FeatureRequest; first: boolean }) {
  return (
    <View className={`gap-1.5 px-4 py-3 ${first ? "" : "border-t border-line"}`} testID={`request-${request.id}`}>
      <View className="flex-row items-start justify-between gap-3">
        <T variant="semibold" className="flex-1">{request.need}</T>
        <RequestStatusPill status={request.status} testID={`request-state-${request.id}`} />
      </View>
      {request.current_process ? <Muted className="text-sm">How you do it now: {request.current_process}</Muted> : null}
      {request.admin_note ? <T className="text-sm" testID={`request-note-${request.id}`}>From Function: {request.admin_note}</T> : null}
      <Muted className="text-xs">Sent {day(request.created_at)}{request.status_changed_at && request.status !== "new" ? ` · Updated ${day(request.status_changed_at)}` : ""}</Muted>
    </View>
  );
}
