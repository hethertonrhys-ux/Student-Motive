import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { LIGHT } from "@/lib/theme";

// How long the opening screen stays, then how long it takes to fade (ms).
const HOLD = 700;
const FADE = 260;

// The opening screen, phones only. It's an exact copy of the phone's own
// launch screen (Function red, the white ticket at 160pt wide, set in
// app.json under expo-splash-screen) with the name and tagline at the
// bottom. It takes over from the launch screen, stays still for a moment,
// then fades away to show the app. Changing the launch screen itself
// (app.json) needs a new build; this doesn't.
export function LaunchSplash() {
  const insets = useSafeAreaInsets();
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const cover = useSharedValue(1);

  const start = () => {
    if (started.current) return;
    started.current = true;
    // The copy is on screen, so the phone's own launch screen can go.
    SplashScreen.hideAsync().catch(() => {});
    cover.set(withDelay(HOLD, withTiming(0, { duration: FADE })));
    setTimeout(() => setDone(true), HOLD + FADE + 50);
  };

  // If the picture is slow to load, start anyway so the app never waits on it.
  useEffect(() => {
    const t = setTimeout(start, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.get() }));

  if (done) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cover, coverStyle]} testID="launch-splash">
      <Image source={require("../../assets/brand/splash-glyph.png")} style={styles.logo} onLoad={start} accessibilityIgnoresInvertColors />
      <View style={[styles.words, { bottom: insets.bottom + 32 }]}>
        <T variant="title3" className="font-sans-bold text-white">Function</T>
        <T variant="footnote" className="mt-0.5 text-white/85">London&apos;s student social life</T>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: { zIndex: 1000, alignItems: "center", justifyContent: "center", backgroundColor: LIGHT.brand },
  // The same size as the phone's launch screen: 160pt wide (the picture is 431 x 350).
  logo: { width: 160, height: (160 * 350) / 431 },
  words: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
