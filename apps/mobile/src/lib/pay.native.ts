import { useStripe } from "@stripe/stripe-react-native";
import { startSheetPayment } from "@function/shared";
import { supabase } from "@/lib/supabase";

export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export type PayResult = { done: true } | { cancelled: true } | { error: string } | { redirecting: true };

// Stripe's payment sheet: Apple Pay (on iPhone, once a card is in Wallet)
// or a card. "done" means Stripe accepted it; it shows as Paid once Stripe's
// webhook has confirmed it to Function (usually a second or two).
export function usePay() {
  const stripe = useStripe();
  return async (eventId: string): Promise<PayResult> => {
    if (!STRIPE_PUBLISHABLE_KEY) return { error: "Payments aren't switched on yet." };
    const started = await startSheetPayment(supabase, eventId);
    if ("error" in started) return { error: started.error };
    const init = await stripe.initPaymentSheet({
      merchantDisplayName: "Function",
      paymentIntentClientSecret: started.clientSecret,
      applePay: { merchantCountryCode: "GB" },
      googlePay: { merchantCountryCode: "GB", currencyCode: "GBP", testEnv: STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_") },
      returnURL: "function://stripe-redirect",
      allowsDelayedPaymentMethods: false,
    });
    if (init.error) return { error: init.error.message || "Couldn't open the payment. Please try again." };
    const shown = await stripe.presentPaymentSheet();
    if (shown.error) return shown.error.code === "Canceled" ? { cancelled: true } : { error: shown.error.message || "The payment didn't go through." };
    return { done: true };
  };
}
