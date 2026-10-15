import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Society } from "@/lib/types";
import { AddSocietyForm } from "./add-society-form";
import { approveClaim, dismissReport, hideReportedEvent, rejectClaim } from "./actions";

export const metadata: Metadata = { title: "Admin" };

type ClaimRow = {
  id: string;
  committee_role: string | null;
  message: string | null;
  created_at: string;
  societies: { name: string } | null;
  profiles: { email: string } | null;
};

type ReportRow = {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  event_id: string | null;
  events: { title: string } | null;
  societies: { name: string } | null;
};

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: claims }, { data: reports }, { data: societies }] = await Promise.all([
    supabase
      .from("society_claims")
      .select("id, committee_role, message, created_at, societies(name), profiles(email)")
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("reports")
      .select("id, reason, details, created_at, event_id, events(title), societies(name)")
      .eq("status", "open")
      .order("created_at"),
    supabase.from("societies").select("*").order("kind").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Requests to manage a society ({claims?.length ?? 0})</h2>
        {(claims ?? []).length === 0 && <p className="mt-2 text-muted">Nothing waiting.</p>}
        <ul className="mt-3 space-y-3">
          {((claims ?? []) as unknown as ClaimRow[]).map((claim) => (
            <li key={claim.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold">{claim.societies?.name}</p>
                <p className="text-sm">{claim.profiles?.email} · {claim.committee_role}</p>
                {claim.message && <p className="mt-1 text-sm text-muted">&ldquo;{claim.message}&rdquo;</p>}
              </div>
              <div className="flex gap-2">
                <form action={approveClaim.bind(null, claim.id)}><button className="btn py-2">Approve</button></form>
                <form action={rejectClaim.bind(null, claim.id)}><button className="btn-ghost py-2">Reject</button></form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Reports ({reports?.length ?? 0})</h2>
        {(reports ?? []).length === 0 && <p className="mt-2 text-muted">No open reports.</p>}
        <ul className="mt-3 space-y-3">
          {((reports ?? []) as unknown as ReportRow[]).map((report) => (
            <li key={report.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold">
                  {report.event_id ? (
                    <Link href={`/e/${report.event_id}`} className="text-brand">{report.events?.title ?? "Event"}</Link>
                  ) : (
                    report.societies?.name
                  )}
                </p>
                <p className="text-sm">{report.reason}</p>
                {report.details && <p className="mt-1 text-sm text-muted">{report.details}</p>}
              </div>
              <div className="flex gap-2">
                {report.event_id && (
                  <form action={hideReportedEvent.bind(null, report.id, report.event_id)}>
                    <button className="btn py-2">Hide event</button>
                  </form>
                )}
                <form action={dismissReport.bind(null, report.id)}><button className="btn-ghost py-2">Dismiss</button></form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Add a society</h2>
        <div className="card mt-3">
          <AddSocietyForm />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">All societies ({societies?.length ?? 0})</h2>
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
          {((societies ?? []) as Society[]).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span>
                {s.name} <span className="text-xs text-muted">{s.kind}</span>
              </span>
              <span className="flex gap-4 text-sm font-semibold">
                <Link href={`/s/${s.slug}`} className="text-muted hover:text-ink">Page</Link>
                <Link href={`/dashboard/${s.id}`} className="text-brand">Manage</Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
