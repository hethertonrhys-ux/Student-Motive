import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { MAP_CATEGORIES, type MapCategory } from "@function/shared";

// The map's category filter, remembered on this device (the website keeps
// it in local storage under the same name). Every category starts ticked,
// so the map is as busy as it can be; nothing ticked also shows everything.
const KEY = "function-map-categories";
const VALID = new Set(MAP_CATEGORIES.map((c) => c.value));
export const ALL_CATEGORIES: MapCategory[] = MAP_CATEGORIES.map((c) => c.value);

// True when the filter is actually hiding something.
export const isFiltering = (categories: MapCategory[]) => categories.length > 0 && categories.length < ALL_CATEGORIES.length;

export function useSavedCategories(): [MapCategory[], (next: MapCategory[]) => void] {
  const [categories, setCategories] = useState<MapCategory[]>(ALL_CATEGORIES);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw === null) return; // never changed: keep everything ticked
        const parsed = (JSON.parse(raw) as MapCategory[]).filter((c) => VALID.has(c));
        setCategories(parsed);
      })
      .catch(() => {});
  }, []);
  const set = useCallback((next: MapCategory[]) => {
    setCategories(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  return [categories, set];
}
