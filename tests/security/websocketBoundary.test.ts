// A separate process proves malformed upgrade input cannot take down the game server.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("T17 malformed WebSocket paths are refused and the same server still serves HTTP and valid snapshots", () => {
  const serverModule = new URL("../../server/httpServer.ts", import.meta.url).href;
  const source = `
    import assert from 'node:assert/strict';
    import { once } from 'node:events';
    import { request } from 'node:http';
    import { WebSocket } from 'ws';
    import { createGameHttpServer } from ${JSON.stringify(serverModule)};
    const server = createGameHttpServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    let client;
    try {
      for (const path of ['/api/games/%ZZ/events', '/api/games/%E0%A4/events', '//[']) {
        const status = await new Promise((resolve, reject) => {
          const req = request(base, { path, headers: { Connection: 'Upgrade', Upgrade: 'websocket' } }, (response) => {
            response.resume(); resolve(response.statusCode);
          });
          req.on('error', reject); req.end();
        });
        assert.equal(status, 400, path);
        assert.equal((await fetch(base + '/api/health')).status, 200);
      }
      const { game } = await (await fetch(base + '/api/games', { method: 'POST' })).json();
      client = new WebSocket(base.replace('http:', 'ws:') + '/api/games/' + game.id + '/events');
      const [message] = await once(client, 'message');
      assert.equal(JSON.parse(message.toString()).type, 'snapshot');
      console.log('malformed upgrades refused; HTTP and valid snapshot stream still work');
    } finally {
      client?.terminate(); server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 5_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /valid snapshot stream still work/);
});
