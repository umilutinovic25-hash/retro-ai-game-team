// W08 browser + production-build checks (T04, T05, T15, T16 and the browser half of T03/T14).
// Serves the real production build (dist/) from the game server with its active CSP, drives headless
// Chromium (CSP not bypassed), and uses a fake provider. Run: npm run build && npm run test:e2e:security
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

const SENTINEL = "W08_SERVER_SECRET_DO_NOT_EXPOSE";
const XSS_IMG = '<img src="/w08-missing.png" onerror="window.__w08XssMarker = true">';
const XSS_URL = "javascript:window.__w08XssMarker=true";
const NORMAL = "Kupi Extra XP: čćžšđ, a < b, 'ok' & done.";

type Server = { proc: ChildProcess; output: string[] };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port: number): Promise<Server> {
  const proc = spawn(process.execPath, ["--import", "tsx", "scripts/e2e/secureArcadeServer.ts"], {
    env: { ...process.env, PORT: String(port), W08_SERVER_SECRET: SENTINEL }, stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output.join("\n")}`)), 30_000);
    const onData = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) output.push(line);
      if (output.some((line) => line.includes("listening"))) { clearTimeout(timer); resolve({ proc, output }); }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.once("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${output.join("\n")}`)); });
  });
}

async function stopServer(server: Server | undefined): Promise<void> {
  if (!server || server.proc.exitCode !== null) return;
  server.proc.removeAllListeners("exit");
  const exited = new Promise<void>((resolve) => server.proc.once("exit", () => resolve()));
  server.proc.kill("SIGTERM");
  const timer = setTimeout(() => server.proc.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(timer);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let passed = 0;
async function check(id: string, name: string, body: () => Promise<void>): Promise<void> {
  await body();
  passed += 1;
  console.log(`PASS ${id} ${name}`);
}

async function openShop(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('#server-connection[data-connection="online"]');
  await page.keyboard.press("ArrowUp");
  await page.waitForSelector("#shop-toggle:not([disabled])");
  await page.click("#shop-toggle");
  await page.waitForSelector("#perk-shop:not([hidden])");
  await page.waitForSelector("#shop-agent-button:not([disabled])");
}

async function main(): Promise<void> {
  assert.ok(statSync("dist/index.html").isFile(), "run `npm run build` first");
  const port = await freePort();
  const otherPort = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let server: Server | undefined;
  const browser = await chromium.launch();
  // A second origin that tries to attack the game server and to serve a script the CSP must not run.
  let probeHits = 0;
  const probe = createHttpServer((request, response) => {
    probeHits += 1;
    response.writeHead(200, { "content-type": request.url?.endsWith(".js") ? "text/javascript" : "text/html" });
    response.end(request.url?.endsWith(".js") ? "window.__w08ExternalScript = true;" : "<!doctype html><title>probe</title>");
  });
  await new Promise<void>((resolve) => probe.listen(otherPort, "127.0.0.1", resolve));
  try {
    server = await startServer(port);
    const context = await browser.newContext(); // bypassCSP stays false
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __violations: string[] }).__violations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        (window as unknown as { __violations: string[] }).__violations.push(`${event.effectiveDirective}|${event.blockedURI}`);
      });
    });
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

    await check("S1", "production headers: active CSP, nosniff, no-referrer, no inline script or eval", async () => {
      const response = await fetch(`${url}/`);
      const csp = response.headers.get("content-security-policy") ?? "";
      assert.equal(response.headers.get("content-security-policy-report-only"), null);
      assert.match(csp, /script-src 'self'(;|$)/);
      for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "connect-src 'self'"]) assert.ok(csp.includes(directive), directive);
      assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp.split(";").find((part) => part.trim().startsWith("script-src")) ?? ""));
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      const api = await fetch(`${url}/api/health`);
      assert.equal(api.headers.get("x-content-type-options"), "nosniff");
      assert.equal(api.headers.get("referrer-policy"), "no-referrer");
      assert.equal((await fetch(`${url}/..%2f..%2fpackage.json`)).status, 404, "no path traversal out of dist/");
    });

    await check("S2", "game and the normal AI plan work under the CSP; text is rendered literally", async () => {
      await openShop(page, url);
      await page.click("#shop-agent-button");
      await page.waitForFunction(() => /PLAN:/.test(document.querySelector("#shop-agent-output")?.textContent ?? ""));
      const text = (await page.textContent("#shop-agent-output")) ?? "";
      assert.ok(text.includes(NORMAL), `serbian letters, apostrophe and "a < b" survive: ${text}`);
      assert.equal(await page.locator("#shop-agent-output *").count(), 0, "text node only, no child elements");
      assert.deepEqual(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations), [], "the CSP blocked nothing the game needs");
    });

    await check("S2a", "T16 production Canvas and native Web Audio output work under the active CSP", async () => {
      const audioPage = await context.newPage();
      try {
        await audioPage.addInitScript(() => {
          const violations: string[] = [];
          (window as unknown as { __violations: string[] }).__violations = violations;
          document.addEventListener("securitypolicyviolation", (event) => violations.push(`${event.effectiveDirective}|${event.blockedURI}`));
          const state = { peak: 0, meters: [] as Array<{ context: AudioContext; analyser: AnalyserNode }> };
          (window as unknown as { __w08Audio: typeof state }).__w08Audio = state;
          const createGain = AudioContext.prototype.createGain;
          AudioContext.prototype.createGain = function () {
            const gain = createGain.call(this);
            const connect = gain.connect.bind(gain);
            gain.connect = ((destination: AudioNode, output?: number, input?: number) => {
              if (destination === this.destination) {
                // Pass through a real analyser before the real destination; do not replace the sound engine.
                const analyser = this.createAnalyser();
                analyser.fftSize = 256;
                connect(analyser);
                analyser.connect(destination);
                state.meters.push({ context: this, analyser });
                return destination;
              }
              return connect(destination, output, input);
            }) as typeof gain.connect;
            return gain;
          };
          window.setInterval(() => {
            for (const { analyser } of state.meters) {
              const samples = new Float32Array(analyser.fftSize);
              analyser.getFloatTimeDomainData(samples);
              for (const sample of samples) state.peak = Math.max(state.peak, Math.abs(sample));
            }
          }, 10);
        });
        await audioPage.goto(url);
        await audioPage.waitForSelector('#server-connection[data-connection="online"]');
        await audioPage.keyboard.press("ArrowUp");
        await audioPage.waitForFunction(() => {
          const audio = (window as unknown as { __w08Audio: { peak: number; meters: Array<{ context: AudioContext }> } }).__w08Audio;
          return audio.peak > 0.00001 && audio.meters.some(({ context }) => context.state === "running");
        });
        const litPixels = await audioPage.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>("#board")!;
          const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
          let lit = 0;
          for (let i = 0; i < data.length; i += 4 * 97) if (data[i] + data[i + 1] + data[i + 2] > 40) lit += 1;
          return lit;
        });
        assert.ok(litPixels > 20, "production Canvas draws visible game content");
        assert.deepEqual(await audioPage.evaluate(() => (window as unknown as { __violations: string[] }).__violations), [], "audio/Canvas require no CSP bypass");
      } finally { await audioPage.close(); }
    });

    await check("S3", "T04/T05 hostile model text stays text: no execution and a safe DOM", async () => {
      await context.route("**/api/games/*/shop-agent", async (route) => {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ run: {
            runId: "w08-xss", revision: (await (await fetch(`${url}/api/games/${route.request().url().split("/")[5]}`)).json() as { game: { revision: number } }).game.revision,
            steps: 3, toolCalls: 2, status: "completed", message: `PLAN: ${XSS_URL}`,
            result: { summary: XSS_IMG, plan: ["extra_xp"], confidence: "high", completed: true,
              evidence: [{ source: "get_shop_state", step: 1, finding: `<script>window.__w08XssMarker=true</script> ${XSS_URL}` }] },
          } }),
        });
      });
      await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__w08XssMarker; });
      await page.click("#shop-agent-button");
      await page.waitForFunction((needle) => (document.querySelector("#shop-agent-output")?.textContent ?? "").includes(needle), "w08-missing.png");
      await page.waitForTimeout(400);
      const output = (await page.textContent("#shop-agent-output")) ?? "";
      assert.ok(output.includes(XSS_IMG) && output.includes("<script>") && output.includes(XSS_URL), "markup is shown as literal text");
      assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__w08XssMarker), undefined, "nothing executed");
      assert.equal(await page.locator('#shop-agent-output *').count(), 0, "no element was created inside the output");
      assert.equal(await page.locator('img[src="/w08-missing.png"], script:not([src])').count(), 0, "no injected img or inline script anywhere in the DOM");
      assert.equal(await page.locator('a[href^="javascript:"]').count(), 0, "no javascript: link");
      await context.unroute("**/api/games/*/shop-agent");
    });

    await check("S3b", "T04 the other model-text paths (shop advice, post-run coach) also render hostile text as text", async () => {
      const revisionOf = async (requestUrl: string) => (await (await fetch(`${url}/api/games/${requestUrl.split("/")[5]}`)).json() as { game: { revision: number } }).game.revision;
      await context.route("**/api/games/*/shop-advice", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ advice: {
          status: "advice", revision: await revisionOf(route.request().url()), decision: "wait", reasonCode: "save_points",
          message: XSS_IMG, model: "gemini-3.8-flash" } }) });
      });
      await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__w08XssMarker; });
      await page.click("#shop-advice-button");
      await page.waitForFunction(() => (document.querySelector("#shop-advice-output")?.textContent ?? "").includes("w08-missing.png"));
      await page.waitForTimeout(300);
      assert.equal(await page.locator("#shop-advice-output *").count(), 0);
      await context.unroute("**/api/games/*/shop-advice");

      await context.route("**/api/games/*/coach", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ coach: {
        status: "coaching", headline: "<b>HI</b>", tip: XSS_IMG, model: "gemini-3.8-flash" } }) }));
      const coachPage = await context.newPage();
      await coachPage.goto(url);
      await coachPage.waitForSelector('#server-connection[data-connection="online"]');
      await coachPage.keyboard.press("ArrowUp");
      await coachPage.waitForSelector("#coach-panel:not([hidden])", { timeout: 20_000 }); // the snake runs into the wall
      await coachPage.click("#coach-button");
      await coachPage.waitForFunction(() => (document.querySelector("#coach-output")?.textContent ?? "").includes("w08-missing.png"));
      await coachPage.waitForTimeout(300);
      assert.equal(await coachPage.evaluate(() => (window as unknown as Record<string, unknown>).__w08XssMarker), undefined);
      assert.equal(await coachPage.locator("#coach-panel img, #coach-panel b").count(), 0, "coach headline/tip markup stays text");
      assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__w08XssMarker), undefined);
      await coachPage.close();
      await context.unroute("**/api/games/*/coach");
    });

    await check("S4", "the CSP itself blocks an inline and an external script that would otherwise run", async () => {
      await page.evaluate(() => { (window as unknown as { __violations: string[] }).__violations.length = 0; });
      const before = probeHits;
      const result = await page.evaluate(async (external) => {
        const inline = document.createElement("script");
        inline.textContent = "window.__w08Inline = true;";
        document.head.appendChild(inline);
        const remote = document.createElement("script");
        remote.src = external;
        document.head.appendChild(remote);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const w = window as unknown as Record<string, unknown>;
        return { inline: w.__w08Inline, external: w.__w08ExternalScript, violations: (w.__violations as string[]) };
      }, `http://127.0.0.1:${otherPort}/probe.js`);
      assert.equal(result.inline, undefined);
      assert.equal(result.external, undefined);
      assert.ok(result.violations.some((entry) => entry.startsWith("script-src-elem|inline")), `inline: ${result.violations}`);
      assert.ok(result.violations.some((entry) => entry.startsWith("script-src-elem|") && entry.includes(`:${otherPort}`)), `external: ${result.violations}`);
      assert.equal(probeHits, before, "the browser never even requested the blocked script");
      // Control: the same inline script runs when the policy is not applied (blank page without CSP).
      const control = await context.newPage();
      await control.setContent("<script>window.__w08Control = true</script>");
      assert.equal(await control.evaluate(() => (window as unknown as Record<string, unknown>).__w08Control), true, "the probe script is runnable without the policy");
      await control.close();
    });

    await check("S5", "T15 forged localStorage scores and names change nothing on the server and are shown as safe text", async () => {
      await page.evaluate((img) => {
        window.localStorage.setItem("retro-snake-records", JSON.stringify({
          top: [{ name: img, score: 999999999, difficulty: "normal", date: "2099-01-01" }],
          stats: { games: 1e6, totalFood: 1e6, longestSnake: 1e6, bestCombo: 1e6 },
        }));
      }, XSS_IMG);
      await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__w08XssMarker; });
      const requests: string[] = [];
      page.on("request", (request) => { if (request.method() === "POST") requests.push(request.postData() ?? ""); });
      await openShop(page, url);
      assert.equal(await page.locator('img[src="/w08-missing.png"]').count(), 0);
      assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__w08XssMarker), undefined);
      assert.equal(await page.textContent("#best-unverified"), "LOCAL", "the local best score is labelled as unverified");
      assert.match((await page.textContent("#records-unverified")) ?? "", /NOT VERIFIED BY THE SERVER/);
      await page.click("#shop-agent-button");
      await page.waitForFunction(() => /PLAN:/.test(document.querySelector("#shop-agent-output")?.textContent ?? ""));
      assert.ok(requests.includes('{"goal":"plan_next_purchases"}'), "the agent request carries only the fixed goal");
      assert.ok(requests.every((body) => !body.includes("999999999")), "no client score is ever sent");
      const gameUrl = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).reverse().find((n) => /\/api\/games\/[^/]+$/.test(n)) ?? "");
      assert.ok(gameUrl, "the page's own game container was found");
      const { game } = await (await fetch(gameUrl)).json() as { game: { players: Array<{ score: number }> } };
      assert.ok(game.players[0].score < 1000, "the authoritative score is the server's, not the forged 999999999");
      await page.evaluate(() => window.localStorage.removeItem("retro-snake-records"));
    });

    await check("S6", "T03 a page on another origin cannot drive the API: the request is refused and the server did nothing", async () => {
      const attacker = await context.newPage();
      await attacker.goto(`http://127.0.0.1:${otherPort}/`);
      const created = await attacker.evaluate(async (target) => {
        try {
          const response = await fetch(`${target}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          return `status ${response.status}`;
        } catch (error) {
          return `blocked ${(error as Error).name}`;
        }
      }, url);
      assert.match(created, /blocked/, "browser CORS blocks the preflighted JSON request");
      const simple = await attacker.evaluate(async (target) => {
        await fetch(`${target}/api/games`, { method: "POST", mode: "no-cors", body: "{}" }).catch(() => null);
        return true;
      }, url);
      assert.equal(simple, true);
      await attacker.close();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const events = server!.output.filter((line) => line.startsWith("{") && line.includes("http.request.rejected")).map((line) => JSON.parse(line) as { reasonCode: string });
      assert.ok(events.some((event) => event.reasonCode === "ORIGIN_NOT_ALLOWED"), "the no-cors simple POST reached the server and was refused by the Origin check");
    });

    await check("S7", "T16/T14 sentinel: server loaded it; it is in no client artifact, response or log", async () => {
      assert.ok(server!.output.some((line) => line.includes(`secretLength=${SENTINEL.length}`)), "the server loaded the synthetic secret");
      for (const file of walk("dist")) {
        const bytes = readFileSync(file);
        assert.equal(bytes.includes(SENTINEL), false, `${file} contains the sentinel`);
        assert.equal(bytes.includes("W08_SERVER_SECRET"), false, `${file} references the variable name`);
      }
      for (const path of ["/", "/api/health", "/api/games/unknown", "/assets/does-not-exist.js"]) {
        const text = await (await fetch(`${url}${path}`)).text();
        assert.equal(text.includes(SENTINEL), false, path);
      }
      assert.ok(server!.output.every((line) => !line.includes(SENTINEL)), "no log line contains the sentinel");
      const blocked = consoleErrors.filter((message) => /Content Security Policy/.test(message));
      assert.equal(blocked.length, 2, "the only CSP blocks are the two deliberate probes of S4");
      assert.deepEqual(consoleErrors.filter((message) => !/Content Security Policy|Failed to load resource/.test(message)), [], "no unexpected console errors");
    });

    console.log(`\n${passed} browser/production checks passed`);
  } finally {
    await browser.close();
    probe.close();
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
