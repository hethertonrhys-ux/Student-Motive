"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { londonInputToIso } from "@/lib/time";
import { CATEGORIES, type EventCategory } from "@/lib/types";

export type HostState = { error?: string };

// Everyone sees roughly where it is (about a 5-minute walk across);
// only the host and people going see the exact spot.
function blur(lat: number, lng: number) {
  const step = { lat: 0.004, lng: 0.006 };
  return {
    lat: Math.round(lat / step.lat) * step.lat,
    lng: Math.round(lng / step.lng) * step.lng,
  };
}

function read(formData: FormData) {
  const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max) || null;
  const title = text("title", 120);
  const category = String(formData.get("category") ?? "") as EventCategory;
  const startsAt = londonInputToIso(String(formData.get("starts_at") ?? ""));
  const endsAt = londonInputToIso(String(formData.get("ends_at") ?? ""));
  const area = text("area", 120);
  const address = text("address", 200);
  const lat = Number(formData.get("lat") || NaN);
  const lng = Number(formData.get("lng") || NaN);
  const limitRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = limitRaw ? Number(limitRaw) : null;
  const visibility = formData.get("visibility") === "friends" ? "friends" : "public";
  const joinMode = formData.get("join_mode") === "approval" ? "approval" : "open";

  if (!title) return { error: "Give your event a name." };
  if (!CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category." };
  if (!startsAt || !endsAt) return { error: "Add a start and end time." };
  if (new Date(endsAt) <= new Date(startsAt)) return { error: "The end time must be after the start time." };
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { error: "Search for the place or tap the map to show where it is." };
  if (!area) return { error: "Say roughly where it is, e.g. Near Holborn." };
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)) {
    return { error: "The guest limit must be a whole number from 1 to 500." };
  }

  const rough = blur(lat, lng);
  return {
    event: {
      title,
      category,
      description: text("description", 5000),
      free_food: formData.get("free_food") === "on",
      starts_at: startsAt,
      ends_at: endsAt,
      lat: rough.lat,
      lng: rough.lng,
      location_note: area,
      visibility,
      join_mode: joinMode,
      capacity,
      // A guest limit uses the sign-up list, so extra people go on a waiting list.
      format: capacity ? "entries" : "standard",
      members_only: false,
    },
    exact: { address, lat, lng },
  };
}

export async function createHostedEvent(_prev: HostState, formData: FormData): Promise<HostState> {
  const me = await requireProfile();
  const parsed = read(formData);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...parsed.event, host_user_id: me.id, society_id: null })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't create your event. Please try again." };
  await supabase.from("event_private_details").insert({ event_id: data.id, ...parsed.exact });
  revalidatePath("/map");
  revalidatePath("/dashboard");
  redirect(`/e/${data.id}?hosted=1`);
}

export async function updateHostedEvent(id: string, _prev: HostState, formData: FormData): Promise<HostState> {
  const me = await requireProfile();
  const parsed = read(formData);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").update(parsed.event).eq("id", id).eq("host_user_id", me.id).select("id");
  if (error || !data?.length) return { error: "Couldn't save your changes. Please try again." };
  await supabase.from("event_private_details").upsert({ event_id: id, ...parsed.exact });
  revalidatePath(`/e/${id}`);
  revalidatePath("/map");
  redirect(`/e/${id}`);
}

export async function cancelHostedEvent(id: string) {
  const me = await requireProfile();
  const supabase = await createClient();
  await supabase.from("events").update({ is_cancelled: true }).eq("id", id).eq("host_user_id", me.id);
  revalidatePath(`/e/${id}`);
  revalidatePath("/map");
  revalidatePath("/dashboard");
}

export async function respondToJoinRequest(eventId: string, guest: string, accept: boolean) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("respond_join_request", { eid: eventId, guest, accept });
  revalidatePath(`/e/${eventId}`);
}

export async function removeGuest(eventId: string, guest: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("remove_guest", { eid: eventId, guest });
  revalidatePath(`/e/${eventId}`);
}

export async function openEventChat(eventId: string) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_event_chat", { eid: eventId });
  if (error || !data) redirect(`/e/${eventId}`);
  redirect(`/chats/${data}`);
}
