import { useEffect, useState } from "react";

// True once the screen is on. The web build is pre-rendered at build time,
// so anything that can only be known on the device (the time of day, icon
// fonts, saved settings) waits for this to avoid a mismatch on load.
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  // Intentional: the first render must match the pre-rendered web page.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return mounted;
}
