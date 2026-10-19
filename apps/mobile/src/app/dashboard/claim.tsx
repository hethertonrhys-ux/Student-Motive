import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadClaimSocieties, submitClaim } from "@function/shared";
import { Select } from "@/components/select";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { CONTACT_EMAIL } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Ask to manage a society. Once the Function team has checked you're on
// the committee, you can post events for it.
export default function ClaimScreen() {
  const { society: chosen } = useLocalSearchParams<{ society?: string }>();
  const { session } = useSession();
  const { profile } = useProfile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const societies = useQuery({ queryKey: ["claim-societies", profile?.university ?? null], queryFn: () => loadClaimSocieties(supabase, profile!.university), enabled: !!profile });
  const [societyId, setSocietyId] = useState(chosen ?? "");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const myId = session?.user.id ?? null;
  async function send() {
    if (!myId) return;
    setSending(true);
    setError(null);
    const r = await submitClaim(supabase, myId, { societyId, committeeRole: role, message });
    setSending(false);
    if (r.error) return setError(r.error);
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    router.replace("/dashboard" as never);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <Link href={"/dashboard" as never} asChild>
          <Pressable className="self-start">
            <T variant="semibold" className="text-sm text-muted">← Society dashboard</T>
          </Pressable>
        </Link>
        <Heading className="mt-3">Manage a society</Heading>
        <Muted className="mb-8 mt-2">Choose your society. Once we&apos;ve checked you&apos;re on the committee, you can post events for it.</Muted>
        {!session ? (
          <Card className="flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in first.</T>
            <Link href={{ pathname: "/login", params: { next: "/dashboard/claim" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : (
          <Card className="gap-5">
            <View>
              <Label>Society</Label>
              <Select value={societyId} onChange={setSocietyId} options={(societies.data ?? []).map((s) => ({ value: s.id, label: s.name }))} placeholder="Choose your society…" accessibilityLabel="Society" testID="claim-society" />
            </View>
            <View>
              <Label>Your role on the committee</Label>
              <Input value={role} onChangeText={setRole} placeholder="e.g. President, Events Officer" testID="claim-role" />
            </View>
            <View>
              <Label>Anything else? <Muted className="text-sm">(optional)</Muted></Label>
              <TextInput value={message} onChangeText={setMessage} multiline placeholder="e.g. a link to the committee page on the SU website" placeholderTextColor="rgba(94, 93, 120, 0.7)" className="min-h-20 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-sans text-base text-ink web:outline-none web:focus:border-brand" style={{ textAlignVertical: "top" }} />
            </View>
            {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
            <Button onPress={() => void send()} disabled={sending} className="self-start" testID="claim-send">{sending ? "Sending…" : "Send request"}</Button>
          </Card>
        )}
        <Muted className="mt-6 text-sm">Society not listed? Email us at <T variant="semibold" className="text-sm text-brand">{CONTACT_EMAIL}</T> and we&apos;ll add it.</Muted>
      </ScrollView>
    </SafeAreaView>
  );
}
