import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { adminSearchSocieties, claimDmMessage, claimLinkState, claimLinkUrl, createClaimLink, listClaimLinks, revokeClaimLink, setSocietyFounding, SOCIETY_KINDS, uniShort, type AdminSocietyRow, type ClaimLinkRow } from "@function/shared";
import { AdminTabs } from "@/components/admin-tabs";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";
import { supabase } from "@/lib/supabase";

const day = (iso: string | number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));
const dayTime = (iso: string | number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(iso));

// Admin panel → Societies: find any society at any uni and make it an
// instant claim link to send to its committee (e.g. in an Instagram DM).
// The link works once and lasts 7 days; whoever opens it and logs in
// becomes the society's manager straight away. Each society's links are
// listed with who used them and when, and unused ones can be cancelled.
// Each society can also be made a Founding Society (its Hub setup then
// shows the Founding Society agreement), and shows whether its committee
// has finished setting up its Hub.
export default function AdminSocietiesScreen() {
  const { profile, loading } = useProfile();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  // The link just made. Its secret isn't stored anywhere, so this is the only
  // time it can be copied. Kept here so a new search doesn't lose it.
  const [made, setMade] = useState<Made | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const results = useQuery({ queryKey: ["admin", "societies", debounced], queryFn: () => adminSearchSocieties(supabase, debounced), enabled: !!profile?.is_admin, placeholderData: keepPreviousData });

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
            <AdminTabs current="societies" />
            <Muted className="mt-6">Find a society, then make a claim link for its committee. Whoever opens the link and logs in manages the society straight away. Each link works once and lasts 7 days.</Muted>
            <Input value={query} onChangeText={setQuery} placeholder="Search societies at every uni" autoCapitalize="none" autoCorrect={false} className="mt-4" accessibilityLabel="Search societies" testID="admin-society-search" />
            {results.isError && <T variant="semibold" className="mt-3 text-sm text-danger">Couldn&apos;t search. Try again.</T>}
            <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface" testID="admin-society-results">
              {(results.data ?? []).map((s, i) => (
                <View key={s.id} className={i > 0 ? "border-t border-line" : ""}>
                  <Pressable onPress={() => setPicked(picked === s.id ? null : s.id)} accessibilityRole="button" accessibilityState={{ expanded: picked === s.id }} className={`flex-row items-center gap-3 px-4 py-3 ${picked === s.id ? "bg-brand-soft" : ""}`} testID={`admin-society-${s.id}`}>
                    <Avatar name={s.name} url={s.logo_url} size={36} />
                    <View className="min-w-0 flex-1">
                      <T variant="semibold" numberOfLines={1}>{s.name}</T>
                      <Muted className="text-xs" numberOfLines={1}>{uniShort(s.university)}{s.kind !== "society" ? ` · ${SOCIETY_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}` : ""}</Muted>
                    </View>
                    <Pill on={s.claimed}>{s.claimed ? "Claimed" : "Unclaimed"}</Pill>
                  </Pressable>
                  {picked === s.id && <SocietyLinks society={s} made={made?.societyId === s.id ? made : null} onMade={setMade} />}
                </View>
              ))}
              {results.data && results.data.length === 0 && <Muted className="px-4 py-3 text-sm">No society matches.</Muted>}
              {results.isPending && <Muted className="px-4 py-3 text-sm">Searching…</Muted>}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Pill({ on, children }: { on: boolean; children: string }) {
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${on ? "bg-ok/10" : "border border-brand"}`}>
      <T variant="bold" className={`text-xs ${on ? "text-ok" : "text-brand"}`}>{children}</T>
    </View>
  );
}

type Made = { societyId: string; linkId: string; url: string; expiresAt: number };

// One society: make a link (shown once, with copy buttons) and its links so far.
function SocietyLinks({ society, made, onMade }: { society: AdminSocietyRow; made: Made | null; onMade: (made: Made | null) => void }) {
  const queryClient = useQueryClient();
  const links = useQuery({ queryKey: ["admin", "claim-links", society.id], queryFn: () => listClaimLinks(supabase, society.id) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "claim-links", society.id] });

  async function create() {
    setBusy(true);
    setError(null);
    const r = await createClaimLink(supabase, society.id);
    setBusy(false);
    if (r.error || !r.token || !r.id) return setError(r.error ?? "Couldn't create a link. Try again.");
    onMade({ societyId: society.id, linkId: r.id, url: claimLinkUrl(SITE_URL, r.token), expiresAt: Date.now() + 7 * 24 * 3600 * 1000 });
    await refresh();
  }
  async function revoke(link: ClaimLinkRow) {
    setError(null);
    const r = await revokeClaimLink(supabase, link.id);
    if (r.error) return setError(r.error);
    // The cancelled link is the one on screen: don't offer to copy it any more.
    if (made?.linkId === link.id) onMade(null);
    await refresh();
  }

  return (
    <View className="gap-4 border-t border-line bg-bg px-4 py-4" testID="admin-society-detail">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Link href={`/s/${society.slug}` as never} asChild><Pressable><T variant="semibold" className="text-sm text-brand">Open society page →</T></Pressable></Link>
        <Button onPress={() => void create()} disabled={busy} testID="create-claim-link">{busy ? "Creating…" : "Create claim link"}</Button>
      </View>
      {error && <T variant="semibold" className="text-sm text-danger" testID="claim-link-error">{error}</T>}
      {made && <MadeLink name={society.name} url={made.url} expiresAt={links.data?.find((l) => l.id === made.linkId)?.expires_at ?? made.expiresAt} />}

      <HubStatus society={society} />

      <View>
        <T variant="semibold">Claim links</T>
        {links.isPending && <Muted className="mt-1 text-sm">Loading…</Muted>}
        {links.isError && <T variant="semibold" className="mt-1 text-sm text-danger">Couldn&apos;t load the links. Try again.</T>}
        {links.data && links.data.length === 0 && <Muted className="mt-1 text-sm">No links yet.</Muted>}
        {links.data && links.data.length > 0 && (
          <View className="mt-2 overflow-hidden rounded-xl border border-line bg-surface" testID="claim-links">
            {links.data.map((l, i) => (
              <LinkRow key={l.id} link={l} first={i === 0} onRevoke={() => void revoke(l)} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// The Founding Society switch (saves straight away) and whether the
// committee has finished setting up its Hub.
function HubStatus({ society }: { society: AdminSocietyRow }) {
  const queryClient = useQueryClient();
  const [founding, setFounding] = useState(society.is_founding);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    const next = !founding;
    setFounding(next);
    setSaving(true);
    setError(null);
    const r = await setSocietyFounding(supabase, society.id, next);
    setSaving(false);
    if (r.error) {
      setFounding(!next);
      return setError(r.error);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "societies"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "hub", "founding"] }),
      queryClient.invalidateQueries({ queryKey: ["founding-progress", society.id] }),
      queryClient.invalidateQueries({ queryKey: ["founding-badge", society.id] }),
      queryClient.invalidateQueries({ queryKey: ["hub", society.id] }),
    ]);
  }
  return (
    <View className="gap-3 rounded-xl border border-line bg-surface px-3 py-3">
      <Pressable onPress={() => void toggle()} disabled={saving} accessibilityRole="switch" accessibilityState={{ checked: founding, disabled: saving }} aria-checked={founding} className="flex-row items-center justify-between gap-4" testID="founding-switch">
        <View className="flex-1">
          <T variant="semibold">Founding Society</T>
          <Muted className="text-xs">Their Hub setup shows the Founding Society agreement.</Muted>
        </View>
        <View className={`h-7 w-12 justify-center rounded-full px-0.5 ${founding ? "bg-brand" : "bg-line"}`}>
          <View className={`h-6 w-6 items-center justify-center rounded-full bg-white ${founding ? "self-end" : "self-start"}`}>{founding && <Icon name="checkmark" size={14} color="#DA291C" />}</View>
        </View>
      </Pressable>
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
      <T variant="semibold" className={`text-sm ${society.onboarded_at ? "text-ok" : "text-muted"}`} testID="society-onboarded">
        {society.onboarded_at ? `Finished setting up its Hub on ${day(society.onboarded_at)}` : society.claimed ? "Hasn't finished setting up its Hub yet" : "Not set up yet (nobody manages it)"}
      </T>
    </View>
  );
}

// The new link, ready to copy on its own or inside a DM to paste on Instagram.
function MadeLink({ name, url, expiresAt }: { name: string; url: string; expiresAt: string | number }) {
  const [copied, setCopied] = useState<"link" | "dm" | null>(null);
  async function copy(what: "link" | "dm") {
    try {
      await Clipboard.setStringAsync(what === "link" ? url : claimDmMessage(name, url));
      setCopied(what);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Clipboard blocked: the link is still there to select.
    }
  }
  return (
    <Card className="gap-3 p-4" testID="claim-link-made">
      <T variant="semibold" className="text-sm">New claim link</T>
      <View className="rounded-xl border border-line bg-bg px-3 py-2">
        <T className="text-sm" selectable testID="claim-link-url">{url}</T>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button variant="ghost" onPress={() => void copy("link")} testID="copy-claim-link">{copied === "link" ? "Link copied" : "Copy link"}</Button>
        <Button variant="ghost" onPress={() => void copy("dm")} testID="copy-claim-dm">{copied === "dm" ? "Message copied" : "Copy DM message"}</Button>
      </View>
      <Muted className="text-xs">Expires {dayTime(expiresAt)}. It works once, and this is the only time you can copy it.</Muted>
    </Card>
  );
}

function LinkRow({ link, first, onRevoke }: { link: ClaimLinkRow; first: boolean; onRevoke: () => void }) {
  const state = claimLinkState(link);
  const made = `Made ${day(link.created_at)}${link.created_by_name ? ` by ${link.created_by_name}` : ""}`;
  return (
    <View className={`gap-1 px-3 py-2.5 ${first ? "" : "border-t border-line"}`} testID={`claim-link-${link.id}`}>
      <Muted className="text-xs">{made}</Muted>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        {state === "ready" && <T variant="semibold" className="text-sm text-ok" testID="claim-link-state">Ready until {dayTime(link.expires_at)}</T>}
        {state === "used" && <T variant="semibold" className="text-sm" testID="claim-link-state">Used by {link.used_by_name ?? "a deleted account"} on {day(link.used_at!)}</T>}
        {state === "expired" && <T variant="semibold" className="text-sm text-muted" testID="claim-link-state">Expired</T>}
        {state === "revoked" && <T variant="semibold" className="text-sm text-muted" testID="claim-link-state">Cancelled</T>}
        {state === "ready" && <LinkButton danger onPress={onRevoke} confirmText="Cancel this link? It will stop working straight away." testID="revoke-claim-link">Cancel link</LinkButton>}
      </View>
    </View>
  );
}
