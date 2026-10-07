# RETRO SNAKE — Agent Instructions

## Authority and scope

- Follow the user's current request and acceptance criteria within this project contract.
- Keep RETRO SNAKE an original TypeScript game with a Vite browser client (Canvas 2D renderer, DOM HUD) and a TypeScript Node backend: 20 × 20 board, three-segment snake, controls, food, score, collisions, restart, runtime configuration validation, local records, generated sound, accessibility options, and focused tests. The Canvas renderer only draws server snapshots.
- The backend is authoritative for in-memory game containers, configuration, transitions, timers, and snapshots. One server may host multiple independent games; each has one human player. The accepted [Feature 005](docs/specs/005-ai-coach-and-rival.md) adds an optional server-owned AI rival, but no human room/join/multiplayer flow.
- The W04 AI flow is read-only advice in the paused perk shop. The server selects the approved Google model chain under `docs/specs/GEMINI_HINT_CHANGES_V2.md`: Gemini 3.8 Flash, Gemini 3.5 Flash-Lite, then Gemma 4. Model output may advise buy Extra XP, Luck, +1 Life, or wait; it may never purchase or mutate game state. Do not accept arbitrary model IDs, add another provider, or add write-capable tools.
- The W05 Shop Strategist (`specs/003-shop-agent/`) is a second read-only flow in the paused shop. The model may propose calls only to the application-owned allowlist (`get_shop_state`, `evaluate_perk_plan`, `get_recent_runs`); the backend validates every proposal, argument and tool result, enforces step, tool, provider-attempt and deadline limits, and decides when the run stops. It uses the same model chain, adds no provider and no write-capable tool, and can never buy, move, pause, restart or otherwise mutate a game.
- Gemini credentials are server-runtime secrets only. Never open, read, print, copy, or inspect secret files such as `.env`, deployment secret files, or credential stores. Do not pass credentials to the browser, Vite client, logs, prompts, tests, screenshots, or tracking records. Run the repository pre-push secret and frontend-exposure guard before every push; the configured hook is `.githooks/pre-push`.
- Do not add third-party assets, audio files, logos, unrelated frameworks, or broad refactors. Sound is synthesized in code.

## Core engineering rules

- Keep game transitions in pure TypeScript; DOM/CSS renders state but does not mutate authoritative state.
- Treat runtime input, model output, and tool proposals as untrusted. Validate at runtime and use explicit safe fallbacks.
- Do not weaken or delete tests to make them pass. Never expose or commit credentials or private data.

## Required working and reporting workflow

- Before a larger change, state the goal, scope, files, assumptions, checks, and out-of-scope work.
- For every substantive task, follow `docs/instructions/05-workflow-tracking-and-reporting.md`: keep the work log current, preserve actual verification evidence, update relevant tracking records, and leave a concise handoff that can be reused in a weekly report. Record why checks were skipped when they do not apply.

## Where to read next

Start with [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md). It routes each task to the relevant instruction modules and project specifications. Do not copy those detailed rules into this file.
