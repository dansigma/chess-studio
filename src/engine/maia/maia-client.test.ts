import assert from "node:assert/strict";
import { test } from "node:test";
import { MaiaClient } from "./maia-client.ts";
import type { MaiaPosition, MaiaResponse } from "./protocol.ts";

function workerHarness() {
  const positions: MaiaPosition[] = [];
  let created = 0;
  let terminated = 0;
  const worker = {
    postMessage: (position: MaiaPosition) => positions.push(position),
    terminate: () => { terminated++; },
    onmessage: null as ((event: { data: MaiaResponse }) => void) | null,
  };
  const client = new MaiaClient(() => {
    created++;
    return worker as unknown as Worker;
  });
  return { client, positions, worker, created: () => created, terminated: () => terminated };
}

test("Maia creates one worker on demand and keeps only the latest queued analysis", async () => {
  const { client, positions, worker, created, terminated } = workerHarness();
  const position = { fens: ["current"], elo: 1500 };
  const result = { moves: [] };
  assert.equal(created(), 0);
  const first = client.analyze(position);
  const replaced = client.analyze({ ...position, elo: 1600 });
  const canceled = assert.rejects(replaced, { name: "AbortError" });
  const latest = client.analyze({ ...position, elo: 1700 });

  assert.equal(created(), 1);
  assert.deepEqual(positions, [position]);
  worker.onmessage?.({ data: { result } });
  assert.deepEqual(await first, result);
  await canceled;
  assert.deepEqual(positions.map(({ elo }) => elo), [1500, 1700]);

  const disposed = assert.rejects(latest, { name: "AbortError" });
  client.dispose();
  await disposed;
  assert.equal(terminated(), 1);
});

test("Maia rejects active and queued analysis when the worker reports a failure", async () => {
  const { client, worker, terminated } = workerHarness();
  const position = { fens: ["current"], elo: 1500 };
  const first = assert.rejects(client.analyze(position), /model unavailable/);
  const queued = assert.rejects(client.analyze(position), /model unavailable/);
  worker.onmessage?.({ data: { error: "model unavailable" } });
  await Promise.all([first, queued]);
  assert.equal(terminated(), 1);
});

test("Maia starts a fresh worker for the next analysis after a failure", async () => {
  const { client, worker, created } = workerHarness();
  const position = { fens: ["current"], elo: 1500 };
  const failed = assert.rejects(client.analyze(position), /model unavailable/);
  worker.onmessage?.({ data: { error: "model unavailable" } });
  await failed;
  const retried = client.analyze(position);
  assert.equal(created(), 2);
  worker.onmessage?.({ data: { result: { moves: [] } } });
  assert.deepEqual(await retried, { moves: [] });
});
