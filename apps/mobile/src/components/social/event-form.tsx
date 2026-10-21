import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { chargeFor, checkSocialTimes, feeText, payoutsReady, pounds, sharePerPerson, SOCIAL_CATEGORIES, type SocialEvent, type SocialEventInput } from "@function/shared";
import { DateField, TimeField } from "@/components/fields/date-time";
import { Icon } from "@/components/icon";
import { PlacePicker, type Point } from "@/components/place/place-picker";
import { Chip } from "@/components/social/filters";
import { Button, Card, Input, Label, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

type Props = {
  onSubmit: (input: SocialEventInput) => Promise<{ error?: string }>;
  event?: SocialEvent;
  exact?: { address: string | null; lat: number | null; lng: number | null } | null;
  // UK-time values for the date and time fields when editing.
  defaults?: { date: string; start: string; finish: string };
  // Where the map starts: the host's uni.
  centre?: [number, number];
};

// The host form: what, when, where (rough spot for everyone, exact for
// people going), spaces, cost, open or private, friends only.
export function SocialEventForm({ onSubmit, event, exact, defaults, centre }: Props) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [category, setCategory] = useState(event?.category ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [date, setDate] = useState(defaults?.date ?? "");
  const [start, setStart] = useState(defaults?.start ?? "");
  const [finish, setFinish] = useState(defaults?.finish ?? "");
  const [pin, setPin] = useState<Point | null>(exact?.lat != null && exact?.lng != null ? { lat: exact.lat, lng: exact.lng } : null);
  const [area, setArea] = useState(event?.area ?? "");
  const [address, setAddress] = useState(exact?.address ?? "");
  const [spaces, setSpaces] = useState(String(event?.spaces ?? 8));
  const [costKind, setCostKind] = useState<"none" | "free" | "paid">(event?.cost_pence == null ? "none" : event.cost_pence === 0 ? "free" : "paid");
  // "Costs money" is the total, split across the spaces. (Older plans saved a
  // price per person: that times the spaces is their total.)
  const startTotal = event?.total_cost_pence ?? (event?.cost_pence ? event.cost_pence * event.spaces : null);
  const [costAmount, setCostAmount] = useState(startTotal ? (startTotal % 100 === 0 ? String(startTotal / 100) : (startTotal / 100).toFixed(2)) : "");
  const [collectPayments, setCollectPayments] = useState(event ? event.collect_payments : true);
  const [feeMode, setFeeMode] = useState<"added" | "absorbed">(event?.fee_mode ?? "added");
  const [isPrivate, setIsPrivate] = useState(event?.is_private ?? false);
  const [friendsOnly, setFriendsOnly] = useState(event?.friends_only ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Pointed out as soon as the times are in: after midnight is fine (a note); the same time, or over 12 hours, isn't.
  const timeCheck = checkSocialTimes(date, start, finish);

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await onSubmit({ title, category, description, date, start, finish, area, address, lat: pin?.lat ?? null, lng: pin?.lng ?? null, spaces, costKind, costAmount, collectPayments, feeMode, isPrivate, friendsOnly });
    if (result.error) setError(result.error);
    setSaving(false);
  }

  return (
    <View className="gap-6">
      <View>
        <Label>Title</Label>
        <Input value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Powerleague 5-a-side" testID="title" />
      </View>

      <View>
        <Label>Category</Label>
        <View className="flex-row flex-wrap gap-2">
          {SOCIAL_CATEGORIES.map((c) => (
            <Chip key={c.value} active={category === c.value} onPress={() => setCategory(c.value)} testID={`category-${c.value}`}>{c.label}</Chip>
          ))}
        </View>
      </View>

      <View>
        <Label>Description</Label>
        <Input value={description} onChangeText={setDescription} multiline numberOfLines={4} maxLength={3000} placeholder="What's the plan? Who's it for? What should people bring?" className="min-h-24" style={{ textAlignVertical: "top" }} testID="description" />
      </View>

      <View className="gap-3">
        <View>
          <Label>Date</Label>
          <DateField value={date} onChange={setDate} testID="date" accessibilityLabel="Date" />
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Label>Start time</Label>
            <TimeField value={start} onChange={setStart} testID="start" accessibilityLabel="Start time" />
          </View>
          <View className="flex-1">
            <Label>Finish <Muted className="text-sm">(optional)</Muted></Label>
            <TimeField value={finish} onChange={setFinish} testID="finish" accessibilityLabel="Finish time" />
          </View>
        </View>
        {timeCheck && (timeCheck.tone === "warning" ? <T variant="semibold" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger" testID="finish-warning">{timeCheck.message}</T> : <Muted className="text-xs" testID="finish-note">{timeCheck.message}</Muted>)}
      </View>

      <View className="gap-3">
        <Label>Location</Label>
        <PlacePicker
          centre={centre}
          pin={pin}
          onPick={(point, name, detail) => {
            setPin(point);
            if (!area.trim() && name) setArea(name);
            if (!address.trim() && name) setAddress([name, detail].filter(Boolean).join(", "));
          }}
        />
        <View>
          <Label>Place name everyone sees</Label>
          <Input value={area} onChangeText={setArea} maxLength={120} placeholder="e.g. Powerleague Shoreditch, or Near Holborn" testID="area" />
          <Muted className="mt-1 text-xs">The map shows a rough spot. Hosting at home? Put the area here, not your address.</Muted>
        </View>
        <View>
          <Label>Exact address <Muted className="text-sm">(only people going see this)</Muted></Label>
          <Input value={address} onChangeText={setAddress} maxLength={200} placeholder="e.g. Flat 3, 10 Example Street" testID="address" />
        </View>
      </View>

      <View>
        <Label>Number of spaces</Label>
        <Input value={spaces} onChangeText={setSpaces} keyboardType="number-pad" className="w-32" testID="spaces-input" />
        <Muted className="mt-1 text-xs">Including you. 8 spaces = you + 7 others.</Muted>
      </View>

      <View>
        <Label>Cost <Muted className="text-sm">(optional)</Muted></Label>
        <View className="flex-row flex-wrap gap-2">
          {([["none", "Don't show"], ["free", "Free"], ["paid", "Costs money"]] as const).map(([value, label]) => (
            <Chip key={value} active={costKind === value} onPress={() => setCostKind(value)} testID={`cost-${value}`}>{label}</Chip>
          ))}
        </View>
        {costKind === "paid" && (
          <PaidCost
            total={costAmount}
            onTotal={setCostAmount}
            spaces={spaces}
            collect={collectPayments}
            onCollect={setCollectPayments}
            feeMode={feeMode}
            onFeeMode={setFeeMode}
            locked={!!event?.collect_payments}
          />
        )}
      </View>

      <View>
        <Label>Open or Private?</Label>
        <View className="gap-2">
          <Choice checked={!isPrivate} onPress={() => setIsPrivate(false)} title="Open" help="Anyone can tap “I'm in” and join straight away" testID="privacy-open" />
          <Choice checked={isPrivate} onPress={() => setIsPrivate(true)} title="Private" help="People request to join; you approve or decline" testID="privacy-private" />
        </View>
      </View>

      <Pressable onPress={() => setFriendsOnly((f) => !f)} accessibilityRole="checkbox" accessibilityState={{ checked: friendsOnly }} className="flex-row items-start gap-3 rounded-xl border border-line px-3.5 py-3" testID="friends-only">
        <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${friendsOnly ? "border-brand bg-brand" : "border-line bg-surface"}`}>{friendsOnly && <Icon name="checkmark" size={14} color="#fff" />}</View>
        <View className="flex-1">
          <T variant="semibold">Only my friends can see this</T>
          <Muted className="text-sm">Hidden from everyone else in Discover.</Muted>
        </View>
      </Pressable>

      <T className="rounded-xl bg-brand-soft px-4 py-3 text-sm">Stay safe: meet people you don&apos;t know in public places, and tell a friend where you&apos;re going.</T>

      {error && <T variant="semibold" className="text-sm text-danger" testID="form-error">{error}</T>}
      <Button onPress={() => void submit()} disabled={saving || !!timeCheck?.blocked} className="py-3" testID="submit">{saving ? "Saving…" : event ? "Save changes" : "Post event"}</Button>
    </View>
  );
}

// "Costs money": the total, the price per person, and whether people pay in
// the app (which needs payouts set up, and a choice about the card fee).
function PaidCost({ total, onTotal, spaces, collect, onCollect, feeMode, onFeeMode, locked }: {
  total: string; onTotal: (v: string) => void; spaces: string; collect: boolean; onCollect: (v: boolean) => void;
  feeMode: "added" | "absorbed"; onFeeMode: (v: "added" | "absorbed") => void; locked: boolean;
}) {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const payouts = useQuery({ queryKey: ["payouts-ready", myId], queryFn: () => payoutsReady(supabase, myId!), enabled: !!myId && collect });
  const pence = Math.round(Number(total.trim().replace(/^£/, "").replace(/,/g, "")) * 100);
  const count = Number(spaces.trim());
  const share = Number.isFinite(pence) && pence > 0 && Number.isInteger(count) && count >= 2 ? sharePerPerson(pence, count) : 0;
  const added = share ? chargeFor(share, "added") : null;
  const absorbed = share ? chargeFor(share, "absorbed") : null;
  return (
    <View className="mt-3 gap-3">
      <View>
        <Label>Total cost</Label>
        <View className="flex-row items-center gap-2">
          <T variant="semibold">£</T>
          <View className="w-32">
            <Input value={total} onChangeText={onTotal} keyboardType="decimal-pad" placeholder="80" accessibilityLabel="Total cost in pounds" testID="cost-amount" />
          </View>
        </View>
        <Muted className="mt-1 text-xs">The whole cost, e.g. the pitch. It&apos;s split across the spaces, you included.</Muted>
        {share > 0 && (
          <T variant="headline" className="mt-2" testID="per-person">{pounds(share)} per person <Muted className="text-sm">({pounds(pence)} ÷ {count} spaces)</Muted></T>
        )}
      </View>
      <Choice checked={collect} onPress={() => onCollect(!collect)} role="checkbox" title="Collect payments in Function" help="People who join pay their share in the app, with Apple Pay or a card. The money goes to your bank 2 days after the plan." testID="collect-payments" />
      {collect ? (
        <>
          {payouts.data === "ready" ? (
            <T variant="semibold" className="text-sm text-ok" testID="payouts-ready">✓ Payouts set up</T>
          ) : (
            <Card className="gap-2" testID="payouts-needed">
              <T variant="semibold">Set up payouts first</T>
              <Muted className="text-sm">Connect your bank account through Stripe so the money can reach you. It takes about 5 minutes, and Function never sees your bank details.</Muted>
              <Link href={"/account/payouts" as never} asChild>
                <Button className="self-start py-2" testID="setup-payouts">{payouts.data === "incomplete" ? "Finish setting up payouts" : "Set up payouts"}</Button>
              </Link>
            </Card>
          )}
          <View className="gap-2">
            <Label>The card fee</Label>
            <Choice checked={feeMode === "added"} onPress={() => onFeeMode("added")} title="Add it to each share" help={added ? `People pay ${pounds(added.amount)} (${pounds(added.share)} + ${feeText(added.fee)} fee). You get ${pounds(added.toHost)} each.` : "People pay their share plus a small fee, and you get the full share."} testID="fee-added" />
            <Choice checked={feeMode === "absorbed"} onPress={() => onFeeMode("absorbed")} title="I'll cover it" help={absorbed ? `People pay ${pounds(absorbed.amount)}. You get ${pounds(absorbed.toHost)} each.` : "People pay exactly their share, and the fee comes out of what you get."} testID="fee-absorbed" />
          </View>
          <Muted className="text-xs">If fewer people join, you collect less: the price per person stays the same.{locked ? " Once someone has paid, the price and spaces can't change." : ""}</Muted>
        </>
      ) : (
        <Muted className="text-xs">Just shown on the plan; no payments are taken.</Muted>
      )}
    </View>
  );
}

function Choice({ checked, onPress, title, help, role = "radio", testID }: { checked: boolean; onPress: () => void; title: string; help: string; role?: "radio" | "checkbox"; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole={role} accessibilityState={{ checked }} testID={testID} className={`rounded-xl border px-3.5 py-3 ${checked ? "border-brand bg-brand-soft" : "border-line"}`}>
      <T variant="semibold">{title}</T>
      <Muted className="text-sm">{help}</Muted>
    </Pressable>
  );
}
