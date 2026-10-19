import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import { T } from "@/components/ui";

// A round photo, or initials on a colour picked from the name (the same
// colours and rule as the website). A photo that can't load shows the
// initials too, so there's never an empty gap.
const COLOURS = ["#DA291C", "#be185d", "#0f766e", "#b45309", "#7c3aed", "#0369a1", "#15803d", "#c2410c"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

// ring: a brand-coloured ring, used to mark "you" in a list (ringColor for
// another meaning, such as amber for a host).
export function Avatar({ name, url, size = 36, ring = false, ringColor = "#DA291C" }: { name: string; url?: string | null; size?: number; ring?: boolean; ringColor?: string }) {
  const [failed, setFailed] = useState(false);
  let hash = 2166136261;
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const colour = COLOURS[(hash >>> 0) % COLOURS.length];
  const ringStyle = ring ? { borderWidth: 2, borderColor: ringColor } : {};
  if (url && !failed) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour, ...ringStyle }} contentFit="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour, ...ringStyle }} className="items-center justify-center">
      <T variant="bold" style={{ fontSize: size * 0.38, color: "#fff" }}>{initials(name)}</T>
    </View>
  );
}
