import { MailLink } from "@/components/landing";
import { B, H2, Li, P, ProsePage } from "@/components/prose-page";
import { CONTACT_EMAIL } from "@/lib/site";

export const generateMetadata = () => ({ title: "Privacy policy · Function" });

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="15 October 2026">
      <P>
        This policy explains what personal data Function collects, why, and your rights under UK data protection law
        (UK GDPR and the Data Protection Act 2018). Function is run by its founders, who are the data controller.
        Contact: <MailLink email={CONTACT_EMAIL} />.
      </P>

      <H2>What we collect</H2>
      <Li><B>Your university email address</B>, to log you in and confirm you&apos;re a student.</Li>
      <Li><B>Your profile</B>: the name, course and short bio you choose. Other students can see these; your email is never shown.</Li>
      <Li><B>Societies you follow and events you join</B>, to show you relevant events. For society events, other students only see totals. At student-hosted events, the host and other guests can see who&apos;s going.</Li>
      <Li><B>Your friends and friend requests</B>, so you can find each other and see friends-only events.</Li>
      <Li><B>Messages</B> you send in event chats and private chats. Only the people in that chat can read them. We only look at a message if someone reports it.</Li>
      <Li><B>Addresses of events you host</B>. Only you and people going can see the exact address; everyone else sees the rough area.</Li>
      <Li><B>Your location, only if you allow it</B>, to show you on the map and how far away events are. It stays on your device and isn&apos;t sent to or stored on our servers.</Li>
      <Li><B>Reports and blocks</B> you make, to keep Function safe.</Li>
      <Li><B>Content societies post</B>: event details and images.</Li>

      <H2>Why we use it (lawful basis)</H2>
      <P>
        We use your data to provide the service you signed up for (contract), and to keep Function safe and working
        (legitimate interests). Where we ask for permission, such as location or notifications, we rely on your
        consent, and you can withdraw it at any time in your phone&apos;s settings.
      </P>

      <H2>Who we share it with</H2>
      <P>
        We don&apos;t sell your data. We use trusted providers to run Function: Supabase (database and login) and
        Vercel (website hosting). They process data only on our instructions.
      </P>

      <H2>How long we keep it</H2>
      <P>We keep your account data until you delete your account. Deleting your account removes your profile, friends, follows, events you host and &ldquo;going&rdquo; history. Messages you sent show as from a &ldquo;Former member&rdquo;.</P>

      <H2>Your rights</H2>
      <P>
        You can ask to see, correct, export or delete your data, or object to how we use it. Email{" "}
        <MailLink email={CONTACT_EMAIL} />. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).
      </P>
    </ProsePage>
  );
}
