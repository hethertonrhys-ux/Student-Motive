import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  adminCreateCommunity,
  adminListCommunities,
  adminSearchSocieties,
  adminSearchUsers,
  adminSetCommunityAdmin,
  communityManagePath,
  communityPath,
  communityRoster,
  communitySlugFrom,
  isCommunitySlug,
  uniShort,
  type AdminCommunity,
  type AdminSocietyRow,
} from "@function/shared";
import { AdminTabs } from "@/components/admin-tabs";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { LinkButton } from "@/components/event/panels";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Admin panel → Communities: every community (members, requests waiting
// and admins), making a new one (name, web address, an optional linked
// society and a bio), and setting a community's first admins by finding
// the person. Each opens its page and its Manage screen. The Function team
// only: the database checks that too.
export default function AdminCommunitiesScreen() {
  const { profile, loading } = useProfile();
  const list = useQuery({ queryKey: ["admin", "communities"], queryFn: () => adminListCommunities(supabase), enabled: !!profile?.is_admin });
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={"/(tabs)/me"} />
        <Heading className="mt-3">Admin panel</Heading>
        {loading ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : !profile?.is_admin ? (
          <Card className="mt-6"><Muted>This page is for the Function team.</Muted></Card>
        ) : (
          <>
            <AdminTabs current="communities" />
            <Muted className="mt-6">Communities are groups a client runs inside Function, each with its own page, chats and join link. Make one, then name its first admins: they run everything else from its Manage screen.</Muted>

            <T variant="display" className="mt-8 text-xl">{list.data ? `Communities (${list.data.length})` : "Communities"}</T>
            {list.isPending && <Muted className="mt-3">Loading…</Muted>}
            {list.isError && <T variant="semibold" className="mt-3 text-sm text-danger">Couldn&apos;t load the communities. Try again.</T>}
            {list.data && list.data.length === 0 && <Muted className="mt-3">None yet.</Muted>}
            {!!list.data?.length && (
              <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface" testID="admin-communities">
                {list.data.map((c, i) => (
                  <View key={c.id} className={i > 0 ? "border-t border-line" : ""}>
                    <Pressable onPress={() => setPicked(picked === c.id ? null : c.id)} accessibilityRole="button" accessibilityState={{ expanded: picked === c.id }} className={`gap-0.5 px-4 py-3 ${picked === c.id ? "bg-brand-soft" : ""}`} testID={`admin-community-${c.slug}`}>
                      <T variant="semibold" numberOfLines={1}>{c.name}</T>
                      <Muted className="text-xs" numberOfLines={2}>
                        /c/{c.slug}{c.society_name ? ` · linked to ${c.society_name}` : ""} · {plural(c.active_members, "member", "members")} · {plural(c.pending_requests, "request", "requests")} waiting · {plural(c.admins, "admin", "admins")}
                      </Muted>
                      {c.admins === 0 && <T variant="semibold" className="text-xs text-brand" testID="no-admins">No admins yet: name its first admins.</T>}
                    </Pressable>
                    {picked === c.id && <CommunityDetail community={c} />}
                  </View>
                ))}
              </View>
            )}

            <NewCommunity onMade={(id) => setPicked(id)} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// One community: its links, its admins, and making someone an admin.
function CommunityDetail({ community: c }: { community: AdminCommunity }) {
  const queryClient = useQueryClient();
  const roster = useQuery({ queryKey: ["community-roster", c.id], queryFn: () => communityRoster(supabase, c.id) });
  const admins = (roster.data ?? []).filter((m) => m.role === "admin");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const people = useQuery({ queryKey: ["admin", "users", debounced], queryFn: () => adminSearchUsers(supabase, debounced), enabled: debounced.trim().length >= 2, placeholderData: keepPreviousData });

  async function makeAdmin(id: string, name: string) {
    setBusy(id);
    setMessage({});
    const r = await adminSetCommunityAdmin(supabase, c.id, id);
    setBusy(null);
    if (r.error) return setMessage({ error: r.error });
    setMessage({ ok: `${name} is now an admin of ${c.name}.` });
    await Promise.all(["admin", "community-roster", "community", "my-communities", "threads"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
  }

  return (
    <View className="gap-4 border-t border-line bg-bg px-4 py-4" testID="admin-community-detail">
      <View className="flex-row flex-wrap gap-4">
        <Link href={communityPath(c.slug) as never} asChild><Pressable testID="admin-community-page"><T variant="semibold" className="text-sm text-brand">Open its page →</T></Pressable></Link>
        <Link href={communityManagePath(c.slug) as never} asChild><Pressable testID="admin-community-manage"><T variant="semibold" className="text-sm text-brand">Manage →</T></Pressable></Link>
      </View>
      <View className="gap-1">
        <T variant="semibold">Admins</T>
        {roster.isPending && <Muted className="text-sm">Loading…</Muted>}
        {roster.data && admins.length === 0 && <Muted className="text-sm">None yet.</Muted>}
        {admins.map((a) => (
          <View key={a.user_id} className="flex-row items-center gap-2" testID={`community-admin-${a.user_id}`}>
            <Avatar name={a.nickname} url={a.avatar_url} size={24} />
            <T className="text-sm">{a.nickname}</T>
          </View>
        ))}
      </View>
      <View className="gap-2">
        <Label className="mb-0">Make someone an admin</Label>
        <Muted className="text-xs">Find them by name or email. If they&apos;re not in the community yet, they&apos;re added straight in as an admin.</Muted>
        <Input value={query} onChangeText={setQuery} placeholder="Search by name or email" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search people" testID="community-admin-search" />
        {people.data && debounced.trim().length >= 2 && people.data.length === 0 && <Muted className="text-sm">Nobody matches.</Muted>}
        {debounced.trim().length >= 2 && (people.data ?? []).slice(0, 8).map((u) => {
          const already = admins.some((a) => a.user_id === u.id);
          return (
            <View key={u.id} className="flex-row items-center gap-3" testID={`community-admin-pick-${u.id}`}>
              <Avatar name={u.name} size={32} />
              <View className="min-w-0 flex-1">
                <T variant="semibold" numberOfLines={1}>{u.name}</T>
                <Muted className="text-xs" numberOfLines={1}>{u.email} · {uniShort(u.university)}</Muted>
              </View>
              {already ? (
                <Muted className="text-xs">Admin</Muted>
              ) : (
                <Button variant="ghost" className="py-1.5" onPress={() => void makeAdmin(u.id, u.name)} disabled={busy === u.id} testID="make-community-admin">{busy === u.id ? "Saving…" : "Make admin"}</Button>
              )}
            </View>
          );
        })}
        {message.ok && <T variant="semibold" className="text-sm text-ok" testID="community-admin-done">{message.ok}</T>}
        {message.error && <T variant="semibold" className="text-sm text-danger" testID="community-admin-error">{message.error}</T>}
      </View>
    </View>
  );
}

// Making a community: its name, web address (suggested from the name), an
// optional society it belongs to, and a bio.
function NewCommunity({ onMade }: { onMade: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [society, setSociety] = useState<AdminSocietyRow | null>(null);
  const [societyQuery, setSocietyQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  useEffect(() => {
    const t = setTimeout(() => setDebounced(societyQuery), 250);
    return () => clearTimeout(t);
  }, [societyQuery]);
  const societies = useQuery({ queryKey: ["admin", "societies", debounced], queryFn: () => adminSearchSocieties(supabase, debounced), enabled: !society && debounced.trim().length >= 2, placeholderData: keepPreviousData });
  const address = slug ?? communitySlugFrom(name);

  async function create() {
    setMessage({});
    if (!name.trim()) return setMessage({ error: "Give the community a name." });
    if (!isCommunitySlug(address)) return setMessage({ error: "The web address must be 3 to 60 lowercase letters, numbers and single hyphens." });
    setBusy(true);
    const r = await adminCreateCommunity(supabase, { name: name.trim(), slug: address, societyId: society?.id ?? null, bio });
    setBusy(false);
    if (r.error || !r.id) return setMessage({ error: r.error ?? "Couldn't create the community. Try again." });
    setMessage({ ok: `Made ${name.trim()}. Now name its first admins above.` });
    setName("");
    setSlug(null);
    setBio("");
    setSociety(null);
    setSocietyQuery("");
    await queryClient.invalidateQueries({ queryKey: ["admin", "communities"] });
    onMade(r.id);
  }

  return (
    <Card className="mt-8 gap-4" testID="admin-new-community">
      <T variant="display" className="text-xl">Make a community</T>
      <View>
        <Label>Name</Label>
        <Input value={name} onChangeText={(v) => { setName(v); setMessage({}); }} maxLength={80} placeholder="e.g. UCL Abacus" testID="new-community-name" />
      </View>
      <View>
        <Label>Web address</Label>
        <View className="flex-row items-center gap-1">
          <Muted>/c/</Muted>
          <Input value={address} onChangeText={(v) => { setSlug(v.toLowerCase()); setMessage({}); }} autoCapitalize="none" autoCorrect={false} maxLength={60} className="flex-1" testID="new-community-slug" />
        </View>
        <Muted className="mt-1 text-xs">Its join link: studentfunction.com/c/{address || "…"}/join. It can&apos;t be changed later.</Muted>
      </View>
      <View>
        <Label>Linked society (optional)</Label>
        {society ? (
          <View className="flex-row flex-wrap items-center gap-3">
            <T variant="semibold" testID="new-community-society">{society.name} · {uniShort(society.university)}</T>
            <LinkButton onPress={() => setSociety(null)} testID="new-community-society-clear">Change</LinkButton>
          </View>
        ) : (
          <>
            <Input value={societyQuery} onChangeText={setSocietyQuery} placeholder="Search societies" autoCapitalize="none" autoCorrect={false} testID="new-community-society-search" />
            {debounced.trim().length >= 2 && (societies.data ?? []).slice(0, 6).map((s) => (
              <Pressable key={s.id} onPress={() => setSociety(s)} className="mt-2 flex-row items-center gap-3" testID={`new-community-society-${s.id}`}>
                <Avatar name={s.name} url={s.logo_url} size={28} />
                <T className="flex-1" numberOfLines={1}>{s.name} · {uniShort(s.university)}</T>
              </Pressable>
            ))}
          </>
        )}
        <Muted className="mt-1 text-xs">The society keeps its own page and events. Its members aren&apos;t added to the community.</Muted>
      </View>
      <View>
        <Label>Bio (optional)</Label>
        <Input value={bio} onChangeText={setBio} multiline maxLength={1000} placeholder="Its admins and committee can change this later" className="min-h-20" style={{ textAlignVertical: "top" }} testID="new-community-bio" />
      </View>
      {message.error && <T variant="semibold" className="text-sm text-danger" testID="new-community-error">{message.error}</T>}
      {message.ok && <T variant="semibold" className="text-sm text-ok" testID="new-community-done">{message.ok}</T>}
      <Button className="self-start" onPress={() => void create()} disabled={busy} testID="new-community-create">{busy ? "Making…" : "Make community"}</Button>
    </Card>
  );
}
