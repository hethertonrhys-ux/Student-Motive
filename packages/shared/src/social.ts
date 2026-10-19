import type { SupabaseClient } from "@supabase/supabase-js";

// A person as others see them (never their email).
// What anyone can see of a person: `name` is their nickname if they set
// one, otherwise their full name. full_name is there for profile pages,
// which show both.
export type PersonCard = { id: string; name: string; avatar_url: string | null; course: string | null; bio: string | null; full_name?: string | null; nickname?: string | null; university?: string | null; graduation_year?: number | null; country?: string | null };

// How the logged-in user is connected to someone.
export type Relation = "self" | "friends" | "incoming" | "outgoing" | "none";

export async function getCards(supabase: SupabaseClient, ids: string[]): Promise<Map<string, PersonCard>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("profile_cards").select("id, name, avatar_url, course, bio, full_name, nickname, university, graduation_year, country").in("id", unique);
  return new Map(((data ?? []) as PersonCard[]).map((c) => [c.id, c]));
}

type FriendshipRow = { requester_id: string; addressee_id: string; status: "pending" | "accepted"; created_at: string };

// Everyone the user is friends with or has a pending request with.
export async function getFriendships(supabase: SupabaseClient, me: string) {
  const { data } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status, created_at")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as FriendshipRow[];
  const relation = new Map<string, Relation>();
  for (const r of rows) {
    const other = r.requester_id === me ? r.addressee_id : r.requester_id;
    relation.set(other, r.status === "accepted" ? "friends" : r.requester_id === me ? "outgoing" : "incoming");
  }
  return relation;
}

// People hidden from the user because of a block (either way).
export async function getHiddenPeople(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.rpc("hidden_people");
  return new Set(((data ?? []) as string[]).map(String));
}

export function relationFor(relations: Map<string, Relation>, me: string, other: string): Relation {
  if (other === me) return "self";
  return relations.get(other) ?? "none";
}
