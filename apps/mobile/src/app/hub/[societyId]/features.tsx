import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { HubGate, HubLayout } from "@/components/hub/hub-layout";
import { FeatureChecklist } from "@/components/hub/feature-checklist";
import { Heading, Muted } from "@/components/ui";

// The Hub's Features page: the society's features as a checklist, to change
// at any time. Switching a feature off hides it from new events and your
// tools; events already using it keep working.
export default function HubFeaturesScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  return (
    <HubGate societyId={societyId}>
      {(hub) => (
        <HubLayout hub={hub} current="features">
          <View className="gap-6">
            <View>
              <Heading>Features</Heading>
              <Muted className="mt-1">Choose the tools {hub.society.name} uses. Changes save straight away. Switching one off hides it from new events; events already using it keep working.</Muted>
            </View>
            <FeatureChecklist societyId={hub.society.id} subject={hub.features} university={hub.society.university} />
          </View>
        </HubLayout>
      )}
    </HubGate>
  );
}
