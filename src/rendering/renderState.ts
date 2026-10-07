export type Point = { x: number; y: number };
export type Direction = "up" | "right" | "down" | "left";
export type GameStatus = "ready" | "playing" | "paused" | "game_over" | "won";
export type BonusKind = "gold" | "gem";
export type EatenKind = "food" | "lucky" | BonusKind;
export type PowerUpKind = "slow" | "ghost";

export type RenderBonus = { position: Point; kind: BonusKind; points: number; ticksLeft: number; lifetime: number };
export type RenderPowerUp = { position: Point; kind: PowerUpKind; ticksLeft: number; lifetime: number };
export type RenderRival = { snake: Point[]; direction: Direction; score: number; alive: boolean };

/** What the Canvas renderer draws. Power-up fields remain neutral until the engine and server support them. */
export type RenderState = {
  snake: Point[];
  direction: Direction;
  food: Point | null;
  lucky: Point | null;
  bonus: RenderBonus | null;
  obstacles: Point[];
  rival: RenderRival | null;
  score: number;
  status: GameStatus;
  combo: number;
  lastEaten: { kind: EatenKind; points: number; combo: number; at: Point } | null;
  powerUp: RenderPowerUp | null;
  effects: Record<PowerUpKind, number>;
  lastPowerUp: { kind: PowerUpKind; at: Point } | null;
};

export type RendererConfig = { gridSize: number; maxComboMultiplier: number };
