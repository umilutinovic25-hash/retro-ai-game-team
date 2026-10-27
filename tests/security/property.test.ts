// W08 optional challenge: property-based test of the tool-dispatch boundary.
// Seeded generator (mulberry32), fixed number of cases, reproducible: set W08_SEED to replay a failure.
// Invariant for EVERY generated model proposal: nothing outside the allowlist executes, executed calls always
// had valid arguments, and the canonical game state never changes.
import test from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../../server/agent/orchestrator.ts";
import { TOOLS } from "../../server/agent/tools.ts";
import { TOOL_NAMES } from "../../src/ai/shopAgent.ts";
import { FAST, pausedGameAfterLoss, scripted } from "../support/agentFixtures.ts";

const SEED = Number(process.env.W08_SEED ?? 20261027);
const CASES = 300;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [...TOOL_NAMES, "constructor", "toString", "__proto__", "valueOf", "hasOwnProperty", "set_score",
  "purchase_perk", "restart", "get_shop_state\n", "GET_SHOP_STATE", "", "eval", "fetch_url", "read_file"];
const VALUES: unknown[] = [0, -1, 1, 3, 5, 6, 1.5, 1e9, "3", "", null, true, [], {}, ["extra_xp"], ["luck", "luck"],
  ["extra_xp", "luck", "extra_life", "luck"], ["set_score"], "other-game", { __proto__: { admin: true } }];
const KEYS = ["plan", "limit", "gameId", "score", "perk", "__proto__", "constructor", "role"];

function generate(random: () => number) {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const valid = () => pick([
    { tool: "get_shop_state", arguments: {} },
    { tool: "get_recent_runs", arguments: { limit: 1 + Math.floor(random() * 5) } },
    { tool: "evaluate_perk_plan", arguments: { plan: [pick(["extra_xp", "luck", "extra_life"])] } },
  ]);
  const proposals = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
    if (random() < 0.4) return { value: { kind: "tool_request", ...valid() } };
    const args: Record<string, unknown> = {};
    for (let index = Math.floor(random() * 3); index > 0; index -= 1) args[pick(KEYS)] = pick(VALUES);
    const tool = random() < 0.1 ? pick(VALUES) : pick(NAMES);
    return random() < 0.08
      ? { value: { kind: "tool_request", tool, arguments: args, extra: pick(VALUES) } }
      : { value: { kind: "tool_request", tool, arguments: random() < 0.1 ? pick(VALUES) : args } };
  });
  return proposals;
}

test(`property: ${CASES} seeded random proposal sequences never escape the tool policy (seed ${SEED})`, async () => {
  const random = mulberry32(SEED);
  let executedTotal = 0;
  let rejectedTotal = 0;
  for (let index = 0; index < CASES; index += 1) {
    const proposals = generate(random);
    const { manager, id } = pausedGameAfterLoss(3);
    const before = JSON.stringify({ game: manager.get(id), history: manager.getRunHistory(id) });
    const executed: string[] = [];
    const registry = Object.fromEntries(TOOL_NAMES.map((name) => [name, {
      ...TOOLS[name],
      execute: (args: Record<string, unknown>, context: Parameters<typeof TOOLS[typeof name]["execute"]>[1]) => {
        assert.ok(TOOLS[name].validateArgs(args).ok, `case ${index}: ${name} executed with invalid args`);
        executed.push(name);
        return TOOLS[name].execute(args, context);
      },
    }])) as typeof TOOLS;
    const outcome = await runAgent({ manager, gameId: id, transport: scripted(proposals).transport, tools: registry, deps: FAST });
    const context = `case ${index} seed ${SEED}: ${JSON.stringify(proposals).slice(0, 200)}`;
    assert.ok(executed.every((name) => (TOOL_NAMES as readonly string[]).includes(name)), context);
    assert.equal(outcome.toolCalls, executed.length, context);
    assert.notEqual(outcome.status, "completed", "a tool-only script can never produce a result");
    if (["unknown_tool", "invalid_tool_arguments"].includes(outcome.stopReason)) rejectedTotal += 1;
    executedTotal += executed.length;
    assert.equal(JSON.stringify({ game: manager.get(id), history: manager.getRunHistory(id) }), before, context);
  }
  // The generator must actually reach both sides of the boundary, or the property is vacuous.
  assert.ok(executedTotal > 20, `allowed calls executed: ${executedTotal}`);
  assert.ok(rejectedTotal > 100, `runs refused at the boundary: ${rejectedTotal}`);
});
