import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

const REQUIRED = [
  "score", "best-score", "status", "pace", "server-connection", "board", "countdown",
  "game-overlay", "overlay-title", "overlay-message", "overlay-action", "name-form", "name-input", "name-rank",
  "xp-value", "level-value", "perk-points-value", "extra-xp-value", "extra-xp-cubes", "luck-value", "luck-cubes",
  "life-value", "life-cubes", "perk-shop", "shop-xp", "shop-level", "shop-points", "shop-close",
  "shop-luck-value", "shop-luck-cubes", "buy-luck", "shop-extra-xp-value", "shop-extra-xp-cubes", "buy-extra-xp",
  "shop-life-value", "shop-life-cubes", "buy-extra-life", "shop-advice-output", "shop-advice-button",
  "shop-agent-output", "shop-agent-button", "shop-message", "pause", "shop-toggle", "restart", "mute",
  "colorblind", "records-open", "records-dialog", "records-list", "records-empty",
  "stat-games", "stat-food", "stat-length", "stat-combo",
];

test("every id the client needs exists exactly once", () => {
  for (const id of REQUIRED) assert.equal(ids.filter((value) => value === id).length, 1, id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
});

test("the board is a canvas and the page keeps its controls", () => {
  assert.match(html, /<canvas id="board"/);
  assert.equal((html.match(/data-difficulty="(easy|normal|hard)"/g) ?? []).length, 3);
  assert.equal((html.match(/data-direction="(up|right|down|left)"/g) ?? []).length, 4);
  assert.match(html, /<script type="module" src="\/src\/main\.ts"><\/script>/);
});

test("the shop and the AI panels live inside the board frame", () => {
  const frame = /<div class="board-frame">([\s\S]*?)\n        <\/div>\n        <ul class="legend"/.exec(html)?.[1] ?? "";
  for (const id of ["perk-shop", "shop-advice-button", "shop-agent-button", "game-overlay", "countdown"]) {
    assert.ok(frame.includes(`id="${id}"`), `${id} must be inside .board-frame`);
  }
});
