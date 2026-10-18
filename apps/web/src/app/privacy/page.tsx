import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { DraftBanner } from "@/components/draft-banner";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="15 October 2026">
      <DraftBanner />
      <p>
        This policy explains what personal data Function collects, why, and your rights under UK data protection law
        (UK GDPR and the Data Protection Act 2018). Function is run by its founders, who are the data controller.
        Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your university email address</strong>, to log you in and confirm you&apos;re a student.</li>
        <li><strong>Your profile</strong>: the name, course and short bio you choose. Other students can see these; your email is never shown.</li>
        <li><strong>Societies you follow and events you join</strong>, to show you relevant events. For society events, other students only see totals. At student-hosted events, the host and other guests can see who&apos;s going.</li>
        <li><strong>Your friends and friend requests</strong>, so you can find each other and see friends-only events.</li>
        <li><strong>Messages</strong> you send in event chats and private chats. Only the people in that chat can read them. We only look at a message if someone reports it.</li>
        <li><strong>Addresses of events you host</strong>. Only you and people going can see the exact address; everyone else sees the rough area.</li>
        <li><strong>Your location, only if you allow it</strong>, to show you on the map and how far away events are. It stays on your device and isn&apos;t sent to or stored on our servers.</li>
        <li><strong>Reports and blocks</strong> you make, to keep Function safe.</li>
        <li><strong>Content societies post</strong>: event details and images.</li>
      </ul>

      <h2>Why we use it (lawful basis)</h2>
      <p>
        We use your data to provide the service you signed up for (contract), and to keep Function safe and working
        (legitimate interests). Where we ask for permission, such as location or notifications, we rely on your
        consent, and you can withdraw it at any time in your phone&apos;s settings.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We don&apos;t sell your data. We use trusted providers to run Function: Supabase (database and login) and
        Vercel (website hosting). They process data only on our instructions.
      </p>

      <h2>How long we keep it</h2>
      <p>We keep your account data until you delete your account. Deleting your account removes your profile, friends, follows, events you host and &ldquo;going&rdquo; history. Messages you sent show as from a &ldquo;Former member&rdquo;.</p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct, export or delete your data, or object to how we use it. Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You can also complain to the Information
        Commissioner&apos;s Office (ico.org.uk).
      </p>
    </ProsePage>
  );
}
