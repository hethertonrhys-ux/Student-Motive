import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Picked, PickOptions } from "./pick-photos";

export const CAN_RECROP = true;

const MAX_SIDE = 1440;
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

// ---- Reading and shrinking photos in the browser ----

async function decodePhoto(file: Blob): Promise<ImageBitmap> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error("too-big");
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

async function toJpeg(draw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void, quality: number): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  draw(canvas.getContext("2d")!, canvas);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality));
  return blob.arrayBuffer();
}

// The whole photo, shrunk, so it can be re-cropped later.
function shrink(image: ImageBitmap) {
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  return toJpeg((ctx, canvas) => {
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, 0.82);
}

// ---- The cropper (drag to move, pinch or slider to zoom) ----

type View = { scale: number; x: number; y: number };
type Frame = { w: number; h: number };

// Keep the photo covering the whole frame: not too small, not dragged off.
function clamp(view: View, frame: Frame, image: ImageBitmap, minScale: number): View {
  const scale = Math.min(Math.max(view.scale, minScale), minScale * 4);
  return { scale, x: Math.min(0, Math.max(frame.w - image.width * scale, view.x)), y: Math.min(0, Math.max(frame.h - image.height * scale, view.y)) };
}

const BTN: React.CSSProperties = { flex: 1, padding: 12, borderRadius: 12, font: "700 16px Figtree_700Bold, sans-serif", cursor: "pointer", border: "1px solid #e3e2ef" };

function Cropper({ image, aspect, shape, title, output, doneLabel, cancelLabel, onDone, onCancel }: { image: ImageBitmap; aspect: number; shape: "rect" | "circle"; title: string; output: number; doneLabel: string; cancelLabel: string; onDone: (bytes: ArrayBuffer) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame: Frame = aspect >= 1 ? { w: 288, h: 288 / aspect } : { w: 264, h: 264 / aspect };
  const minScale = Math.max(frame.w / image.width, frame.h / image.height);
  const [view, setView] = useState<View>(() => ({ scale: minScale, x: (frame.w - image.width * minScale) / 2, y: (frame.h - image.height * minScale) / 2 }));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(frame.w * dpr);
    c.height = Math.round(frame.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frame.w, frame.h);
    ctx.drawImage(image, view.x, view.y, image.width * view.scale, image.height * view.scale);
  }, [image, view, frame.w, frame.h]);

  function zoomTo(scale: number, at = { x: frame.w / 2, y: frame.h / 2 }) {
    setView((v) => {
      const ratio = clamp({ ...v, scale }, frame, image, minScale).scale / v.scale;
      return clamp({ scale: v.scale * ratio, x: at.x - (at.x - v.x) * ratio, y: at.y - (at.y - v.y) * ratio }, frame, image, minScale);
    });
  }
  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const box = e.currentTarget.getBoundingClientRect();
      zoomTo((pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.distance, { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top });
    } else if (pointers.current.size === 1) {
      setView((v) => clamp({ ...v, x: v.x + now.x - last.x, y: v.y + now.y - last.y }, frame, image, minScale));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }
  async function done() {
    // The part of the photo inside the frame, at up to "output" pixels wide.
    const sw = frame.w / view.scale;
    const sh = frame.h / view.scale;
    const width = Math.round(Math.min(output, sw));
    onDone(
      await toJpeg((ctx, c) => {
        c.width = width;
        c.height = Math.round(width / aspect);
        ctx.drawImage(image, -view.x / view.scale, -view.y / view.scale, sw, sh, 0, 0, c.width, c.height);
      }, 0.85),
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.6)" }} data-testid="cropper">
      <div role="dialog" aria-modal="true" aria-label={title} style={{ width: "100%", maxWidth: 448, borderRadius: "24px 24px 0 0", background: "var(--surface)", color: "var(--ink)", padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom))", fontFamily: "Figtree_400Regular, sans-serif" }}>
        <h2 style={{ margin: 0, font: "700 20px BricolageGrotesque_700Bold, sans-serif" }}>{title}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)" }}>Drag to move. Pinch or use the slider to zoom.</p>
        <div style={{ position: "relative", margin: "16px auto 0", width: frame.w, height: frame.h, overflow: "hidden", borderRadius: 16, background: "#15142b", touchAction: "none", userSelect: "none" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={(e) => zoomTo(view.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}>
          <canvas ref={canvas} style={{ width: frame.w, height: frame.h, display: "block", cursor: "grab" }} />
          {shape === "circle" && <span aria-hidden style={{ pointerEvents: "none", position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "0 0 0 200px rgba(0,0,0,0.45)" }} />}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 288, margin: "16px auto 0", fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>
          Zoom
          <input type="range" min={minScale} max={minScale * 4} step={minScale / 50} value={view.scale} onChange={(e) => zoomTo(Number(e.target.value))} style={{ flex: 1, accentColor: "#DA291C" }} aria-label="Zoom" />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onCancel} style={{ ...BTN, background: "var(--surface)", color: "var(--ink)" }} data-testid="crop-cancel">{cancelLabel}</button>
          <button type="button" onClick={() => void done()} style={{ ...BTN, background: "#DA291C", color: "#fff", borderColor: "#DA291C" }} data-testid="crop-done">{doneLabel}</button>
        </div>
      </div>
    </div>
  );
}

// Show the cropper on the page and wait for the answer.
function crop(image: ImageBitmap, options: { aspect: number; shape: "rect" | "circle"; output: number; title: string; doneLabel: string; cancelLabel: string }): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const finish = (bytes: ArrayBuffer | null) => {
      root.unmount();
      host.remove();
      resolve(bytes);
    };
    root.render(<Cropper image={image} {...options} onDone={finish} onCancel={() => finish(null)} />);
  });
}

function chooseFiles(count: number): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.multiple = count > 1;
    input.style.display = "none";
    input.setAttribute("data-testid", "file-input");
    input.onchange = () => {
      resolve(Array.from(input.files ?? []).slice(0, count));
      input.remove();
    };
    document.body.append(input);
    // The test harness sets files directly; a person gets the file chooser.
    if (!(window as unknown as { __fnTestFiles?: boolean }).__fnTestFiles) input.click();
  });
}

// Choose photos, then crop each one to the shape it's shown in.
export async function pickPhotos({ count, aspect, shape = "rect", output = 1080, keepOriginal = false }: PickOptions): Promise<Picked[]> {
  const files = await chooseFiles(count);
  const picked: Picked[] = [];
  for (const [i, file] of files.entries()) {
    let image: ImageBitmap;
    try {
      image = await decodePhoto(file);
    } catch {
      continue; // not a photo we can read: skipped
    }
    const title = files.length > 1 ? `Crop photo ${i + 1} of ${files.length}` : "Crop your photo";
    const bytes = await crop(image, { aspect, shape, output, title, doneLabel: i < files.length - 1 ? "Next" : "Use photo", cancelLabel: files.length > 1 ? "Skip" : "Cancel" });
    if (bytes) picked.push({ bytes, type: "image/jpeg", ...(keepOriginal ? { original: { bytes: await shrink(image), type: "image/jpeg" } } : {}) });
    image.close();
  }
  return picked;
}

// Re-crop a photo that's already uploaded.
export async function cropExisting(url: string, { aspect, shape = "rect", output = 1080 }: { aspect: number; shape?: "rect" | "circle"; output?: number }): Promise<Picked | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("load");
  const blob = await res.blob();
  const image = await createImageBitmap(blob);
  const bytes = await crop(image, { aspect, shape, output, title: "Crop your photo", doneLabel: "Save", cancelLabel: "Cancel" });
  image.close();
  return bytes ? { bytes, type: "image/jpeg", original: { bytes: await blob.arrayBuffer(), type: blob.type || "image/jpeg" } } : null;
}
