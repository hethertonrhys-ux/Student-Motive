import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_UNI, logSignupEvent, uniById, uniFromEmail } from "@function/shared";
import { AccountDetailsForm } from "@/components/account/details-form";
import { Card, Heading, Muted, T } from "@/components/ui";
import { useInvalidateProfile, useProfile } from "@/lib/profile";
import { welcomed } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

// Creating your Function account, straight after the first log in (and for
// older accounts that are missing these details): full name, an optional
// nickname, your university (from your email) and the year you graduate.
// "About me" prompts aren't asked for here; the app suggests them after
// you join your first event.
export default function WelcomeScreen() {
  const router = useRouter();
  const { next: nextParam } = useLocalSearchParams<{ next?: string }>();
  const next = typeof nextParam === "string" && nextParam.startsWith("/") && nextParam !== "/welcome" ? nextParam : "/(tabs)/map";
  const { profile } = useProfile();
  const invalidateProfile = useInvalidateProfile();
  const uni = uniFromEmail(profile?.email) ?? uniById(profile?.university) ?? uniById(DEFAULT_UNI)!;
  const returning = !!profile && !!profile.display_name && !profile.full_name;

  useEffect(() => {
    if (profile) void logSignupEvent(supabase, "prompts_step_reached");
  }, [profile]);

  async function done() {
    await welcomed.set();
    await logSignupEvent(supabase, "account_details_completed");
    await invalidateProfile();
    router.replace(next as never);
  }

  if (!profile) return <View className="flex-1 bg-bg" />;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="mx-auto w-full max-w-md px-4 pb-16 pt-8">
          <Heading testID="welcome-heading">
            {returning ? "One more thing" : "Welcome to Function"}{uniFromEmail(profile.email) ? <> at <T variant="display" className="text-3xl" style={{ color: uni.accent }}>{uni.short}</T></> : null}!
          </Heading>
          <Muted className="mt-2">
            {returning ? "We now ask everyone for a few account details. It takes ten seconds." : "A few details to set up your account. Other students see your name (or nickname) and your uni; your email is never shown."}
          </Muted>
          <Card className="mt-6">
            <AccountDetailsForm myId={profile.id} email={profile.email} initial={{ fullName: profile.full_name ?? (returning ? profile.display_name : ""), nickname: profile.nickname, graduationYear: profile.graduation_year, university: profile.university }} submitLabel="Continue" onSaved={done} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
