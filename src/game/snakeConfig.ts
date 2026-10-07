export type GameMode = "classic" | "vs_ai";

export type GameConfig = {
  mode: GameMode;
  gridSize: number;
  startingSnakeLength: number;
  startingSpeedMs: number;
  speedIncreaseEvery: number;
  speedDecreaseMs: number;
  minimumSpeedMs: number;
  scorePerFood: number;
  obstacleStartCount: number;
  obstacleEvery: number;
  maxObstacles: number;
  bonusChance: number;
  bonusLifetimeTicks: number;
};

export const DEFAULT_CONFIG: GameConfig = {
  mode: "classic",
  gridSize: 20,
  startingSnakeLength: 3,
  startingSpeedMs: 160,
  speedIncreaseEvery: 5,
  speedDecreaseMs: 12,
  minimumSpeedMs: 80,
  scorePerFood: 1,
  obstacleStartCount: 4,
  obstacleEvery: 8,
  maxObstacles: 14,
  bonusChance: 0.3,
  bonusLifetimeTicks: 45,
};

export type ConfigValidation = {
  config: GameConfig;
  error?: string;
};

function isValidConfig(value: unknown): value is GameConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const keys = ["mode", "gridSize", "startingSnakeLength", "startingSpeedMs", "speedIncreaseEvery", "speedDecreaseMs", "minimumSpeedMs", "scorePerFood", "obstacleStartCount", "obstacleEvery", "maxObstacles", "bonusChance", "bonusLifetimeTicks"];
  return Object.keys(candidate).length === keys.length && Object.keys(candidate).every((key) => keys.includes(key))
    && (candidate.mode === "classic" || candidate.mode === "vs_ai")
    && candidate.gridSize === 20
    && candidate.startingSnakeLength === 3
    && typeof candidate.startingSpeedMs === "number"
    && Number.isInteger(candidate.startingSpeedMs)
    && candidate.startingSpeedMs >= 80
    && candidate.startingSpeedMs <= 1000
    && candidate.speedIncreaseEvery === 5
    && candidate.speedDecreaseMs === 12
    && candidate.minimumSpeedMs === 80
    && candidate.scorePerFood === 1
    && typeof candidate.obstacleStartCount === "number" && Number.isInteger(candidate.obstacleStartCount) && candidate.obstacleStartCount >= 0 && candidate.obstacleStartCount <= 20
    && typeof candidate.obstacleEvery === "number" && Number.isInteger(candidate.obstacleEvery) && candidate.obstacleEvery >= 1 && candidate.obstacleEvery <= 100
    && typeof candidate.maxObstacles === "number" && Number.isInteger(candidate.maxObstacles) && candidate.maxObstacles >= candidate.obstacleStartCount && candidate.maxObstacles <= 40
    && typeof candidate.bonusChance === "number" && candidate.bonusChance >= 0 && candidate.bonusChance <= 1
    && typeof candidate.bonusLifetimeTicks === "number" && Number.isInteger(candidate.bonusLifetimeTicks) && candidate.bonusLifetimeTicks >= 10 && candidate.bonusLifetimeTicks <= 500;
}

export function parseGameConfig(value: unknown): ConfigValidation {
  if (isValidConfig(value)) return { config: { ...value } };
  return {
    config: { ...DEFAULT_CONFIG },
    error: "Nevažeća konfiguracija igre — koristi se bezbedna podrazumevana konfiguracija.",
  };
}

export function validateGameConfig(value: unknown): GameConfig {
  return parseGameConfig(value).config;
}

export function getTickMs(config: GameConfig, score: number): number {
  const speedUps = Math.floor(score / config.speedIncreaseEvery);
  return Math.max(config.minimumSpeedMs, config.startingSpeedMs - speedUps * config.speedDecreaseMs);
}
