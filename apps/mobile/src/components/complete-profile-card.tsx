import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { MAX_PROMPTS } from "@function/shared";
import { Icon } from "@/components/icon";
import { Button, Muted, T } from "@/components/ui";

// Decided once per app run: the nudge shows only if it hasn't been shown
// yet since the app opened (the website does the same per browser session).
let shownThisRun = false;

// A small nudge for people who haven't written anything about themselves
// yet, shown after they join an event. At most once per run, and only
// while they have no prompts at all.
export function CompleteProfileCard({ prompts }: { prompts: number }) {
  const [show] = useState(() => {
    if (shownThisRun) return false;
    shownThisRun = true;
    return true;
  });
  const [closed, setClosed] = useState(false);
  if (prompts > 0 || !show || closed) return null;
  return (
    <View className="relative mt-4 flex-row items-center gap-3 rounded-2xl border bg-brand-soft py-3 pl-4 pr-10" style={{ borderColor: "rgba(218,41,28,0.4)" }} testID="complete-profile">
      <View className="min-w-0 flex-1">
        <T variant="semibold">Say a bit about yourself</T>
        <Muted className="text-sm">
          Answer a prompt (up to {MAX_PROMPTS}) so people at this event have something to say hi about.
        </Muted>
      </View>
      <Link href={"/(tabs)/me" as never} asChild>
        <Button className="py-2">Add</Button>
      </Link>
      <Pressable onPress={() => setClosed(true)} accessibilityLabel="Dismiss" className="absolute right-2 top-2 p-1">
        <Icon name="close" size={18} color="#5e5d78" />
      </Pressable>
    </View>
  );
}
