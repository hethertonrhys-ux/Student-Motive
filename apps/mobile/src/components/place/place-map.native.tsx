import { Camera, Map as MapLibreMap, Marker, type CameraRef } from "@maplibre/maplibre-react-native";
import { useImperativeHandle, useRef, type Ref } from "react";
import { StyleSheet, View } from "react-native";
import { DEFAULT_MAP_STYLE } from "@function/shared";

export type Point = { lng: number; lat: number };
export type PlaceMapHandle = { flyTo(point: Point): void };

// Tap the map to drop a pin (tap again to move it).
export function PlaceMap({ centre, pin, onPick, ref }: { centre: [number, number]; pin: Point | null; onPick: (point: Point) => void; ref?: Ref<PlaceMapHandle> }) {
  const camera = useRef<CameraRef>(null);
  useImperativeHandle(ref, () => ({ flyTo: (p) => camera.current?.flyTo({ center: [p.lng, p.lat], zoom: 17, duration: 800 }) }));
  return (
    <View style={{ height: 256, borderRadius: 12, overflow: "hidden", backgroundColor: "#e9ebf0" }} testID="place-map">
      <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={DEFAULT_MAP_STYLE} logo={false} compass={false} onPress={(e) => onPick({ lng: e.nativeEvent.lngLat[0], lat: e.nativeEvent.lngLat[1] })}>
        <Camera ref={camera} initialViewState={{ center: pin ? [pin.lng, pin.lat] : centre, zoom: pin ? 16 : 15 }} />
        {pin && (
          <Marker lngLat={[pin.lng, pin.lat]} anchor="bottom">
            <View style={styles.pin}>
              <View style={styles.head} />
              <View style={styles.tip} />
            </View>
          </Marker>
        )}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { alignItems: "center" },
  head: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#DA291C", borderWidth: 2, borderColor: "#fff" },
  tip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#DA291C", marginTop: -2 },
});
