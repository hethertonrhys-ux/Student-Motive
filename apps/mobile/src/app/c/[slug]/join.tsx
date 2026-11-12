import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  communityJoinPath,
  communityPath,
  communityView,
  defaultJoinNickname,
  joinRef,
  membershipClaimLabel,
  requestToJoinCommunity,
  validateNickname,
  type CommunityCard,
  type CommunityHome,
} from "@function/shared";
import { BackButton } from "@/components/back-button";
import { CommunityHeader } from "@/components/community/community-header";
import { useCommunityHome, useCommunityPublic, useRefreshCommunity } from "@/components/community/use-community";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { communityRef } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// A community's join screen (/c/<slug>/join): where its link and QR code
// lead. It shows the community's banner, picture and name (even logged
// out), then a nickname (from your profile nickname, else your first name;
// it's the name people see in the community's chats) and the box "I'm a
// paying member of …", and sends a request for an admin or committee member
// to approve. Logged out, it asks you to log in or sign up first and brings
// you back here. ?ref=<user id> (who shared the link) is kept on this
// device until the request is sent. Someone already in goes straight to the
// community's page; someone removed is told they can't rejoin.
export default function JoinCommunityScreen() {
  const { slug: raw, ref: refParam } = useLocalSearchParams<{ slug: string; ref?: string }>();
  const slug = typeof raw === "string" ? raw.toLowerCase() : "";
  const router = useRouter();
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;
  const card = useCommunityPublic(slug);
  const home = useCommunityHome(slug);
  const [ref, setRef] = useState<string | null>(joinRef(refParam));
  const [sent, setSent] = useState(false);

  // Keep who shared the link, so it survives logging in or signing up.
  useEffect(() => {
    if (!slug) return;
    const given = joinRef(refParam);
    if (given) void communityRef.set(slug, given);
    else void communityRef.get(slug).then((saved) => saved && setRef(saved));
  }, [slug, refParam]);

  const view = home.data ? communityView(home.data.me) : null;
  // Already in: straight to the community's page.
  useEffect(() => {
    if (view === "active" && !sent) router.replace(communityPath(slug) as never);
  }, [view, sent, slug, router]);

  if (loading || card.isPending || (userId && home.isPending)) return <Screen><Muted>Loading…</Muted></Screen>;
  const c = card.data;
  if (!c) {
    return (
      <Screen>
        {card.isError ? (
          <>
            <Heading>Couldn&apos;t load this community</Heading>
            <Muted className="mt-2">Check your connection and try again.</Muted>
            <Button className="mt-6 self-start" onPress={() => void card.refetch()} testID="join-retry">Try again</Button>
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

  const header = <CommunityHeader community={c}>{!!c.bio && <T className="mt-3 text-base leading-6" numberOfLines={4}>{c.bio}</T>}</CommunityHeader>;

  if (!userId) {
    const next = communityJoinPath(c.slug);
    return (
      <Screen>
        {header}
        <Card className="mt-6 gap-3" testID="join-logged-out">
          <T variant="headline">Log in or sign up to join {c.name}</T>
          <Muted>Use your uni email. You&apos;ll come straight back here to choose your nickname and send your request.</Muted>
          {/* Replace, not push: logging in comes back to a fresh join screen, so
              this one mustn't stay underneath it. */}
          <View className="flex-row flex-wrap gap-2">
            <Link replace href={{ pathname: "/login", params: { next, mode: "signup" } } as never} asChild>
              <Button testID="join-signup">Sign up</Button>
            </Link>
            <Link replace href={{ pathname: "/login", params: { next } } as never} asChild>
              <Button variant="ghost" testID="join-login">Log in</Button>
            </Link>
          </View>
        </Card>
      </Screen>
    );
  }

  if (!home.data) {
    return (
      <Screen>
        {header}
        <Card className="mt-6 gap-3">
          <Muted>Couldn&apos;t load your request. Check your connection and try again.</Muted>
          <Button className="self-start" onPress={() => void home.refetch()} testID="join-retry">Try again</Button>
        </Card>
      </Screen>
    );
  }

  if (view === "removed") {
    return (
      <Screen>
        {header}
        <Card className="mt-6 gap-2" testID="join-removed">
          <T variant="headline">You&apos;ve been removed from {c.name}</T>
          <Muted>You can&apos;t rejoin through the link. If you think this is a mistake, talk to its committee.</Muted>
        </Card>
      </Screen>
    );
  }

  if (view === "active" && !sent) return <Screen><Muted>Opening {c.name}…</Muted></Screen>;

  if (sent || view === "pending") {
    return (
      <Screen>
        {header}
        <Card className="mt-6 gap-3" testID="join-sent">
          <View className="flex-row items-center gap-2">
            <Icon name="checkmark-circle" size={24} color="#047857" />
            <T variant="headline">{sent ? "Request sent" : "You've asked to join"}</T>
          </View>
          <Muted>An admin or committee member of {c.name} will approve it. You can chat with everyone once they have.</Muted>
          <Link replace href={communityPath(c.slug) as never} asChild>
            <Button className="self-start" testID="join-go-to-community">Go to {c.name}</Button>
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <JoinForm
        card={c}
        home={home.data}
        refId={ref && ref !== userId ? ref : null}
        onSent={() => {
          setSent(true);
          void communityRef.set(c.slug, null);
        }}
        onActive={() => router.replace(communityPath(c.slug) as never)}
      />
    </Screen>
  );
}

function JoinForm({ card, home, refId, onSent, onActive }: { card: CommunityCard; home: CommunityHome; refId: string | null; onSent: () => void; onActive: () => void }) {
  const { profile } = useProfile();
  const refresh = useRefreshCommunity();
  // Your nickname from before (if you asked once already), else from your profile.
  const initial = home.me?.nickname || defaultJoinNickname(profile);
  const [typed, setTyped] = useState<string | null>(null);
  const nickname = typed ?? initial;
  const [claims, setClaims] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const checked = validateNickname(nickname);
  const showProblem = !checked.ok && (tried || nickname.length > 0);
  const claimLabel = membershipClaimLabel(card.name, home.community.membership_label);

  async function send() {
    setTried(true);
    setError(null);
    if (!checked.ok) return;
    setBusy(true);
    const r = await requestToJoinCommunity(supabase, card.slug, { nickname: checked.nickname, claimsMembership: claims, ref: refId });
    setBusy(false);
    if (r.error) return setError(r.error);
    await refresh();
    if (r.status === "active") onActive();
    else onSent();
  }

  return (
    <Card className="mt-6 gap-5" testID="join-form">
      <T variant="headline">Ask to join {card.name}</T>
      <View>
        <Label>Nickname</Label>
        <Input
          value={nickname}
          onChangeText={(v) => {
            setTyped(v);
            setError(null);
          }}
          maxLength={40}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="What should people call you?"
          onSubmitEditing={() => void send()}
          accessibilityLabel="Nickname"
          testID="join-nickname"
        />
        <Muted className="mt-1.5 text-sm">This is the name people see in {card.name}&apos;s chats.</Muted>
        {showProblem && !checked.ok && <T variant="semibold" className="mt-1.5 text-sm text-danger" testID="join-nickname-problem">{checked.error}</T>}
        {error && <T variant="semibold" className="mt-1.5 text-sm text-danger" testID="join-error">{error}</T>}
      </View>
      <Pressable
        onPress={() => setClaims(!claims)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: claims }}
        aria-checked={claims}
        className="flex-row items-center gap-3"
        testID="join-claim"
      >
        <View className={`h-6 w-6 items-center justify-center rounded-md border ${claims ? "border-brand bg-brand" : "border-line bg-surface"}`}>
          {claims && <Icon name="checkmark" size={16} color="#ffffff" />}
        </View>
        <T variant="semibold" className="flex-1">{claimLabel}</T>
      </Pressable>
      <Button onPress={() => void send()} disabled={busy} testID="join-send">{busy ? "Sending…" : "Request to join"}</Button>
      <Muted className="text-xs">An admin or committee member approves each request.{claims ? " Only an admin can confirm a paying member." : ""}</Muted>
    </Card>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
          <BackButton className="mb-4" />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
