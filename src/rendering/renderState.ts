export type Point = { x: number; y: number };
export type Direction = "up" | "right" | "down" | "left";
export type GameStatus = "ready" | "playing" | "paused" | "game_over" | "won";
export type BonusKind = "gold" | "gem";
export type EatenKind = "food" | "lucky" | BonusKind;
export type PowerUpKind = "slow" | "ghost";

export type RenderBonus = { position: Point; kind: BonusKind; points: number; ticksLeft: number; lifetime: number };
export type RenderPowerUp = { position: Point; kind: PowerUpKind; ticksLeft: number; lifetime: number };

/** What the Canvas renderer draws. Phase 2 entities are neutral until the engine and server provide them. */
export type RenderState = {
  snake: Point[];
  direction: Direction;
  food: Point | null;
  lucky: Point | null;
  bonus: RenderBonus | null;
  obstacles: Point[];
  score: number;
  status: GameStatus;
  combo: number;
  lastEaten: { kind: EatenKind; points: number; combo: number; at: Point } | null;
  powerUp: RenderPowerUp | null;
  effects: Record<PowerUpKind, number>;
  lastPowerUp: { kind: PowerUpKind; at: Point } | null;
};

export type RendererConfig = { gridSize: number; maxComboMultiplier: number };
