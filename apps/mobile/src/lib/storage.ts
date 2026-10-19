import AsyncStorage from "@react-native-async-storage/async-storage";

// Small things remembered on this device (the website keeps these in
// cookies or local storage). Each read and write is wrapped so a blocked
// or empty store never breaks a screen.

const WELCOMED = "fn-welcomed"; // the welcome step has been seen
const LOGIN_PENDING = "fn-login-pending"; // a login code was sent to this email
const ARRIVAL_UNI = "fn-uni"; // the uni landing page they arrived on
const PENDING_FOR_MS = 60 * 60 * 1000;

async function get(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}
async function set(key: string, value: string | null) {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // Storage blocked: the app still works, it just won't remember.
  }
}

export const welcomed = { get: async () => (await get(WELCOMED)) === "1", set: () => set(WELCOMED, "1") };

export const arrivalUni = { get: () => get(ARRIVAL_UNI), set: (id: string | null) => set(ARRIVAL_UNI, id) };

// Remember that a code was sent, so if the app reloads while you're
// checking your email, the code box is still there when you come back.
export const loginPending = {
  async get(): Promise<string | null> {
    try {
      const saved = JSON.parse((await get(LOGIN_PENDING)) ?? "null") as { email: string; at: number } | null;
      return saved && Date.now() - saved.at < PENDING_FOR_MS ? saved.email : null;
    } catch {
      return null;
    }
  },
  set: (email: string | null) => set(LOGIN_PENDING, email ? JSON.stringify({ email, at: Date.now() }) : null),
};
