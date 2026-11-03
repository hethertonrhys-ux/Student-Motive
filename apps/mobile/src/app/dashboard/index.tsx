import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadDashboard } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The committee's home: societies you run, and your requests to manage one.
// Someone who doesn't run one sees how to ask, not an empty list.
export default function DashboardScreen() {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const data = useQuery({ queryKey: ["dashboard", myId], queryFn: () => loadDashboard(supabase, myId!), enabled: !!myId });
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10">
        <BackButton fallback={"/(tabs)/societies"} />
        <Heading className="mt-3">Society dashboard</Heading>
        {!myId ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to manage your society.</T>
            <Link href={{ pathname: "/login", params: { next: "/dashboard" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : !data.data ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : (
          <>
            {data.data.societies.length > 0 ? (
              <>
                <T variant="display" className="mt-8 text-xl">Societies you run</T>
                <View className="mt-3 gap-3" testID="run-list">
                  {data.data.societies.map((s) => (
                    <Link key={s.id} href={`/dashboard/${s.id}` as never} asChild>
                      <Pressable testID={`manage-${s.id}`}>
                        <Card className="flex-row items-center justify-between gap-4">
                          <View className="flex-1 flex-row items-center gap-3">
                            <Avatar name={s.name} url={s.logo_url} size={36} />
                            <T variant="display-bold" className="flex-1 text-lg" numberOfLines={1}>{s.name}</T>
                          </View>
                          <T variant="semibold" className="text-sm text-brand">Manage →</T>
                        </Card>
                      </Pressable>
                    </Link>
                  ))}
                </View>
              </>
            ) : (
              // Not managing a society (yet): how to get set up, not an empty list.
              <Card className="mt-6 gap-2" testID="run-none">
                <T variant="semibold">You don&apos;t run a society on Function yet.</T>
                <Muted>On a committee? Ask to manage your society&apos;s page and we&apos;ll approve it once we&apos;ve checked.</Muted>
              </Card>
            )}
            {data.data.claims.length > 0 && (
              <View className="mt-8">
                <T variant="display" className="text-lg">Your requests</T>
                <View className="mt-3 gap-2">
                  {data.data.claims.map((c) => (
                    <View key={c.id} className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3" testID={`claim-${c.id}`}>
                      <T>{c.societies?.name}</T>
                      <View className={`rounded-full px-2.5 py-0.5 ${c.status === "pending" ? "bg-brand-soft" : "bg-danger/10"}`}>
                        <T variant="bold" className={`text-xs ${c.status === "pending" ? "text-brand" : "text-danger"}`}>{c.status === "pending" ? "Waiting for approval" : "Not approved"}</T>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
            <Link href={"/dashboard/claim" as never} asChild>
              <Button variant="ghost" className="mt-8 self-start" testID="claim-link">+ Request to manage a society</Button>
            </Link>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
