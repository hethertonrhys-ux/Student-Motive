import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  addGroupMember,
  communityJoinPath,
  communityManagePath,
  communityTabs,
  communityView,
  COMMUNITY_TAB_LABELS,
  createGroup,
  isCommunityManager,
  leaveCommunity,
  membershipClaimLabel,
  updateMyNickname,
  validateNickname,
  type CommunityGroup,
  type CommunityHome,
  type CommunityTab,
} from "@function/shared";
import { BackButton } from "@/components/back-button";
import { CommunityChatTab } from "@/components/community/community-chat-tab";
import { CommunityHeader } from "@/components/community/community-header";
import { GroupForm } from "@/components/community/group-form";
import { TicketsComingSoon } from "@/components/community/tickets-coming-soon";
import { useChatList, useCommunityHome, useCommunityPublic, useRefreshCommunity } from "@/components/community/use-community";
import { LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { usePullToRefresh, useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// A community's page (/c/<slug>): its banner, picture, name and bio, then
// tabs: Chat (the community's main chat), Groups (the sub-groups you're in;
// admins and committee see them all and can add themselves or make a new
// one), Tickets (coming soon) and Manage (admins and committee). Someone not
// in the community sees where they stand instead: waiting for approval,
// turned down, left, removed, or a Join button. Logged out, it's the public
// card and "Log in to join". The database decides what anyone may see or do.
export default function CommunityScreen() {
  const { slug: raw, tab: tabParam } = useLocalSearchParams<{ slug: string; tab?: string }>();
  const slug = typeof raw === "string" ? raw.toLowerCase() : "";
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;
  const home = useCommunityHome(slug);
  const card = useCommunityPublic(slug, !loading && !userId);
  const chats = useChatList();
  // Back from Manage, a chat or the join screen: show what changed.
  useRefetchOnFocus(home);
  useRefetchOnFocus(chats);
  const refresh = useRefreshCommunity();
  const pull = usePullToRefresh(() => refresh());

  if (loading || (userId ? home.isPending : card.isPending)) return <Screen><Muted>Loading…</Muted></Screen>;

  // Logged out: the public card, then log in (or sign up) and come back to the join screen.
  if (!userId) {
    const c = card.data;
    if (!c) return <NotFound failed={card.isError} retry={() => void card.refetch()} />;
    return (
      <Screen>
        <CommunityHeader community={c}>{!!c.bio && <T className="mt-3 text-base leading-6" testID="community-bio">{c.bio}</T>}</CommunityHeader>
        <Card className="mt-6 gap-3" testID="community-logged-out">
          <T variant="headline">Log in to join {c.name}</T>
          <Muted>Chat with everyone in {c.name} on Function. Log in or sign up with your uni email, then ask to join.</Muted>
          <View className="flex-row flex-wrap gap-2">
            <Link href={{ pathname: "/login", params: { next: communityJoinPath(c.slug) } } as never} asChild>
              <Button testID="community-login">Log in to join</Button>
            </Link>
            <Link href={{ pathname: "/login", params: { next: communityJoinPath(c.slug), mode: "signup" } } as never} asChild>
              <Button variant="ghost" testID="community-signup">Sign up</Button>
            </Link>
          </View>
        </Card>
      </Screen>
    );
  }

  const h = home.data;
  if (!h) return <NotFound failed={home.isError} retry={() => void home.refetch()} />;
  return (
    <Screen refresh={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
      <CommunityBody home={h} userId={userId} chats={chats.data?.threads ?? []} initialTab={tabParam} />
    </Screen>
  );
}

function CommunityBody({ home, userId, chats, initialTab }: { home: CommunityHome; userId: string; chats: NonNullable<ReturnType<typeof useChatList>["data"]>["threads"]; initialTab?: string }) {
  const router = useRouter();
  const refresh = useRefreshCommunity();
  const c = home.community;
  const view = communityView(home.me);
  const manager = isCommunityManager(home.me) || home.is_function_admin;
  const tabs = communityTabs(home);
  const [tab, setTab] = useState<CommunityTab>(tabs.includes(initialTab as CommunityTab) && initialTab !== "manage" ? (initialTab as CommunityTab) : "chat");
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const main = home.groups.find((g) => g.kind === "main");
  const mainChat = main ? (chats.find((t) => t.id === main.thread_id) ?? null) : null;
  const showTabs = view === "active" || home.is_function_admin;

  async function leave() {
    setLeaveError(null);
    const r = await leaveCommunity(supabase, c.id);
    if (r.error) return setLeaveError(r.error);
    await refresh();
  }

  return (
    <>
      <CommunityHeader community={c}>
        {c.bio ? (
          <T className="mt-3 text-base leading-6" testID="community-bio">{c.bio}</T>
        ) : manager ? (
          <View className="mt-2 flex-row flex-wrap items-center gap-x-2" testID="community-bio-empty">
            <Muted>No bio yet.</Muted>
            <Link href={communityManagePath(c.slug) as never} asChild>
              <Pressable hitSlop={8} testID="add-bio"><T variant="semibold" className="text-brand">Add one in Manage</T></Pressable>
            </Link>
          </View>
        ) : null}
      </CommunityHeader>

      {view !== "active" && <StandingCard home={home} />}

      {showTabs && (
        <>
          <View className="mt-6 flex-row rounded-2xl border border-line bg-surface p-1" accessibilityRole="tablist">
            {tabs.map((key) => {
              const selected = tab === key;
              const badge = key === "manage" ? (home.pending_requests ?? 0) : 0;
              return (
                <Pressable
                  key={key}
                  onPress={() => (key === "manage" ? router.push(communityManagePath(c.slug) as never) : setTab(key))}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  // Sized by their words (then sharing what's left), so "Manage" and its count fit on a phone.
                  style={{ flexGrow: 1, flexBasis: "auto" }}
                  className={`min-h-11 flex-row items-center justify-center gap-1 rounded-xl px-2 ${selected ? "bg-brand" : ""}`}
                  testID={`community-tab-${key}`}
                >
                  <T variant="bold" className={`text-sm ${selected ? "text-brand-ink" : "text-muted"}`} numberOfLines={1}>{COMMUNITY_TAB_LABELS[key]}</T>
                  {badge > 0 && (
                    <View className="min-w-5 items-center rounded-full bg-live px-1.5" testID="manage-requests-badge">
                      <T variant="bold" className="text-xs leading-5 text-white">{badge}</T>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <View className="mt-4">
            {tab === "chat" && <CommunityChatTab community={c} group={view === "active" ? main : undefined} chat={mainChat} myId={userId} />}
            {tab === "groups" && <GroupsTab home={home} userId={userId} manager={manager} />}
            {tab === "tickets" && <TicketsComingSoon name={c.name} />}
          </View>
        </>
      )}

      {view === "active" && (
        <View className="mt-10 items-start gap-2">
          <LinkButton onPress={() => void leave()} confirmText={`Leave ${c.name}? You'll leave its chats too, and need approval to come back.`} danger testID="leave-community">{`Leave ${c.name}`}</LinkButton>
          {leaveError && <T variant="semibold" className="text-sm text-danger" testID="leave-community-error">{leaveError}</T>}
        </View>
      )}
    </>
  );
}

// Where someone not (or not yet) in the community stands.
function StandingCard({ home }: { home: CommunityHome }) {
  const c = home.community;
  const me = home.me;
  const view = communityView(me);
  const join = (label: string, testID: string) => (
    <Link href={communityJoinPath(c.slug) as never} asChild>
      <Button className="self-start" testID={testID}>{label}</Button>
    </Link>
  );
  if (view === "pending" && me) return <PendingCard home={home} />;
  if (view === "removed") {
    return (
      <Card className="mt-6 gap-2" testID="community-removed">
        <T variant="headline">You&apos;ve been removed from {c.name}</T>
        <Muted>If you think this is a mistake, talk to its committee.</Muted>
      </Card>
    );
  }
  if (view === "declined" || view === "left") {
    return (
      <Card className="mt-6 gap-3" testID={`community-${view}`}>
        <T variant="headline">{view === "declined" ? "Your request wasn't approved" : `You left ${c.name}`}</T>
        <Muted>{view === "declined" ? "You can ask to join again." : "You can ask to join again at any time."}</Muted>
        {join("Request to join again", "request-again")}
      </Card>
    );
  }
  return (
    <Card className="mt-6 gap-3" testID="community-not-member">
      <T variant="headline">Join {c.name}</T>
      <Muted>Ask to join to chat with everyone in {c.name}. An admin or committee member approves each request.</Muted>
      {join(`Join ${c.name}`, "join-community")}
    </Card>
  );
}

// Waiting for approval: your nickname and claim, with a way to change the
// nickname or withdraw the request.
function PendingCard({ home }: { home: CommunityHome }) {
  const refresh = useRefreshCommunity();
  const c = home.community;
  const me = home.me!;
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(me.nickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = validateNickname(nickname);
  async function save() {
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    setError(null);
    const r = await updateMyNickname(supabase, c.id, checked.nickname);
    setBusy(false);
    if (r.error) return setError(r.error);
    setEditing(false);
    await refresh();
  }
  async function withdraw() {
    setError(null);
    const r = await leaveCommunity(supabase, c.id);
    if (r.error) return setError(r.error);
    await refresh();
  }
  return (
    <Card className="mt-6 gap-3" testID="community-pending">
      <View className="flex-row items-center gap-2">
        <Icon name="time-outline" size={22} color="#DA291C" />
        <T variant="headline">Waiting for approval</T>
      </View>
      <Muted>
        You&apos;ve asked to join {c.name} as <T variant="semibold" testID="pending-nickname">{me.nickname}</T>. An admin or committee member will approve it.
      </Muted>
      {me.membership_claimed && <Muted className="text-sm" testID="pending-claim">You ticked &ldquo;{membershipClaimLabel(c.name, c.membership_label)}&rdquo;. Only an admin can confirm it.</Muted>}
      {editing ? (
        <View className="gap-2">
          <Input value={nickname} onChangeText={(v) => { setNickname(v); setError(null); }} maxLength={40} autoCapitalize="words" autoCorrect={false} accessibilityLabel="Nickname" testID="pending-nickname-input" />
          {!checked.ok && nickname.length > 0 && !error && <T variant="semibold" className="text-sm text-danger">{checked.error}</T>}
          {error && <T variant="semibold" className="text-sm text-danger" testID="pending-error">{error}</T>}
          <View className="flex-row flex-wrap gap-2">
            <Button onPress={() => void save()} disabled={busy} testID="pending-nickname-save">{busy ? "Saving…" : "Save nickname"}</Button>
            <Button variant="ghost" onPress={() => { setEditing(false); setNickname(me.nickname); setError(null); }} disabled={busy}>Cancel</Button>
          </View>
        </View>
      ) : (
        <>
          {error && <T variant="semibold" className="text-sm text-danger" testID="pending-error">{error}</T>}
          <View className="flex-row flex-wrap items-center gap-4">
            <LinkButton onPress={() => setEditing(true)} testID="change-nickname">Change nickname</LinkButton>
            <LinkButton onPress={() => void withdraw()} confirmText={`Withdraw your request to join ${c.name}?`} danger testID="withdraw-request">Withdraw request</LinkButton>
          </View>
        </>
      )}
    </Card>
  );
}

// The sub-groups: the ones you're in open their chat. Admins and committee
// see every group, can add themselves (the group sees "<name> joined the
// group") and make new ones.
function GroupsTab({ home, userId, manager }: { home: CommunityHome; userId: string; manager: boolean }) {
  const refresh = useRefreshCommunity();
  const c = home.community;
  const active = communityView(home.me) === "active";
  const subs = home.groups.filter((g) => g.kind === "sub");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function addMyself(g: CommunityGroup) {
    setBusy(g.id);
    setError(null);
    const r = await addGroupMember(supabase, g.id, userId);
    setBusy(null);
    if (r.error) return setError(r.error);
    await refresh();
  }
  return (
    <View className="gap-3" testID="community-groups">
      {manager && (
        adding ? (
          <Card>
            <GroupForm
              submitLabel="Create group"
              busyLabel="Creating…"
              testID="new-group"
              onSubmit={async (name, description) => {
                const r = await createGroup(supabase, c.id, name, description);
                if (!r.error) {
                  setAdding(false);
                  await refresh();
                }
                return r;
              }}
              onCancel={() => setAdding(false)}
            />
          </Card>
        ) : (
          <Button variant="ghost" className="self-start" onPress={() => setAdding(true)} testID="new-group-open">+ New group</Button>
        )
      )}
      {error && <T variant="semibold" className="text-sm text-danger" testID="groups-error">{error}</T>}
      {subs.length === 0 ? (
        <Card testID="groups-empty">
          <Muted>{manager ? "No groups yet. Make one with New group." : "You're not in any groups yet. Admins and committee add people to groups."}</Muted>
        </Card>
      ) : (
        <View className="overflow-hidden rounded-2xl border border-line bg-surface">
          {subs.map((g, i) => {
            const row = (
              <>
                <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
                  <Icon name="people" size={22} color="#DA291C" />
                </View>
                <View className="min-w-0 flex-1">
                  <T variant="semibold" numberOfLines={1}>{g.name}</T>
                  <Muted className="text-xs" numberOfLines={2}>{g.member_count} {g.member_count === 1 ? "person" : "people"}{g.description ? ` · ${g.description}` : ""}</Muted>
                </View>
              </>
            );
            const border = i > 0 ? "border-t border-line" : "";
            return g.joined ? (
              <Link key={g.id} href={`/chats/${g.thread_id}` as never} asChild>
                <Pressable className={`flex-row items-center gap-3 px-4 py-3 active:opacity-80 ${border}`} accessibilityRole="link" testID={`group-${g.id}`}>
                  {row}
                  <Icon name="chevron-forward" size={18} color="#5e5d78" />
                </Pressable>
              </Link>
            ) : (
              <View key={g.id} className={`flex-row items-center gap-3 px-4 py-3 ${border}`} testID={`group-${g.id}`}>
                {row}
                {active && (
                  <Button variant="ghost" className="py-1.5" onPress={() => void addMyself(g)} disabled={busy === g.id} testID="add-myself">{busy === g.id ? "Adding…" : "Add myself"}</Button>
                )}
              </View>
            );
          })}
        </View>
      )}
      {manager && subs.some((g) => !g.joined) && <Muted className="text-xs">You can see every group because you run {c.name}. Adding yourself is shown to the group.</Muted>}
    </View>
  );
}

function NotFound({ failed, retry }: { failed: boolean; retry: () => void }) {
  return (
    <Screen>
      {failed ? (
        <>
          <Heading>Couldn&apos;t load this community</Heading>
          <Muted className="mt-2">Check your connection and try again.</Muted>
          <Button className="mt-6 self-start" onPress={retry} testID="community-retry">Try again</Button>
        </>
      ) : (
        <>
          <Heading testID="community-not-found">Community not found</Heading>
          <Muted className="mt-2">Check the link, or ask whoever sent it for a new one.</Muted>
        </>
      )}
    </Screen>
  );
}

function Screen({ children, refresh }: { children: ReactNode; refresh?: React.ReactElement<React.ComponentProps<typeof RefreshControl>> }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled" refreshControl={refresh}>
        <BackButton className="mb-4" />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
