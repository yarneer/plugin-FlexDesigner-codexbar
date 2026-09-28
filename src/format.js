/**
 * Pure formatting helpers shared by the controller (KeyView building) and the
 * renderer (drawing). No I/O, no canvas — safe to use from tests directly.
 */

/** Maps a remaining percentage to a status role. Colour never carries meaning
 *  alone — callers must always draw the number too. */
function statusFor(remainingPercent) {
  if (remainingPercent > 50) return "good";
  if (remainingPercent > 20) return "warning";
  if (remainingPercent > 5) return "serious";
  return "critical";
}

/** Compact reset countdown text: "2h13m", "45m", "3d4h", or "now" once passed. */
function formatCountdown(resetsAtMs, nowMs) {
  const ms = resetsAtMs - nowMs;
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d${hours % 24}h`;
  if (hours >= 1) return `${hours}h${mins % 60}m`;
  return `${mins}m`;
}

/** Derives a short window name from its length: 300 → "5h", 10080 → "7d". */
function windowNameFromMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes >= 1440) return `${Math.round(minutes / 1440)}d`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes)}m`;
}

/**
 * Strips account-identifying data (emails, account-id fields) before any
 * CodexBar-sourced text reaches a KeyView or a log (spec #27).
 */
function redact(text) {
  return String(text || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted]")
    .replace(/(account[_-]?id["']?\s*[:=]\s*["']?)[\w-]+/gi, "$1[redacted]");
}

module.exports = { statusFor, formatCountdown, windowNameFromMinutes, redact };
