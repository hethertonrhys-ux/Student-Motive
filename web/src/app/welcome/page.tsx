import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { promptsFor, uniFromEmail } from "@/lib/prompts";
import { WelcomePrompt } from "./welcome-prompt";

export const metadata: Metadata = { title: "Welcome" };

// Straight after signing up: one optional prompt, then into the app.
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const me = await requireProfile();
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const uni = uniFromEmail(me.email);
  // Two truths and a lie takes the most effort, so it's further down here.
  const offered = promptsFor(uni);
  const effortful = offered.filter((p) => p.game);
  const quick = offered.filter((p) => !p.game);
  const list = [...quick.slice(0, 6), ...effortful, ...quick.slice(6)];
  return <WelcomePrompt prompts={list} uni={uni} next={target} />;
}
