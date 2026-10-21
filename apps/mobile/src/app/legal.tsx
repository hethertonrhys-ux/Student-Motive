import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Icon } from "@/components/icon";
import { Heading, Screen, T } from "@/components/ui";

export const generateMetadata = () => ({ title: "Terms and policies · Function" });

const DOCS: { href: string; icon: React.ComponentProps<typeof Icon>["name"]; title: string; testID: string }[] = [
  { href: "/guidelines", icon: "people-outline", title: "Community Guidelines", testID: "legal-guidelines" },
  { href: "/terms", icon: "document-text-outline", title: "Terms of Service", testID: "legal-terms" },
  { href: "/privacy", icon: "lock-closed-outline", title: "Privacy Policy", testID: "legal-privacy" },
];

// Me → Terms and policies: the three documents, each on its own page.
export default function LegalScreen() {
  return (
    <Screen>
      <BackButton fallback="/(tabs)/me" />
      <Heading className="mt-3">Terms and policies</Heading>
      <View className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface" testID="legal-list">
        {DOCS.map((d, i) => (
          <Link key={d.href} href={d.href as never} asChild>
            <Pressable accessibilityRole="link" className={`min-h-14 flex-row items-center gap-3 px-4 py-3.5 active:opacity-80 ${i > 0 ? "border-t border-line" : ""}`} testID={d.testID}>
              <Icon name={d.icon} size={24} color="#DA291C" />
              <T variant="semibold" className="flex-1">{d.title}</T>
              <Icon name="chevron-forward" size={18} color="#5e5d78" />
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}
