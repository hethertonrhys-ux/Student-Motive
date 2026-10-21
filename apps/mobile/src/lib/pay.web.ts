import { startCheckout } from "@function/shared";
import { supabase } from "@/lib/supabase";

export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export type PayResult = { done: true } | { cancelled: true } | { error: string } | { redirecting: true };

// The website: off to Stripe's checkout page (Apple Pay, Google Pay or card),
// which comes back to the plan with ?paid=1.
export function usePay() {
  return async (eventId: string): Promise<PayResult> => {
    const started = await startCheckout(supabase, eventId);
    if ("error" in started) return { error: started.error };
    window.location.assign(started.url);
    return { redirecting: true };
  };
}
