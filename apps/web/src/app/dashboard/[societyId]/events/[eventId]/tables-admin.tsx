"use client";

import { Avatar } from "@/components/avatar";
import type { Person } from "@/lib/event-people";
import type { EventTable } from "@/lib/types";
import { useInstant } from "@/lib/use-instant";

type View = { people: Person[]; started: Record<string, string | null>; startedLabel: Record<string, string> };

// The committee's tables: who's where, start/undo, move and remove. Taps
// change the screen straight away; the database catches up in the background
// (and the screen goes back with a message if it fails).
export function TablesAdmin({
  tables,
  people,
  startedLabel,
  move,
  remove,
  setStarted,
  eventStarted,
  finished,
}: {
  tables: EventTable[];
  people: Person[];
  // "Started 19:05", written by the server so the time reads the same everywhere.
  startedLabel: Record<string, string>;
  move: (userId: string, formData: FormData) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  setStarted: (tableId: string, started: boolean) => Promise<void>;
  eventStarted: boolean;
  finished: boolean;
}) {
  const [view, run] = useInstant<View>({
    people,
    started: Object.fromEntries(tables.map((t) => [t.id, t.started_at])),
    startedLabel,
  });

  function moveTo(userId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const tableId = String(data.get("table_id") ?? "") || null;
    run({ ...view, people: view.people.map((p) => (p.userId === userId ? { ...p, tableId } : p)) }, () => move(userId, data));
  }
  function removePerson(userId: string) {
    run({ ...view, people: view.people.filter((p) => p.userId !== userId) }, () => remove(userId));
  }
  function start(tableId: string, started: boolean) {
    const time = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
    run(
      {
        ...view,
        started: { ...view.started, [tableId]: started ? new Date().toISOString() : null },
        startedLabel: { ...view.startedLabel, [tableId]: time },
      },
      () => setStarted(tableId, started),
    );
  }

  const shown = view.people;
  const groups = [...tables.map((t) => ({ table: t as EventTable | null, list: shown.filter((p) => p.tableId === t.id) })), {
    table: null,
    list: shown.filter((p) => !p.tableId || !tables.some((t) => t.id === p.tableId)),
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
            {table && !finished && (
              view.started[table.id] ? (
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-xs font-bold text-white">
                    <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
                  </span>
                  <span className="text-muted">
                    Started {view.startedLabel[table.id]}
                  </span>
                  <form onSubmit={(e) => { e.preventDefault(); start(table.id, false); }}>
                    <button className="font-semibold text-muted hover:text-danger">Undo</button>
                  </form>
                </div>
              ) : !eventStarted ? (
                <form onSubmit={(e) => { e.preventDefault(); start(table.id, true); }} className="mt-2">
                  <button className="btn py-1.5 text-sm">▶ Start table now</button>
                </form>
              ) : null
            )}
            {table && (() => {
              const willing = shown.filter((p) => p.tableId !== table.id && p.alsoTables.includes(table.id));
              return willing.length > 0 ? (
                <div className="mt-3 rounded-xl bg-brand-soft p-2.5">
                  <p className="mb-1.5 text-xs font-bold text-brand">Also happy to play here</p>
                  <ul className="space-y-1.5">
                    {willing.map((p) => (
                      <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <Avatar name={p.name} url={p.avatarUrl} size={22} />
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-xs text-muted">{tables.find((t) => t.id === p.tableId)?.name ?? "no table"}</span>
                        </span>
                        <form onSubmit={(e) => { e.preventDefault(); moveTo(p.userId, e.currentTarget); }}>
                          <input type="hidden" name="table_id" value={table.id} />
                          <button className="text-xs font-bold text-brand hover:underline">Move here</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
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
                      <form onSubmit={(e) => { e.preventDefault(); moveTo(p.userId, e.currentTarget); }} className="flex items-center gap-1">
                        <select name="table_id" defaultValue={p.tableId ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" aria-label={`Move ${p.name}`}>
                          <option value="">No table</option>
                          {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button className="text-sm font-semibold text-brand">Move</button>
                      </form>
                      <form onSubmit={(e) => { e.preventDefault(); removePerson(p.userId); }}>
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
