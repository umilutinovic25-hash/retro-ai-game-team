import type { GameConfig } from "./snakeConfig.ts";

export type Point = { x: number; y: number };
export type Direction = "up" | "right" | "down" | "left";
export type GameStatus = "ready" | "playing" | "paused" | "game_over" | "won";
export type BonusKind = "gold" | "gem";
export type Bonus = { position: Point; kind: BonusKind; points: number; ticksLeft: number; lifetime: number };
export type RivalState = { snake: Point[]; direction: Direction; score: number; alive: boolean };

export type GameState = {
  snake: Point[];
  direction: Direction;
  queuedDirection: Direction;
  food: Point | null;
  score: number;
  xp: number;
  level: number;
  perkPoints: number;
  extraXpLevel: number;
  luckLevel: number;
  extraLives: number;
  luckyPickup: Point | null;
  bonus: Bonus | null;
  obstacles: Point[];
  rival: RivalState | null;
  foodEaten: number;
  bonusesCollected: number;
  collisions: number;
  status: GameStatus;
};

export type PerkType = "extra_xp" | "extra_life" | "luck";
export type PerkPurchaseResult =
  | { ok: true; state: GameState }
  | { ok: false; error: "invalid_status" | "insufficient_perk_points" | "perk_at_cap" };

const vectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export const BONUS_POINTS: Record<BonusKind, number> = { gold: 3, gem: 5 };
const GEM_SHARE = 0.3;
const OBSTACLE_HEAD_SAFE_RADIUS = 2;

function pointKey(point: Point): string { return `${point.x},${point.y}`; }

function randomFreeCell(blocked: Point[], config: GameConfig, random: () => number, allowed: (point: Point) => boolean = () => true): Point | null {
  const occupied = new Set(blocked.map(pointKey));
  const free: Point[] = [];
  for (let y = 0; y < config.gridSize; y += 1) {
    for (let x = 0; x < config.gridSize; x += 1) {
      const point = { x, y };
      if (!occupied.has(pointKey(point)) && allowed(point)) free.push(point);
    }
  }
  return free.length === 0 ? null : free[Math.min(free.length - 1, Math.floor(random() * free.length))];
}

function keepsBoardConnected(obstacles: Point[], start: Point, config: GameConfig): boolean {
  const blocked = new Set(obstacles.map(pointKey));
  const seen = new Set([pointKey(start)]);
  const queue = [start];
  while (queue.length) {
    const current = queue.pop()!;
    for (const vector of Object.values(vectors)) {
      const next = { x: current.x + vector.x, y: current.y + vector.y };
      const key = pointKey(next);
      if (next.x < 0 || next.y < 0 || next.x >= config.gridSize || next.y >= config.gridSize || blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen.size === config.gridSize * config.gridSize - blocked.size;
}

function placeObstacle(blocked: Point[], obstacles: Point[], head: Point, direction: Direction, config: GameConfig, random: () => number): Point | null {
  const vector = vectors[direction];
  const safe = (point: Point) => {
    if (Math.max(Math.abs(point.x - head.x), Math.abs(point.y - head.y)) <= OBSTACLE_HEAD_SAFE_RADIUS) return false;
    const dx = point.x - head.x;
    const dy = point.y - head.y;
    return !(vector.x === 0 ? dx === 0 && Math.sign(dy) === vector.y : dy === 0 && Math.sign(dx) === vector.x);
  };
  const candidates: Point[] = [];
  const occupied = new Set(blocked.map(pointKey));
  for (let y = 0; y < config.gridSize; y += 1) {
    for (let x = 0; x < config.gridSize; x += 1) {
      const point = { x, y };
      if (!occupied.has(pointKey(point)) && safe(point)) candidates.push(point);
    }
  }
  while (candidates.length) {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    const [candidate] = candidates.splice(index, 1);
    if (keepsBoardConnected([...obstacles, candidate], head, config)) return candidate;
  }
  return null;
}

function occupiedCells(snake: Point[], obstacles: Point[], ...items: Array<Point | null | undefined>): Point[] {
  return [...snake, ...obstacles, ...items.filter((item): item is Point => item !== null && item !== undefined)];
}

function createRival(config: GameConfig, human: Point[], obstacles: Point[]): RivalState | null {
  if (config.mode !== "vs_ai") return null;
  const occupied = [...human, ...obstacles];
  const candidates: Array<{ snake: Point[]; direction: Direction; distance: number }> = [];
  for (let y = 1; y < config.gridSize - 1; y += 1) {
    for (let x = 1; x < config.gridSize - 1; x += 1) {
      for (const direction of ["up", "right", "down", "left"] as const) {
        const vector = vectors[direction];
        const snake = Array.from({ length: config.startingSnakeLength }, (_, index) => ({ x: x - vector.x * index, y: y - vector.y * index }));
        if (snake.some((point) => point.x < 0 || point.y < 0 || point.x >= config.gridSize || point.y >= config.gridSize
          || occupied.some((cell) => samePoint(cell, point)))) continue;
        const distance = Math.min(...human.map((point) => Math.abs(point.x - x) + Math.abs(point.y - y)));
        candidates.push({ snake, direction, distance });
      }
    }
  }
  candidates.sort((a, b) => b.distance - a.distance);
  const selected = candidates[0];
  return selected ? { snake: selected.snake, direction: selected.direction, score: 0, alive: true } : null;
}

function inside(point: Point, gridSize: number): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < gridSize && point.y < gridSize;
}

function rivalDirection(rival: RivalState, state: GameState, config: GameConfig): Direction | null {
  const head = rival.snake[0];
  const targets = [state.food, state.bonus?.position].filter((point): point is Point => point !== null && point !== undefined);
  const order: Direction[] = [rival.direction, "up", "right", "down", "left"];
  const directions = [...new Set(order)].filter((direction) => !isOpposite(direction, rival.direction));
  const ownBody = rival.snake.slice(1, -1);
  const blocked = [...state.obstacles, ...state.snake, ...ownBody, ...(state.luckyPickup ? [state.luckyPickup] : [])];
  const candidates = directions.flatMap((direction) => {
    const vector = vectors[direction];
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    return inside(next, config.gridSize) && !blocked.some((point) => samePoint(point, next))
      ? [{ direction, next }] : [];
  });
  if (candidates.length === 0) return null;

  const distanceToTarget = (start: Point): number => {
    if (targets.length === 0) return Number.POSITIVE_INFINITY;
    const queue: Array<{ point: Point; distance: number }> = [{ point: start, distance: 0 }];
    const seen = new Set([pointKey(start)]);
    while (queue.length) {
      const current = queue.shift()!;
      if (targets.some((target) => samePoint(target, current.point))) return current.distance;
      for (const direction of ["up", "right", "down", "left"] as const) {
        const vector = vectors[direction];
        const next = { x: current.point.x + vector.x, y: current.point.y + vector.y };
        const key = pointKey(next);
        if (!inside(next, config.gridSize) || seen.has(key) || blocked.some((point) => samePoint(point, next))) continue;
        seen.add(key);
        queue.push({ point: next, distance: current.distance + 1 });
      }
    }
    return Number.POSITIVE_INFINITY;
  };
  const areaFrom = (start: Point): number => {
    const queue = [start];
    const seen = new Set([pointKey(start)]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const direction of ["up", "right", "down", "left"] as const) {
        const vector = vectors[direction];
        const next = { x: current.x + vector.x, y: current.y + vector.y };
        const key = pointKey(next);
        if (!inside(next, config.gridSize) || seen.has(key) || blocked.some((point) => samePoint(point, next))) continue;
        seen.add(key);
        queue.push(next);
      }
    }
    return seen.size;
  };
  candidates.sort((a, b) => {
    const distanceA = distanceToTarget(a.next);
    const distanceB = distanceToTarget(b.next);
    if (distanceA !== distanceB) return distanceA < distanceB ? -1 : 1;
    return areaFrom(b.next) - areaFrom(a.next);
  });
  return candidates[0].direction;
}

function advanceRival(state: GameState, config: GameConfig): GameState {
  const rival = state.rival;
  if (!rival?.alive) return state;
  const direction = rivalDirection(rival, state, config);
  if (!direction) return { ...state, rival: { ...rival, snake: [], alive: false } };
  const vector = vectors[direction];
  const nextHead = { x: rival.snake[0].x + vector.x, y: rival.snake[0].y + vector.y };
  const eatsFood = state.food !== null && samePoint(nextHead, state.food);
  const eatsBonus = state.bonus !== null && samePoint(nextHead, state.bonus.position);
  const grows = eatsFood || eatsBonus;
  const body = grows ? rival.snake : rival.snake.slice(0, -1);
  if (!inside(nextHead, config.gridSize)
    || state.obstacles.some((point) => samePoint(point, nextHead))
    || state.snake.some((point) => samePoint(point, nextHead))
    || body.some((point) => samePoint(point, nextHead))) {
    return { ...state, rival: { ...rival, snake: [], alive: false } };
  }
  const snake = [nextHead, ...rival.snake];
  if (!grows) snake.pop();
  const score = rival.score + (eatsFood ? config.scorePerFood : 0) + (eatsBonus && state.bonus ? state.bonus.points : 0);
  const bonus = eatsBonus ? null : state.bonus;
  const food = eatsFood
    ? spawnFood([...state.snake, ...snake, ...state.obstacles, ...(state.luckyPickup ? [state.luckyPickup] : []), ...(bonus ? [bonus.position] : [])], config)
    : state.food;
  return {
    ...state,
    rival: { snake, direction, score, alive: true },
    food,
    bonus,
    status: food === null ? "won" : state.status,
  };
}

export function isOpposite(first: Direction, second: Direction): boolean {
  return (first === "up" && second === "down")
    || (first === "down" && second === "up")
    || (first === "left" && second === "right")
    || (first === "right" && second === "left");
}

function samePoint(first: Point, second: Point): boolean {
  return first.x === second.x && first.y === second.y;
}

export function getLevelForXp(xp: number): number {
  let level = 1;
  while (25 * level * (level + 1) <= xp) level += 1;
  return level;
}

export function awardXp(state: GameState, amount: number): GameState {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(state.xp + amount)) return state;
  const xp = state.xp + amount;
  const level = getLevelForXp(xp);
  return { ...state, xp, level, perkPoints: state.perkPoints + level - state.level };
}

export function purchasePerk(state: GameState, perk: PerkType): PerkPurchaseResult {
  if (state.status !== "paused") return { ok: false, error: "invalid_status" };
  const atCap = perk === "extra_xp" ? state.extraXpLevel >= 5 : perk === "luck" ? state.luckLevel >= 5 : state.extraLives >= 2;
  if (atCap) return { ok: false, error: "perk_at_cap" };
  const cost = perk === "extra_xp" ? state.extraXpLevel + 1 : perk === "luck" ? state.luckLevel + 1 : state.extraLives === 0 ? 5 : 8;
  if (state.perkPoints < cost) return { ok: false, error: "insufficient_perk_points" };
  return {
    ok: true,
    state: perk === "extra_xp"
      ? { ...state, extraXpLevel: state.extraXpLevel + 1, perkPoints: state.perkPoints - cost }
      : perk === "luck"
        ? { ...state, luckLevel: state.luckLevel + 1, perkPoints: state.perkPoints - cost }
        : { ...state, extraLives: state.extraLives + 1, perkPoints: state.perkPoints - cost },
  };
}

export function getLuckySpawnChance(luckLevel: number): number {
  return Math.round((0.05 + Math.max(0, Math.min(5, Math.floor(luckLevel))) * 0.05) * 100) / 100;
}

export function spawnFood(snake: Point[], config: GameConfig, random: () => number = Math.random, additionallyOccupied: Array<Point | null> = []): Point | null {
  return randomFreeCell([...snake, ...additionallyOccupied.filter((point): point is Point => point !== null)], config, random);
}

export function createInitialState(config: GameConfig, random: () => number = Math.random): GameState {
  const center = Math.floor(config.gridSize / 2);
  const snake = Array.from({ length: config.startingSnakeLength }, (_, index) => ({ x: center - index, y: center }));
  const obstacles: Point[] = [];
  for (let i = 0; i < config.obstacleStartCount; i += 1) {
    const obstacle = placeObstacle([...snake, ...obstacles], obstacles, snake[0], "right", config, random);
    if (obstacle) obstacles.push(obstacle);
  }
  const rival = createRival(config, snake, obstacles);
  return {
    snake,
    direction: "right",
    queuedDirection: "right",
    food: spawnFood([...snake, ...(rival?.snake ?? []), ...obstacles], config, random),
    score: 0,
    xp: 0,
    level: 1,
    perkPoints: 0,
    extraXpLevel: 0,
    luckLevel: 0,
    extraLives: 0,
    luckyPickup: null,
    bonus: null,
    obstacles,
    rival,
    foodEaten: 0,
    bonusesCollected: 0,
    collisions: 0,
    status: "ready",
  };
}

export function startGame(state: GameState): GameState {
  return state.status === "ready" ? { ...state, status: "playing" } : state;
}

export function pauseGame(state: GameState): GameState {
  return state.status === "playing" ? { ...state, status: "paused" } : state;
}

export function resumeGame(state: GameState): GameState {
  return state.status === "paused" ? { ...state, status: "playing" } : state;
}

export function setDirection(state: GameState, direction: Direction): GameState {
  if (isOpposite(direction, state.direction) || isOpposite(direction, state.queuedDirection)) return state;
  return { ...state, queuedDirection: direction };
}

export function step(state: GameState, config: GameConfig, random: () => number = Math.random): GameState {
  if (state.status !== "playing") return state;

  const direction = state.queuedDirection;
  const vector = vectors[direction];
  const head = state.snake[0];
  const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
  const hitsWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= config.gridSize || nextHead.y >= config.gridSize;
  if (hitsWall || state.obstacles.some((obstacle) => samePoint(obstacle, nextHead))
    || (state.rival?.alive && state.rival.snake.some((segment) => samePoint(segment, nextHead)))) return collide(state, config, direction, random);

  const eatsFood = state.food !== null && samePoint(nextHead, state.food);
  const eatsBonus = state.bonus !== null && samePoint(nextHead, state.bonus.position);
  const grows = eatsFood || eatsBonus;
  const bodyToCheck = grows ? state.snake : state.snake.slice(0, -1);
  if (bodyToCheck.some((segment) => samePoint(segment, nextHead))) {
    return collide(state, config, direction, random);
  }

  const nextSnake = [nextHead, ...state.snake];
  if (!grows) nextSnake.pop();
  const bonusPoints = eatsBonus && state.bonus ? state.bonus.points : 0;
  const nextScore = state.score + (eatsFood ? config.scorePerFood : 0) + bonusPoints;
  const eatsLucky = state.luckyPickup !== null && samePoint(nextHead, state.luckyPickup);
  const obstacles = [...state.obstacles];
  const crossedMilestone = Math.floor(nextScore / config.obstacleEvery) > Math.floor(state.score / config.obstacleEvery);
  if (crossedMilestone && obstacles.length < config.maxObstacles) {
    const blocked = [...occupiedCells(nextSnake, obstacles, eatsFood ? null : state.food, state.bonus?.position, state.luckyPickup), ...(state.rival?.alive ? state.rival.snake : [])];
    const obstacle = placeObstacle(blocked, obstacles, nextHead, direction, config, random);
    if (obstacle) obstacles.push(obstacle);
  }
  const bonus = state.bonus && !eatsBonus && state.bonus.ticksLeft > 1
    ? { ...state.bonus, ticksLeft: state.bonus.ticksLeft - 1 }
    : null;
  const nextFood = eatsFood
    ? spawnFood([...occupiedCells(nextSnake, obstacles, bonus?.position, state.luckyPickup), ...(state.rival?.alive ? state.rival.snake : [])], config, random)
    : state.food;
  const progression = eatsFood ? awardXp(state, 10 + 2 * state.extraXpLevel) : state;
  let luckyPickup = eatsLucky ? null : state.luckyPickup;
  let perkPoints = progression.perkPoints + (eatsLucky ? 1 : 0);
  if (eatsFood && luckyPickup === null && nextFood !== null && random() < getLuckySpawnChance(state.luckLevel)) {
    luckyPickup = randomFreeCell([...occupiedCells(nextSnake, obstacles, nextFood, bonus?.position), ...(state.rival?.alive ? state.rival.snake : [])], config, random);
  }
  let nextBonus = bonus;
  if (eatsFood && !nextBonus && nextFood && config.bonusChance > 0 && random() < config.bonusChance) {
    const kind: BonusKind = random() < GEM_SHARE ? "gem" : "gold";
    const position = randomFreeCell([...occupiedCells(nextSnake, obstacles, nextFood, luckyPickup), ...(state.rival?.alive ? state.rival.snake : [])], config, random);
    if (position) nextBonus = { position, kind, points: BONUS_POINTS[kind], ticksLeft: config.bonusLifetimeTicks, lifetime: config.bonusLifetimeTicks };
  }
  const next: GameState = {
    ...state,
    ...progression,
    snake: nextSnake,
    direction,
    food: nextFood,
    luckyPickup,
    bonus: nextBonus,
    obstacles,
    foodEaten: state.foodEaten + (eatsFood ? 1 : 0),
    bonusesCollected: state.bonusesCollected + (eatsBonus ? 1 : 0),
    perkPoints,
    score: nextScore,
    status: nextFood === null ? "won" : "playing",
  };
  return next.status === "playing" ? advanceRival(next, config) : next;
}

function collide(state: GameState, config: GameConfig, direction: Direction, random: () => number): GameState {
  if (state.extraLives <= 0) return { ...state, direction, collisions: state.collisions + 1, status: "game_over" };
  const center = Math.floor(config.gridSize / 2);
  const snake = Array.from({ length: config.startingSnakeLength }, (_, index) => ({ x: center - index, y: center }));
  const obstacles = state.obstacles.filter((obstacle) => !snake.some((segment) => samePoint(segment, obstacle)));
  const rival = state.rival?.alive && state.rival.snake.some((point) => snake.some((segment) => samePoint(segment, point)))
    ? { ...state.rival, snake: [], alive: false } : state.rival;
  const rivalSnake = rival?.alive ? rival.snake : [];
  const luckyPickup = state.luckyPickup && !snake.some((segment) => samePoint(segment, state.luckyPickup!)) && !obstacles.some((obstacle) => samePoint(obstacle, state.luckyPickup!)) && !rivalSnake.some((segment) => samePoint(segment, state.luckyPickup!)) ? state.luckyPickup : null;
  const bonus = state.bonus && !snake.some((segment) => samePoint(segment, state.bonus!.position)) && !obstacles.some((obstacle) => samePoint(obstacle, state.bonus!.position)) && !rivalSnake.some((segment) => samePoint(segment, state.bonus!.position)) ? state.bonus : null;
  const food = state.food && !snake.some((segment) => samePoint(segment, state.food!)) && !obstacles.some((obstacle) => samePoint(obstacle, state.food!)) && !rivalSnake.some((segment) => samePoint(segment, state.food!)) && !(luckyPickup && samePoint(luckyPickup, state.food)) && !(bonus && samePoint(bonus.position, state.food))
    ? state.food
    : spawnFood([...occupiedCells(snake, obstacles, luckyPickup, bonus?.position), ...rivalSnake], config, random);
  const nextLuckyPickup = state.luckyPickup && luckyPickup === null && food !== null
    ? randomFreeCell([...occupiedCells(snake, obstacles, food, bonus?.position), ...rivalSnake], config, random) : luckyPickup;
  return {
    ...state,
    snake,
    direction: "right",
    queuedDirection: "right",
    food,
    luckyPickup: nextLuckyPickup,
    bonus,
    obstacles,
    rival,
    collisions: state.collisions + 1,
    extraLives: state.extraLives - 1,
    status: food === null ? "won" : "playing",
  };
}
