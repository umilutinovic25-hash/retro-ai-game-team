import { DEFAULT_CONFIG, type GameConfig } from "../game/snakeConfig.ts";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = typeof DIFFICULTIES[number];

export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.includes(value as Difficulty);
}

/** Speed-only presets for Phase 1. They are sent to the server, which validates them with parseGameConfig. */
export const DIFFICULTY_CONFIGS: Record<Difficulty, GameConfig> = {
  easy: { ...DEFAULT_CONFIG, startingSpeedMs: 200 },
  normal: DEFAULT_CONFIG,
  hard: { ...DEFAULT_CONFIG, startingSpeedMs: 125 },
};
