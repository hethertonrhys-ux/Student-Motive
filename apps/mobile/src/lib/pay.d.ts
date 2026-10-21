// Metro picks pay.native.ts or pay.web.ts.
export declare const STRIPE_PUBLISHABLE_KEY: string;
export type PayResult = { done: true } | { cancelled: true } | { error: string } | { redirecting: true };
// Paying your share of a paid plan: Stripe's payment sheet in the app (Apple
// Pay or card), Stripe's checkout page on the website.
export declare function usePay(): (eventId: string) => Promise<PayResult>;
