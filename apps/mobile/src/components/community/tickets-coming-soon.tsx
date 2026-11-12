import { View } from "react-native";
import { Icon } from "@/components/icon";
import { Card, Muted, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

// The Tickets tab of a community's page until the ticket marketplace
// arrives (phase 2 of the communities plan). The same look as the map's
// "coming soon" card.
export function TicketsComingSoon({ name }: { name: string }) {
  const { colors } = useTheme();
  return (
    <Card className="items-center gap-3 px-6 py-10" testID="tickets-coming-soon">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
        <Icon name="ticket" size={28} color={colors.brand} />
      </View>
      <T variant="display-bold" className="text-center text-xl">Ticket marketplace coming soon</T>
      <Muted className="text-center">Buy and sell tickets with other members of {name}. Coming soon.</Muted>
    </Card>
  );
}
