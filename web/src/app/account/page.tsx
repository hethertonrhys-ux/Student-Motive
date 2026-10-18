import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { PhotoPicker } from "./photo-picker";
import { MyFive } from "./my-five";
import { ShowSocietiesToggle } from "./show-societies-toggle";
import { getPhotos } from "@/lib/profile-photos";
import { nowMs } from "@/lib/time";

export const metadata: Metadata = { title: "Your profile" };

export default async function AccountPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const [{ data }, photos, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("display_name, course, bio, avatar_url").eq("id", me.id).single(),
    getPhotos(supabase, me.id, nowMs()),
    supabase.from("profile_settings").select("show_societies").eq("user_id", me.id).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your profile</h1>
      <p className="mt-1 text-muted">
        Other students see this when they find you or you join events. Your email is never shown.{" "}
        <Link href={`/u/${me.id}`} className="font-semibold text-brand">See your profile →</Link>
      </p>
      <div className="card mt-6">
        <PhotoPicker name={data?.display_name ?? ""} url={data?.avatar_url ?? null} />
      </div>
      <div className="card mt-6">
        <MyFive
          photos={photos.filter((p) => p.current).map((p) => ({ id: p.id, url: p.url, pinned: p.pinned, daysLeft: p.daysLeft }))}
          archived={photos.filter((p) => !p.current).length}
        />
      </div>
      <div className="card mt-6">
        <ShowSocietiesToggle initial={settings?.show_societies ?? true} />
      </div>
      <ProfileForm name={data?.display_name ?? ""} course={data?.course ?? ""} bio={data?.bio ?? ""} />
    </div>
  );
}
