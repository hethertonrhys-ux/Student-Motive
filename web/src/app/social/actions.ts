"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { SOCIAL_CATEGORIES, type SocialCategory } from "@/lib/social-events";
import { createClient } from "@/lib/supabase/server";
import { londonInputToIso } from "@/lib/time";

export type FormState = { error?: string };
export type ActionResult = { error?: string };

// The database's messages are written for people, so show them as they are.
const friendly = (message?: string) => message?.replace(/^.*?ERROR:\s*/, "") || "Something went wrong. Please try again.";

// Everyone sees roughly where it is (about a 5-minute walk across);
// only the host and people going see the exact spot.
function blur(lat: number, lng: number) {
  return { lat: Math.round(lat / 0.004) * 0.004, lng: Math.round(lng / 0.006) * 0.006 };
}

function read(formData: FormData) {
  const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max) || null;
  const title = text("title", 120);
  const category = String(formData.get("category") ?? "") as SocialCategory;
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start_time") ?? "");
  const finish = String(formData.get("finish_time") ?? "");
  const area = text("area", 120);
  const address = text("address", 200);
  const lat = Number(formData.get("lat") || NaN);
  const lng = Number(formData.get("lng") || NaN);
  const spaces = Number(String(formData.get("spaces") ?? "").trim());

  if (!title) return { error: "Give your event a title." };
  if (!SOCIAL_CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category." };
  const startsAt = londonInputToIso(`${date}T${start}`);
  if (!date || !start || !startsAt) return { error: "Choose the date and start time." };
  // No finish time: assume three hours. A finish time earlier than the start means after midnight.
  let endsAt = new Date(new Date(startsAt).getTime() + 3 * 3600e3).toISOString();
  if (finish) {
    const sameDay = londonInputToIso(`${date}T${finish}`);
    if (!sameDay) return { error: "Check the finish time." };
    endsAt = new Date(sameDay) > new Date(startsAt) ? sameDay : new Date(new Date(sameDay).getTime() + 24 * 3600e3).toISOString();
  }
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { error: "Search for the place or tap the map to show where it is." };
  if (!area) return { error: "Add the place name everyone sees, e.g. Powerleague Shoreditch." };
  if (!Number.isInteger(spaces) || spaces < 2 || spaces > 500) return { error: "Spaces must be a whole number from 2 to 500 (including you)." };

  const rough = blur(lat, lng);
  return {
    event: {
      title,
      category,
      description: text("description", 3000),
      starts_at: startsAt,
      ends_at: endsAt,
      area,
      lat: rough.lat,
      lng: rough.lng,
      spaces,
      is_private: formData.get("privacy") === "private",
      friends_only: formData.get("friends_only") === "on",
    },
    exact: { address, lat, lng },
  };
}

function refresh(id?: string) {
  revalidatePath("/social");
  // Joining or leaving adds you to or takes you out of the event's group chat.
  revalidatePath("/chats");
  if (id) revalidatePath(`/social/${id}`);
}

export async function createSocialEvent(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireProfile();
  const parsed = read(formData);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("social_events").insert({ ...parsed.event, host_id: me.id }).select("id").single();
  if (error || !data) return { error: "Couldn't create your event. Please try again." };
  await supabase.from("social_event_addresses").insert({ event_id: data.id, ...parsed.exact });
  refresh();
  redirect(`/social/${data.id}?created=1`);
}

export async function updateSocialEvent(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireProfile();
  const parsed = read(formData);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data: current } = await supabase.from("social_events").select("going_count").eq("id", id).eq("host_id", me.id).maybeSingle();
  if (!current) return { error: "Only the host can edit this event." };
  if (parsed.event.spaces < current.going_count + 1) {
    return { error: `${current.going_count} people are already going, so you need at least ${current.going_count + 1} spaces.` };
  }
  const { error } = await supabase.from("social_events").update(parsed.event).eq("id", id).eq("host_id", me.id);
  if (error) return { error: "Couldn't save your changes. Please try again." };
  await supabase.from("social_event_addresses").upsert({ event_id: id, ...parsed.exact });
  refresh(id);
  redirect(`/social/${id}`);
}

export async function cancelSocialEvent(id: string): Promise<ActionResult> {
  const me = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("social_events").update({ is_cancelled: true }).eq("id", id).eq("host_id", me.id);
  refresh(id);
  return error ? { error: "Couldn't cancel. Please try again." } : {};
}

export async function joinSocialEvent(id: string): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("social_join", { eid: id });
  refresh(id);
  return error ? { error: friendly(error.message) } : {};
}

export async function leaveSocialEvent(id: string): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("social_leave", { eid: id });
  refresh(id);
  return error ? { error: friendly(error.message) } : {};
}

export async function respondToRequest(id: string, guest: string, approve: boolean): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("social_respond", { eid: id, guest, approve });
  refresh(id);
  return error ? { error: friendly(error.message) } : {};
}

export async function removeGuest(id: string, guest: string): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("social_remove_guest", { eid: id, guest });
  refresh(id);
  return error ? { error: friendly(error.message) } : {};
}

export async function reportSocialEvent(id: string, reason: string): Promise<ActionResult> {
  await requireProfile();
  const clean = reason.trim().slice(0, 200);
  if (!clean) return { error: "Say why you're reporting it." };
  const supabase = await createClient();
  const { error } = await supabase.from("social_reports").insert({ event_id: id, reason: clean });
  return error ? { error: "Couldn't send the report. Please try again." } : {};
}

// Message the host privately (no need to be friends).
export async function messageHost(eventId: string) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_host_dm", { eid: eventId });
  if (error || !data) redirect(`/social/${eventId}`);
  redirect(`/chats/${data}`);
}
