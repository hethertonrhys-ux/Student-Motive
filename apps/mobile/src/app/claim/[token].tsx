import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { accountDetailsMissing, afterClaimHref, claimLinkInfo, redeemClaimLink, uniById, type ClaimLinkInfo } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { MailLink } from "@/components/landing";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { SUPPORT_EMAIL } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// A society's claim link, sent by the Function team (usually in an
// Instagram DM). Logged out, it shows the society and asks you to log in or
// sign up with your uni email, then brings you back here. Logged in, it
// makes you the society's manager straight away and opens its dashboard.
// Links that were used, have expired or were cancelled say so kindly.
// A Function admin opening a ready link (e.g. checking it after sending it)
// isn't made the manager unless they choose to be, so the link isn't used up.
export default function ClaimLinkScreen() {
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = typeof raw === "string" ? raw : "";
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const focused = useIsFocused();
  const queryClient = useQueryClient();
  const info = useQuery({ queryKey: ["claim-link", token, userId], queryFn: () => claimLinkInfo(supabase, token), enabled: !loading });
  const [error, setError] = useState<string | null>(null);

  const { mutate: claim, isPending: claiming } = useMutation({
    mutationFn: () => redeemClaimLink(supabase, token),
    onSuccess: async (r) => {
      if (r.error || !r.societyId) return setError(r.error ?? "Couldn't claim it. Try again.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["managed", r.societyId] }),
        queryClient.invalidateQueries({ queryKey: ["membership", r.societyId] }),
        queryClient.invalidateQueries({ queryKey: ["societies-tab"] }),
        // What this link says has changed (it's used now): any later visit asks again.
        queryClient.invalidateQueries({ queryKey: ["claim-link", token], refetchType: "none" }),
      ]);
      router.replace(afterClaimHref(r.societyId) as never);
    },
    onError: () => setError("Couldn't claim it. Try again."),
  });

  // Logged in and the link is yours to use: claim it once, straight away.
  // The ref stops a second claim if the screen renders or mounts again.
  // Not before the profile has loaded: an account with details missing is
  // first sent to fill them in (and comes back here), and a Function admin
  // has to choose to claim a link that is still ready. Only while this page
  // is the one on screen, so a copy left underneath another page never
  // claims too.
  const status = info.data?.status;
  const adminHolding = !!profile?.is_admin && status === "ready";
  const claimable = focused && !!userId && !profileLoading && !accountDetailsMissing(profile) && !adminHolding && (status === "ready" || status === "used_by_you");
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!claimable) return;
    const key = `${token}:${userId}`;
    if (started.current === key) return;
    started.current = key;
    claim();
  }, [claimable, token, userId, claim]);

  if (loading || info.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  if (info.isError || !info.data) {
    return (
      <Screen>
        <Heading>Couldn&apos;t load this link</Heading>
        <Muted className="mt-2">Check your connection and try again.</Muted>
        <Button onPress={() => void info.refetch()} className="mt-6 py-3.5" testID="claim-reload">Try again</Button>
      </Screen>
    );
  }
  const d = info.data;
  const mail = <MailLink email={SUPPORT_EMAIL} />;

  if (d.status === "unknown") return <Closed info={d} title="This link isn't valid">Ask the person who sent it for a new one.</Closed>;
  if (d.status === "revoked") return <Closed info={d} title="This link has been cancelled">Ask the person who sent it for a new one.</Closed>;
  if (d.status === "expired") return <Closed info={d} title="This link has expired">Claim links last 7 days. Ask us for a new one: {mail}</Closed>;
  if (d.status === "used") {
    // Logged out, it may be your own link (opened on another device): logging
    // in brings you back here, and then it opens your dashboard.
    const login = !userId ? (
      <Link replace href={{ pathname: "/login", params: { next: `/claim/${token}` } }} asChild>
        <Button variant="ghost" className="mt-6 py-3.5" testID="claim-used-login">Claimed it yourself? Log in</Button>
      </Link>
    ) : undefined;
    return <Closed info={d} title="This link has already been used" action={login}>Someone has already claimed this society with it. If that wasn&apos;t someone on your committee, email us: {mail}</Closed>;
  }

  const name = d.society_name ?? "Your society";
  if (userId && adminHolding && !claiming && !error) {
    return (
      <Screen>
        <SocietyBadge info={d} />
        <Heading className="mt-5" testID="claim-society-name">{name}</Heading>
        <T className="mt-3 text-base" testID="claim-admin">This link is ready to use. You&apos;re a Function admin, so it hasn&apos;t been used: opening it as yourself would make you the society&apos;s manager and use the link up.</T>
        <Button variant="ghost" onPress={() => claim()} className="mt-6 py-3.5" testID="claim-anyway">Claim it myself</Button>
      </Screen>
    );
  }
  if (!userId) {
    return (
      <Screen>
        <SocietyBadge info={d} />
        <Heading className="mt-5" testID="claim-society-name">{name} is on Function</Heading>
        <T className="mt-3 text-base">Log in or sign up with your uni email to claim it. You&apos;ll be set up as the society&apos;s manager straight away.</T>
        {/* Replace, not push: this page mustn't stay underneath login and
            claim the link a second time once you've logged in. */}
        <Link replace href={{ pathname: "/login", params: { next: `/claim/${token}` } }} asChild>
          <Button className="mt-8 py-3.5" testID="claim-login">Log in to claim it</Button>
        </Link>
        <Muted className="mt-4 text-sm">The link works once: whoever uses it first becomes the manager, so keep it within your committee.</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <SocietyBadge info={d} />
      <Heading className="mt-5" testID="claim-society-name">{name}</Heading>
      {error ? (
        <View className="mt-4 gap-4">
          <T variant="semibold" className="text-base text-danger" testID="claim-error">{error}</T>
          {error === "Couldn't claim it. Try again." && (
            <Button onPress={() => { setError(null); claim(); }} disabled={claiming} className="py-3.5" testID="claim-retry">Try again</Button>
          )}
          {error !== "Couldn't claim it. Try again." && <Muted>Ask the person who sent it for a new one, or email us: {mail}</Muted>}
        </View>
      ) : (
        <Muted className="mt-3 text-base" testID="claim-working">Setting you up…</Muted>
      )}
    </Screen>
  );
}

// A link that can't be used any more (or never could), with an optional
// button underneath.
function Closed({ info, title, children, action }: { info: ClaimLinkInfo; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Screen>
      {info.society_name && <SocietyBadge info={info} />}
      <Heading className={info.society_name ? "mt-5" : ""} testID="claim-status">{title}</Heading>
      <T className="mt-3 text-base">{children}</T>
      {action}
    </Screen>
  );
}

// The society's logo (or initials) and its uni.
function SocietyBadge({ info }: { info: ClaimLinkInfo }) {
  const name = info.society_name ?? "Society";
  const uni = uniById(info.university);
  return (
    <View className="flex-row items-center gap-3">
      <Avatar name={name} url={info.logo_url} size={56} />
      <View className="min-w-0 flex-1">
        <T variant="bold" numberOfLines={2}>{name}</T>
        {uni && <Muted className="text-sm" numberOfLines={1}>{uni.name}</Muted>}
      </View>
    </View>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-md px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback="/" className="mb-6" />
        <Card className="p-6" testID="claim-page">{children}</Card>
      </ScrollView>
    </SafeAreaView>
  );
}
