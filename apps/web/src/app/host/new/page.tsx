import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createHostedEvent } from "../actions";
import { HostForm } from "../host-form";

export const metadata: Metadata = { title: "Host an event" };

export default async function HostNewPage() {
  await requireProfile();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Host an event</h1>
      <p className="mt-1 mb-8 text-muted">Pres, a pub trip, a study session, five-a-side: anything you&apos;re up for.</p>
      <HostForm action={createHostedEvent} />
    </div>
  );
}
