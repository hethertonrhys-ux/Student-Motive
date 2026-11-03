import { Link } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

// The Map tab while the map is switched off (lib/app-features.ts): the tab
// stays in the bar and says the map is coming soon. No map is drawn and no
// location is asked for.
export function MapComingSoon() {
  const { colors } = useTheme();
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8">
        <Heading>Map</Heading>
        <Card className="mt-6 items-center gap-3 px-6 py-10" testID="map-coming-soon">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
            <Icon name="location" size={28} color={colors.brand} />
          </View>
          <T variant="display-bold" className="text-xl">Map coming soon</T>
          <Muted className="text-center">
            A live map of every society event and social across London is on its way. For now, find what&apos;s on in Societies and Social.
          </Muted>
          <View className="mt-2 flex-row flex-wrap justify-center gap-2">
            <Link href="/(tabs)/societies" asChild>
              <Button testID="map-soon-societies">Societies</Button>
            </Link>
            <Link href="/(tabs)/social" asChild>
              <Button variant="ghost" testID="map-soon-social">Social</Button>
            </Link>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
