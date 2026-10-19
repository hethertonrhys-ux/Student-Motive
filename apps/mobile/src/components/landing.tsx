import { Link } from "expo-router";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { University } from "@function/shared";
import { Button, Card, Heading, Muted, T } from "@/components/ui";

const perks = [
  { title: "One place, not twelve", body: "Stop reposting across WhatsApp groups, Instagram stories and email lists." },
  { title: "Reach beyond your members", body: "Students who don't follow you yet still see you on the map tonight." },
  { title: "See who's coming", body: "Live \"I'm going\" numbers for every event, before the night." },
  { title: "Free for societies", body: "Always. No fees, no catch." },
];

// "LSE's", but "King's" stays "King's" (not "King's's").
export const possessive = (name: string) => (name.endsWith("'s") ? name : `${name}'s`);

// The home page (London-wide) and each uni's page (/lse, /ucl, /kings,
// /imperial), which says the same things for that uni. The same words as
// the website's landing page.
export function Landing({ uni }: { uni?: University }) {
  const steps = [
    { title: uni ? `Log in with your ${uni.short} email` : "Log in with your uni email", body: "No passwords. We email you a code." },
    { title: "Claim your society's page", body: "We check you're on the committee, usually within a day." },
    { title: "Post an event in a minute", body: "It goes straight onto the live map for students across London." },
  ];
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-5xl px-4">
        {/* The top bar: the name, and log in / sign up right where you land. */}
        <View className="flex-row items-center justify-between pt-4">
          <T variant="display-bold" className="text-2xl text-brand">Function</T>
          <Link href="/login" asChild>
            <Button className="px-4 py-2" testID="header-login">Log in / Sign up</Button>
          </Link>
        </View>
        <View className="py-12">
          <View className="mb-4 flex-row items-center gap-2 self-start rounded-full bg-brand-soft px-3 py-1">
            <View className="size-2 rounded-full bg-live" />
            <T variant="semibold" className="text-sm text-brand" testID="landing-badge">
              {uni ? (
                <>Function at <T variant="semibold" className="text-sm" style={{ color: uni.accent }}>{uni.short}</T></>
              ) : (
                "For every London university"
              )}
            </T>
          </View>
          <Heading className="max-w-3xl text-5xl leading-[1.05]" testID="landing-title">
            {uni ? `${possessive(uni.short)} student social life, all in one place.` : "London's student social life, all in one place."}
          </Heading>
          <T variant="semibold" className="mt-5 max-w-2xl text-lg">
            {uni ? `Societies, events and socials at ${uni.short}, plus open socials across London.` : "For students at every London university."}
          </T>
          <Muted className="mt-2 max-w-2xl text-lg">
            Function puts every society and every event in one place. Students open the map and see what&apos;s happening
            tonight. Societies post once and reach everyone.
          </Muted>
          <View className="mt-8 flex-row flex-wrap gap-3">
            <Link href="/login" asChild>
              <Button className="px-5 py-3" testID="landing-login">{uni ? `Join with your ${uni.short} email` : "Log in or sign up"}</Button>
            </Link>
            <Link href="/(tabs)/map" asChild>
              <Button variant="ghost" className="px-5 py-3">See the live map</Button>
            </Link>
            {!uni && (
              <Link href="/login" asChild>
                <Button variant="ghost" className="px-5 py-3">Get your society on Function</Button>
              </Link>
            )}
          </View>
        </View>

        <View className="flex-row flex-wrap gap-4">
          {steps.map((step, i) => (
            <Card key={step.title} className="min-w-[240px] flex-1">
              <T variant="display-bold" className="text-3xl text-brand">{i + 1}</T>
              <T variant="display-bold" className="mt-2 text-lg">{step.title}</T>
              <Muted className="mt-1">{step.body}</Muted>
            </Card>
          ))}
        </View>

        <View className="py-16">
          <T variant="display-bold" className="text-3xl tracking-tight">What societies get</T>
          <View className="mt-6 flex-row flex-wrap gap-4">
            {perks.map((perk) => (
              <Card key={perk.title} className="min-w-[260px] flex-1">
                <T variant="display-bold" className="text-lg">{perk.title}</T>
                <Muted className="mt-1">{perk.body}</Muted>
              </Card>
            ))}
          </View>
        </View>

        {/* On a phone you already have the app, so the "put it on your phone" box is for the website only. */}
        {Platform.OS === "web" && (
          <Card className="mb-8 flex-row flex-wrap items-center justify-between gap-4 bg-brand-soft">
            <View className="min-w-[240px] flex-1">
              <T variant="display-bold" className="text-2xl">Students: put Function on your phone</T>
              <Muted>Add it to your home screen in a few taps. Works on iPhone and Android.</Muted>
            </View>
            <Link href={"/install" as never} asChild>
              <Button className="px-5 py-3">Show me how</Button>
            </Link>
          </Card>
        )}

        <SiteFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

// Privacy, terms and support links, like the bottom of every website page.
export function SiteFooter() {
  return (
    <View className="mt-8 flex-row flex-wrap items-center justify-between gap-3 border-t border-line py-6">
      <Muted className="text-sm">© {new Date().getFullYear()} Function. Made in London.</Muted>
      <View className="flex-row gap-4">
        {([["/privacy", "Privacy"], ["/terms", "Terms"], ["/support", "Support"]] as const).map(([href, label]) => (
          <Link key={href} href={href as never} asChild>
            <Pressable testID={`footer-${label.toLowerCase()}`}><Muted className="text-sm">{label}</Muted></Pressable>
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
