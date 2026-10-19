import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import type { PropsWithChildren } from "react";

const DESCRIPTION = "London's student social life, all in one place. Societies, events and socials for students at every London university, on one live map.";

// The page around the web app: what search engines and link previews see,
// and what lets phones add Function to their home screen (the manifest).
// Each screen can set its own title with <Head> from expo-router/head.
export default function Root({ children }: PropsWithChildren) {
  // The scripts, styles, fonts and per-screen <Head> tags Expo adds at build time.
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  // Screens that export generateMetadata bring their own title and description.
  const nodes = (headNodes ?? []) as { key?: string | null }[];
  const ownTitle = nodes.some((n) => n?.key === "metadata-title");
  const ownDescription = nodes.some((n) => n?.key?.startsWith("metadata-meta"));
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        {!ownTitle && <title>Function: London&apos;s student social life</title>}
        {!ownDescription && <meta name="description" content={DESCRIPTION} />}
        <meta property="og:title" content="Function: London's student social life" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content="/icon-512.png" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#DA291C" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d0c1d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Function" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        {headNodes}
        {/* The page background before any script runs, so there is no white flash in dark mode. */}
        <style dangerouslySetInnerHTML={{ __html: "body{background:#f7f7fb}@media(prefers-color-scheme:dark){body{background:#0d0c1d}}" }} />
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
