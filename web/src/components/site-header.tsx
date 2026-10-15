import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { Logo } from "./logo";

export async function SiteHeader() {
  const profile = await getProfile();

  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Logo />
        <nav className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
          <Link href="/map" className="rounded-lg px-3 py-2 hover:bg-brand-soft">
            Map
          </Link>
          {profile ? (
            <>
              <Link href="/dashboard" className="rounded-lg px-3 py-2 hover:bg-brand-soft">
                Dashboard
              </Link>
              {profile.is_admin && (
                <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-brand-soft">
                  Admin
                </Link>
              )}
              <form action="/auth/signout" method="post">
                <button className="rounded-lg px-3 py-2 text-muted hover:bg-brand-soft">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn py-2">
              Society login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
