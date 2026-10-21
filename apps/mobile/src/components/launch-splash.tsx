import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { buttonTap } from "@/lib/haptics";
import { LIGHT } from "@/lib/theme";

// How long the opening animation runs before the app shows (ms).
const POP = 140;
const HOLD = 520;
const FADE = 260;

// The opening animation, phones only. It starts as an exact copy of the
// phone's own launch screen (Function red, the white ticket at 160pt wide,
// set in app.json under expo-splash-screen), takes over from it, then the
// ticket pops, the name fades in at the bottom, and the whole thing fades
// away to show the app. Under a second; just a fade if the phone is set to
// reduce motion. Changing the launch screen itself (app.json) needs a new
// build; this doesn't.
export function LaunchSplash() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const scale = useSharedValue(1);
  const words = useSharedValue(0);
  const cover = useSharedValue(1);

  const start = () => {
    if (started.current) return;
    started.current = true;
    // The copy is on screen, so the phone's own launch screen can go.
    SplashScreen.hideAsync().catch(() => {});
    if (reduceMotion) {
      words.set(1);
      cover.set(withDelay(HOLD, withTiming(0, { duration: FADE })));
    } else {
      scale.set(
        withSequence(
          withTiming(0.88, { duration: POP, easing: Easing.out(Easing.quad) }),
          withSpring(1.08, { damping: 9, stiffness: 240 }),
          withDelay(HOLD - 200, withTiming(1.5, { duration: FADE, easing: Easing.in(Easing.quad) })),
        ),
      );
      words.set(withDelay(POP, withTiming(1, { duration: 280 })));
      cover.set(withDelay(POP + HOLD, withTiming(0, { duration: FADE })));
      setTimeout(buttonTap, POP);
    }
    setTimeout(() => setDone(true), POP + HOLD + FADE + 50);
  };

  // If the picture is slow to load, start anyway so the app never waits on it.
  useEffect(() => {
    const t = setTimeout(start, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.get() }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: words.get(), transform: [{ translateY: (1 - words.get()) * 8 }] }));

  if (done) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cover, coverStyle]} testID="launch-splash">
      <Animated.View style={logoStyle}>
        <Image source={require("../../assets/brand/splash-glyph.png")} style={styles.logo} onLoad={start} accessibilityIgnoresInvertColors />
      </Animated.View>
      <Animated.View style={[styles.words, { bottom: insets.bottom + 32 }, wordsStyle]}>
        <T variant="title3" className="font-sans-bold text-white">Function</T>
        <T variant="footnote" className="mt-0.5 text-white/85">London&apos;s student social life</T>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: { zIndex: 1000, alignItems: "center", justifyContent: "center", backgroundColor: LIGHT.brand },
  // The same size as the phone's launch screen: 160pt wide (the picture is 431 x 350).
  logo: { width: 160, height: (160 * 350) / 431 },
  words: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
