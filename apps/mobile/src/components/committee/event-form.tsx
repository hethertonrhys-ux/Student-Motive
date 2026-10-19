import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AUDIENCES, CATEGORIES, DEFAULT_SEATS, FORMATS, POKER_STAKES, audienceLabel, isoToLondonInput, uniById, uniShort, type Audience, type EventFormat, type EventInput, type EventTable, type MotiveEvent, type TableDraft, type Venue } from "@function/shared";
import { DateField, TimeField } from "@/components/fields/date-time";
import { Icon } from "@/components/icon";
import { pickPhotos, type Picked } from "@/components/photos/pick-photos";
import { PlacePicker, type Point } from "@/components/place/place-picker";
import { Select } from "@/components/select";
import { Chip } from "@/components/social/filters";
import { Button, Input, Label, Muted, T } from "@/components/ui";

const VENUE_GROUPS: { kind: Venue["kind"]; label: string }[] = [
  { kind: "campus", label: "LSE campus" },
  { kind: "hall", label: "LSE halls" },
  { kind: "university", label: "Other universities" },
  { kind: "club", label: "Clubs & bars" },
  { kind: "other", label: "Other" },
];
const AUDIENCE_HELP: Record<Audience, (uni: string) => string> = {
  members: () => "Only your approved members can see and join it.",
  uni: (uni) => `Every ${uni} student can see it.`,
  london: () => "Students from any London university can see and join it.",
};

type Props = {
  onSubmit: (input: EventInput, image: Picked | null) => Promise<{ error?: string }>;
  venues: Venue[];
  event?: MotiveEvent;
  tables?: EventTable[];
  // The society's uni ("LSE", "UCL"…), for who can see the event.
  uni: string;
};

// The committee's event form: what, when, where, cost, how people join
// (standard, sign-up list, tables), who can see it, description, link, image.
export function CommitteeEventForm({ onSubmit, venues, event, tables = [], uni }: Props) {
  const isEdit = Boolean(event);
  const startsCustom = Boolean(event && !event.venue_id && event.lat != null && event.lng != null);
  const starts = event ? isoToLondonInput(event.starts_at) : "";
  const ends = event ? isoToLondonInput(event.ends_at) : "";
  const [title, setTitle] = useState(event?.title ?? "");
  const [category, setCategory] = useState(event?.category ?? "");
  const [freeFood, setFreeFood] = useState(event?.free_food ?? false);
  const [startDate, setStartDate] = useState(starts.slice(0, 10));
  const [startTime, setStartTime] = useState(starts.slice(11, 16));
  const [endDate, setEndDate] = useState(ends.slice(0, 10));
  const [endTime, setEndTime] = useState(ends.slice(11, 16));
  const [venueId, setVenueId] = useState(event ? (startsCustom ? "custom" : (event.venue_id ?? "")) : "");
  const [pin, setPin] = useState<Point | null>(startsCustom ? { lng: event!.lng!, lat: event!.lat! } : null);
  const [locationNote, setLocationNote] = useState(event?.location_note ?? "");
  const [costKind, setCostKind] = useState<"none" | "free" | "paid">(event?.cost_pence == null ? "none" : event.cost_pence === 0 ? "free" : "paid");
  const [costAmount, setCostAmount] = useState(event?.cost_pence ? (event.cost_pence % 100 === 0 ? String(event.cost_pence / 100) : (event.cost_pence / 100).toFixed(2)) : "");
  const [format, setFormat] = useState<EventFormat>(event?.format ?? "standard");
  const [capacity, setCapacity] = useState(event?.capacity ? String(event.capacity) : "");
  const [membersOnly, setMembersOnly] = useState(event?.members_only ?? true);
  const [audience, setAudience] = useState<Audience>(event?.audience ?? "uni");
  const [drafts, setDrafts] = useState<TableDraft[]>(tables.length > 0 ? tables.map((t) => ({ id: t.id, name: t.name, level: t.level ?? "", seats: t.seats })) : [{ name: "Table 1", level: "", seats: DEFAULT_SEATS }]);
  const [description, setDescription] = useState(event?.description ?? "");
  const [ticketUrl, setTicketUrl] = useState(event?.ticket_url ?? "");
  const [image, setImage] = useState<Picked | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isCancelled, setIsCancelled] = useState(event?.is_cancelled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const custom = venueId === "custom";

  const venueOptions = [{ value: "custom", label: "Somewhere else (pick it on a map)" }, ...VENUE_GROUPS.flatMap((g) => venues.filter((v) => v.kind === g.kind).map((v) => ({ value: v.id, label: `${v.name}${v.short_name ? ` (${v.short_name})` : ""}`, group: g.label })))];
  const updateTable = (i: number, change: Partial<TableDraft>) => setDrafts((cur) => cur.map((t, j) => (j === i ? { ...t, ...change } : t)));

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await onSubmit(
      { title, category, freeFood, startsAt: `${startDate}T${startTime}`, endsAt: `${endDate}T${endTime}`, venueId, lat: custom ? (pin?.lat ?? null) : null, lng: custom ? (pin?.lng ?? null) : null, locationNote, costKind, costAmount, format, capacity, membersOnly, audience, tables: format === "tables" ? drafts : [], description, ticketUrl, isCancelled, removeImage },
      image,
    );
    if (result.error) setError(result.error);
    setSaving(false);
  }

  return (
    <View className="gap-5">
      <View>
        <Label>Event name</Label>
        <Input value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Freshers' Poker Night" testID="ev-title" />
      </View>
      <View>
        <Label>Category</Label>
        <Select value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} accessibilityLabel="Category" testID="ev-category" />
      </View>
      <Check checked={freeFood} onPress={() => setFreeFood((f) => !f)} title="Free food" testID="ev-free-food" />

      <View className="gap-3">
        <View>
          <Label>Starts</Label>
          <View className="flex-row gap-3">
            <View className="flex-[3]"><DateField value={startDate} onChange={setStartDate} testID="ev-start-date" accessibilityLabel="Start date" /></View>
            <View className="flex-[2]"><TimeField value={startTime} onChange={setStartTime} testID="ev-start-time" accessibilityLabel="Start time" /></View>
          </View>
        </View>
        <View>
          <Label>Ends</Label>
          <View className="flex-row gap-3">
            <View className="flex-[3]"><DateField value={endDate} onChange={setEndDate} testID="ev-end-date" accessibilityLabel="End date" /></View>
            <View className="flex-[2]"><TimeField value={endTime} onChange={setEndTime} testID="ev-end-time" accessibilityLabel="End time" /></View>
          </View>
        </View>
      </View>
      <Muted className="-mt-3 text-xs">UK time.</Muted>

      <View className="gap-4">
        <View>
          <Label>Where</Label>
          <Select value={venueId} onChange={setVenueId} options={venueOptions} placeholder="Choose a place…" accessibilityLabel="Where" testID="ev-venue" />
        </View>
        <View>
          <Label>{custom ? "Place name" : <>Room or details <Muted className="text-sm">(optional)</Muted></>}</Label>
          <Input value={locationNote} onChangeText={setLocationNote} maxLength={120} placeholder={custom ? "e.g. The Fellow, King's Cross (back room)" : "e.g. 4th floor, room 4.02"} testID="ev-location-note" />
        </View>
        {custom && (
          <PlacePicker
            centre={uniById(uni)?.centre}
            pin={pin}
            onPick={(point, name) => {
              setPin(point);
              if (name && !locationNote.trim()) setLocationNote(name);
            }}
          />
        )}
      </View>

      <View>
        <Label>Cost <Muted className="text-sm">(optional)</Muted></Label>
        <View className="flex-row flex-wrap gap-2">
          {([["none", "Don't show"], ["free", "Free"], ["paid", "Costs money"]] as const).map(([value, label]) => (
            <Chip key={value} active={costKind === value} onPress={() => setCostKind(value)} testID={`ev-cost-${value}`}>{label}</Chip>
          ))}
        </View>
        {costKind === "paid" && (
          <View className="mt-3 flex-row items-center gap-2">
            <T variant="semibold">£</T>
            <Input value={costAmount} onChangeText={setCostAmount} keyboardType="decimal-pad" placeholder="6" className="w-28" accessibilityLabel="Cost in pounds" testID="ev-cost-amount" />
            <Muted className="flex-1 text-xs">per person. Just shown on the event; no payments are taken.</Muted>
          </View>
        )}
      </View>

      {/* How do people join? */}
      <View className="gap-4 rounded-2xl border border-line p-4">
        <T variant="semibold">How do people join?</T>
        <View className="gap-2">
          {FORMATS.map((f) => (
            <Pressable key={f.value} onPress={() => setFormat(f.value)} accessibilityRole="radio" accessibilityState={{ checked: format === f.value }} testID={`ev-format-${f.value}`} className={`rounded-xl border p-3 ${format === f.value ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}>
              <T variant="bold">{f.label}</T>
              <Muted className="text-xs">{f.help}</Muted>
            </Pressable>
          ))}
        </View>
        {format === "entries" && (
          <View>
            <Label>Maximum entries <Muted className="text-sm">(optional)</Muted></Label>
            <Input value={capacity} onChangeText={setCapacity} keyboardType="number-pad" placeholder="No limit" className="w-40" testID="ev-capacity" />
            <Muted className="mt-1 text-xs">When it&apos;s full, new entries go on a waiting list and move up if someone drops out.</Muted>
          </View>
        )}
        {format === "tables" && (
          <View className="gap-3">
            {drafts.map((table, i) => (
              <View key={table.id ?? `new-${i}`} className="gap-2 rounded-xl border border-line p-3" testID={`ev-table-${i}`}>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Label>Table</Label>
                    <Input value={table.name} onChangeText={(v) => updateTable(i, { name: v })} maxLength={40} accessibilityLabel="Table name" testID="ev-table-name" />
                  </View>
                  <View className="w-24">
                    <Label>Seats</Label>
                    <Input value={String(table.seats)} onChangeText={(v) => updateTable(i, { seats: v })} keyboardType="number-pad" accessibilityLabel="Seats" testID="ev-table-seats" />
                  </View>
                </View>
                <View>
                  <Label>Level / stakes</Label>
                  <LevelPicker value={table.level} onChange={(level) => updateTable(i, { level })} />
                </View>
                <Pressable onPress={() => setDrafts((cur) => cur.filter((_, j) => j !== i))} disabled={drafts.length === 1} className={`self-end ${drafts.length === 1 ? "opacity-30" : ""}`}>
                  <T variant="semibold" className="text-sm text-danger">Remove table</T>
                </Pressable>
              </View>
            ))}
            <Button variant="ghost" className="self-start py-2" onPress={() => setDrafts((cur) => [...cur, { name: `Table ${cur.length + 1}`, level: "", seats: cur.at(-1)?.seats ?? DEFAULT_SEATS }])} testID="ev-add-table">+ Add a table</Button>
            {tables.length > 0 && <Muted className="text-xs">Removing a table moves anyone sitting there back to &ldquo;no table yet&rdquo;.</Muted>}
          </View>
        )}
        <View className="gap-2">
          <T variant="semibold">Who can see this event</T>
          {AUDIENCES.map((a) => (
            <Pressable key={a} onPress={() => setAudience(a)} accessibilityRole="radio" accessibilityState={{ checked: audience === a }} testID={`ev-audience-${a}`} className="flex-row items-start gap-3">
              <View className={`mt-1 h-4 w-4 items-center justify-center rounded-full border-2 ${audience === a ? "border-brand" : "border-muted"}`}>{audience === a && <View className="h-2 w-2 rounded-full bg-brand" />}</View>
              <View className="flex-1">
                <T variant="semibold">{audienceLabel(a, uni)}</T>
                <Muted className="text-xs">{AUDIENCE_HELP[a](uniShort(uni))}</Muted>
              </View>
            </Pressable>
          ))}
        </View>
        {audience !== "members" && <Check checked={membersOnly} onPress={() => setMembersOnly((m) => !m)} title="Only members can join" help="Others can see the event, but only approved members can join." testID="ev-members-only" />}
      </View>

      <View>
        <Label>Description <Muted className="text-sm">(optional)</Muted></Label>
        <Input value={description} onChangeText={setDescription} multiline maxLength={5000} placeholder="What's happening, who it's for, what to bring…" className="min-h-28" style={{ textAlignVertical: "top" }} testID="ev-description" />
      </View>
      <View>
        <Label>Ticket or sign-up link <Muted className="text-sm">(optional)</Muted></Label>
        <Input value={ticketUrl} onChangeText={setTicketUrl} keyboardType="url" autoCapitalize="none" placeholder="https://…" testID="ev-ticket" />
      </View>
      <View>
        <Label>Image <Muted className="text-sm">(optional)</Muted></Label>
        {event?.image_url && !removeImage && !image && <Image source={{ uri: event.image_url }} style={{ height: 128, borderRadius: 12, marginBottom: 12 }} contentFit="cover" />}
        <View className="flex-row flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            className="py-2"
            onPress={async () => {
              const [picked] = await pickPhotos({ count: 1, aspect: 16 / 9, output: 1600 });
              if (picked) {
                setImage(picked);
                setRemoveImage(false);
              }
            }}
            testID="ev-image"
          >
            {image ? "Image chosen ✓" : event?.image_url ? "Change image" : "Add an image"}
          </Button>
          {event?.image_url && !image && <Check checked={removeImage} onPress={() => setRemoveImage((r) => !r)} title="Remove current image" />}
        </View>
      </View>
      {isEdit && <Check checked={isCancelled} onPress={() => setIsCancelled((c) => !c)} title="Mark as cancelled" danger testID="ev-cancelled" />}

      {error && <T variant="semibold" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger" testID="ev-error">{error}</T>}
      <Button onPress={() => void submit()} disabled={saving} testID="ev-submit">{saving ? "Saving…" : isEdit ? "Save changes" : "Post event"}</Button>
    </View>
  );
}

function Check({ checked, onPress, title, help, danger, testID }: { checked: boolean; onPress: () => void; title: string; help?: string; danger?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} testID={testID} className={`flex-row items-start gap-3 rounded-xl border px-3.5 py-2.5 ${danger ? "border-danger/40 bg-danger/5" : "border-line bg-surface"}`}>
      <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${checked ? (danger ? "border-danger bg-danger" : "border-brand bg-brand") : "border-line bg-surface"}`}>{checked && <Icon name="checkmark" size={14} color="#fff" />}</View>
      <View className="flex-1">
        <T variant="semibold" className={danger ? "text-danger" : ""}>{title}</T>
        {help && <Muted className="text-xs">{help}</Muted>}
      </View>
    </Pressable>
  );
}

// Stakes picker, with "Other…" for typing your own (e.g. for non-poker events).
function LevelPicker({ value, onChange }: { value: string; onChange: (level: string) => void }) {
  const isPreset = value === "" || POKER_STAKES.includes(value);
  const [custom, setCustom] = useState(!isPreset);
  if (custom) {
    return (
      <View className="flex-row items-center gap-2">
        <Input value={value} onChangeText={onChange} maxLength={40} placeholder="Type a level" className="flex-1" accessibilityLabel="Level or stakes" />
        <Pressable
          onPress={() => {
            setCustom(false);
            onChange("");
          }}
          accessibilityLabel="Back to the list"
        >
          <T variant="semibold" className="text-sm text-muted">List</T>
        </Pressable>
      </View>
    );
  }
  return (
    <Select
      value={value}
      onChange={(v) => {
        if (v === "__other") {
          setCustom(true);
          onChange("");
        } else onChange(v);
      }}
      options={[...POKER_STAKES.map((s) => ({ value: s, label: s })), { value: "__other", label: "Other…" }]}
      placeholder="e.g. 10p/20p"
      accessibilityLabel="Level or stakes"
    />
  );
}
