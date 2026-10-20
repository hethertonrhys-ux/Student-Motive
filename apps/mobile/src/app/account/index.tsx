import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteMyAccount, loadMyProfile, setShowSocieties } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { AccountDetailsForm } from "@/components/account/details-form";
import { AccountTabs } from "@/app/account/security";
import { Icon } from "@/components/icon";
import { MyFive } from "@/components/profile/my-five";
import { PhotoPicker } from "@/components/profile/photo-picker";
import { PromptsEditor } from "@/components/profile/prompts-editor";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useInvalidateProfile, useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Your profile, as other students see it: picture, your 5 photos, name
// and course, whether your societies show, and your prompts.
export default function AccountScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const invalidateProfile = useInvalidateProfile();
  const myId = session?.user.id ?? null;
  const me = useQuery({ queryKey: ["my-profile", myId], queryFn: () => loadMyProfile(supabase, myId!), enabled: !!myId });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["my-profile", myId] }), queryClient.invalidateQueries({ queryKey: ["person", myId] }), invalidateProfile()]);

  if (!session) {
    return (
      <Screen>
        <Card className="flex-row flex-wrap items-center justify-between gap-3">
          <T variant="semibold">Log in to edit your profile.</T>
          <Link href={{ pathname: "/login", params: { next: "/account" } }} asChild>
            <Button>Log in</Button>
          </Link>
        </Card>
      </Screen>
    );
  }
  const data = me.data;
  return (
    <Screen>
      <Heading>Account settings</Heading>
      <AccountTabs current="profile" />
      <Muted className="mt-4">Other students see this when they find you or you join events. Your email is never shown.</Muted>
      <Link href={`/u/${myId}` as never} asChild>
        <Button className="mt-4 gap-2 py-3" testID="preview-profile">
          <Icon name="eye-outline" size={20} color="#fff" />
          <T variant="bold" className="text-brand-ink">Preview profile</T>
        </Button>
      </Link>
      {!data ? (
        <Muted className="mt-6">Loading…</Muted>
      ) : (
        <>
          <Card className="mt-6">
            <PhotoPicker myId={myId!} name={data.display_name} url={data.avatar_url} onChanged={refresh} />
          </Card>
          <Card className="mt-6">
            <MyFive myId={myId!} photos={data.photos.filter((p) => p.current)} archived={data.photos.filter((p) => !p.current).length} onChanged={refresh} />
          </Card>
          <Card className="mt-6">
            <ShowSocietiesToggle myId={myId!} initial={data.showSocieties} />
          </Card>
          <Card className="mt-6">
            <AccountDetailsForm myId={myId!} email={session.user.email ?? ""} initial={{ fullName: data.full_name, nickname: data.nickname, graduationYear: data.graduation_year, university: data.university, course: data.course, country: data.country }} withCourse withCountry submitLabel="Save" onSaved={refresh} />
          </Card>
          <PromptsEditor initial={data.prompts} uni={profile?.university ?? null} twoTruths={data.twoTruths} onChanged={refresh} />
          <DeleteAccount />
        </>
      )}
    </Screen>
  );
}

function ShowSocietiesToggle({ myId, initial }: { myId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <Pressable
      onPress={async () => {
        const next = !on;
        setOn(next);
        setPending(true);
        const r = await setShowSocieties(supabase, myId, next);
        if (r.error) setOn(!next);
        setPending(false);
      }}
      disabled={pending}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      className="flex-row items-start justify-between gap-4"
      testID="show-societies"
    >
      <View className="flex-1">
        <T variant="semibold">Show my societies on my profile</T>
        <Muted className="text-sm">Societies you&apos;re a member of or on the committee of.</Muted>
      </View>
      <View className={`mt-1 h-5 w-5 items-center justify-center rounded-md border ${on ? "border-brand bg-brand" : "border-line bg-surface"}`}>{on && <Icon name="checkmark" size={14} color="#fff" />}</View>
    </Pressable>
  );
}

// Deleting your account for good, with a clear "are you sure?" first
// (the App Store requires every app with sign-up to offer this).
function DeleteAccount() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const warning = "Delete your account? This removes your profile, photos, friends, societies, events you host and your going history. It can't be undone.";
  async function remove() {
    setPending(true);
    setError(null);
    const r = await deleteMyAccount(supabase);
    setPending(false);
    if (r.error) return setError(r.error);
    queryClient.clear();
    router.replace("/");
  }
  function confirm() {
    if (Platform.OS === "web") {
      if (window.confirm(warning)) void remove();
      return;
    }
    Alert.alert("Delete your account?", warning, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void remove() }]);
  }
  return (
    <Card className="mt-6 gap-2 border-danger/40">
      <T variant="semibold">Delete my account</T>
      <Muted className="text-sm">Removes your profile and everything linked to it. Messages you sent stay, shown as from a &ldquo;Former member&rdquo;. This can&apos;t be undone.</Muted>
      <Pressable onPress={confirm} disabled={pending} className={`mt-1 self-start rounded-xl border border-danger px-4 py-2 ${pending ? "opacity-50" : ""}`} testID="delete-account">
        <T variant="semibold" className="text-danger">{pending ? "Deleting…" : "Delete my account"}</T>
      </Pressable>
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </Card>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback="/(tabs)/me" className="mb-4" />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
