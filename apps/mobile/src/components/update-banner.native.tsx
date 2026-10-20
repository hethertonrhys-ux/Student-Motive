import { useSegments } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { Button, T } from "@/components/ui";

// "A new version of Function is ready": the phone app's over-the-air
// updates (EAS Update). The app looks for a new version when it opens and
// when it comes back on screen (at most every 10 minutes), downloads it in
// the background, then shows this small banner. Nothing changes until the
// person taps Restart; if they don't, the new version starts the next time
// the app is opened from scratch.
//
// Only in real builds that have the updater: never in development, in Expo
// Go or on the website (the website uses update-banner.web.tsx, which shows
// nothing, because a web page always loads the newest version).
const ON = Updates.isEnabled && !__DEV__ && Platform.OS !== "web";
const CHECK_EVERY = 10 * 60 * 1000;

export function UpdateBanner() {
  return ON ? <Banner /> : null;
}

function Banner() {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const [fetched, setFetched] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const lastCheck = useRef(0);
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const now = Date.now();
      if (now - lastCheck.current < CHECK_EVERY) return;
      lastCheck.current = now;
      try {
        const found = await Updates.checkForUpdateAsync();
        if (!found.isAvailable) return;
        const result = await Updates.fetchUpdateAsync();
        if (alive && (result.isNew || result.isRollBackToEmbedded)) setFetched(result.manifest?.id ?? "new");
      } catch {
        // Offline, the update server didn't answer, or this build has no
        // update address: say nothing and try again next time.
      }
    };
    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Which download this is, so "Not now" hides this one but a later one shows again.
  const ready = isUpdatePending || fetched !== null;
  const which = downloadedUpdate?.updateId ?? fetched ?? "pending";
  if (!ready || dismissed === which) return null;

  const restart = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      // Couldn't restart (very rare): the new version starts next time the app opens.
      setRestarting(false);
    }
  };

  // Sits just above the tab bar (49 plus the bottom safe area, the same sum
  // as the tab bar's height) on the tabs, and just above the bottom edge elsewhere.
  const onTabs = segments[0] === "(tabs)";
  const bottom = onTabs ? 49 + Math.max(insets.bottom, 6) + 8 : insets.bottom + 12;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 items-center px-3" style={{ bottom }}>
      <View
        accessibilityLiveRegion="polite"
        className="w-full max-w-2xl flex-row items-center gap-3 rounded-2xl border border-line bg-surface py-2.5 pl-4 pr-2 shadow-xl"
        testID="update-banner"
      >
        <Icon name="arrow-down-circle" size={22} color="#DA291C" />
        <T variant="semibold" className="min-w-0 flex-1 text-sm">
          A new version of Function is ready.
        </T>
        <Button className="py-2" onPress={() => void restart()} disabled={restarting} testID="update-restart">
          {restarting ? "Restarting…" : "Restart"}
        </Button>
        <Pressable onPress={() => setDismissed(which)} accessibilityRole="button" accessibilityLabel="Not now" hitSlop={8} className="h-8 w-8 items-center justify-center rounded-full" testID="update-dismiss">
          <Icon name="close" size={20} color="#5e5d78" />
        </Pressable>
      </View>
    </View>
  );
}
