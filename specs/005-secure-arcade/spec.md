# 005 — Secure the Arcade (W08)

Scope: harden the existing **W05 Shop Strategist** flow (`POST /api/games/:id/shop-agent`, paused perk shop) and the browser/API boundaries that carry it. No new features, no new provider, no write-capable tool.

## Invariants

| ID | Rule | Enforced in | Proven by |
|---|---|---|---|
| I1 | A request that fails input/access checks never reaches the provider or a tool. | `server/httpServer.ts` (host, origin, size, content type, schema, game status, then admission) | T01, T02, T03, T13 |
| I2 | Browser and model cannot set identity, policy, provider/model or limits. | exact-key body schema; `AGENT_GOAL` literal; `SECURITY_LIMITS` and `DEFAULT_LIMITS` are server constants | T02, T15 |
| I3 | Only an allowlisted tool with valid args in the run's own game scope executes. | `server/agent/tools.ts` (`lookupTool`, `validateArgs`), tools take no game id | T07, T08, T09 |
| I4 | The read-only flow never changes canonical game state. | tools only read a snapshot; no mutation API is reachable from the agent | T00, T09 |
| I5 | Untrusted text never becomes executable browser content. | `textContent` everywhere; CSP `script-src 'self'` | T04, T05, S3, S4 |
| I6 | Calls, time, bytes and concurrency have server limits. | `DEFAULT_LIMITS` (per run), `SECURITY_LIMITS` + `server/security/admission.ts` (per process) | T11, T12, T13 |
| I7 | Server secrets stay in the server; logs hold codes and counters only. | key only in `x-goog-api-key` header; `server/security/securityLog.ts` closed field set | T10, T14, S7 |
| I8 | The normal W05 flow still works. | all W05 tests + `test:e2e` unchanged | T00, 175 W05 tests, S2 |

## Limits (server-owned, not client-configurable)

| Limit | Value | Where | Note |
|---|---|---|---|
| HTTP body | 16 KiB (bytes) | `SECURITY_LIMITS.maxBodyBytes` | checked on `Content-Length` first, then while streaming. Kept from W04 (goal body is ~35 bytes) |
| Goal text | fixed literal `plan_next_purchases` | `AGENT_GOAL` | no free-text goal exists |
| Tool result | 4 KiB | `DEFAULT_LIMITS.maxToolResultBytes` | stricter than the 8 KiB example; results are tiny |
| Model response | 16 KiB (adapter read cap), 2048 output tokens | `geminiTransport.readLimitedResponse`, `googleTransport` | |
| Model decisions per run | 5 (3 tools + 1 correction + final) | `maxAgentSteps` | W05 value kept |
| Provider attempts per run | 8 total, 2 per step, 2 fallbacks | `maxProviderAttempts` | W05 value kept; retries/fallbacks share it |
| Tool executions per run | 4 (evaluator 2) | `maxToolCalls` | |
| Provider call / total deadline | 10 s / 45 s | `perCallTimeoutMs`, `totalDeadlineMs` | |
| Concurrent runs | 2 per process, all provider-backed routes | `maxConcurrentRuns` | refusal: `503 server_busy` |
| Rate | 5 accepted / 60 s, global (no identity in the demo) | `maxRunsPerWindow`, `windowMs` | refusal: `429 rate_limited` + `Retry-After`. In-memory, one process |

## HTTP policy

| Condition | Status | Code | Provider reached? |
|---|---|---|---|
| Host not loopback (DNS rebinding) | 403 | `host_not_allowed` | no |
| Origin not allowed (prod build: same origin only; dev: any loopback origin) | 403 | `origin_not_allowed` | no |
| Body over 16 KiB | 413 | `payload_too_large` | no |
| Non-empty body without `application/json` | 415 | `unsupported_media_type` | no |
| Bad JSON / unknown field / wrong goal | 400 | `invalid_json` / `invalid_request` | no |
| Unknown game | 404 | `game_not_found` | no |
| Shop not paused | 409 | `invalid_status` | no |
| Rate exceeded | 429 | `rate_limited` | no |
| Server busy | 503 | `server_busy` | no |

## Security events (`server/security/securityLog.ts`)

One JSON line, fixed fields: `event` (`http.request.rejected`, `agent.run.rejected`, `agent.run.finished`), `timestamp`, `correlationId` (application-generated, grants nothing), `reasonCode` (closed set), `outcome` (`allowed`/`denied`/`stopped`), optional `status`, `stopReason`, `steps`, `executedToolCalls`. Never: prompt, body, path, game id, tool name, provider output, key, token, stack. The existing run telemetry (`shop_agent_run`) carries only decisions, models, latencies and usage.

## Production profile

`npm run build && npm run start:prod` serves `dist/` and the API from one origin with: active `Content-Security-Policy` (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

## Configuration safety

Limit overrides go through `resolveLimits`: `undefined` keeps the default, anything but a positive integer or an unknown key throws. `allowedOrigins` accepts exact http(s) origins only. The static server never serves dot files. The HTTP server logs security events by default.

## Out of scope / known limits

Authentication (the demo has none; game ids are unguessable UUIDs and are the only resource handle, not a credential); a leaderboard or anti-cheat (local records are labelled untrusted and never sent to the server); HTTPS/HSTS; multi-process rate limiting; live provider behaviour under prompt injection.
