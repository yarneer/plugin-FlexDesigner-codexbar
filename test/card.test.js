/**
 * Full-card KeyView fields (ticket #3): window names, reset countdown, colour
 * tiers, secondary meter — asserted on the controller seam, plus renderer
 * smoke coverage for the new shapes.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { key, createHarness, fakeClock, fixture, successFrom } = require("./helpers");
const { statusFor, formatCountdown, windowNameFromMinutes } = require("../src/format");
const { renderKeyView } = require("../src/render");

// 2026-09-28T11:27:00Z — chosen so claude.json's primary reset (13:40Z) is 2h13m away.
const NOW = Date.parse("2026-09-28T11:27:00Z");

test("formatCountdown: hours+minutes, days+hours, minutes, past", () => {
  assert.equal(formatCountdown(NOW + 133 * 60_000, NOW), "2h13m");
  assert.equal(formatCountdown(NOW + (3 * 24 + 4) * 60 * 60_000, NOW), "3d4h");
  assert.equal(formatCountdown(NOW + 45 * 60_000, NOW), "45m");
  assert.equal(formatCountdown(NOW, NOW), "now");
  assert.equal(formatCountdown(NOW - 5_000, NOW), "now");
});

test("windowNameFromMinutes derives 5h / 7d / 45m and blanks unknowns", () => {
  assert.equal(windowNameFromMinutes(300), "5h");
  assert.equal(windowNameFromMinutes(10080), "7d");
  assert.equal(windowNameFromMinutes(45), "45m");
  assert.equal(windowNameFromMinutes(null), "");
  assert.equal(windowNameFromMinutes(0), "");
});

test("statusFor tiers: >50 good, >20 warning, >5 serious, else critical", () => {
  assert.equal(statusFor(51), "good");
  assert.equal(statusFor(50), "warning");
  assert.equal(statusFor(21), "warning");
  assert.equal(statusFor(20), "serious");
  assert.equal(statusFor(6), "serious");
  assert.equal(statusFor(5), "critical");
  assert.equal(statusFor(0), "critical");
});

test("usage KeyView carries window names, countdown corner and secondary meter", async () => {
  const h = createHarness(() => successFrom("claude"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "claude")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.kind, "usage");
  assert.equal(view.mainWindowName, "Session"); // rateWindowLabels.primary
  assert.equal(view.cornerText, "2h13m"); // primary resetsAt 13:40Z vs NOW
  assert.equal(view.colorRole, "good"); // primary used 8% → 92 left
  assert.deepEqual(view.secondary, { label: "Weekly", remaining: 82 });
  assert.equal(view.stale, false);
});

test("window not started (no resetsAt, Claude at 0%) shows the window name in the corner", async () => {
  const h = createHarness(() => successFrom("claude-unused"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "claude")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.mainRemaining, 100);
  assert.equal(view.cornerText, "Session");
});

test("kimi: hero is the 5-hour window, meter is the 7-day weekly window (ADR 0002)", async () => {
  const h = createHarness(() => successFrom("kimi"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "kimi")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.mainWindowName, "5-hour usage");
  assert.ok(Math.abs(view.mainRemaining - 68.3363) < 1e-9);
  assert.deepEqual(view.secondary, { label: "7-day usage", remaining: 89.7076 });
});

test("hero swap only fires for a sub-daily secondary: zai keeps CodexBar primary", async () => {
  const h = createHarness(() => successFrom("zai"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "zai")] });
  await new Promise(setImmediate);

  // zai: primary = 5-hour (300min), secondary = Weekly (10080min) — no swap.
  const view = h.draws[0].view;
  assert.equal(view.mainWindowName, "5-hour");
  assert.equal(view.secondary.label, "Weekly");
});

test("cursor (equal 30d windows) keeps CodexBar primary as hero", async () => {
  const h = createHarness(() => successFrom("cursor"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "cursor")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.mainWindowName, "Total");
  assert.equal(view.secondary.label, "Cursor");
});

test("missing rateWindowLabels fall back to windowMinutes-derived names", async () => {
  const entry = {
    provider: "codex",
    usage: {
      primary: { usedPercent: 60, windowMinutes: 300, resetsAt: "2026-09-28T12:27:00Z" },
      secondary: { usedPercent: 30, windowMinutes: 10080 }
    }
  };
  const h = createHarness(() => ({ status: "success", entry }), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.mainWindowName, "5h");
  assert.equal(view.cornerText, "1h0m");
  assert.deepEqual(view.secondary, { label: "7d", remaining: 70 });
});

test("provider with a single window renders with secondary null", async () => {
  const entry = {
    provider: "cursor",
    usage: { primary: { usedPercent: 6, windowMinutes: 43200, resetsAt: "2026-10-26T00:00:00Z" } }
  };
  const h = createHarness(() => ({ status: "success", entry }), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "cursor")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.secondary, null);
  assert.equal(view.colorRole, "good"); // 100-6 = 94 remaining
});

test("colour role follows the remaining tier", async () => {
  const make = async (used) => {
    const entry = {
      provider: "codex",
      usage: { primary: { usedPercent: used, windowMinutes: 300 } }
    };
    const h = createHarness(() => ({ status: "success", entry }), { now: () => NOW });
    h.controller.onAlive({ keys: [key("k1")] });
    await new Promise(setImmediate);
    return h.draws[0].view;
  };
  assert.equal((await make(10)).colorRole, "good");
  assert.equal((await make(75)).colorRole, "warning");
  assert.equal((await make(93)).colorRole, "serious");
  assert.equal((await make(99)).colorRole, "critical");
});

function assertPng(dataUrl) {
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  assert.ok(bytes.length > 500);
}

test("renderer smoke: full card variants all produce PNGs", () => {
  const base = {
    kind: "usage",
    provider: "codex",
    mainWindowName: "Session",
    cornerText: "2h13m",
    secondary: { label: "Weekly", remaining: 82 },
    stale: false
  };
  assertPng(renderKeyView({ ...base, mainRemaining: 92, colorRole: "good" }));
  assertPng(renderKeyView({ ...base, mainRemaining: 0, colorRole: "critical" }));
  assertPng(renderKeyView({ ...base, mainRemaining: 100, colorRole: "good", secondary: null }));
  assertPng(renderKeyView({ ...base, mainRemaining: null, colorRole: null, secondary: null }));
  assertPng(renderKeyView({ ...base, mainRemaining: 92, colorRole: "good", stale: true }));
  assertPng(
    renderKeyView(
      { kind: "error", provider: "kimi", reason: { kind: "not-enabled", message: "kimi 未在 CodexBar 中启用" } },
      { width: 180 }
    )
  );
});
