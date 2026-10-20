import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, usePathname, useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { countMyManagedSocieties, initialOf, loadHubSociety, uniShort, type HubSociety } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Icon } from "@/components/icon";
import { Chip } from "@/components/social/filters";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useMounted } from "@/lib/use-mounted";
import { useSession } from "@/providers/session";

// The Society Hub's frame, shared by every Hub page: on phones a single
// column (a header with the back button and the sections as chips); on
// screens wider than 1024px a sidebar on the left and the page beside it.
// Also the access check every Hub page goes through (the society's
// managers and Function admins only), and a few shared pieces.

type IconName = ComponentProps<typeof Icon>["name"];

// Wide screens (a laptop's browser) get the sidebar. Only once the screen is
// on: the web build is pre-rendered at phone width, and the first paint has
// to match it.
export function useWide() {
  const { width } = useWindowDimensions();
  const mounted = useMounted();
  return mounted && width > 1024;
}

// The society for the Hub (null if you can't manage it).
export function useHub(societyId: string | undefined) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({ queryKey: ["hub", societyId ?? null, userId], queryFn: () => loadHubSociety(supabase, societyId!), enabled: !!userId && !!societyId });
}

// How many societies you manage (cheap: a count), for the Me tab and the
// Hub's way back.
export function useManagedCount() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({ queryKey: ["my-hub-count", userId], queryFn: () => countMyManagedSocieties(supabase, userId!), enabled: !!userId, staleTime: 60_000 });
}

// A big button for the Hub's main actions (at least 52px tall).
export function BigButton({ className = "", ...props }: ComponentProps<typeof Button>) {
  return <Button className={`min-h-[52px] py-3.5 ${className}`} {...props} />;
}

// The society's logo, or its initial on a soft brand square.
export function SocietyLogo({ name, url, size = 56 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 4 }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4 }} className="items-center justify-center bg-brand-soft">
      <T variant="display-bold" className="text-brand" style={{ fontSize: size * 0.42 }}>{initialOf(name)}</T>
    </View>
  );
}

// The page frame. With a sidebar (wide screens), the sidebar sits on the
// left and the page scrolls beside it; without, the usual phone column.
export function HubFrame({ sidebar, children }: { sidebar?: ReactNode; children: ReactNode }) {
  if (sidebar) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="flex-1 flex-row">
          <View className="w-72 border-r border-line bg-surface" testID="hub-sidebar">
            <ScrollView contentContainerClassName="px-5 py-8">{sidebar}</ScrollView>
          </View>
          <ScrollView className="flex-1" contentContainerClassName="mx-auto w-full max-w-3xl px-10 py-10" keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// A simple page for the gate's messages (loading, log in, no access).
function PlainScreen({ children, fallback = "/hub" }: { children: ReactNode; fallback?: string }) {
  return (
    <HubFrame>
      <BackButton fallback={fallback} className="mb-6" />
      {children}
    </HubFrame>
  );
}

// Logged out: log in, then come back to this page.
export function HubLogin({ next }: { next: string }) {
  return (
    <Card className="gap-4 p-6" testID="hub-login">
      <Heading>Society Hub</Heading>
      <T className="text-base">Log in to run your society on Function.</T>
      <Link href={{ pathname: "/login", params: { next } }} asChild>
        <BigButton testID="hub-login-button">Log in</BigButton>
      </Link>
    </Card>
  );
}

// Every Hub page for one society goes through this: logged out, a log in
// card that comes back here; no access, a friendly message. The database
// refuses changes from anyone else too.
export function HubGate({ societyId, children }: { societyId: string | undefined; children: (hub: HubSociety) => ReactNode }) {
  const { session, loading } = useSession();
  const pathname = usePathname();
  const hub = useHub(societyId);
  if (loading) return <PlainScreen fallback="/(tabs)/me"><Muted>Loading…</Muted></PlainScreen>;
  if (!session) return <PlainScreen fallback="/"><HubLogin next={pathname || "/hub"} /></PlainScreen>;
  if (hub.isPending) return <PlainScreen><Muted>Loading…</Muted></PlainScreen>;
  if (hub.isError) {
    return (
      <PlainScreen>
        <Card className="gap-4 p-6">
          <Heading>Couldn&apos;t load this</Heading>
          <Muted>Check your connection and try again.</Muted>
          <BigButton onPress={() => void hub.refetch()} testID="hub-retry">Try again</BigButton>
        </Card>
      </PlainScreen>
    );
  }
  if (!hub.data) {
    return (
      <PlainScreen>
        <Card className="gap-4 p-6" testID="hub-no-access">
          <Heading>You don&apos;t manage this society</Heading>
          <Muted>Only the society&apos;s committee can open its Hub.</Muted>
          <Link href={"/hub" as never} asChild>
            <BigButton variant="ghost" testID="hub-no-access-link">Go to your Society Hub</BigButton>
          </Link>
        </Card>
      </PlainScreen>
    );
  }
  return <>{children(hub.data)}</>;
}

// ---- The Hub's sections ----

export type HubSection = "overview" | "features" | "committee";
type SectionLink = { key: string; label: string; href: string; icon: IconName; inHub: boolean };

function sectionLinks(hub: HubSociety): SectionLink[] {
  const id = hub.society.id;
  return [
    { key: "overview", label: "Overview", href: `/hub/${id}`, icon: "grid-outline", inHub: true },
    { key: "features", label: "Features", href: `/hub/${id}/features`, icon: "options-outline", inHub: true },
    { key: "committee", label: "Committee", href: `/hub/${id}/committee`, icon: "people-outline", inHub: true },
    // Part 4 adds "Requests" (/hub/<id>/requests) here, between Committee and Events.
    { key: "events", label: "Events", href: `/dashboard/${id}`, icon: "calendar-outline", inHub: false },
    { key: "page", label: "Society page", href: `/s/${hub.society.slug}`, icon: "open-outline", inHub: false },
  ];
}

// A Hub page: the sidebar on wide screens, the phone header otherwise.
export function HubLayout({ hub, current, children }: { hub: HubSociety; current: HubSection; children: ReactNode }) {
  const wide = useWide();
  const router = useRouter();
  const count = useManagedCount();
  const links = sectionLinks(hub);
  const several = (count.data ?? 0) > 1;
  // The way back from the Hub: your list of societies if you run several,
  // otherwise the Me tab (the list would just bring you straight back).
  const out = current === "overview" ? (several ? "/hub" : "/(tabs)/me") : `/hub/${hub.society.id}`;
  const open = (l: SectionLink) => (l.inHub ? router.replace(l.href as never) : router.push(l.href as never));

  if (wide) {
    return (
      <HubFrame
        sidebar={
          <View className="gap-6">
            <BackButton fallback={out} />
            <View className="flex-row items-center gap-3">
              <SocietyLogo name={hub.society.name} url={hub.society.logo_url} size={44} />
              <View className="min-w-0 flex-1">
                <T variant="bold" numberOfLines={2}>{hub.society.name}</T>
                <Muted className="text-xs">{uniShort(hub.society.university)} · Society Hub</Muted>
              </View>
            </View>
            <View className="gap-1" accessibilityRole="tablist">
              {links.map((l) => {
                const active = l.key === current;
                return (
                  <Pressable key={l.key} onPress={() => open(l)} accessibilityRole="tab" accessibilityState={{ selected: active }} className={`min-h-[44px] flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${active ? "bg-brand-soft" : "active:bg-bg"}`} testID={`hub-nav-${l.key}`}>
                    <Icon name={l.icon} size={20} color={active ? "#DA291C" : "#5e5d78"} />
                    <T variant="semibold" className={`flex-1 ${active ? "text-brand" : ""}`}>{l.label}</T>
                    {!l.inHub && <Icon name="chevron-forward" size={16} color="#5e5d78" />}
                  </Pressable>
                );
              })}
            </View>
            {several && (
              <Link href={"/hub" as never} asChild>
                <Pressable testID="hub-all-societies"><T variant="semibold" className="text-sm text-muted">All your societies →</T></Pressable>
              </Link>
            )}
          </View>
        }
      >
        {children}
      </HubFrame>
    );
  }

  return (
    <HubFrame>
      <View className="flex-row items-center gap-3">
        <BackButton fallback={out} />
        <T variant="display-bold" className="flex-1 text-lg" numberOfLines={1}>{hub.society.name}</T>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mt-4" contentContainerClassName="gap-2 px-4">
        {links.map((l) => (
          <Chip key={l.key} active={l.key === current} onPress={() => open(l)} testID={`hub-nav-${l.key}`}>{l.label}</Chip>
        ))}
      </ScrollView>
      <View className="mt-6">{children}</View>
    </HubFrame>
  );
}
