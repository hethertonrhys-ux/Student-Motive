import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "./avatar";

// One person in a list: photo or initials, name and course, and actions on the right.
export function PersonRow({
  id,
  name,
  avatarUrl,
  detail,
  children,
}: {
  id: string;
  name: string;
  avatarUrl?: string | null;
  detail?: string | null;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link href={`/u/${id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name} url={avatarUrl} size={40} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{name}</span>
          {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
        </span>
      </Link>
      {children}
    </li>
  );
}
