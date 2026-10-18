import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { Logo } from "./logo";
import { SettingsMenu } from "./header-nav";

// A slim top bar: the logo and the ⚙️ menu. The main tabs are in the bottom bar.
export async function SiteHeader() {
  const profile = await getProfile();

  return (
    <header className="relative z-40 border-b border-line bg-surface/80 backdrop-blur">
      {/* Fixed height: the map page sizes itself to fill the rest of the screen. */}
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
        <Logo />
        <nav className="flex items-center gap-1 text-sm font-semibold">
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
