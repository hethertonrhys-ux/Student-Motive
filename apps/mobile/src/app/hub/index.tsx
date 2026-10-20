import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { loadMyHubSocieties, uniShort } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { BigButton, HubFrame, HubLogin, SocietyLogo } from "@/components/hub/hub-layout";
import { Icon } from "@/components/icon";
import { Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The Society Hub's front door: the societies you manage. With just one,
// it goes straight to that society's Hub; with none, it explains how to
// get your society on Function.
export default function HubIndexScreen() {
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const mine = useQuery({ queryKey: ["my-hub", userId], queryFn: () => loadMyHubSocieties(supabase, userId!), enabled: !!userId });
  const only = mine.data?.length === 1 ? mine.data[0].id : null;
  useEffect(() => {
    if (only) router.replace(`/hub/${only}` as never);
  }, [only, router]);

  return (
    <HubFrame>
      <BackButton fallback="/(tabs)/me" className="mb-6" />
      {loading ? (
        <Muted>Loading…</Muted>
      ) : !session ? (
        <HubLogin next="/hub" />
      ) : mine.isPending || only ? (
        <Muted>Loading…</Muted>
      ) : mine.isError ? (
        <Card className="gap-4 p-6">
          <Heading>Couldn&apos;t load your societies</Heading>
          <Muted>Check your connection and try again.</Muted>
          <BigButton onPress={() => void mine.refetch()} testID="hub-retry">Try again</BigButton>
        </Card>
      ) : mine.data.length === 0 ? (
        <Card className="gap-4 p-6" testID="hub-none">
          <Heading>Society Hub</Heading>
          <T className="text-base">You don&apos;t run a society on Function yet.</T>
          <Muted>If you&apos;re on a society&apos;s committee, ask to manage its page. We&apos;ll check with you and set you up.</Muted>
          <Link href={"/dashboard/claim" as never} asChild>
            <BigButton testID="hub-claim">Ask to manage a society</BigButton>
          </Link>
        </Card>
      ) : (
        <>
          <Heading>Society Hub</Heading>
          <Muted className="mt-1">The societies you run on Function.</Muted>
          <View className="mt-6 gap-3" testID="hub-societies">
            {mine.data.map((s) => (
              <Link key={s.id} href={`/hub/${s.id}` as never} asChild>
                <Pressable className="min-h-[72px] flex-row items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4 active:opacity-90" testID={`hub-society-${s.id}`}>
                  <SocietyLogo name={s.name} url={s.logo_url} size={48} />
                  <View className="min-w-0 flex-1">
                    <T variant="semibold" className="text-base" numberOfLines={2}>{s.name}</T>
                    <Muted className="text-sm">{uniShort(s.university)}{s.onboarded_at ? "" : " · Finish setting up"}</Muted>
                  </View>
                  <Icon name="chevron-forward" size={18} color="#5e5d78" />
                </Pressable>
              </Link>
            ))}
          </View>
        </>
      )}
    </HubFrame>
  );
}
