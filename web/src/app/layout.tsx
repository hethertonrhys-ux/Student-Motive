import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstallBanner } from "@/components/install-banner";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Function: what's on at LSE", template: "%s · Function" },
  description: "Every LSE society and event in one place, on a live map.",
  // When added to an iPhone home screen, open full screen like an app.
  appleWebApp: { capable: true, title: "Function", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Use the whole iPhone screen; pages keep clear of the home bar with safe-area padding.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c1d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${bricolage.variable} ${figtree.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] font-sans">
        <SiteHeader />
        <InstallBanner />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
