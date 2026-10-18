import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_EMAIL } from "@/lib/site";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Manage a society" };

export default async function ClaimPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: societies } = await supabase
    .from("societies")
    .select("id, name")
    .eq("kind", "society")
    // You can only manage a society at your own uni.
    .eq("university", me.university)
    .order("name");

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Manage a society</h1>
      <p className="mt-2 mb-8 text-muted">
        Choose your society. Once we&apos;ve checked you&apos;re on the committee, you can post events for it.
      </p>
      <div className="card">
        <ClaimForm societies={societies ?? []} />
      </div>
      <p className="mt-6 text-sm text-muted">
        Society not listed? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand">{CONTACT_EMAIL}</a>{" "}
        and we&apos;ll add it.
      </p>
    </div>
  );
}
