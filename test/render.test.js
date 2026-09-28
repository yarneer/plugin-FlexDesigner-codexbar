/**
 * Renderer smoke tests only — layout details are covered by the controller
 * seam; here we just require every KeyView shape to produce a real PNG.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { renderKeyView } = require("../src/render");

function assertPng(dataUrl) {
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  assert.ok(bytes.length > 500, `suspiciously small PNG (${bytes.length} bytes)`);
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes[1], 0x50);
}

test("two-bar usage view renders a non-empty PNG", () => {
  assertPng(
    renderKeyView({
      kind: "usage",
      provider: "codex",
      cornerText: "2h13m",
      stale: false,
      rows: [
        { label: "5h", remaining: 57.5, colorRole: "good" },
        { label: "7d", remaining: 83, colorRole: "good" }
      ]
    })
  );
});

test("usage view with null remaining still renders", () => {
  assertPng(
    renderKeyView({
      kind: "usage",
      provider: "codex",
      cornerText: "",
      stale: false,
      rows: [{ label: "5h", remaining: null, colorRole: null }]
    })
  );
});

test("error view renders a non-empty PNG", () => {
  assertPng(
    renderKeyView({
      kind: "error",
      provider: "codex",
      reason: { kind: "not-found", message: "codexbar not found" }
    })
  );
});

test("non-default width renders", () => {
  assertPng(
    renderKeyView(
      {
        kind: "usage",
        provider: "claude",
        cornerText: "45m",
        stale: false,
        rows: [{ label: "5h", remaining: 0, colorRole: "critical" }]
      },
      { width: 180 }
    )
  );
});
