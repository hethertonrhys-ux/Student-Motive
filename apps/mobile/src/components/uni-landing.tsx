import Head from "expo-router/head";
import { useEffect } from "react";
import { uniById, type UniId } from "@function/shared";
import { Landing } from "@/components/landing";
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
  return { title: `Function at ${uni.short}`, description: `Make plans, meet people and see what's on tonight. The social app for ${uni.short} students, with plans open to every London uni.` };
}
