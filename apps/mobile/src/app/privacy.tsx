import { LegalDoc } from "@/components/legal-doc";
import text, { title, updated } from "@/content/legal/privacy";

export const generateMetadata = () => ({ title: "Privacy Policy · Function" });

// The text lives in src/content/legal/privacy.ts.
export default function PrivacyPage() {
  return <LegalDoc title={title} updated={updated} text={text} />;
}
