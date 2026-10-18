import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { PhotoPicker } from "./photo-picker";
import { MyFive } from "./my-five";
import { PromptsEditor } from "./prompts-editor";
import type { TwoTruthsOwn } from "@/lib/two-truths";
import { ShowSocietiesToggle } from "./show-societies-toggle";
import { getPhotos } from "@/lib/profile-photos";

export const metadata: Metadata = { title: "Your profile" };

export default async function AccountPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const [{ data }, photos, { data: settings }, { data: prompts }, { data: twoTruths }] = await Promise.all([
    supabase.from("profiles").select("display_name, course, avatar_url").eq("id", me.id).single(),
    getPhotos(supabase, me.id),
    supabase.from("profile_settings").select("show_societies").eq("user_id", me.id).maybeSingle(),
    supabase.from("profile_prompts").select("prompt_id, answer").eq("user_id", me.id).order("position"),
    // Your own Two truths and a lie (only you can read the lie).
    supabase.from("two_truths").select("s1, s2, s3, lie").eq("user_id", me.id).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your profile</h1>
      <p className="mt-1 text-muted">Other students see this when they find you or you join events. Your email is never shown.</p>
      {/* See your profile exactly as other students do. */}
      <Link href={`/u/${me.id}`} className="btn mt-4 w-full gap-2 py-3 text-base sm:w-auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Preview profile
      </Link>
      <div className="card mt-6">
        <PhotoPicker name={data?.display_name ?? ""} url={data?.avatar_url ?? null} />
      </div>
      <div className="card mt-6">
        <MyFive
          photos={photos.filter((p) => p.current).map((p) => ({ id: p.id, url: p.url }))}
          archived={photos.filter((p) => !p.current).length}
        />
      </div>
      <div className="card mt-6">
        <ShowSocietiesToggle initial={settings?.show_societies ?? true} />
      </div>
      <ProfileForm name={data?.display_name ?? ""} course={data?.course ?? ""} />
      <PromptsEditor initial={prompts ?? []} uni={me.university} twoTruths={(twoTruths as TwoTruthsOwn | null) ?? null} />
    </div>
  );
}
