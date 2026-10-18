// Types for the per-platform files: session-storage.native.ts (phones) and
// session-storage.web.ts (browser). Metro picks the right one at build time.
import type { SupportedStorage } from "@supabase/supabase-js";
export const sessionStorage: SupportedStorage | undefined;
