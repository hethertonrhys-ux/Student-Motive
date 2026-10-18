import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManagedSociety } from "@/lib/society";
import { getVenues } from "@/lib/venues";
import { isoToLondonInput } from "@/lib/time";
import type { EventTable, MotiveEvent } from "@/lib/types";
import { EventForm } from "../../../event-form";
import { deleteEvent, updateEvent } from "../../../actions";
import { DeleteButton } from "./delete-button";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: PageProps<"/dashboard/[societyId]/events/[eventId]/edit">) {
  const { societyId, eventId } = await params;
  const { supabase, society } = await requireManagedSociety(societyId);

  const [{ data: event }, venues, { data: tables }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).eq("society_id", societyId).maybeSingle<MotiveEvent>(),
    getVenues(supabase),
    supabase.from("event_tables").select("*").eq("event_id", eventId).order("position"),
  ]);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/dashboard/${societyId}`} className="text-sm font-semibold text-muted hover:text-ink">← {society.name}</Link>
      <div className="mt-3 mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Edit event</h1>
        <p className="text-right">
          <span className="font-display text-2xl font-extrabold">{event.going_count}</span>{" "}
          <span className="text-sm text-muted">going</span>
        </p>
      </div>
      <div className="card">
        <EventForm
          action={updateEvent.bind(null, societyId, eventId)}
          venues={venues}
          uni={society.university}
          event={event}
          tables={(tables ?? []) as EventTable[]}
          startsAtInput={isoToLondonInput(event.starts_at)}
          endsAtInput={isoToLondonInput(event.ends_at)}
        />
      </div>
      <div className="mt-6">
        <DeleteButton action={deleteEvent.bind(null, societyId, eventId)} />
      </div>
    </div>
  );
}
