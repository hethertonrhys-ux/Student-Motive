import { lazy, Suspense, type Ref } from "react";
import { View } from "react-native";
import type { PlaceMapHandle, Point } from "./place-map-impl.web";

export type { PlaceMapHandle, Point } from "./place-map-impl.web";

// The small map in the host form, loaded only when the form is open (it
// brings the whole map library with it).
const Impl = lazy(() => import("../map/maps-bundle.web").then((m) => ({ default: m.PlaceMapImpl })));

export function PlaceMap(props: { centre: [number, number]; pin: Point | null; onPick: (point: Point) => void; ref?: Ref<PlaceMapHandle> }) {
  return (
    <Suspense fallback={<View style={{ height: 256 }} className="rounded-2xl bg-line" />}>
      <Impl {...props} />
    </Suspense>
  );
}
