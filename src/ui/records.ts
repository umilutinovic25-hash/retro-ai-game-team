import { isDifficulty, type Difficulty } from "./difficulty.ts";

export type ScoreEntry = { name: string; score: number; difficulty: Difficulty; date: string };
export type Stats = { games: number; totalFood: number; longestSnake: number; bestCombo: number };
export type Records = { top: ScoreEntry[]; stats: Stats };

const RECORDS_KEY = "retro-snake-records";
export const TOP_SIZE = 10;
const EMPTY_STATS: Stats = { games: 0, totalFood: 0, longestSnake: 0, bestCombo: 0 };

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function sanitizeName(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return cleaned.length > 0 ? cleaned : "???";
}

function parseEntry(value: unknown): ScoreEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.name !== "string" || !isCount(entry.score) || !isDifficulty(entry.difficulty) || typeof entry.date !== "string") return null;
  return { name: sanitizeName(entry.name), score: entry.score, difficulty: entry.difficulty, date: entry.date.slice(0, 10) };
}

/** Stored data is untrusted: anything malformed is dropped rather than shown. */
export function parseRecords(raw: string | null): Records {
  try {
    const data = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    const top = Array.isArray(data?.top) ? data.top.map(parseEntry).filter((e): e is ScoreEntry => e !== null) : [];
    const stats = data?.stats as Record<string, unknown> | undefined;
    return {
      top: top.sort((a, b) => b.score - a.score).slice(0, TOP_SIZE),
      stats: {
        games: isCount(stats?.games) ? stats.games : 0,
        totalFood: isCount(stats?.totalFood) ? stats.totalFood : 0,
        longestSnake: isCount(stats?.longestSnake) ? stats.longestSnake : 0,
        bestCombo: isCount(stats?.bestCombo) ? stats.bestCombo : 0,
      },
    };
  } catch {
    return { top: [], stats: { ...EMPTY_STATS } };
  }
}

export function loadRecords(): Records {
  try {
    return parseRecords(window.localStorage.getItem(RECORDS_KEY));
  } catch {
    return { top: [], stats: { ...EMPTY_STATS } };
  }
}

export function saveRecords(records: Records): void {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Persistence is optional.
  }
}

export function qualifies(records: Records, score: number): boolean {
  if (score <= 0) return false;
  return records.top.length < TOP_SIZE || score > records.top[records.top.length - 1].score;
}

export function addEntry(records: Records, entry: ScoreEntry): { records: Records; rank: number } {
  const top = [...records.top, entry].sort((a, b) => b.score - a.score).slice(0, TOP_SIZE);
  return { records: { ...records, top }, rank: top.indexOf(entry) };
}

export function recordGame(records: Records, game: { food: number; length: number; combo: number }): Records {
  const stats = records.stats;
  return {
    ...records,
    stats: {
      games: stats.games + 1,
      totalFood: stats.totalFood + game.food,
      longestSnake: Math.max(stats.longestSnake, game.length),
      bestCombo: Math.max(stats.bestCombo, game.combo),
    },
  };
}
