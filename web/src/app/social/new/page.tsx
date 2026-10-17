import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createSocialEvent } from "../actions";
import { EventForm } from "../components/event-form";

export const metadata: Metadata = { title: "Host an event" };

export default async function NewSocialEventPage() {
  await requireProfile();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/social" className="text-sm font-semibold text-muted hover:text-ink">← Social</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Host an event</h1>
      <p className="mt-1 mb-6 text-muted">Five-a-side, a study session, pres, a gallery trip: anything you&apos;re up for.</p>
      <div className="card">
        <EventForm action={createSocialEvent} />
      </div>
    </div>
  );
}
