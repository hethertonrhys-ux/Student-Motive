"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type View = { scale: number; x: number; y: number };
type Frame = { w: number; h: number };

// Keep the photo covering the whole frame: not too small, not dragged off.
function clamp(view: View, frame: Frame, image: ImageBitmap, minScale: number): View {
  const scale = Math.min(Math.max(view.scale, minScale), minScale * 4);
  return {
    scale,
    x: Math.min(0, Math.max(frame.w - image.width * scale, view.x)),
    y: Math.min(0, Math.max(frame.h - image.height * scale, view.y)),
  };
}

// Crop a photo to the shape it's shown in (4:5 for profile photos, a circle
// for the profile picture): drag to move it, pinch or use the slider to
// zoom. Nothing is uploaded until "Use photo".
export function PhotoCropper({
  image,
  aspect = 1,
  shape = "rect",
  title,
  output = 1080,
  doneLabel = "Use photo",
  onDone,
  onCancel,
  cancelLabel = "Cancel",
}: {
  image: ImageBitmap;
  // Width divided by height: 1 for a square or circle, 0.8 for 4:5.
  aspect?: number;
  shape?: "rect" | "circle";
  title: string;
  output?: number;
  doneLabel?: string;
  onDone: (photo: File) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The frame on screen, in CSS pixels.
  const frame: Frame = aspect >= 1 ? { w: 288, h: 288 / aspect } : { w: 264, h: 264 / aspect };
  const minScale = Math.max(frame.w / image.width, frame.h / image.height);
  // Start zoomed to fill the frame, centred.
  const [view, setView] = useState<View>(() => ({
    scale: minScale,
    x: (frame.w - image.width * minScale) / 2,
    y: (frame.h - image.height * minScale) / 2,
  }));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  // Draw the photo as it's placed in the frame.
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

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onCancel]);

  // Zoom around a point in the frame, so what's under your fingers stays put.
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
      const mid = { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top };
      zoomTo((pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.distance, mid);
    } else if (pointers.current.size === 1) {
      setView((v) => clamp({ ...v, x: v.x + now.x - last.x, y: v.y + now.y - last.y }, frame, image, minScale));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function done() {
    // The part of the photo inside the frame, at up to "output" pixels wide.
    const sw = frame.w / view.scale;
    const sh = frame.h / view.scale;
    const width = Math.round(Math.min(output, sw));
    const out = document.createElement("canvas");
    out.width = width;
    out.height = Math.round(width / aspect);
    out.getContext("2d")!.drawImage(image, -view.x / view.scale, -view.y / view.scale, sw, sh, 0, 0, out.width, out.height);
    out.toBlob((blob) => blob && onDone(new File([blob], "photo.jpg", { type: "image/jpeg" })), "image/jpeg", 0.85);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted">Drag to move. Pinch or use the slider to zoom.</p>
        <div
          className="relative mx-auto mt-4 touch-none overflow-hidden rounded-2xl bg-ink select-none"
          style={{ width: frame.w, height: frame.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => zoomTo(view.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
          data-cropper
        >
          <canvas ref={canvas} style={{ width: frame.w, height: frame.h }} className="block cursor-grab active:cursor-grabbing" />
          {shape === "circle" && (
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_200px_rgb(0_0_0/0.45)]" />
          )}
        </div>
        <label className="mx-auto mt-4 flex max-w-72 items-center gap-3 text-sm font-semibold text-muted">
          Zoom
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step={minScale / 50}
            value={view.scale}
            onChange={(e) => zoomTo(Number(e.target.value))}
            className="flex-1 accent-[var(--brand)]"
            aria-label="Zoom"
          />
        </label>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1 py-3">
            {cancelLabel}
          </button>
          <button type="button" onClick={done} className="btn flex-1 py-3">
            {doneLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
