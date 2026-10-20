import { View } from "react-native";
import type { FeedItem } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { EventCard } from "@/components/event-card";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Label, Muted, Pill, Screen, SectionTitle, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { LIGHT, useTheme } from "@/lib/theme";
import { useMounted } from "@/lib/use-mounted";
import { useSession } from "@/providers/session";
import NotFound from "./+not-found";

export const generateMetadata = () => ({ title: "Design · Function", robots: "noindex" });

// The style guide: every colour, font and shared component on one page, in
// whichever mode the phone or browser is in. Not linked from anywhere; open
// /design to check a design change in one place before it reaches screens.
// On the live website and the store app it's for Function admins only
// (everyone else gets the usual "not found" page); in preview mode (npm
// start, a development build, or a web build made with --dev) anyone can
// open it, so design changes can be checked without an admin login.
// Sample content only: nothing here reads or changes data.

// The class for each colour, so the swatches use the same classes as the screens.
const SWATCHES: { key: keyof typeof LIGHT; className: string; use: string }[] = [
  { key: "bg", className: "bg-bg", use: "Page background" },
  { key: "surface", className: "bg-surface", use: "Cards, inputs, tab bar" },
  { key: "ink", className: "bg-ink", use: "Text" },
  { key: "muted", className: "bg-muted", use: "Secondary text" },
  { key: "line", className: "bg-line", use: "Borders" },
  { key: "brand", className: "bg-brand", use: "Function red: buttons, links" },
  { key: "brandInk", className: "bg-brand-ink", use: "Text on red" },
  { key: "brandSoft", className: "bg-brand-soft", use: "Soft red: pills, highlights" },
  { key: "live", className: "bg-live", use: "LIVE badges, unread counts" },
  { key: "danger", className: "bg-danger", use: "Errors, delete" },
  { key: "ok", className: "bg-ok", use: "Success" },
];

const SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-5xl"];
// Tailwind's spacing steps: each is 4px (p-4 is 16px).
const SPACING = [1, 2, 3, 4, 5, 6, 8, 12];
const RADII = [
  { className: "rounded-xl", use: "Buttons, inputs" },
  { className: "rounded-2xl", use: "Cards" },
  { className: "rounded-full", use: "Pills, avatars" },
];

const SAMPLE_EVENT: FeedItem = {
  id: "sample",
  title: "Pub quiz and pizza night",
  category: "social",
  freeFood: true,
  startsAt: "2026-10-21T18:30:00.000Z",
  endsAt: "2026-10-21T21:00:00.000Z",
  going: 42,
  place: "Saw Swee Hock Centre",
  by: "LSE Quiz Society",
  href: "/design",
  imageUrl: null,
  hostId: null,
  societyId: null,
  university: null,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-10 gap-3">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

export default function DesignPage() {
  const { dark, colors } = useTheme();
  const { loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile();
  const mounted = useMounted();
  // Blank in the pre-rendered web page (the page shows the current mode,
  // which isn't known until it's on), and while we find out who's logged in.
  if (!mounted || (!__DEV__ && (sessionLoading || profileLoading))) return <View className="flex-1 bg-bg" />;
  if (!__DEV__ && !profile?.is_admin) return <NotFound />;
  return (
    <Screen testID="design-page">
      <Heading>Design</Heading>
      <Muted className="mt-1 text-sm">Function&apos;s colours, fonts and building blocks, in {dark ? "dark" : "light"} mode.</Muted>

      <Section title="Colours">
        <Card className="gap-3 p-4">
          {SWATCHES.map((s) => (
            <View key={s.key} className="flex-row items-center gap-3">
              <View className={`size-10 rounded-xl border border-line ${s.className}`} />
              <View className="flex-1">
                <T variant="semibold">{s.className.replace("bg-", "")}</T>
                <Muted className="text-sm">{s.use}</Muted>
              </View>
              <Muted className="text-sm">{colors[s.key]}</Muted>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Fonts">
        <Card className="gap-2 p-4">
          <T variant="display" className="text-3xl">Bricolage Grotesque</T>
          <Muted className="text-sm">Headings and event titles (display, display-bold)</Muted>
          <T variant="display-bold" className="mt-2 text-xl">Display bold: event titles</T>
          <T className="mt-4 text-xl">Figtree</T>
          <Muted className="text-sm">Everything else (normal, semibold, bold)</Muted>
          <T className="mt-2">Normal: body text</T>
          <T variant="semibold">Semibold: labels, buttons</T>
          <T variant="bold">Bold: badges, emphasis</T>
        </Card>
        <Card className="gap-1 p-4">
          {SIZES.map((size) => (
            <View key={size} className="flex-row items-baseline gap-3">
              <Muted className="w-20 text-xs">{size.replace("text-", "")}</Muted>
              <T className={`flex-1 ${size}`} numberOfLines={1}>Tonight</T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Buttons">
        <View className="flex-row flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button className="py-2" variant="ghost">
            <Icon name="share-outline" size={18} color={LIGHT.ink} />
            <T variant="semibold">With icon</T>
          </Button>
        </View>
      </Section>

      <Section title="Pills">
        <View className="flex-row flex-wrap gap-2">
          <Pill>Recommended</Pill>
          <Pill tone="live">LIVE</Pill>
          <Pill tone="quiet">Members only</Pill>
        </View>
      </Section>

      <Section title="Form">
        <Card>
          <Label>Event name</Label>
          <Input placeholder="e.g. Pub quiz" />
          <Label className="mt-4">With a value</Label>
          <Input defaultValue="Pub quiz and pizza night" />
        </Card>
      </Section>

      <Section title="Cards">
        <Card>
          <T variant="semibold">A card</T>
          <Muted className="mt-1 text-sm">White (or dark navy) with a thin border and rounded corners.</Muted>
        </Card>
        <EventCard item={SAMPLE_EVENT} />
        <EventCard item={SAMPLE_EVENT} note="Your friends are going" />
      </Section>

      <Section title="Avatars">
        <View className="flex-row items-center gap-3">
          <Avatar name="Ada Lovelace" size={48} />
          <Avatar name="Rhys" size={40} />
          <Avatar name="Sam Okoro" size={36} ring />
          <Avatar name="Function" size={28} />
        </View>
      </Section>

      <Section title="Spacing">
        <Card className="gap-2 p-4">
          {SPACING.map((n) => (
            <View key={n} className="flex-row items-center gap-3">
              <Muted className="w-20 text-xs">{n} · {n * 4}px</Muted>
              <View className="h-3 rounded-full bg-brand" style={{ width: n * 4 }} />
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Corners">
        <View className="flex-row gap-3">
          {RADII.map((r) => (
            <View key={r.className} className="flex-1 items-center gap-2">
              <View className={`h-16 w-16 border border-line bg-surface ${r.className}`} />
              <Muted className="text-center text-xs">{r.use}</Muted>
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}
