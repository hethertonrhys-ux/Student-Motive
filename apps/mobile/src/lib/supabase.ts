import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { sessionStorage } from "./session-storage";

// One Supabase client for the whole app. It acts as the logged-in user, so
// the database's own security rules apply to everything it does.
//
// The session is kept in secure storage on phones (see session-storage.native.ts)
// and in the browser's local storage on the web.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).");

export const supabase = createClient(url, key, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On the web the email login link lands on /auth/callback with the code in the URL.
    detectSessionInUrl: Platform.OS === "web",
    flowType: "pkce",
  },
});

// Phones: only refresh the login while the app is on screen.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
