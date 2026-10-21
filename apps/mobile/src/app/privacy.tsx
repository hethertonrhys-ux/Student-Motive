import { MailLink } from "@/components/landing";
import { B, H2, Li, P, ProsePage } from "@/components/prose-page";
import { CONTACT_EMAIL, SUPPORT_EMAIL } from "@/lib/site";

export const generateMetadata = () => ({ title: "Privacy policy · Function" });

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="21 October 2026">
      <P>
        This policy explains what personal data Function collects, why, and your rights under UK data protection law
        (UK GDPR and the Data Protection Act 2018). Function is run by its founders, who are the data controller.
        Contact: <MailLink email={CONTACT_EMAIL} />.
      </P>

      <H2>What we collect</H2>
      <Li><B>Your university email address</B>, to log you in and confirm you&apos;re a student.</Li>
      <Li><B>Your account details</B>: your full name and nickname, university, graduation year and, if you choose, your country. Other students see your name, university and the profile details you fill in; your email is never shown.</Li>
      <Li><B>Your profile</B>: your profile picture and up to 5 photos, your course and short bio, your prompts and your Two truths and a lie answers.</Li>
      <Li><B>Societies you follow, join or claim to manage, and events you join</B>, to show you relevant events. For society events, other students only see totals unless they are members. At student-hosted events, the host and other guests can see who&apos;s going.</Li>
      <Li><B>Tables and results at society events</B>, if your society runs them: where you sat, the result you or the committee enter, and who has settled up with whom. These are records the players keep themselves; Function never takes or moves money.</Li>
      <Li><B>Your friends and friend requests</B>, so you can find each other and see friends-only events.</Li>
      <Li><B>Messages</B> you send in event chats and private chats. Only the people in that chat can read them. We only look at a message if someone reports it.</Li>
      <Li><B>Addresses of events you host</B>. Only you and people going can see the exact address; everyone else sees the rough area.</Li>
      <Li><B>Your location, only if you allow it</B>. &ldquo;Near me&rdquo; and the dot on the map are worked out on your phone and never sent to us. If you ask for walking directions, your location and the event&apos;s location are sent to the OpenStreetMap routing service to work out the route; neither we nor they keep it.</Li>
      <Li><B>Notifications</B>: a push token for each phone or browser you allow notifications on, and your notification preferences.</Li>
      <Li><B>Security</B>: your two-factor authentication method, including a phone number if you choose text messages.</Li>
      <Li><B>A few counters for us</B>: which sign-up steps you reached and what you searched for across all London unis, so we can see where Function needs work.</Li>
      <Li><B>Reports and blocks</B> you make, to keep Function safe. A report records who made it, what was reported, the reason, any note and the time; the Function team gets an email with these details so we can review it. The person you report isn&apos;t told who reported them.</Li>
      <Li><B>Content societies post</B>: event details and images.</Li>

      <H2>Why we use it (lawful basis)</H2>
      <P>
        We use your data to provide the service you signed up for (contract), and to keep Function safe and working
        (legitimate interests). Where we ask for permission, such as location or notifications, we rely on your
        consent, and you can withdraw it at any time in your phone&apos;s settings.
      </P>

      <H2>Who we share it with</H2>
      <P>
        We don&apos;t sell your data. We use trusted providers to run Function: Supabase (database, login and photo
        storage), Vercel (website hosting), Resend (sending login emails), and Expo with Apple and Google (delivering
        push notifications). They process data only on our instructions. The map itself comes from OpenFreeMap
        (map tiles; like any website, it sees your IP address and the area of the map you look at), walking
        directions from the OpenStreetMap routing service run by FOSSGIS, and place search from Komoot&apos;s Photon
        service (it receives the place names you type when choosing an event location).
      </P>

      <H2>How long we keep it</H2>
      <P>
        We keep your account data until you delete your account (Me → Edit profile → Delete my account). Deleting
        your account removes your profile, photos, friends, follows, events you host and &ldquo;going&rdquo; history.
        Messages you sent show as from a &ldquo;Former member&rdquo;. Poker results keep the name you played under
        and your result, so a table&apos;s totals still add up, and the sign-up and search counters are kept without
        your account id.
      </P>

      <H2>Your rights</H2>
      <P>
        You can ask to see, correct, export or delete your data, or object to how we use it. Email{" "}
        <MailLink email={SUPPORT_EMAIL} />. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).
      </P>
    </ProsePage>
  );
}
