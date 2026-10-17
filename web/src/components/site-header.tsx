import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "./logo";
import { NavTabs, SettingsMenu } from "./header-nav";

export async function SiteHeader() {
  const profile = await getProfile();

  // Little red counts on Friends (new requests) and Chats (unread messages).
  let requests = 0;
  let unread = 0;
  if (profile) {
    const supabase = await createClient();
    const [{ count }, { data }] = await Promise.all([
      supabase.from("friendships").select("requester_id", { count: "exact", head: true }).eq("addressee_id", profile.id).eq("status", "pending"),
      supabase.rpc("unread_message_count"),
    ]);
    requests = count ?? 0;
    unread = Number(data ?? 0);
  }

  const tabs = profile
    ? [
        { href: "/map", label: "Map" },
        { href: "/social", label: "Social" },
        { href: "/friends", label: "Friends", badge: requests },
        { href: "/chats", label: "Chats", badge: unread },
        { href: "/dashboard", label: "Me" },
      ]
    : [
        { href: "/map", label: "Map" },
        { href: "/social", label: "Social" },
      ];

  return (
    <header className="relative z-40 border-b border-line bg-surface/80 backdrop-blur">
      {/* Fixed height: the map page sizes itself to fill the rest of the screen. */}
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
        <Logo compactOnPhones={Boolean(profile)} />
        <nav className="flex items-center gap-0.5 text-sm font-semibold sm:gap-1">
          <NavTabs tabs={tabs} />
          {!profile && (
            <Link href="/login" className="btn ml-1 py-2 whitespace-nowrap">
              Log in
            </Link>
          )}
          <SettingsMenu
            signedInAs={profile ? profile.display_name || profile.email : null}
            isAdmin={Boolean(profile?.is_admin)}
          />
        </nav>
      </div>
    </header>
  );
}
