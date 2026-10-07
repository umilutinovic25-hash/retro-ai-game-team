# Feature 005 — AI Coach and VS AI rival

## Goal

Add two optional AI experiences to RETRO SNAKE: an authoritative AI-controlled rival in a new **VS AI** mode, and an on-demand Gemini coach after a run ends.

## Requirements

1. **Classic remains the default.** Players may choose Classic or VS AI before starting/restarting a run. The selected mode is sent in the validated server configuration and is visible in the UI.
2. **Server-owned rival.** In VS AI mode, the authoritative server creates and advances one bot snake on each game tick. The browser only draws snapshots. The bot seeks shared food and score bonuses, avoids the human snake, itself, walls, and obstacles, and stops when it collides. It earns score but no XP or perk points. Its score is shown during play; after the human run ends, the overlay reports the higher score (or a tie).
3. **No human multiplayer.** The bot is an optional server-owned game entity, not a second player identity, account, room, or network participant. Classic mode rules stay unchanged.
4. **On-demand coach.** After a run reaches `game_over` or `won`, the user can request one short coaching response. No provider call is made automatically. The server constructs a bounded context from numeric run stats, difficulty/mode, and final score only; it sends no name, local records, credentials, or arbitrary browser text.
5. **Safe provider boundary.** Reuse only the configured Google Gemini model chain and server-runtime key. Validate a small exact JSON result with bounded plain-text fields; render it with `textContent`. The coach cannot mutate game state or invoke tools. Missing key, timeout, provider failure, or invalid output produces a clear unavailable message while leaving the game playable.
6. **Quality and accessibility.** The mode selector and coach controls use the existing design system, semantic labels, visible focus, and responsive layout. Rival rendering remains compatible with colorblind mode and reduced motion.

## Acceptance

- Classic snapshot contains no rival and classic game rules remain unchanged.
- VS AI snapshot contains a safe rival; each authoritative tick moves it toward food/bonuses without reversing into itself or entering blocked cells; rival score and death state survive validation and are rendered.
- Human and rival can collect shared food/bonuses without overlapping or corrupting the snapshot; rival collision does not terminate the human run.
- Restart applies the selected mode and clears run/coach state.
- Coach endpoint rejects unfinished games and request fields, makes no provider call when not configured, validates model output, and does not change snapshot revision/state.
- Browser shows mode selection, rival score/snake, final winner, and an on-demand coach result or safe unavailable state.

## Out of scope

Human multiplayer, rooms/accounts, rival purchases or power-ups, Gemini-controlled movement, arbitrary AI tools, live coaching during a run, new assets, and publishing.
