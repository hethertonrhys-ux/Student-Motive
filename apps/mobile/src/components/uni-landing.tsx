import Head from "expo-router/head";
import { useEffect } from "react";
import { uniById, type UniId } from "@function/shared";
import { Landing, possessive } from "@/components/landing";
import { arrivalUni } from "@/lib/storage";

// A uni's own landing page (/lse, /ucl, /kings, /imperial). Arriving here
// also remembers the uni, so the login page shows the right email example
// (the website does the same with a cookie).
export function UniLanding({ id }: { id: UniId }) {
  const uni = uniById(id)!;
  useEffect(() => {
    void arrivalUni.set(uni.id);
  }, [uni.id]);
  return (
    <>
      <Head><title>{`Function at ${uni.short}`}</title></Head>
      <Landing uni={uni} />
    </>
  );
}

// Title and description for a uni's page (what search results and link previews show).
export function uniMetadata(id: UniId) {
  const uni = uniById(id)!;
  return { title: `Function at ${uni.short}`, description: `${possessive(uni.short)} student social life, all in one place. Societies, events and socials at ${uni.short}, plus open socials across London.` };
}
