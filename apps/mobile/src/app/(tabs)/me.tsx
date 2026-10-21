import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { countMyManagedSocieties, countOpenReports, uniShort } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { disablePushOnThisDevice } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Your own corner: who you're logged in as, your profile, friends,
// notifications, the Society Hub (if you run a society), and the way out.
export default function MeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  // Reports waiting for the Function team (admins only), so they're dealt with quickly.
  const openReports = useQuery({ queryKey: ["open-reports"], queryFn: () => countOpenReports(supabase), enabled: !!profile?.is_admin, staleTime: 60_000 });
  // How many societies you manage (a count only), for the Society Hub row.
  const userId = session?.user.id ?? null;
  const managed = useQuery({ queryKey: ["my-hub-count", userId], queryFn: () => countMyManagedSocieties(supabase, userId!), enabled: !!userId, staleTime: 60_000 });

  async function logOut() {
    await disablePushOnThisDevice();
    await supabase.auth.signOut();
    queryClient.clear();
    router.replace("/");
  }

  const rows: { href: string; icon: React.ComponentProps<typeof Icon>["name"]; title: string; detail: string; testID: string }[] = [
    { href: `/u/${session?.user.id}`, icon: "person-circle-outline", title: "My profile", detail: "How other students see you", testID: "my-profile" },
    { href: "/account", icon: "create-outline", title: "Edit profile", detail: "Photos, prompts, name, nickname and course", testID: "edit-profile" },
    { href: "/account/security", icon: "lock-closed-outline", title: "Password & security", detail: "Set a password, two-factor authentication", testID: "security" },
    { href: "/account/notifications", icon: "notifications-circle-outline", title: "Notification settings", detail: "Choose what Function tells you about", testID: "notification-settings" },
    { href: "/friends", icon: "people-outline", title: "Friends", detail: "Requests, people you may know", testID: "friends" },
    { href: "/notifications", icon: "notifications-outline", title: "Notifications", detail: "What's happened lately", testID: "notifications" },
    { href: "/support", icon: "help-circle-outline", title: "Help & support", detail: "Email us, report a problem", testID: "support" },
    { href: "/privacy", icon: "document-text-outline", title: "Privacy & terms", detail: "How Function uses your data", testID: "privacy" },
    ...(managed.data ? [{ href: "/hub", icon: "briefcase-outline" as const, title: "Society Hub", detail: managed.data === 1 ? "Run your society: setup, features, committee" : `Run your ${managed.data} societies: setup, features, committee`, testID: "society-hub" }] : []),
    ...(profile?.is_admin ? [{ href: "/admin", icon: "shield-checkmark-outline" as const, title: "Admin panel", detail: openReports.data ? `${openReports.data} ${openReports.data === 1 ? "report" : "reports"} waiting` : "Function team: users, events, reports", testID: "admin-panel" }] : []),
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8">
        <Heading>Me</Heading>
        {!session ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to see your profile.</T>
            <Link href="/login" asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : profile ? (
          <>
            <Card className="mt-6 items-center gap-3">
              <Avatar name={profile.display_name || "You"} size={88} />
              <View className="items-center">
                <View className="flex-row items-center gap-2">
                  <T variant="display" className="text-2xl">{profile.display_name || "Add your name"}</T>
                </View>
                <Muted>{uniShort(profile.university)} · {profile.email}</Muted>
              </View>
            </Card>
            <View className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
              {rows.map((row, i) => (
                <Link key={row.href} href={row.href as never} asChild>
                  <Pressable className={`flex-row items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-line" : ""}`} testID={row.testID}>
                    <Icon name={row.icon} size={24} color="#DA291C" />
                    <View className="flex-1">
                      <T variant="semibold">{row.title}</T>
                      <Muted className="text-xs">{row.detail}</Muted>
                    </View>
                    <Icon name="chevron-forward" size={18} color="#5e5d78" />
                  </Pressable>
                </Link>
              ))}
            </View>
            <Button variant="ghost" className="mt-6" onPress={logOut} testID="log-out">Log out</Button>
          </>
        ) : (
          <View className="mt-6">
            <Muted>Loading…</Muted>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
