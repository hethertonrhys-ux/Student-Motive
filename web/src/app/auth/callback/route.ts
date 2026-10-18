import { NextResponse, type NextRequest } from "next/server";
import { WELCOMED_COOKIE } from "@/app/welcome/constants";
import { logSignupEvent } from "@/lib/signup-events";
import { createClient } from "@/lib/supabase/server";

// The login link in the email lands here. We swap the one-time code in the
// URL for a login session, then send the user on to where they were going.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A brand-new account: the same optional "pick a prompt" step as signing up with the code.
      const created = data.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
      if (Date.now() - created < 15 * 60 * 1000 && !request.cookies.get(WELCOMED_COOKIE)) {
        await logSignupEvent(supabase, "signup_finished");
        const { count } = await supabase.from("profile_prompts").select("prompt_id", { count: "exact", head: true }).eq("user_id", data.user!.id);
        if (!count) return NextResponse.redirect(`${origin}/welcome?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
