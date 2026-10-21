import type { ReactNode } from "react";

// The website pays on Stripe's own checkout page, so nothing is needed here.
export function StripeRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
