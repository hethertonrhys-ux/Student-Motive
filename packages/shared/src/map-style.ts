// Shared by the live map and the "pick a place" map in the event form.

// Free map tiles from OpenFreeMap: no account or API key needed.
// Each app may override this with its own env var (NEXT_PUBLIC_MAP_STYLE_URL / EXPO_PUBLIC_MAP_STYLE_URL).
export const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// [longitude, latitude] of LSE (Houghton Street).
export const LSE: [number, number] = [-0.1168, 51.5146];

// Straight-line distance in metres between two [lng, lat] points.
export function distanceMetres(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// "8 min walk" nearby, "3.2 km away" further out. Streets aren't straight,
// so walking distance is roughly 1.3x the straight line, at about 80 m a minute.
export function howFar(metres: number) {
  const minutes = Math.max(1, Math.round((metres * 1.3) / 80));
  if (minutes <= 40) return `${minutes} min walk`;
  return `${(metres / 1000).toFixed(1)} km away`;
}
