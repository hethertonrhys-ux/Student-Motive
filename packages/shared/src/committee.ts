import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventPeople, getLedger, type LedgerPaymentRecord, type LedgerRowRecord, type Person } from "./event-people";
import { type FeatureSubject, loadSocietyFeatures } from "./features";
import { parsePounds } from "./ledger";
import type { PhotoBytes } from "./profile";
import { readCostInput } from "./social-actions";
import { londonInputToIso } from "./time";
import { CATEGORIES, type EventCategory, type EventFormat, type EventTable, type MotiveEvent, type Society } from "./types";
import { AUDIENCES, uniFromEmail, uniShort } from "./universities";

// The committee's tools: societies you run, posting and editing events,
// managing who's coming, results and settling up, members. Every call is
// checked by the database (only the society's committee may change it).

type Result = { error?: string };
const AUDIENCE_VALUES: string[] = AUDIENCES;

// ---- Societies you run, and claims ----

export type ClaimRow = { id: string; status: string; created_at: string; societies: { name: string } | null };

export async function loadDashboard(supabase: SupabaseClient, myId: string): Promise<{ societies: Society[]; claims: ClaimRow[] }> {
  const [{ data: admins }, { data: claims }] = await Promise.all([
    supabase.from("society_admins").select("societies(*)").eq("user_id", myId),
    supabase.from("society_claims").select("id, status, created_at, societies(name)").eq("user_id", myId).in("status", ["pending", "rejected"]).order("created_at", { ascending: false }),
  ]);
  const societies = ((admins ?? []) as unknown as { societies: Society | null }[])
    .map((r) => r.societies)
    .filter((s): s is Society => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { societies, claims: (claims ?? []) as unknown as ClaimRow[] };
}

export async function loadClaimSocieties(supabase: SupabaseClient, university: string): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from("societies").select("id, name").eq("kind", "society").eq("university", university).order("name");
  return (data ?? []) as { id: string; name: string }[];
}

export async function submitClaim(supabase: SupabaseClient, myId: string, input: { societyId: string; committeeRole: string; message: string }): Promise<Result> {
  const committeeRole = input.committeeRole.trim().slice(0, 100);
  const message = input.message.trim().slice(0, 1000);
  if (!input.societyId) return { error: "Choose your society." };
  if (!committeeRole) return { error: "Tell us your role on the committee." };
  const { error } = await supabase.from("society_claims").insert({ society_id: input.societyId, user_id: myId, committee_role: committeeRole, message: message || null });
  if (error) return { error: error.code === "23505" ? "You've already asked to manage this society. We'll be in touch." : "Something went wrong. Please try again." };
  return {};
}

// ---- One society ----

export type ManagedSociety = { society: Society; events: MotiveEvent[]; pendingCount: number; features: FeatureSubject };

// The society, if you run it (null otherwise), with the features it uses.
export async function loadManagedSociety(supabase: SupabaseClient, societyId: string): Promise<ManagedSociety | null> {
  const [{ data: society }, { data: allowed }, features] = await Promise.all([
    supabase.from("societies").select("*").eq("id", societyId).maybeSingle<Society>(),
    supabase.rpc("is_society_admin", { sid: societyId }),
    loadSocietyFeatures(supabase, societyId),
  ]);
  if (!society || allowed !== true) return null;
  const [{ data: events }, { count }] = await Promise.all([
    supabase.from("events").select("*").eq("society_id", societyId).order("starts_at", { ascending: true }),
    supabase.from("society_members").select("user_id", { count: "exact", head: true }).eq("society_id", societyId).eq("status", "pending"),
  ]);
  return { society, events: (events ?? []) as MotiveEvent[], pendingCount: count ?? 0, features };
}

const text = (value: string | null | undefined, max: number) => (value ?? "").trim().slice(0, max) || null;

function url(value: string | null | undefined): { value: string | null; error?: string } {
  const v = text(value, 500);
  if (!v) return { value: null };
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    new URL(withScheme);
    return { value: withScheme };
  } catch {
    return { value: null, error: "That link doesn't look right." };
  }
}

const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;

// Uploads an image to images/<societyId>/... and returns its public URL.
export async function uploadSocietyImage(supabase: SupabaseClient, societyId: string, image: PhotoBytes | null): Promise<{ url: string | null; error?: string }> {
  if (!image || image.bytes.byteLength === 0) return { url: null };
  if (image.bytes.byteLength > 5 * 1024 * 1024) return { url: null, error: "Images must be under 5MB." };
  const path = `${societyId}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from("images").upload(path, image.bytes, { contentType: image.type });
  if (error) return { url: null, error: "The image couldn't be uploaded. Please try again." };
  return { url: supabase.storage.from("images").getPublicUrl(path).data.publicUrl };
}

export type SocietyInput = { name: string; description: string; instagram: string; website: string };

export async function updateSociety(supabase: SupabaseClient, societyId: string, input: SocietyInput, logo: PhotoBytes | null): Promise<Result> {
  const website = url(input.website);
  if (website.error) return { error: website.error };
  const uploaded = await uploadSocietyImage(supabase, societyId, logo);
  if (uploaded.error) return { error: uploaded.error };
  const instagram = text(input.instagram, 60)?.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "") ?? null;
  const name = text(input.name, 120);
  const { error } = await supabase
    .from("societies")
    .update({ ...(name ? { name } : {}), description: text(input.description, 2000), instagram, website: website.value, ...(uploaded.url ? { logo_url: uploaded.url } : {}) })
    .eq("id", societyId);
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// ---- Events ----

export type TableDraft = { id?: string; name: string; level: string; seats: number | string };

export type EventInput = {
  title: string;
  category: string;
  freeFood: boolean;
  startsAt: string; // "YYYY-MM-DDTHH:mm" UK time
  endsAt: string;
  venueId: string; // a venue id, or "custom"
  lat: number | null;
  lng: number | null;
  locationNote: string;
  costKind: "none" | "free" | "paid";
  costAmount: string;
  format: EventFormat;
  capacity: string;
  membersOnly: boolean;
  audience: string;
  tables: TableDraft[];
  description: string;
  ticketUrl: string;
  isCancelled?: boolean;
  removeImage?: boolean;
};

type TableRow = { id?: string; name: string; level: string | null; seats: number; position: number };

function readTables(drafts: TableDraft[], format: EventFormat): { list: TableRow[] } | { error: string } {
  if (format !== "tables") return { list: [] };
  if (drafts.length === 0) return { error: "Add at least one table." };
  if (drafts.length > 50) return { error: "That's a lot of tables. The limit is 50." };
  const list: TableRow[] = [];
  for (const [i, t] of drafts.entries()) {
    const name = String(t.name ?? "").trim().slice(0, 40);
    const level = String(t.level ?? "").trim().slice(0, 40) || null;
    const seats = Number(t.seats);
    if (!name) return { error: `Table ${i + 1} needs a name.` };
    if (!Number.isInteger(seats) || seats < 2 || seats > 20) return { error: `${name}: seats must be between 2 and 20.` };
    const id = typeof t.id === "string" && /^[0-9a-f-]{36}$/i.test(t.id) ? t.id : undefined;
    list.push({ id, name, level, seats, position: i });
  }
  return { list };
}

export type ParsedEvent = { tables: TableRow[]; values: Record<string, unknown> & { starts_at: string; ends_at: string } };

export function readEventInput(input: EventInput): ParsedEvent | { error: string } {
  const title = text(input.title, 120);
  const category = input.category as EventCategory;
  const venueId = text(input.venueId, 100);
  const startsAt = londonInputToIso(input.startsAt);
  const endsAt = londonInputToIso(input.endsAt);
  const ticket = url(input.ticketUrl);
  if (!title) return { error: "Give your event a name." };
  if (!CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category." };
  if (!venueId) return { error: "Choose where it is." };
  const custom = venueId === "custom";
  const lat = input.lat ?? NaN;
  const lng = input.lng ?? NaN;
  const locationNote = text(input.locationNote, 120);
  if (custom && !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { error: "Drop a pin on the map to show where it is." };
  if (custom && !locationNote) return { error: "Give the place a name, e.g. the pub or building." };
  if (!startsAt || !endsAt) return { error: "Add a start and end time." };
  if (new Date(endsAt) <= new Date(startsAt)) return { error: "The end time must be after the start time." };
  if (ticket.error) return { error: `Ticket link: ${ticket.error}` };
  const format = input.format;
  if (!["standard", "entries", "tables"].includes(format)) return { error: "Choose how people join." };
  const capacityRaw = input.capacity.trim();
  const capacity = format === "entries" && capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000)) return { error: "The maximum entries must be a whole number." };
  const tables = readTables(input.tables, format);
  if ("error" in tables) return { error: tables.error };
  const cost = readCostInput(input.costKind, input.costAmount);
  if ("error" in cost) return { error: cost.error };
  return {
    tables: tables.list,
    values: {
      format,
      capacity,
      members_only: input.audience === "members" ? true : input.membersOnly,
      audience: AUDIENCE_VALUES.includes(input.audience) ? input.audience : "uni",
      title,
      category,
      venue_id: custom ? null : venueId,
      lat: custom ? lat : null,
      lng: custom ? lng : null,
      location_note: locationNote,
      starts_at: startsAt,
      ends_at: endsAt,
      description: text(input.description, 5000),
      free_food: input.freeFood,
      cost_pence: cost.value,
      ticket_url: ticket.value,
    },
  };
}

// Makes the event's tables match the form: update, add, and remove.
async function syncTables(supabase: SupabaseClient, eventId: string, tables: TableRow[]) {
  const { data: existing } = await supabase.from("event_tables").select("id").eq("event_id", eventId);
  const keep = new Set(tables.filter((t) => t.id).map((t) => t.id));
  const remove = (existing ?? []).map((t) => t.id as string).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("event_tables").delete().in("id", remove);
    if (error) return error;
  }
  for (const t of tables) {
    const values = { name: t.name, level: t.level, seats: t.seats, position: t.position };
    const { error } = t.id ? await supabase.from("event_tables").update(values).eq("id", t.id).eq("event_id", eventId) : await supabase.from("event_tables").insert({ ...values, event_id: eventId });
    if (error) return error;
  }
  return null;
}

export async function createEvent(supabase: SupabaseClient, societyId: string, input: EventInput, image: PhotoBytes | null): Promise<{ id: string } | { error: string }> {
  const parsed = readEventInput(input);
  if ("error" in parsed) return { error: parsed.error };
  if (new Date(parsed.values.ends_at) < new Date()) return { error: "That event has already finished. Check the dates." };
  const uploaded = await uploadSocietyImage(supabase, societyId, image);
  if (uploaded.error) return { error: uploaded.error };
  const { data: created, error } = await supabase.from("events").insert({ ...parsed.values, society_id: societyId, image_url: uploaded.url }).select("id").single();
  if (error || !created) return { error: "Couldn't post the event. Please try again." };
  const tablesError = await syncTables(supabase, created.id as string, parsed.tables);
  if (tablesError) return { error: "The event was posted, but the tables couldn't be saved. Edit the event to try again." };
  return { id: created.id as string };
}

export async function updateEvent(supabase: SupabaseClient, societyId: string, eventId: string, input: EventInput, image: PhotoBytes | null): Promise<Result> {
  const parsed = readEventInput(input);
  if ("error" in parsed) return { error: parsed.error };
  const uploaded = await uploadSocietyImage(supabase, societyId, image);
  if (uploaded.error) return { error: uploaded.error };
  const { error } = await supabase
    .from("events")
    .update({ ...parsed.values, is_cancelled: input.isCancelled === true, ...(uploaded.url ? { image_url: uploaded.url } : {}), ...(input.removeImage && !uploaded.url ? { image_url: null } : {}) })
    .eq("id", eventId)
    .eq("society_id", societyId);
  if (error) return { error: "Couldn't save the event. Please try again." };
  const tablesError = await syncTables(supabase, eventId, parsed.tables);
  if (tablesError) return { error: "The event was saved, but the tables couldn't be. Please try again." };
  return {};
}

export async function deleteEvent(supabase: SupabaseClient, societyId: string, eventId: string): Promise<Result> {
  const { error } = await supabase.from("events").delete().eq("id", eventId).eq("society_id", societyId);
  return error ? { error: "Couldn't delete the event. Please try again." } : {};
}

export async function loadEventForEdit(supabase: SupabaseClient, societyId: string, eventId: string): Promise<{ event: MotiveEvent; tables: EventTable[] } | null> {
  const [{ data: event }, { data: tables }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).eq("society_id", societyId).maybeSingle<MotiveEvent>(),
    supabase.from("event_tables").select("*").eq("event_id", eventId).order("position"),
  ]);
  return event ? { event, tables: (tables ?? []) as EventTable[] } : null;
}

// ---- Managing an event: who's coming, results, settling up ----

// Members show by name only; `email` is set for invites (typed in by the
// committee) and, for Function admins, for members too.
export type MemberListRow = { user_id: string | null; name: string | null; email: string | null; status: "pending" | "approved" | "invited"; created_at: string };

export type ManageEvent = {
  event: MotiveEvent;
  people: Person[];
  tables: EventTable[];
  ledger: { rows: LedgerRowRecord[]; payments: LedgerPaymentRecord[] };
  // Approved members who haven't joined (for late arrivals).
  notComing: { userId: string; name: string }[];
};

export async function loadManageEvent(supabase: SupabaseClient, societyId: string, eventId: string): Promise<ManageEvent | null> {
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).eq("society_id", societyId).maybeSingle<MotiveEvent>();
  if (!event) return null;
  const [{ people, tables }, ledger, { data: memberRows }] = await Promise.all([getEventPeople(supabase, eventId), getLedger(supabase, eventId), supabase.rpc("society_member_list", { sid: societyId })]);
  const notComing = ((memberRows ?? []) as MemberListRow[])
    .filter((m) => m.status === "approved" && m.user_id && !people.some((p) => p.userId === m.user_id))
    .map((m) => ({ userId: m.user_id!, name: m.name ?? "Member" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { event, people, tables, ledger, notComing };
}

const ok = ({ error }: { error: { message: string } | null }): Result => (error ? { error: "Couldn't save that. Please try again." } : {});

export const removeEntry = async (supabase: SupabaseClient, eventId: string, userId: string): Promise<Result> => ok(await supabase.from("event_entries").delete().eq("event_id", eventId).eq("user_id", userId));
export const promoteEntry = async (supabase: SupabaseClient, eventId: string, userId: string): Promise<Result> => ok(await supabase.from("event_entries").update({ status: "going" }).eq("event_id", eventId).eq("user_id", userId));
export const moveEntry = async (supabase: SupabaseClient, eventId: string, userId: string, tableId: string | null): Promise<Result> => ok(await supabase.from("event_entries").update({ table_id: tableId }).eq("event_id", eventId).eq("user_id", userId));

// Add someone who arrived late (or without their phone) to the event.
export async function addLateArrival(supabase: SupabaseClient, eventId: string, userId: string, tableId: string | null): Promise<Result> {
  if (!userId) return { error: "Choose a member." };
  const { error } = await supabase.from("event_entries").upsert({ event_id: eventId, user_id: userId, status: "going", table_id: tableId }, { onConflict: "event_id,user_id" });
  return error ? { error: "Couldn't add them. Please try again." } : {};
}

// Finishing positions (1 = winner); blank clears.
export async function savePositions(supabase: SupabaseClient, eventId: string, positions: { userId: string; position: string }[]): Promise<Result> {
  for (const { userId, position } of positions) {
    const n = Number(position.trim());
    const value = position.trim() === "" ? null : Number.isInteger(n) && n > 0 ? n : undefined;
    if (value === undefined) continue;
    const { error } = await supabase.from("event_entries").update({ finish_position: value }).eq("event_id", eventId).eq("user_id", userId);
    if (error) return { error: "Couldn't save the positions. Please try again." };
  }
  return {};
}

export type EditorRow = { key: string; id?: string; userId?: string | null; name: string; amount: string; adjust: number; selfReported?: boolean };

// Saved results, plus anyone seated at the table who isn't in them yet.
export function startingRows(saved: LedgerRowRecord[], seated: Person[]): EditorRow[] {
  const rows: EditorRow[] = saved.map((r) => ({ key: r.id, id: r.id, userId: r.user_id, name: r.player_name, amount: r.net_pence === 0 ? "" : (r.net_pence / 100).toFixed(2).replace(/\.00$/, ""), adjust: r.adjust_pence, selfReported: Boolean(r.user_id && r.created_by === r.user_id) }));
  const savedUsers = new Set(saved.map((r) => r.user_id).filter(Boolean));
  for (const p of seated) if (!savedUsers.has(p.userId)) rows.push({ key: `user-${p.userId}`, userId: p.userId, name: p.name, amount: "", adjust: 0 });
  return rows;
}

export async function saveLedger(supabase: SupabaseClient, eventId: string, tableId: string | null, input: EditorRow[]): Promise<Result> {
  const rows = [];
  for (const r of input) {
    const name = String(r.name ?? "").trim().slice(0, 60);
    if (!name) continue;
    const pence = String(r.amount ?? "").trim() === "" ? 0 : parsePounds(String(r.amount));
    if (pence === null) return { error: `${name}: "${r.amount}" isn't an amount. Use numbers like 12.50 or -8.` };
    const adjust = Number(r.adjust ?? 0);
    if (!Number.isInteger(adjust) || Math.abs(adjust) > 1000000) return { error: "The split looks wrong. Clear it and try again." };
    rows.push({ id: typeof r.id === "string" ? r.id : undefined, user_id: typeof r.userId === "string" ? r.userId : null, player_name: name, net_pence: pence, adjust_pence: adjust });
  }
  let existingQuery = supabase.from("ledger_rows").select("id").eq("event_id", eventId);
  existingQuery = tableId ? existingQuery.eq("table_id", tableId) : existingQuery.is("table_id", null);
  const { data: existing } = await existingQuery;
  const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const remove = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  if (remove.length) await supabase.from("ledger_rows").delete().in("id", remove);
  for (const r of rows) {
    const values = { player_name: r.player_name, net_pence: r.net_pence, adjust_pence: r.adjust_pence, user_id: r.user_id };
    const { error } = r.id ? await supabase.from("ledger_rows").update(values).eq("id", r.id).eq("event_id", eventId) : await supabase.from("ledger_rows").insert({ ...values, event_id: eventId, table_id: tableId });
    if (error) return { error: "Couldn't save the results. Please try again." };
  }
  return {};
}

export async function addPayment(supabase: SupabaseClient, eventId: string, fromRow: string, toRow: string, amount: string): Promise<Result> {
  const pence = parsePounds(amount);
  if (!fromRow || !toRow) return { error: "Choose who paid and who they paid." };
  if (fromRow === toRow) return { error: "Choose two different players." };
  if (pence === null || pence <= 0) return { error: "Enter the amount they paid, e.g. 12.50." };
  const { error } = await supabase.from("ledger_payments").insert({ event_id: eventId, from_row: fromRow, to_row: toRow, amount_pence: pence });
  return error ? { error: "Couldn't save that payment. Please try again." } : {};
}
export const deletePayment = async (supabase: SupabaseClient, eventId: string, paymentId: string): Promise<Result> => ok(await supabase.from("ledger_payments").delete().eq("id", paymentId).eq("event_id", eventId));
export const setResultsPublished = async (supabase: SupabaseClient, eventId: string, published: boolean): Promise<Result> => ok(await supabase.from("events").update({ results_published: published }).eq("id", eventId));
export const setTableBank = async (supabase: SupabaseClient, eventId: string, tableId: string, userId: string | null): Promise<Result> => ok(await supabase.from("event_tables").update({ bank_user_id: userId }).eq("id", tableId).eq("event_id", eventId));
// Start a table before the event's official start time (or undo it).
export const setTableStarted = async (supabase: SupabaseClient, eventId: string, tableId: string, started: boolean): Promise<Result> =>
  ok(await supabase.from("event_tables").update({ started_at: started ? new Date().toISOString() : null }).eq("id", tableId).eq("event_id", eventId));

// ---- Members ----

export async function loadMembers(supabase: SupabaseClient, societyId: string): Promise<MemberListRow[]> {
  const { data } = await supabase.rpc("society_member_list", { sid: societyId });
  return ((data ?? []) as MemberListRow[]).sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
}

export type InviteResult = { error?: string; added?: number; skipped?: string[]; uni?: string };

export async function inviteMembers(supabase: SupabaseClient, society: Pick<Society, "id" | "university">, raw: string): Promise<InviteResult> {
  // Accept emails separated by new lines, commas, semicolons or spaces (e.g. pasted from a spreadsheet).
  const emails = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (emails.length === 0) return { error: "Paste at least one email address." };
  if (emails.length > 2000) return { error: "That's over 2,000 emails. Add them in smaller batches." };
  const skipped = emails.filter((e) => {
    const uni = uniFromEmail(e);
    return uni && uni.id !== society.university;
  });
  const { data, error } = await supabase.rpc("invite_members", { sid: society.id, emails });
  if (error) return { error: "Couldn't add those members. Please try again." };
  return { added: Number(data ?? 0), skipped, uni: uniShort(society.university) };
}
export const approveMember = async (supabase: SupabaseClient, societyId: string, userId: string): Promise<Result> => ok(await supabase.from("society_members").update({ status: "approved", approved_at: new Date().toISOString() }).eq("society_id", societyId).eq("user_id", userId));
export const removeMember = async (supabase: SupabaseClient, societyId: string, userId: string): Promise<Result> => ok(await supabase.from("society_members").delete().eq("society_id", societyId).eq("user_id", userId));
export const removeInvite = async (supabase: SupabaseClient, societyId: string, email: string): Promise<Result> => ok(await supabase.from("society_member_invites").delete().eq("society_id", societyId).eq("email", email));
