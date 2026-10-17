import type { MetadataRoute } from "next";

// Lets phones install Motive from the browser ("Add to Home Screen"),
// so it opens full screen with its own icon, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Motive: what's on at LSE",
    short_name: "Motive",
    description: "Every LSE society and event in one place, on a live map.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7fb",
    theme_color: "#4338ca",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
