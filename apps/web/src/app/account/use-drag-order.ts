"use client";

import { useEffect, useRef, useState } from "react";

// How long to hold a photo on a phone before it can be dragged (a quick
// swipe still scrolls the page).
const HOLD_MS = 350;

type Drag = { id: string; pointerId: number; x: number; y: number; active: boolean; timer?: ReturnType<typeof setTimeout> };

// Reorder a list by dragging: press and hold on a phone, or click and drag
// with a mouse. The list changes as you move; onDrop gets the new order.
export function useDragOrder(ids: string[], onDrop: (ids: string[]) => void) {
  // The order while dragging (and just after, until the page catches up).
  const [moved, setMoved] = useState<{ base: string; ids: string[] } | null>(null);
  const base = ids.join();
  const order = moved && moved.base === base ? moved.ids : ids;
  const [dragging, setDragging] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef(order);
  useEffect(() => {
    latest.current = order;
  });

  // While dragging on a phone, stop the page from scrolling instead.
  useEffect(() => {
    if (!dragging) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, [dragging]);

  function start(id: string) {
    if (!drag.current) return;
    drag.current.active = true;
    setDragging(id);
    navigator.vibrate?.(15);
  }

  function itemProps(id: string) {
    return {
      "data-order-id": id,
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if ((e.target as Element).closest("button") || e.button > 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false };
        if (e.pointerType !== "mouse") drag.current.timer = setTimeout(() => start(id), HOLD_MS);
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        if (!d.active) {
          const far = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6;
          if (far && e.pointerType === "mouse") start(id);
          else if (far) {
            // Moved before the hold finished: they're scrolling, not dragging.
            clearTimeout(d.timer);
            drag.current = null;
          }
          return;
        }
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-order-id]")?.dataset.orderId;
        if (!over || over === d.id) return;
        const next = latest.current.filter((x) => x !== d.id);
        next.splice(latest.current.indexOf(over), 0, d.id);
        setMoved({ base, ids: next });
      },
      onPointerUp(e: React.PointerEvent<HTMLElement>) {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        clearTimeout(d.timer);
        drag.current = null;
        if (!d.active) return;
        setDragging(null);
        if (latest.current.join() !== base) onDrop(latest.current);
      },
      onPointerCancel(e: React.PointerEvent<HTMLElement>) {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        clearTimeout(d.timer);
        drag.current = null;
        if (d.active) {
          setDragging(null);
          if (latest.current.join() !== base) onDrop(latest.current);
        }
      },
      // No "save image" menu when holding a photo.
      onContextMenu(e: React.MouseEvent) {
        e.preventDefault();
      },
    };
  }

  // Put the list back (e.g. if saving failed).
  const reset = () => setMoved(null);
  return { order, dragging, itemProps, reset };
}
