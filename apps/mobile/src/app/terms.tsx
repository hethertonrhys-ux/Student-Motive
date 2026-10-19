import { MailLink } from "@/components/landing";
import { H2, Li, P, ProsePage } from "@/components/prose-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const generateMetadata = () => ({ title: "Terms of use · Function" });

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" updated="15 October 2026">
      <P>By using Function you agree to these terms.</P>

      <H2>Who can use Function</H2>
      <P>Function is for students with a valid university email address. You must be 18 or over.</P>

      <H2>Posting events</H2>
      <Li>Only post events for societies you are on the committee of.</Li>
      <Li>Event details must be accurate. Update or cancel events that change.</Li>
      <Li>No illegal, hateful, harassing, sexually explicit or misleading content.</Li>
      <Li>Follow your university&apos;s and students&apos; union&apos;s rules for society events.</Li>

      <H2>Hosting your own events</H2>
      <Li>You&apos;re responsible for events you host, including who you invite and keeping people safe.</Li>
      <Li>Don&apos;t collect money through Function unless it offers a ticketing feature for your event. Follow the law, including on alcohol.</Li>
      <Li>Meet people you don&apos;t know in public places first, and tell a friend where you&apos;re going.</Li>

      <H2>Friends and messages</H2>
      <Li>Be respectful. No harassment, threats, spam, or sharing other people&apos;s private information.</Li>
      <Li>You can block anyone at any time. Blocked people can&apos;t message you, add you or see your events.</Li>

      <H2>Reporting and removal</H2>
      <P>
        Anyone can report content. We review reports and may hide content or remove access for anyone who breaks
        these terms. Objectionable content is reviewed within 24 hours.
      </P>

      <H2>Liability</H2>
      <P>
        Societies and student hosts are responsible for their own events. Function lists events but doesn&apos;t
        organise them and isn&apos;t responsible for what happens at them.
      </P>

      <H2>Contact</H2>
      <P><MailLink email={SUPPORT_EMAIL} /></P>
    </ProsePage>
  );
}
