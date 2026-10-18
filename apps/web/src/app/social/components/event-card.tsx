import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { formatCost } from "@/lib/cost";
import { categoryInfo, formatWhen, spacesLeft, type MemberStatus, type SocialEvent } from "@/lib/social-events";

const STATUS: Record<MemberStatus, { label: string; style: string }> = {
  going: { label: "Going ✓", style: "bg-ok/10 text-ok" },
  pending: { label: "Pending", style: "bg-amber-100 text-amber-800" },
  declined: { label: "Declined", style: "bg-danger/10 text-danger" },
};

// One event in a list: title, category, when, where, spaces and Open/Private.
export function EventCard({
  event,
  host,
  status,
  pending = 0,
  whenText,
}: {
  event: SocialEvent;
  // The date and time, already written out (phones and servers word dates
  // slightly differently, so lists shown on the phone pass in the server's).
  whenText?: string;
  host?: { name: string; avatar_url: string | null } | null;
  status?: MemberStatus | null;
  pending?: number;
}) {
  const cat = categoryInfo(event.category);
  const left = spacesLeft(event);
  const full = left === 0;
  const cost = formatCost(event.cost_pence);

  return (
    <Link
      href={`/social/${event.id}`}
      className={`card block space-y-3 p-4 transition hover:border-brand ${event.is_cancelled ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide text-brand uppercase">
            {cat.label}
          </p>
          <h3 className="mt-0.5 font-display text-lg leading-snug font-bold">{event.title}</h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
            event.is_private ? "bg-ink text-surface" : "bg-brand-soft text-brand"
          }`}
        >
          {event.is_private ? "Private" : "Open"}
        </span>
      </div>

      <div className="space-y-0.5 text-sm">
        <p className="font-semibold">{whenText ?? formatWhen(event.starts_at)}</p>
        <p className="truncate text-muted">{event.area}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {host ? (
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
            <Avatar name={host.name} url={host.avatar_url} size={22} />
            <span className="truncate">{host.name}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="flex flex-wrap items-center gap-1.5">
          {event.is_cancelled && <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-bold text-danger">Cancelled</span>}
          {event.friends_only && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand">Friends only</span>}
          {pending > 0 && (
            <span className="rounded-full bg-live px-2.5 py-0.5 text-xs font-bold text-white">
              {pending} request{pending === 1 ? "" : "s"}
            </span>
          )}
          {cost && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand">{cost}</span>}
          {status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[status].style}`}>{STATUS[status].label}</span>}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${full ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
            {full ? "Full" : `${left} of ${event.spaces} spaces left`}
          </span>
        </span>
      </div>
    </Link>
  );
}
