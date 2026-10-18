import { appIcon } from "@/components/app-icon";

// Icons for the browser tab and for "Add to Home Screen" on Android.
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return appIcon(Number(await id));
}
