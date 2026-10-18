import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// "My 5": up to 5 current photos per person. Unpinned photos last 30 days,
// then move to the owner's Archive.
export const MAX_PHOTOS = 5;
export const PHOTO_DAYS = 30;
export const PHOTO_BUCKET = "profile-photos";

export type ProfilePhoto = {
  id: string;
  path: string;
  url: string | null;
  pinned: boolean;
  activated_at: string;
  archived_at: string | null;
  current: boolean;
  daysLeft: number | null; // unpinned current photos only
};

type Row = { id: string; path: string; pinned: boolean; activated_at: string; archived_at: string | null };

export async function getPhotos(supabase: SupabaseClient, userId: string, now = Date.now()): Promise<ProfilePhoto[]> {
  const { data } = await supabase
    .from("profile_photos")
    .select("id, path, pinned, activated_at, archived_at")
    .eq("user_id", userId)
    .order("activated_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // The files are private: make short-lived links to show them.
  const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map((r) => {
    const expires = new Date(r.activated_at).getTime() + PHOTO_DAYS * 86400e3;
    const current = !r.archived_at && (r.pinned || expires > now);
    return {
      ...r,
      url: urls.get(r.path) ?? null,
      current,
      daysLeft: current && !r.pinned ? Math.max(1, Math.ceil((expires - now) / 86400e3)) : null,
    };
  });
}

export type ProfileSociety = { id: string; name: string; slug: string; logo_url: string | null; is_committee: boolean };

export async function getProfileSocieties(supabase: SupabaseClient, userId: string): Promise<ProfileSociety[]> {
  const { data } = await supabase.rpc("profile_societies", { person: userId });
  return (data ?? []) as ProfileSociety[];
}
