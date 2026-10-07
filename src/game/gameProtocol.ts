import { parseGameConfig, type GameConfig } from "./snakeConfig.ts";
import { BONUS_POINTS, getLevelForXp, type Bonus, type Direction, type GameStatus, type Point } from "./snakeEngine.ts";

export type PlayerState = {
  id: string;
  snake: Point[];
  direction: Direction;
  queuedDirection: Direction;
  score: number;
  progression: { xp: number; level: number; perkPoints: number };
  perks: {
    extraXp: { level: number; nextCost: number | null };
    luck: { level: number; nextCost: number | null };
    extraLife: { charges: number; nextCost: 5 | 8 | null };
  };
};

export type GameContainerState = {
  status: GameStatus;
  food: Point | null;
  luckyPickup: Point | null;
  bonus: Bonus | null;
  obstacles: Point[];
  rival: { snake: Point[]; direction: Direction; score: number; alive: boolean } | null;
};

/** State sent from the authoritative server to a browser client. */
export type GameSnapshot = {
  id: string;
  revision: number;
  config: GameConfig;
  configError: string | null;
  players: PlayerState[];
  state: GameContainerState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPoint(value: unknown, gridSize: number): value is { x: number; y: number } {
  return isRecord(value) && Number.isInteger(value.x) && Number.isInteger(value.y)
    && (value.x as number) >= 0 && (value.y as number) >= 0
    && (value.x as number) < gridSize && (value.y as number) < gridSize;
}

function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "right" || value === "down" || value === "left";
}

export function validateGameSnapshot(value: unknown): GameSnapshot | null {
  const snapshotKeys = ["id", "revision", "config", "configError", "players", "state"];
  if (!isRecord(value) || Object.keys(value).some((key) => !snapshotKeys.includes(key))
    || Object.keys(value).length !== snapshotKeys.length || typeof value.id !== "string" || !value.id
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || !isRecord(value.config) || !Array.isArray(value.players) || value.players.length !== 1 || !isRecord(value.state)) return null;

  const config = value.config;
  const numericConfigKeys = ["gridSize", "startingSnakeLength", "startingSpeedMs", "speedIncreaseEvery", "speedDecreaseMs", "minimumSpeedMs", "scorePerFood", "obstacleStartCount", "obstacleEvery", "maxObstacles", "bonusChance", "bonusLifetimeTicks"];
  if (Object.keys(config).length !== numericConfigKeys.length + 1 || numericConfigKeys.some((key) => typeof config[key] !== "number")
    || (config.mode !== "classic" && config.mode !== "vs_ai")) return null;
  const parsedConfig = parseGameConfig(config);
  if (parsedConfig.error) return null;
  const gridSize = config.gridSize as number;
  if (!Number.isInteger(gridSize) || gridSize < 1) return null;

  const state = value.state;
  const stateKeys = ["food", "luckyPickup", "bonus", "obstacles", "rival", "status"];
  if (Object.keys(state).length !== stateKeys.length || Object.keys(state).some((key) => !stateKeys.includes(key))
    || (state.food !== null && !isPoint(state.food, gridSize))
    || (state.luckyPickup !== null && !isPoint(state.luckyPickup, gridSize))
    || !Array.isArray(state.obstacles) || state.obstacles.length > parsedConfig.config.maxObstacles
    || !state.obstacles.every((point) => isPoint(point, gridSize))
    || !["ready", "playing", "paused", "game_over", "won"].includes(String(state.status))) return null;

  let rival: GameContainerState["rival"] = null;
  if (config.mode === "vs_ai") {
    if (!isRecord(state.rival) || Object.keys(state.rival).length !== 4
      || Object.keys(state.rival).some((key) => !["snake", "direction", "score", "alive"].includes(key))
      || !Array.isArray(state.rival.snake) || typeof state.rival.alive !== "boolean"
      || !isDirection(state.rival.direction) || !Number.isSafeInteger(state.rival.score) || (state.rival.score as number) < 0
      || (state.rival.alive && (state.rival.snake.length < 3 || !state.rival.snake.every((point) => isPoint(point, gridSize))))
      || (!state.rival.alive && state.rival.snake.length !== 0)) return null;
    rival = { snake: state.rival.snake as Point[], direction: state.rival.direction, score: state.rival.score as number, alive: state.rival.alive };
  } else if (state.rival !== null) return null;

  let bonus: Bonus | null = null;
  if (state.bonus !== null) {
    const value = state.bonus;
    if (!isRecord(value) || Object.keys(value).length !== 5
      || Object.keys(value).some((key) => !["position", "kind", "points", "ticksLeft", "lifetime"].includes(key))
      || !isPoint(value.position, gridSize)
      || (value.kind !== "gold" && value.kind !== "gem")
      || value.points !== BONUS_POINTS[value.kind]
      || !Number.isInteger(value.lifetime) || value.lifetime !== parsedConfig.config.bonusLifetimeTicks
      || !Number.isInteger(value.ticksLeft) || (value.ticksLeft as number) < 1 || (value.ticksLeft as number) > value.lifetime) return null;
    bonus = { position: value.position, kind: value.kind, points: value.points, ticksLeft: value.ticksLeft as number, lifetime: value.lifetime as number };
  }

  const player = value.players[0];
  const playerKeys = ["id", "snake", "direction", "queuedDirection", "score", "progression", "perks"];
  if (!isRecord(player) || Object.keys(player).length !== playerKeys.length
    || Object.keys(player).some((key) => !playerKeys.includes(key))
    || typeof player.id !== "string" || !player.id
    || !Array.isArray(player.snake) || player.snake.length < 1 || player.snake.length > gridSize * gridSize
    || !player.snake.every((point) => isPoint(point, gridSize))
    || !isDirection(player.direction) || !isDirection(player.queuedDirection)
    || typeof player.score !== "number" || !Number.isSafeInteger(player.score) || player.score < 0
    || !isRecord(player.progression) || Object.keys(player.progression).length !== 3
    || Object.keys(player.progression).some((key) => !["xp", "level", "perkPoints"].includes(key))
    || !Number.isSafeInteger(player.progression.xp) || (player.progression.xp as number) < 0
    || !Number.isSafeInteger(player.progression.level) || player.progression.level !== getLevelForXp(player.progression.xp as number)
    || !Number.isSafeInteger(player.progression.perkPoints) || (player.progression.perkPoints as number) < 0
    || !isRecord(player.perks) || Object.keys(player.perks).length !== 3
    || Object.keys(player.perks).some((key) => !["extraXp", "luck", "extraLife"].includes(key))) return null;

  const extraXp = player.perks.extraXp;
  const luck = player.perks.luck;
  const extraLife = player.perks.extraLife;
  if (!isRecord(extraXp) || Object.keys(extraXp).length !== 2
    || Object.keys(extraXp).some((key) => !["level", "nextCost"].includes(key))
    || !Number.isInteger(extraXp.level) || (extraXp.level as number) < 0 || (extraXp.level as number) > 5
    || extraXp.nextCost !== ((extraXp.level as number) >= 5 ? null : (extraXp.level as number) + 1)
    || !isRecord(luck) || Object.keys(luck).length !== 2
    || Object.keys(luck).some((key) => !["level", "nextCost"].includes(key))
    || !Number.isInteger(luck.level) || (luck.level as number) < 0 || (luck.level as number) > 5
    || luck.nextCost !== ((luck.level as number) >= 5 ? null : (luck.level as number) + 1)
    || !isRecord(extraLife) || Object.keys(extraLife).length !== 2
    || Object.keys(extraLife).some((key) => !["charges", "nextCost"].includes(key))
    || !Number.isInteger(extraLife.charges) || (extraLife.charges as number) < 0 || (extraLife.charges as number) > 2
    || extraLife.nextCost !== ((extraLife.charges as number) === 0 ? 5 : (extraLife.charges as number) === 1 ? 8 : null)) return null;

  if (state.status === "ready" && ((player.progression.xp as number) !== 0
    || (player.progression.level as number) !== 1 || (player.progression.perkPoints as number) !== 0
    || (extraXp.level as number) !== 0 || (luck.level as number) !== 0 || (extraLife.charges as number) !== 0
    || state.luckyPickup !== null || state.bonus !== null)) return null;

  const snake = player.snake as Point[];
  const occupied = new Set<string>();
  const rivalSnake = rival?.alive ? rival.snake : [];
  for (const point of [...state.obstacles as Point[], ...rivalSnake, ...(state.food ? [state.food as Point] : []), ...(state.luckyPickup ? [state.luckyPickup as Point] : []), ...(bonus ? [bonus.position] : [])]) {
    const key = `${point.x},${point.y}`;
    if (occupied.has(key) || snake.some((segment) => segment.x === point.x && segment.y === point.y)) return null;
    occupied.add(key);
  }
  if (new Set((state.obstacles as Point[]).map((point) => `${point.x},${point.y}`)).size !== state.obstacles.length
    || (state.food && snake.some((point) => point.x === (state.food as Point).x && point.y === (state.food as Point).y))
    || (state.luckyPickup && (snake.some((point) => point.x === (state.luckyPickup as Point).x && point.y === (state.luckyPickup as Point).y)
      || (state.food !== null && state.food.x === state.luckyPickup.x && state.food.y === state.luckyPickup.y)))) return null;
  if (rival?.alive && rival.snake.some((point) => snake.some((segment) => point.x === segment.x && point.y === segment.y))) return null;

  if (value.configError !== null && typeof value.configError !== "string") return null;
  return {
    id: value.id,
    revision: value.revision as number,
    config: parsedConfig.config,
    configError: value.configError as string | null,
    players: [{
      id: player.id,
      snake: player.snake as Point[],
      direction: player.direction,
      queuedDirection: player.queuedDirection,
      score: player.score,
      progression: {
        xp: player.progression.xp as number,
        level: player.progression.level as number,
        perkPoints: player.progression.perkPoints as number,
      },
      perks: {
        extraXp: { level: extraXp.level as number, nextCost: extraXp.nextCost as number | null },
        luck: { level: luck.level as number, nextCost: luck.nextCost as number | null },
        extraLife: { charges: extraLife.charges as number, nextCost: extraLife.nextCost as 5 | 8 | null },
      },
    }],
    state: { food: state.food as Point | null, luckyPickup: state.luckyPickup as Point | null, bonus, obstacles: state.obstacles as Point[], rival, status: state.status as GameStatus },
  };
}
