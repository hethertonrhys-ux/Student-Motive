import Ionicons from "@expo/vector-icons/Ionicons";
import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, Marker, UserLocation, type CameraRef, type GeoJSONSourceRef, type MapRef } from "@maplibre/maplibre-react-native";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CATEGORY_ORDER, CATEGORY_STYLE, eventStatus, heatColours, mapLand, mapStyle, timeFormat, walkGeoJson, type MapEvent } from "@function/shared";
import { selectionTap } from "@/lib/haptics";
import { DARK, LIGHT } from "@/lib/theme";
import { ME_COLOUR, PIN_ICON, WALK_COLOUR, type MapProps } from "./types";

// The live map on iOS and Android, drawn by MapLibre Native. The same flat
// map style, groups and busy-area shading as the web version; the pins are
// small React Native views placed on the map, in the style of Snap Map.

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
  const style = useMemo(() => mapStyle(look), [look]);

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
    selectionTap();
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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: mapLand(look) }]} testID="map">
      <MapLibreMap
        ref={map}
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        logo={false}
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        compass={false}
        // Flat and north-up, like Snap Map: no tilting or turning.
        touchPitch={false}
        touchRotate={false}
        onDidFinishLoadingMap={() => {
          onReady?.();
          void syncPins();
        }}
        onDidFailLoadingMap={() => onError?.()}
        onRegionDidChange={() => void syncPins()}
      >
        <Camera ref={camera} initialViewState={{ center: home, zoom: 16.2, pitch: 0 }} minZoom={9} maxZoom={19} />

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
              <Cluster count={pin.count} live={pin.live} night={night} />
            </Marker>
          ) : (
            <Marker key={pin.key} id={pin.key} lngLat={pin.at} anchor="center" onPress={() => onSelect([pin.event])}>
              <PinView event={pin.event} live={pin.live} night={night} />
            </Marker>
          ),
        )}
      </MapLibreMap>
    </View>
  );
}

// A pin, like Snap Map's: the event's icon in a round bubble with a white
// edge (its colour says the category), a red ring while it's on, a red
// badge with how many are going, and its name and start time underneath.
// The bubble sits in the middle of the pin, right over the event's spot.
function PinView({ event, live, night }: { event: MapEvent; live: boolean; night: boolean }) {
  const { colour } = CATEGORY_STYLE[event.category];
  const accent = night ? DARK.brand : LIGHT.brand;
  const when = live ? "On now" : timeFormat.format(new Date(event.startsAt));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}, ${when}, ${event.going} going`} style={styles.pin} testID={`pin-${event.id}`}>
      <View style={styles.above} />
      <View style={[styles.ring, live && { borderColor: accent }]}>
        <View style={[styles.bubble, { backgroundColor: colour }]}>
          <Ionicons name={PIN_ICON[event.category] as never} size={20} color="#fff" />
        </View>
      </View>
      {event.going > 0 && (
        <View style={[styles.badge, { backgroundColor: accent }]}>
          <Text style={styles.badgeText}>{event.going > 99 ? "99+" : event.going}</Text>
        </View>
      )}
      <View style={[styles.label, night && styles.labelNight]}>
        <Text numberOfLines={1} style={[styles.labelText, night && styles.labelTextNight]}>
          {event.title} · {when}
        </Text>
      </View>
    </Pressable>
  );
}

// A group of nearby events: a white (or dark grey) bubble with the number
// and a Function red edge, and a red dot if one of them is on now.
function Cluster({ count, live, night }: { count: number; live: boolean; night: boolean }) {
  const size = count >= 20 ? 54 : count >= 6 ? 48 : 44;
  const accent = night ? DARK.brand : LIGHT.brand;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${count} events here. Tap to zoom in.`} style={[styles.cluster, { width: size, height: size, borderRadius: size / 2, borderColor: accent, backgroundColor: night ? "#2C2C2E" : "#FFFFFF" }]} testID="cluster">
      <Text style={[styles.clusterNum, { color: night ? "#FFFFFF" : LIGHT.ink }]}>{count > 99 ? "99+" : count}</Text>
      {live && <View style={[styles.clusterLive, { backgroundColor: accent }]} />}
    </Pressable>
  );
}

const SHADOW = { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 };
const styles = StyleSheet.create({
  // 160 wide so the label fits; the space above matches the label below, so the bubble is the centre.
  pin: { width: 160, alignItems: "center" },
  above: { height: 24 },
  ring: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  bubble: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center", ...SHADOW },
  badge: { position: "absolute", top: 22, left: 98, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  label: { marginTop: 2, maxWidth: 160, height: 22, justifyContent: "center", borderRadius: 11, paddingHorizontal: 8, backgroundColor: "#FFFFFF", ...SHADOW },
  labelNight: { backgroundColor: "#2C2C2E" },
  labelText: { fontSize: 12, fontWeight: "600", color: LIGHT.ink },
  labelTextNight: { color: "#FFFFFF" },
  cluster: { borderWidth: 3, alignItems: "center", justifyContent: "center", ...SHADOW },
  clusterNum: { fontSize: 16, fontWeight: "700" },
  clusterLive: { position: "absolute", right: -2, top: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#fff" },
});
