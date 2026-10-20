import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import maplibre, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_MAP_STYLE } from "@function/shared";

export type Point = { lng: number; lat: number };
export type PlaceMapHandle = { flyTo(point: Point): void };

// Tap the map to drop a pin, then drag the pin to adjust.
export function PlaceMapImpl({ centre, pin, onPick, ref }: { centre: [number, number]; pin: Point | null; onPick: (point: Point) => void; ref?: Ref<PlaceMapHandle> }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  // eslint-disable-next-line react-hooks/refs -- the map's click handler reads the latest callback through this ref
  onPickRef.current = onPick;
  const first = useRef({ centre, pin });

  useImperativeHandle(ref, () => ({ flyTo: (p) => map.current?.flyTo({ center: [p.lng, p.lat], zoom: 17 }) }));

  useEffect(() => {
    if (!container.current) return;
    const start = first.current.pin;
    const m = new maplibre.Map({ container: container.current, style: DEFAULT_MAP_STYLE, center: start ? [start.lng, start.lat] : first.current.centre, zoom: start ? 16 : 15, attributionControl: { compact: true } });
    m.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
    map.current = m;
    const mk = new maplibre.Marker({ color: "#DA291C", draggable: true });
    marker.current = mk;
    if (start) mk.setLngLat([start.lng, start.lat]).addTo(m);
    mk.on("dragend", () => {
      const { lng, lat } = mk.getLngLat();
      onPickRef.current({ lng, lat });
    });
    m.on("click", (e) => {
      mk.setLngLat(e.lngLat).addTo(m);
      onPickRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // A pin chosen from the search list.
  useEffect(() => {
    if (pin && map.current && marker.current) marker.current.setLngLat([pin.lng, pin.lat]).addTo(map.current);
  }, [pin]);

  return <div ref={container} style={{ width: "100%", height: 256, borderRadius: 12, overflow: "hidden", background: "#e9ebf0" }} data-testid="place-map" />;
}
