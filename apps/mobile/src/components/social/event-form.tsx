import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { SOCIAL_CATEGORIES, type SocialEvent, type SocialEventInput } from "@function/shared";
import { DateField, TimeField } from "@/components/fields/date-time";
import { Icon } from "@/components/icon";
import { PlacePicker, type Point } from "@/components/place/place-picker";
import { Chip } from "@/components/social/filters";
import { Button, Input, Label, Muted, T } from "@/components/ui";

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
  const [costAmount, setCostAmount] = useState(event?.cost_pence ? (event.cost_pence % 100 === 0 ? String(event.cost_pence / 100) : (event.cost_pence / 100).toFixed(2)) : "");
  const [isPrivate, setIsPrivate] = useState(event?.is_private ?? false);
  const [friendsOnly, setFriendsOnly] = useState(event?.friends_only ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await onSubmit({ title, category, description, date, start, finish, area, address, lat: pin?.lat ?? null, lng: pin?.lng ?? null, spaces, costKind, costAmount, isPrivate, friendsOnly });
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
        <TextInput value={description} onChangeText={setDescription} multiline numberOfLines={4} maxLength={3000} placeholder="What's the plan? Who's it for? What should people bring?" placeholderTextColor="rgba(94, 93, 120, 0.7)" className="min-h-24 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-sans text-base text-ink web:outline-none web:focus:border-brand" style={{ textAlignVertical: "top" }} testID="description" />
      </View>

      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[45%] flex-1">
          <Label>Date</Label>
          <DateField value={date} onChange={setDate} testID="date" accessibilityLabel="Date" />
        </View>
        <View className="flex-1">
          <Label>Start time</Label>
          <TimeField value={start} onChange={setStart} testID="start" accessibilityLabel="Start time" />
        </View>
        <View className="flex-1">
          <Label>Finish <Muted className="text-sm">(optional)</Muted></Label>
          <TimeField value={finish} onChange={setFinish} testID="finish" accessibilityLabel="Finish time" />
        </View>
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
          <View className="mt-3 flex-row items-center gap-2">
            <T variant="semibold">£</T>
            <Input value={costAmount} onChangeText={setCostAmount} keyboardType="decimal-pad" placeholder="6" className="w-28" accessibilityLabel="Cost in pounds" testID="cost-amount" />
            <Muted className="flex-1 text-xs">per person. Just shown on the event; no payments are taken.</Muted>
          </View>
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
      <Button onPress={() => void submit()} disabled={saving} className="py-3" testID="submit">{saving ? "Saving…" : event ? "Save changes" : "Post event"}</Button>
    </View>
  );
}

function Choice({ checked, onPress, title, help, testID }: { checked: boolean; onPress: () => void; title: string; help: string; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked }} testID={testID} className={`rounded-xl border px-3.5 py-3 ${checked ? "border-brand bg-brand-soft" : "border-line"}`}>
      <T variant="semibold">{title}</T>
      <Muted className="text-sm">{help}</Muted>
    </Pressable>
  );
}
