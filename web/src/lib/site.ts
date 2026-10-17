// Where students and societies can contact Function.
// Set NEXT_PUBLIC_CONTACT_EMAIL in .env.local (and in Vercel).
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// The address without "https://", for showing on screen.
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
