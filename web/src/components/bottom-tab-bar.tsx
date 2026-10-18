"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ComponentType, type SVGProps } from "react";
import {
  ChatBubbleOvalLeftIcon as ChatOutline,
  MapPinIcon as MapOutline,
  UserCircleIcon as MeOutline,
  UserGroupIcon as SocietiesOutline,
  UserPlusIcon as SocialOutline,
} from "@heroicons/react/24/outline";
import {
  ChatBubbleOvalLeftIcon as ChatSolid,
  MapPinIcon as MapSolid,
  UserCircleIcon as MeSolid,
  UserGroupIcon as SocietiesSolid,
  UserPlusIcon as SocialSolid,
} from "@heroicons/react/24/solid";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Tab = {
  key: string;
  label: string;
  href: string;
  outline: Icon;
  solid: Icon;
  // Which pages count as being "in" this tab.
  matches: (path: string) => boolean;
  dot?: boolean;
};

export type BottomTabBarProps = {
  meId: string | null;
  avatarUrl: string | null;
  name: string | null;
  socialRequests: number; // join requests waiting for you, as a host
  unread: number; // unread messages
};

// The main navigation: a bar fixed to the bottom of every page, like an app.
export function BottomTabBar({ meId, avatarUrl, name, socialRequests, unread }: BottomTabBarProps) {
  const pathname = usePathname();
  const login = (next: string) => `/login?next=${encodeURIComponent(next)}`;
  const meHref = meId ? `/u/${meId}` : login("/account");

  const tabs: Tab[] = [
    { key: "map", label: "Map", href: "/map", outline: MapOutline, solid: MapSolid, matches: (p) => p.startsWith("/map") },
    {
      key: "societies",
      label: "Societies",
      href: "/societies",
      outline: SocietiesOutline,
      solid: SocietiesSolid,
      matches: (p) => /^\/(societies|s\/|dashboard|e\/)/.test(p),
    },
    {
      key: "social",
      label: "Social",
      href: "/social",
      outline: SocialOutline,
      solid: SocialSolid,
      matches: (p) => p.startsWith("/social") || p.startsWith("/host"),
      dot: socialRequests > 0,
    },
    {
      key: "messages",
      label: "Messages",
      href: meId ? "/chats" : login("/chats"),
      outline: ChatOutline,
      solid: ChatSolid,
      matches: (p) => p.startsWith("/chats") || p.startsWith("/friends"),
      dot: unread > 0,
    },
    {
      key: "me",
      label: "Me",
      href: meHref,
      outline: MeOutline,
      solid: MeSolid,
      matches: (p) => (meId ? p === `/u/${meId}` : false) || p.startsWith("/account"),
    },
  ];

  // After every tab change, make sure the other tabs are loaded in the
  // background (already-fresh ones aren't fetched again).
  const router = useRouter();
  const hrefs = tabs.map((t) => t.href).join(" ");
  useEffect(() => {
    for (const href of hrefs.split(" ")) if (href.split("?")[0] !== pathname) router.prefetch(href);
  }, [pathname, hrefs, router]);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-2">
        {tabs.map((tab) => {
          const active = tab.matches(pathname);
          const Icon = active ? tab.solid : tab.outline;
          const isMe = tab.key === "me";
          return (
            <li key={tab.key} className="flex flex-1">
              <Link
                href={tab.href}
                // Load each tab fully in the background so tapping it is instant.
                prefetch={true}
                aria-label={tab.label + (tab.dot ? (tab.key === "social" ? ", join requests waiting" : ", unread messages") : "")}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  // Already on this tab's main page: scroll back to the top instead.
                  if (active && pathname === tab.href.split("?")[0]) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className={`relative flex flex-1 items-center justify-center transition ${active ? "text-brand" : "text-muted hover:text-ink"}`}
              >
                {isMe && avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className={`size-8 rounded-full object-cover ${active ? "ring-2 ring-brand ring-offset-2 ring-offset-[var(--surface)]" : ""}`}
                    title={name ?? undefined}
                  />
                ) : (
                  <Icon className="size-7" aria-hidden="true" />
                )}
                {tab.dot && (
                  <span className="absolute top-3 left-1/2 ml-2.5 size-2.5 rounded-full bg-live ring-2 ring-[var(--surface)]" aria-hidden="true" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
