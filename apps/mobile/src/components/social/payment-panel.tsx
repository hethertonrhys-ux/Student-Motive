import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { chargeFor, decideRefund, feeText, isPaid, loadPlanPayments, pounds, requestRefund, type PaidStatus, type PersonCard, type SocialEvent } from "@function/shared";
import { LinkButton, PeopleSection, PersonRow, type Tap } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { Button, Card, Input, Muted, T } from "@/components/ui";
import { usePay } from "@/lib/pay";
import { supabase } from "@/lib/supabase";

// Paid plans on the plan page: your share and the Pay button, refunds, and
// who has paid. Payments only count once Stripe has confirmed them to
// Function (its webhook), so after paying this checks back for a moment.
export function PaymentPanel({ event, isHost, going, myId, cards, tap, busy }: { event: SocialEvent; isHost: boolean; going: boolean; myId: string | null; cards: Map<string, PersonCard>; tap: Tap; busy: boolean }) {
  const { paid: back } = useLocalSearchParams<{ paid?: string }>();
  const [confirming, setConfirming] = useState(back === "1");
  const payments = useQuery({
    queryKey: ["plan-payments", event.id, myId],
    queryFn: () => loadPlanPayments(supabase, event.id, myId, isHost),
    enabled: event.collect_payments && !!myId && (isHost || going),
    // While waiting for Stripe to confirm a payment, check every 2 seconds.
    refetchInterval: (q) => (confirming && !isPaid(q.state.data?.mine?.status) ? 2000 : false),
  });
  const pay = usePay();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const mine = payments.data?.mine ?? null;
  const share = event.cost_pence ?? 0;
  const charge = chargeFor(share, event.fee_mode);

  // Stop checking once it shows as paid, or after 40 seconds.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 40_000);
    return () => clearTimeout(t);
  }, [confirming]);
  // Only while a payment is actually going through (not after a refund, or a card that failed).
  const waiting = confirming && mine?.status === "pending";

  if (!event.collect_payments || !myId || (!isHost && !going)) return null;

  async function payNow() {
    setPaying(true);
    setError(null);
    const r = await pay(event.id);
    setPaying(false);
    if ("error" in r) setError(r.error);
    if ("done" in r) {
      setConfirming(true);
      void payments.refetch();
    }
  }

  return (
    <View className="gap-3" testID="payment-panel">
      {/* Plain functions, not components, so the refund reason box keeps its focus. */}
      {!isHost && myPayment()}
      {error && <T variant="semibold" className="text-sm text-danger" testID="pay-error">{error}</T>}
      {isHost && hostSummary()}
    </View>
  );

  function myPayment() {
    const status = mine?.status;
    if (event.is_cancelled) {
      return isPaid(status) || status === "refund_queued" || status === "refund_pending" || status === "refunded" ? (
        <Card><T variant="semibold" testID="refund-on-way">This plan was cancelled, so your {pounds(mine!.amount_pence)} is being refunded to your card.</T></Card>
      ) : null;
    }
    // (A refund that has finished doesn't count: if they've joined again, they pay again.)
    if (status === "refund_queued" || status === "refund_pending") {
      return <Card><T variant="semibold" testID="refund-on-way">Your refund of {pounds(mine!.amount_pence)} is on its way. It can take 5 to 10 days to show on your card.</T></Card>;
    }
    if (isPaid(status)) {
      return (
        <Card className="gap-3" testID="paid-panel">
          <View className="flex-row items-center gap-2">
            <Icon name="checkmark-circle" size={24} color="#1e9e5a" />
            <T variant="semibold" testID="you-paid">You&apos;ve paid {pounds(mine!.amount_pence)}</T>
          </View>
          {status === "refund_requested" ? (
            <Muted className="text-sm" testID="refund-requested">You asked for a refund. The host will approve or decline it.</Muted>
          ) : asking ? (
            <View className="gap-2">
              <T variant="semibold" className="text-sm">Ask the host for a refund</T>
              <Input value={reason} onChangeText={setReason} maxLength={500} placeholder="Reason (optional)" testID="refund-reason" />
              <View className="flex-row gap-2">
                <Button className="py-2" disabled={busy} onPress={() => void tap(async () => { const r = await requestRefund(supabase, event.id, reason); if (!r.error) { setAsking(false); setReason(""); void payments.refetch(); } return r; })} testID="send-refund-request">Send request</Button>
                <Button variant="ghost" className="py-2" onPress={() => setAsking(false)}>Cancel</Button>
              </View>
              <Muted className="text-xs">If the host approves, you get {pounds(mine!.amount_pence)} back and leave the plan.</Muted>
            </View>
          ) : (
            <>
              {status === "refund_declined" && <Muted className="text-sm" testID="refund-declined">The host declined your refund request, so your place is kept.</Muted>}
              <LinkButton onPress={() => setAsking(true)} testID="request-refund">Request refund</LinkButton>
            </>
          )}
        </Card>
      );
    }
    // Not paid yet (or a card that didn't go through).
    return (
      <Card className="gap-3" testID="pay-panel">
        <View>
          <T variant="headline">Your share: {pounds(share)}</T>
          {charge.fee > 0 && <Muted className="text-sm">{pounds(charge.amount)} with the {feeText(charge.fee)} card fee</Muted>}
        </View>
        {waiting ? (
          <Muted testID="confirming">Confirming your payment…</Muted>
        ) : (
          <Button onPress={() => void payNow()} disabled={paying || busy} testID="pay">{paying ? "Opening…" : `Pay ${pounds(charge.amount)}`}</Button>
        )}
        {status === "failed" && mine?.failure_message && <T variant="semibold" className="text-sm text-danger" testID="last-failed">Your last payment didn&apos;t go through: {mine.failure_message}</T>}
        <Muted className="text-xs">Apple Pay or card, through Stripe. You don&apos;t need an account.</Muted>
      </Card>
    );
  }

  function hostSummary() {
    const all = payments.data?.all ?? [];
    const held = all.filter((p) => isPaid(p.status));
    const requests = all.filter((p) => p.status === "refund_requested");
    const toYou = held.reduce((sum, p) => sum + p.amount_pence - p.app_fee_pence, 0);
    return (
      <>
        <Card className="gap-1" testID="host-money">
          <T variant="semibold">{pounds(toYou)} collected so far</T>
          <Muted className="text-sm">{held.length} {held.length === 1 ? "person has" : "people have"} paid. It goes to your bank about 2 days after the plan ends.</Muted>
        </Card>
        {requests.length > 0 && (
          <PeopleSection title={`Refund requests (${requests.length})`}>
            {requests.map((p, i) => (
              refundRow(p.id, p.payer_id ?? "", p.amount_pence, p.refund_reason, i === 0)
            ))}
          </PeopleSection>
        )}
      </>
    );
  }

  function refundRow(id: string, payerId: string, amount: number, why: string | null, first: boolean) {
    const card = cards.get(payerId);
    return (
      <PersonRow key={id} id={payerId} name={card?.name ?? "Member"} avatarUrl={card?.avatar_url} detail={`${pounds(amount)} · ${why ? `“${why}”` : "No reason given"}`} first={first}>
        <View className="flex-row gap-2">
          <Button className="px-3 py-1.5" disabled={busy} onPress={() => void tap(() => decideRefund(supabase, id, true).then((r) => { void payments.refetch(); return r; }))} testID={`approve-refund-${payerId}`}>Approve</Button>
          <Button variant="ghost" className="px-3 py-1.5" disabled={busy} onPress={() => void tap(() => decideRefund(supabase, id, false).then((r) => { void payments.refetch(); return r; }))} testID={`decline-refund-${payerId}`}>Decline</Button>
        </View>
      </PersonRow>
    );
  }
}

// The plan's payments (shared by everything on the plan page).
export function usePlanPayments(event: SocialEvent, isHost: boolean, going: boolean, myId: string | null) {
  return useQuery({ queryKey: ["plan-payments", event.id, myId], queryFn: () => loadPlanPayments(supabase, event.id, myId, isHost), enabled: event.collect_payments && !!myId && (isHost || going) });
}

// A green "Paid" tick, or "Not paid yet" / "Refunding".
export function PaidBadge({ status, id }: { status: PaidStatus; id: string }) {
  return status === "paid" ? (
    <View className="flex-row items-center gap-1 rounded-full bg-ok/10 px-2.5 py-1" testID={`paid-${id}`}>
      <Icon name="checkmark-circle" size={16} color="#1e9e5a" />
      <T variant="bold" className="text-xs text-ok">Paid</T>
    </View>
  ) : (
    <Muted className="text-xs font-sans-semibold" testID={`unpaid-${id}`}>{status === "refunding" ? "Refunding" : "Not paid yet"}</Muted>
  );
}

// Who's paid, for people going (the host sees the same ticks in their guest list).
export function WhoPaid({ event, isHost, going, myId, people, host }: { event: SocialEvent; isHost: boolean; going: boolean; myId: string | null; people: { id: string; name: string; avatar_url: string | null }[]; host: { id: string; name: string; avatar_url: string | null } | null }) {
  const payments = usePlanPayments(event, isHost, going, myId);
  if (!event.collect_payments || !myId || (!isHost && !going) || people.length === 0) return null;
  const statuses = payments.data?.statuses ?? new Map<string, PaidStatus>();
  const paidCount = people.filter((p) => statuses.get(p.id) === "paid").length;
  return (
    <View className="mt-8" testID="who-paid">
      <PeopleSection title={`Who's paid (${paidCount} of ${people.length})`}>
        {host && <PersonRow id={host.id} name={host.name} avatarUrl={host.avatar_url} detail="Host" first />}
        {people.map((p, i) => {
          const s = statuses.get(p.id) ?? "unpaid";
          return (
            <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} first={!host && i === 0}>
              <PaidBadge status={s} id={p.id} />
            </PersonRow>
          );
        })}
      </PeopleSection>
    </View>
  );
}
