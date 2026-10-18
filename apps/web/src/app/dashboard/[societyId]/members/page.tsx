import type { Metadata } from "next";
import Link from "next/link";
import { HIDE, InstantArea, InstantFormButton } from "@/components/instant";
import { requireManagedSociety } from "@/lib/society";
import { InviteForm } from "./invite-form";
import { DEFAULT_UNI, uniById } from "@/lib/universities";
import { approveMember, inviteMembers, removeInvite, removeMember } from "./actions";

export const metadata: Metadata = { title: "Members" };

type MemberRow = { user_id: string | null; name: string | null; email: string; status: "pending" | "approved" | "invited"; created_at: string };

export default async function MembersPage({ params }: PageProps<"/dashboard/[societyId]/members">) {
  const { societyId } = await params;
  const { supabase, society } = await requireManagedSociety(societyId);
  const { data } = await supabase.rpc("society_member_list", { sid: societyId });
  const rows = ((data ?? []) as MemberRow[]).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const invited = rows.filter((r) => r.status === "invited");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/dashboard/${societyId}`} className="text-sm font-semibold text-muted hover:text-ink">← {society.name}</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Members</h1>
      <p className="mt-1 text-muted">
        {approved.length} {approved.length === 1 ? "member" : "members"}
        {pending.length > 0 && ` · ${pending.length} waiting for approval`}
      </p>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Asking to join</h2>
          <ul className="mt-3 space-y-2">
            {pending.map((m) => (
              <InstantArea key={m.user_id}>
                <li className="card flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-sm text-muted">{m.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <InstantFormButton action={approveMember.bind(null, societyId, m.user_id!)} after={HIDE} className="btn py-2">Approve</InstantFormButton>
                    <InstantFormButton action={removeMember.bind(null, societyId, m.user_id!)} after={HIDE} className="btn-ghost py-2">Decline</InstantFormButton>
                  </div>
                </li>
              </InstantArea>
            ))}
          </ul>
        </section>
      )}

      <section className="card mt-8">
        <InviteForm action={inviteMembers.bind(null, societyId)} emailDomain={(uniById(society.university) ?? uniById(DEFAULT_UNI)!).domains[0]} />
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Members ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="mt-2 text-muted">No members yet. Add your membership list above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {approved.map((m) => (
              <InstantArea key={m.user_id}>
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="font-semibold">{m.name}</span> <span className="text-sm text-muted">{m.email}</span>
                  </span>
                  <InstantFormButton action={removeMember.bind(null, societyId, m.user_id!)} after={HIDE} className="text-sm font-semibold text-danger hover:underline">
                    Remove
                  </InstantFormButton>
                </li>
              </InstantArea>
            ))}
          </ul>
        )}
      </section>

      {invited.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Added, not on Function yet ({invited.length})</h2>
          <p className="mt-1 text-sm text-muted">They&apos;ll become members automatically when they log in and join.</p>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {invited.map((m) => (
              <InstantArea key={m.email}>
                <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>{m.email}</span>
                  <InstantFormButton action={removeInvite.bind(null, societyId, m.email)} after={HIDE} className="font-semibold text-danger hover:underline">
                    Remove
                  </InstantFormButton>
                </li>
              </InstantArea>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
