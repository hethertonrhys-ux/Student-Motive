import Head from "expo-router/head";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackButton } from "@/components/back-button";
import { SiteFooter } from "@/components/landing";
import { Heading, Muted, T } from "@/components/ui";

// A page of plain text (privacy, terms, support), laid out like the
// website's, with small pieces for paragraphs, headings and bullet lists.
export function ProsePage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* The browser tab's title when you get here from another screen (the built page already has it). */}
      <Head><title>{`${title} · Function`}</title></Head>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-12">
        <BackButton fallback="/" className="mb-4" />
        <Heading className="text-4xl" testID="prose-title">{title}</Heading>
        {updated && <Muted className="mt-2 text-sm">Last updated {updated}</Muted>}
        <View className="mt-8 gap-4">{children}</View>
        <SiteFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

export const P = ({ children }: { children: ReactNode }) => <T className="leading-7">{children}</T>;
export const H2 = ({ children }: { children: ReactNode }) => <T variant="display-bold" className="mt-4 text-xl">{children}</T>;
export const B = ({ children }: { children: ReactNode }) => <T variant="bold">{children}</T>;
export function Li({ children }: { children: ReactNode }) {
  return (
    <View className="ml-2 flex-row gap-2">
      <T className="leading-7">•</T>
      <T className="flex-1 leading-7">{children}</T>
    </View>
  );
}

// Remove once the page has been checked properly before launch.
export function DraftBanner() {
  return (
    <View className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3">
      <T variant="semibold" className="text-sm text-danger">Draft: this page must be reviewed before Function launches publicly.</T>
    </View>
  );
}
