import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth";
import { ARRIVAL_UNI_COOKIE, DEFAULT_UNI, uniById } from "@/lib/universities";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/dashboard";

  if (await getProfile()) redirect(nextPath);
  // Arrived from a uni's page (e.g. /kings)? Show that uni's email as the example.
  const uni = uniById((await cookies()).get(ARRIVAL_UNI_COOKIE)?.value) ?? uniById(DEFAULT_UNI)!;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Log in to Function</h1>
      <p className="mt-2 mb-8 text-muted">Use your uni email (LSE, UCL, King&apos;s or Imperial), or the email you were invited with. We&apos;ll email you a code.</p>
      {error === "link" && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger">
          That login link didn&apos;t work. It may have expired, or been opened in a different browser. Request a new one below.
        </p>
      )}
      <div className="card">
        <LoginForm next={nextPath} emailExample={`you@${uni.domains[0]}`} />
      </div>
    </div>
  );
}
