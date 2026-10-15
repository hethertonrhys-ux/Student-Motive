import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/dashboard";

  if (await getProfile()) redirect(nextPath);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Log in to Motive</h1>
      <p className="mt-2 mb-8 text-muted">For society committees. Use your LSE email address.</p>
      <div className="card">
        <LoginForm next={nextPath} />
      </div>
    </div>
  );
}
