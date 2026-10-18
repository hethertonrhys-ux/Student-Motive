import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventPeople, getLedger, type Person } from "@/lib/event-people";
import { formatPounds, settle } from "@/lib/ledger";
import { hasEnded, nowMs } from "@/lib/time";
import type { EventTable, MotiveEvent } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { InstantArea } from "@/components/instant";
import { NameForm } from "@/components/name-form";
import { saveName } from "@/app/account/actions";
import { ActionButton } from "./action-button";
import { chooseTable, confirmSeat, deleteMyPayment, joinEvent, leaveEvent, recordMyPayment, recordMyResult } from "./actions";
import { AlsoTables } from "./also-tables";
import { SelfReport } from "./self-report";
import { BankLedger } from "./bank-ledger";
import { saveBankLedger } from "./bank-actions";
import { bankEditorRows } from "@/lib/bank-rows";

type Props = { event: MotiveEvent; society: { name: string; slug: string } | null };

// You, as you'll appear straight after tapping a button (before the database
// confirms it). See InstantArea.
type You = { id: string; name: string };
function asPerson(you: You, status: Person["status"], tableId: string | null): Person {
  return { userId: you.id, name: you.name, avatarUrl: null, status, tableId, finishPosition: null, joinedAt: new Date(0).toISOString(), alsoTables: [], confirmedTableId: null };
}

// The "join this event" part of an event page.
export async function Participation({ event, society }: Props) {
  const profile = await getProfile();
  const finished = hasEnded(event.ends_at);

  if (event.is_cancelled) return null;

  if (!profile) {
    if (finished) return null;
    return (
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {event.format === "tables" ? "Log in to pick your table." : event.format === "entries" ? "Log in to enter." : "Log in to say you're going."}
        </p>
        <Link href={`/login?next=/e/${event.id}`} className="btn">Log in</Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: isMember }, { people, tables }] = await Promise.all([
    supabase.rpc("is_society_member", { sid: event.society_id }),
    getEventPeople(supabase, event.id),
  ]);
  const me = people.find((p) => p.userId === profile.id) ?? null;
  const you: You = { id: profile.id, name: profile.display_name || "You" };
  const canJoin = !event.members_only || isMember === true;

  // Members see each other's names, so ask for one before joining.
  if (!finished && canJoin && !me && !profile.display_name) {
    return (
      <div className="mt-6">
        <NameForm action={saveName.bind(null, `/e/${event.id}`)} />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {finished ? (
        me && event.results_published ? <MyResults eventId={event.id} userId={profile.id} tables={tables} /> : null
      ) : !canJoin ? (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Members only</p>
            <p className="text-sm text-muted">Join {society?.name ?? "the society"} to take part.</p>
          </div>
          {society && <Link href={`/s/${society.slug}`} className="btn">Become a member</Link>}
        </div>
      ) : event.format === "tables" ? (
        <InstantArea>
          <TablesPicker event={event} tables={tables} people={people} me={me} you={you} />
        </InstantArea>
      ) : event.format === "entries" ? (
        <InstantArea>
          <EntryPanel event={event} people={people} me={me} you={you} />
        </InstantArea>
      ) : (
        <InstantArea>
          <GoingPanel event={event} me={me} you={you} />
        </InstantArea>
      )}

      {/* Tables where this player is the bank: their bank screen. */}
      {!event.results_published &&
        tables.filter((t) => t.bank_user_id === profile.id).map((t) => (
          <BankScreen key={t.id} event={event} table={t} people={people} />
        ))}

      {/* Playing at a table with a bank (and not the bank): buy in and cash out with them. */}
      {me?.status === "going" && !event.results_published && (() => {
        const myTable = tables.find((t) => t.id === me.tableId);
        if (!myTable?.bank_user_id || myTable.bank_user_id === profile.id) return null;
        return <MyBankLine event={event} table={myTable} me={me} people={people} />;
      })()}

      {me?.status === "going" &&
        !event.results_published &&
        (new Date(event.starts_at).getTime() <= nowMs() || Boolean(tables.find((t) => t.id === me.tableId)?.started_at)) &&
        (event.format !== "tables" || me.tableId) &&
        !tables.find((t) => t.id === me.tableId)?.bank_user_id && <MySelfReport event={event} me={me} people={people} />}

      {/* Members see who else is coming. */}
      {isMember && event.format !== "tables" && people.some((p) => p.status === "going") && (
        <WhosComing people={people.filter((p) => p.status === "going")} meId={profile.id} numbered={event.format === "entries"} finished={finished} />
      )}
    </div>
  );
}

// "preview" draws the panel as it will look after a tap (no "after" of its own).
function GoingPanel({ event, me, you, preview }: { event: MotiveEvent; me: Person | null; you: You; preview?: boolean }) {
  const after = (next: Person | null) => (preview ? undefined : <GoingPanel event={event} me={next} you={you} preview />);
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      {me ? (
        <>
          <p className="font-semibold"><span className="text-ok">✓</span> You&apos;re going</p>
          <ActionButton action={leaveEvent.bind(null, event.id)} variant="link" after={after(null)}>Can&apos;t make it</ActionButton>
        </>
      ) : (
        <>
          <p className="font-semibold">Coming?</p>
          <ActionButton action={joinEvent.bind(null, event.id, null)} after={after(asPerson(you, "going", null))}>I&apos;m going</ActionButton>
        </>
      )}
    </div>
  );
}

function EntryPanel({ event, people, me, you, preview }: { event: MotiveEvent; people: Person[]; me: Person | null; you: You; preview?: boolean }) {
  const entered = event.going_count;
  const full = event.capacity !== null && entered >= event.capacity;
  const waitlist = people.filter((p) => p.status === "waitlist");
  const myWaitPosition = me?.status === "waitlist" ? waitlist.findIndex((p) => p.userId === me.userId) + 1 : 0;
  // How the panel will look straight after a tap.
  const others = people.filter((p) => p.userId !== you.id);
  const after = (next: Person | null, count: number) =>
    preview ? undefined : <EntryPanel event={{ ...event, going_count: count }} people={next ? [...others, next] : others} me={next} you={you} preview />;

  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-lg font-bold">Entries</p>
        <p className="text-sm font-semibold text-muted">
          {entered}{event.capacity ? ` / ${event.capacity}` : ""} entered{full ? " · Full" : ""}
        </p>
      </div>
      {event.capacity && (
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (entered / event.capacity) * 100)}%` }} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {me?.status === "going" ? (
          <>
            <p className="font-semibold"><span className="text-ok">✓</span> You&apos;re entered</p>
            <ActionButton action={leaveEvent.bind(null, event.id)} variant="link" confirmText="Withdraw your entry? If there's a waiting list, your place goes to the next person." after={after(null, Math.max(0, entered - 1))}>
              Withdraw
            </ActionButton>
          </>
        ) : me?.status === "waitlist" ? (
          <>
            <p className="font-semibold">You&apos;re number {myWaitPosition} on the waiting list</p>
            <ActionButton action={leaveEvent.bind(null, event.id)} variant="link" after={after(null, entered)}>Leave waiting list</ActionButton>
          </>
        ) : (
          <ActionButton
            action={joinEvent.bind(null, event.id, null)}
            after={full ? after(asPerson(you, "waitlist", null), entered) : after(asPerson(you, "going", null), entered + 1)}
          >
            {full ? "Join the waiting list" : "Enter"}
          </ActionButton>
        )}
      </div>
    </div>
  );
}

// Poker-style tables: pick a seat and your avatar appears there.
function TablesPicker({
  event,
  tables,
  people,
  me,
  you,
  preview,
}: {
  event: MotiveEvent;
  tables: EventTable[];
  people: Person[];
  me: Person | null;
  you: You;
  preview?: boolean;
}) {
  const unseated = people.filter((p) => p.status === "going" && (!p.tableId || !tables.some((t) => t.id === p.tableId)));
  // How the tables will look straight after a tap: you at a table, at none, or gone.
  const others = people.filter((p) => p.userId !== you.id);
  const after = (tableId: string | null | "leave") => {
    if (preview) return undefined;
    const next = tableId === "leave" ? null : me ? { ...me, tableId } : asPerson(you, "going", tableId);
    return <TablesPicker event={event} tables={tables} people={next ? [...others, next] : others} me={next} you={you} preview />;
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Pick your table</h2>
        {me && (
          <ActionButton action={leaveEvent.bind(null, event.id)} variant="link" confirmText="Leave this event?" after={after("leave")}>
            I can&apos;t make it
          </ActionButton>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tables.map((table) => {
          const seated = people.filter((p) => p.status === "going" && p.tableId === table.id);
          const willing = people.filter((p) => p.status === "going" && p.tableId !== table.id && p.alsoTables.includes(table.id));
          const mine = me?.tableId === table.id;
          const full = seated.length >= table.seats;
          return (
            <div key={table.id} className={`card ${mine ? "border-brand ring-2 ring-brand/30" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                  {table.name}
                  {table.started_at && !hasEnded(event.ends_at) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 font-sans text-[11px] font-bold text-white">
                      <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
                    </span>
                  )}
                </h3>
                <span className="text-sm font-semibold text-muted">
                  {table.level && <span className="text-ink">{table.level} · </span>}
                  {seated.length}/{table.seats}
                </span>
              </div>
              <PokerTable seats={table.seats} seated={seated} meId={me?.userId ?? null} />
              {willing.length > 0 && (
                <p className="mt-2 text-center text-xs font-semibold text-muted">
                  +{willing.length} also happy to play here
                </p>
              )}
              <div className="mt-3 flex justify-center">
                {mine ? (
                  <ActionButton action={chooseTable.bind(null, event.id, null)} variant="ghost" className="py-2" after={after(null)}>Leave this table</ActionButton>
                ) : full ? (
                  <span className="py-2 text-sm font-semibold text-muted">Table full</span>
                ) : me ? (
                  <ActionButton action={chooseTable.bind(null, event.id, table.id)} className="py-2" after={after(table.id)}>{me.tableId ? "Move here" : "Sit here"}</ActionButton>
                ) : (
                  <ActionButton action={joinEvent.bind(null, event.id, table.id)} className="py-2" after={after(table.id)}>Sit here</ActionButton>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {me && <AlsoTables eventId={event.id} tables={tables} myTableId={me.tableId} selected={me.alsoTables} />}

      {/* Only ask to confirm when there's something new to confirm. */}
      {me?.tableId && me.confirmedTableId !== me.tableId && (
        <form action={confirmSeat.bind(null, event.id)} className="card flex flex-wrap items-center justify-between gap-3 border-brand bg-brand-soft">
          <p className="font-semibold">
            {me.confirmedTableId ? "You've moved to " : "You're at "}
            {tables.find((t) => t.id === me.tableId)?.name}
            {tables.find((t) => t.id === me.tableId)?.level ? ` · ${tables.find((t) => t.id === me.tableId)?.level}` : ""}
          </p>
          <button className="btn">{me.confirmedTableId ? "Confirm change" : "Confirm my seat"}</button>
        </form>
      )}

      {!me && (
        <p className="text-sm text-muted">
          Not sure which table yet?{" "}
          <ActionButton action={joinEvent.bind(null, event.id, null)} variant="link" after={after(null)}>Just say I&apos;m going</ActionButton>
        </p>
      )}
      {unseated.length > 0 && (
        <div className="card">
          <p className="mb-2 text-sm font-semibold text-muted">Going, no table yet</p>
          <div className="flex flex-wrap gap-2">
            {unseated.map((p) => (
              <span key={p.userId} className="inline-flex items-center gap-1.5 rounded-full bg-bg py-1 pr-3 pl-1 text-sm font-semibold">
                <Avatar name={p.name} url={p.avatarUrl} size={24} ring={p.userId === me?.userId} /> {p.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Green felt with seats around the edge.
function PokerTable({ seats, seated, meId }: { seats: number; seated: Person[]; meId: string | null }) {
  return (
    <div className="relative mx-auto mt-4 aspect-[16/10] w-full max-w-sm">
      <div className="absolute inset-[16%] rounded-[999px] border-[6px] border-[#5b3a1e] bg-[radial-gradient(ellipse_at_center,#1f8a4c,#126235)] shadow-inner" />
      {Array.from({ length: seats }, (_, i) => {
        // Seats spaced evenly around an ellipse, starting at the top.
        const angle = (i / seats) * 2 * Math.PI - Math.PI / 2;
        const left = 50 + 44 * Math.cos(angle);
        const top = 50 + 40 * Math.sin(angle);
        const person = seated[i];
        return (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
            {person ? (
              <span className="flex flex-col items-center">
                <Avatar name={person.name} url={person.avatarUrl} size={34} ring={person.userId === meId} />
                <span className="mt-0.5 max-w-16 truncate rounded bg-surface/90 px-1 text-[10px] font-bold leading-tight">
                  {person.userId === meId ? "You" : person.name.split(" ")[0]}
                </span>
              </span>
            ) : (
              <span className="block size-[30px] rounded-full border-2 border-dashed border-line bg-surface/60" aria-label="Empty seat" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WhosComing({ people, meId, numbered, finished }: { people: Person[]; meId: string; numbered: boolean; finished: boolean }) {
  const ordered = finished && people.some((p) => p.finishPosition)
    ? [...people].sort((a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999))
    : people;
  return (
    <div className="card">
      <p className="mb-3 font-semibold">{finished ? "Who came" : "Who's coming"} ({people.length})</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ordered.map((p, i) => (
          <li key={p.userId} className="flex items-center gap-2">
            {numbered && <span className="w-6 text-right text-sm text-muted">{p.finishPosition ?? (finished ? "" : i + 1)}</span>}
            <Avatar name={p.name} url={p.avatarUrl} size={28} ring={p.userId === meId} />
            <span className="font-semibold">{p.userId === meId ? `${p.name} (you)` : p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// After the event: what you owe or are owed.
async function MyResults({ eventId, userId, tables }: { eventId: string; userId: string; tables: EventTable[] }) {
  const supabase = await createClient();
  const { rows, payments } = await getLedger(supabase, eventId);
  const myRows = rows.filter((r) => r.user_id === userId);
  if (myRows.length === 0) return null;

  return (
    <div className="space-y-4">
      {myRows.map((mine) => {
        const tableRows = rows.filter((r) => r.table_id === mine.table_id);
        const names = new Map(tableRows.map((r) => [r.id, r.player_name]));
        const s = settle(
          tableRows.map((r) => ({ id: r.id, name: r.player_name, netPence: r.net_pence + r.adjust_pence })),
          payments.filter((p) => names.has(p.from_row)).map((p) => ({ fromId: p.from_row, toId: p.to_row, amountPence: p.amount_pence })),
        );
        const myTransfers = s.transfers.filter((t) => t.fromId === mine.id || t.toId === mine.id);
        const table = tables.find((t) => t.id === mine.table_id);
        if (table?.bank_user_id) {
          const payout = mine.cashout_pence === null ? null : mine.cashout_pence + mine.adjust_pence;
          const net = (payout ?? 0) - mine.buyin_pence;
          return (
            <div key={mine.id} className="card space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-xl font-bold">Your result · {table.name}</h2>
                <span className={`font-display text-2xl font-extrabold ${net > 0 ? "text-ok" : net < 0 ? "text-danger" : ""}`}>{formatPounds(net, true)}</span>
              </div>
              <p className="text-sm">
                You bought in <strong>{formatPounds(mine.buyin_pence)}</strong>
                {payout !== null && <> and cashed out <strong>{formatPounds(payout)}</strong></>}.
              </p>
              {payout !== null && payout > 0 && (
                <p className="rounded-xl bg-brand-soft px-3 py-2 font-semibold">
                  {mine.paid_out ? "✓ The bank has paid you " : "The bank pays you "}{formatPounds(payout)}
                </p>
              )}
              {payout !== null && payout < 0 && (
                <p className="rounded-xl bg-brand-soft px-3 py-2 font-semibold">You owe the bank {formatPounds(-payout)}</p>
              )}
              {mine.adjust_pence !== 0 && (
                <p className="text-xs text-muted">Includes {formatPounds(Math.abs(mine.adjust_pence))} {mine.adjust_pence < 0 ? "less" : "more"} as your share of a counting difference.</p>
              )}
            </div>
          );
        }
        return (
          <div key={mine.id} className="card space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold">Your result{table ? ` · ${table.name}` : ""}</h2>
              <span className={`font-display text-2xl font-extrabold ${mine.net_pence > 0 ? "text-ok" : mine.net_pence < 0 ? "text-danger" : ""}`}>
                {formatPounds(mine.net_pence, true)}
              </span>
            </div>
            {mine.adjust_pence !== 0 && (
              <p className="text-sm text-muted">
                Includes {formatPounds(Math.abs(mine.adjust_pence))} {mine.adjust_pence < 0 ? "extra" : "back"} as your share of a counting
                difference at the table.
              </p>
            )}
            {s.imbalancePence !== 0 ? (
              <p className="text-sm text-muted">The committee is still checking the numbers.</p>
            ) : myTransfers.length === 0 ? (
              <p className="font-semibold">You&apos;re all square. Nothing to pay or collect.</p>
            ) : (
              <ul className="space-y-1.5">
                {myTransfers.map((t, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2">
                    <span>
                      {t.fromId === mine.id ? <>You pay <strong>{names.get(t.toId)}</strong></> : <><strong>{names.get(t.fromId)}</strong> pays you</>}
                    </span>
                    <span className="font-display text-lg font-extrabold">{formatPounds(t.amountPence)}</span>
                  </li>
                ))}
              </ul>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-muted">Whole table</summary>
              <ul className="mt-2 space-y-1">
                {tableRows.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.player_name}</span>
                    <span className="font-semibold">{formatPounds(r.net_pence, true)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        );
      })}
    </div>
  );
}

async function MySelfReport({ event, me, people }: { event: MotiveEvent; me: Person; people: Person[] }) {
  const supabase = await createClient();
  const { rows, payments } = await getLedger(supabase, event.id);
  const myRow = rows.find((r) => r.user_id === me.userId);
  const rowName = new Map(rows.map((r) => [r.id, r.player_name]));
  const tablemates = people
    .filter((p) => p.status === "going" && p.userId !== me.userId && p.tableId === me.tableId)
    .map((p) => ({ userId: p.userId, name: p.name }));

  const myPayments = myRow
    ? payments
        .filter((p) => p.from_row === myRow.id || p.to_row === myRow.id)
        .map((p) => {
          const iPaid = p.from_row === myRow.id;
          return {
            id: p.id,
            iPaid,
            otherName: rowName.get(iPaid ? p.to_row : p.from_row) ?? "another player",
            amountPence: p.amount_pence,
            mine: p.created_by === me.userId,
          };
        })
    : [];

  return (
    <SelfReport
      myNetPence={myRow ? myRow.net_pence : null}
      tablemates={tablemates}
      payments={myPayments}
      resultAction={recordMyResult.bind(null, event.id)}
      paymentAction={recordMyPayment.bind(null, event.id)}
      deletePaymentAction={deleteMyPayment.bind(null, event.id)}
    />
  );
}

async function BankScreen({ event, table, people }: { event: MotiveEvent; table: EventTable; people: Person[] }) {
  const supabase = await createClient();
  const { rows } = await getLedger(supabase, event.id);
  const saved = rows.filter((r) => r.table_id === table.id);
  const seated = people.filter((p) => p.status === "going" && p.tableId === table.id);
  return (
    <div className="space-y-2">
      <p className="font-display text-xl font-bold">You&apos;re the bank for {table.name}</p>
      <BankLedger
        key={saved.map((r) => `${r.id}:${r.buyin_pence}:${r.cashout_pence}:${r.paid_out}:${r.adjust_pence}`).join("|")}
        title={`${table.name}${table.level ? ` · ${table.level}` : ""}`}
        bankName="You"
        initialRows={bankEditorRows(saved, seated)}
        saveAction={saveBankLedger.bind(null, event.id, table.id)}
      />
    </div>
  );
}

async function MyBankLine({ event, table, me, people }: { event: MotiveEvent; table: EventTable; me: Person; people: Person[] }) {
  const supabase = await createClient();
  const { rows } = await getLedger(supabase, event.id);
  const mine = rows.find((r) => r.user_id === me.userId && r.table_id === table.id);
  const bankName = people.find((p) => p.userId === table.bank_user_id)?.name ?? "The bank";
  return (
    <div className="card space-y-2">
      <p className="font-semibold">🏦 {bankName} is the bank for {table.name}</p>
      <p className="text-sm text-muted">Buy in and cash out with them. They&apos;ll record it here.</p>
      {mine && (
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-bg p-2"><dt className="text-xs text-muted">Bought in</dt><dd className="font-bold">{formatPounds(mine.buyin_pence)}</dd></div>
          <div className="rounded-xl bg-bg p-2"><dt className="text-xs text-muted">Cash-out</dt><dd className="font-bold">{mine.cashout_pence === null ? "Playing" : formatPounds(mine.cashout_pence + mine.adjust_pence)}</dd></div>
          <div className="rounded-xl bg-bg p-2"><dt className="text-xs text-muted">Paid</dt><dd className="font-bold">{mine.paid_out ? "✓" : "–"}</dd></div>
        </dl>
      )}
    </div>
  );
}
