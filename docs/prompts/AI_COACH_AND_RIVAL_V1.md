# Build prompt — AI Coach and VS AI rival v1

Implement [Feature 005](../specs/005-ai-coach-and-rival.md) in the existing RETRO SNAKE TypeScript/Vite client and authoritative Node server.

## Context priority

1. Current user's request to add both the AI coach and AI rival.
2. Project `AGENTS.md`, `docs/INSTRUCTIONS.md`, and instructions 01–05.
3. Feature 005, the base game specification, current engine/protocol/session/API/renderer, and Evidence 015–017.
4. Existing implementation conventions and runtime behavior.

The earlier single-player/no-new-mode boundary is superseded only for this requested server-owned bot mode; do not add human multiplayer.

## Required result

- Add a selectable Classic / VS AI mode, with Classic as default.
- Keep bot state, movement, scoring, and collisions server-authoritative. Preserve exactly one human entry in `players`; represent the bot as a separately validated rival snapshot entity.
- Implement safe food-seeking movement without reverse turns; render rival distinctly and show score/winner.
- Add a user-triggered post-run Gemini coach endpoint. Send only bounded numeric run facts, validate exact bounded output, preserve the server-only credential boundary, and fail safely when the key/provider is unavailable.
- Keep the current uncommitted obstacle/bonus work intact. Do not commit, push, expose credentials, or add dependencies/assets.
- Update the feature spec, evidence, AI usage log, and work log. Keep checks honest and report any unavailable live-provider verification.

## Verification

Use the project-required typecheck/build and manual browser inspection. Do not use live Gemini unless the user explicitly provides/authorizes a hidden runtime key for this call. Record any checks not run and the remaining limits.
