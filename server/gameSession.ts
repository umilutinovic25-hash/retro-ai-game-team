import { randomUUID } from "node:crypto";
import { DEFAULT_CONFIG, getTickMs, parseGameConfig, type GameConfig } from "../src/game/snakeConfig.ts";
import type { GameSnapshot } from "../src/game/gameProtocol.ts";
import {
  createInitialState,
  pauseGame,
  purchasePerk as applyPerkPurchase,
  resumeGame,
  setDirection,
  startGame,
  step,
  type Direction,
  type GameState,
} from "../src/game/snakeEngine.ts";

export type { GameSnapshot, PlayerState } from "../src/game/gameProtocol.ts";

type Session = {
  id: string;
  revision: number;
  config: GameConfig;
  configError: string | null;
  playerId: string;
  gameState: GameState;
  timer?: NodeJS.Timeout;
  listeners: Set<(snapshot: GameSnapshot) => void>;
  history: RunHistoryEntry[];
  runRecorded: boolean;
  runNumber: number;
};

export type SessionErrorCode = "game_not_found" | "invalid_status" | "insufficient_perk_points" | "perk_at_cap";

export class SessionError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode, message: string) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

export type RunHistoryEntry = {
  score: number;
  level: number;
  perksAtEnd: { extraXp: number; luck: number; extraLife: number };
  endedBy: "game_over" | "won" | "restart";
};

export type GameCoachContext = {
  runNumber: number;
  mode: "classic" | "vs_ai";
  difficulty: "easy" | "normal" | "hard";
  score: number;
  level: number;
  snakeLength: number;
  foodEaten: number;
  bonusesCollected: number;
  collisions: number;
  rivalScore: number | null;
  rivalAliveAtEnd: boolean | null;
  endedBy: "game_over" | "won";
};

function cloneSnapshot(snapshot: GameSnapshot): GameSnapshot {
  return structuredClone(snapshot);
}

export class GameSessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly random: () => number;
  private readonly makeId: () => string;

  constructor(random: () => number = Math.random, makeId: () => string = randomUUID) {
    this.random = random;
    this.makeId = makeId;
  }

  create(configInput: unknown = DEFAULT_CONFIG): GameSnapshot {
    const result = parseGameConfig(configInput);
    const session: Session = {
      id: this.makeId(),
      revision: 0,
      config: result.config,
      configError: result.error ?? null,
      playerId: this.makeId(),
      gameState: createInitialState(result.config, this.random),
      listeners: new Set(),
      history: [],
      runRecorded: false,
      runNumber: 0,
    };
    this.sessions.set(session.id, session);
    return this.toSnapshot(session);
  }

  get(id: string): GameSnapshot {
    return this.toSnapshot(this.requireSession(id));
  }

  /** Last finished games of this container, newest first (in memory, at most five). */
  getRunHistory(id: string): RunHistoryEntry[] {
    return structuredClone(this.requireSession(id).history);
  }

  getCoachContext(id: string): GameCoachContext {
    const session = this.requireSession(id);
    const state = session.gameState;
    if (state.status !== "game_over" && state.status !== "won") {
      throw new SessionError("invalid_status", "The AI coach is available only after a run ends.");
    }
    return {
      runNumber: session.runNumber,
      mode: session.config.mode,
      difficulty: session.config.startingSpeedMs >= 200 ? "easy" : session.config.startingSpeedMs <= 125 ? "hard" : "normal",
      score: state.score,
      level: state.level,
      snakeLength: state.snake.length,
      foodEaten: state.foodEaten,
      bonusesCollected: state.bonusesCollected,
      collisions: state.collisions,
      rivalScore: state.rival ? state.rival.score : null,
      rivalAliveAtEnd: state.rival ? state.rival.alive : null,
      endedBy: state.status,
    };
  }

  subscribe(id: string, listener: (snapshot: GameSnapshot) => void): () => void {
    const session = this.requireSession(id);
    session.listeners.add(listener);
    listener(this.toSnapshot(session));
    return () => session.listeners.delete(listener);
  }

  move(id: string, direction: Direction): GameSnapshot {
    const session = this.requireSession(id);
    const state = session.gameState;
    if (state.status !== "ready" && state.status !== "playing") {
      throw new SessionError("invalid_status", "Moves are accepted only while the game is ready or playing.");
    }
    if (direction === state.queuedDirection) return this.toSnapshot(session);
    const directed = setDirection(state, direction);
    const next = state.status === "ready" && directed !== state ? startGame(directed) : directed;
    if (next !== state) {
      session.gameState = next;
      this.publish(session);
      this.schedule(session);
    }
    return this.toSnapshot(session);
  }

  pause(id: string): GameSnapshot {
    const session = this.requireSession(id);
    if (session.gameState.status !== "playing") {
      throw new SessionError("invalid_status", "Only a playing game can be paused.");
    }
    this.clearTimer(session);
    session.gameState = pauseGame(session.gameState);
    this.publish(session);
    return this.toSnapshot(session);
  }

  resume(id: string): GameSnapshot {
    const session = this.requireSession(id);
    if (session.gameState.status !== "paused") {
      throw new SessionError("invalid_status", "Only a paused game can be resumed.");
    }
    session.gameState = resumeGame(session.gameState);
    this.publish(session);
    this.schedule(session);
    return this.toSnapshot(session);
  }

  restart(id: string): GameSnapshot {
    const session = this.requireSession(id);
    this.clearTimer(session);
    const { status } = session.gameState;
    if (status === "playing" || status === "paused") this.recordRun(session, "restart");
    session.runRecorded = false;
    session.runNumber += 1;
    session.gameState = createInitialState(session.config, this.random);
    this.publish(session);
    return this.toSnapshot(session);
  }

  purchasePerk(id: string, perk: "extra_xp" | "extra_life" | "luck"): GameSnapshot {
    const session = this.requireSession(id);
    const result = applyPerkPurchase(session.gameState, perk);
    if (!result.ok) {
      const message = result.error === "invalid_status" ? "Perks can only be purchased while the game is paused."
        : result.error === "perk_at_cap" ? "This perk is already at its maximum level."
          : "Not enough perk points for this purchase.";
      throw new SessionError(result.error, message);
    }
    session.gameState = result.state;
    this.publish(session);
    return this.toSnapshot(session);
  }

  /** Exposed for deterministic service tests; normal ticking is scheduled by the manager. */
  advance(id: string): GameSnapshot {
    const session = this.requireSession(id);
    this.clearTimer(session);
    session.gameState = step(session.gameState, session.config, this.random);
    this.publish(session);
    this.schedule(session);
    return this.toSnapshot(session);
  }

  close(): void {
    for (const session of this.sessions.values()) this.clearTimer(session);
    this.sessions.clear();
  }

  private requireSession(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new SessionError("game_not_found", "Game session was not found.");
    return session;
  }

  private toSnapshot(session: Session): GameSnapshot {
    const { snake, direction, queuedDirection, score, xp, level, perkPoints, extraXpLevel, luckLevel, extraLives, food, luckyPickup, status } = session.gameState;
    return cloneSnapshot({
      id: session.id,
      revision: session.revision,
      config: session.config,
      configError: session.configError,
      players: [{
        id: session.playerId,
        snake,
        direction,
        queuedDirection,
        score,
        progression: { xp, level, perkPoints },
        perks: {
          extraXp: { level: extraXpLevel, nextCost: extraXpLevel < 5 ? extraXpLevel + 1 : null },
          luck: { level: luckLevel, nextCost: luckLevel < 5 ? luckLevel + 1 : null },
          extraLife: { charges: extraLives, nextCost: extraLives === 0 ? 5 : extraLives === 1 ? 8 : null },
        },
      }],
      state: { food, luckyPickup, bonus: session.gameState.bonus, obstacles: session.gameState.obstacles, rival: session.gameState.rival, status },
    });
  }

  private publish(session: Session): void {
    session.revision += 1;
    const { status } = session.gameState;
    if (!session.runRecorded && (status === "game_over" || status === "won")) {
      this.recordRun(session, status);
      session.runRecorded = true;
    }
    const snapshot = this.toSnapshot(session);
    for (const listener of session.listeners) listener(snapshot);
  }

  private recordRun(session: Session, endedBy: RunHistoryEntry["endedBy"]): void {
    const { score, level, extraXpLevel, luckLevel, extraLives } = session.gameState;
    session.history.unshift({
      score,
      level,
      perksAtEnd: { extraXp: extraXpLevel, luck: luckLevel, extraLife: extraLives },
      endedBy,
    });
    session.history.length = Math.min(session.history.length, 5);
  }

  private clearTimer(session: Session): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = undefined;
  }

  private schedule(session: Session): void {
    this.clearTimer(session);
    if (session.gameState.status !== "playing") return;
    session.timer = setTimeout(() => {
      session.gameState = step(session.gameState, session.config, this.random);
      this.publish(session);
      this.schedule(session);
    }, getTickMs(session.config, session.gameState.score));
  }
}
