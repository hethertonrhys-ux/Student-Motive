import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { MAP_CATEGORIES, type MapCategory } from "@function/shared";

// The map's category filter, remembered on this device (the website keeps
// it in local storage under the same name). Nothing ticked shows everything.
const KEY = "function-map-categories";
const VALID = new Set(MAP_CATEGORIES.map((c) => c.value));

export function useSavedCategories(): [MapCategory[], (next: MapCategory[]) => void] {
  const [categories, setCategories] = useState<MapCategory[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const parsed = (JSON.parse(raw ?? "[]") as MapCategory[]).filter((c) => VALID.has(c));
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
