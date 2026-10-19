import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { MAX_PROMPTS } from "@function/shared";
import { Button, Muted, T } from "@/components/ui";

// Decided once per app run: the nudge shows only if it hasn't been shown
// yet since the app opened (the website does the same per browser session).
let shownThisRun = false;

// A small nudge for people with fewer than 3 prompts: on their own profile,
// and after they join an event or a society. At most once per run.
export function CompleteProfileCard({ prompts }: { prompts: number }) {
  const [show] = useState(() => {
    if (shownThisRun) return false;
    shownThisRun = true;
    return true;
  });
  const [closed, setClosed] = useState(false);
  if (prompts >= MAX_PROMPTS || !show || closed) return null;
  const left = MAX_PROMPTS - prompts;
  return (
    <View className="relative mt-4 flex-row items-center gap-3 rounded-2xl border bg-brand-soft py-3 pl-4 pr-10" style={{ borderColor: "rgba(218,41,28,0.4)" }} testID="complete-profile">
      <View className="min-w-0 flex-1">
        <T variant="semibold">Complete your profile</T>
        <Muted className="text-sm">
          Add {left} more prompt{left === 1 ? "" : "s"} so people have something to say hi about.
        </Muted>
      </View>
      <Link href={"/(tabs)/me" as never} asChild>
        <Button className="py-2">Add</Button>
      </Link>
      <Pressable onPress={() => setClosed(true)} accessibilityLabel="Dismiss" className="absolute right-2 top-2 p-1">
        <Ionicons name="close" size={18} color="#5e5d78" />
      </Pressable>
    </View>
  );
}
