import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// The little taps you feel on an iPhone. Phones only: on the website they'd
// make some Android phones buzz. They never throw (older phones may not
// support every kind).

// Choosing something: a pin, a tab, Now / Tonight / Tomorrow.
export function selectionTap() {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => {});
}

// Pressing a button.
export function buttonTap() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
