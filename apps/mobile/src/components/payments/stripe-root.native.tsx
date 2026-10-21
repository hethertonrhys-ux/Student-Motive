import { StripeProvider } from "@stripe/stripe-react-native";
import type { ReactNode } from "react";
import { STRIPE_PUBLISHABLE_KEY } from "@/lib/pay";

// Stripe's payment sheet (Apple Pay and cards) needs this around the app.
// Only the publishable key (pk_…) is ever in the app.
export function StripeRoot({ children }: { children: ReactNode }) {
  if (!STRIPE_PUBLISHABLE_KEY) return <>{children}</>;
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.studentfunction" urlScheme="function">
      <>{children}</>
    </StripeProvider>
  );
}
