/**
 * Failure handling (ticket #5): stale snapshots, first-failure error cards,
 * exponential backoff with a 15-minute cap, click-interrupts-backoff, typed
 * CLI failures, and cross-provider isolation. Plus direct tests of the
 * client's pure classifier (real-process behaviour stays untested by design).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { key, createHarness, fakeClock, fixture, successFrom } = require("./helpers");
const { classify } = require("../src/codexbar");

const NOW = Date.parse("2026-09-28T11:27:00Z");
const ANY_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function scheduled(responder) {
  const clock = fakeClock(NOW);
  const h = createHarness(responder, { now: clock.now, scheduler: clock.scheduler });
  return { ...h, clock };
}

const settle = () => new Promise(setImmediate);

const NOT_FOUND = { status: "failed", reason: { kind: "not-found", message: "codexbar not found" } };
const TIMEOUT = { status: "failed", reason: { kind: "timeout", message: "codexbar timed out" } };

test("refresh failure with an old snapshot keeps the numbers and flags stale", async () => {
  const h = createHarness((_, n) => (n === 1 ? successFrom("codex") : NOT_FOUND));
  h.controller.onAlive({ keys: [key("k1")] });
  await settle();
  h.controller.onKeyClick({ key: key("k1") });
  await settle();

  assert.equal(h.draws.length, 2);
  const stale = h.draws[1].view;
  assert.equal(stale.kind, "usage");
  assert.equal(stale.mainRemaining, h.draws[0].view.mainRemaining, "old value kept");
  assert.equal(stale.stale, true);
  assert.equal(h.draws[0].view.stale, false);
});

test("first failure with no snapshot draws an error card with the reason", async () => {
  const h = createHarness(() => TIMEOUT);
  h.controller.onAlive({ keys: [key("k1")] });
  await settle();

  const view = h.draws[0].view;
  assert.equal(view.kind, "error");
  assert.equal(view.reason.kind, "timeout");
  assert.equal(view.reason.message, "codexbar timed out");
});

test("recovery clears the stale flag and the backoff", async () => {
  const h = createHarness((_, n) => (n === 1 ? NOT_FOUND : successFrom("codex")));
  h.controller.onAlive({ keys: [key("k1")] });
  await settle();
  h.controller.onKeyClick({ key: key("k1") });
  await settle();

  assert.equal(h.draws[1].view.kind, "usage");
  assert.equal(h.draws[1].view.stale, false);
});

test("backoff doubles per consecutive failure and caps at 15 minutes", async () => {
  const { controller, calls, clock } = scheduled(() => NOT_FOUND);
  controller.onAlive({ keys: [key("k1")] });
  await settle(); // failure #1 → next at 120s × 2 = 240s

  clock.advance(120_000);
  await settle();
  assert.equal(calls.length, 1, "240s schedule: nothing at 120s");
  clock.advance(120_000);
  await settle();
  assert.equal(calls.length, 2, "fires at 240s"); // failure #2 → next at 480s

  clock.advance(240_000);
  await settle();
  assert.equal(calls.length, 2, "nothing at 480-240=240s mark");
  clock.advance(240_000);
  await settle();
  assert.equal(calls.length, 3, "fires at 480s"); // failure #3 → next at 960s → capped 900s

  clock.advance(900_000);
  await settle();
  assert.equal(calls.length, 4, "cap: fires at 15 minutes, not 16");
});

test("success after failures restores the normal interval", async () => {
  let n = 0;
  const { controller, calls, clock } = scheduled(() => {
    n += 1;
    return n === 1 ? NOT_FOUND : successFrom("codex");
  });
  controller.onAlive({ keys: [key("k1")] });
  await settle(); // failure #1 → backoff 240s

  controller.onKeyClick({ key: key("k1") }); // click resets and retries now
  await settle(); // success → next at plain 120s
  clock.advance(120_000);
  await settle();
  assert.equal(calls.length, 3);
});

test("click during backoff retries immediately and clears the backoff", async () => {
  const { controller, calls, clock } = scheduled(() => NOT_FOUND);
  controller.onAlive({ keys: [key("k1")] });
  await settle(); // failure #1 → next at 240s

  clock.advance(60_000);
  controller.onKeyClick({ key: key("k1") });
  await settle();
  assert.equal(calls.length, 2, "click during backoff queries immediately");

  // failure #1 again (cleared) → next backoff is 240s again, not 480s
  clock.advance(240_000);
  await settle();
  assert.equal(calls.length, 3);
  clock.advance(240_000);
  await settle();
  assert.equal(calls.length, 3, "did not escalate to 480s");
});

test("one provider failing never delays or corrupts another", async () => {
  const { controller, calls, clock, draws } = scheduled((provider) =>
    provider === "codex" ? NOT_FOUND : successFrom("claude")
  );
  controller.onAlive({ keys: [key("k1"), key("k2", "claude")] });
  await settle();
  clock.advance(120_000);
  await settle();

  assert.deepEqual(calls, ["codex", "claude", "claude"]); // claude polls on time
  const claudeViews = draws.filter((d) => d.uid === "k2").map((d) => d.view);
  assert.ok(claudeViews.every((v) => v.kind === "usage" && !v.stale));
  const codexViews = draws.filter((d) => d.uid === "k1").map((d) => d.view);
  assert.ok(codexViews.every((v) => v.kind === "error"));
});

test("no account data ever reaches a stale or error view or the logs", async () => {
  const poisoned = {
    status: "failed",
    reason: { kind: "provider", message: "auth failed for user@example.com" }
  };
  const h = createHarness((_, n) => (n === 1 ? successFrom("codex") : poisoned));
  h.controller.onAlive({ keys: [key("k1")] });
  await settle();
  h.controller.onKeyClick({ key: key("k1") });
  await settle();

  const dump = JSON.stringify({ draws: h.draws, logs: h.logs });
  assert.ok(!ANY_EMAIL.test(dump), "email leaked");
});

// --- client classifier (pure; real process calls are not auto-tested) ---

test("classify: disabled provider (real output) → not-enabled with the Chinese message", () => {
  const out = JSON.stringify(fixture("errors").disabled);
  const r = classify("openai", { code: 1 }, out);
  assert.equal(r.status, "failed");
  assert.equal(r.reason.kind, "not-enabled");
  assert.equal(r.reason.message, "openai 未在 CodexBar 中启用");
});

test("classify: provider-level network error (real output) → kind provider", () => {
  const out = JSON.stringify(fixture("errors").network);
  const r = classify("codex", { code: 1 }, out);
  assert.equal(r.status, "failed");
  assert.equal(r.reason.kind, "provider");
  assert.match(r.reason.message, /TLS error/);
});

test("classify: missing session (real output) passes the CLI hint through redacted", () => {
  const out = JSON.stringify(fixture("errors").noSession);
  const r = classify("devin", { code: 1 }, out);
  assert.equal(r.reason.kind, "provider");
  assert.match(r.reason.message, /No Devin session found/);
});

test("classify: empty array → not-enabled", () => {
  const r = classify("codex", null, JSON.stringify(fixture("errors").empty));
  assert.equal(r.reason.kind, "not-enabled");
});

test("classify: unparseable output → parse", () => {
  const r = classify("codex", { code: 1 }, fixture("errors").garbage);
  assert.equal(r.reason.kind, "parse");
});

test("classify: ENOENT → not-found", () => {
  const r = classify("codex", { code: "ENOENT" }, "");
  assert.equal(r.reason.kind, "not-found");
  assert.equal(r.reason.message, "codexbar not found");
});

test("classify: killed process → timeout", () => {
  const r = classify("codex", { killed: true, signal: "SIGKILL" }, "");
  assert.equal(r.reason.kind, "timeout");
});

test("classify: success entry passes through", () => {
  const r = classify("codex", null, JSON.stringify(fixture("codex")));
  assert.equal(r.status, "success");
  assert.equal(r.entry.provider, "codex");
});
