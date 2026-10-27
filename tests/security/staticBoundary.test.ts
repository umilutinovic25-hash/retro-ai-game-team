// Synthetic files only: a build-directory link must not expose data outside its serving boundary.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createGameHttpServer } from "../../server/httpServer.ts";
import { GameSessionManager } from "../../server/gameSession.ts";

test("T14/T16 static symlinks cannot escape the build root or bypass dot-directory protection; public assets still work", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "w08-symlink-"));
  const root = join(fixture, "dist");
  mkdirSync(root);
  mkdirSync(join(root, ".internal"));
  const marker = "W08_SYNTHETIC_PRIVATE_DATA";
  writeFileSync(join(fixture, "private.txt"), marker);
  writeFileSync(join(root, ".internal", "data.txt"), marker);
  writeFileSync(join(root, "public.txt"), "public asset");
  symlinkSync(join(fixture, "private.txt"), join(root, "outside.txt"));
  symlinkSync(fixture, join(root, "outside"), "dir");
  symlinkSync(join(root, ".internal", "data.txt"), join(root, "hidden.txt"));
  symlinkSync(join(root, "public.txt"), join(root, "alias.txt"));
  const server = createGameHttpServer(new GameSessionManager(), undefined, undefined, undefined, { staticRoot: root, securityLog: () => {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const path of ["/outside.txt", "/outside/private.txt", "/hidden.txt"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.equal((await response.text()).includes(marker), false, path);
    }
    for (const path of ["/public.txt", "/alias.txt"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "public asset");
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(fixture, { recursive: true, force: true });
  }
});
