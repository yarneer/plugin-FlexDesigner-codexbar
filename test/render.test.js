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

test("usage view renders a non-empty PNG", () => {
  assertPng(renderKeyView({ kind: "usage", provider: "codex", mainRemaining: 57.5 }));
});

test("usage view with null remaining still renders", () => {
  assertPng(renderKeyView({ kind: "usage", provider: "codex", mainRemaining: null }));
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
  assertPng(renderKeyView({ kind: "usage", provider: "claude", mainRemaining: 0 }, { width: 180 }));
});
