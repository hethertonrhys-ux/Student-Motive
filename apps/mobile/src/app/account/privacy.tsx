import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { loadBlockedPeople, unblockUser } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { LinkButton } from "@/components/event/panels";
import { Button, Card, Heading, Muted, Screen, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Settings → Privacy: the people you've blocked, and unblocking them.
// Blocking works both ways: you don't see each other's profiles or
// messages, and they can't find, add or message you. They aren't told.
export default function PrivacyScreen() {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const blocked = useQuery({ queryKey: ["blocked-people", myId], queryFn: () => loadBlockedPeople(supabase), enabled: !!myId });
  const [busy, setBusy] = useState<string | null>(null);

  async function unblock(id: string) {
    setBusy(id);
    await unblockUser(supabase, myId!, id);
    await queryClient.invalidateQueries();
    setBusy(null);
  }

  return (
    <Screen>
      <BackButton fallback="/(tabs)/me" />
      <Heading className="mt-3">Privacy</Heading>
      {!session ? (
        <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
          <T variant="semibold">Log in to see who you&apos;ve blocked.</T>
          <Link href={{ pathname: "/login", params: { next: "/account/privacy" } }} asChild>
            <Button>Log in</Button>
          </Link>
        </Card>
      ) : (
        <>
          <T variant="headline" className="mt-6">Blocked people</T>
          <Muted className="mt-1 text-sm">You don&apos;t see each other&apos;s profiles or messages, and they can&apos;t find, add or message you. They aren&apos;t told. You can block someone from their profile or from a chat.</Muted>
          {blocked.isPending ? (
            <Muted className="mt-4">Loading…</Muted>
          ) : blocked.isError ? (
            <Card className="mt-4"><Muted>Couldn&apos;t load the list. Go back and try again.</Muted></Card>
          ) : blocked.data.length === 0 ? (
            <Card className="mt-4" testID="no-blocked"><Muted>You haven&apos;t blocked anyone.</Muted></Card>
          ) : (
            <View className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface" testID="blocked-list">
              {blocked.data.map((p, i) => (
                <View key={p.user_id} className={`min-h-14 flex-row items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`} testID={`blocked-${p.user_id}`}>
                  <Avatar name={p.name} url={p.avatar_url} size={36} />
                  <T variant="semibold" className="flex-1" numberOfLines={1}>{p.name}</T>
                  <LinkButton onPress={() => void unblock(p.user_id)} confirmText={`Unblock ${p.name}? You'll be able to see each other again.`} disabled={busy === p.user_id} testID={`unblock-${p.user_id}`}>Unblock</LinkButton>
                </View>
              ))}
            </View>
          )}
          <Muted className="mt-6 text-sm">To report something, use Report in its ••• menu (profiles, events) or by tapping a message. The Function team reviews reports within 24 hours.</Muted>
        </>
      )}
    </Screen>
  );
}
