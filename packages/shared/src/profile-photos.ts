import type { SupabaseClient } from "@supabase/supabase-js";

// "My 5": up to 5 photos on each profile. A photo stays until its owner
// removes it to their Archive (where they can restore or delete it).
export const MAX_PHOTOS = 5;
export const PHOTO_BUCKET = "profile-photos";

export type ProfilePhoto = {
  id: string;
  path: string;
  url: string | null;
  pinned: boolean;
  activated_at: string;
  archived_at: string | null;
  current: boolean; // on the profile (not in the Archive)
};

type Row = { id: string; path: string; pinned: boolean; activated_at: string; archived_at: string | null };

export async function getPhotos(supabase: SupabaseClient, userId: string): Promise<ProfilePhoto[]> {
  const { data } = await supabase
    .from("profile_photos")
    .select("id, path, pinned, activated_at, archived_at")
    .eq("user_id", userId)
    // In the order the owner chose; photos added since come first.
    .order("position", { ascending: true, nullsFirst: true })
    .order("activated_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // The files are private: make short-lived links to show them.
  const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null, current: !r.archived_at }));
}

export type ProfileSociety = { id: string; name: string; slug: string; logo_url: string | null; is_committee: boolean };

export async function getProfileSocieties(supabase: SupabaseClient, userId: string): Promise<ProfileSociety[]> {
  const { data } = await supabase.rpc("profile_societies", { person: userId });
  return (data ?? []) as ProfileSociety[];
}
