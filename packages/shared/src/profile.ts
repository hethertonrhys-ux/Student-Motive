import type { SupabaseClient } from "@supabase/supabase-js";
import { isCountryCode } from "./countries";
import { withoutDrafts } from "./drafts";
import { getPhotos, getProfileSocieties, PHOTO_BUCKET, type ProfilePhoto, type ProfileSociety } from "./profile-photos";
import { MAX_PROMPTS, promptById, TWO_TRUTHS_ID } from "./prompts";
import { getCards, getFriendships, getHiddenPeople, relationFor, type PersonCard, type Relation } from "./social";
import { nowMs } from "./time";
import { TWO_TRUTHS_ANSWER, TWO_TRUTHS_MAX, type TwoTruthsOwn, type TwoTruthsView } from "./two-truths";

// Profiles: someone's page, your own editor, photos, prompts, friends.
// Read and written straight from the database (the website's server does
// the same; the database checks who may see and change what).

type Result = { error?: string };
const friendly = (m?: string) => m?.replace(/^.*?ERROR:\s*/, "") || "Something went wrong. Please try again.";
// A random id for a file name (the phone may not have crypto.randomUUID).
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PromptAnswer = { prompt_id: string; answer: string };
export type HostedEvent = { id: string; title: string; starts_at: string; ends_at: string; visibility: "public" | "friends"; location_note: string | null };

export type PublicProfile = {
  person: PersonCard;
  relation: Relation;
  isBlocked: boolean;
  friendCount: number;
  incomingCount: number;
  events: HostedEvent[];
  photos: ProfilePhoto[];
  societies: ProfileSociety[];
  prompts: PromptAnswer[];
  twoTruths: TwoTruthsView | null;
  mutual: number;
};

export async function loadPublicProfile(supabase: SupabaseClient, myId: string, id: string): Promise<PublicProfile | null> {
  if (!UUID.test(id)) return null;
  const [cards, relations, hidden] = await Promise.all([getCards(supabase, [id]), getFriendships(supabase, myId), getHiddenPeople(supabase)]);
  const person = cards.get(id);
  if (!person) return null;
  const isBlocked = hidden.has(id);
  const relation = relationFor(relations, myId, id);
  const friendCount = [...relations.values()].filter((r) => r === "friends").length;
  const incomingCount = [...relations.values()].filter((r) => r === "incoming").length;
  if (isBlocked) return { person, relation, isBlocked, friendCount, incomingCount, events: [], photos: [], societies: [], prompts: [], twoTruths: null, mutual: 0 };

  const [{ data: events }, photos, societies, { data: prompts }, { data: twoTruths }, { data: mutual }] = await Promise.all([
    // Their upcoming events you're allowed to see (public, or friends-only if you're friends).
    withoutDrafts(() => supabase.from("events").select("id, title, starts_at, ends_at, visibility, location_note").eq("host_user_id", id).eq("is_cancelled", false).gt("ends_at", new Date(nowMs()).toISOString()).order("starts_at").limit(10)),
    getPhotos(supabase, id),
    getProfileSocieties(supabase, id),
    supabase.from("profile_prompts").select("prompt_id, answer").eq("user_id", id).order("position"),
    // Two truths and a lie, as this viewer may see it (no lie until they've guessed).
    supabase.rpc("two_truths_view", { person: id }),
    relation === "self" ? Promise.resolve({ data: 0 }) : supabase.rpc("mutual_friend_count", { other: id }),
  ]);
  return {
    person,
    relation,
    isBlocked,
    friendCount,
    incomingCount,
    events: (events ?? []) as HostedEvent[],
    photos: photos.filter((p) => p.current),
    societies,
    prompts: ((prompts ?? []) as PromptAnswer[]).filter((p) => promptById(p.prompt_id)),
    twoTruths: (twoTruths as TwoTruthsView | null) ?? null,
    mutual: Number(mutual ?? 0),
  };
}

// Guess which statement is someone's lie (once). Returns the reveal.
export async function guessTwoTruths(supabase: SupabaseClient, person: string, choice: number): Promise<TwoTruthsView | null> {
  const { data } = await supabase.rpc("guess_two_truths", { person, choice });
  return (data as TwoTruthsView | null) ?? null;
}

// ---- Friends, blocking, reporting ----

export async function sendFriendRequest(supabase: SupabaseClient, id: string): Promise<{ error?: string; result?: string }> {
  const { data, error } = await supabase.rpc("send_friend_request", { target: id });
  return error ? { error: friendly(error.message) } : { result: data as string };
}
export const respondToFriendRequest = async (supabase: SupabaseClient, id: string, accept: boolean): Promise<Result> => {
  const { error } = await supabase.rpc("respond_friend_request", { from_user: id, accept });
  return error ? { error: friendly(error.message) } : {};
};
export const removeFriend = async (supabase: SupabaseClient, id: string): Promise<Result> => {
  const { error } = await supabase.rpc("remove_friend", { other: id });
  return error ? { error: friendly(error.message) } : {};
};
export const blockUser = async (supabase: SupabaseClient, id: string): Promise<Result> => {
  const { error } = await supabase.rpc("block_user", { target: id });
  return error ? { error: friendly(error.message) } : {};
};
export const unblockUser = async (supabase: SupabaseClient, myId: string, id: string): Promise<Result> => {
  const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", myId).eq("blocked_id", id);
  return error ? { error: friendly(error.message) } : {};
};
export const REPORT_REASONS = ["Harassment or bullying", "Spam or fake account", "Inappropriate content", "Safety concern", "Something else"];
export async function reportUser(supabase: SupabaseClient, id: string, reason: string, details: string): Promise<Result> {
  if (!REPORT_REASONS.includes(reason)) return { error: "Choose a reason." };
  const { error } = await supabase.from("reports").insert({ reported_user_id: id, reason, details: details.trim().slice(0, 2000) || null });
  return error ? { error: "Couldn't send the report. Please try again." } : {};
}
// A private chat with a friend. Returns the chat's id.
export async function openFriendChat(supabase: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("open_dm", { other: id });
  return error || !data ? null : (data as string);
}

// ---- Your own profile ----

export type MyProfile = {
  display_name: string;
  full_name: string;
  nickname: string;
  graduation_year: number | null;
  university: string;
  course: string;
  country: string | null;
  avatar_url: string | null;
  photos: ProfilePhoto[];
  showSocieties: boolean;
  prompts: PromptAnswer[];
  twoTruths: TwoTruthsOwn | null;
};

export async function loadMyProfile(supabase: SupabaseClient, myId: string): Promise<MyProfile> {
  const [{ data }, photos, { data: settings }, { data: prompts }, { data: twoTruths }] = await Promise.all([
    supabase.from("profiles").select("display_name, full_name, nickname, graduation_year, university, course, country, avatar_url").eq("id", myId).single(),
    getPhotos(supabase, myId),
    supabase.from("profile_settings").select("show_societies").eq("user_id", myId).maybeSingle(),
    supabase.from("profile_prompts").select("prompt_id, answer").eq("user_id", myId).order("position"),
    // Your own Two truths and a lie (only you can read the lie).
    supabase.from("two_truths").select("s1, s2, s3, lie").eq("user_id", myId).maybeSingle(),
  ]);
  const row = (data ?? {}) as { display_name?: string | null; full_name?: string | null; nickname?: string | null; graduation_year?: number | null; university?: string | null; course?: string | null; country?: string | null; avatar_url?: string | null };
  return {
    display_name: row.display_name ?? "",
    full_name: row.full_name ?? "",
    nickname: row.nickname ?? "",
    graduation_year: row.graduation_year ?? null,
    university: row.university ?? "",
    course: row.course ?? "",
    country: row.country ?? null,
    avatar_url: row.avatar_url ?? null,
    photos,
    showSocieties: (settings as { show_societies: boolean } | null)?.show_societies ?? true,
    prompts: ((prompts ?? []) as PromptAnswer[]).filter((p) => promptById(p.prompt_id)),
    twoTruths: (twoTruths as TwoTruthsOwn | null) ?? null,
  };
}

// The year someone can say they graduate: this year to seven years ahead.
export function graduationYears(now = new Date()): number[] {
  const first = now.getFullYear();
  return Array.from({ length: 8 }, (_, i) => first + i);
}

export type AccountDetailsInput = { fullName: string; nickname: string; graduationYear: number | null; course?: string; university?: string | null; country?: string | null };

// Full name, nickname, graduation year (and course on the profile editor).
// What other students see (display_name) is the nickname if set, otherwise
// the full name. The university can only be chosen by people whose email
// isn't a uni address (the database sets it from the email otherwise).
export async function saveAccountDetails(supabase: SupabaseClient, myId: string, input: AccountDetailsInput): Promise<Result> {
  const clean = (v: string, max: number) => v.trim().replace(/[ \t]+/g, " ").slice(0, max);
  const fullName = clean(input.fullName, 80);
  const nickname = clean(input.nickname, 40);
  if (fullName.length < 2) return { error: "Enter your full name." };
  if (fullName.split(" ").length < 2) return { error: "Enter your first and last name." };
  if (!input.graduationYear) return { error: "Choose the year you graduate." };
  if (!graduationYears().includes(input.graduationYear)) return { error: "That graduation year doesn't look right." };
  const update: Record<string, unknown> = { full_name: fullName, nickname: nickname || null, graduation_year: input.graduationYear, display_name: nickname || fullName };
  if (input.course !== undefined) update.course = clean(input.course, 60) || null;
  if (input.country !== undefined) update.country = isCountryCode(input.country) ? input.country : null;
  if (input.university) update.university = input.university;
  const { error } = await supabase.from("profiles").update(update).eq("id", myId);
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// Poker stats for the little card at the table: counts only, no money.
export type PokerStats = { games_played: number; best_finish: number | null };
export async function loadPokerStats(supabase: SupabaseClient, id: string): Promise<PokerStats> {
  const { data } = await supabase.rpc("poker_stats", { person: id });
  const row = (data ?? {}) as Partial<PokerStats>;
  return { games_played: Number(row.games_played ?? 0), best_finish: row.best_finish ?? null };
}

// Kept for the website: name and course only.
export async function saveProfile(supabase: SupabaseClient, myId: string, input: { name: string; course: string }): Promise<Result> {
  const clean = (v: string, max: number) => v.trim().replace(/[ \t]+/g, " ").slice(0, max);
  const name = clean(input.name, 60);
  const course = clean(input.course, 60) || null;
  if (name.length < 2) return { error: "Enter your name." };
  const { error } = await supabase.from("profiles").update({ display_name: name, course }).eq("id", myId);
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// Save your prompt answers (up to 3), replacing the ones you had.
export async function saveProfilePrompts(supabase: SupabaseClient, answers: PromptAnswer[]): Promise<Result> {
  const clean = answers
    .filter((a) => promptById(a.prompt_id))
    .map((a) => ({ prompt_id: a.prompt_id, answer: String(a.answer).trim().replace(/\s+/g, " ").slice(0, 150) }))
    .filter((a) => a.answer);
  if (clean.length > MAX_PROMPTS) return { error: `You can answer up to ${MAX_PROMPTS} prompts.` };
  const { error } = await supabase.rpc("save_profile_prompts", { answers: clean });
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// Save your three statements and which is the lie (changing them clears
// everyone's guesses), and make sure the prompt is on your profile.
export async function saveTwoTruths(supabase: SupabaseClient, myId: string, s: [string, string, string], lie: number, placeFirst = false): Promise<Result> {
  const texts = s.map((t) => String(t).trim().replace(/\s+/g, " ").slice(0, TWO_TRUTHS_MAX));
  if (texts.some((t) => !t)) return { error: "Fill in all three." };
  if (![1, 2, 3].includes(lie)) return { error: "Choose which one is the lie." };
  const { error } = await supabase.rpc("save_two_truths", { one_text: texts[0], two_text: texts[1], three_text: texts[2], lie_is: lie });
  if (error) return { error: "Couldn't save. Please try again." };
  const { data } = await supabase.from("profile_prompts").select("prompt_id, answer").eq("user_id", myId).order("position");
  const current = (data ?? []) as PromptAnswer[];
  if (!current.some((a) => a.prompt_id === TWO_TRUTHS_ID)) {
    if (current.length >= MAX_PROMPTS) return { error: `You can answer up to ${MAX_PROMPTS} prompts. Remove one first.` };
    const mine = { prompt_id: TWO_TRUTHS_ID, answer: TWO_TRUTHS_ANSWER };
    await supabase.rpc("save_profile_prompts", { answers: placeFirst ? [mine, ...current] : [...current, mine] });
  }
  return {};
}

export async function setShowSocieties(supabase: SupabaseClient, myId: string, show: boolean): Promise<Result> {
  const { error } = await supabase.from("profile_settings").upsert({ user_id: myId, show_societies: show });
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// ---- Photos ----

// A photo ready to upload: JPEG bytes (already cropped and shrunk on the device).
export type PhotoBytes = { bytes: ArrayBuffer; type: string };

// Upload a photo and add it to your 5.
export async function uploadMyFivePhoto(supabase: SupabaseClient, myId: string, photo: PhotoBytes): Promise<Result> {
  if (photo.bytes.byteLength === 0) return { error: "Choose a photo." };
  if (photo.bytes.byteLength > 3 * 1024 * 1024) return { error: "That photo is too big. Try a smaller one." };
  // Check for a free space before uploading, so we don't store files we can't use.
  const { data: count } = await supabase.rpc("current_photo_count", { person: myId });
  if (Number(count) >= 5) return { error: "All 5 spaces are full. Remove or archive a photo first." };
  const path = `${myId}/${uuid()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, photo.bytes, { contentType: photo.type });
  if (uploadError) return { error: `The photo couldn't be uploaded (${uploadError.message}). Please try again.` };
  const { error } = await supabase.rpc("add_profile_photo", { photo_path: path });
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    return { error: friendly(error.message) };
  }
  return {};
}

// Re-crop a photo that's already in your 5: the cropped version replaces the file (same place in the order).
export async function recropMyFivePhoto(supabase: SupabaseClient, myId: string, id: string, photo: PhotoBytes, backup: PhotoBytes | null): Promise<Result> {
  const { data: row } = await supabase.from("profile_photos").select("path").eq("id", id).eq("user_id", myId).maybeSingle<{ path: string }>();
  if (!row) return { error: "Photo not found." };
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  await bucket.remove([row.path]);
  const { error } = await bucket.upload(row.path, photo.bytes, { contentType: photo.type });
  if (error) {
    if (backup) await bucket.upload(row.path, backup.bytes, { contentType: backup.type });
    return { error: "That crop couldn't be saved. Please try again." };
  }
  return {};
}

const rpcResult = async (supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Result> => {
  const { error } = await supabase.rpc(fn, args);
  return error ? { error: friendly(error.message) } : {};
};
export const pinPhoto = (supabase: SupabaseClient, id: string, pin: boolean) => rpcResult(supabase, "pin_profile_photo", { pid: id, pin });
export const reorderPhotos = (supabase: SupabaseClient, ids: string[]) => rpcResult(supabase, "reorder_profile_photos", { ids: ids.slice(0, 5) });
export const archivePhoto = (supabase: SupabaseClient, id: string) => rpcResult(supabase, "archive_profile_photo", { pid: id });
export const restorePhoto = (supabase: SupabaseClient, id: string) => rpcResult(supabase, "restore_profile_photo", { pid: id });

// Delete for good: the database row and the file.
export async function deletePhoto(supabase: SupabaseClient, myId: string, id: string): Promise<Result> {
  const { data } = await supabase.from("profile_photos").delete().eq("id", id).eq("user_id", myId).select("path");
  if (data?.[0]) await supabase.storage.from(PHOTO_BUCKET).remove([(data[0] as { path: string }).path]);
  return {};
}

export async function reportPhoto(supabase: SupabaseClient, id: string, reason: string): Promise<Result> {
  const clean = reason.trim().slice(0, 200);
  if (!clean) return { error: "Say why you're reporting it." };
  const { error } = await supabase.from("profile_photo_reports").insert({ photo_id: id, reason: clean });
  return error ? { error: "Couldn't send the report. Please try again." } : {};
}

// ---- The profile picture ----

const AVATARS = "avatars";
const ORIGINAL = "original-";

async function findOriginal(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.storage.from(AVATARS).list(userId, { limit: 100 });
  const name = (data ?? []).find((f) => f.name.startsWith(ORIGINAL))?.name;
  return name ? `${userId}/${name}` : null;
}

// Delete earlier pictures so only the current one (and its original) is kept.
async function removeOldPhotos(supabase: SupabaseClient, userId: string, keep: (string | null)[]) {
  const { data } = await supabase.storage.from(AVATARS).list(userId, { limit: 100 });
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => !keep.includes(p));
  if (old.length) await supabase.storage.from(AVATARS).remove(old);
}

// The profile picture: the cropped circle everyone sees, plus (for new
// photos) the whole photo it was cropped from, so it can be re-cropped
// later without uploading again.
export async function uploadProfilePhoto(supabase: SupabaseClient, myId: string, circle: PhotoBytes, original: PhotoBytes | null): Promise<{ error?: string; url?: string }> {
  if (circle.bytes.byteLength === 0) return { error: "Choose a photo." };
  if (circle.bytes.byteLength > 2 * 1024 * 1024) return { error: "That photo is too big. Try a smaller one." };
  const path = `${myId}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from(AVATARS).upload(path, circle.bytes, { contentType: circle.type });
  if (error) return { error: `The photo couldn't be uploaded (${error.message}). Please try again.` };
  const newOriginal = original && original.bytes.byteLength > 0 && original.bytes.byteLength <= 3 * 1024 * 1024;
  let originalPath = newOriginal ? `${myId}/${ORIGINAL}${uuid()}.jpg` : await findOriginal(supabase, myId);
  if (newOriginal && originalPath) {
    const { error: originalError } = await supabase.storage.from(AVATARS).upload(originalPath, original.bytes, { contentType: original.type });
    if (originalError) originalPath = null; // the circle is saved; it just can't be re-cropped later
  }
  const url = supabase.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
  await supabase.from("profiles").update({ avatar_url: url }).eq("id", myId);
  await removeOldPhotos(supabase, myId, [path, originalPath]);
  return { url };
}

// The whole photo the profile picture was cropped from, if we have it.
export async function getProfilePhotoOriginal(supabase: SupabaseClient, myId: string): Promise<string | null> {
  const path = await findOriginal(supabase, myId);
  return path ? supabase.storage.from(AVATARS).getPublicUrl(path).data.publicUrl : null;
}

export async function removeProfilePhoto(supabase: SupabaseClient, myId: string): Promise<Result> {
  await supabase.from("profiles").update({ avatar_url: null }).eq("id", myId);
  await removeOldPhotos(supabase, myId, []);
  return {};
}

// Deletes your account for good: the login, the profile and everything
// linked to it. Messages you sent stay, shown as from a "Former member".
export async function deleteMyAccount(supabase: SupabaseClient): Promise<Result> {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: "We couldn't delete your account. Please try again or email us." };
  await supabase.auth.signOut();
  return {};
}
