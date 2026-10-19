import type { Ref } from "react";

export type Point = { lng: number; lat: number };
export type PlaceMapHandle = { flyTo(point: Point): void };
// The little map on the host form: tap it to drop a pin. Metro picks
// place-map.web.tsx (maplibre-gl) or place-map.native.tsx (MapLibre Native).
export declare function PlaceMap(props: { centre: [number, number]; pin: Point | null; onPick: (point: Point) => void; ref?: Ref<PlaceMapHandle> }): React.JSX.Element;
