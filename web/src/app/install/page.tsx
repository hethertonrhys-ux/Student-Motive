import type { Metadata } from "next";
import { MotiveTile } from "./illustrations";
import { InstallGuide } from "./install-guide";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Put Motive on your phone's home screen in four taps. Works on iPhone and Android.",
};

export default function InstallPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center gap-4">
        <MotiveTile size={56} />
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Get Motive on your phone</h1>
          <p className="mt-1 text-muted">Four taps. It opens full screen with its own icon, just like an app. Free, and no App Store needed.</p>
        </div>
      </div>

      <InstallGuide />

      <p className="mt-10 text-sm">
        <a href="/motive-iphone-story.png" download className="font-semibold text-brand">
          Save the iPhone steps as a picture
        </a>
      </p>
    </div>
  );
}
