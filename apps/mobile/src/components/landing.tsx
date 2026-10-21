import { Image } from "expo-image";
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, View, type PressableProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { University } from "@function/shared";
import { Muted, T } from "@/components/ui";
import { buttonTap } from "@/lib/haptics";

const perks = [
  { title: "One place, not twelve", body: "Stop reposting across WhatsApp groups, Instagram stories and email lists." },
  { title: "Reach beyond your members", body: "Students who don't follow you yet still see you on the map tonight." },
  { title: "See who's coming", body: "Live \"I'm going\" numbers for every event, before the night." },
  { title: "Free for societies", body: "Always. No fees, no catch." },
];

// The photo grid: a pub quiz, a society dinner, a club night and five-a-side.
// (Atmosphere shots with no recognisable faces; swap in real ones from Function events.)
const PHOTOS = [require("@/assets/landing/quiz.jpg"), require("@/assets/landing/dinner.jpg"), require("@/assets/landing/club.jpg"), require("@/assets/landing/football.jpg")];

// The welcome screen is always black, like TikTok's and Snapchat's, in light and dark mode alike.
const BLACK = "#000000";
const CARD = "bg-[#1C1C1E]";

// "LSE's", but "King's" stays "King's" (not "King's's").
export const possessive = (name: string) => (name.endsWith("'s") ? name : `${name}'s`);

// A full-width button on the black page: Function red for the main action, dark grey for the rest.
function WelcomeButton({ children, primary = false, ...props }: Omit<PressableProps, "children"> & { children: ReactNode; primary?: boolean }) {
  return (
    <Pressable
      role="button"
      {...props}
      onPress={(e) => {
        buttonTap();
        props.onPress?.(e);
      }}
      className={`h-[50px] w-full items-center justify-center rounded-full px-5 active:opacity-80 ${primary ? "bg-brand" : "bg-[#2C2C2E]"}`}
    >
      <T variant="headline" className="text-white">{children}</T>
    </Pressable>
  );
}

// The home page (London-wide) and each uni's page (/lse, /ucl, /kings,
// /imperial), which says the same things for that uni. The same words as
// the website's landing page, laid out like TikTok's and Snapchat's
// welcome screens: real-life photos at the top fading into black, a big
// headline and full-width buttons.
export function Landing({ uni }: { uni?: University }) {
  const insets = useSafeAreaInsets();
  const steps = [
    { title: uni ? `Log in with your ${uni.short} email` : "Log in with your uni email", body: "No password needed. We email you a code." },
    { title: "Claim your society's page", body: "We check you're on the committee, usually within a day." },
    { title: "Post an event in a minute", body: "It goes straight onto the live map for students across London." },
  ];
  return (
    <View className="flex-1" style={{ backgroundColor: BLACK }}>
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl" contentContainerStyle={{ paddingBottom: insets.bottom }}>
        {/* The photos, with the name and log in on top, fading into the black below. */}
        <View>
          <View className="flex-row flex-wrap">
            {PHOTOS.map((photo, i) => (
              <Image key={i} source={photo} contentFit="cover" style={{ width: "50%", aspectRatio: 1 }} accessibilityIgnoresInvertColors />
            ))}
          </View>
          {/* A darker band behind the top bar, and the fade into the page (stacked layers: no gradient library needed). */}
          <View pointerEvents="none" className="absolute inset-x-0 top-0">
            <View style={{ height: insets.top + 60, backgroundColor: "rgba(0,0,0,0.78)" }} />
            {[0.6, 0.42, 0.26, 0.12].map((a) => (
              <View key={a} style={{ height: 10, backgroundColor: `rgba(0,0,0,${a})` }} />
            ))}
          </View>
          <View pointerEvents="none" className="absolute inset-x-0 bottom-0">
            {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((a) => (
              <View key={a} style={{ height: 22, backgroundColor: `rgba(0,0,0,${a})` }} />
            ))}
          </View>
          <View className="absolute inset-x-0 top-0 flex-row items-center justify-between px-4" style={{ paddingTop: insets.top + 12 }}>
            <T variant="title2" className="text-brand">Function</T>
            <Link href="/login" asChild>
              <Pressable role="button" onPress={buttonTap} className="h-9 justify-center rounded-full bg-brand px-4 active:opacity-80" testID="header-login">
                <T variant="subhead" className="font-sans-semibold text-white">Log in / Sign up</T>
              </Pressable>
            </Link>
          </View>
        </View>

        <View className="-mt-6 px-4">
          <View className="mb-3 flex-row items-center gap-2 self-start rounded-full bg-[#1C1C1E] px-3 py-1">
            <View className="size-1.5 rounded-full bg-brand" />
            <T variant="footnote" className="font-sans-semibold text-white" testID="landing-badge">
              {uni ? (
                <>Function at <T variant="footnote" className="font-sans-semibold" style={{ color: uni.accent }}>{uni.short}</T></>
              ) : (
                "For every London university"
              )}
            </T>
          </View>
          <T className="text-[40px] leading-[44px] font-sans-bold tracking-tight text-white" testID="landing-title">
            {uni ? `${possessive(uni.short)} student social life, all in one place.` : "London's student social life, all in one place."}
          </T>
          <T variant="headline" className="mt-4 text-white">
            {uni ? `Societies, events and socials at ${uni.short}, plus open socials across London.` : "For students at every London university."}
          </T>
          <T variant="body" className="mt-2 text-[#98989F]">
            Function puts every society and every event in one place. Students open the map and see what&apos;s happening
            tonight. Societies post once and reach everyone.
          </T>
          <View className="mt-7 gap-2.5">
            <Link href="/login" asChild>
              <WelcomeButton primary testID="landing-login">{uni ? `Join with your ${uni.short} email` : "Log in or sign up"}</WelcomeButton>
            </Link>
            <Link href="/(tabs)/map" asChild>
              <WelcomeButton>See the live map</WelcomeButton>
            </Link>
            {!uni && (
              <Link href="/login" asChild>
                <WelcomeButton>Get your society on Function</WelcomeButton>
              </Link>
            )}
          </View>

          <View className="mt-12 gap-3">
            {steps.map((step, i) => (
              <View key={step.title} className={`flex-row gap-4 rounded-2xl p-4 ${CARD}`}>
                <View className="size-9 items-center justify-center rounded-full bg-brand">
                  <T variant="headline" className="text-white">{i + 1}</T>
                </View>
                <View className="flex-1">
                  <T variant="headline" className="text-white">{step.title}</T>
                  <T variant="subhead" className="mt-0.5 text-[#98989F]">{step.body}</T>
                </View>
              </View>
            ))}
          </View>

          <View className="pt-12">
            <T variant="title2" className="text-white">What societies get</T>
            <View className="mt-4 gap-3">
              {perks.map((perk) => (
                <View key={perk.title} className={`rounded-2xl p-4 ${CARD}`}>
                  <T variant="headline" className="text-white">{perk.title}</T>
                  <T variant="subhead" className="mt-0.5 text-[#98989F]">{perk.body}</T>
                </View>
              ))}
            </View>
          </View>

          {/* On a phone you already have the app, so the "put it on your phone" box is for the website only. */}
          {Platform.OS === "web" && (
            <View className={`mt-10 gap-3 rounded-2xl p-4 ${CARD}`}>
              <T variant="title3" className="text-white">Students: put Function on your phone</T>
              <T variant="subhead" className="text-[#98989F]">Add it to your home screen in a few taps. Works on iPhone and Android.</T>
              <Link href={"/install" as never} asChild>
                <WelcomeButton primary>Show me how</WelcomeButton>
              </Link>
            </View>
          )}

          <SiteFooter onBlack />
        </View>
      </ScrollView>
    </View>
  );
}

// Privacy, terms and support links, like the bottom of every website page.
// onBlack: on the always-black welcome page.
export function SiteFooter({ onBlack = false }: { onBlack?: boolean }) {
  const text = onBlack ? "text-sm text-[#98989F]" : "text-sm";
  return (
    <View className={`mt-8 flex-row flex-wrap items-center justify-between gap-3 border-t py-6 ${onBlack ? "border-[#38383A]" : "border-line"}`}>
      <Muted className={text}>© {new Date().getFullYear()} Function. Made in London.</Muted>
      <View className="flex-row gap-4">
        {([["/privacy", "Privacy"], ["/terms", "Terms"], ["/support", "Support"]] as const).map(([href, label]) => (
          <Link key={href} href={href as never} asChild>
            <Pressable testID={`footer-${label.toLowerCase()}`}><Muted className={text}>{label}</Muted></Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}

// Opens an email to the Function team.
export function MailLink({ email }: { email: string }) {
  return (
    <T variant="semibold" className="text-brand" onPress={() => Linking.openURL(`mailto:${email}`)}>{email}</T>
  );
}
