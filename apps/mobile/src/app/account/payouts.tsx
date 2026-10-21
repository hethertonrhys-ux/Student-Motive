import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { loadPayoutState, payoutDashboardLink, payoutSetupLink } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Muted, Screen, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// Me → Payouts: getting paid for plans you host. Stripe (not Function)
// collects and checks your bank details and ID, on its own pages; you can
// see payouts and change your bank account in your Stripe dashboard.
export default function PayoutsScreen() {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const { stripe: back } = useLocalSearchParams<{ stripe?: string }>();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["payout-state", myId], queryFn: () => loadPayoutState(supabase), enabled: !!myId });
  useRefetchOnFocus(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = status.data && !("error" in status.data) ? status.data.state : null;

  async function open(get: () => Promise<{ url: string } | { error: string }>) {
    setBusy(true);
    setError(null);
    const link = await get();
    if ("error" in link) {
      setError(link.error);
      setBusy(false);
      return;
    }
    if (Platform.OS === "web") {
      window.location.assign(link.url);
      return;
    }
    await WebBrowser.openBrowserAsync(link.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
    // Back from Stripe: check what it says now.
    await Promise.all([status.refetch(), queryClient.invalidateQueries({ queryKey: ["payouts-ready"] })]);
    setBusy(false);
  }

  return (
    <Screen>
      <BackButton fallback="/(tabs)/me" />
      <Heading className="mt-3">Payouts</Heading>
      <Muted className="mt-1">Get paid for plans you host that cost money. People pay their share in the app, and it goes to your bank account.</Muted>

      {back === "done" && state !== "ready" && <T variant="semibold" className="mt-4 text-sm">Thanks. Stripe is checking your details, which usually takes a minute or two.</T>}

      <Card className="mt-6 gap-3" testID="payout-status">
        {status.isPending ? (
          <Muted>Checking…</Muted>
        ) : status.data && "error" in status.data ? (
          <T variant="semibold" className="text-sm text-danger">{status.data.error}</T>
        ) : state === "ready" ? (
          <>
            <View className="flex-row items-center gap-2">
              <Icon name="checkmark-circle" size={24} color="#1e9e5a" />
              <T variant="headline" testID="payouts-state">Payouts set up</T>
            </View>
            <Muted className="text-sm">Money from each plan reaches your bank about 2 days after it ends (Stripe then takes 1 to 3 working days). In your Stripe dashboard you can see your payouts and change your bank account.</Muted>
            <Button variant="ghost" onPress={() => void open(() => payoutDashboardLink(supabase))} disabled={busy} testID="open-dashboard">Open Stripe dashboard</Button>
          </>
        ) : (
          <>
            <View className="flex-row items-center gap-2">
              <Icon name={state === "incomplete" ? "alert-circle" : "card-outline"} size={24} color="#DA291C" />
              <T variant="headline" testID="payouts-state">{state === "incomplete" ? "Finish setting up payouts" : "Set up payouts"}</T>
            </View>
            <Muted className="text-sm">Stripe, our payments partner, asks for your name, date of birth, home address and bank details, and sometimes a photo of your ID. Function never sees or stores your bank details.</Muted>
            <Button onPress={() => void open(() => payoutSetupLink(supabase))} disabled={busy} testID="setup-payouts">{busy ? "Opening Stripe…" : state === "incomplete" ? "Continue with Stripe" : "Set up with Stripe"}</Button>
            {state === "incomplete" && <Button variant="ghost" onPress={() => void open(() => payoutDashboardLink(supabase))} disabled={busy} testID="open-dashboard">Open Stripe dashboard</Button>}
          </>
        )}
        {error && <T variant="semibold" className="text-sm text-danger" testID="payouts-error">{error}</T>}
      </Card>

      <Muted className="mt-6 text-xs">Payments are handled by Stripe. Hosting a paid plan means agreeing to Stripe&apos;s Connected Account Agreement, which Stripe shows you when you set up payouts.</Muted>
    </Screen>
  );
}
