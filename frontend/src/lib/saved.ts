// Saved plots (a light watchlist) and the compare tray. Both live in localStorage on this device;
// real alerts need a backend scheduler and accounts, which are on the roadmap.

import { useSyncExternalStore } from "react";
import type { Level } from "./types";

export interface SavedPlot {
  reportId: string;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  overall: Level | null;
  savedAt: number;
}

export interface CompareItem {
  reportId: string;
  label: string;
  overall: Level | null;
}

const SAVED_KEY = "landlens.saved";
const COMPARE_KEY = "landlens.compare";
const MAX_COMPARE = 3;

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function makeStore<T>(key: string) {
  let value = read<T>(key);
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T[]) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep in memory */
      }
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

const savedStore = makeStore<SavedPlot>(SAVED_KEY);
const compareStore = makeStore<CompareItem>(COMPARE_KEY);

export function useSaved() {
  const saved = useSyncExternalStore(savedStore.subscribe, savedStore.get);
  return {
    saved,
    isSaved: (id: string) => saved.some((s) => s.reportId === id),
    toggle(p: SavedPlot) {
      const exists = saved.some((s) => s.reportId === p.reportId);
      savedStore.set(exists ? saved.filter((s) => s.reportId !== p.reportId) : [p, ...saved].slice(0, 20));
    },
    remove: (id: string) => savedStore.set(saved.filter((s) => s.reportId !== id)),
  };
}

export function useCompare() {
  const items = useSyncExternalStore(compareStore.subscribe, compareStore.get);
  return {
    items,
    has: (id: string) => items.some((i) => i.reportId === id),
    full: items.length >= MAX_COMPARE,
    toggle(item: CompareItem) {
      if (items.some((i) => i.reportId === item.reportId)) compareStore.set(items.filter((i) => i.reportId !== item.reportId));
      else if (items.length < MAX_COMPARE) compareStore.set([...items, item]);
    },
    clear: () => compareStore.set([]),
    /** Replace the whole list (used by "compare with another" to start a fresh comparison). */
    replace: (next: CompareItem[]) => compareStore.set(next.slice(0, MAX_COMPARE)),
    add(item: CompareItem) {
      const cur = compareStore.get();
      if (!cur.some((i) => i.reportId === item.reportId) && cur.length < MAX_COMPARE) compareStore.set([...cur, item]);
    },
  };
}
