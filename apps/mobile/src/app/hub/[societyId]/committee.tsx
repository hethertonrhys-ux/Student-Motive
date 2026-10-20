import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { leaveManagement, type HubSociety } from "@function/shared";
import { LinkButton } from "@/components/event/panels";
import { HubGate, HubLayout } from "@/components/hub/hub-layout";
import { ManagersPanel } from "@/components/hub/managers";
import { Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// The Hub's Committee page: who manages the society, adding more (by name
// or email), and the committee handover: next year's committee is added
// here, then the current managers remove themselves ("Remove me"). The
// last manager can't leave.
export default function HubCommitteeScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  return (
    <HubGate societyId={societyId}>
      {(hub) => (
        <HubLayout hub={hub} current="committee">
          <Committee hub={hub} />
        </HubLayout>
      )}
    </HubGate>
  );
}

function Committee({ hub }: { hub: HubSociety }) {
  const s = hub.society;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setError(null);
    setLeaving(true);
    const r = await leaveManagement(supabase, s.id);
    if (r.error) {
      setLeaving(false);
      return setError(r.error);
    }
    // Your list of societies must be loaded afresh (a remembered list would
    // send you straight back here), then go to it.
    queryClient.removeQueries({ queryKey: ["my-hub"] });
    router.replace("/hub" as never);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hub", s.id] }),
      queryClient.invalidateQueries({ queryKey: ["my-hub-count"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["managed", s.id], refetchType: "none" }),
      queryClient.invalidateQueries({ queryKey: ["membership", s.id] }),
      queryClient.invalidateQueries({ queryKey: ["societies-tab"] }),
    ]);
  }

  return (
    <View className="gap-6">
      <View>
        <Heading>Committee</Heading>
        <Muted className="mt-1">Everyone here can manage {s.name} on Function: post events, edit the page and choose features.</Muted>
      </View>
      <ManagersPanel societyId={s.id} />
      {hub.isCommittee && (
        <Card className="gap-3" testID="handover">
          <T variant="display-bold" className="text-lg">Handing over</T>
          <Muted className="text-sm">New committee? Add next year&apos;s managers above first, then remove yourself.</Muted>
          <View className="self-start">
            <LinkButton danger onPress={() => void leave()} disabled={leaving} confirmText={`Remove yourself as a manager of ${s.name}? You'll lose access to its Hub.`} testID="leave-management">{leaving ? "Removing…" : "Remove me"}</LinkButton>
          </View>
          {error && <T variant="semibold" className="text-sm text-danger" testID="leave-error">{error}</T>}
        </Card>
      )}
    </View>
  );
}
