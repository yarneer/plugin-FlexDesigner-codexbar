/**
 * Renders sample key cards from the real (sanitised) CodexBar fixtures into
 * docs/images/samples/ — a human-verifiable artifact of what the plugin draws.
 * Repeatable: `npm run render:samples`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { renderKeyView } = require("../src/render");
const { normaliseSnapshot } = require("../src/snapshot");
const { statusFor } = require("../src/format");

const NOW = Date.parse("2026-09-28T11:27:00Z");

function usageView(provider, fixtureEntry) {
  const s = normaliseSnapshot(fixtureEntry);
  return {
    kind: "usage",
    provider,
    mainRemaining: s.primary.remaining,
    mainWindowName: s.labels.primary || "",
    cornerText: "2h13m",
    secondary: s.secondary
      ? { label: s.labels.secondary || "2nd", remaining: s.secondary.remaining }
      : null,
    colorRole: s.primary.remaining === null ? null : statusFor(s.primary.remaining),
    stale: false
  };
}

const views = {
  "sample-codex.png": usageView("codex", require("../test/fixtures/codex.json")[0]),
  "sample-claude.png": usageView("claude", require("../test/fixtures/claude.json")[0]),
  "sample-kimi.png": usageView("kimi", require("../test/fixtures/kimi.json")[0]),
  "sample-claude-stale.png": {
    ...usageView("claude", require("../test/fixtures/claude-unused.json")[0]),
    stale: true
  },
  "sample-error.png": {
    kind: "error",
    provider: "openai",
    reason: { kind: "not-enabled", message: "openai 未在 CodexBar 中启用" }
  }
};

const outDir = path.join(import.meta.dirname, "../docs/images/samples");
mkdirSync(outDir, { recursive: true });
for (const [file, view] of Object.entries(views)) {
  const dataUrl = renderKeyView(view, { width: 240 });
  writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`wrote docs/images/samples/${file}`);
}
