import Link from "next/link";
import { PHOTO_BUCKET } from "@/lib/profile-photos";
import { getCards } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { dismissPhotoReports, removeReportedPhoto } from "./photo-actions";

type Report = { photo_id: string; reason: string; created_at: string; profile_photos: { path: string; user_id: string } | null };

// "My 5" photos people have reported, grouped by photo.
export async function ReportedPhotos() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_photo_reports")
    .select("photo_id, reason, created_at, profile_photos(path, user_id)")
    .eq("status", "open")
    .order("created_at");
  const reports = ((data ?? []) as unknown as Report[]).filter((r) => r.profile_photos);
  const photos = new Map<string, { path: string; user_id: string; reasons: string[] }>();
  for (const r of reports) {
    const p = photos.get(r.photo_id) ?? { ...r.profile_photos!, reasons: [] };
    p.reasons.push(r.reason);
    photos.set(r.photo_id, p);
  }
  const list = [...photos.entries()];
  const { data: signed } = list.length
    ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list.map(([, p]) => p.path), 3600)
    : { data: [] };
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const owners = await getCards(supabase, list.map(([, p]) => p.user_id));

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">Reported photos ({list.length})</h2>
      {list.length === 0 && <p className="mt-2 text-muted">Nothing reported.</p>}
      <ul className="mt-3 space-y-3">
        {list.map(([photoId, p]) => (
          <li key={photoId} className="card flex flex-wrap items-start gap-4">
            {urls.get(p.path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls.get(p.path)!} alt="Reported photo" className="size-28 rounded-xl object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                From <Link href={`/u/${p.user_id}`} className="text-brand">{owners.get(p.user_id)?.name ?? "Member"}</Link>
              </p>
              <p className="text-sm text-muted">
                {p.reasons.length} report{p.reasons.length === 1 ? "" : "s"}: {p.reasons.join(" · ")}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={removeReportedPhoto.bind(null, photoId)}><button className="btn py-2">Remove photo</button></form>
              <form action={dismissPhotoReports.bind(null, photoId)}><button className="btn-ghost py-2">Dismiss</button></form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
