import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Heading, Muted } from "@/components/ui";

// Placeholder until this tab is built.
export default function SocietiesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="mx-auto w-full max-w-2xl px-4 py-8">
        <Heading>Societies</Heading>
        <Card className="mt-6">
          <Muted>Societies arrive in phase 4.</Muted>
        </Card>
      </View>
    </SafeAreaView>
  );
}
