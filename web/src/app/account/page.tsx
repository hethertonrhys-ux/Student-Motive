import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

export default async function AccountPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("display_name, course, bio").eq("id", me.id).single();

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your profile</h1>
      <p className="mt-1 text-muted">
        Other students see this when they find you or you join events. Your email is never shown.{" "}
        <Link href={`/u/${me.id}`} className="font-semibold text-brand">See your profile →</Link>
      </p>
      <ProfileForm name={data?.display_name ?? ""} course={data?.course ?? ""} bio={data?.bio ?? ""} />
    </div>
  );
}
