# Project Architecture and Game Rules

Read this module for changes to game behavior, state transitions, rendering, or configuration. The base game's authoritative numerical and acceptance requirements are in [`../specs/BASE_GAME_SPEC.md`](../specs/BASE_GAME_SPEC.md), supplemented by any accepted feature specification.

## Product boundary

- RETRO SNAKE is an original, minimal browser game on a 20 × 20 board. It has a three-segment starting snake, arrow-key/touch controls, food, score, collision handling, pause/resume, restart, and win handling.
- Preserve TypeScript + Vite for the browser and the TypeScript Node backend described in [`../specs/REFACTOR_PLAN.md`](../specs/REFACTOR_PLAN.md). The backend may host multiple independent in-memory game containers; each has one human player. The accepted [Feature 005](../specs/005-ai-coach-and-rival.md) adds an optional server-owned bot rival mode. Do not add human room/join flows, accounts, multiplayer participation, online leaderboard, deployment, or third-party visual/audio assets.
- The shop AI advisor is a narrow, read-only server flow described by the [shop contract](../specs/TOOL_CONTRACT.md) and [feature 002](../../specs/002-shop-advisor/spec.md). It does not change game rules or authoritative state.

## State and rendering boundaries

- Keep state transitions and game rules in pure TypeScript where practical.
- The server owns authoritative game state and tick scheduling. UI controls send intended actions; the browser renders validated snapshots and never advances or mutates game state.
- Keep randomness explicit/injectable in the game logic when needed for deterministic tests.
- Keep the Canvas renderer and DOM/CSS responsible for the board, controls, status, and responsive presentation; they only read server snapshots. Do not move game rules into event handlers or rendering code.
- Preserve the existing module layout unless a scoped change requires otherwise. Avoid broad refactors made only to demonstrate a pattern.

## Runtime configuration

- `GameConfig` is runtime input. Validate its actual values; TypeScript types alone are not runtime validation.
- Reject invalid or unsupported values with the specified explicit safe fallback and a clear error. Never silently proceed with unknown values.
- Keep defaults and base-game constraints synchronized with `specs/BASE_GAME_SPEC.md` and the tests.

## Change checklist

- Identify the relevant game rule and acceptance condition before changing behavior.
- Preserve unrelated game behavior and the read-only shop AI boundary.
- Update the owning task evidence with focused tests/evals when accepted behavior changes.
- Update the spec only when the user-approved requirement changes; do not rewrite the spec to fit an accidental implementation.
