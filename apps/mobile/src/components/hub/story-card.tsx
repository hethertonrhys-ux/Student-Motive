import { useState } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import type { StoryLine } from "@function/shared";
import { Button, Muted, T } from "@/components/ui";
import { LIGHT } from "@/lib/theme";

// A 9:16 card in the brand red with the event (or the society's page) on
// it, sized for an Instagram story: shown large so a committee member can
// screenshot it on their phone. On the website it can also be downloaded
// as a 1080 x 1920 PNG, drawn in the browser from the same words.
export function StoryCard({ lines, fileName }: { lines: StoryLine[]; fileName: string }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(220, Math.min(340, width - 48));
  const [error, setError] = useState<string | null>(null);
  const line = (kind: StoryLine["kind"]) => lines.find((l) => l.kind === kind)?.text;
  const place = line("place");

  async function download() {
    setError(null);
    try {
      await downloadStoryImage(lines, fileName);
    } catch {
      setError("Couldn't make the image. Take a screenshot instead.");
    }
  }

  return (
    <View className="items-center gap-3">
      <View style={{ width: cardWidth, aspectRatio: 9 / 16 }} className="justify-between overflow-hidden rounded-3xl bg-brand p-7" testID="story-card">
        <T variant="bold" className="text-sm uppercase tracking-widest text-brand-ink" numberOfLines={2}>{line("society")}</T>
        <View className="gap-3">
          <T variant="display" className="text-4xl leading-tight text-brand-ink" numberOfLines={4}>{line("title")}</T>
          {line("when") && <T variant="semibold" className="text-lg text-brand-ink">{line("when")}</T>}
          {place && <T className="text-base text-brand-ink" numberOfLines={2}>{place}</T>}
        </View>
        <View className="items-start gap-3">
          <View className="rounded-full bg-brand-ink px-5 py-2.5">
            <T variant="bold" className="text-base text-brand">{line("cta")}</T>
          </View>
          <T variant="semibold" className="text-sm text-brand-ink" numberOfLines={1}>{line("link")}</T>
          <T variant="display-bold" className="text-xl text-brand-ink">Function</T>
        </View>
      </View>
      <Muted className="text-center text-sm">Screenshot this and add it to your story.</Muted>
      {Platform.OS === "web" && (
        <Button variant="ghost" onPress={() => void download()} className="min-h-[48px]" testID="story-download">Download image</Button>
      )}
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </View>
  );
}

// ---- The downloadable image (website only) ----

const W = 1080;
const H = 1920;
const PAD = 120;

// Splits text into lines that fit the width (long words are kept whole).
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) current = next;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:]+$/, "")}…`;
    return kept;
  }
  return out;
}

// Draws the same card onto a canvas and downloads it as a PNG. Only runs on
// the website (it uses the browser's canvas and a download link).
async function downloadStoryImage(lines: StoryLine[], fileName: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const line = (kind: StoryLine["kind"]) => lines.find((l) => l.kind === kind)?.text ?? "";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  const display = "BricolageGrotesque_800ExtraBold, BricolageGrotesque_700Bold, system-ui, sans-serif";
  const sans = "Figtree_600SemiBold, Figtree_400Regular, system-ui, sans-serif";
  const bold = "Figtree_700Bold, system-ui, sans-serif";
  // Make sure the app's fonts are ready to draw with (they're already on the page).
  try {
    await Promise.all([document.fonts?.load(`120px ${display}`), document.fonts?.load(`48px ${sans}`), document.fonts?.load(`48px ${bold}`)]);
  } catch {
    // The fallback fonts are fine.
  }

  ctx.fillStyle = LIGHT.brand;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = LIGHT.brandInk;
  ctx.textBaseline = "top";

  // The society, at the top.
  ctx.font = `44px ${bold}`;
  let y = PAD;
  for (const l of wrap(ctx, line("society").toUpperCase(), W - PAD * 2, 2)) {
    ctx.fillText(l, PAD, y);
    y += 58;
  }

  // The event in the middle: title, then day and time, then place.
  ctx.font = `120px ${display}`;
  const title = wrap(ctx, line("title"), W - PAD * 2, 4);
  ctx.font = `56px ${sans}`;
  const when = line("when") ? wrap(ctx, line("when"), W - PAD * 2, 2) : [];
  ctx.font = `48px ${sans}`;
  const place = line("place") ? wrap(ctx, line("place"), W - PAD * 2, 2) : [];
  const blockHeight = title.length * 132 + (when.length ? 40 + when.length * 70 : 0) + (place.length ? 20 + place.length * 62 : 0);
  y = Math.max(y + 120, (H - blockHeight) / 2 - 80);
  ctx.font = `120px ${display}`;
  for (const l of title) {
    ctx.fillText(l, PAD, y);
    y += 132;
  }
  if (when.length) {
    y += 40;
    ctx.font = `56px ${sans}`;
    for (const l of when) {
      ctx.fillText(l, PAD, y);
      y += 70;
    }
  }
  if (place.length) {
    y += 20;
    ctx.font = `48px ${sans}`;
    for (const l of place) {
      ctx.fillText(l, PAD, y);
      y += 62;
    }
  }

  // At the bottom: the RSVP pill, the link and the Function name.
  const bottom = H - PAD;
  ctx.font = `76px ${display}`;
  ctx.fillText("Function", PAD, bottom - 76);
  ctx.font = `44px ${sans}`;
  ctx.fillText(wrap(ctx, line("link"), W - PAD * 2, 1)[0] ?? "", PAD, bottom - 76 - 90);
  ctx.font = `52px ${bold}`;
  const cta = line("cta");
  const pillW = ctx.measureText(cta).width + 100;
  const pillH = 110;
  const pillY = bottom - 76 - 90 - 50 - pillH;
  ctx.fillStyle = LIGHT.brandInk;
  ctx.beginPath();
  ctx.roundRect(PAD, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = LIGHT.brand;
  ctx.textBaseline = "middle";
  ctx.fillText(cta, PAD + 50, pillY + pillH / 2 + 2);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No image");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
