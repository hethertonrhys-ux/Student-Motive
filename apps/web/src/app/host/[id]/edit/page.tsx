import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isoToLondonInput } from "@/lib/time";
import type { MotiveEvent } from "@/lib/types";
import { updateHostedEvent } from "../../actions";
import { HostForm } from "../../host-form";

export const metadata: Metadata = { title: "Edit your event" };

export default async function HostEditPage({ params }: PageProps<"/host/[id]/edit">) {
  const { id } = await params;
  const me = await requireProfile();
  const supabase = await createClient();
  const [{ data: event }, { data: exact }] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).eq("host_user_id", me.id).maybeSingle<MotiveEvent>(),
    supabase.from("event_private_details").select("address, lat, lng").eq("event_id", id).maybeSingle(),
  ]);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/e/${id}`} className="text-sm font-semibold text-muted hover:text-ink">← Back to your event</Link>
      <h1 className="mt-3 mb-8 font-display text-3xl font-extrabold tracking-tight">Edit your event</h1>
      <HostForm
        action={updateHostedEvent.bind(null, id)}
        event={event}
        exact={exact}
        startsAtInput={isoToLondonInput(event.starts_at)}
        endsAtInput={isoToLondonInput(event.ends_at)}
      />
    </div>
  );
}
