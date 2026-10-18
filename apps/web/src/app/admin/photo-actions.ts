"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PHOTO_BUCKET } from "@/lib/profile-photos";
import { createClient } from "@/lib/supabase/server";

// Remove a reported "My 5" photo (the file and the record) and close its reports.
export async function removeReportedPhoto(photoId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("profile_photos").delete().eq("id", photoId).select("path");
  if (data?.[0]) await supabase.storage.from(PHOTO_BUCKET).remove([data[0].path]);
  revalidatePath("/admin");
}

export async function dismissPhotoReports(photoId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("profile_photo_reports").update({ status: "dismissed" }).eq("photo_id", photoId).eq("status", "open");
  revalidatePath("/admin");
}
