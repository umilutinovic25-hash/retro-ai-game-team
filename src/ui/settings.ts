import type { Difficulty } from "./difficulty.ts";

export const SETTING_KEYS = {
  difficulty: "retro-snake-difficulty",
  colorblind: "retro-snake-colorblind",
} as const;

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSetting(key: string, storage: ReadStorage | null = defaultStorage()): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string, storage: WriteStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Local persistence is optional; the game must work when it is unavailable.
  }
}

export function bestKey(difficulty: Difficulty): string {
  return difficulty === "normal" ? "retro-snake-best-score" : `retro-snake-best-score-${difficulty}`;
}

export function readBest(difficulty: Difficulty, storage: ReadStorage | null = defaultStorage()): number {
  const saved = Number(readSetting(bestKey(difficulty), storage));
  return Number.isInteger(saved) && saved >= 0 ? saved : 0;
}
