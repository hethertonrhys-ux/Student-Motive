import { MailLink } from "@/components/landing";
import { H2, P, ProsePage } from "@/components/prose-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const generateMetadata = () => ({ title: "Support · Function" });

export default function SupportPage() {
  return (
    <ProsePage title="Support">
      <P>
        Need help, want to report something, or want your society added? Email <MailLink email={SUPPORT_EMAIL} /> and
        we&apos;ll get back to you within a day.
      </P>

      <H2>I didn&apos;t get my login code</H2>
      <P>Check your junk folder. Codes can take a minute to arrive. If it still hasn&apos;t come, wait a few minutes and request a new one.</P>

      <H2>How do I post for my society?</H2>
      <P>Log in, choose &ldquo;Request to manage a society&rdquo;, and we&apos;ll approve you once we&apos;ve checked you&apos;re on the committee.</P>

      <H2>How do I delete my account?</H2>
      <P>In the app: Me → Edit profile → Delete my account, at the bottom. Or email us and we&apos;ll do it for you.</P>
    </ProsePage>
  );
}
