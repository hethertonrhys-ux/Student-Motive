import { appIcon } from "@/components/app-icon";

// The icon iPhones use for "Add to Home Screen". iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180);
}
