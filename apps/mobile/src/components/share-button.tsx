import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Platform, Share } from "react-native";
import { Button } from "@/components/ui";

// Shares a link with the phone's share sheet (or the browser's), falling
// back to copying it.
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (Platform.OS === "web" && !("share" in navigator)) throw new Error("no share sheet");
      await Share.share(Platform.OS === "ios" ? { url, title } : { message: url, title });
      return;
    } catch {
      // No share sheet, or it was closed: copy the link instead.
    }
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" onPress={share} testID="share">
      {copied ? "Link copied ✓" : "Share"}
    </Button>
  );
}
