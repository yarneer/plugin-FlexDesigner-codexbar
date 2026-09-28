/**
 * Settings behaviour (ticket #6): refresh interval and codexbar path from the
 * global config page, plus the binary-lookup precedence the path overrides.
 * Interval rescheduling itself is covered in scheduling.test.js.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { key, createHarness, fakeClock, successFrom } = require("./helpers");
const { locateCodexbar } = require("../src/codexbar");

const NOW = Date.parse("2026-09-28T11:27:00Z");
const settle = () => new Promise(setImmediate);

test("path config is stored and reported without touching scheduling", async () => {
  const clock = fakeClock(NOW);
  const h = createHarness(() => successFrom("codex"), {
    now: clock.now,
    scheduler: clock.scheduler
  });
  h.controller.onAlive({ keys: [key("k1")] });
  await settle();

  h.controller.onConfig({ intervalMs: 120_000, codexbarPath: "/custom/codexbar" });
  assert.match(h.logs.join("\n"), /path "\/custom\/codexbar"/);

  // scheduling continues on the configured interval
  clock.advance(120_000);
  await settle();
  assert.equal(h.calls.length, 2);
});

test("empty path config falls back to the auto-detect wording", async () => {
  const h = createHarness(() => successFrom("codex"));
  h.controller.onConfig({ intervalMs: 120_000, codexbarPath: "" });
  assert.match(h.logs.join("\n"), /path "auto"/);
});

test("locateCodexbar: a non-empty override always wins", () => {
  assert.equal(locateCodexbar("/custom/codexbar"), "/custom/codexbar");
  assert.equal(locateCodexbar("  /spaces/trimmed  "), "/spaces/trimmed");
});

test("locateCodexbar: empty override falls back to search paths, then PATH", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-bin-"));
  const fake = path.join(dir, "codexbar");
  fs.writeFileSync(fake, "#!/bin/sh\n");
  fs.chmodSync(fake, 0o755);

  try {
    // PATH search works when the fixed search paths have nothing.
    assert.equal(locateCodexbar("", { searchPaths: [], pathEnv: dir }), fake);
    // Fixed search paths win over PATH.
    assert.equal(
      locateCodexbar("", { searchPaths: [dir], pathEnv: "/nope" }),
      fake
    );
    // Nothing anywhere → null.
    assert.equal(
      locateCodexbar("", { searchPaths: [], pathEnv: "/definitely/not/a/real/dir" }),
      null
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("locateCodexbar: this machine's real auto-detect finds a binary", () => {
  const found = locateCodexbar("");
  assert.ok(found === null || found.endsWith("codexbar"));
});
