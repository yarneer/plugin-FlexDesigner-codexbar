/**
 * Snapshot normalisation (pure). Turns one CodexBar JSON entry into the
 * plugin's Snapshot shape — and nothing else crosses this boundary.
 *
 * Privacy rule (spec #27): identity, account emails/ids, details (balances,
 * charts), pace, tertiary and extraRateWindows are dropped here and must never
 * appear in a Snapshot, KeyView or log.
 */

/**
 * @param {object} entry one element of `codexbar usage --json` output
 * @returns {{
 *   provider: string,
 *   labels: {primary: string|null, secondary: string|null},
 *   primary: {remaining: number|null, windowMinutes: number|null, resetsAt: number|null},
 *   secondary: {remaining: number|null, windowMinutes: number|null, resetsAt: number|null}|null,
 *   updatedAt: number|null
 * }}
 */
function normaliseSnapshot(entry) {
  const usage = entry && typeof entry === "object" ? entry.usage || {} : {};
  const labels = (entry && entry.rateWindowLabels) || {};

  return {
    provider: (entry && entry.provider) || "unknown",
    labels: {
      primary: typeof labels.primary === "string" ? labels.primary : null,
      secondary: typeof labels.secondary === "string" ? labels.secondary : null
    },
    primary: normaliseWindow(usage.primary),
    secondary: usage.secondary ? normaliseWindow(usage.secondary) : null,
    updatedAt: parseTime(usage.updatedAt)
  };
}

/** Window fields only; usedPercent becomes Remaining (clamped 0–100). */
function normaliseWindow(win) {
  const w = win && typeof win === "object" ? win : {};
  const used = Number.isFinite(w.usedPercent) ? w.usedPercent : null;
  return {
    remaining: used === null ? null : clamp(100 - used),
    windowMinutes: Number.isFinite(w.windowMinutes) ? w.windowMinutes : null,
    resetsAt: parseTime(w.resetsAt)
  };
}

function clamp(value) {
  return Math.min(100, Math.max(0, value));
}

/** ISO 8601 → epoch ms, or null when absent/malformed. */
function parseTime(value) {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

module.exports = { normaliseSnapshot };
