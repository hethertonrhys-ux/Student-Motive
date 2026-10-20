import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import {
  addDays,
  answersFromRow,
  checklistDoneAt,
  eventAdminConfig,
  eventAdminFor,
  formatAdminDate,
  formatPounds,
  getCards,
  getVenues,
  hasEnded,
  londonDate,
  loadEventAdmin,
  nowMs,
  publishEvent,
  securityEmailDraft,
  setChecklistItem,
  workingDaysBetween,
  type ChecklistItem,
  type EventAdminResult,
  type EventAdminRow,
  type Hazard,
  type MotiveEvent,
  type Person,
  type PersonCard,
  type Society,
} from "@function/shared";
import { noticePhrase } from "@/components/committee/event-admin-section";
import { Icon } from "@/components/icon";
import { Button, Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// The "Event admin" card on the committee's manage-event screen (LSE
// societies with Event admin on): which SU form the event needs and why,
// when to submit it by, the notes, the checklist to tick off, a preview of
// what Function will use to prepare the risk assessment and budget drafts,
// and a draft email to Security. Function prepares drafts; the committee
// checks and submits them.

type Props = {
  society: Pick<Society, "id" | "name" | "university">;
  event: MotiveEvent;
  people: Person[];
  // Reloads the manage screen (after publishing).
  onEventChanged: () => Promise<unknown>;
};

export function EventAdminCard({ society, event, people, onEventChanged }: Props) {
  const admin = useQuery({ queryKey: ["event-admin", event.id], queryFn: () => loadEventAdmin(supabase, event.id) });
  const editHref = `/dashboard/${society.id}/events/${event.id}/edit`;

  return (
    <Card className="mt-8 gap-6" testID="event-admin-card">
      <View className="gap-1">
        <T variant="display-bold" className="text-xl">Event admin</T>
        <Muted className="text-sm" testID="ea-prepares">Function prepares drafts; your committee checks and submits them.</Muted>
      </View>
      {admin.isPending ? (
        <Muted>Loading…</Muted>
      ) : admin.isError ? (
        <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load the event admin. Try again.</T>
      ) : !admin.data ? (
        <View className="gap-3" testID="ea-no-answers">
          <T>Answer a few questions about this event to see which SU form it needs and when to submit it.</T>
          <Link href={editHref as never} asChild>
            <Button className="self-start" testID="ea-edit-answers">Add the answers</Button>
          </Link>
        </View>
      ) : (
        <AdminBody society={society} event={event} people={people} row={admin.data} editHref={editHref} onEventChanged={onEventChanged} />
      )}
    </Card>
  );
}

function AdminBody({ society, event, people, row, editHref, onEventChanged }: Omit<Props, "society"> & { society: Props["society"]; row: EventAdminRow; editHref: string }) {
  const queryClient = useQueryClient();
  const answers = answersFromRow(row);
  const result = eventAdminFor({ university: society.university, answers, startsAt: event.starts_at, endsAt: event.ends_at, costPence: event.cost_pence ?? null, today: nowMs() });
  const su = eventAdminConfig(society.university)?.su ?? "your SU";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!result.available) return <Muted testID="ea-unavailable">{result.message}</Muted>;

  const refreshAdmin = () => queryClient.invalidateQueries({ queryKey: ["event-admin", event.id] });
  async function run(key: string, action: () => Promise<{ error?: string }>, after: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      const r = await action();
      if (r.error) setError(r.error);
      else await after();
    } finally {
      setBusy(null);
    }
  }
  const afterPublish = () =>
    Promise.all([
      onEventChanged(),
      refreshAdmin(),
      queryClient.invalidateQueries({ queryKey: ["managed", society.id] }),
      queryClient.invalidateQueries({ queryKey: ["edit-event", society.id, event.id] }),
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["founding-progress", society.id] }),
      queryClient.invalidateQueries({ queryKey: ["founding-badge", society.id] }),
    ]);

  const finished = hasEnded(event.ends_at);
  const formDone = !!checklistDoneAt(row, "form_submitted");
  const approved = !!checklistDoneAt(row, "su_approved");
  const needed = result.checklist.filter((c) => c.needed);
  const notNeeded = result.checklist.filter((c) => !c.needed);
  const securityNeeded = needed.some((c) => c.key === "security_list");

  return (
    <>
      {/* Which form, and when */}
      <View className="gap-2">
        <T variant="semibold" className="text-lg" testID="ea-form">{result.formName}</T>
        <View className="gap-1" testID="ea-why">
          {result.reasons.map((r) => (
            <Muted key={r} className="text-sm">{r}</Muted>
          ))}
        </View>
        <T variant="semibold" testID="ea-submit-by">
          Submit by {formatAdminDate(result.submitBy)} ({formDone ? "submitted" : daysLeftText(result)})
        </T>
        {!result.bankHolidaysKnown && <Muted className="text-xs">Bank holidays that far ahead aren&apos;t listed yet, so only weekends are skipped.</Muted>}
        {result.late && !formDone && !finished && (
          <View className="flex-row gap-2.5 rounded-xl border border-danger bg-danger/10 px-3.5 py-3">
            <Icon name="alert-circle" size={20} color="#DA291C" />
            <T variant="semibold" className="flex-1 text-sm text-danger" testID="ea-late-warning">
              This is already late. {su} asks for {noticePhrase(result.noticeLabel)}: submit it as soon as you can and tell the SU it&apos;s late.
            </T>
          </View>
        )}
      </View>

      {/* Notes */}
      <View className="gap-2" testID="ea-notes">
        <T variant="semibold">Good to know</T>
        {result.notes.map((n) => (
          <View key={n} className="flex-row gap-2">
            <Muted className="text-sm">•</Muted>
            <Muted className="flex-1 text-sm">{n}</Muted>
          </View>
        ))}
      </View>

      {/* The checklist */}
      <View className="gap-2" testID="ea-checklist">
        <T variant="semibold">Checklist</T>
        {event.is_draft && (
          <Muted className="text-sm" testID="ea-draft-note">Draft: only your committee can see this event. It goes live once you tick &ldquo;SU approved&rdquo; and publish it.</Muted>
        )}
        {needed.map((item) => (
          <CheckRow
            key={item.key}
            item={item}
            doneAt={checklistDoneAt(row, item.key)}
            today={londonDate(nowMs())}
            busy={busy !== null}
            saving={busy === item.key}
            onToggle={(done) => void run(item.key, () => setChecklistItem(supabase, event.id, item.key, done), refreshAdmin)}
          />
        ))}
        {notNeeded.length > 0 && (
          <Muted className="text-xs" testID="ea-not-needed">Not needed for this event: {notNeeded.map((c) => c.label).join(", ")}.</Muted>
        )}
        {event.is_draft && approved && (
          <View className="mt-1 gap-2 rounded-xl border border-brand bg-brand-soft px-3.5 py-3" testID="ea-publish-ready">
            <T variant="semibold">The SU has approved it. Publish it so members can see it and sign up.</T>
            <Button className="self-start" onPress={() => void run("publish", () => publishEvent(supabase, event.id), afterPublish)} disabled={busy !== null} testID="ea-publish">
              {busy === "publish" ? "Publishing…" : "Publish now"}
            </Button>
          </View>
        )}
        {error && <T variant="semibold" className="text-sm text-danger" testID="ea-error">{error}</T>}
      </View>

      {/* The SU paperwork drafts */}
      <View className="gap-1 rounded-xl border border-line px-3.5 py-3" testID="ea-docs-coming-soon">
        <T variant="semibold">Risk assessment and budget: coming soon</T>
        <Muted className="text-sm">Function will prepare drafts of {su}&apos;s risk assessment and budget from your answers, for your committee to check and submit. Until then, the previews below show what will go in them.</Muted>
      </View>

      <HazardsPreview hazards={result.hazards} />
      <BudgetPreview result={result} />

      {securityNeeded && <SecurityEmail society={society} event={event} people={people} speakerNames={answers.speakerNames} speakerOrg={answers.speakerOrg} />}

      <Link href={editHref as never} asChild>
        <Button variant="ghost" className="self-start" testID="ea-edit-answers">Edit answers</Button>
      </Link>
    </>
  );
}

// "12 working days left", "today's the last day", "late". Counts today and
// the submit-by day itself (both are days the committee can still submit).
function daysLeftText(result: EventAdminResult): string {
  const today = londonDate(nowMs());
  if (result.late) return "late";
  if (today === result.submitBy) return "today's the last day";
  const n = workingDaysBetween(today, addDays(result.submitBy, 1));
  return `${n} working day${n === 1 ? "" : "s"} left`;
}

function CheckRow({ item, doneAt, today, busy, saving, onToggle }: { item: ChecklistItem; doneAt: string | null; today: string; busy: boolean; saving: boolean; onToggle: (done: boolean) => void }) {
  const done = !!doneAt;
  const overdue = !done && today > item.deadline;
  return (
    <Pressable
      onPress={() => onToggle(!done)}
      disabled={busy}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled: busy }}
      aria-checked={done}
      accessibilityLabel={item.label}
      className={`min-h-[56px] flex-row items-center gap-3 rounded-xl border px-3.5 py-3 ${done ? "border-ok bg-ok/10" : "border-line bg-surface"} ${busy && !saving ? "opacity-60" : ""}`}
      testID={`check-${item.key}`}
    >
      <View className={`h-7 w-7 items-center justify-center rounded-lg border-2 ${done ? "border-ok bg-ok" : "border-line bg-surface"}`}>{done && <Icon name="checkmark" size={18} color="#fff" />}</View>
      <View className="flex-1">
        <T variant="semibold" className="text-base">{item.label}</T>
        {done ? (
          <Muted className="text-xs">Done {formatAdminDate(londonDate(doneAt!))}</Muted>
        ) : overdue ? (
          <T variant="semibold" className="text-xs text-danger">Was due {formatAdminDate(item.deadline)}</T>
        ) : (
          <Muted className="text-xs">Due {formatAdminDate(item.deadline)}</Muted>
        )}
      </View>
      {saving && <Muted className="text-xs">Saving…</Muted>}
    </Pressable>
  );
}

const RATING: Record<Hazard["rating"], { label: string; box: string; text: string }> = {
  low: { label: "Low", box: "bg-ok/10", text: "text-ok" },
  medium: { label: "Medium", box: "bg-brand-soft", text: "text-brand" },
  high: { label: "High", box: "bg-danger/10", text: "text-danger" },
};

function HazardsPreview({ hazards }: { hazards: Hazard[] }) {
  return (
    <View className="gap-3" testID="ea-hazards">
      <View>
        <T variant="semibold">Risk assessment preview</T>
        <Muted className="text-sm">What Function will use to prepare the risk assessment draft. Your committee checks it and adapts it to the event.</Muted>
      </View>
      {hazards.length === 0 ? (
        <Muted className="text-sm">Nothing stands out from your answers. Your committee still fills in the SU&apos;s risk assessment.</Muted>
      ) : (
        hazards.map((h) => (
          <View key={h.key} className="gap-1.5 rounded-xl border border-line px-3.5 py-3" testID={`ea-hazard-${h.key}`}>
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <T variant="semibold" className="flex-1">{h.title}</T>
              <View className={`rounded-full px-2.5 py-0.5 ${RATING[h.rating].box}`} testID={`ea-rating-${h.key}`}>
                <T variant="semibold" className={`text-xs ${RATING[h.rating].text}`}>{RATING[h.rating].label}</T>
              </View>
            </View>
            <Muted className="text-xs">{h.reason}</Muted>
            <T className="text-sm"><T variant="semibold" className="text-sm">Who&apos;s at risk: </T>{h.whoAtRisk}</T>
            <View className="gap-0.5">
              {h.controls.map((c) => (
                <View key={c} className="flex-row gap-2">
                  <Muted className="text-sm">•</Muted>
                  <T className="flex-1 text-sm">{c}</T>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function BudgetPreview({ result }: { result: EventAdminResult }) {
  const linesTotal = result.costLines.reduce((sum, l) => sum + (l.pence > 0 ? l.pence : 0), 0);
  return (
    <View className="gap-2" testID="ea-budget-preview">
      <View>
        <T variant="semibold">Budget preview</T>
        <Muted className="text-sm">What Function will use to prepare the budget draft.</Muted>
      </View>
      {result.costLines.length === 0 && result.budgetTotalPence === 0 ? (
        <Muted className="text-sm">No costs added.</Muted>
      ) : (
        <View className="overflow-hidden rounded-xl border border-line">
          {result.costLines.map((l, i) => (
            <View key={`${l.label}-${i}`} className={`flex-row justify-between gap-3 px-3.5 py-2 ${i > 0 ? "border-t border-line" : ""}`} testID={`ea-cost-${i}`}>
              <T className="flex-1 text-sm">{l.label || "Cost"}</T>
              <T className="text-sm">{formatPounds(l.pence)}</T>
            </View>
          ))}
          <View className={`flex-row justify-between gap-3 bg-bg px-3.5 py-2 ${result.costLines.length ? "border-t border-line" : ""}`} testID="ea-budget-total">
            <T variant="semibold" className="text-sm">Total</T>
            <T variant="semibold" className="text-sm">{formatPounds(result.budgetTotalPence)}</T>
          </View>
        </View>
      )}
      {result.costLines.length > 0 && result.budgetTotalPence > linesTotal && (
        <Muted className="text-xs">Your total budget is more than the costs listed ({formatPounds(linesTotal)}).</Muted>
      )}
    </View>
  );
}

// "Draft email to Security": opens the email app with the subject and body
// filled in and the To left empty (we don't know the building's Security
// reception address). Names only, never anyone's email address.
function SecurityEmail({ society, event, people, speakerNames, speakerOrg }: { society: Props["society"]; event: MotiveEvent; people: Person[]; speakerNames: string; speakerOrg: string }) {
  const going = people.filter((p) => p.status === "going");
  const ids = going.map((p) => p.userId).sort();
  // Everyone going needs their card: a read that fails (or comes back
  // short) counts as an error, so nobody is silently left off the list.
  // Looked up 100 at a time, so a big event isn't one over-long request.
  const cards = useQuery({
    queryKey: ["ea-guest-cards", event.id, ids.join(",")],
    queryFn: async () => {
      const m = new Map<string, PersonCard>();
      for (let i = 0; i < ids.length; i += 100) {
        for (const [id, card] of await getCards(supabase, ids.slice(i, i + 100))) m.set(id, card);
      }
      if (m.size < new Set(ids).size) throw new Error("missing cards");
      return m;
    },
    enabled: ids.length > 0,
  });
  const venues = useQuery({ queryKey: ["venues"], queryFn: () => getVenues(supabase), enabled: !!event.venue_id });
  const [error, setError] = useState<string | null>(null);
  const venue = event.venue_id ? venues.data?.find((v) => v.id === event.venue_id) : null;
  const venueText = [venue?.name, event.location_note].filter(Boolean).join(" · ");
  const ready = (ids.length === 0 || cards.isSuccess) && (!event.venue_id || !venues.isPending);
  const draft = securityEmailDraft({
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    venue: venueText || null,
    societyName: society.name,
    speakerNames,
    speakerOrg,
    homeUniversity: society.university,
    people: going.map((p) => {
      const card = cards.data?.get(p.userId);
      // No card: their uni isn't known, so they're listed (the safe way round for Security).
      return { name: p.name, fullName: card?.full_name ?? null, university: card ? (card.university ?? null) : null, status: p.status };
    }),
  });
  async function open() {
    setError(null);
    try {
      await Linking.openURL(draft.url);
    } catch {
      setError("Couldn't open your email app. Copy the names from the guest list instead.");
    }
  }
  return (
    <View className="gap-2" testID="ea-security">
      <View>
        <T variant="semibold">Security guest list</T>
        <Muted className="text-sm" testID="ea-security-summary">
          {`Email the speakers' names and the non-${society.university} guests going to the building's Security reception by the day before. The draft lists ${draft.guests.length === 1 ? "1 guest" : `${draft.guests.length} guests`} so far, by name only; add the Security reception's address yourself.`}
        </Muted>
      </View>
      <Button variant="ghost" className="self-start" onPress={() => void open()} disabled={!ready} testID="ea-security-email">
        Draft email to Security
      </Button>
      {cards.isError && <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load who&apos;s going. Try again.</T>}
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </View>
  );
}
