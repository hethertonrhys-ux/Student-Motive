"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManagedSociety } from "@/lib/society";
import { uploadSocietyImage } from "@/lib/storage";
import { londonInputToIso } from "@/lib/time";
import { CATEGORIES, type EventCategory } from "@/lib/types";

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

  return {
    values: {
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

export async function createEvent(societyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireManagedSociety(societyId);

  const parsed = readEvent(formData);
  if (!parsed.values) return { error: parsed.error };
  if (new Date(parsed.values.ends_at) < new Date()) return { error: "That event has already finished. Check the dates." };

  const image = await uploadSocietyImage(supabase, societyId, formData.get("image"));
  if (image.error) return { error: image.error };

  const { error } = await supabase
    .from("events")
    .insert({ ...parsed.values, society_id: societyId, image_url: image.url });

  if (error) return { error: "Couldn't post the event. Please try again." };
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
