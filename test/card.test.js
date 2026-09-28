/**
 * Two-bar card KeyView fields (ticket #7 iterations): bar rows for both
 * windows, reset countdown, colour tiers — asserted on the controller seam,
 * plus renderer smoke coverage for the new shapes.
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

test("claude card: 5h bar on top, weekly bar beneath, countdown in the corner", async () => {
  const h = createHarness(() => successFrom("claude"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "claude")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.kind, "usage");
  assert.equal(view.cornerText, "2h13m"); // primary resetsAt 13:40Z vs NOW
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0].label, "5h");
  assert.ok(Math.abs(view.rows[0].remaining - 92) < 1e-9);
  assert.equal(view.rows[0].colorRole, "good");
  assert.equal(view.rows[1].label, "7d");
  assert.equal(view.rows[1].remaining, 82);
  assert.equal(view.rows[1].colorRole, "good");
  assert.equal(view.stale, false);
});

test("window not started (no resetsAt, Claude at 0%): corner shows the hero name", async () => {
  const h = createHarness(() => successFrom("claude-unused"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "claude")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.rows[0].remaining, 100);
  assert.equal(view.cornerText, "5h");
});

test("kimi: 5-hour bar on top, 7-day weekly bar beneath (ADR 0002)", async () => {
  const h = createHarness(() => successFrom("kimi"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "kimi")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.rows[0].label, "5h");
  assert.ok(Math.abs(view.rows[0].remaining - 68.3363) < 1e-9);
  assert.equal(view.rows[1].label, "7d");
  assert.ok(Math.abs(view.rows[1].remaining - 89.7076) < 1e-9);
});

test("zai keeps CodexBar primary order: 5-hour first, weekly second", async () => {
  const h = createHarness(() => successFrom("zai"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "zai")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.rows[0].label, "5h");
  assert.equal(view.rows[0].remaining, 90);
  assert.equal(view.rows[1].label, "7d");
  assert.equal(view.rows[1].remaining, 91);
});

test("cursor (equal 30d windows): CodexBar's own labels keep the bars apart", async () => {
  const h = createHarness(() => successFrom("cursor"), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "cursor")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.deepEqual(
    view.rows.map((r) => r.label),
    ["Total", "Cursor"]
  );
  assert.ok(Math.abs(view.rows[0].remaining - 93.6910) < 1e-3);
});

test("single-window provider renders one row", async () => {
  const entry = {
    provider: "cursor",
    usage: { primary: { usedPercent: 6, windowMinutes: 43200, resetsAt: "2026-10-26T00:00:00Z" } }
  };
  const h = createHarness(() => ({ status: "success", entry }), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1", "cursor")] });
  await new Promise(setImmediate);

  const view = h.draws[0].view;
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0].label, "30d");
  assert.equal(view.rows[0].remaining, 94);
  assert.equal(view.rows[0].colorRole, "good");
});

test("each bar carries its own colour tier", async () => {
  const entry = {
    provider: "codex",
    usage: {
      primary: { usedPercent: 75, windowMinutes: 300 }, // 25 left → warning
      secondary: { usedPercent: 97, windowMinutes: 10080 } // 3 left → critical
    }
  };
  const h = createHarness(() => ({ status: "success", entry }), { now: () => NOW });
  h.controller.onAlive({ keys: [key("k1")] });
  await new Promise(setImmediate);

  const [five, weekly] = h.draws[0].view.rows;
  assert.equal(five.colorRole, "warning");
  assert.equal(weekly.colorRole, "critical");
});

function assertPng(dataUrl) {
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  assert.ok(bytes.length > 500);
}

test("renderer smoke: two-bar variants all produce PNGs", () => {
  const base = {
    kind: "usage",
    provider: "codex",
    cornerText: "2h13m",
    stale: false
  };
  const two = [
    { label: "5h", remaining: 92, colorRole: "good" },
    { label: "7d", remaining: 82, colorRole: "good" }
  ];
  assertPng(renderKeyView({ ...base, rows: two }));
  assertPng(
    renderKeyView({
      ...base,
      rows: [
        { label: "5h", remaining: 0, colorRole: "critical" },
        { label: "7d", remaining: 100, colorRole: "good" }
      ]
    })
  );
  assertPng(renderKeyView({ ...base, rows: [{ label: "30d", remaining: 94, colorRole: "good" }] }));
  assertPng(
    renderKeyView({
      ...base,
      rows: [
        { label: "5h", remaining: null, colorRole: null },
        { label: "7d", remaining: null, colorRole: null }
      ]
    })
  );
  assertPng(renderKeyView({ ...base, rows: two, stale: true }));
  assertPng(
    renderKeyView(
      { kind: "error", provider: "kimi", reason: { kind: "not-enabled", message: "kimi 未在 CodexBar 中启用" } },
      { width: 180 }
    )
  );
});
