import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManagedSociety } from "@/lib/society";
import { getEventPeople, getLedger, type LedgerRowRecord, type Person } from "@/lib/event-people";
import { formatEventTime, hasEnded, nowMs } from "@/lib/time";
import { FORMATS, type MotiveEvent } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { HIDE, InstantArea, InstantFormButton } from "@/components/instant";
import { TablesAdmin } from "./tables-admin";
import { LedgerEditor, type EditorRow } from "./ledger-editor";
import { LateArrivalForm } from "./late-arrival-form";
import { BankLedger } from "@/app/e/[id]/bank-ledger";
import { saveBankLedger } from "@/app/e/[id]/bank-actions";
import { bankEditorRows } from "@/lib/bank-rows";
import {
  addLateArrival,
  addPayment,
  deletePayment,
  moveEntry,
  promoteEntry,
  removeEntry,
  saveLedger,
  savePositions,
  setResultsPublished,
  setTableBank,
  setTableStarted,
} from "./actions";

export const metadata: Metadata = { title: "Manage event" };

export default async function ManageEventPage({ params }: PageProps<"/dashboard/[societyId]/events/[eventId]">) {
  const { societyId, eventId } = await params;
  const { supabase, society } = await requireManagedSociety(societyId);

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("society_id", societyId)
    .maybeSingle<MotiveEvent>();
  if (!event) notFound();

  const [{ people, tables }, ledger, { data: memberRows }] = await Promise.all([
    getEventPeople(supabase, eventId),
    getLedger(supabase, eventId),
    supabase.rpc("society_member_list", { sid: societyId }),
  ]);
  const notComing = ((memberRows ?? []) as { user_id: string | null; name: string | null; status: string }[])
    .filter((m) => m.status === "approved" && m.user_id && !people.some((p) => p.userId === m.user_id))
    .map((m) => ({ userId: m.user_id!, name: m.name ?? "Member" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const going = people.filter((p) => p.status === "going");
  const waitlist = people.filter((p) => p.status === "waitlist");
  const finished = hasEnded(event.ends_at);
  const formatLabel = FORMATS.find((f) => f.value === event.format)?.label;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href={`/dashboard/${societyId}`} className="text-sm font-semibold text-muted hover:text-ink">← {society.name}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{event.title}</h1>
          <p className="text-muted">
            {formatEventTime(event.starts_at, event.ends_at)} · {formatLabel}
            {event.members_only && " · Members only"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/e/${eventId}`} className="btn-ghost py-2">View</Link>
          <Link href={`/dashboard/${societyId}/events/${eventId}/edit`} className="btn-ghost py-2">Edit</Link>
        </div>
      </div>

      {/* ---------- Who's coming ---------- */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">
          {event.format === "entries" ? "Entries" : "Going"} ({going.length}
          {event.format === "entries" && event.capacity ? ` of ${event.capacity}` : ""})
        </h2>

        {event.format === "tables" ? (
          <TablesAdmin
            tables={tables}
            people={going}
            startedLabel={Object.fromEntries(
              tables.map((t) => [t.id, t.started_at ? new Date(t.started_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) : ""]),
            )}
            move={moveEntry.bind(null, societyId, eventId)}
            remove={removeEntry.bind(null, societyId, eventId)}
            setStarted={setTableStarted.bind(null, societyId, eventId)}
            eventStarted={new Date(event.starts_at).getTime() <= nowMs()}
            finished={finished}
          />
        ) : event.format === "entries" && finished ? (
          <form action={savePositions.bind(null, societyId, eventId)} className="card mt-3 space-y-3">
            <p className="text-sm text-muted">Enter finishing positions (1 = winner). Leave blank for anyone who didn&apos;t place.</p>
            <ul className="space-y-2">
              {[...going].sort((a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999)).map((p) => (
                <li key={p.userId} className="flex items-center gap-3">
                  <input name={`pos_${p.userId}`} defaultValue={p.finishPosition ?? ""} inputMode="numeric" className="input w-16 text-center" aria-label={`${p.name} position`} />
                  <Avatar name={p.name} url={p.avatarUrl} size={32} />
                  <span className="font-semibold">{p.name}</span>
                </li>
              ))}
            </ul>
            <button className="btn">Save positions</button>
          </form>
        ) : (
          <PeopleList people={going} numbered={event.format === "entries"} removeAction={(uid) => removeEntry.bind(null, societyId, eventId, uid)} />
        )}

        {!finished || event.format === "tables" ? (
          <LateArrivalForm
            action={addLateArrival.bind(null, societyId, eventId)}
            members={notComing}
            tables={event.format === "tables" ? tables : []}
          />
        ) : null}

        {waitlist.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold">Waiting list ({waitlist.length})</h3>
            <ul className="mt-2 space-y-2">
              {waitlist.map((p, i) => (
                <InstantArea key={p.userId}>
                  <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                    <span className="flex items-center gap-3">
                      <span className="w-5 text-sm text-muted">{i + 1}</span>
                      <Avatar name={p.name} url={p.avatarUrl} size={28} />
                      <span className="font-semibold">{p.name}</span>
                    </span>
                    <span className="flex gap-3 text-sm font-semibold">
                      <InstantFormButton action={promoteEntry.bind(null, societyId, eventId, p.userId)} after={HIDE} className="text-brand">Move to entries</InstantFormButton>
                      <InstantFormButton action={removeEntry.bind(null, societyId, eventId, p.userId)} after={HIDE} className="text-danger">Remove</InstantFormButton>
                    </span>
                  </li>
                </InstantArea>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- Results ledger ---------- */}
      {event.format !== "entries" && (
        <section className="mt-12">
          <InstantArea>
            <ResultsHeader published={event.results_published} action={setResultsPublished.bind(null, societyId, eventId, !event.results_published)} />
          </InstantArea>

          <div className="mt-4 space-y-4">
            {(event.format === "tables" ? tables : [null]).map((table) => {
              const tableId = table?.id ?? null;
              const saved = ledger.rows.filter((r) => r.table_id === tableId);
              const seated = going.filter((p) => (tableId ? p.tableId === tableId : true));
              const initialRows = startingRows(saved, seated);
              const bank = table?.bank_user_id ? people.find((p) => p.userId === table.bank_user_id) : undefined;
              return (
                <div key={tableId ?? "event"} className="space-y-2">
                  {table && (
                    // Step 1: how this table settles up.
                    <form action={setTableBank.bind(null, societyId, eventId, table.id)} className="rounded-xl border border-line bg-surface p-3 text-sm">
                      <p className="font-semibold">How {table.name} settles up</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select name="bank_user_id" defaultValue={table.bank_user_id ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1.5" aria-label={`Bank for ${table.name}`}>
                          <option value="">Auto-settle (fewest payments)</option>
                          {seated.map((p) => <option key={p.userId} value={p.userId}>{p.name} is the bank</option>)}
                        </select>
                        <button className="font-semibold text-brand">Set</button>
                      </div>
                      <p className="mt-1.5 text-xs text-muted">
                        {table.bank_user_id
                          ? "One player is the bank: they record buy-ins and cash-outs, and everyone pays or is paid by them."
                          : "Auto-settle: enter everyone's result and the app works out the fewest payments between players."}
                      </p>
                    </form>
                  )}
                  {table && table.bank_user_id ? (
                    <BankLedger
                      key={`bank-${tableId}-${saved.map((r) => `${r.id}:${r.buyin_pence}:${r.cashout_pence}:${r.paid_out}:${r.adjust_pence}`).join("|")}`}
                      title={`${table.name}${table.level ? ` · ${table.level}` : ""}`}
                      bankName={bank?.name ?? "The bank"}
                      initialRows={bankEditorRows(saved, seated)}
                      saveAction={saveBankLedger.bind(null, eventId, table.id)}
                    />
                  ) : (
                <LedgerEditor
                  // Re-load the editor whenever saved results change.
                  key={`${tableId}-${saved.map((r) => `${r.id}:${r.net_pence}:${r.player_name}`).join("|")}`}
                  title={table ? `${table.name}${table.level ? ` · ${table.level}` : ""}` : "Results"}
                  initialRows={initialRows}
                  payments={ledger.payments.map((p) => ({
                    ...p,
                    addedBy: p.created_by ? (people.find((x) => x.userId === p.created_by)?.name ?? null) : null,
                  }))}
                  saveAction={saveLedger.bind(null, societyId, eventId, tableId)}
                  addPaymentAction={addPayment.bind(null, societyId, eventId)}
                  deletePaymentAction={deletePayment.bind(null, societyId, eventId)}
                />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// Saved results, plus anyone seated at the table who isn't in them yet.
function startingRows(saved: LedgerRowRecord[], seated: Person[]): EditorRow[] {
  const rows: EditorRow[] = saved.map((r) => ({
    key: r.id,
    id: r.id,
    userId: r.user_id,
    name: r.player_name,
    amount: r.net_pence === 0 ? "" : (r.net_pence / 100).toFixed(2).replace(/\.00$/, ""),
    adjust: r.adjust_pence,
    selfReported: Boolean(r.user_id && r.created_by === r.user_id),
  }));
  const savedUsers = new Set(saved.map((r) => r.user_id).filter(Boolean));
  for (const p of seated) {
    if (!savedUsers.has(p.userId)) rows.push({ key: `user-${p.userId}`, userId: p.userId, name: p.name, amount: "", adjust: 0 });
  }
  return rows;
}

function PeopleList({ people, numbered, removeAction }: { people: Person[]; numbered: boolean; removeAction: (uid: string) => () => Promise<void> }) {
  if (people.length === 0) return <p className="mt-2 text-muted">Nobody yet.</p>;
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {people.map((p, i) => (
        <InstantArea key={p.userId}>
          <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="flex items-center gap-3">
              {numbered && <span className="w-5 text-sm text-muted">{i + 1}</span>}
              <Avatar name={p.name} url={p.avatarUrl} size={28} />
              <span className="font-semibold">{p.name}</span>
            </span>
            <InstantFormButton action={removeAction(p.userId)} after={HIDE} className="text-sm font-semibold text-danger hover:underline">Remove</InstantFormButton>
          </li>
        </InstantArea>
      ))}
    </ul>
  );
}

// The "share results" switch. "preview" draws it as it will look straight
// after the tap (see InstantArea).
function ResultsHeader({ published, action, preview }: { published: boolean; action: () => Promise<void>; preview?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-bold">Results &amp; who pays who</h2>
        <p className="text-sm text-muted">
          {published ? "Players who came can see the results and who they pay." : "Only the committee can see this until you share it."}
        </p>
      </div>
      <InstantFormButton action={action} after={preview ? null : <ResultsHeader published={!published} action={action} preview />} className={published ? "btn-ghost" : "btn"}>
        {published ? "Hide from players" : "Share with players"}
      </InstantFormButton>
    </div>
  );
}
