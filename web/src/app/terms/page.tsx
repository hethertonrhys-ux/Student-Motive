import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { DraftBanner } from "@/components/draft-banner";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" updated="15 October 2026">
      <DraftBanner />
      <p>By using Function you agree to these terms.</p>

      <h2>Who can use Function</h2>
      <p>Function is for students with a valid university email address. You must be 18 or over.</p>

      <h2>Posting events</h2>
      <ul>
        <li>Only post events for societies you are on the committee of.</li>
        <li>Event details must be accurate. Update or cancel events that change.</li>
        <li>No illegal, hateful, harassing, sexually explicit or misleading content.</li>
        <li>Follow your university&apos;s and students&apos; union&apos;s rules for society events.</li>
      </ul>

      <h2>Reporting and removal</h2>
      <p>
        Anyone can report content. We review reports and may hide content or remove access for anyone who breaks
        these terms. Objectionable content is reviewed within 24 hours.
      </p>

      <h2>Liability</h2>
      <p>
        Societies are responsible for their own events. Function lists events but doesn&apos;t organise them and
        isn&apos;t responsible for what happens at them.
      </p>

      <h2>Contact</h2>
      <p><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
    </ProsePage>
  );
}
