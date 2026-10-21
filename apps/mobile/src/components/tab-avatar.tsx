import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";

// The Me tab's icon: your profile photo in a small circle (like Instagram),
// with a ring in the tab colour while Me is the open tab. No photo, or one
// that can't load, shows the usual person icon instead.
export function TabAvatar({ url, focused, color, size }: { url: string | null | undefined; focused: boolean; color: string; size: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return <Ionicons name={focused ? "person-circle" : "person-circle-outline"} color={color} size={size} />;
  // The ring sits outside the photo, so the photo is the same size open or not.
  const ring = 2;
  const photo = size - 2 * (ring + 1);
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: focused ? color : "transparent", alignItems: "center", justifyContent: "center" }}
      testID={focused ? "tab-avatar-focused" : "tab-avatar"}
    >
      <Image source={{ uri: url }} style={{ width: photo, height: photo, borderRadius: photo / 2 }} contentFit="cover" onError={() => setFailed(url)} accessibilityIgnoresInvertColors />
    </View>
  );
}
