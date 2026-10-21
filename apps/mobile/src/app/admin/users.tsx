import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { adminLiftBan, adminSearchUsers, adminSetBan, adminUserDetail, banLabel, countryByCode, loadAccountBan, uniShort } from "@function/shared";
import { AdminTabs } from "@/components/admin-tabs";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { confirmAction } from "@/lib/confirm";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

const when = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso)) : "never");

// Admin panel → Users: find a person by name or email and see what support
// needs: account details, verification, societies, events, reports against
// them, and suspending or banning the account. Nothing else (no photos,
// prompts, chats or money).
export default function AdminUsersScreen() {
  const { profile, loading } = useProfile();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // /admin/users?user=<id> opens that person (e.g. from a report).
  const { user } = useLocalSearchParams<{ user?: string }>();
  const [picked, setPicked] = useState<string | null>(typeof user === "string" ? user : null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const results = useQuery({ queryKey: ["admin", "users", debounced], queryFn: () => adminSearchUsers(supabase, debounced), enabled: !!profile?.is_admin });
  const detail = useQuery({ queryKey: ["admin", "user", picked], queryFn: () => adminUserDetail(supabase, picked!), enabled: !!profile?.is_admin && !!picked });

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
            <AdminTabs current="users" />
            <Input value={query} onChangeText={setQuery} placeholder="Search by name or email" autoCapitalize="none" autoCorrect={false} className="mt-6" accessibilityLabel="Search users" testID="admin-user-search" />
            {results.isError && <T variant="semibold" className="mt-3 text-sm text-danger">Couldn&apos;t search. Try again.</T>}
            <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface" testID="admin-user-results">
              {(results.data ?? []).map((u, i) => (
                <Pressable key={u.id} onPress={() => setPicked(picked === u.id ? null : u.id)} className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""} ${picked === u.id ? "bg-brand-soft" : ""}`} testID={`admin-user-${u.id}`}>
                  <Avatar name={u.name} size={36} />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <T variant="semibold" className="shrink" numberOfLines={1}>{u.name}</T>
                    </View>
                    <Muted className="text-xs" numberOfLines={1}>{u.email} · {uniShort(u.university)} · joined {when(u.created_at)}</Muted>
                  </View>
                  {u.is_admin && <T variant="bold" className="text-xs text-brand">Admin</T>}
                </Pressable>
              ))}
              {results.data && results.data.length === 0 && <Muted className="px-4 py-3 text-sm">Nobody matches.</Muted>}
              {results.isPending && <Muted className="px-4 py-3 text-sm">Searching…</Muted>}
            </View>

            {picked && (
              <Card className="mt-4 gap-4" testID="admin-user-detail">
                {detail.isPending && <Muted>Loading…</Muted>}
                {detail.isError && <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load this person.</T>}
                {detail.data && <UserDetail d={detail.data} />}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UserDetail({ d }: { d: NonNullable<Awaited<ReturnType<typeof adminUserDetail>>> }) {
  const country = countryByCode(d.country);
  return (
    <>
      <View className="flex-row items-center gap-3">
        <Avatar name={d.name} size={48} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <T variant="display-bold" className="shrink text-lg" numberOfLines={1}>{d.name}</T>
          </View>
          <Link href={`/u/${d.id}` as never} asChild><Pressable><T variant="semibold" className="text-sm text-brand">Open public profile →</T></Pressable></Link>
        </View>
      </View>
      <Rows
        rows={[
          ["Email", d.email],
          ["Full name", d.full_name ?? "not given"],
          ["Nickname", d.nickname ?? "none"],
          ["University", uniShort(d.university)],
          ["Graduation year", d.graduation_year ? String(d.graduation_year) : "not given"],
          ["Country", country?.name ?? "not given"],
          ["Course", d.course ?? "not given"],
          ["Signed up", when(d.created_at)],
          ["Last signed in", when(d.last_sign_in_at)],
        ]}
      />
      <View>
        <T variant="semibold">Verification</T>
        <View className="mt-1.5 flex-row flex-wrap gap-2">
          <Pill ok={!!d.email_confirmed_at}>{d.email_confirmed_at ? `Email confirmed ${when(d.email_confirmed_at)}` : "Email not confirmed"}</Pill>
          <Pill ok={d.two_factor}>{d.two_factor ? "2FA on" : "2FA off"}</Pill>
          <Pill neutral>{d.uni_email ? "University email" : "Invited email"}</Pill>
          <Pill ok={d.details_complete}>{d.details_complete ? "Details complete" : "Details missing"}</Pill>
          {d.is_admin && <Pill ok>Function admin</Pill>}
        </View>
      </View>
      <View>
        <T variant="semibold">Societies</T>
        {d.societies.length === 0 && d.runs.length === 0 ? (
          <Muted className="text-sm">None.</Muted>
        ) : (
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {d.runs.map((s) => (
              <Link key={`run-${s.id}`} href={`/s/${s.slug}` as never} asChild><Pressable className="rounded-full border border-brand px-2.5 py-0.5"><T variant="bold" className="text-xs text-brand">Runs {s.name}</T></Pressable></Link>
            ))}
            {d.societies.map((s) => (
              <Link key={s.id} href={`/s/${s.slug}` as never} asChild><Pressable className="rounded-full border border-line px-2.5 py-0.5"><T variant="semibold" className="text-xs">{s.name}{s.status !== "approved" ? ` · ${s.status}` : ""}</T></Pressable></Link>
            ))}
          </View>
        )}
      </View>
      <EventList title={`Hosting (${d.hosted_count})`} items={d.hosted} />
      <EventList title={`Joined (${d.joined_count})`} items={d.joined} />
      {!d.is_admin && <BanControls userId={d.id} name={d.name} />}
      <View>
        <T variant="semibold">Reports against them ({d.reports_against.length})</T>
        {d.reports_against.length === 0 ? (
          <Muted className="text-sm">None.</Muted>
        ) : (
          <View className="mt-1.5 gap-1.5">
            {d.reports_against.map((r) => (
              <View key={r.id} className="rounded-xl bg-bg px-3 py-2">
                <T className="text-sm">{r.reason} <Muted className="text-xs">· {r.status} · {when(r.created_at)}</Muted></T>
                {r.details && <Muted className="text-xs">{r.details}</Muted>}
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

// Suspend (7 or 30 days) or ban an account: it can't log in until then (or
// ever), and is logged out everywhere now. The reason is kept with it.
function BanControls({ userId, name }: { userId: string; name: string }) {
  const queryClient = useQueryClient();
  const ban = useQuery({ queryKey: ["admin", "ban", userId], queryFn: () => loadAccountBan(supabase, userId) });
  const [reason, setReason] = useState("");
  const [state, setState] = useState<{ error?: string; done?: string }>({});
  const [busy, setBusy] = useState(false);
  const label = banLabel(ban.data ?? null);

  async function apply(days: number | null) {
    const what = days === null ? `Ban ${name}?` : `Suspend ${name} for ${days} days?`;
    if (!(await confirmAction(what, "They're logged out now and can't log in until it ends (a ban doesn't end). You can lift it here.", days === null ? "Ban" : "Suspend"))) return;
    setBusy(true);
    const r = await adminSetBan(supabase, userId, days, reason);
    setBusy(false);
    setState(r.error ? { error: r.error } : { done: days === null ? "Banned." : `Suspended for ${days} days.` });
    if (!r.error) setReason("");
    await queryClient.invalidateQueries({ queryKey: ["admin", "ban", userId] });
  }

  async function lift() {
    setBusy(true);
    const r = await adminLiftBan(supabase, userId);
    setBusy(false);
    setState(r.error ? { error: r.error } : { done: "Lifted. They can log in again." });
    await queryClient.invalidateQueries({ queryKey: ["admin", "ban", userId] });
  }

  return (
    <View className="gap-2 rounded-xl border border-line p-3" testID="ban-controls">
      <View className="flex-row items-center justify-between gap-2">
        <T variant="semibold">Suspend or ban</T>
        {label ? <Pill>{label}</Pill> : <Pill ok>Active</Pill>}
      </View>
      {label && ban.data?.reason && <Muted className="text-sm" testID="ban-reason">Reason: {ban.data.reason}</Muted>}
      <View>
        <Label>Reason (kept with it)</Label>
        <Input value={reason} onChangeText={setReason} maxLength={500} placeholder="e.g. Abusive messages in a group chat" testID="ban-reason-input" />
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button variant="ghost" className="py-2" disabled={busy} onPress={() => void apply(7)} testID="suspend-7">Suspend 7 days</Button>
        <Button variant="ghost" className="py-2" disabled={busy} onPress={() => void apply(30)} testID="suspend-30">Suspend 30 days</Button>
        <Button className="py-2" disabled={busy} onPress={() => void apply(null)} testID="ban">Ban</Button>
        {label && <Button variant="ghost" className="py-2" disabled={busy} onPress={() => void lift()} testID="lift-ban">Lift</Button>}
      </View>
      {state.error && <T variant="semibold" className="text-sm text-danger" testID="ban-error">{state.error}</T>}
      {state.done && <T variant="semibold" className="text-sm text-ok" testID="ban-done">{state.done}</T>}
      <Muted className="text-xs">To remove what they posted, use the buttons on each report in Overview.</Muted>
    </View>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <View className="overflow-hidden rounded-xl border border-line">
      {rows.map(([label, value], i) => (
        <View key={label} className={`flex-row justify-between gap-3 px-3 py-2 ${i > 0 ? "border-t border-line" : ""}`}>
          <Muted className="text-sm">{label}</Muted>
          <T variant="semibold" className="shrink text-right text-sm" numberOfLines={2}>{value}</T>
        </View>
      ))}
    </View>
  );
}

// Green for a check that passed, red for one that didn't, neutral for a plain fact.
function Pill({ ok = false, neutral = false, children }: { ok?: boolean; neutral?: boolean; children: string }) {
  const box = neutral ? "bg-brand-soft" : ok ? "bg-ok/10" : "bg-danger/10";
  const text = neutral ? "text-brand" : ok ? "text-ok" : "text-danger";
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${box}`}>
      <T variant="bold" className={`text-xs ${text}`}>{children}</T>
    </View>
  );
}

function EventList({ title, items }: { title: string; items: { id: string; title: string; starts_at: string; href: string; status?: string }[] }) {
  return (
    <View>
      <T variant="semibold">{title}</T>
      {items.length === 0 ? (
        <Muted className="text-sm">None.</Muted>
      ) : (
        <View className="mt-1.5 gap-1">
          {items.map((e) => (
            <Link key={`${e.href}`} href={e.href as never} asChild>
              <Pressable className="flex-row items-center justify-between gap-3">
                <T variant="semibold" className="shrink text-sm text-brand" numberOfLines={1}>{e.title}</T>
                <Muted className="text-xs">{when(e.starts_at)}{e.status ? ` · ${e.status}` : ""}</Muted>
              </Pressable>
            </Link>
          ))}
          {items.length >= 10 && <Muted className="text-xs">Showing the last 10.</Muted>}
        </View>
      )}
    </View>
  );
}
