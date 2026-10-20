import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { addManager, cancelManagerInvite, inviteManager, loadManagerInvites, loadManagers, searchPeople, uniShort, type Manager } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { LinkButton } from "@/components/event/panels";
import { Button, Input, Label, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));

// The society's managers (names and photos, never emails), and adding more:
// by name (anyone on Function) or by email (straight away if they have an
// account, otherwise as soon as they sign up). Used by the Hub's setup and
// its Committee page.
export function useManagers(societyId: string) {
  return useQuery({ queryKey: ["hub-managers", societyId], queryFn: () => loadManagers(supabase, societyId) });
}

export function ManagersPanel({ societyId }: { societyId: string }) {
  const managers = useManagers(societyId);
  const invites = useQuery({ queryKey: ["hub-invites", societyId], queryFn: () => loadManagerInvites(supabase, societyId) });
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["hub-managers", societyId] }),
    queryClient.invalidateQueries({ queryKey: ["hub-invites", societyId] }),
  ]);

  async function cancel(email: string) {
    setMessage(null);
    const r = await cancelManagerInvite(supabase, societyId, email);
    if (r.error) setMessage({ text: r.error, ok: false });
    await refresh();
  }

  return (
    <View className="gap-6">
      <View>
        <T variant="display-bold" className="text-lg">Managers</T>
        {managers.isPending && <Muted className="mt-2">Loading…</Muted>}
        {managers.isError && <T variant="semibold" className="mt-2 text-sm text-danger">Couldn&apos;t load the managers. Try again.</T>}
        {managers.data && <ManagerList managers={managers.data} />}
      </View>

      <AddByName societyId={societyId} managerIds={new Set((managers.data ?? []).map((m) => m.user_id))} onAdded={async (name) => { setMessage({ text: `Added ${name}. They're a manager now.`, ok: true }); await refresh(); }} />
      <AddByEmail
        societyId={societyId}
        onDone={async (text, ok) => {
          setMessage({ text, ok });
          if (ok) await refresh();
        }}
      />
      {message && <T variant="semibold" className={`rounded-xl px-4 py-3 ${message.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`} testID="manager-message">{message.text}</T>}

      {invites.data && invites.data.length > 0 && (
        <View>
          <T variant="semibold">Invited, waiting to sign up</T>
          <Muted className="text-sm">They become managers as soon as they sign up with that email.</Muted>
          <View className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface" testID="manager-invites">
            {invites.data.map((i, n) => (
              <View key={i.email} className={`flex-row flex-wrap items-center justify-between gap-2 px-4 py-3 ${n > 0 ? "border-t border-line" : ""}`} testID={`manager-invite-${i.email}`}>
                <View className="min-w-0 flex-1">
                  <T variant="semibold" numberOfLines={1}>{i.email}</T>
                  <Muted className="text-xs">Invited {day(i.created_at)}</Muted>
                </View>
                <LinkButton onPress={() => void cancel(i.email)} confirmText={`Cancel the invite for ${i.email}?`} testID="cancel-manager-invite">Cancel invite</LinkButton>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function ManagerList({ managers }: { managers: Manager[] }) {
  return (
    <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface" testID="manager-list">
      {managers.map((m, i) => (
        <View key={m.user_id} className={`min-h-[64px] flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`manager-${m.user_id}`}>
          <Avatar name={m.name} url={m.avatar_url} size={40} ring={m.is_me} />
          <View className="min-w-0 flex-1">
            <T variant="semibold" numberOfLines={1}>{m.name}{m.is_me ? " (you)" : ""}</T>
            <Muted className="text-xs">Manager since {day(m.added_at)}</Muted>
          </View>
        </View>
      ))}
      {managers.length === 0 && <Muted className="px-4 py-3">No managers yet.</Muted>}
    </View>
  );
}

// Search everyone on Function by name (with their course and uni, so two
// people with the same name can be told apart); tap someone, then confirm,
// to add them.
function AddByName({ societyId, managerIds, onAdded }: { societyId: string; managerIds: Set<string>; onAdded: (name: string) => Promise<void> }) {
  const { session } = useSession();
  const myId = session?.user.id ?? "";
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const results = useQuery({ queryKey: ["manager-search", myId, debounced], queryFn: () => searchPeople(supabase, myId, debounced), enabled: !!myId && debounced.length >= 2 });
  const people = (results.data ?? []).filter((p) => !managerIds.has(p.id));

  // There's no removing another manager, so check it's the right person.
  function confirmAdd(id: string, name: string) {
    const question = `Add ${name} as a manager?`;
    const detail = "They'll be able to post events, edit your page and choose features.";
    if (Platform.OS === "web") {
      if (window.confirm(`${question} ${detail}`)) void add(id, name);
      return;
    }
    Alert.alert(question, detail, [{ text: "Cancel", style: "cancel" }, { text: "Add", onPress: () => void add(id, name) }]);
  }

  async function add(id: string, name: string) {
    setAdding(id);
    setError(null);
    const r = await addManager(supabase, societyId, id);
    setAdding(null);
    if (r.error) return setError(r.error);
    setQuery("");
    setDebounced("");
    await onAdded(name);
  }

  return (
    <View>
      <Label>Add by name</Label>
      <Input value={query} onChangeText={setQuery} placeholder="Search for someone on Function" autoCorrect={false} accessibilityLabel="Search for someone by name" testID="manager-search" />
      {error && <T variant="semibold" className="mt-2 text-sm text-danger">{error}</T>}
      {debounced.length >= 2 && (
        <View className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface" testID="manager-results">
          {people.map((p, i) => (
            <Pressable key={p.id} onPress={() => confirmAdd(p.id, p.name)} disabled={!!adding} accessibilityRole="button" accessibilityLabel={`Add ${p.name} as a manager`} className={`min-h-[56px] flex-row items-center gap-3 px-4 py-3 active:bg-bg ${i > 0 ? "border-t border-line" : ""}`} testID={`manager-result-${p.id}`}>
              <Avatar name={p.name} url={p.avatar_url} size={36} />
              <View className="min-w-0 flex-1">
                <T variant="semibold" numberOfLines={1}>{p.name}</T>
                {(p.course || p.university) && <Muted className="text-xs" numberOfLines={1}>{[p.course, p.university ? uniShort(p.university) : null].filter(Boolean).join(" · ")}</Muted>}
              </View>
              <T variant="semibold" className="text-sm text-brand">{adding === p.id ? "Adding…" : "Add"}</T>
            </Pressable>
          ))}
          {results.isPending && <Muted className="px-4 py-3 text-sm">Searching…</Muted>}
          {results.data && people.length === 0 && <Muted className="px-4 py-3 text-sm">No one found. Try their email instead.</Muted>}
        </View>
      )}
    </View>
  );
}

// Add someone by their email address.
function AddByEmail({ societyId, onDone }: { societyId: string; onDone: (text: string, ok: boolean) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  async function add() {
    const address = email.trim().toLowerCase();
    setPending(true);
    const r = await inviteManager(supabase, societyId, address);
    setPending(false);
    if (r.error || !r.result) return onDone(r.error ?? "Couldn't add them. Try again.", false);
    setEmail("");
    await onDone(r.result === "added" ? `Added ${address}. They're a manager now.` : `Invited ${address}. They'll be a manager as soon as they sign up.`, true);
  }
  return (
    <View>
      <Label>Add by email</Label>
      <View className="flex-row gap-2">
        <Input value={email} onChangeText={setEmail} placeholder="name@lse.ac.uk" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onSubmitEditing={() => void add()} className="min-h-[52px] flex-1" accessibilityLabel="Their email address" testID="manager-email" />
        <Button onPress={() => void add()} disabled={pending || !email.trim()} className="min-h-[52px]" testID="manager-email-add">{pending ? "Adding…" : "Add"}</Button>
      </View>
      <Muted className="mt-1.5 text-xs">Use the email they log in to Function with (usually their uni email).</Muted>
    </View>
  );
}
