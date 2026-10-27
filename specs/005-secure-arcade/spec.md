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
| Model response | 16 KiB (adapter read cap), candidate text 4096 UTF-16 code units, 2048 output tokens | `geminiTransport.readLimitedResponse`, `googleTransport` | |
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

## Review follow-up acceptance (2026-10-27)

- I6 / T12: immediately after a provider result and before tool dispatch or final acceptance, cancellation and the absolute total deadline are rechecked. A result at or after 45000 ms is refused; the same valid final at 44999 ms succeeds. A tool may finish after its start deadline, but no late result is accepted or forwarded.
- I1 / I8 / T17: malformed WebSocket upgrade URLs and percent-encoded resource IDs return controlled HTTP 400 without uncaught exceptions. The same process must still answer health checks and stream valid game snapshots. Logs contain only a safe rejection code, never the URL.

- I6 / T13: retry/fallback cannot overlap an unfinished timed-out attempt within a run. Cooperative aborts remain retryable within the existing budget; an attempt still pending after abort ends that run and occupies orphan capacity until settlement. This applies to Shop Strategist and shop advice, which share admission.

## Adjacent boundary follow-up (2026-10-27)

- Coach shares admission capacity: pre-cancelled requests make zero provider attempts; timeout/cancellation returns promptly even if transport ignores AbortSignal. Such unfinished work occupies orphan capacity and cannot trigger overlapping fallback. Only validated successful coaching is cached; cancellation/failure permits a subsequent legitimate retry. Per-attempt timeout remains 3500 ms, at most the three allowlisted models.
- Production static serving checks canonical paths: symlink targets outside the canonical build root or inside dot directories are refused with 404. Ordinary assets and aliases to public assets inside the root remain available. This assumes operator-controlled build files; concurrent hostile filesystem mutation is outside the proof.

- Coach resource/status validation runs before admission: missing game is 404, unfinished game is 409, neither spends a rate token or invokes provider; a subsequent valid finished run can still be admitted.

## Completeness proof follow-up

- T16 / assignment C: the production browser smoke checks the actual Canvas pixels and a nonzero Web Audio waveform in a running native AudioContext under the active CSP. Monitoring may tap the real audio graph without replacing sound generation. Human hearing/output-device quality is not claimed.
- T03/T08: use two synthetic game containers with distinct numerical state/history. Valid allowlisted calls (no extra gameId argument) must read only the selected container; provider transcript must contain its expected data and exclude the other container's marker, with both snapshots/history unchanged. This proves demo tool scope, not authenticated ownership.

- Text lengths in final-summary/finding contracts use JavaScript String.length (UTF-16 code units), not grapheme clusters. HTTP/tool/provider size caps use encoded bytes. T06 checks the production streaming reader at 16384 bytes and one byte over, including UTF-8 multibyte text, independently of model/final schema rejection.
- T01/T02 proof includes direct instrumentation of the actual business-tool execute methods: rejected initial requests leave provider attempts and executed tools at zero, state identical; a legitimate request subsequently completes 3 provider decisions and 2 real tool executions.
