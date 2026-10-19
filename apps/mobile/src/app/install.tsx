import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Link } from "expo-router";
import Head from "expo-router/head";
import { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackButton } from "@/components/back-button";
import { SiteFooter } from "@/components/landing";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { oneTapInstall, useCanOneTapInstall, useDevice } from "@/lib/install";
import { SITE_URL } from "@/lib/site";

// "Put Function on your phone": the steps for adding the website to an
// iPhone or Android home screen. In the app itself there's nothing to do.

type Tab = "iphone" | "android";
type Step = { title: string; body: string; titleHere?: string; bodyHere?: string };

const IPHONE_STEPS: Step[] = [
  { title: "Open the link in Safari, tap •••", titleHere: "Tap •••", body: "Open the link below in Safari. The ••• is at the bottom right, next to the web address.", bodyHere: "It's at the bottom right, next to the web address." },
  { title: "Tap Share", body: "On older iPhones, skip step 1: the Share button is right at the bottom of the screen." },
  { title: "Tap “View More”", body: "Only if you can't see “Add to Home Screen” yet. Then scroll down the list." },
  { title: "Tap “Add to Home Screen”", body: "Scroll down the list if you need to." },
  { title: "Tap Add", body: "Keep “Open as Web App” switched on." },
  { title: "Open Function from your home screen", body: "Log in once with your email code. You'll stay logged in." },
];
const ANDROID_STEPS: Step[] = [
  { title: "Open Function in Chrome", body: "Open the link below in Chrome, then tap ⋮ in the top right.", titleHere: "Tap ⋮", bodyHere: "Tap ⋮ in the top right of Chrome." },
  { title: "Tap “Add to home screen”", body: "On some phones it's called “Install app”." },
  { title: "Tap Install", body: "Function is added to your home screen and app drawer." },
  { title: "Open it from your home screen", body: "Log in once with your email code. You'll stay logged in." },
];

const INSTALL_LINK = `${SITE_URL}/install`;
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

export const generateMetadata = () => ({ title: "Get the app · Function", description: "Put Function on your phone's home screen in a few taps. Works on iPhone and Android." });

export default function InstallPage() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <Head><title>Get the app · Function</title></Head>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-4xl px-4 py-10">
        <BackButton fallback="/" className="mb-4" />
        <View className="flex-row items-center gap-4">
          <Image source={Platform.OS === "web" ? { uri: "/icon-192.png" } : require("../../assets/brand/icon.png")} style={{ width: 56, height: 56, borderRadius: 14 }} />
          <View className="flex-1">
            <Heading testID="install-title">Get Function on your phone</Heading>
            <Muted className="mt-1">A few taps. It opens full screen with its own icon, just like an app. Free, and no App Store needed.</Muted>
          </View>
        </View>
        {Platform.OS === "web" ? (
          <InstallGuide />
        ) : (
          <Card className="mt-8 bg-ok/10">
            <T variant="display-bold" className="text-xl">✓ You&apos;re all set</T>
            <Muted className="mt-1">You&apos;re already using the Function app.</Muted>
            <Link href="/(tabs)/map" asChild><Button className="mt-4 self-start">Open the live map</Button></Link>
          </Card>
        )}
        {Platform.OS === "web" && (
          <Pressable className="mt-10 self-start" onPress={() => Linking.openURL("/function-iphone-story.png")}>
            <T variant="semibold" className="text-sm text-brand">Save the iPhone steps as a picture</T>
          </Pressable>
        )}
        <SiteFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

function InstallGuide() {
  const device = useDevice();
  const canOneTap = useCanOneTapInstall();
  // Until they pick a tab, show the steps for the phone they're on.
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab | null = picked ?? (device?.platform === "iphone" || device?.platform === "android" ? device.platform : null);
  const browser = device?.platform === "android" ? "Chrome" : "Safari";

  if (device?.installed) {
    return (
      <Card className="mt-8 bg-ok/10">
        <T variant="display-bold" className="text-xl">✓ You&apos;re all set</T>
        <Muted className="mt-1">You&apos;re using Function from your home screen.</Muted>
        <Link href="/(tabs)/map" asChild><Button className="mt-4 self-start">Open the live map</Button></Link>
      </Card>
    );
  }

  return (
    <View className="mt-8 gap-6">
      {/* Opened from Instagram etc.: those browsers can't add to the home screen. */}
      {device?.inAppBrowser && (
        <Card className="border-live/40 bg-live/10">
          <T variant="bold">First, open this page in {browser}</T>
          <T className="mt-1 text-sm">
            You&apos;re in {device.inAppBrowser}&apos;s browser, which can&apos;t add apps to your home screen. Tap the menu (<T variant="bold" className="text-sm">•••</T> or <T variant="bold" className="text-sm">⋮</T>) at the top, then <T variant="bold" className="text-sm">Open in {browser}</T> or &ldquo;Open in browser&rdquo;.
          </T>
          <T className="mt-3 text-sm">Or copy this link and paste it into {browser}:</T>
          <CopyLink />
        </Card>
      )}

      {/* Android Chrome can install in one tap. */}
      {canOneTap && !device?.inAppBrowser && (
        <Card className="bg-brand-soft">
          <T variant="display-bold" className="text-xl">{device?.platform === "other" ? "Want it on this computer too?" : "Install in one tap"}</T>
          <Button className="mt-3 self-start px-6 py-3" onPress={() => void oneTapInstall()}>{device?.platform === "other" ? "Install on this computer" : "Install Function"}</Button>
          {device?.platform !== "other" && <Muted className="mt-2 text-sm">Or follow the steps below.</Muted>}
        </Card>
      )}

      {device?.platform === "other" && (
        <Card>
          <T className="text-sm">On a computer? Open this link on your phone:</T>
          <CopyLink />
        </Card>
      )}

      <View>
        <T variant="semibold" className="mb-2 text-sm text-muted">Which phone do you have?</T>
        <View className="flex-row self-start rounded-2xl border border-line bg-surface p-1" role="tablist">
          {(["iphone", "android"] as const).map((t) => (
            <Pressable key={t} role="tab" aria-selected={tab === t} onPress={() => setPicked(t)} className={`rounded-xl px-6 py-2.5 ${tab === t ? "bg-brand" : ""}`} testID={`tab-${t}`}>
              <T variant="display-bold" className={`text-base ${tab === t ? "text-brand-ink" : "text-muted"}`}>{t === "iphone" ? "iPhone" : "Android"}</T>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === "iphone" && (
        <>
          {device?.platform === "iphone" && device.iphoneBrowser === "other" && !device.inAppBrowser && (
            <Card className="border-live/40 bg-live/10">
              <T variant="bold">Open this page in Safari to continue</T>
              <T className="mt-1 text-sm">These steps only work in Safari. Copy this link, open the <T variant="bold" className="text-sm">Safari</T> app, and paste it into the address bar.</T>
              <CopyLink />
            </Card>
          )}
          <Steps steps={IPHONE_STEPS} browserDone={device?.platform === "iphone" && device.iphoneBrowser === "safari" && !device.inAppBrowser ? "Safari" : null} />
        </>
      )}
      {tab === "android" && <Steps steps={ANDROID_STEPS} browserDone={device?.platform === "android" && device.androidBrowser === "chrome" && !device.inAppBrowser ? "Chrome" : null} />}
    </View>
  );
}

// browserDone: they're already in the right browser, so opening it is done.
function Steps({ steps, browserDone }: { steps: Step[]; browserDone: string | null }) {
  return (
    <View className="flex-row flex-wrap gap-4" role="tabpanel" testID="install-steps">
      {steps.map((step, i) => (
        <Card key={step.title} className="min-w-[260px] flex-1 gap-3">
          <View className="flex-row items-start gap-2.5">
            <View className="size-7 items-center justify-center rounded-full bg-brand">
              <T variant="display-bold" className="text-sm text-brand-ink">{i + 1}</T>
            </View>
            <View className="flex-1">
              <T variant="bold" className="leading-snug">{browserDone && step.titleHere ? step.titleHere : step.title}</T>
              <Muted className="mt-0.5 text-sm">{browserDone && step.bodyHere ? step.bodyHere : step.body}</Muted>
            </View>
          </View>
          {i === 0 &&
            (browserDone ? (
              <View className="rounded-xl bg-ok/10 px-3 py-2"><T variant="semibold" className="text-sm text-ok">✓ You&apos;re already in {browserDone}, so you&apos;re in the right place.</T></View>
            ) : (
              <CopyLink />
            ))}
        </Card>
      ))}
    </View>
  );
}

// The link in a box you can see, select, and copy with one tap.
function CopyLink() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await Clipboard.setStringAsync(INSTALL_LINK);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the link is still there to press and hold.
    }
  }
  return (
    <View className="mt-2 flex-row items-center gap-2 rounded-xl border border-line bg-surface p-1.5 pl-3">
      <T variant="bold" className="min-w-0 flex-1 text-sm" selectable>{SITE_HOST}/install</T>
      <Pressable onPress={() => void copy()} className={`rounded-lg px-3 py-1.5 ${copied ? "bg-ok" : "bg-brand"}`} testID="copy-link">
        <T variant="bold" className={`text-sm ${copied ? "text-white" : "text-brand-ink"}`}>{copied ? "Copied ✓" : "Copy"}</T>
      </Pressable>
    </View>
  );
}
