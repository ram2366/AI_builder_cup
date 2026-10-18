import { useSyncExternalStore } from "react";
import type { AirQualityReport, CommuteReport, LocalityReport, NeighborhoodHealth } from "./types";

export interface LocalityCompareItem {
  locality: LocalityReport;
  commute: CommuteReport | null;
  air: AirQualityReport | null;
  health: NeighborhoodHealth | null;
}

let items: LocalityCompareItem[] = [];
const listeners = new Set<() => void>();

function publish(next: LocalityCompareItem[]) {
  items = next.slice(0, 3);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return items;
}

export function useLocalityCompare() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    items: current,
    full: current.length >= 3,
    has(id: string) {
      return current.some((item) => item.locality.id === id);
    },
    addOrUpdate(item: LocalityCompareItem) {
      const index = items.findIndex((entry) => entry.locality.id === item.locality.id);
      if (index >= 0) {
        publish(items.map((entry, itemIndex) => itemIndex === index ? {
          locality: item.locality,
          commute: item.commute ?? entry.commute,
          air: item.air ?? entry.air,
          health: item.health ?? entry.health,
        } : entry));
      } else if (items.length < 3) {
        publish([...items, item]);
      }
    },
    remove(id: string) {
      publish(items.filter((item) => item.locality.id !== id));
    },
    clear() {
      publish([]);
    },
  };
}
