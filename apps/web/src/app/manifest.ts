import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/site";

// Lets phones install Function from the browser ("Add to Home Screen"),
// so it opens full screen with its own icon, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Function",
    short_name: "Function",
    description: SITE_DESCRIPTION,
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7fb",
    theme_color: "#4338ca",
    // The splash screen while the app opens: this background and the icon.
    orientation: "portrait",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      // The icon is a full square of colour with the "f" well inside, so
      // Android can crop it to its own shapes.
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
