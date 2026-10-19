import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { approveMember, DEFAULT_UNI, inviteMembers, loadManagedSociety, loadMembers, removeInvite, removeMember, uniById, type InviteResult } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { LinkButton } from "@/components/event/panels";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The society's members: requests to approve, the membership list, and
// adding members by email (pasted from the SU list).
export default function MembersScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const managed = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  const members = useQuery({ queryKey: ["members", societyId], queryFn: () => loadMembers(supabase, societyId), enabled: !!session && !!managed.data });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["members", societyId] }), queryClient.invalidateQueries({ queryKey: ["managed", societyId] })]);
  const [emails, setEmails] = useState("");
  const [invite, setInvite] = useState<InviteResult>({});
  const [pending, setPending] = useState(false);
  const society = managed.data?.society;
  const rows = members.data ?? [];
  const waiting = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const invited = rows.filter((r) => r.status === "invited");
  const domain = (uniById(society?.university) ?? uniById(DEFAULT_UNI)!).domains[0];

  async function add() {
    if (!society) return;
    setPending(true);
    const r = await inviteMembers(supabase, society, emails);
    setPending(false);
    setInvite(r);
    if (!r.error) {
      setEmails("");
      await refresh();
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={`/dashboard/${societyId}`} />
        <Heading className="mt-3">Members</Heading>
        {!society ? (
          <Muted className="mt-2">{managed.isPending ? "Loading…" : "You don't run this society."}</Muted>
        ) : (
          <>
            <Muted className="mt-1">{approved.length} {approved.length === 1 ? "member" : "members"}{waiting.length > 0 && ` · ${waiting.length} waiting for approval`}</Muted>
            {waiting.length > 0 && (
              <View className="mt-8" testID="waiting">
                <T variant="display" className="text-xl">Asking to join</T>
                <View className="mt-3 gap-2">
                  {waiting.map((m) => (
                    <Card key={m.user_id} className="flex-row flex-wrap items-center justify-between gap-3 py-3" testID={`waiting-${m.user_id}`}>
                      <View className="flex-1">
                        <T variant="semibold">{m.name}</T>
                        <Muted className="text-sm">{m.email}</Muted>
                      </View>
                      <View className="flex-row gap-2">
                        <Button className="py-2" onPress={() => void approveMember(supabase, societyId, m.user_id!).then(refresh)} testID="approve-member">Approve</Button>
                        <Button variant="ghost" className="py-2" onPress={() => void removeMember(supabase, societyId, m.user_id!).then(refresh)} testID="decline-member">Decline</Button>
                      </View>
                    </Card>
                  ))}
                </View>
              </View>
            )}
            <Card className="mt-8 gap-3">
              <Label>Add members by email</Label>
              <Input value={emails} onChangeText={setEmails} multiline autoCapitalize="none" autoCorrect={false} placeholder={`a.student@${domain}\nb.student@${domain}`} className="min-h-28 text-sm" style={{ textAlignVertical: "top" }} testID="invite-emails" />
              <Muted className="text-xs">Paste your SU membership list: one email per line, or separated by commas. People already on Function are approved now; everyone else is approved automatically when they sign up.</Muted>
              {invite.error && <T variant="semibold" className="text-sm text-danger">{invite.error}</T>}
              {invite.added !== undefined && <T variant="semibold" className="text-sm text-ok" testID="invite-added">Added {invite.added} {invite.added === 1 ? "email" : "emails"}.</T>}
              {invite.skipped && invite.skipped.length > 0 && <T variant="semibold" className="text-sm text-danger">Not added (not {invite.uni} emails, and this society is for {invite.uni} students): {invite.skipped.join(", ")}</T>}
              <Button className="self-start" onPress={() => void add()} disabled={pending} testID="invite-add">{pending ? "Adding…" : "Add members"}</Button>
            </Card>
            <View className="mt-8" testID="members">
              <T variant="display" className="text-xl">Members ({approved.length})</T>
              {approved.length === 0 ? (
                <Muted className="mt-2">No members yet. Add your membership list above.</Muted>
              ) : (
                <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
                  {approved.map((m, i) => (
                    <View key={m.user_id} className={`flex-row items-center justify-between gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`} testID={`member-${m.user_id}`}>
                      <View className="min-w-0 flex-1">
                        <T variant="semibold">{m.name} <Muted className="text-sm">{m.email}</Muted></T>
                      </View>
                      <LinkButton onPress={() => void removeMember(supabase, societyId, m.user_id!).then(refresh)} confirmText={`Remove ${m.name ?? m.email} from the society?`} danger testID="remove-member">Remove</LinkButton>
                    </View>
                  ))}
                </View>
              )}
            </View>
            {invited.length > 0 && (
              <View className="mt-8" testID="invited">
                <T variant="display" className="text-xl">Added, not on Function yet ({invited.length})</T>
                <Muted className="mt-1 text-sm">They&apos;ll become members automatically when they log in and join.</Muted>
                <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
                  {invited.map((m, i) => (
                    <View key={m.email} className={`flex-row items-center justify-between gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
                      <T className="flex-1 text-sm">{m.email}</T>
                      <LinkButton onPress={() => void removeInvite(supabase, societyId, m.email).then(refresh)} danger testID="remove-invite">Remove</LinkButton>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
