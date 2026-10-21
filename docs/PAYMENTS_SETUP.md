# Paid plans (Stripe): setting up and testing

Everything is built for **Stripe test mode**. The functions refuse a live
key (`sk_live_…`) unless the `STRIPE_LIVE_MODE` secret is set to `on`, so no
real money can move by accident.

Where the keys go:

| Key | Where | Who can see it |
|---|---|---|
| Secret key `sk_test_…` | Supabase → Edge Functions → Secrets: `STRIPE_SECRET_KEY` | Only the server. Never in the app, never in GitHub, never in a chat. |
| Webhook signing secrets `whsec_…` (two) | Supabase secrets: `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Only the server. |
| Worker password (make one up) | Supabase secret `PAYMENTS_WORKER_SECRET`, and in `supabase/RUN_ONCE_payments_cron.sql` before running it | Only the server. |
| Publishable key `pk_test_…` | `apps/mobile/eas.json` (add a line `"EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY": "pk_test_…"` to each profile's `env`; EAS won't build with it there but empty); and Vercel → function-app → Settings → Environment Variables (same name) | Public by design (it can only start payments). |

## 1. Database

Run `supabase/migrations/20261129000000_split_payments.sql` in the Supabase
SQL Editor (safe to run twice).

## 2. Stripe test keys

1. dashboard.stripe.com → turn on **Test mode** (top right).
2. Developers → **API keys**: copy the **Secret key** (`sk_test_…`) and the
   **Publishable key** (`pk_test_…`).

## 3. Deploy the functions (PowerShell, from `C:\Users\rhysh\Student-Motive`)

```
npx supabase login
npx supabase link --project-ref xrpbmcoptyrpgkdowfdt
npx supabase functions deploy stripe-connect
npx supabase functions deploy stripe-pay
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy stripe-worker --no-verify-jwt
```

## 4. Secrets (Supabase → Edge Functions → Secrets → Add new secret)

- `STRIPE_SECRET_KEY` = the `sk_test_…` key
- `PAYMENTS_WORKER_SECRET` = a long random password you make up
- `SITE_URL` = `https://app.studentfunction.com`
- (the two webhook secrets come in step 5)

## 5. Webhooks (Stripe → Developers → Webhooks → Add endpoint), in test mode

Both use the URL `https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/stripe-webhook`.

1. **Your account** ("Events on your account"): select
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `checkout.session.completed`, `charge.refunded`, `refund.updated`,
   `refund.failed`, `charge.dispute.created`. Save, click **Reveal** under
   Signing secret, and add it in Supabase as `STRIPE_WEBHOOK_SECRET`.
2. **Connected accounts** ("Events on Connected accounts"): select
   `account.updated`. Add its signing secret as
   `STRIPE_CONNECT_WEBHOOK_SECRET`.

## 6. The timer

Open `supabase/RUN_ONCE_payments_cron.sql`, replace
`<PAYMENTS_WORKER_SECRET>` with your password, and run it once in the SQL
Editor. Every minute it sends queued refunds to Stripe and pays hosts out
48 hours after their plans end.

## 7. Connect settings (Stripe → Settings → Connect)

- **Express**: your branding (name Function, icon, colour #DA291C).
- **Onboarding options → Business details**: leave the website optional
  (Function sends each host's profile link).
- **Payouts**: allow your platform to manage payout schedules (Function
  sets hosts' payouts to manual and pays out after each plan).

## 8. Apple Pay (needs the new 1.4.0 app build)

1. developer.apple.com → Certificates, Identifiers & Profiles →
   **Identifiers** → + → **Merchant IDs** → Description `Function`,
   Identifier `merchant.com.studentfunction` → Register.
2. Stripe (test mode) → Settings → Payment methods → **Apple Pay** →
   **Add new application** (iOS certificate) → download the **CSR** file.
3. Back in Apple: your Merchant ID → **Apple Pay Payment Processing
   Certificate** → Create Certificate → upload the CSR → download the
   `.cer` file.
4. Upload the `.cer` to Stripe on the same page.
5. Apple: Identifiers → your app (`com.studentfunction.app`) → make sure
   **Apple Pay Payment Processing** is ticked with your Merchant ID (the new
   build's settings add it; EAS asks to sync capabilities when building).

## 9. The app

1. The Stripe SDK is native, so phones need a **new build (1.4.0)**:
   expo.dev → Build from GitHub → iOS, `expo-app`, production, auto-submit.
   It doesn't work in Expo Go (you use TestFlight builds, which is right).
   This can be done before you have the keys: payments just stay off.
2. Add the `pk_test_…` key to `apps/mobile/eas.json`: in each of the three
   profiles' `env`, add `"EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY": "pk_test_…"`
   (mind the comma on the line before). Never leave it as `""`: EAS refuses
   to build with an empty value. Add it to Vercel's environment variables
   too (same name), then redeploy the website.
3. Once that's merged, `npm run send-update` (or the "Send update to phones"
   workflow) switches payments on in the 1.4.0 build. No new build needed.

## Testing on your phone (test mode, no real money)

Test cards: `4242 4242 4242 4242` (works), `4000 0000 0000 0002` (declined),
any future date, any CVC. Apple Pay in test mode uses a real card in your
Wallet but never charges it.

When setting up payouts in test mode, Stripe accepts test data: phone
`000 000 0000`, SMS code `000000`, date of birth `01/01/1901`, sort code
`10-88-00`, account number `00012345`, address line `address_full_match`.

1. **Payouts:** Me → Payouts → Set up with Stripe → fill in the test data →
   back in the app it says "Payouts set up".
2. **Paid plan:** Social → + Host → Costs money → £80, 10 spaces → £8.00 per
   person → Collect payments in Function → Add it to each share → publish.
3. **Pay:** with a second account, join the plan → Pay £8.33 → card 4242… or
   Apple Pay → "You've paid £8.33"; the host gets a notification and sees
   a green Paid tick.
4. **Declined card:** pay with 4000 0000 0000 0002 → Stripe says declined;
   still "Not paid yet".
5. **Refund declined:** second account → Request refund (with a reason) →
   host → Decline → they keep their place, still Paid.
6. **Refund approved:** Request refund again → host → Approve → within a
   minute "Your refund is on its way"; Stripe dashboard → Payments shows it
   refunded; they leave the plan.
7. **Event cancelled:** pay again → host → Cancel event → within a minute
   everyone who paid is refunded.
8. **Removed after paying:** host removes someone who paid → refunded.
9. **Payout:** in test mode, plans ending 48 hours ago are paid out by the
   timer; Stripe → Connect → the host's account → Payouts shows it.
