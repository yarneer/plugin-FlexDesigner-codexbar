/**
 * Per-provider scheduling (ticket #4): default 120s polling, shared snapshots
 * across keys of one provider, provider switching, polling stops when the
 * last key leaves, config interval changes apply immediately. All on the
 * controller seam with a fake clock.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { key, createHarness, fakeClock, successFrom } = require("./helpers");

const NOW = Date.parse("2026-09-28T11:27:00Z");

function scheduled(responder) {
  const clock = fakeClock(NOW);
  const h = createHarness(responder, { now: clock.now, scheduler: clock.scheduler });
  return { ...h, clock };
}

const settle = () => new Promise(setImmediate);

test("alive polls every 120s by default, one call per tick", async () => {
  const { controller, calls, clock } = scheduled(() => successFrom("codex"));
  controller.onAlive({ keys: [key("k1")] });
  await settle();

  assert.deepEqual(calls, ["codex"]);
  clock.advance(119_999);
  assert.equal(calls.length, 1, "no early poll");
  clock.advance(1);
  assert.equal(calls.length, 2, "poll at exactly 120s");
  await settle();
  clock.advance(120_000);
  assert.equal(calls.length, 3);
  await settle();
});

test("two keys on one provider share every poll", async () => {
  const { controller, calls, clock, draws } = scheduled(() => successFrom("codex"));
  controller.onAlive({ keys: [key("k1"), key("k2")] });
  await settle();
  clock.advance(120_000);
  await settle();

  assert.deepEqual(calls, ["codex", "codex"]); // never one per key
  assert.equal(draws.length, 4); // both keys redrawn per completed query
});

test("different providers poll independently", async () => {
  const { controller, calls, clock } = scheduled((provider) => successFrom(provider));
  controller.onAlive({ keys: [key("k1", "codex"), key("k2", "claude")] });
  await settle();
  clock.advance(120_000);
  await settle();

  assert.deepEqual(calls.sort(), ["claude", "claude", "codex", "codex"]);
});

test("changing the key's provider moves it and refreshes the new provider", async () => {
  const { controller, calls, clock, draws } = scheduled((provider) => successFrom(provider));
  controller.onAlive({ keys: [key("k1", "codex")] });
  await settle();

  // The user edits the key's provider setting and clicks it (plugin.data).
  controller.onKeyClick({ key: key("k1", "claude") });
  await settle();

  assert.deepEqual(calls, ["codex", "claude"]);
  const last = draws[draws.length - 1];
  assert.equal(last.uid, "k1");
  assert.equal(last.view.provider, "claude");

  // The old provider no longer has keys: no further polls for it.
  clock.advance(120_000);
  await settle();
  assert.deepEqual(calls, ["codex", "claude", "claude"]);
});

test("cached snapshot redraws instantly when a key comes back alive", async () => {
  const { controller, clock, draws } = scheduled(() => successFrom("codex"));
  controller.onAlive({ keys: [key("k1")] });
  await settle();
  controller.onDead({ keys: [key("k1")] });

  draws.length = 0;
  controller.onAlive({ keys: [key("k1")] });
  // Synchronous draw from cache, before the refresh completes.
  assert.equal(draws.length, 1);
  assert.equal(draws[0].view.kind, "usage");
  await settle();
  assert.equal(draws.length, 2); // then the fresh query lands
});

test("polling stops when the last key of a provider goes dead", async () => {
  const { controller, calls, clock } = scheduled(() => successFrom("codex"));
  controller.onAlive({ keys: [key("k1"), key("k2")] });
  await settle();

  controller.onDead({ keys: [key("k1")] });
  clock.advance(120_000);
  await settle();
  assert.equal(calls.length, 2); // k2 still drives the poll

  controller.onDead({ keys: [key("k2")] });
  clock.advance(600_000);
  await settle();
  assert.equal(calls.length, 2, "no polling with zero keys");
});

test("config interval change reschedules every active provider", async () => {
  const { controller, calls, clock } = scheduled(() => successFrom("codex"));
  controller.onAlive({ keys: [key("k1")] });
  await settle();

  controller.onConfig({ intervalMs: 30_000 });
  clock.advance(30_000);
  await settle();
  assert.equal(calls.length, 2, "new interval applied from now");

  clock.advance(29_999);
  assert.equal(calls.length, 2);
  clock.advance(1);
  await settle();
  assert.equal(calls.length, 3);
});

test("interval config below one second is ignored", async () => {
  const { controller, calls, clock } = scheduled(() => successFrom("codex"));
  controller.onAlive({ keys: [key("k1")] });
  await settle();

  controller.onConfig({ intervalMs: 5 }); // absurd — keep the default
  clock.advance(120_000);
  await settle();
  assert.equal(calls.length, 2);
});
