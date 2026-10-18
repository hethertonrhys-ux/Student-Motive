import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Heading, Muted } from "@/components/ui";

// Placeholder: the real login screen is phase 1.
export default function LoginScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="mx-auto w-full max-w-md px-4 py-16">
        <Heading>Log in to Function</Heading>
        <Card className="mt-6">
          <Muted>Login arrives in phase 1.</Muted>
        </Card>
      </View>
    </SafeAreaView>
  );
}
