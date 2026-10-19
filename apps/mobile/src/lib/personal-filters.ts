import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { NO_PERSONAL_FILTERS, type PersonalFilters } from "@function/shared";

// The two personal tick boxes (friends hosting / my societies). One shared
// value for the whole app, so ticking a box on the map also ticks it in
// event search and Recommended, remembered on this device like the map's
// categories.
const KEY = "function-personal-filters";

let current: PersonalFilters = NO_PERSONAL_FILTERS;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw === null) return;
      const parsed = JSON.parse(raw) as Partial<PersonalFilters>;
      current = { friendsHosting: parsed.friendsHosting === true, mySocieties: parsed.mySocieties === true };
      emit();
    })
    .catch(() => {});
}

export function usePersonalFilters(): [PersonalFilters, (next: PersonalFilters) => void] {
  const filters = useSyncExternalStore(subscribe, () => current, () => NO_PERSONAL_FILTERS);
  useEffect(load, []);
  const set = useCallback((next: PersonalFilters) => {
    current = next;
    emit();
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  return [filters, set];
}
