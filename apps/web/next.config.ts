import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Event images and society logos are stored in Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  experimental: {
    // Tabs loaded in the background (the bottom bar) are reused for up to a
    // minute, so going back to one is instant. Anything you change clears this.
    staleTimes: { static: 60 },
    serverActions: {
      // Allows event images up to ~5MB.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
