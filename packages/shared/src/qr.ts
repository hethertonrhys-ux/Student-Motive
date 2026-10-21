// Personal QR codes: each person's code is just a link to their profile
// (https://studentfunction.com/u/<id>), nothing else (no name or email).
// Scanned with the iPhone camera it opens the profile in the Function app
// if it's installed (a universal link), otherwise on the website; scanned
// in Function it goes straight to the profile.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function profileQrLink(siteUrl: string, userId: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/u/${userId}`;
}

// The profile a scanned code points to, or null if it isn't a Function
// profile code. Accepts studentfunction.com (and its subdomains, such as
// app.studentfunction.com), the site address the app runs on, and the
// app's own links (function://u/<id>).
export function profileIdFromScan(text: string, siteUrl?: string): string | null {
  const value = text.trim();
  const app = new RegExp(`^function://u/(${UUID})/?$`, "i").exec(value);
  if (app) return app[1].toLowerCase();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const hosts = ["studentfunction.com"];
  if (siteUrl) {
    try {
      hosts.push(new URL(siteUrl).hostname);
    } catch {
      // not a URL: only studentfunction.com counts
    }
  }
  const host = url.hostname.toLowerCase();
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  const match = new RegExp(`^/u/(${UUID})/?$`, "i").exec(url.pathname);
  return match ? match[1].toLowerCase() : null;
}
