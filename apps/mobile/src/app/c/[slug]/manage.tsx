import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Link, useLocalSearchParams } from "expo-router";
import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  addGroupMember,
  approveRequest,
  archiveGroup,
  communityMemberClaims,
  communityPath,
  communityRequests,
  communityRoster,
  confirmMembership,
  COMMUNITY_ROLE_LABELS,
  createGroup,
  declineRequest,
  filterByNickname,
  groupMembers,
  isCommunityManager,
  joinUrl,
  memberActions,
  membershipClaimBadge,
  removeCommunityMember,
  removeGroupMember,
  renameGroup,
  roleColour,
  roleTag,
  rosterCounts,
  setCommunityRole,
  uniShort,
  updateCommunityProfile,
  updateCommunitySettings,
  uploadCommunityImage,
  type CommunityGroup,
  type CommunityHome,
  type CommunityRole,
  type JoinRequest,
  type RoleColourKey,
  type RosterEntry,
} from "@function/shared";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { CommunityBanner, CommunityLogo } from "@/components/community/community-header";
import { GroupForm } from "@/components/community/group-form";
import { RoleName, RoleTagPill } from "@/components/community/role-name";
import { useCommunityHome, useRefreshCommunity } from "@/components/community/use-community";
import { LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { pickPhotos, type Picked } from "@/components/photos/pick-photos";
import { CAN_DOWNLOAD_QR, downloadQr } from "@/components/qr/download-qr";
import { QrCode } from "@/components/qr/qr-code";
import { ShareButton } from "@/components/share-button";
import { Chip } from "@/components/social/filters";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import { useSession } from "@/providers/session";

const asked = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(iso));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
// Long lists show this many at a time; searching finds anyone.
const SHOW = 100;

type Actor = { userId: string; role: CommunityRole | null; isFunctionAdmin: boolean; isAdmin: boolean };

// Manage a community (/c/<slug>/manage), for its admins and committee (and
// the Function team), in this order: join requests (admins approve as a
// paying member or not; committee approve as a non-member), the invite link
// and its QR code, members (roles, paying membership and removing people,
// following the community's rules), the sub-groups and who's in them, and
// the community's bio, picture and banner (admins can also rename it).
// The colours names are shown in are listed as a key. Everyone else is told
// only admins and committee can manage it. Every rule is checked again by
// the database, and its message is shown if it says no.
export default function ManageCommunityScreen() {
  const { slug: raw } = useLocalSearchParams<{ slug: string }>();
  const slug = typeof raw === "string" ? raw.toLowerCase() : "";
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;
  const home = useCommunityHome(slug);

  if (loading || (userId && home.isPending)) return <Screen slug={slug}><Muted>Loading…</Muted></Screen>;
  if (!userId) {
    return (
      <Screen slug={slug}>
        <Card className="flex-row flex-wrap items-center justify-between gap-3">
          <T variant="semibold">Log in to manage this community.</T>
          <Link href={{ pathname: "/login", params: { next: `/c/${slug}/manage` } } as never} asChild>
            <Button testID="manage-login">Log in</Button>
          </Link>
        </Card>
      </Screen>
    );
  }
  const h = home.data;
  if (!h) {
    return (
      <Screen slug={slug}>
        <Heading>{home.isError ? "Couldn't load this community" : "Community not found"}</Heading>
        {home.isError && <Button className="mt-6 self-start" onPress={() => void home.refetch()}>Try again</Button>}
      </Screen>
    );
  }
  const c = h.community;
  if (!isCommunityManager(h.me) && !h.is_function_admin) {
    return (
      <Screen slug={slug}>
        <Card className="gap-3" testID="manage-not-allowed">
          <T variant="headline">Only admins and committee can manage {c.name}</T>
          <Link href={communityPath(c.slug) as never} asChild>
            <Button variant="ghost" className="self-start">Back to {c.name}</Button>
          </Link>
        </Card>
      </Screen>
    );
  }
  const role = h.me?.status === "active" ? h.me.role : null;
  const actor: Actor = { userId, role, isFunctionAdmin: h.is_function_admin, isAdmin: h.is_function_admin || role === "admin" };

  return (
    <Screen slug={slug}>
      <View className="flex-row items-center gap-3">
        <CommunityLogo name={c.name} url={c.image_url} size={52} />
        <View className="min-w-0 flex-1">
          <Heading className="text-2xl" testID="manage-heading">Manage</Heading>
          <Link href={communityPath(c.slug) as never} asChild>
            <Pressable hitSlop={6} accessibilityRole="link" testID="manage-view-page">
              <T variant="semibold" className="text-brand" numberOfLines={1}>{c.name} →</T>
            </Pressable>
          </Link>
        </View>
      </View>
      <Muted className="mt-2 text-sm">{actor.isAdmin ? "You're an admin" : "You're on the committee"}{h.is_function_admin && role !== "admin" ? " (as the Function team)" : ""}.</Muted>
      <RequestsSection home={h} actor={actor} />
      <InviteSection home={h} actor={actor} />
      <MembersSection home={h} actor={actor} />
      <GroupsSection home={h} actor={actor} />
      <ProfileSection home={h} actor={actor} />
    </Screen>
  );
}

function Section({ title, detail, children, testID }: { title: string; detail?: string; children: ReactNode; testID: string }) {
  return (
    <Card className="mt-6 gap-4" testID={testID}>
      <View>
        <T variant="display" className="text-xl">{title}</T>
        {detail && <Muted className="mt-1 text-sm">{detail}</Muted>}
      </View>
      {children}
    </Card>
  );
}

function ErrorLine({ children, testID }: { children: string | null; testID?: string }) {
  return children ? <T variant="semibold" className="text-sm text-danger" testID={testID}>{children}</T> : null;
}

// ---- Join requests ----

function RequestsSection({ home, actor }: { home: CommunityHome; actor: Actor }) {
  const c = home.community;
  const requests = useQuery({ queryKey: ["community-requests", c.id], queryFn: () => communityRequests(supabase, c.id) });
  const list = requests.data ?? [];
  return (
    <Section title={list.length ? `Join requests (${list.length})` : "Join requests"} detail={actor.isAdmin ? undefined : "Only admins can confirm paying members, so you approve people as non-members. Their claim stays for an admin to confirm."} testID="manage-requests">
      {requests.isPending && <Muted>Loading…</Muted>}
      {requests.isError && <ErrorLine>Couldn&apos;t load the requests. Pull down or try again.</ErrorLine>}
      {requests.data && list.length === 0 && <Muted testID="requests-empty">No requests waiting. Share the invite link below to get people in.</Muted>}
      {list.map((r) => <RequestRow key={r.user_id} request={r} home={home} actor={actor} />)}
    </Section>
  );
}

function RequestRow({ request: r, home, actor }: { request: JoinRequest; home: CommunityHome; actor: Actor }) {
  const refresh = useRefreshCommunity();
  const c = home.community;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(run: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const out = await run();
    setBusy(false);
    if (out.error) return setError(out.error);
    await refresh();
  }
  const name = r.full_name || r.display_name;
  return (
    <View className="gap-3 rounded-xl border border-line bg-bg p-3" testID={`request-${r.user_id}`}>
      <View className="flex-row items-start gap-3">
        <Avatar name={name} url={r.avatar_url} size={44} />
        <View className="min-w-0 flex-1 gap-0.5">
          <T variant="semibold" numberOfLines={1}>{name}</T>
          <Muted className="text-sm" numberOfLines={1}>Nickname: <T variant="semibold" className="text-sm">{r.nickname}</T>{r.university ? ` · ${uniShort(r.university)}` : ""}</Muted>
          <Muted className="text-xs">Asked {asked(r.requested_at)}{r.referred_by_nickname ? ` · shared by ${r.referred_by_nickname}` : ""}</Muted>
          {r.membership_claimed && (
            <View className="mt-1 self-start rounded-full bg-brand-soft px-2.5 py-0.5" testID="request-claim">
              <T variant="bold" className="text-xs text-brand">{membershipClaimBadge(c.membership_label)}</T>
            </View>
          )}
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {actor.isAdmin ? (
          <>
            <Button className="py-2" onPress={() => void act(() => approveRequest(supabase, c.id, r.user_id, true))} disabled={busy} testID="approve-as-member">Approve as member</Button>
            <Button variant="ghost" className="py-2" onPress={() => void act(() => approveRequest(supabase, c.id, r.user_id, false))} disabled={busy} testID="approve-as-non-member">Approve as non-member</Button>
          </>
        ) : (
          <Button className="py-2" onPress={() => void act(() => approveRequest(supabase, c.id, r.user_id, false))} disabled={busy} testID="approve">Approve</Button>
        )}
        <View className="px-2">
          <LinkButton onPress={() => void act(() => declineRequest(supabase, c.id, r.user_id))} confirmText={`Decline ${r.nickname}'s request?`} disabled={busy} danger testID="decline">Decline</LinkButton>
        </View>
      </View>
      {!actor.isAdmin && r.membership_claimed && <Muted className="text-xs">Only admins can confirm paying members.</Muted>}
      <ErrorLine testID="request-error">{error}</ErrorLine>
    </View>
  );
}

// ---- Invite people ----

function InviteSection({ home, actor }: { home: CommunityHome; actor: Actor }) {
  const c = home.community;
  const url = joinUrl(c.slug, null, SITE_URL);
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  async function copy() {
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is on screen to select.
    }
  }
  return (
    <Section title="Invite people" detail={`Anyone with this link or QR code can ask to join ${c.name}. Every request needs approval.`} testID="manage-invite">
      <View className="rounded-xl border border-line bg-bg px-3 py-2.5">
        <T variant="semibold" selectable testID="invite-link">{url}</T>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button variant="ghost" onPress={() => void copy()} testID="invite-copy">{copied ? "Link copied" : "Copy link"}</Button>
        {/* Shared links say who shared them (?ref=), so requests show it. */}
        <ShareButton url={joinUrl(c.slug, actor.userId, SITE_URL)} title={`Join ${c.name} on Function`} />
      </View>
      <View className="items-center gap-3">
        <QrCode value={url} size={200} testID="invite-qr" />
        <View className="flex-row flex-wrap justify-center gap-2">
          <Button variant="ghost" className="py-2" onPress={() => setBig(true)} testID="qr-full-screen">Show full screen</Button>
          {CAN_DOWNLOAD_QR && <Button variant="ghost" className="py-2" onPress={() => setDownloadFailed(!downloadQr(url, `${c.slug}-join-qr.png`))} testID="qr-download">Download QR</Button>}
        </View>
        {downloadFailed && <ErrorLine>Couldn&apos;t make the picture. Use Show full screen and take a screenshot.</ErrorLine>}
      </View>
      <FullScreenQr visible={big} onClose={() => setBig(false)} url={url} name={c.name} />
    </Section>
  );
}

function FullScreenQr({ visible, onClose, url, name }: { visible: boolean; onClose: () => void; url: string; name: string }) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const size = Math.max(200, Math.min(width - 48, height - 260, 520));
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" testID="qr-full">
        <View className="flex-row justify-end px-4 py-3">
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface" testID="qr-full-close">
            <Icon name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <T variant="display-bold" className="text-center text-2xl">Join {name} on Function</T>
          <QrCode value={url} size={size} testID="qr-full-code" />
          <Muted className="text-center">Scan with your phone&apos;s camera, or go to</Muted>
          <T variant="semibold" className="text-center" selectable>{url}</T>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ---- Members ----

function MembersSection({ home, actor }: { home: CommunityHome; actor: Actor }) {
  const c = home.community;
  const roster = useQuery({ queryKey: ["community-roster", c.id], queryFn: () => communityRoster(supabase, c.id) });
  const claims = useQuery({ queryKey: ["community-claims", c.id], queryFn: () => communityMemberClaims(supabase, c.id), enabled: actor.isAdmin });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const all = roster.data ?? [];
  const counts = rosterCounts(all);
  const found = filterByNickname(all, query);
  const shown = found.slice(0, SHOW);
  return (
    <Section title="Members" testID="manage-members">
      {roster.data && (
        <Muted className="text-sm" testID="member-counts">
          {plural(counts.members, "member", "members")} · {plural(counts.paying, "paying member", "paying members")} · {counts.committee} committee · {plural(counts.admins, "admin", "admins")}
        </Muted>
      )}
      <Input value={query} onChangeText={setQuery} placeholder="Search by nickname" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search members" testID="member-search" />
      {roster.isPending && <Muted>Loading…</Muted>}
      {roster.isError && <ErrorLine>Couldn&apos;t load the members. Try again.</ErrorLine>}
      {roster.data && found.length === 0 && <Muted>{query.trim() ? "Nobody with that nickname." : "Nobody yet."}</Muted>}
      {shown.length > 0 && (
        <View className="overflow-hidden rounded-xl border border-line">
          {shown.map((m, i) => (
            <MemberRow
              key={m.user_id}
              member={m}
              first={i === 0}
              home={home}
              actor={actor}
              claimed={!!claims.data?.has(m.user_id) && m.membership === "non_member"}
              adminCount={counts.admins}
              open={open === m.user_id}
              onToggle={() => setOpen(open === m.user_id ? null : m.user_id)}
            />
          ))}
        </View>
      )}
      {found.length > SHOW && <Muted className="text-xs">Showing {SHOW} of {found.length}. Search to find someone.</Muted>}
    </Section>
  );
}

function MemberRow({ member: m, first, home, actor, claimed, adminCount, open, onToggle }: { member: RosterEntry; first: boolean; home: CommunityHome; actor: Actor; claimed: boolean; adminCount: number; open: boolean; onToggle: () => void }) {
  const c = home.community;
  const refresh = useRefreshCommunity();
  const can = memberActions(actor, m, adminCount);
  const any = can.changeRole || can.changeMembership || can.remove;
  const me = m.user_id === actor.userId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(run: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const out = await run();
    setBusy(false);
    if (out.error) return setError(out.error);
    await refresh();
  }
  const row = (
    <>
      <Avatar name={m.nickname} url={m.avatar_url} size={36} />
      <View className="min-w-0 flex-1 gap-0.5">
        <RoleName nickname={m.nickname} role={m.role} membership={m.membership} colours={home.role_colours} />
        {(me || claimed) && <Muted className="text-xs">{[me ? "You" : null, claimed ? membershipClaimBadge(c.membership_label) : null].filter(Boolean).join(" · ")}</Muted>}
      </View>
      {any && <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color="#5e5d78" />}
    </>
  );
  return (
    <View className={first ? "" : "border-t border-line"} testID={`member-${m.user_id}`}>
      {any ? (
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} className={`flex-row items-center gap-3 px-3 py-2.5 ${open ? "bg-brand-soft" : "bg-surface"}`} testID="member-open">
          {row}
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-3 bg-surface px-3 py-2.5">{row}</View>
      )}
      {open && any && (
        <View className="gap-3 border-t border-line bg-bg px-3 py-3" testID="member-actions">
          {can.changeRole && (
            <View className="gap-1.5">
              <Label>Role</Label>
              <View className="flex-row flex-wrap gap-2">
                {(["admin", "committee", "regular"] as const).map((r) => (
                  <Chip key={r} active={m.role === r} onPress={() => (m.role === r || busy ? undefined : void act(() => setCommunityRole(supabase, c.id, m.user_id, r)))} testID={`role-${r}`}>{COMMUNITY_ROLE_LABELS[r]}</Chip>
                ))}
              </View>
            </View>
          )}
          {can.changeMembership && (
            <View className="flex-row flex-wrap items-center gap-2">
              {m.membership === "member" ? (
                <Button variant="ghost" className="py-2" onPress={() => void act(() => confirmMembership(supabase, c.id, m.user_id, false))} disabled={busy} testID="unconfirm-membership">Remove paying membership</Button>
              ) : (
                <Button className="py-2" onPress={() => void act(() => confirmMembership(supabase, c.id, m.user_id, true))} disabled={busy} testID="confirm-membership">Confirm paying member</Button>
              )}
            </View>
          )}
          {can.remove && (
            <LinkButton
              onPress={() => void act(() => removeCommunityMember(supabase, c.id, m.user_id))}
              confirmText={`Remove ${m.nickname} from ${c.name}? They leave its chats and can't rejoin through the link.`}
              disabled={busy}
              danger
              testID="remove-member"
            >
              {`Remove from ${c.name}`}
            </LinkButton>
          )}
          {busy && <Muted className="text-sm">Saving…</Muted>}
          <ErrorLine testID="member-error">{error}</ErrorLine>
        </View>
      )}
    </View>
  );
}

// ---- Groups ----

function GroupsSection({ home, actor }: { home: CommunityHome; actor: Actor }) {
  const c = home.community;
  const refresh = useRefreshCommunity();
  const subs = home.groups.filter((g) => g.kind === "sub");
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  return (
    <Section title="Groups" detail="Each group has its own chat. Choose who's in it. Adding yourself is shown to the group." testID="manage-groups">
      {making ? (
        <GroupForm
          submitLabel="Create group"
          busyLabel="Creating…"
          testID="manage-new-group"
          onSubmit={async (name, description) => {
            const r = await createGroup(supabase, c.id, name, description);
            if (!r.error) {
              setMaking(false);
              await refresh();
              if (r.id) setOpen(r.id);
            }
            return r;
          }}
          onCancel={() => setMaking(false)}
        />
      ) : (
        <Button variant="ghost" className="self-start" onPress={() => setMaking(true)} testID="manage-new-group-open">+ New group</Button>
      )}
      {subs.length === 0 && <Muted>No groups yet.</Muted>}
      {subs.length > 0 && (
        <View className="overflow-hidden rounded-xl border border-line">
          {subs.map((g, i) => (
            <View key={g.id} className={i > 0 ? "border-t border-line" : ""} testID={`manage-group-${g.id}`}>
              <Pressable onPress={() => setOpen(open === g.id ? null : g.id)} accessibilityRole="button" accessibilityState={{ expanded: open === g.id }} className={`flex-row items-center gap-3 px-3 py-3 ${open === g.id ? "bg-brand-soft" : "bg-surface"}`} testID="manage-group-open">
                <Icon name="people-outline" size={20} color="#DA291C" />
                <View className="min-w-0 flex-1">
                  <T variant="semibold" numberOfLines={1}>{g.name}</T>
                  <Muted className="text-xs">{plural(g.member_count, "person", "people")}{g.joined ? " · you're in it" : ""}</Muted>
                </View>
                <Icon name={open === g.id ? "chevron-up" : "chevron-down"} size={18} color="#5e5d78" />
              </Pressable>
              {open === g.id && <GroupDetail group={g} home={home} actor={actor} onArchived={() => setOpen(null)} />}
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

function GroupDetail({ group: g, home, actor, onArchived }: { group: CommunityGroup; home: CommunityHome; actor: Actor; onArchived: () => void }) {
  const c = home.community;
  const refresh = useRefreshCommunity();
  const members = useQuery({ queryKey: ["community-group-members", g.id], queryFn: () => groupMembers(supabase, g.id) });
  const roster = useQuery({ queryKey: ["community-roster", c.id], queryFn: () => communityRoster(supabase, c.id) });
  const [renaming, setRenaming] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inGroup = new Set((members.data ?? []).map((m) => m.user_id));
  const amIn = inGroup.has(actor.userId);
  const canAddMyself = !amIn && home.me?.status === "active";
  const candidates = query.trim() ? filterByNickname((roster.data ?? []).filter((m) => !inGroup.has(m.user_id)), query).slice(0, 8) : [];
  async function act(key: string, run: () => Promise<{ error?: string }>, after?: () => void) {
    setBusy(key);
    setError(null);
    const out = await run();
    setBusy(null);
    if (out.error) return setError(out.error);
    after?.();
    await refresh();
  }
  return (
    <View className="gap-4 border-t border-line bg-bg px-3 py-3" testID="manage-group-detail">
      {g.description ? <Muted className="text-sm">{g.description}</Muted> : null}
      {renaming ? (
        <GroupForm
          initial={{ name: g.name, description: g.description }}
          submitLabel="Save"
          busyLabel="Saving…"
          testID="rename-group"
          onSubmit={async (name, description) => {
            const r = await renameGroup(supabase, g.id, name, description);
            if (!r.error) {
              setRenaming(false);
              await refresh();
            }
            return r;
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <View className="flex-row flex-wrap items-center gap-4">
          <LinkButton onPress={() => setRenaming(true)} testID="rename-group-open">Rename</LinkButton>
          <LinkButton onPress={() => void act("archive", () => archiveGroup(supabase, g.id), onArchived)} confirmText={`Archive ${g.name}? It and its chat are hidden from everyone. Nothing is deleted.`} danger testID="archive-group">Archive group</LinkButton>
        </View>
      )}

      <View className="gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Label className="mb-0">In this group</Label>
          {canAddMyself && <Button variant="ghost" className="py-1.5" onPress={() => void act("me", () => addGroupMember(supabase, g.id, actor.userId))} disabled={busy === "me"} testID="manage-add-myself">{busy === "me" ? "Adding…" : "Add myself"}</Button>}
        </View>
        {members.isPending && <Muted className="text-sm">Loading…</Muted>}
        {members.data && members.data.length === 0 && <Muted className="text-sm">Nobody yet. Add people below.</Muted>}
        {(members.data ?? []).map((m) => (
          <View key={m.user_id} className="flex-row items-center gap-3" testID={`group-member-${m.user_id}`}>
            <Avatar name={m.nickname} url={m.avatar_url} size={28} />
            <View className="min-w-0 flex-1"><RoleName nickname={m.nickname} role={m.role} membership={m.membership} colours={home.role_colours} /></View>
            <LinkButton onPress={() => void act(`rm-${m.user_id}`, () => removeGroupMember(supabase, g.id, m.user_id))} confirmText={m.user_id === actor.userId ? `Leave ${g.name}?` : `Take ${m.nickname} out of ${g.name}?`} disabled={busy === `rm-${m.user_id}`} danger testID="remove-group-member">
              {m.user_id === actor.userId ? "Leave" : "Remove"}
            </LinkButton>
          </View>
        ))}
      </View>

      <View className="gap-2">
        <Label className="mb-0">Add people</Label>
        <Input value={query} onChangeText={setQuery} placeholder={`Search ${c.name} by nickname`} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search people to add" testID="group-add-search" />
        {query.trim() !== "" && candidates.length === 0 && <Muted className="text-sm">Nobody else with that nickname.</Muted>}
        {candidates.map((m) => (
          <View key={m.user_id} className="flex-row items-center gap-3" testID={`group-candidate-${m.user_id}`}>
            <Avatar name={m.nickname} url={m.avatar_url} size={28} />
            <View className="min-w-0 flex-1"><RoleName nickname={m.nickname} role={m.role} membership={m.membership} colours={home.role_colours} /></View>
            <Button variant="ghost" className="py-1.5" onPress={() => void act(`add-${m.user_id}`, () => addGroupMember(supabase, g.id, m.user_id))} disabled={busy === `add-${m.user_id}`} testID="add-to-group">{busy === `add-${m.user_id}` ? "Adding…" : "Add"}</Button>
          </View>
        ))}
      </View>
      <ErrorLine testID="group-error">{error}</ErrorLine>
    </View>
  );
}

// ---- The community's page: bio, picture, banner, name, and the colour key ----

function ProfileSection({ home, actor }: { home: CommunityHome; actor: Actor }) {
  const c = home.community;
  const refresh = useRefreshCommunity();
  const [bio, setBio] = useState(c.bio);
  const [logo, setLogo] = useState<Picked | null>(null);
  const [banner, setBanner] = useState<Picked | null>(null);
  const [imageUrl, setImageUrl] = useState(c.image_url);
  const [bannerUrl, setBannerUrl] = useState(c.banner_url);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const [name, setName] = useState(c.name);
  const [renaming, setRenaming] = useState(false);
  const [nameState, setNameState] = useState<{ error?: string; saved?: boolean }>({});

  async function save() {
    setBusy(true);
    setState({});
    type Uploaded = { url: string | null; error?: string };
    const [uploadedLogo, uploadedBanner] = await Promise.all([
      logo ? uploadCommunityImage(supabase, c.id, { bytes: logo.bytes, type: logo.type }) : Promise.resolve<Uploaded>({ url: imageUrl }),
      banner ? uploadCommunityImage(supabase, c.id, { bytes: banner.bytes, type: banner.type }) : Promise.resolve<Uploaded>({ url: bannerUrl }),
    ]);
    const uploadError = uploadedLogo.error || uploadedBanner.error;
    if (uploadError) {
      setBusy(false);
      return setState({ error: uploadError });
    }
    const r = await updateCommunityProfile(supabase, c.id, { bio, imageUrl: uploadedLogo.url, bannerUrl: uploadedBanner.url });
    setBusy(false);
    if (r.error) return setState({ error: r.error });
    setLogo(null);
    setBanner(null);
    setImageUrl(uploadedLogo.url);
    setBannerUrl(uploadedBanner.url);
    setState({ saved: true });
    await refresh();
  }
  async function rename() {
    setRenaming(true);
    setNameState({});
    const r = await updateCommunitySettings(supabase, c.id, { name });
    setRenaming(false);
    setNameState(r.error ? { error: r.error } : { saved: true });
    if (!r.error) await refresh();
  }

  const previewLogo = logo ? "chosen" : imageUrl;
  return (
    <>
      <Section title="Community page" detail="What everyone sees at the top of the community's page and its join screen." testID="manage-profile">
        <View>
          <Label>Bio</Label>
          <Input value={bio} onChangeText={(v) => { setBio(v); setState({}); }} multiline maxLength={1000} placeholder={`A few lines about ${c.name}`} className="min-h-24" style={{ textAlignVertical: "top" }} testID="community-bio-input" />
          <Muted className="mt-1 text-xs">{bio.trim().length} / 1,000</Muted>
        </View>
        <View className="flex-row items-center gap-4">
          {previewLogo === "chosen" ? (
            <View className="h-16 w-16 items-center justify-center rounded-2xl bg-ok/10"><Icon name="checkmark" size={26} color="#047857" /></View>
          ) : (
            <CommunityLogo name={c.name} url={imageUrl} size={64} />
          )}
          <View className="flex-1 gap-1.5">
            <Label className="mb-0">Picture</Label>
            <View className="flex-row flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                className="py-2"
                onPress={async () => {
                  const [picked] = await pickPhotos({ count: 1, aspect: 1, output: 512 });
                  if (picked) {
                    setLogo(picked);
                    setState({});
                  }
                }}
                testID="community-logo-pick"
              >
                {logo ? "Picture chosen" : "Choose a picture"}
              </Button>
              {(imageUrl || logo) && <LinkButton onPress={() => { setLogo(null); setImageUrl(null); setState({}); }} testID="community-logo-remove">Remove</LinkButton>}
            </View>
          </View>
        </View>
        <View className="gap-2">
          <Label className="mb-0">Banner</Label>
          {banner ? (
            <View className="w-full items-center justify-center rounded-2xl bg-ok/10" style={{ aspectRatio: 3 }}><T variant="semibold" className="text-ok">New banner chosen. Save to use it.</T></View>
          ) : (
            <CommunityBanner url={bannerUrl} testID="manage-banner-preview" />
          )}
          <View className="flex-row flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              className="py-2"
              onPress={async () => {
                const [picked] = await pickPhotos({ count: 1, aspect: 3, output: 1500 });
                if (picked) {
                  setBanner(picked);
                  setState({});
                }
              }}
              testID="community-banner-pick"
            >
              {banner ? "Banner chosen" : "Choose a banner"}
            </Button>
            {(bannerUrl || banner) && <LinkButton onPress={() => { setBanner(null); setBannerUrl(null); setState({}); }} testID="community-banner-remove">Remove</LinkButton>}
          </View>
          <Muted className="text-xs">Wide pictures work best (3 times as wide as they are tall).</Muted>
        </View>
        <ErrorLine testID="community-profile-error">{state.error ?? null}</ErrorLine>
        {state.saved && !busy && <T variant="semibold" className="text-sm text-ok" testID="community-profile-saved">Saved.</T>}
        <Button className="self-start" onPress={() => void save()} disabled={busy} testID="community-profile-save">{busy ? "Saving…" : "Save"}</Button>

        {actor.isAdmin && (
          <View className="gap-2 border-t border-line pt-4">
            <Label className="mb-0">Name</Label>
            <Muted className="text-xs">Only admins can rename {c.name}. The main chat takes the new name too.</Muted>
            <Input value={name} onChangeText={(v) => { setName(v); setNameState({}); }} maxLength={80} testID="community-name-input" />
            <ErrorLine testID="community-name-error">{nameState.error ?? null}</ErrorLine>
            {nameState.saved && !renaming && <T variant="semibold" className="text-sm text-ok" testID="community-name-saved">Renamed.</T>}
            <Button variant="ghost" className="self-start" onPress={() => void rename()} disabled={renaming || name.trim() === c.name} testID="community-rename">{renaming ? "Saving…" : "Rename"}</Button>
          </View>
        )}
      </Section>
      <ColourKey home={home} />
    </>
  );
}

// The colours names are shown in, with their tags (read only for now).
function ColourKey({ home }: { home: CommunityHome }) {
  const { dark } = useTheme();
  const rows: { key: RoleColourKey; label: string; role: CommunityRole; membership: "member" | "non_member" }[] = [
    { key: "admin", label: "Admins", role: "admin", membership: "non_member" },
    { key: "committee", label: "Committee", role: "committee", membership: "non_member" },
    { key: "member", label: "Paying members", role: "regular", membership: "member" },
    { key: "non_member", label: "Everyone else", role: "regular", membership: "non_member" },
  ];
  return (
    <Section title="Name colours" detail="In this community's chats, names are shown in these colours, with a tag so colour is never the only cue. To change them, ask the Function team." testID="manage-colours">
      <View className="gap-3">
        {rows.map((r) => {
          const colour = roleColour(home.role_colours, r.role, r.membership, dark ? "dark" : "light");
          const tag = roleTag(r.role, r.membership);
          return (
            <View key={r.key} className="flex-row items-center gap-3" testID={`colour-${r.key}`}>
              <View className="h-5 w-5 rounded-full" style={{ backgroundColor: colour }} />
              <T variant="semibold" style={{ color: colour }}>{r.label}</T>
              {tag ? <RoleTagPill tag={tag} colour={colour} /> : <Muted className="text-xs">No tag</Muted>}
            </View>
          );
        })}
      </View>
    </Section>
  );
}

function Screen({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
          <BackButton fallback={slug ? communityPath(slug) : undefined} className="mb-4" />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
