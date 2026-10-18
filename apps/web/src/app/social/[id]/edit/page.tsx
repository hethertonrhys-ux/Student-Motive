import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { SOCIAL_EVENT_FIELDS, type SocialEvent } from "@/lib/social-events";
import { createClient } from "@/lib/supabase/server";
import { isoToLondonInput } from "@/lib/time";
import { updateSocialEvent } from "../../actions";
import { EventForm } from "../../components/event-form";

export const metadata: Metadata = { title: "Edit your event" };

export default async function EditSocialEventPage({ params }: PageProps<"/social/[id]/edit">) {
  const { id } = await params;
  const me = await requireProfile();
  const supabase = await createClient();
  const [{ data: event }, { data: exact }] = await Promise.all([
    supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("id", id).eq("host_id", me.id).maybeSingle(),
    supabase.from("social_event_addresses").select("address, lat, lng").eq("event_id", id).maybeSingle(),
  ]);
  if (!event) notFound();
  const ev = event as SocialEvent;
  const start = isoToLondonInput(ev.starts_at); // "YYYY-MM-DDTHH:mm"
  const finish = isoToLondonInput(ev.ends_at);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href={`/social/${id}`} className="text-sm font-semibold text-muted hover:text-ink">← Back to your event</Link>
      <h1 className="mt-3 mb-6 font-display text-3xl font-extrabold tracking-tight">Edit your event</h1>
      <div className="card">
        <EventForm
          action={updateSocialEvent.bind(null, id)}
          event={ev}
          exact={exact}
          defaults={{ date: start.slice(0, 10), start: start.slice(11, 16), finish: finish.slice(11, 16) }}
        />
      </div>
    </div>
  );
}
