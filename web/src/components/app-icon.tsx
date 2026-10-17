import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The Motive app icon: a bold white "m" and the pink live dot on indigo.
// Used by app/icon.tsx and app/apple-icon.tsx, which Next.js turns into PNGs.
// The font file only contains the letter "m", so it's tiny.
export async function appIcon(size: number) {
  const font = await readFile(join(process.cwd(), "src/assets/bricolage-800-m.ttf"));
  const dot = size * 0.13;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#4338ca" }}>
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: -size * 0.1 }}>
          <span style={{ fontFamily: "Bricolage", fontSize: size * 0.66, color: "#ffffff", lineHeight: 1 }}>m</span>
          <div style={{ width: dot, height: dot, borderRadius: dot, background: "#f43f5e", marginLeft: size * 0.02, marginBottom: size * 0.075 }} />
        </div>
      </div>
    ),
    { width: size, height: size, fonts: [{ name: "Bricolage", data: font, weight: 800, style: "normal" }] },
  );
}
