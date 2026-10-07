// Reproducible browser smoke for ASK SHOP AI. Starts the fake-provider backend and the Vite
// client, drives headless Chromium, and checks the scenarios from Evidence 013.
// Run: npx playwright install chromium   (once)
//      npm run test:e2e
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

type Server = { name: string; proc: ChildProcess; output: string[] };

const require = createRequire(import.meta.url);

// Resolve a package's CLI entry so it can run under the current Node binary: no npx, no shell,
// and no .cmd shim on Windows. The spawned PID is then the real server process.
function cliPath(pkg: string, bin: string): string {
  const manifestPath = require.resolve(`${pkg}/package.json`);
  const manifest = require(manifestPath) as { bin: string | Record<string, string> };
  return join(dirname(manifestPath), typeof manifest.bin === "string" ? manifest.bin : manifest.bin[bin]);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function start(name: string, args: string[], env: NodeJS.ProcessEnv, ready: RegExp): Promise<Server> {
  const proc = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const output: string[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not start: ${output.join("\n")}`)), 30_000);
    const onData = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) output.push(line);
      if (ready.test(output.join("\n"))) { clearTimeout(timer); resolve({ name, proc, output }); }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.once("error", (error) => { clearTimeout(timer); reject(error); });
    proc.once("exit", (code) => { clearTimeout(timer); reject(new Error(`${name} exited with ${code}: ${output.join("\n")}`)); });
  });
}

// Resolves only after the server process has actually exited, so its port is released before
// the next server starts. Escalates to SIGKILL if a graceful stop takes too long.
async function stop(server: Server | undefined): Promise<void> {
  if (!server) return;
  const { proc } = server;
  proc.removeAllListeners("exit");
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  proc.kill("SIGTERM");
  const timer = setTimeout(() => proc.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(timer);
}

const startApi = (port: number, env: NodeJS.ProcessEnv = {}) =>
  start("fake API", ["--import", "tsx", "scripts/e2e/fakeAdvisorServer.ts"], { PORT: String(port), ...env }, /listening/);

function telemetry(server: Server): Array<Record<string, unknown>> {
  return server.output.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function text(page: Page, selector: string): Promise<string> {
  return (await page.textContent(selector))?.trim() ?? "";
}

async function progression(page: Page) {
  return {
    score: await text(page, "#score"),
    xp: await text(page, "#xp-value"),
    points: await text(page, "#perk-points-value"),
    extraXp: await text(page, "#extra-xp-value"),
    luck: await text(page, "#luck-value"),
    lives: await text(page, "#life-value"),
  };
}

let webUrl = "";

async function openFreshShop(page: Page): Promise<void> {
  await page.goto(webUrl);
  await page.waitForSelector('#server-connection[data-connection="online"]');
  await page.keyboard.press("ArrowUp");
  await page.waitForSelector("#shop-toggle:not([disabled])");
  await page.click("#shop-toggle");
  await page.waitForSelector("#perk-shop:not([hidden])");
  await page.waitForSelector("#shop-advice-button:not([disabled])");
}

let passed = 0;
async function check(id: string, name: string, body: () => Promise<void>): Promise<void> {
  await body();
  passed += 1;
  console.log(`PASS ${id} ${name}`);
}

async function main(): Promise<void> {
  let api: Server | undefined;
  let web: Server | undefined;
  const apiPort = Number(process.env.E2E_API_PORT ?? await freePort());
  const webPort = Number(process.env.E2E_WEB_PORT ?? await freePort());
  webUrl = `http://127.0.0.1:${webPort}`;
  const browser = await chromium.launch();
  try {
    web = await start("Vite", [cliPath("vite", "vite"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
      { API_PORT: String(apiPort) }, /Local:/);

    // Seeded so the first pause of each game has one perk point: M5 is then always runnable.
    api = await startApi(apiPort, { E2E_SEED_PERK_POINTS: "1" });
    const page = await browser.newPage();

    await check("M1", "ASK SHOP AI shows a pending state, then validated advice", async () => {
      await openFreshShop(page);
      assert.match(await text(page, "#status"), /PAUSED/);
      await page.click("#shop-advice-button");
      assert.match(await text(page, "#shop-advice-output"), /CHECKING/);
      await page.waitForFunction(() => /GEMINI|GEMMA/.test(document.querySelector("#shop-advice-output")?.textContent ?? ""));
      assert.match(await text(page, "#shop-advice-output"), /^(BUY|WAIT)/);
    });

    await check("M3", "Flash 503 falls back to Flash-Lite and the UI labels the fallback model", async () => {
      assert.match(await text(page, "#shop-advice-output"), /GEMINI FLASH-LITE$/);
      const attempts = telemetry(api!);
      assert.equal(attempts[0]?.model, "gemini-3.8-flash");
      assert.equal(attempts[0]?.providerStatus, 503);
      assert.equal(attempts[1]?.model, "gemini-3.5-flash-lite");
      assert.equal(attempts[1]?.status, "success");
      assert.equal(attempts[1]?.fallbackUsed, true);
    });

    await check("M2", "Advice never buys: score, XP, points and perk levels are unchanged", async () => {
      const before = await progression(page);
      await page.waitForTimeout(500);
      assert.deepEqual(await progression(page), before);
      assert.match(await text(page, "#status"), /PAUSED/);
    });

    await check("M4", "Closing the shop during a pending request hides the late answer and resumes", async () => {
      await openFreshShop(page);
      const attemptsBefore = telemetry(api!).length;
      await page.click("#shop-advice-button");
      assert.match(await text(page, "#shop-advice-output"), /CHECKING/);
      await page.click("#shop-close");
      await page.waitForSelector("#perk-shop", { state: "hidden" });
      assert.doesNotMatch(await text(page, "#status"), /PAUSED/);
      await page.waitForTimeout(2500); // longer than the fake provider's answer delay
      assert.doesNotMatch(await text(page, "#shop-advice-output"), /GEMINI|GEMMA|CHECKING/);
      // The Vite dev/preview proxy does not forward the browser abort to the backend, so the
      // provider call behind the proxy may still finish; M4b checks backend cancellation directly.
      const late = telemetry(api!).slice(attemptsBefore).map((event) => `${event.model}:${event.status}`);
      console.log(`     provider attempts behind the proxy after close: ${late.join(", ") || "none"}`);
    });

    await check("M4b", "A client disconnect aborts the provider call on the backend", async () => {
      const api_ = `http://127.0.0.1:${apiPort}/api/games`;
      const post = (path: string, body: unknown = {}, signal?: AbortSignal) => fetch(`${api_}${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal,
      });
      const { game } = await (await post("")).json() as { game: { id: string } };
      await post(`/${game.id}/move`, { direction: "up" });
      await post(`/${game.id}/pause`);
      const attemptsBefore = telemetry(api!).length;
      await post(`/${game.id}/shop-advice`, {}, AbortSignal.timeout(300)).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const late = telemetry(api!).slice(attemptsBefore);
      assert.ok(late.length > 0, "provider was called");
      assert.ok(late.every((event) => event.status !== "success"), "no successful answer after disconnect");
      assert.equal(late.at(-1)?.errorClass, "cancelled");
    });

    await check("M5", "Buying a perk while advice is pending discards the stale answer", async () => {
      await openFreshShop(page);
      const buyable = await page.$("#perk-shop button[id^=buy-]:not([disabled])");
      if (!buyable) throw new Error("seeded fixture should leave an affordable perk");
      const pointsBefore = await text(page, "#perk-points-value");
      await page.click("#shop-advice-button");
      assert.match(await text(page, "#shop-advice-output"), /CHECKING/);
      await buyable.click();
      await page.waitForFunction((before) => document.querySelector("#perk-points-value")?.textContent?.trim() !== before, pointsBefore);
      await page.waitForTimeout(2500); // longer than the fake provider's answer delay
      assert.doesNotMatch(await text(page, "#shop-advice-output"), /GEMINI|GEMMA/);
    });

    await check("C1", "The Canvas board draws and the page has no console errors", async () => {
      const errors: string[] = [];
      const onError = (error: Error) => errors.push(error.message);
      page.on("pageerror", onError);
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.waitForTimeout(500);
      const drawn = await page.evaluate(() => {
        const canvas = document.querySelector("#board") as HTMLCanvasElement | null;
        if (!canvas || canvas.tagName !== "CANVAS") return false;
        const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!data) return false;
        let lit = 0;
        for (let index = 0; index < data.length; index += 4 * 97) if (data[index] + data[index + 1] + data[index + 2] > 40) lit += 1;
        return lit > 20;
      });
      page.off("pageerror", onError);
      assert.equal(drawn, true);
      assert.deepEqual(errors, []);
    });

    await check("C2", "An arrow starts a 3-2-1 countdown, then the game runs", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.keyboard.press("ArrowUp");
      await page.waitForFunction(() => document.querySelector("#countdown")?.textContent === "3");
      assert.equal(await text(page, "#status"), "GET READY");
      await page.waitForFunction(() => document.querySelector("#status")?.textContent === "PLAYING", undefined, { timeout: 5000 });
    });

    await check("C6", "READY ignores the current heading and locks the first valid start turn", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      const moves: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/move") && request.method() === "POST") moves.push(String(request.postDataJSON()?.direction));
      });
      await page.keyboard.press("ArrowRight"); // initial heading is right; must be ignored
      await page.waitForTimeout(80);
      assert.equal(await text(page, "#status"), "READY");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowLeft"); // cannot replace the first accepted start turn
      await page.waitForFunction(() => document.querySelector("#status")?.textContent === "PLAYING", undefined, { timeout: 5000 });
      assert.deepEqual(moves, ["up"]);
    });

    await check("C11", "A failed first move releases the READY start lock", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.evaluate(() => {
        const target = window as Window & { offlineSeen?: boolean; connectionObserver?: MutationObserver };
        const badge = document.querySelector("#server-connection");
        target.offlineSeen = false;
        target.connectionObserver = new MutationObserver(() => {
          if (badge?.getAttribute("data-connection") === "offline") target.offlineSeen = true;
        });
        target.connectionObserver.observe(badge!, { attributes: true, attributeFilter: ["data-connection"] });
      });
      await page.route("**/move", (route) => route.abort());
      const failedMove = page.waitForEvent("requestfailed", (request) => request.url().endsWith("/move"));
      await page.keyboard.press("ArrowUp");
      await failedMove;
      await page.waitForFunction(() => (window as Window & { offlineSeen?: boolean }).offlineSeen === true);
      await page.waitForFunction(() => (document.querySelector("#countdown") as HTMLElement | null)?.hidden === true);
      await page.unroute("**/move");
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(() => document.querySelector("#countdown")?.textContent === "3");
      await page.evaluate(() => (window as Window & { connectionObserver?: MutationObserver }).connectionObserver?.disconnect());
    });

    await check("C7", "Opening records cancels a running start countdown", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.keyboard.press("ArrowUp");
      await page.waitForFunction(() => document.querySelector("#countdown")?.textContent === "3");
      await page.click("#records-open");
      await page.waitForSelector("#records-dialog[open]");
      assert.equal(await page.locator("#countdown").isVisible(), false);
      assert.equal(await text(page, "#status"), "READY");
    });

    await check("C8", "Cmd/Ctrl shortcuts are not intercepted by the game", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      const before = await page.evaluate(() => document.body.dataset.palette);
      const prevented = await page.evaluate(() => [
        new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true }),
        new KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }),
      ].map((event) => { window.dispatchEvent(event); return event.defaultPrevented; }));
      assert.deepEqual(prevented, [false, false]);
      assert.equal(await page.evaluate(() => document.body.dataset.palette), before);
      assert.equal(await text(page, "#status"), "READY");
    });

    await check("C9", "A failed move request does not replace the active game status", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.keyboard.press("ArrowUp");
      await page.waitForFunction(() => document.querySelector("#status")?.textContent === "PLAYING", undefined, { timeout: 5000 });
      await page.waitForTimeout(250);
      const attemptedMoves: string[] = [];
      page.on("request", (request) => { if (request.url().endsWith("/move")) attemptedMoves.push(request.url()); });
      await page.evaluate(() => {
        const target = window as Window & { offlineStatus?: string | null; connectionObserver?: MutationObserver };
        const badge = document.querySelector("#server-connection");
        target.offlineStatus = null;
        target.connectionObserver = new MutationObserver(() => {
          if (badge?.getAttribute("data-connection") === "offline") target.offlineStatus = document.querySelector("#status")?.textContent ?? null;
        });
        target.connectionObserver.observe(badge!, { attributes: true, attributeFilter: ["data-connection"] });
      });
      await page.route("**/move", (route) => route.abort());
      await page.keyboard.press("ArrowLeft");
      try {
        await page.waitForFunction(() => (window as Window & { offlineStatus?: string | null }).offlineStatus === "PLAYING", undefined, { timeout: 5000 });
      } catch {
        throw new Error(`move failure did not report offline; observed move requests: ${attemptedMoves.join(", ") || "none"}`);
      }
      await page.unroute("**/move");
      await page.waitForTimeout(400);
      await page.keyboard.press("ArrowLeft");
      await page.waitForSelector('#server-connection[data-connection="online"]');
      assert.equal(await text(page, "#status"), "PLAYING");
      await page.evaluate(() => (window as Window & { connectionObserver?: MutationObserver }).connectionObserver?.disconnect());
    });

    await check("C10", "A held second turn waits until the first turn is applied by a server tick", async () => {
      const moveObservations: Array<{ sent: string; sentAt: number }> = [];
      page.on("request", (request) => {
        if (!request.url().endsWith("/move") || request.method() !== "POST") return;
        moveObservations.push({ sent: String(request.postDataJSON()?.direction), sentAt: Date.now() });
      });
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.keyboard.press("ArrowUp");
      await page.waitForFunction(() => document.querySelector("#status")?.textContent === "PLAYING", undefined, { timeout: 5000 });
      await page.waitForTimeout(100);
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(() => document.querySelector("#status")?.textContent !== "GET READY", undefined, { timeout: 5000 });
      // Keep observations in Node scope; give the buffer a bounded chance to flush its held turn.
      const deadline = Date.now() + 4000;
      while (!moveObservations.some((item) => item.sent === "down") && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 40));
      assert.deepEqual(moveObservations.map((item) => item.sent), ["up", "left", "down"]);
      assert.ok((moveObservations[2]?.sentAt ?? 0) - (moveObservations[1]?.sentAt ?? 0) >= 100,
        "the held turn must wait for a server movement snapshot before it is sent");
    });

    await check("C3", "M and C toggle sound and colors and the choice survives a reload", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.keyboard.press("c");
      assert.equal(await page.evaluate(() => document.body.dataset.palette), "colorblind");
      await page.keyboard.press("m");
      assert.equal(await page.getAttribute("#mute", "aria-pressed"), "false");
      await page.reload();
      await page.waitForSelector('#server-connection[data-connection="online"]');
      assert.equal(await page.evaluate(() => document.body.dataset.palette), "colorblind");
      assert.equal(await page.getAttribute("#mute", "aria-pressed"), "false");
      await page.keyboard.press("c");
      await page.keyboard.press("m");
    });

    await check("C4", "The records dialog opens and closes", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.click("#records-open");
      await page.waitForSelector("#records-dialog[open]");
      assert.match(await text(page, "#records-empty"), /NO SCORES YET/);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#records-dialog")?.hasAttribute("open"));
    });

    await check("C5", "Difficulty starts a new game with the speed preset and is remembered", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      const created = page.waitForRequest((request) => request.url().endsWith("/api/games") && request.method() === "POST");
      await page.click('[data-difficulty="hard"]');
      assert.equal((await created).postDataJSON().config.startingSpeedMs, 125);
      await page.waitForFunction(() => document.querySelector('[data-difficulty="hard"]')?.getAttribute("aria-pressed") === "true");
      await page.reload();
      await page.waitForSelector('#server-connection[data-connection="online"]');
      assert.equal(await page.getAttribute('[data-difficulty="hard"]', "aria-pressed"), "true");
      await page.click('[data-difficulty="normal"]');
    });

    await stop(api);
    api = await startApi(apiPort, { FAKE_PROVIDER: "off" });

    await check("M6", "No provider configured: safe unavailable message, game state unchanged", async () => {
      await openFreshShop(page);
      const before = await progression(page);
      await page.click("#shop-advice-button");
      await page.waitForFunction(() => /UNAVAILABLE/.test(document.querySelector("#shop-advice-output")?.textContent ?? ""));
      assert.equal(await text(page, "#shop-advice-output"), "SHOP ADVICE IS UNAVAILABLE. NO PURCHASE WAS MADE.");
      assert.deepEqual(await progression(page), before);
    });

    console.log(`\n${passed} passed, 0 skipped, 0 failed.`);
  } finally {
    await browser.close();
    await stop(api);
    await stop(web);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
