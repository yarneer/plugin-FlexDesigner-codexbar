/**
 * Controller seam tests — the plugin's main test surface (spec #1).
 *
 * Fixtures: claude.json / kimi.json are real CodexBar 0.67.0 outputs captured
 * 2026-09-28 and sanitized; zai.json is the same with account-balance details
 * redacted; codex.json follows the same measured schema with a deliberately
 * planted dummy accountEmail to prove identity data cannot leak.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { key, createHarness, fixture, successFrom } = require("./helpers");

const ANY_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

test("alive queries the key's provider and draws primary Remaining", async () => {
  const h = createHarness(() => successFrom("codex"));
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);

  assert.deepEqual(h.calls, ["codex"]);
  assert.equal(h.draws.length, 1);
  const { uid, view } = h.draws[0];
  assert.equal(uid, "k1");
  assert.equal(view.kind, "usage");
  assert.equal(view.provider, "codex");
  // fixture: primary usedPercent 42.5 → remaining 57.5
  assert.equal(view.mainRemaining, 57.5);
});

test("alive defaults to codex when key data has no provider", async () => {
  const k = { ...key("k1"), data: {} };
  const h = createHarness(() => successFrom("codex"));
  h.controller.onAlive({ keys: [k] });
  await new Promise(setImmediate);
  assert.deepEqual(h.calls, ["codex"]);
});

test("click re-queries and redraws", async () => {
  let n = 0;
  const h = createHarness(() => {
    n += 1;
    return successFrom("codex");
  });
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);
  h.controller.onKeyClick({ key: key("k1") });
  await new Promise(setImmediate);

  assert.equal(n, 2);
  assert.equal(h.draws.length, 2);
});

test("two keys on one provider share a single query and both get drawn", async () => {
  const h = createHarness(() => successFrom("codex"));
  h.controller.onAlive({ keys: [key("k1"), key("k2")] });
  await new Promise(setImmediate);

  assert.deepEqual(h.calls, ["codex"]);
  assert.deepEqual(h.draws.map((d) => d.uid).sort(), ["k1", "k2"]);
  assert.equal(h.draws[0].view.mainRemaining, h.draws[1].view.mainRemaining);
});

test("a click while a query is in flight merges into that query", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const h = createHarness(() => gate.then(() => successFrom("codex")));

  h.controller.onAlive({ keys: [key("k1")] });
  h.controller.onKeyClick({ key: key("k1") });
  release();
  await new Promise(setImmediate);
  await new Promise(setImmediate);

  assert.deepEqual(h.calls, ["codex"]);
  assert.equal(h.draws.length, 1);
});

test("first failure draws an error card with the reason", async () => {
  const h = createHarness(() => ({
    status: "failed",
    reason: { kind: "not-found", message: "codexbar not found" }
  }));
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);

  assert.equal(h.draws.length, 1);
  const view = h.draws[0].view;
  assert.equal(view.kind, "error");
  assert.equal(view.provider, "codex");
  assert.equal(view.reason.message, "codexbar not found");
  assert.match(h.logs.join("\n"), /codexbar not found/);
});

test("a runner that throws degrades to an error card instead of crashing", async () => {
  const h = createHarness(() => {
    throw new Error("boom user@example.com");
  });
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);

  assert.equal(h.draws[0].view.kind, "error");
  assert.ok(!ANY_EMAIL.test(JSON.stringify(h.draws)));
});

test("dead keys stop receiving draws and clicks", async () => {
  const h = createHarness(() => successFrom("codex"));
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);
  h.controller.onDead({ keys: [key("k1")] });

  h.draws.length = 0;
  h.controller.onKeyClick({ key: key("k1") });
  await new Promise(setImmediate);
  assert.equal(h.draws.length, 0);
  assert.deepEqual(h.calls, ["codex"]); // no re-query after dead
});

test("account emails and ids never reach a KeyView or a log", async () => {
  // cursor.json is real captured output carrying accountEmail + accountID;
  // codex.json plants a dummy accountEmail. Both must vanish.
  const h = createHarness((provider) => successFrom(provider));
  h.controller.onAlive({ keys: [key("k1"), key("k2", "cursor")] });
  await new Promise(setImmediate);

  const dump = JSON.stringify({ draws: h.draws, logs: h.logs });
  assert.ok(!ANY_EMAIL.test(dump), "email leaked into controller output");
  assert.ok(!dump.includes("accountEmail"));
  assert.ok(!dump.includes("accountID"));
  assert.ok(!dump.includes("user_XXXX"));
});

test("cursor (real output): Total hero, Cursor meter, tertiary dropped", async () => {
  const h = createHarness(() => successFrom("cursor"));
  h.controller.onAlive({ keys: [key("k1", "cursor")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.mainWindowName, "Total");
  assert.equal(view.secondary.label, "Cursor");
  assert.ok(Math.abs(view.secondary.remaining - 93.3755555555556) < 1e-9);
  const dump = JSON.stringify(view);
  assert.ok(!dump.includes("Third Party"), "tertiary window leaked");
  assert.ok(!dump.includes("accountEmail"));
});

test("kimi keeps its 7-day primary window as the main number", async () => {
  const h = createHarness(() => successFrom("kimi"));
  h.controller.onAlive({ keys: [key("k1", "kimi")] });
  await new Promise(setImmediate);

  // fixture: kimi primary usedPercent 10.2924 on windowMinutes 10080 (7d)
  const view = h.draws[0].view;
  assert.equal(view.kind, "usage");
  assert.ok(Math.abs(view.mainRemaining - 89.7076) < 1e-9);
});

test("missing usedPercent renders a null main value, not a fake number", async () => {
  const entry = { provider: "codex", usage: { primary: { windowMinutes: 300 } } };
  const h = createHarness(() => ({ status: "success", entry }));
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);

  assert.equal(h.draws[0].view.mainRemaining, null);
});
