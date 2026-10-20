import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  answersFromRow,
  chooseForm,
  cleanAnswers,
  defaultAnswers,
  eventAdminConfig,
  eventAdminFor,
  formatAdminDate,
  londonInputToIso,
  readCostInput,
  type EventAdminAnswers,
  type EventAdminRow,
  type EventAdminSave,
  type EventFormat,
  type TableDraft,
  type Venue,
} from "@function/shared";
import { Icon } from "@/components/icon";
import { Button, Card, Input, Label, Muted, T } from "@/components/ui";

// Event admin in the committee's event form (LSE societies with Event
// admin on): a few questions about the event, pre-filled from the rest of
// the form, which decide the SU paperwork. Function prepares it; the
// committee checks and submits it. Then "Has the SU approved this event?":
// Yes publishes the event, Not yet saves it as a draft.

type FormFields = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  venue: Venue | null;
  format: EventFormat;
  capacity: string;
  tables: TableDraft[];
  freeFood: boolean;
  costKind: "none" | "free" | "paid";
  costAmount: string;
  ticketUrl: string;
};

type Editable = Pick<EventAdminAnswers, "venueType" | "alcohol" | "externalSpeaker" | "speakerNames" | "speakerOrg" | "nonLseGuests" | "openToPublic" | "physicalActivity" | "food">;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

// "" -> null; "250" or "£12.50" -> pence; anything else -> undefined.
function parseMoney(text: string): number | null | undefined {
  const raw = text.trim().replace(/^£/, "").replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1000000 ? Math.round(n * 100) : undefined;
}
function parseWhole(text: string): number | null | undefined {
  const raw = text.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : undefined;
}
const poundsText = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));
// "10 working days' notice", "1 month's notice".
const noticePhrase = (label: string) => `${label}${label.endsWith("s") ? "'" : "'s"} notice`;

// The section's state, kept by the event form (it changes the ticket link
// field and the submit button too).
export function useEventAdmin({ row, uni, fields }: { row: EventAdminRow | null | undefined; uni: string; fields: FormFields }) {
  const initial = row ? answersFromRow(row) : null;
  const [picked, setPicked] = useState<Partial<Editable>>(
    initial
      ? { venueType: initial.venueType, alcohol: initial.alcohol, externalSpeaker: initial.externalSpeaker, speakerNames: initial.speakerNames, speakerOrg: initial.speakerOrg, nonLseGuests: initial.nonLseGuests, openToPublic: initial.openToPublic, physicalActivity: initial.physicalActivity, food: initial.food }
      : {},
  );
  // null: not typed yet, so it follows the event's limit or seats.
  const [attendees, setAttendees] = useState<string | null>(initial ? (initial.expectedAttendees == null ? "" : String(initial.expectedAttendees)) : null);
  const [budget, setBudget] = useState(initial?.budgetPence != null ? poundsText(initial.budgetPence) : "");
  const [costRows, setCostRows] = useState<{ label: string; amount: string }[]>(initial ? initial.costLines.map((l) => ({ label: l.label, amount: l.pence ? poundsText(l.pence) : "" })) : []);
  // null: not typed yet, so it starts as the event's ticket link.
  const [native, setNative] = useState<string | null>(initial?.nativeUrl ? initial.nativeUrl : null);
  const [suApproved, setSuApproved] = useState(Boolean(row?.su_approved_at));

  const defaults = defaultAnswers({
    event: { capacity: fields.format === "entries" ? fields.capacity : null, free_food: fields.freeFood, format: fields.format },
    venue: fields.venue,
    tables: fields.format === "tables" ? fields.tables : [],
    societyUniversity: uni,
  });
  const cost = readCostInput(fields.costKind, fields.costAmount);
  const costPence = "value" in cost ? cost.value : null;
  const answers: EventAdminAnswers = {
    ...defaults,
    ...picked,
    expectedAttendees: attendees === null ? defaults.expectedAttendees : (parseWhole(attendees) ?? null),
    budgetPence: parseMoney(budget) ?? null,
    costLines: costRows.map((r) => ({ label: r.label, pence: parseMoney(r.amount) ?? 0 })),
    nativeUrl: "",
  };
  const nativeShown = (costPence ?? 0) > 0 || answers.nonLseGuests;
  const nativeUrl = native ?? fields.ticketUrl;
  if (nativeShown) answers.nativeUrl = nativeUrl;

  const startsAt = DATE.test(fields.startDate) ? londonInputToIso(`${fields.startDate}T${TIME.test(fields.startTime) ? fields.startTime : "12:00"}`) : null;
  const endsAt = DATE.test(fields.endDate) && TIME.test(fields.endTime) ? londonInputToIso(`${fields.endDate}T${fields.endTime}`) : null;
  const config = eventAdminConfig(uni);
  const result = config && startsAt ? eventAdminFor({ university: uni, answers, startsAt, endsAt, costPence }) : null;
  const choice = config ? chooseForm(config, cleanAnswers(answers)) : null;

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setPicked((p) => ({ ...p, [key]: value }));

  // What the form sends with the event, or why it can't yet.
  function toSubmit(): EventAdminSave | { error: string } {
    if (attendees !== null && parseWhole(attendees) === undefined) return { error: "Expected attendees: enter a whole number, e.g. 40." };
    if (parseMoney(budget) === undefined) return { error: "Total budget: enter an amount in pounds, e.g. 250." };
    const bad = costRows.findIndex((r) => parseMoney(r.amount) === undefined);
    if (bad >= 0) return { error: `Cost ${bad + 1}: enter an amount in pounds, e.g. 40.` };
    return { answers: cleanAnswers(answers), result, suApproved };
  }

  return { answers, set, attendees, setAttendees, defaults, budget, setBudget, costRows, setCostRows, nativeShown, nativeUrl, setNative, suApproved, setSuApproved, result, choice, su: config?.su ?? "your SU", toSubmit };
}

export type EventAdminState = ReturnType<typeof useEventAdmin>;

export function EventAdminSection({ state }: { state: EventAdminState }) {
  const { answers, set, result, choice } = state;
  const updateRow = (i: number, change: Partial<{ label: string; amount: string }>) => state.setCostRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <Card className="gap-5" testID="ea-section">
      <View className="gap-1">
        <T variant="display-bold" className="text-xl">Event admin</T>
        <Muted className="text-sm">Function prepares the SU paperwork for this event; your committee checks and submits it.</Muted>
      </View>

      <View>
        <Label>How many people do you expect?</Label>
        <View className="w-40">
          <Input
            value={state.attendees ?? (state.defaults.expectedAttendees == null ? "" : String(state.defaults.expectedAttendees))}
            onChangeText={state.setAttendees}
            keyboardType="number-pad"
            placeholder="e.g. 40"
            accessibilityLabel="Expected attendees"
            testID="ea-attendees"
          />
        </View>
      </View>

      <Question label="Where is it?">
        <Choices
          value={answers.venueType}
          onChange={(v) => set("venueType", v)}
          options={[["campus", "LSE campus"], ["london", "Other London venue"], ["away", "Outside London or overnight"]]}
          testID="ea-venue"
        />
      </Question>

      <Question label="Alcohol">
        <Choices value={answers.alcohol} onChange={(v) => set("alcohol", v)} options={[["none", "None"], ["available", "Available"], ["focus", "The focus"]]} testID="ea-alcohol" />
      </Question>

      <Question label="An external speaker or organisation?">
        <YesNo value={answers.externalSpeaker} onChange={(v) => set("externalSpeaker", v)} testID="ea-speaker" />
        {answers.externalSpeaker && (
          <View className="mt-3 gap-3">
            <Input value={answers.speakerNames} onChangeText={(v) => set("speakerNames", v)} maxLength={500} placeholder="Speaker name(s)" accessibilityLabel="Speaker names" testID="ea-speaker-names" />
            <Input value={answers.speakerOrg} onChangeText={(v) => set("speakerOrg", v)} maxLength={200} placeholder="Their organisation (optional)" accessibilityLabel="Speaker's organisation" testID="ea-speaker-org" />
          </View>
        )}
      </Question>

      <Question label="Any non-LSE guests?">
        <YesNo value={answers.nonLseGuests} onChange={(v) => set("nonLseGuests", v)} testID="ea-guests" />
      </Question>

      <Question label="Open to the public?">
        <YesNo value={answers.openToPublic} onChange={(v) => set("openToPublic", v)} testID="ea-public" />
      </Question>

      <View className="gap-3">
        <View>
          <Label>Total budget</Label>
          <View className="flex-row items-center gap-2">
            <T variant="semibold">£</T>
            <View className="w-32">
              <Input value={state.budget} onChangeText={state.setBudget} keyboardType="decimal-pad" placeholder="0" accessibilityLabel="Total budget in pounds" testID="ea-budget" />
            </View>
          </View>
        </View>
        {state.costRows.map((row, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <View className="min-w-0 flex-1">
              <Input value={row.label} onChangeText={(v) => updateRow(i, { label: v })} maxLength={80} placeholder="What for, e.g. Room hire" accessibilityLabel={`Cost ${i + 1}`} testID={`ea-cost-label-${i}`} />
            </View>
            <T variant="semibold">£</T>
            <View className="w-20">
              <Input value={row.amount} onChangeText={(v) => updateRow(i, { amount: v })} keyboardType="decimal-pad" placeholder="0" accessibilityLabel={`Cost ${i + 1} in pounds`} testID={`ea-cost-amount-${i}`} />
            </View>
            <Pressable onPress={() => state.setCostRows((rows) => rows.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove cost ${i + 1}`} hitSlop={8} className="h-11 w-8 items-center justify-center" testID={`ea-cost-remove-${i}`}>
              <Icon name="close-circle-outline" size={22} color="#5e5d78" />
            </Pressable>
          </View>
        ))}
        {state.costRows.length < 30 && (
          <Button variant="ghost" className="self-start py-2" onPress={() => state.setCostRows((rows) => [...rows, { label: "", amount: "" }])} testID="ea-cost-add">+ Add a cost</Button>
        )}
      </View>

      <Question label="Physical activity?" help="Sport, dancing, a hike…">
        <YesNo value={answers.physicalActivity} onChange={(v) => set("physicalActivity", v)} testID="ea-activity" />
      </Question>

      <Question label="Food?">
        <YesNo value={answers.food} onChange={(v) => set("food", v)} testID="ea-food" />
      </Question>

      {state.nativeShown && (
        <View>
          <Label>Native ticket link</Label>
          <Input value={state.nativeUrl} onChangeText={state.setNative} keyboardType="url" autoCapitalize="none" placeholder="https://…" maxLength={500} testID="ea-native" />
          <Muted className="mt-1 text-xs">Native is LSESU&apos;s only approved ticketing. Function doesn&apos;t take payments.</Muted>
        </View>
      )}

      {choice && (
        <View className="gap-2 rounded-xl bg-brand-soft px-3.5 py-3">
          <T variant="semibold" testID="ea-summary">
            {choice.formName} · {result?.available ? `submit by ${formatAdminDate(result.submitBy)}` : "add the date to see when to submit it"}
          </T>
          <Muted className="text-xs" testID="ea-reasons">{choice.reasons.join(" ")}</Muted>
          {result?.available && !result.bankHolidaysKnown && <Muted className="text-xs">Bank holidays that far ahead aren&apos;t listed yet, so only weekends are skipped.</Muted>}
        </View>
      )}
      {result?.available && result.late && (
        <T variant="semibold" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger" testID="ea-late">
          This is already late: {state.su} asks for {noticePhrase(result.noticeLabel)}.
        </T>
      )}

      <Question label="Has the SU approved this event?">
        <View className="flex-row flex-wrap gap-2">
          <Choice active={state.suApproved} onPress={() => state.setSuApproved(true)} testID="su-approved-yes">Yes</Choice>
          <Choice active={!state.suApproved} onPress={() => state.setSuApproved(false)} testID="su-approved-no">Not yet</Choice>
        </View>
      </Question>
    </Card>
  );
}

function Question({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <View>
      <Label>{label}</Label>
      {help && <Muted className="-mt-1 mb-2 text-xs">{help}</Muted>}
      {children}
    </View>
  );
}

function Choice({ active, onPress, children, testID }: { active: boolean; onPress: () => void; children: string; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: active }} aria-checked={active} className={`min-h-[44px] items-center justify-center rounded-xl border px-4 py-2.5 ${active ? "border-brand bg-brand-soft" : "border-line bg-surface"}`} testID={testID}>
      <T variant="semibold" className={active ? "text-brand" : ""}>{children}</T>
    </Pressable>
  );
}

function Choices<V extends string>({ value, onChange, options, testID }: { value: V; onChange: (v: V) => void; options: [V, string][]; testID: string }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map(([v, label]) => (
        <Choice key={v} active={value === v} onPress={() => onChange(v)} testID={`${testID}-${v}`}>{label}</Choice>
      ))}
    </View>
  );
}

function YesNo({ value, onChange, testID }: { value: boolean; onChange: (v: boolean) => void; testID: string }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Choice active={value} onPress={() => onChange(true)} testID={`${testID}-yes`}>Yes</Choice>
      <Choice active={!value} onPress={() => onChange(false)} testID={`${testID}-no`}>No</Choice>
    </View>
  );
}
