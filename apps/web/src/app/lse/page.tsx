import type { Metadata } from "next";
import { Landing, uniLandingMetadata } from "@/components/landing";
import { uniById } from "@/lib/universities";

const uni = uniById("LSE")!;

export const metadata: Metadata = uniLandingMetadata(uni);

// Arriving here also remembers LSE for sign-up (see proxy.ts).
export default function Page() {
  return <Landing uni={uni} />;
}
