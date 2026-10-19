import { lazy, Suspense } from "react";
import { View } from "react-native";
import type { MapProps } from "./types";

// The map library (MapLibre, about 1 MB of code) is only downloaded when a
// map is actually on screen, so every other page loads faster.
const Impl = lazy(() => import("./maps-bundle.web").then((m) => ({ default: m.LiveMapImpl })));

export function LiveMap(props: MapProps) {
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <Impl {...props} />
    </Suspense>
  );
}
