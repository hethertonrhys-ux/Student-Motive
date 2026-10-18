import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <ProsePage title="Support">
      <p>
        Need help, want to report something, or want your society added? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we&apos;ll get back to you within a day.
      </p>

      <h2>I didn&apos;t get my login code</h2>
      <p>Check your junk folder. Codes can take a minute to arrive. If it still hasn&apos;t come, wait a few minutes and request a new one.</p>

      <h2>How do I post for my society?</h2>
      <p>Log in, choose &ldquo;Request to manage a society&rdquo;, and we&apos;ll approve you once we&apos;ve checked you&apos;re on the committee.</p>

      <h2>How do I delete my account?</h2>
      <p>In the app: Profile → Delete my account. Or email us and we&apos;ll do it for you.</p>
    </ProsePage>
  );
}
