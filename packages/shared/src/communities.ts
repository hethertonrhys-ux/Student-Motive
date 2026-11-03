import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoBytes } from "./profile";

// Communities: groups a client runs inside Function (the first is UCL
// Abacus). Every rule lives in the database (supabase/migrations/
// 20261202000000_communities.sql); these functions call it and mirror its
// rules so screens can explain them before asking. See
// docs/COMMUNITIES_PLAN.md.

type Result = { error?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Types ----

export type CommunityRole = "admin" | "committee" | "regular";
export type CommunityMembership = "member" | "non_member";
export type CommunityMemberStatus = "pending" | "active" | "declined" | "removed" | "left";
export type ColourScheme = "light" | "dark";
// Whose colour a name gets: the role first, then the membership.
export type RoleColourKey = "admin" | "committee" | "member" | "non_member";
export type RoleColours = Record<RoleColourKey, Record<ColourScheme, string>>;
export type CommunitySettings = { role_colours: RoleColours; membership_label: string; marketplace_enabled: boolean };
export type RoleTag = "Admin" | "Committee" | "Member";

// Checked for readability on the app's light and dark backgrounds.
export const DEFAULT_ROLE_COLOURS: RoleColours = {
  admin: { light: "#8A5A00", dark: "#F5C04A" },
  committee: { light: "#7A1010", dark: "#FF5A5A" },
  member: { light: "#C4362E", dark: "#FFB8B3" },
  non_member: { light: "#6B6B73", dark: "#9A9AA3" },
};
export const DEFAULT_COMMUNITY_SETTINGS: CommunitySettings = { role_colours: DEFAULT_ROLE_COLOURS, membership_label: "paying member", marketplace_enabled: false };

// The public card: what anyone (even logged out) sees on the join screen.
export type CommunityCard = { id: string; slug: string; name: string; bio: string; image_url: string | null; banner_url: string | null };

export type CommunityGroup = {
  id: string;
  name: string;
  description: string;
  kind: "main" | "sub";
  image_url: string | null;
  sort: number;
  thread_id: string;
  // You're in it (the main group: you're active in the community).
  joined: boolean;
  member_count: number;
};

export type MyCommunityPlace = { status: CommunityMemberStatus; role: CommunityRole; membership: CommunityMembership; nickname: string; membership_claimed: boolean };

export type CommunityHome = {
  community: CommunityCard & { society_id: string | null; membership_label: string; marketplace_enabled: boolean };
  // Your own place in it, or null if you've never asked to join.
  me: MyCommunityPlace | null;
  is_function_admin: boolean;
  role_colours: RoleColours;
  // The main group (if you're in), the sub-groups you're in, and every
  // sub-group for admins and committee (with `joined`).
  groups: CommunityGroup[];
  // How many requests are waiting: admins, committee and the Function team only.
  pending_requests: number | null;
};

export type MyCommunity = { id: string; slug: string; name: string; image_url: string | null; role: CommunityRole; membership: CommunityMembership; status: "pending" | "active"; nickname: string; main_thread_id: string | null };

// Someone active in a community. Never an email, never the paying-member claim.
export type RosterEntry = { user_id: string; nickname: string; role: CommunityRole; membership: CommunityMembership; avatar_url: string | null };
export type GroupMember = RosterEntry & { added_at: string | null };
export type ChatMemberRole = RosterEntry & { is_me: boolean };

// A request waiting for admins or committee. Never an email.
export type JoinRequest = {
  user_id: string;
  nickname: string;
  display_name: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
  membership_claimed: boolean;
  requested_at: string;
  referred_by_nickname: string | null;
};

export type AdminCommunity = { id: string; slug: string; name: string; society_id: string | null; society_name: string | null; active_members: number; pending_requests: number; admins: number; created_at: string };

export type MuteDuration = "1h" | "8h" | "1w" | "always" | "off";
export const MUTE_OPTIONS: { key: Exclude<MuteDuration, "off">; label: string }[] = [
  { key: "1h", label: "1 hour" },
  { key: "8h", label: "8 hours" },
  { key: "1w", label: "1 week" },
  { key: "always", label: "Until I turn it back on" },
];

// ---- Rules mirrored from the database ----

export const isCommunitySlug = (s: unknown): s is string => typeof s === "string" && s.length >= 3 && s.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

const HEX = /^#[0-9A-Fa-f]{6}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// The community's colours, with the default for anything missing or malformed.
export function normaliseRoleColours(value: unknown): RoleColours {
  const source = isObject(value) ? value : {};
  const out = {} as RoleColours;
  for (const key of Object.keys(DEFAULT_ROLE_COLOURS) as RoleColourKey[]) {
    const entry = isObject(source[key]) ? source[key] : {};
    out[key] = {
      light: typeof entry.light === "string" && HEX.test(entry.light) ? entry.light : DEFAULT_ROLE_COLOURS[key].light,
      dark: typeof entry.dark === "string" && HEX.test(entry.dark) ? entry.dark : DEFAULT_ROLE_COLOURS[key].dark,
    };
  }
  return out;
}

// Precedence: admin, then committee, then paying member, then everyone else.
export function roleColourKey(role: CommunityRole | null | undefined, membership: CommunityMembership | null | undefined): RoleColourKey {
  if (role === "admin") return "admin";
  if (role === "committee") return "committee";
  if (membership === "member") return "member";
  return "non_member";
}

// The colour for a name. `colours` is the community's role_colours (or
// anything: missing and malformed colours fall back to the defaults).
export function roleColour(colours: unknown, role: CommunityRole | null | undefined, membership: CommunityMembership | null | undefined, scheme: ColourScheme): string {
  return normaliseRoleColours(colours)[roleColourKey(role, membership)][scheme === "dark" ? "dark" : "light"];
}

// The small tag next to a name, so colour is never the only cue. It comes
// from the role itself, never the nickname. Non-members have none.
export function roleTag(role: CommunityRole | null | undefined, membership: CommunityMembership | null | undefined): RoleTag | null {
  if (role === "admin") return "Admin";
  if (role === "committee") return "Committee";
  if (membership === "member") return "Member";
  return null;
}

export const NICKNAME_MAX = 30;
const RESERVED_NICKNAMES = ["admin", "committee", "member", "moderator", "function"];
const RESERVED_WORDS = ["admin", "admins", "committee", "committees", "member", "members", "moderator", "moderators", "mod", "mods", "function"];
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
// Soft hyphen, joiners and other zero-width characters, direction marks and
// isolates, variation selectors, and the Hangul and Braille blanks (the same
// list as community_nickname_problem in the database).
const HIDDEN = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u2028-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/;
// Emoji style selectors: a phone adds them after some emoji. They're dropped
// (the emoji stays).
const STYLE_SELECTORS = /[\uFE0E\uFE0F]/g;
// Cyrillic and Greek letters that look like Latin ones, as those. Capitals
// first (before lower-casing), then small letters. The same as
// community_nickname_key in the database.
const LOOK_ALIKE_CAPITALS: [string, string] = ["\u0410\u0412\u0421\u0415\u041D\u0406\u0408\u041A\u041C\u041E\u0420\u0405\u0422\u0425\u0423\u0500\u04BA\u04C0\u0391\u0392\u0395\u0397\u0399\u039A\u039C\u039D\u039F\u03A1\u03A4\u03A5\u03A7\u0396", "ABCEHIJKMOPSTXYDHIABEHIKMNOPTYXZ"];
const LOOK_ALIKE_SMALL: [string, string] = ["\u0430\u0432\u0441\u0435\u043D\u0456\u0458\u043A\u043C\u043E\u0440\u0442\u0445\u0443\u0455\u0501\u04BB\u04CF\u03BF\u03B1\u03B9\u03BD\u03BA\u03C4\u03BC\u03B5\u03C1\u03C7\u03C5\u03B7", "abcehijkmoptxysdhloaivktmepxun"];
const translate = (text: string, [from, to]: [string, string]) => [...text].map((c) => { const i = from.indexOf(c); return i >= 0 ? to[i] : c; }).join("");

// How a nickname compares with others (for the reserved words; the database
// also uses it for "taken"): NFKC, look-alikes as Latin letters, lower case.
export function nicknameKey(nickname: string): string {
  return translate(translate(nickname.normalize("NFKC"), LOOK_ALIKE_CAPITALS).toLowerCase(), LOOK_ALIKE_SMALL);
}

// Nicknames: tidied (NFKC, so fullwidth and other styled letters become
// plain ones; emoji style selectors dropped; spaces trimmed), 1 to 30
// characters, no hidden or control characters, and not "Admin",
// "Committee", "Member", "Moderator" or "Function" (ignoring case, spaces
// and anything that isn't a letter, and reading Cyrillic and Greek
// look-alikes as Latin letters). Any reserved word inside the nickname
// ("Function Team", "Admins", "Committee Member", "Mod") is refused too.
// Being unique in the community is checked by the database.
export function validateNickname(raw: string | null | undefined): { ok: true; nickname: string } | { ok: false; error: string } {
  const nickname = (raw ?? "").normalize("NFKC").replace(STYLE_SELECTORS, "").replace(/^\s+|\s+$/g, "");
  if (!nickname) return { ok: false, error: "Choose a nickname." };
  if ([...nickname].length > NICKNAME_MAX) return { ok: false, error: `Nicknames can be up to ${NICKNAME_MAX} characters.` };
  if (CONTROL.test(nickname) || HIDDEN.test(nickname)) return { ok: false, error: "Nicknames can't contain hidden or control characters." };
  const key = nicknameKey(nickname);
  if (RESERVED_NICKNAMES.includes(key.replace(/[^a-z]/g, "")) || (key.match(/[a-z]+/g) ?? []).some((w) => RESERVED_WORDS.includes(w))) return { ok: false, error: "That nickname is reserved. Choose another." };
  return { ok: true, nickname };
}

// The community's one public join link (the QR code is the same link).
// `ref` records who shared it. Pass the app's SITE_URL as siteUrl.
export function joinUrl(slug: string, ref?: string | null, siteUrl = "https://studentfunction.com"): string {
  const base = `${siteUrl.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}/join`;
  return ref && UUID.test(ref) ? `${base}?ref=${ref.toLowerCase()}` : base;
}

// When a mute ends: a time, "always" (until switched off), or null (not muted).
// The same lengths as set_thread_mute.
export function muteUntil(duration: MuteDuration, now: Date = new Date()): Date | "always" | null {
  const hour = 60 * 60 * 1000;
  switch (duration) {
    case "1h":
      return new Date(now.getTime() + hour);
    case "8h":
      return new Date(now.getTime() + 8 * hour);
    case "1w":
      return new Date(now.getTime() + 7 * 24 * hour);
    case "always":
      return "always";
    default:
      return null;
  }
}

// Is a chat muted right now (from the chat list's muted / muted_until)?
export function isMutedNow(chat: { muted?: boolean | null; muted_until?: string | null }, now: Date = new Date()): boolean {
  if (!chat.muted) return false;
  return !chat.muted_until || new Date(chat.muted_until).getTime() > now.getTime();
}

// The database's own messages are written for people; anything technical
// becomes the fallback.
function friendly(error: { message?: string } | null, fallback: string): string {
  const message = (error?.message ?? "").trim();
  if (!message || /permission denied|violates|duplicate key|syntax error|does not exist|invalid input|JWT|schema cache|could not|PGRST|fetch/i.test(message)) return fallback;
  return /[.!?]$/.test(message) ? message : `${message}.`;
}
const done = (error: { message?: string } | null, fallback = "That didn't work. Try again."): Result => (error ? { error: friendly(error, fallback) } : {});

// ---- Reading ----

export async function getCommunityPublic(supabase: SupabaseClient, slug: string): Promise<CommunityCard | null> {
  if (!isCommunitySlug(slug)) return null;
  const { data, error } = await supabase.rpc("community_public", { community_slug: slug });
  if (error) throw error;
  return ((data ?? []) as CommunityCard[])[0] ?? null;
}

// Null when there's no such community.
export async function getCommunityHome(supabase: SupabaseClient, slug: string): Promise<CommunityHome | null> {
  if (!isCommunitySlug(slug)) return null;
  const { data, error } = await supabase.rpc("community_home", { community_slug: slug });
  if (error) throw error;
  if (!data) return null;
  const home = data as CommunityHome;
  return {
    ...home,
    role_colours: normaliseRoleColours(home.role_colours),
    groups: (home.groups ?? []).map((g) => ({ ...g, member_count: Number(g.member_count ?? 0) })),
    pending_requests: home.pending_requests === null || home.pending_requests === undefined ? null : Number(home.pending_requests),
  };
}

export async function myCommunities(supabase: SupabaseClient): Promise<MyCommunity[]> {
  const { data, error } = await supabase.rpc("my_communities");
  if (error) throw error;
  return (data ?? []) as MyCommunity[];
}

// Everyone active (for members and the Function team).
export async function communityRoster(supabase: SupabaseClient, communityId: string): Promise<RosterEntry[]> {
  if (!UUID.test(communityId)) return [];
  const { data, error } = await supabase.rpc("community_roster", { cid: communityId });
  if (error) throw error;
  return (data ?? []) as RosterEntry[];
}

// Requests waiting (admins, committee and the Function team).
export async function communityRequests(supabase: SupabaseClient, communityId: string): Promise<JoinRequest[]> {
  if (!UUID.test(communityId)) return [];
  const { data, error } = await supabase.rpc("community_requests", { cid: communityId });
  if (error) throw error;
  return (data ?? []) as JoinRequest[];
}

// Who's in a group (its members, admins and committee, and the Function team).
export async function groupMembers(supabase: SupabaseClient, groupId: string): Promise<GroupMember[]> {
  if (!UUID.test(groupId)) return [];
  const { data, error } = await supabase.rpc("group_members", { gid: groupId });
  if (error) throw error;
  return (data ?? []) as GroupMember[];
}

// A community chat's people with their role and membership (for role colours and tags).
export async function threadMemberRoles(supabase: SupabaseClient, threadId: string): Promise<ChatMemberRole[]> {
  if (!UUID.test(threadId)) return [];
  const { data, error } = await supabase.rpc("thread_member_roles", { tid: threadId });
  if (error) throw error;
  return (data ?? []) as ChatMemberRole[];
}

// ---- Joining ----

// Ask to join (or update a waiting request). "active": you're already in.
export async function requestToJoinCommunity(
  supabase: SupabaseClient,
  slug: string,
  input: { nickname: string; claimsMembership: boolean; ref?: string | null },
): Promise<{ status?: "pending" | "active"; error?: string }> {
  const checked = validateNickname(input.nickname);
  if (!checked.ok) return { error: checked.error };
  if (!isCommunitySlug(slug)) return { error: "Community not found." };
  const { data, error } = await supabase.rpc("request_to_join", {
    community_slug: slug,
    wanted_nickname: checked.nickname,
    claims_membership: input.claimsMembership,
    ref: input.ref && UUID.test(input.ref) ? input.ref : null,
  });
  if (error) return { error: friendly(error, "Couldn't send your request. Try again.") };
  return { status: data === "active" ? "active" : "pending" };
}

export async function updateMyNickname(supabase: SupabaseClient, communityId: string, nickname: string): Promise<Result> {
  const checked = validateNickname(nickname);
  if (!checked.ok) return { error: checked.error };
  const { error } = await supabase.rpc("update_my_community_nickname", { cid: communityId, wanted_nickname: checked.nickname });
  return done(error, "Couldn't change your nickname. Try again.");
}

// Leave (or withdraw a request). The last admin can't leave.
export async function leaveCommunity(supabase: SupabaseClient, communityId: string): Promise<Result> {
  const { error } = await supabase.rpc("leave_community", { cid: communityId });
  return done(error, "Couldn't leave. Try again.");
}

// ---- Approvals, membership, roles and removal ----

// Admins approve as a paying member or not; committee always as a non-member.
export async function approveRequest(supabase: SupabaseClient, communityId: string, userId: string, asMember: boolean): Promise<Result> {
  const { error } = await supabase.rpc("approve_request", { cid: communityId, target: userId, as_member: asMember });
  return done(error, "Couldn't approve. Try again.");
}

export async function declineRequest(supabase: SupabaseClient, communityId: string, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("decline_request", { cid: communityId, target: userId });
  return done(error, "Couldn't decline. Try again.");
}

// Admins only, never their own.
export async function confirmMembership(supabase: SupabaseClient, communityId: string, userId: string, isMember: boolean): Promise<Result> {
  const { error } = await supabase.rpc("confirm_membership", { cid: communityId, target: userId, is_member: isMember });
  return done(error, "Couldn't change their membership. Try again.");
}

// Admins only, never their own; the last admin can't be demoted.
export async function setCommunityRole(supabase: SupabaseClient, communityId: string, userId: string, role: CommunityRole): Promise<Result> {
  const { error } = await supabase.rpc("set_community_role", { cid: communityId, target: userId, new_role: role });
  return done(error, "Couldn't change their role. Try again.");
}

// Admins remove anyone but the last admin; committee remove regular people.
export async function removeCommunityMember(supabase: SupabaseClient, communityId: string, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("remove_community_member", { cid: communityId, target: userId });
  return done(error, "Couldn't remove them. Try again.");
}

// ---- The community's page and settings ----

// Bio, picture and banner (admins and committee). Give all three: an empty
// or null image means none.
export async function updateCommunityProfile(supabase: SupabaseClient, communityId: string, input: { bio: string; imageUrl: string | null; bannerUrl: string | null }): Promise<Result> {
  if (input.bio.trim().length > 1000) return { error: "The bio can be up to 1,000 characters." };
  const { error } = await supabase.rpc("update_community_profile", { cid: communityId, new_bio: input.bio, new_image_url: input.imageUrl, new_banner_url: input.bannerUrl });
  return done(error, "Couldn't save. Try again.");
}

// Name and settings (admins). Settings given are merged into the current ones.
export async function updateCommunitySettings(supabase: SupabaseClient, communityId: string, input: { name?: string; settings?: Partial<CommunitySettings> }): Promise<Result> {
  const { error } = await supabase.rpc("update_community_settings", { cid: communityId, new_name: input.name ?? null, new_settings: input.settings ?? null });
  return done(error, "Couldn't save. Try again.");
}

const imageId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

// Uploads a picture or banner to images/communities/<communityId>/... (admins
// and committee) and returns its public address.
export async function uploadCommunityImage(supabase: SupabaseClient, communityId: string, image: PhotoBytes | null): Promise<{ url: string | null; error?: string }> {
  if (!image || image.bytes.byteLength === 0) return { url: null };
  if (!UUID.test(communityId)) return { url: null, error: "Community not found." };
  if (image.bytes.byteLength > 5 * 1024 * 1024) return { url: null, error: "Images must be under 5MB." };
  const path = `communities/${communityId}/${imageId()}.jpg`;
  const { error } = await supabase.storage.from("images").upload(path, image.bytes, { contentType: image.type });
  if (error) return { url: null, error: "The image couldn't be uploaded. Please try again." };
  return { url: supabase.storage.from("images").getPublicUrl(path).data.publicUrl };
}

// ---- Sub-groups (admins and committee) ----

export async function createGroup(supabase: SupabaseClient, communityId: string, name: string, description = ""): Promise<{ id?: string; error?: string }> {
  const clean = name.trim();
  if (!clean || clean.length > 80) return { error: "Group names must be 1 to 80 characters." };
  const { data, error } = await supabase.rpc("create_community_group", { cid: communityId, group_name: clean, group_description: description.trim() });
  return error ? { error: friendly(error, "Couldn't create the group. Try again.") } : { id: data as string };
}

export async function renameGroup(supabase: SupabaseClient, groupId: string, name: string, description?: string): Promise<Result> {
  const clean = name.trim();
  if (!clean || clean.length > 80) return { error: "Group names must be 1 to 80 characters." };
  const { error } = await supabase.rpc("rename_community_group", { gid: groupId, group_name: clean, group_description: description ?? null });
  return done(error, "Couldn't rename the group. Try again.");
}

// Hides the group and its chat from everyone (nothing is deleted).
export async function archiveGroup(supabase: SupabaseClient, groupId: string): Promise<Result> {
  const { error } = await supabase.rpc("archive_community_group", { gid: groupId });
  return done(error, "Couldn't archive the group. Try again.");
}

// Admins and committee may add themselves (the group sees "<name> joined").
export async function addGroupMember(supabase: SupabaseClient, groupId: string, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("add_group_member", { gid: groupId, target: userId });
  return done(error, "Couldn't add them. Try again.");
}

export async function removeGroupMember(supabase: SupabaseClient, groupId: string, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("remove_group_member", { gid: groupId, target: userId });
  return done(error, "Couldn't remove them. Try again.");
}

// ---- Mutes (any chat) ----

export async function setThreadMute(supabase: SupabaseClient, threadId: string, duration: MuteDuration): Promise<Result> {
  if (!UUID.test(threadId)) return { error: "Chat not found." };
  const { error } = await supabase.rpc("set_thread_mute", { tid: threadId, duration });
  return done(error, "Couldn't change the mute. Try again.");
}

// ---- The Function team ----

export async function adminCreateCommunity(supabase: SupabaseClient, input: { name: string; slug: string; societyId?: string | null; bio?: string }): Promise<{ id?: string; error?: string }> {
  const slug = input.slug.trim().toLowerCase();
  if (!isCommunitySlug(slug)) return { error: "The web address must be 3 to 60 lowercase letters, numbers and single hyphens." };
  const { data, error } = await supabase.rpc("admin_create_community", { community_name: input.name, community_slug: slug, society: input.societyId ?? null, community_bio: input.bio ?? "" });
  return error ? { error: friendly(error, "Couldn't create the community. Try again.") } : { id: data as string };
}

// Makes someone an admin (adding them as an active member first if needed).
export async function adminSetCommunityAdmin(supabase: SupabaseClient, communityId: string, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("admin_set_community_admin", { cid: communityId, target: userId });
  return done(error, "Couldn't make them an admin. Try again.");
}

export async function adminListCommunities(supabase: SupabaseClient): Promise<AdminCommunity[]> {
  const { data, error } = await supabase.rpc("admin_list_communities");
  if (error) throw error;
  return ((data ?? []) as AdminCommunity[]).map((c) => ({ ...c, active_members: Number(c.active_members), pending_requests: Number(c.pending_requests), admins: Number(c.admins) }));
}
