import { Link, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { eventAdminAvailable, featuresOnCount, hasFeature, uniShort, type HubSociety } from "@function/shared";
import { FoundingProgressCard } from "@/components/hub/founding-progress";
import { BigButton, HubGate, HubLayout, SocietyLogo, useWide } from "@/components/hub/hub-layout";
import { useManagers } from "@/components/hub/managers";
import { Icon } from "@/components/icon";
import { Card, Heading, Muted, T } from "@/components/ui";

// A society's Hub home (Overview): finish setting up (until it's done), a
// Founding Society's progress (events posted, prize draw, badge), your page,
// the features you use, your committee, posting an event and requesting a
// feature.
export default function HubHomeScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  return (
    <HubGate societyId={societyId}>
      {(hub) => (
        <HubLayout hub={hub} current="overview">
          <Overview hub={hub} />
        </HubLayout>
      )}
    </HubGate>
  );
}

function Overview({ hub }: { hub: HubSociety }) {
  const s = hub.society;
  const wide = useWide();
  const managers = useManagers(s.id);
  const on = featuresOnCount(hub.features);
  const managerCount = managers.data?.length;

  return (
    <View className="gap-5">
      <View>
        <Heading>Overview</Heading>
        <Muted className="mt-1">Run {s.name} on Function: your page, features, committee and events.</Muted>
      </View>

      {!s.onboarded_at && (
        <Link href={`/hub/${s.id}/setup` as never} asChild>
          <Pressable accessibilityRole="button" className="min-h-[64px] flex-row items-center gap-4 rounded-2xl bg-brand px-5 py-5 active:opacity-90" testID="hub-finish-setup">
            <Icon name="rocket-outline" size={28} color="#ffffff" />
            <View className="flex-1">
              <T variant="display-bold" className="text-lg text-brand-ink">Finish setting up</T>
              <T className="text-sm text-brand-ink">Check your page, choose features, add your committee and post your first event. About 5 minutes.</T>
            </View>
            <Icon name="chevron-forward" size={20} color="#ffffff" />
          </Pressable>
        </Link>
      )}

      {s.is_founding && <FoundingProgressCard hub={hub} />}

      <View className={wide ? "flex-row flex-wrap gap-4" : "gap-4"}>
        <HubCard wide={wide} title="Your page" icon="storefront-outline" testID="hub-card-page">
          <View className="flex-row items-center gap-3">
            <SocietyLogo name={s.name} url={s.logo_url} size={48} />
            <View className="min-w-0 flex-1">
              <T variant="semibold" numberOfLines={2}>{s.name}</T>
              <Muted className="text-xs">{uniShort(s.university)}{s.instagram ? ` · @${s.instagram}` : ""}</Muted>
            </View>
          </View>
          {s.description ? <Muted className="text-sm" numberOfLines={3}>{s.description}</Muted> : <Muted className="text-sm">No description yet. Add one so students know what you do.</Muted>}
          <View className="flex-row flex-wrap gap-4">
            <CardLink href={`/dashboard/${s.id}`} testID="hub-edit-page">Edit details →</CardLink>
            <CardLink href={`/s/${s.slug}`} testID="hub-view-page">View page →</CardLink>
          </View>
        </HubCard>

        <HubCard wide={wide} title="Features" icon="options-outline" testID="hub-card-features">
          <T variant="display-bold" className="text-2xl">{on} {on === 1 ? "feature" : "features"} on</T>
          <Muted className="text-sm">Sign-up lists, tables, settle-up and more. Switch them on or off at any time.</Muted>
          <CardLink href={`/hub/${s.id}/features`} testID="hub-features-link">Choose features →</CardLink>
        </HubCard>

        <HubCard wide={wide} title="Committee" icon="people-outline" testID="hub-card-committee">
          <T variant="display-bold" className="text-2xl">{managerCount === undefined ? "…" : `${managerCount} ${managerCount === 1 ? "manager" : "managers"}`}</T>
          <Muted className="text-sm">Add your committee, and hand over to next year&apos;s.</Muted>
          <CardLink href={`/hub/${s.id}/committee`} testID="hub-committee-link">Manage committee →</CardLink>
        </HubCard>

        <HubCard wide={wide} title="Events" icon="calendar-outline" testID="hub-card-events">
          <Muted className="text-sm" testID="hub-events-text">
            {hasFeature(hub.features, "event_admin") && eventAdminAvailable(s.university) ? (
              <>Post an event and it goes live once your committee ticks &ldquo;SU approved&rdquo;.</>
            ) : (
              <>Post an event and it&apos;s on the map and your page straight away.</>
            )}
          </Muted>
          <Link href={`/dashboard/${s.id}/events/new` as never} asChild>
            <BigButton testID="hub-post">+ Post an event</BigButton>
          </Link>
          <CardLink href={`/dashboard/${s.id}`} testID="hub-events-link">See your events →</CardLink>
        </HubCard>

        <HubCard wide={wide} title="Request a feature" icon="bulb-outline" testID="hub-card-requests">
          <Muted className="text-sm">Something that would make running {s.name} easier? Tell us what you need and we&apos;ll look at building it.</Muted>
          <CardLink href={`/hub/${s.id}/requests`} testID="hub-requests-link">Request a feature →</CardLink>
        </HubCard>
      </View>
    </View>
  );
}

function HubCard({ title, icon, wide, testID, children }: { title: string; icon: "storefront-outline" | "options-outline" | "people-outline" | "calendar-outline" | "bulb-outline"; wide: boolean; testID: string; children: ReactNode }) {
  return (
    <Card className={`gap-3 ${wide ? "min-w-[45%] flex-1" : ""}`} testID={testID}>
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={20} color="#DA291C" />
        <T variant="semibold" className="text-sm text-muted">{title}</T>
      </View>
      {children}
    </Card>
  );
}

function CardLink({ href, testID, children }: { href: string; testID: string; children: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable className="min-h-[32px] justify-center" testID={testID}>
        <T variant="semibold" className="text-sm text-brand">{children}</T>
      </Pressable>
    </Link>
  );
}
