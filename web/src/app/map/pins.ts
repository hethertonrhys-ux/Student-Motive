import type { EventCategory } from "@/lib/types";

// Each category has its own colour AND its own icon, so pins can be told
// apart without relying on colour. Icons are drawn on a 24px grid with
// rounded strokes, in the same style as the rest of the app.
export const CATEGORY_STYLE: Record<EventCategory, { colour: string; icon: string }> = {
  social: {
    colour: "#DB2777",
    icon: "M9 11a3 3 0 100-6 3 3 0 000 6zM3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M17 11.4a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM16.5 14.4c2.6.3 4.5 2.5 4.5 5.6",
  },
  nightlife: {
    colour: "#7C3AED",
    icon: "M9 18V6l10-2v12M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 16a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z",
  },
  careers: {
    colour: "#0369A1",
    icon: "M5.5 7.5h13a2.5 2.5 0 012.5 2.5v7.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5V10a2.5 2.5 0 012.5-2.5zM8.5 7.5v-2a2 2 0 012-2h3a2 2 0 012 2v2M3 13h18",
  },
  sport: {
    colour: "#15803D",
    icon: "M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4zM12 3.5v4.7M15.4 10.7l4.4-1.6M14.1 14.7l2.7 3.8M9.9 14.7l-2.7 3.8M8.6 10.7L4.2 9.1",
  },
  arts: {
    colour: "#C2410C",
    icon: "M12 3.5a8.5 8.5 0 100 17c.9 0 1.4-.7 1.4-1.5 0-.4-.2-.8-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.4-1.4H16a4.5 4.5 0 004.5-4.5c0-4-3.8-7.6-8.5-7.6zM7.8 12a1 1 0 100-2 1 1 0 000 2zM10.5 8.6a1 1 0 100-2 1 1 0 000 2zM14.8 9a1 1 0 100-2 1 1 0 000 2z",
  },
  talks: {
    colour: "#BE123C",
    icon: "M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3zM5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6",
  },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_STYLE) as EventCategory[];

const SVG = "http://www.w3.org/2000/svg";

export function iconSvg(category: EventCategory, size: number, colour: string) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", colour);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", CATEGORY_STYLE[category].icon);
  svg.append(path);
  return svg;
}

function div(className: string) {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

// A "lollipop" pin: a round head with the category icon on a short stem.
export function pinElement(category: EventCategory, live: boolean, label: string) {
  const { colour } = CATEGORY_STYLE[category];
  const root = div("fn-pin");
  root.style.setProperty("--c", colour);
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", label);
  root.tabIndex = 0;
  const inner = div("fn-pin-inner");
  if (live) inner.append(div("fn-pin-pulse"));
  const head = div("fn-pin-head");
  head.append(iconSvg(category, 19, "#fff"));
  inner.append(div("fn-pin-stem"), div("fn-pin-foot"), head);
  if (live) {
    const tag = div("fn-pin-live");
    tag.textContent = "LIVE";
    inner.append(tag);
  }
  root.append(inner);
  return root;
}

// A group of nearby events: the number, with a ring split by category.
export function clusterElement(count: number, perCategory: Record<string, number>, live: boolean) {
  const total = Object.values(perCategory).reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  const ring = CATEGORY_ORDER.filter((c) => perCategory[c] > 0).map((c) => {
    const from = at;
    at += (perCategory[c] / total) * 360;
    return `${CATEGORY_STYLE[c].colour} ${from}deg ${at}deg`;
  });
  const root = div("fn-cluster");
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", `${count} events here. Tap to zoom in.`);
  root.tabIndex = 0;
  const inner = div("fn-cluster-inner");
  inner.style.background = `conic-gradient(${ring.join(",") || "#4338ca 0deg 360deg"})`;
  const size = count >= 20 ? 54 : count >= 6 ? 48 : 42;
  inner.style.width = inner.style.height = `${size}px`;
  const num = div("fn-cluster-num");
  num.textContent = count > 99 ? "99+" : String(count);
  inner.append(num);
  if (live) inner.append(div("fn-cluster-live"));
  root.append(inner);
  return root;
}
