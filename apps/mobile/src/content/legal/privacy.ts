// The Privacy Policy, shown in the app (Me → Terms and policies) and at
// studentfunction.com/privacy. See README.md in this folder for how to edit it.
//
// DRAFT: the payments parts (marked "Payments") were added 21 October 2026
// for review by the Function team before payments go live.
export const title = "Privacy Policy";
export const updated = "21 October 2026";

export default `
This policy explains what personal data Function collects, why, and your rights under UK data protection law (UK GDPR and the Data Protection Act 2018). Function is run by its founders, who are the data controller. Contact: management@studentfunction.com.

## What we collect

- **Your university email address**, to log you in and confirm you're a student.
- **Your account details**: your full name and nickname, university and graduation year. Other students see your name, university and the profile details you fill in; your email is never shown.
- **Your profile**: your profile picture and up to 5 photos, your course and short bio, your prompts and your Two truths and a lie answers.
- **Societies you follow, join or claim to manage, and events you join**, to show you relevant events. For society events, other students only see totals unless they are members. At student-hosted events, the host and other guests can see who's going.
- **Tables and results at society events**, if your society runs them: where you sat, the result you or the committee enter, and who has settled up with whom. These are records the players keep themselves; Function never takes or moves money.
- **Your friends and friend requests**, so you can find each other and see friends-only events.
- **Messages, photos and videos** you send in event chats and private chats. Only the people in that chat can see them. We only look at something sent in a chat if someone reports it.
- **Addresses of events you host**. Only you and people going can see the exact address; everyone else sees the rough area.
- **Your location, only if you allow it**. "Near me" and the dot on the map are worked out on your phone and never sent to us. If you ask for walking directions, your location and the event's location are sent to the OpenStreetMap routing service to work out the route; neither we nor they keep it.
- **Your camera, only if you allow it**, to take photos and videos for chats and to scan friends' QR codes. Nothing is recorded unless you choose to send it.
- **Notifications**: a push token for each phone or browser you allow notifications on, and your notification preferences.
- **Security**: your two-factor authentication method, including a phone number if you choose text messages.
- **A few counters for us**: which sign-up steps you reached and what you searched for across all London unis, so we can see where Function needs work.
- **Reports and blocks** you make, to keep Function safe. A report records who made it, what was reported, the reason, any note and the time; the Function team gets an email with these details so we can review it. The person you report isn't told who reported them.
- **Content societies post**: event details and images.
- **Payments** (paid plans): what you paid for, the amount, when, and whether it was refunded, plus any refund reason you give. Your card or Apple Pay details are handled by Stripe, our payments partner; Function never sees your full card number. Hosts give their name, date of birth, address, bank details and sometimes ID to Stripe, not to Function: we only keep their Stripe account number and whether payouts are set up.

## Why we use it (lawful basis)

We use your data to provide the service you signed up for (contract), and to keep Function safe and working (legitimate interests). Where we ask for permission, such as location, camera or notifications, we rely on your consent, and you can withdraw it at any time in your phone's settings.

## Who we share it with

We don't sell your data. We use trusted providers to run Function: Supabase (database, login and photo storage), Vercel (website hosting), Resend (sending login and report emails), and Expo with Apple and Google (delivering push notifications). They process data only on our instructions. Payments are processed by Stripe Payments UK Ltd, which also checks hosts' identity and bank details as the law requires; Stripe is responsible for that data under its own privacy policy (stripe.com/gb/privacy). The map itself comes from OpenFreeMap (map tiles; like any website, it sees your IP address and the area of the map you look at), walking directions from the OpenStreetMap routing service run by FOSSGIS, and place search from Komoot's Photon service (it receives the place names you type when choosing an event location).

## How long we keep it

We keep your account data until you delete your account. Deleting your account removes your profile, photos, friends, follows, events you host and "going" history. Messages you sent show as from a "Former member". Poker results keep the name you played under and your result, so a table's totals still add up, and the sign-up and search counters are kept without your account id. If an account is suspended or banned, we keep a record of that and the reason. Payment records are kept for 6 years after the payment, because UK tax law requires it, even if you delete your account (without your profile).

## Deleting your account

In the app: Me → My profile → Edit your profile → Delete my account, at the bottom. Or email help@studentfunction.com and we'll do it for you.

## Your rights

You can ask to see, correct, export or delete your data, or object to how we use it. Email help@studentfunction.com. You can also complain to the Information Commissioner's Office (ico.org.uk).
`;
