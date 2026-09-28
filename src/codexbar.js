/**
 * CodexBar CLI client — the plugin's only data source (see docs/adr/0001).
 *
 * Runs `codexbar usage --provider <id> --json --web-timeout 30` as its own
 * process per provider, with a 45s hard timeout. Every outcome is returned as a
 * typed result; nothing here throws to callers.
 *
 * Observed CodexBar 0.67.0 behaviour this is built on:
 *  - success: exit 0, stdout = [{provider, source, usage, rateWindowLabels, pace, ...}]
 *  - failure: exit 1, stdout = [{provider, source, error: {message, kind, code}}]
 *  - disabled provider: exit 1, error message "No available fetch strategy for <id>."
 */
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SEARCH_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];
const HARD_TIMEOUT_MS = 45_000;
const WEB_TIMEOUT_SECONDS = 30;

/** Reason kinds the rest of the plugin can branch on. */
// "not-found"  — no codexbar binary at any known location
// "not-enabled" — provider disabled in the CodexBar app
// "timeout"     — killed after the hard timeout
// "parse"       — stdout was not usable JSON
// "provider"    — CodexBar itself reported an error for this provider
const NOT_ENABLED_HINT = "No available fetch strategy";

/** Strips anything email-shaped before a message reaches a KeyView or a log. */
function redact(text) {
  return String(text || "").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted]");
}

/**
 * Locates the codexbar executable: explicit override first, then Homebrew
 * paths, then PATH. Returns null when nothing is found.
 */
function locateCodexbar(overridePath) {
  if (overridePath && typeof overridePath === "string" && overridePath.trim()) {
    return overridePath.trim();
  }
  for (const dir of SEARCH_PATHS) {
    const candidate = path.join(dir, "codexbar");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep searching
    }
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "codexbar");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep searching
    }
  }
  return null;
}

/**
 * Queries one provider.
 *
 * @param {object} opts
 * @param {string} opts.provider        provider id, e.g. "codex"
 * @param {string} [opts.pathOverride]  explicit codexbar path from settings
 * @param {number} [opts.timeoutMs]     hard timeout, default 45s
 * @returns {Promise<
 *   | {status: "success", entry: object}
 *   | {status: "failed", reason: {kind: string, message: string}}
 * >}
 */
function runCodexBar({ provider, pathOverride = "", timeoutMs = HARD_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const binary = locateCodexbar(pathOverride);
    if (!binary) {
      resolve({ status: "failed", reason: { kind: "not-found", message: "codexbar not found" } });
      return;
    }

    execFile(
      binary,
      ["usage", "--provider", provider, "--json", "--web-timeout", String(WEB_TIMEOUT_SECONDS)],
      { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        resolve(classify(provider, err, stdout));
      }
    );
  });
}

/** Maps an execFile outcome onto the typed result. */
function classify(provider, err, stdout) {
  const timedOut = Boolean(err && (err.killed || err.signal));

  // CodexBar reports provider-level errors as JSON on stdout with exit 1, so
  // try to parse stdout before looking at the exit code.
  let parsed = null;
  if (typeof stdout === "string" && stdout.trim()) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      // No entries at all: the provider is not reporting anything.
      return {
        status: "failed",
        reason: { kind: "not-enabled", message: `${provider} 未在 CodexBar 中启用` }
      };
    }
    const entry = parsed.find((e) => e && e.provider === provider) || parsed[0];
    if (entry && entry.error) {
      const raw = redact(entry.error.message);
      if (raw.includes(NOT_ENABLED_HINT)) {
        return {
          status: "failed",
          reason: { kind: "not-enabled", message: `${provider} 未在 CodexBar 中启用` }
        };
      }
      return { status: "failed", reason: { kind: "provider", message: raw } };
    }
    if (entry && entry.usage) {
      return { status: "success", entry };
    }
    // A well-formed array without our entry or any usage means the provider
    // is not reporting anything — treat as not enabled.
    return {
      status: "failed",
      reason: { kind: "not-enabled", message: `${provider} 未在 CodexBar 中启用` }
    };
  }

  if (timedOut) {
    return { status: "failed", reason: { kind: "timeout", message: "codexbar timed out" } };
  }
  if (err && err.code === "ENOENT") {
    return { status: "failed", reason: { kind: "not-found", message: "codexbar not found" } };
  }
  return {
    status: "failed",
    reason: { kind: "parse", message: "codexbar returned unusable output" }
  };
}

module.exports = { runCodexBar, locateCodexbar, redact, classify };
