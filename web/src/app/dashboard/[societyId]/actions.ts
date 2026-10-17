"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManagedSociety } from "@/lib/society";
import { uploadSocietyImage } from "@/lib/storage";
import { londonInputToIso } from "@/lib/time";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, type EventCategory, type EventFormat } from "@/lib/types";

export type FormState = { error?: string; saved?: boolean };

function text(formData: FormData, key: string, max: number) {
  const value = String(formData.get(key) ?? "").trim().slice(0, max);
  return value || null;
}

function url(formData: FormData, key: string) {
  const value = text(formData, key, 500);
  if (!value) return { value: null };
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    new URL(withScheme);
    return { value: withScheme };
  } catch {
    return { value: null, error: "That link doesn't look right." };
  }
}

// ---------- Society profile ----------

export async function updateSociety(societyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireManagedSociety(societyId);

  const website = url(formData, "website");
  if (website.error) return { error: website.error };

  const logo = await uploadSocietyImage(supabase, societyId, formData.get("logo"));
  if (logo.error) return { error: logo.error };

  const instagram = text(formData, "instagram", 60)?.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "") ?? null;

  const { error } = await supabase
    .from("societies")
    .update({
      description: text(formData, "description", 2000),
      instagram,
      website: website.value,
      ...(logo.url ? { logo_url: logo.url } : {}),
    })
    .eq("id", societyId);

  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath(`/dashboard/${societyId}`);
  return { saved: true };
}

// ---------- Events ----------

function readEvent(formData: FormData) {
  const title = text(formData, "title", 120);
  const category = String(formData.get("category") ?? "") as EventCategory;
  const venueId = text(formData, "venue_id", 100);
  const startsAt = londonInputToIso(String(formData.get("starts_at") ?? ""));
  const endsAt = londonInputToIso(String(formData.get("ends_at") ?? ""));
  const ticket = url(formData, "ticket_url");

  if (!title) return { error: "Give your event a name." };
  if (!CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category." };
  if (!venueId) return { error: "Choose where it is." };
  if (!startsAt || !endsAt) return { error: "Add a start and end time." };
  if (new Date(endsAt) <= new Date(startsAt)) return { error: "The end time must be after the start time." };
  if (ticket.error) return { error: `Ticket link: ${ticket.error}` };

  const format = String(formData.get("format") ?? "standard") as EventFormat;
  if (!["standard", "entries", "tables"].includes(format)) return { error: "Choose how people join." };
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = format === "entries" && capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000)) {
    return { error: "The maximum entries must be a whole number." };
  }

  const tables = readTables(formData, format);
  if ("error" in tables) return { error: tables.error };

  return {
    tables: tables.list,
    values: {
      format,
      capacity,
      members_only: formData.get("members_only") === "on",
      title,
      category,
      venue_id: venueId,
      location_note: text(formData, "location_note", 120),
      starts_at: startsAt,
      ends_at: endsAt,
      description: text(formData, "description", 5000),
      free_food: formData.get("free_food") === "on",
      ticket_url: ticket.value,
    },
  };
}

type TableDraft = { id?: string; name: string; level: string | null; seats: number; position: number };

function readTables(formData: FormData, format: EventFormat): { list: TableDraft[] } | { error: string } {
  if (format !== "tables") return { list: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("tables_json") ?? "[]"));
  } catch {
    return { error: "Couldn't read the tables. Please try again." };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Add at least one table." };
  if (raw.length > 50) return { error: "That's a lot of tables. The limit is 50." };

  const list: TableDraft[] = [];
  for (const [i, t] of raw.entries()) {
    const name = String(t?.name ?? "").trim().slice(0, 40);
    const level = String(t?.level ?? "").trim().slice(0, 40) || null;
    const seats = Number(t?.seats);
    if (!name) return { error: `Table ${i + 1} needs a name.` };
    if (!Number.isInteger(seats) || seats < 2 || seats > 20) return { error: `${name}: seats must be between 2 and 20.` };
    const id = typeof t?.id === "string" && /^[0-9a-f-]{36}$/i.test(t.id) ? t.id : undefined;
    list.push({ id, name, level, seats, position: i });
  }
  return { list };
}

// Makes the event's tables match the form: update, add, and remove.
async function syncTables(supabase: SupabaseClient, eventId: string, tables: TableDraft[]) {
  const { data: existing } = await supabase.from("event_tables").select("id").eq("event_id", eventId);
  const keep = new Set(tables.filter((t) => t.id).map((t) => t.id));
  const remove = (existing ?? []).map((t) => t.id as string).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("event_tables").delete().in("id", remove);
    if (error) return error;
  }
  for (const t of tables) {
    const values = { name: t.name, level: t.level, seats: t.seats, position: t.position };
    const { error } = t.id
      ? await supabase.from("event_tables").update(values).eq("id", t.id).eq("event_id", eventId)
      : await supabase.from("event_tables").insert({ ...values, event_id: eventId });
    if (error) return error;
  }
  return null;
}

export async function createEvent(societyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireManagedSociety(societyId);

  const parsed = readEvent(formData);
  if (!parsed.values) return { error: parsed.error };
  if (new Date(parsed.values.ends_at) < new Date()) return { error: "That event has already finished. Check the dates." };

  const image = await uploadSocietyImage(supabase, societyId, formData.get("image"));
  if (image.error) return { error: image.error };

  const { data: created, error } = await supabase
    .from("events")
    .insert({ ...parsed.values, society_id: societyId, image_url: image.url })
    .select("id")
    .single();

  if (error || !created) return { error: "Couldn't post the event. Please try again." };
  const tablesError = await syncTables(supabase, created.id, parsed.tables);
  if (tablesError) return { error: "The event was posted, but the tables couldn't be saved. Edit the event to try again." };
  revalidatePath(`/dashboard/${societyId}`);
  redirect(`/dashboard/${societyId}?posted=1`);
}

export async function updateEvent(
  societyId: string,
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireManagedSociety(societyId);

  const parsed = readEvent(formData);
  if (!parsed.values) return { error: parsed.error };

  const image = await uploadSocietyImage(supabase, societyId, formData.get("image"));
  if (image.error) return { error: image.error };

  const { error } = await supabase
    .from("events")
    .update({
      ...parsed.values,
      is_cancelled: formData.get("is_cancelled") === "on",
      ...(image.url ? { image_url: image.url } : {}),
      ...(formData.get("remove_image") === "on" && !image.url ? { image_url: null } : {}),
    })
    .eq("id", eventId)
    .eq("society_id", societyId);

  if (error) return { error: "Couldn't save the event. Please try again." };
  const tablesError = await syncTables(supabase, eventId, parsed.tables);
  if (tablesError) return { error: "The event was saved, but the tables couldn't be. Please try again." };
  revalidatePath(`/dashboard/${societyId}`);
  revalidatePath(`/e/${eventId}`);
  redirect(`/dashboard/${societyId}`);
}

export async function deleteEvent(societyId: string, eventId: string) {
  const { supabase } = await requireManagedSociety(societyId);
  await supabase.from("events").delete().eq("id", eventId).eq("society_id", societyId);
  revalidatePath(`/dashboard/${societyId}`);
  redirect(`/dashboard/${societyId}`);
}
