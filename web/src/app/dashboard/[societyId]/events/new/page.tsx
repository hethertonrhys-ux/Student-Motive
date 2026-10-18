import type { Metadata } from "next";
import Link from "next/link";
import { requireManagedSociety } from "@/lib/society";
import { getVenues } from "@/lib/venues";
import { EventForm } from "../../event-form";
import { createEvent } from "../../actions";

export const metadata: Metadata = { title: "Post an event" };

export default async function NewEventPage({ params }: PageProps<"/dashboard/[societyId]/events/new">) {
  const { societyId } = await params;
  const { supabase, society } = await requireManagedSociety(societyId);
  const venues = await getVenues(supabase);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/dashboard/${societyId}`} className="text-sm font-semibold text-muted hover:text-ink">← {society.name}</Link>
      <h1 className="mt-3 mb-8 font-display text-3xl font-extrabold tracking-tight">Post an event</h1>
      <div className="card">
        <EventForm action={createEvent.bind(null, societyId)} venues={venues} uni={society.university} />
      </div>
    </div>
  );
}
