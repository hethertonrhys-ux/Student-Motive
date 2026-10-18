import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getPhotos, MAX_PHOTOS } from "@/lib/profile-photos";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { ArchiveGrid } from "./archive-grid";

export const metadata: Metadata = { title: "Archive" };

export default async function ArchivePage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const photos = await getPhotos(supabase, me.id, nowMs());
  const current = photos.filter((p) => p.current).length;
  const archived = photos.filter((p) => !p.current);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/account" className="text-sm font-semibold text-muted hover:text-ink">← Your profile</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Archive</h1>
      <p className="mt-1 text-muted">
        Only you can see these. Restore one to put it back on your profile for another 30 days
        {current >= MAX_PHOTOS ? " (free up a space first: your 5 are full)" : ""}.
      </p>
      <ArchiveGrid photos={archived.map((p) => ({ id: p.id, url: p.url }))} canRestore={current < MAX_PHOTOS} />
    </div>
  );
}
