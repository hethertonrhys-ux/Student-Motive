import * as Location from "expo-location";

// Where you are, as [longitude, latitude]. Only asked for when you tap
// "Show what's near me" or Directions. On the web this uses the browser's
// own location prompt; on the phone, the system one.
export async function whereAmI(): Promise<[number, number]> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error("Location is turned off for Function. Allow it in your phone's settings to see what's near you.");
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return [p.coords.longitude, p.coords.latitude];
  } catch {
    throw new Error("Couldn't find your location. Try again outside or near a window.");
  }
}

// Already said yes before? Then the blue dot can show straight away.
export async function locationAllowed() {
  try {
    return (await Location.getForegroundPermissionsAsync()).status === "granted";
  } catch {
    return false;
  }
}
