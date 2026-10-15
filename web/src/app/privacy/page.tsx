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
        This policy explains what personal data Motive collects, why, and your rights under UK data protection law
        (UK GDPR and the Data Protection Act 2018). Motive is run by its founders, who are the data controller.
        Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your university email address</strong>, to log you in and confirm you&apos;re a student.</li>
        <li><strong>Societies you follow and events you mark &ldquo;I&apos;m going&rdquo;</strong>, to show you relevant events. Other users only see totals, never your name.</li>
        <li><strong>Your location, only if you allow it</strong> in the app, to centre the map on you. It isn&apos;t stored on our servers.</li>
        <li><strong>Reports and blocks</strong> you make, to keep Motive safe.</li>
        <li><strong>Content societies post</strong>: event details and images.</li>
      </ul>

      <h2>Why we use it (lawful basis)</h2>
      <p>
        We use your data to provide the service you signed up for (contract), and to keep Motive safe and working
        (legitimate interests). Where we ask for permission, such as location or notifications, we rely on your
        consent, and you can withdraw it at any time in your phone&apos;s settings.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We don&apos;t sell your data. We use trusted providers to run Motive: Supabase (database and login) and
        Vercel (website hosting). They process data only on our instructions.
      </p>

      <h2>How long we keep it</h2>
      <p>We keep your account data until you delete your account. Deleting your account removes your profile, follows and &ldquo;going&rdquo; history.</p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct, export or delete your data, or object to how we use it. Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You can also complain to the Information
        Commissioner&apos;s Office (ico.org.uk).
      </p>
    </ProsePage>
  );
}
