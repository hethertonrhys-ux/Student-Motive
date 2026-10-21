import { LegalDoc } from "@/components/legal-doc";
import text, { title, updated } from "@/content/legal/guidelines";

export const generateMetadata = () => ({ title: "Community Guidelines · Function" });

// The text lives in src/content/legal/guidelines.ts.
export default function GuidelinesPage() {
  return <LegalDoc title={title} updated={updated} text={text} />;
}
