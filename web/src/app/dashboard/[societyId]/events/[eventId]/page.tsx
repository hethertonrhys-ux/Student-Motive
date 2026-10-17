import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManagedSociety } from "@/lib/society";
import { getEventPeople, getLedger, type LedgerRowRecord, type Person } from "@/lib/event-people";
import { formatEventTime, hasEnded } from "@/lib/time";
import { FORMATS, type EventTable, type MotiveEvent } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { LedgerEditor } from "./ledger-editor";
import {
  addPayment,
  deletePayment,
  moveEntry,
  promoteEntry,
  removeEntry,
  saveLedger,
  savePositions,
  setResultsPublished,
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

  const [{ people, tables }, ledger] = await Promise.all([getEventPeople(supabase, eventId), getLedger(supabase, eventId)]);
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
          <TablesAdmin tables={tables} people={going} moveAction={(uid) => moveEntry.bind(null, societyId, eventId, uid)} removeAction={(uid) => removeEntry.bind(null, societyId, eventId, uid)} />
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

        {waitlist.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold">Waiting list ({waitlist.length})</h3>
            <ul className="mt-2 space-y-2">
              {waitlist.map((p, i) => (
                <li key={p.userId} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                  <span className="flex items-center gap-3">
                    <span className="w-5 text-sm text-muted">{i + 1}</span>
                    <Avatar name={p.name} url={p.avatarUrl} size={28} />
                    <span className="font-semibold">{p.name}</span>
                  </span>
                  <span className="flex gap-3 text-sm font-semibold">
                    <form action={promoteEntry.bind(null, societyId, eventId, p.userId)}><button className="text-brand">Move to entries</button></form>
                    <form action={removeEntry.bind(null, societyId, eventId, p.userId)}><button className="text-danger">Remove</button></form>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- Results ledger ---------- */}
      {event.format !== "entries" && (
        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Results &amp; who pays who</h2>
              <p className="text-sm text-muted">
                {event.results_published
                  ? "Players who came can see the results and who they pay."
                  : "Only the committee can see this until you share it."}
              </p>
            </div>
            <form action={setResultsPublished.bind(null, societyId, eventId, !event.results_published)}>
              <button className={event.results_published ? "btn-ghost" : "btn"}>
                {event.results_published ? "Hide from players" : "Share with players"}
              </button>
            </form>
          </div>

          <div className="mt-4 space-y-4">
            {(event.format === "tables" ? tables : [null]).map((table) => {
              const tableId = table?.id ?? null;
              const saved = ledger.rows.filter((r) => r.table_id === tableId);
              const seated = going.filter((p) => (tableId ? p.tableId === tableId : true));
              const initialRows = startingRows(saved, seated);
              return (
                <LedgerEditor
                  // Re-load the editor whenever saved results change.
                  key={`${tableId}-${saved.map((r) => `${r.id}:${r.net_pence}:${r.player_name}`).join("|")}`}
                  title={table ? `${table.name}${table.level ? ` · ${table.level}` : ""}` : "Results"}
                  initialRows={initialRows}
                  payments={ledger.payments}
                  saveAction={saveLedger.bind(null, societyId, eventId, tableId)}
                  addPaymentAction={addPayment.bind(null, societyId, eventId)}
                  deletePaymentAction={deletePayment.bind(null, societyId, eventId)}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// Saved results, plus anyone seated at the table who isn't in them yet.
type StartingRow = { key: string; id?: string; userId: string | null; name: string; amount: string };

function startingRows(saved: LedgerRowRecord[], seated: Person[]): StartingRow[] {
  const rows: StartingRow[] = saved.map((r) => ({
    key: r.id,
    id: r.id,
    userId: r.user_id,
    name: r.player_name,
    amount: r.net_pence === 0 ? "" : (r.net_pence / 100).toFixed(2).replace(/\.00$/, ""),
  }));
  const savedUsers = new Set(saved.map((r) => r.user_id).filter(Boolean));
  for (const p of seated) {
    if (!savedUsers.has(p.userId)) rows.push({ key: `user-${p.userId}`, userId: p.userId, name: p.name, amount: "" });
  }
  return rows;
}

function PeopleList({ people, numbered, removeAction }: { people: Person[]; numbered: boolean; removeAction: (uid: string) => () => Promise<void> }) {
  if (people.length === 0) return <p className="mt-2 text-muted">Nobody yet.</p>;
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {people.map((p, i) => (
        <li key={p.userId} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
          <span className="flex items-center gap-3">
            {numbered && <span className="w-5 text-sm text-muted">{i + 1}</span>}
            <Avatar name={p.name} url={p.avatarUrl} size={28} />
            <span className="font-semibold">{p.name}</span>
          </span>
          <form action={removeAction(p.userId)}>
            <button className="text-sm font-semibold text-danger hover:underline">Remove</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function TablesAdmin({
  tables,
  people,
  moveAction,
  removeAction,
}: {
  tables: EventTable[];
  people: Person[];
  moveAction: (uid: string) => (formData: FormData) => Promise<void>;
  removeAction: (uid: string) => () => Promise<void>;
}) {
  const groups = [...tables.map((t) => ({ table: t as EventTable | null, list: people.filter((p) => p.tableId === t.id) })), {
    table: null,
    list: people.filter((p) => !p.tableId || !tables.some((t) => t.id === p.tableId)),
  }];

  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {groups.map(({ table, list }) =>
        !table && list.length === 0 ? null : (
          <div key={table?.id ?? "none"} className="card">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-bold">{table ? table.name : "No table yet"}</h3>
              {table && (
                <span className={`text-sm font-semibold ${list.length >= table.seats ? "text-danger" : "text-muted"}`}>
                  {table.level ? `${table.level} · ` : ""}{list.length}/{table.seats}
                </span>
              )}
            </div>
            {list.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Empty</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {list.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={p.name} url={p.avatarUrl} size={28} />
                      <span className="truncate font-semibold">{p.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <form action={moveAction(p.userId)} className="flex items-center gap-1">
                        <select name="table_id" defaultValue={p.tableId ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" aria-label={`Move ${p.name}`}>
                          <option value="">No table</option>
                          {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button className="text-sm font-semibold text-brand">Move</button>
                      </form>
                      <form action={removeAction(p.userId)}>
                        <button className="text-sm font-semibold text-danger" aria-label={`Remove ${p.name}`}>✕</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      )}
    </div>
  );
}
