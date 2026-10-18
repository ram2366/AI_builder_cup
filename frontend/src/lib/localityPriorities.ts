import { useSyncExternalStore } from "react";
import type { SubIndexScore } from "./types";

export type LocalityPriority = "commute" | "schools" | "essentials" | "green_air" | "social";
export type PriorityLevel = "low" | "normal" | "high";
export type PrioritySettings = Record<LocalityPriority, PriorityLevel>;

export const PRIORITY_MULTIPLIERS: Record<PriorityLevel, number> = {
  low: 0.5,
  normal: 1,
  high: 2,
};

export const DEFAULT_PRIORITIES: PrioritySettings = {
  commute: "normal",
  schools: "normal",
  essentials: "normal",
  green_air: "normal",
  social: "normal",
};

export const PRIORITY_DEFINITIONS: {
  key: LocalityPriority;
  label: string;
  subIndex: string;
  baseWeight: number;
}[] = [
  { key: "commute", label: "Commute", subIndex: "transit", baseWeight: 0.3 },
  { key: "schools", label: "Schools", subIndex: "education", baseWeight: 0.2 },
  { key: "essentials", label: "Daily essentials", subIndex: "essentials", baseWeight: 0.3 },
  // The existing social score is 35% parks/green and 65% dining/social.
  // Splitting its 20% weight preserves today's default score exactly.
  { key: "green_air", label: "Green & air", subIndex: "social", baseWeight: 0.07 },
  { key: "social", label: "Social/dining", subIndex: "social", baseWeight: 0.13 },
];

const STORAGE_KEY = "sampaaa.locality-priorities.v1";
const PRIORITY_KEYS = new Set<LocalityPriority>(PRIORITY_DEFINITIONS.map((item) => item.key));
const LEVELS = new Set<PriorityLevel>(["low", "normal", "high"]);

function readStoredPriorities(): PrioritySettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<PrioritySettings>;
    const next = { ...DEFAULT_PRIORITIES };
    for (const [key, value] of Object.entries(parsed)) {
      if (PRIORITY_KEYS.has(key as LocalityPriority) && LEVELS.has(value as PriorityLevel)) {
        next[key as LocalityPriority] = value as PriorityLevel;
      }
    }
    return next;
  } catch {
    return { ...DEFAULT_PRIORITIES };
  }
}

let currentPriorities = readStoredPriorities();
const listeners = new Set<() => void>();

function publish(next: PrioritySettings) {
  currentPriorities = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be disabled or full. The in-memory choice still works.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentPriorities;
}

export function personalLocalityScore(
  subIndices: Record<string, SubIndexScore>,
  priorities: PrioritySettings,
  defaultScore?: number,
): number {
  if (
    defaultScore !== undefined
    && PRIORITY_DEFINITIONS.every(({ key }) => priorities[key] === DEFAULT_PRIORITIES[key])
  ) {
    return defaultScore;
  }
  let weightedTotal = 0;
  let weightTotal = 0;

  for (const definition of PRIORITY_DEFINITIONS) {
    const subIndex = subIndices[definition.subIndex];
    if (!subIndex || !Number.isFinite(subIndex.score)) continue;
    const weight = definition.baseWeight * PRIORITY_MULTIPLIERS[priorities[definition.key]];
    weightedTotal += subIndex.score * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return 0;
  return Math.max(0, Math.min(100, Math.round(weightedTotal / weightTotal)));
}

export function useLocalityPriorities() {
  const priorities = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    priorities,
    setPriority(key: LocalityPriority, level: PriorityLevel) {
      publish({ ...currentPriorities, [key]: level });
    },
    reset() {
      publish({ ...DEFAULT_PRIORITIES });
    },
    isDefault: PRIORITY_DEFINITIONS.every(({ key }) => priorities[key] === "normal"),
  };
}
