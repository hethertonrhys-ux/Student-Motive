import Ionicons from "@expo/vector-icons/Ionicons";
import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, Marker, UserLocation, type CameraRef, type GeoJSONSourceRef, type MapRef } from "@maplibre/maplibre-react-native";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CATEGORY_ORDER, CATEGORY_STYLE, eventStatus, heatColours, mapStyle, walkGeoJson, type MapEvent } from "@function/shared";
import campus from "@/assets/map/lse-campus.json";
import { ME_COLOUR, PIN_ICON, WALK_COLOUR, type MapProps } from "./types";

// The live map on iOS and Android, drawn by MapLibre Native. The same map
// style, groups and glow as the web version; the pins are small React
// Native views placed on the map.

type Pin = { key: string; at: [number, number]; cluster: false; event: MapEvent; live: boolean } | { key: string; at: [number, number]; cluster: true; id: number; count: number; counts: Record<string, number>; live: boolean };

function featuresOf(events: MapEvent[], now: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: events.map((e) => {
      const status = eventStatus(e, now);
      return { type: "Feature", geometry: { type: "Point", coordinates: [e.lng, e.lat] }, properties: { id: e.id, category: e.category, status, live: status === "live" ? 1 : 0 } };
    }),
  };
}

export function LiveMap({ events, now, look, home, me, walk, onSelect, onReady, onError, ref }: MapProps) {
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const data = useMemo(() => featuresOf(events, now), [events, now]);
  const heat = useMemo<GeoJSON.FeatureCollection>(() => ({ type: "FeatureCollection", features: events.map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [e.lng, e.lat] }, properties: {} })) }), [events]);
  const style = useMemo(() => mapStyle(look, campus), [look]);

  useImperativeHandle(ref, () => ({
    flyTo: (target) => camera.current?.flyTo({ center: target.center, zoom: target.zoom, pitch: target.pitch ?? 0, duration: 1200 }),
    fitWalk: (w) => {
      const lngs = w.line.map((p) => p[0]);
      const lats = w.line.map((p) => p[1]);
      camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: { top: 100, bottom: 190, left: 50, right: 70 }, pitch: 0, duration: 800 });
    },
  }));

  // Ask the map which pins and groups are on screen (groups split as you zoom in).
  const syncPins = useCallback(async () => {
    try {
      const features = await map.current?.queryRenderedFeatures({ layers: ["events-hidden"] });
      if (!features) return;
      const seen = new Set<string>();
      const next: Pin[] = [];
      for (const feature of features) {
        const p = (feature.properties ?? {}) as Record<string, number | string | boolean>;
        const at = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        if (p.cluster) {
          const key = `group:${p.cluster_id}:${p.point_count}:${p.liveCount}`;
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ key, at, cluster: true, id: Number(p.cluster_id), count: Number(p.point_count), counts: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, Number(p[c] ?? 0)])), live: Number(p.liveCount) > 0 });
        } else {
          const event = byId.get(String(p.id));
          const key = `${p.id}:${p.status}`;
          if (!event || seen.has(key)) continue;
          seen.add(key);
          next.push({ key, at, cluster: false, event, live: p.status === "live" });
        }
      }
      setPins(next);
    } catch {
      // The map isn't ready yet; the next move will try again.
    }
  }, [byId]);

  // The data changed: give the map a moment to regroup, then re-read the pins.
  useEffect(() => {
    const t = setTimeout(() => void syncPins(), 150);
    return () => clearTimeout(t);
  }, [data, syncPins]);

  // Tap a group: zoom in until it splits, or list them if they're all in one place.
  async function openGroup(pin: Extract<Pin, { cluster: true }>) {
    const src = source.current;
    if (!src) return;
    const zoom = await src.getClusterExpansionZoom(pin.id);
    const current = (await map.current?.getZoom()) ?? 0;
    if (zoom <= 17 && current < 17) {
      camera.current?.easeTo({ center: pin.at, zoom: zoom + 0.2, duration: 500 });
      return;
    }
    const leaves = await src.getClusterLeaves(pin.id, 50, 0);
    const picked = leaves.map((leaf) => byId.get(String(leaf.properties?.id))).filter((e): e is MapEvent => !!e);
    if (picked.length) onSelect(picked);
  }

  const night = look === "night";
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: night ? "#171C27" : "#F7F6F2" }]} testID="map">
      <MapLibreMap
        ref={map}
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        logo={false}
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        compass={false}
        onDidFinishLoadingMap={() => {
          onReady?.();
          void syncPins();
        }}
        onDidFailLoadingMap={() => onError?.()}
        onRegionDidChange={() => void syncPins()}
      >
        <Camera ref={camera} initialViewState={{ center: home, zoom: 16.2, pitch: 35 }} minZoom={9} maxZoom={19} />

        {/* Events, grouped into a numbered bubble when they're close together. */}
        <GeoJSONSource
          id="events"
          ref={source}
          data={data}
          cluster
          clusterRadius={48}
          clusterMaxZoom={17}
          clusterProperties={{
            liveCount: ["+", ["get", "live"]],
            ...Object.fromEntries(CATEGORY_ORDER.map((c) => [c, ["+", ["case", ["==", ["get", "category"], c], 1, 0]]])),
          }}
        >
          {/* As good as invisible (the native map ignores a layer it doesn't draw at all): the map works out the groups, and the pins below follow. */}
          <Layer id="events-hidden" type="circle" style={{ circleRadius: 1, circleOpacity: 0.01 }} />
        </GeoJSONSource>

        {/* The soft "busy area" glow when zoomed out. */}
        <GeoJSONSource id="events-heat" data={heat}>
          <Layer
            id="heat"
            type="heatmap"
            maxzoom={16}
            beforeId="water-name"
            style={{
              heatmapRadius: ["interpolate", ["linear"], ["zoom"], 10, 22, 13, 48, 15, 70],
              heatmapIntensity: ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 1.8],
              heatmapColor: heatColours(look) as never,
              heatmapOpacity: ["interpolate", ["linear"], ["zoom"], 13.5, 1, 16, 0],
            }}
          />
        </GeoJSONSource>

        {/* The walking route: a white-edged line, dotted when it's only an estimate. */}
        <GeoJSONSource id="walk" data={walkGeoJson(walk)}>
          <Layer id="walk-edge" type="line" filter={["==", ["geometry-type"], "LineString"]} style={{ lineCap: "round", lineJoin: "round", lineColor: "#ffffff", lineWidth: 8 }} />
          <Layer id="walk-line" type="line" filter={["==", ["geometry-type"], "LineString"]} style={{ lineCap: "round", lineJoin: "round", lineColor: WALK_COLOUR, lineWidth: 5, lineDasharray: walk?.estimate ? [1, 2] : [1, 0] }} />
          <Layer id="walk-start" type="circle" filter={["==", ["geometry-type"], "Point"]} style={{ circleRadius: 7, circleColor: ME_COLOUR, circleStrokeColor: "#ffffff", circleStrokeWidth: 3 }} />
        </GeoJSONSource>

        {me && <UserLocation animated accuracy />}

        {pins.map((pin) =>
          pin.cluster ? (
            <Marker key={pin.key} id={pin.key} lngLat={pin.at} anchor="center" onPress={() => void openGroup(pin)}>
              <Cluster count={pin.count} counts={pin.counts} live={pin.live} night={night} />
            </Marker>
          ) : (
            <Marker key={pin.key} id={pin.key} lngLat={pin.at} anchor="bottom" onPress={() => onSelect([pin.event])}>
              <PinView event={pin.event} live={pin.live} night={night} />
            </Marker>
          ),
        )}
      </MapLibreMap>
    </View>
  );
}

// A "lollipop" pin: a round head with the category icon on a short stem.
function PinView({ event, live, night }: { event: MapEvent; live: boolean; night: boolean }) {
  const { colour } = CATEGORY_STYLE[event.category];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={event.title} style={styles.pin} testID={`pin-${event.id}`}>
      <View style={[styles.pinStem, night && { backgroundColor: "#cbd5e1" }]} />
      <View style={styles.pinFoot} />
      <View style={[styles.pinHead, { backgroundColor: colour }, night && { shadowColor: colour, shadowOpacity: 0.9, shadowRadius: 8 }]}>
        <Ionicons name={PIN_ICON[event.category] as never} size={19} color="#fff" />
      </View>
      {live && (
        <View style={styles.pinLive}>
          <Text style={styles.pinLiveText}>LIVE</Text>
        </View>
      )}
    </Pressable>
  );
}

// A group of nearby events: the number, with a ring of the categories' colours.
function Cluster({ count, counts, live, night }: { count: number; counts: Record<string, number>; live: boolean; night: boolean }) {
  const size = count >= 20 ? 54 : count >= 6 ? 48 : 42;
  const present = CATEGORY_ORDER.filter((c) => counts[c] > 0);
  const ringColour = present.length === 1 ? CATEGORY_STYLE[present[0]].colour : WALK_COLOUR;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${count} events here. Tap to zoom in.`} style={[styles.cluster, { width: size, height: size, borderRadius: size / 2, borderColor: ringColour }]} testID="cluster">
      <View style={[styles.clusterInner, night && { backgroundColor: "#1f2533" }]}>
        <Text style={[styles.clusterNum, night && { color: "#fff" }]}>{count > 99 ? "99+" : count}</Text>
      </View>
      {live && <View style={styles.clusterLive} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pin: { width: 40, height: 56 },
  pinHead: { position: "absolute", left: 2, top: 2, width: 36, height: 36, borderRadius: 18, borderWidth: 2.5, borderColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  pinStem: { position: "absolute", left: 18.75, top: 34, width: 2.5, height: 18, borderRadius: 2, backgroundColor: "#475569" },
  pinFoot: { position: "absolute", left: 15.5, top: 51, width: 9, height: 5, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.25)" },
  pinLive: { position: "absolute", left: 6, top: -12, backgroundColor: "#f43f5e", borderRadius: 999, borderWidth: 1.5, borderColor: "#fff", paddingHorizontal: 5, paddingVertical: 3 },
  pinLiveText: { color: "#fff", fontSize: 9, fontFamily: "Figtree_700Bold", letterSpacing: 0.4, lineHeight: 10 },
  cluster: { borderWidth: 4.5, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  clusterInner: { flex: 1, alignSelf: "stretch", borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  clusterNum: { fontFamily: "Figtree_700Bold", fontSize: 16, color: "#1f2937" },
  clusterLive: { position: "absolute", right: -4, top: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: "#f43f5e", borderWidth: 2, borderColor: "#fff" },
});
