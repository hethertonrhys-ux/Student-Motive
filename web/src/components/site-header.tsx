import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { Logo } from "./logo";
import { NavTabs, SettingsMenu } from "./header-nav";

export async function SiteHeader() {
  const profile = await getProfile();

  const tabs = [{ href: "/map", label: "Map" }];
  if (profile) tabs.push({ href: "/dashboard", label: "Dashboard" });
  if (profile?.is_admin) tabs.push({ href: "/admin", label: "Admin" });

  return (
    <header className="relative z-40 border-b border-line bg-surface/80 backdrop-blur">
      {/* Fixed height: the map page sizes itself to fill the rest of the screen. */}
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
        <Logo />
        <nav className="flex items-center gap-0.5 text-sm font-semibold sm:gap-1">
          <NavTabs tabs={tabs} />
          {!profile && (
            <Link href="/login" className="btn ml-1 py-2 whitespace-nowrap">
              Log in
            </Link>
          )}
          <SettingsMenu signedInAs={profile ? profile.display_name || profile.email : null} />
        </nav>
      </div>
    </header>
  );
}
