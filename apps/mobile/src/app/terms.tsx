import { LegalDoc } from "@/components/legal-doc";
import text, { title, updated } from "@/content/legal/terms";

export const generateMetadata = () => ({ title: "Terms of Service · Function" });

// The text lives in src/content/legal/terms.ts.
export default function TermsPage() {
  return <LegalDoc title={title} updated={updated} text={text} />;
}
