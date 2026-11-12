import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The website's link previews (apps/mobile/api/preview.js) for a
// community's page and join link: "Join <name> on Function" with its
// picture and bio, read with the public key from community_public only.

type Handler = (req: { query: { path: string } }, res: { setHeader: (k: string, v: string) => void; status: (s: number) => { send: (b: string) => void } }) => Promise<void>;
const calls: { url: string; init?: RequestInit }[] = [];
let handler: Handler;

beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.EXPO_PUBLIC_SITE_URL = "https://studentfunction.com";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = init?.body ? (JSON.parse(String(init.body)) as { community_slug?: string }) : {};
    const rows = url.endsWith("/rest/v1/rpc/community_public") && body.community_slug === "ucl-abacus"
      ? [{ id: "x", slug: "ucl-abacus", name: "UCL Abacus", bio: "Maths, games & friends", image_url: "https://img.example/logo.jpg", banner_url: null }]
      : [];
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  });
  handler = createRequire(import.meta.url)("../../../apps/mobile/api/preview.js") as Handler;
});
afterAll(() => vi.unstubAllGlobals());

async function preview(path: string) {
  let status = 0;
  let body = "";
  await handler({ query: { path } }, { setHeader: () => {}, status: (s) => ({ send: (b) => { status = s; body = b; } }) });
  const meta = (key: string) => (body.match(new RegExp(`${key}" content="([^"]*)`)) ?? [])[1];
  return { status, title: (body.match(/<title>([^<]*)/) ?? [])[1], description: meta("og:description"), image: meta("og:image"), url: meta("og:url") };
}

describe("community link previews", () => {
  it("the join link says who to join, with the bio and picture", async () => {
    const p = await preview("/c/ucl-abacus/join");
    expect(p.status).toBe(200);
    expect(p.title).toBe("Join UCL Abacus on Function · Function");
    expect(p.description).toBe("Maths, games &amp; friends");
    expect(p.image).toBe("https://img.example/logo.jpg");
    expect(p.url).toBe("https://studentfunction.com/c/ucl-abacus/join");
  });

  it("the community's page too", async () => {
    expect((await preview("/c/ucl-abacus")).title).toBe("Join UCL Abacus on Function · Function");
  });

  it("asks only the public card, with the public key", async () => {
    calls.length = 0;
    await preview("/c/UCL-Abacus/join");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://db.example/rest/v1/rpc/community_public");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ community_slug: "ucl-abacus" });
    expect((calls[0].init?.headers as Record<string, string>).apikey).toBe("sb_publishable_test");
  });

  it("an unknown or malformed community is not found, without asking the database for a bad one", async () => {
    expect((await preview("/c/nope-nope")).status).toBe(404);
    calls.length = 0;
    expect((await preview("/c/bad%20slug!")).status).toBe(404);
    expect((await preview("/c/x")).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
