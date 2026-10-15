import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Society } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: admins }, { data: claims }] = await Promise.all([
    supabase.from("society_admins").select("societies(*)").eq("user_id", profile.id),
    supabase
      .from("society_claims")
      .select("id, status, created_at, societies(name)")
      .eq("user_id", profile.id)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false }),
  ]);

  const societies = (admins ?? [])
    .map((row) => row.societies as unknown as Society | null)
    .filter((s): s is Society => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your societies</h1>
      <p className="mt-1 text-muted">Signed in as {profile.email}</p>

      <div className="mt-8 space-y-3">
        {societies.map((society) => (
          <Link
            key={society.id}
            href={`/dashboard/${society.id}`}
            className="card flex items-center justify-between gap-4 transition hover:border-brand"
          >
            <span className="font-display text-lg font-bold">{society.name}</span>
            <span className="text-sm font-semibold text-brand">Manage →</span>
          </Link>
        ))}

        {societies.length === 0 && (
          <div className="card">
            <h2 className="font-display text-lg font-bold">You don&apos;t manage a society yet</h2>
            <p className="mt-1 text-muted">
              Ask to manage your society&apos;s page. We&apos;ll check you&apos;re on the committee and approve it.
            </p>
          </div>
        )}
      </div>

      {(claims ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold">Your requests</h2>
          <ul className="mt-3 space-y-2">
            {claims!.map((claim) => (
              <li key={claim.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <span>{(claim.societies as unknown as { name: string } | null)?.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    claim.status === "pending" ? "bg-brand-soft text-brand" : "bg-danger/10 text-danger"
                  }`}
                >
                  {claim.status === "pending" ? "Waiting for approval" : "Not approved"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/dashboard/claim" className="btn-ghost mt-8">
        + Request to manage a society
      </Link>
    </div>
  );
}
