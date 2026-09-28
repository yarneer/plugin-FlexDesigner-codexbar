/**
 * Key controller — the plugin's only test seam.
 *
 * Receives SDK-level events (key shown, key clicked, key hidden), keeps the
 * per-provider state and the key→provider registry, and answers with KeyView
 * objects via the injected `draw`. All dependencies (CLI runner, clock, timers,
 * drawing, logging) are injected, so behaviour is testable without Flexbar,
 * CodexBar or a canvas.
 *
 * KeyView contract (controller → renderer):
 *   usage: {kind:"usage", provider, rows:[{label, remaining, colorRole} ×1-2],
 *           cornerText, stale}
 *   error: {kind:"error", provider, reason:{kind, message}}
 */
const { normaliseSnapshot } = require("./snapshot");
const {
  statusFor,
  formatCountdown,
  windowNameFromMinutes,
  redact
} = require("./format");

function createController(deps = {}) {
  const {
    runCli,
    draw,
    log = { info() {}, warn() {} },
    now = () => Date.now(),
    scheduler = { setTimeout, clearTimeout },
    defaults = {}
  } = deps;

  if (typeof runCli !== "function" || typeof draw !== "function") {
    throw new Error("controller requires runCli and draw");
  }

  const DEFAULT_INTERVAL_MS = defaults.intervalMs || 120_000;
  const MAX_BACKOFF_MS = defaults.maxBackoffMs || 15 * 60_000;
  let intervalMs = DEFAULT_INTERVAL_MS;
  let codexbarPath = "";

  /** provider id → {snapshot, error, failures, inflight, timer, keyUids:Set} */
  const providers = new Map();
  /** key uid → provider id */
  const keys = new Map();

  function providerOf(key) {
    const id = key && key.data && key.data.provider;
    return typeof id === "string" && id ? id : "codex";
  }

  function ensureProvider(id) {
    let state = providers.get(id);
    if (!state) {
      state = {
        snapshot: null,
        error: null,
        failures: 0,
        inflight: null,
        timer: null,
        keyUids: new Set()
      };
      providers.set(id, state);
    }
    return state;
  }

  /** Cancels a provider's pending poll timer (its snapshot stays cached). */
  function stopTimer(id) {
    const state = providers.get(id);
    if (state && state.timer !== null) {
      scheduler.clearTimeout(state.timer);
      state.timer = null;
    }
  }

  /**
   * Schedules the next poll for a provider that still has keys on screen.
   * After failures the interval backs off exponentially (×2^failures) up to
   * 15 minutes; a success restores the configured interval.
   */
  function scheduleNext(id) {
    const state = providers.get(id);
    if (!state) return;
    stopTimer(id);
    if (state.keyUids.size === 0) return;
    const delay = state.failures
      ? Math.min(intervalMs * 2 ** state.failures, MAX_BACKOFF_MS)
      : intervalMs;
    state.timer = scheduler.setTimeout(() => {
      state.timer = null;
      refresh(id);
    }, delay);
  }

  /** Redraws every key showing this provider with the current state. */
  function emit(id) {
    const state = providers.get(id);
    if (!state) return;
    const view = state.snapshot
      ? // A failed refresh keeps the last snapshot on screen, flagged stale.
        buildKeyView(id, state.snapshot, { stale: Boolean(state.error), now: now() })
      : {
          kind: "error",
          provider: id,
          reason: state.error || { kind: "unknown", message: "no data yet" }
        };
    for (const uid of state.keyUids) draw(uid, view);
  }

  /**
   * Queries a provider unless a query is already running (concurrent requests
   * merge into one CLI call), then redraws its keys.
   */
  function refresh(id) {
    const state = ensureProvider(id);
    if (state.inflight) return state.inflight;

    state.inflight = (async () => {
      try {
        const result = await runCli(id);
        if (result.status === "success") {
          state.snapshot = normaliseSnapshot(result.entry);
          state.error = null;
          state.failures = 0;
        } else {
          state.failures += 1;
          state.error = { ...result.reason, message: redact(result.reason.message) };
          log.warn(
            `[codexbar] ${id} refresh failed (${state.failures}): ${state.error.message}`
          );
        }
      } catch (err) {
        // runCli is typed not to throw; this is a belt-and-braces guard so a
        // buggy runner can never kill the event loop.
        state.failures += 1;
        state.error = { kind: "internal", message: redact(err && err.message ? err.message : err) };
        log.warn(`[codexbar] ${id} runner threw: ${state.error.message}`);
      } finally {
        state.inflight = null;
        emit(id);
        scheduleNext(id);
      }
    })();

    return state.inflight;
  }

  /** SDK: key(s) appeared on a device. */
  function onAlive(payload) {
    for (const key of payload.keys || []) {
      const id = providerOf(key);
      keys.set(key.uid, id);
      ensureProvider(id).keyUids.add(key.uid);
      // Show the cached snapshot immediately, then refresh in the background.
      if (providers.get(id).snapshot) emit(id);
    }
    for (const key of payload.keys || []) {
      refresh(providerOf(key));
    }
  }

  /**
   * SDK: a key was clicked (or its settings data round-tripped). A click
   * forces an immediate refresh; if the key's provider setting changed, the
   * key moves to the new provider first.
   */
  function onKeyClick(payload) {
    const key = payload.key;
    if (!key || !keys.has(key.uid)) return;
    const previous = keys.get(key.uid);
    const id = providerOf(key);

    if (id !== previous) {
      keys.set(key.uid, id);
      const old = providers.get(previous);
      if (old) {
        old.keyUids.delete(key.uid);
        if (old.keyUids.size === 0) stopTimer(previous);
      }
      ensureProvider(id).keyUids.add(key.uid);
      const state = providers.get(id);
      if (state.snapshot || state.error) emit(id);
    }

    // A click is the user saying "try again now": cancel any backoff and
    // pending timer, then query immediately (merged into an in-flight query).
    const state = ensureProvider(id);
    state.failures = 0;
    stopTimer(id);
    refresh(id);
  }

  /** SDK: key(s) removed from the device. */
  function onDead(payload) {
    for (const key of payload.keys || []) {
      const id = keys.get(key.uid);
      if (id === undefined) continue;
      keys.delete(key.uid);
      const state = providers.get(id);
      if (!state) continue;
      state.keyUids.delete(key.uid);
      // Last key for this provider gone — stop polling it.
      if (state.keyUids.size === 0) stopTimer(id);
    }
  }

  /** SDK: global config saved. New interval applies to every provider now. */
  function onConfig(payload = {}) {
    if (Number.isFinite(payload.intervalMs) && payload.intervalMs >= 1000) {
      intervalMs = payload.intervalMs;
    }
    if (typeof payload.codexbarPath === "string") {
      codexbarPath = payload.codexbarPath;
    }
    for (const id of providers.keys()) {
      if (providers.get(id).keyUids.size > 0) scheduleNext(id);
    }
    log.info(`[codexbar] config: interval ${intervalMs}ms, path "${codexbarPath || "auto"}"`);
  }

  return { onAlive, onKeyClick, onDead, onConfig };
}

module.exports = { createController, buildKeyView };

/**
 * Snapshot → usage KeyView (pure). Display rule (ADR 0002): windows render as
 * up to two stacked bars, top first. When the two windows include a sub-daily
 * one it goes on top — so claude/codex/GLM/kimi all show "5h bar above weekly
 * bar" even where CodexBar marks the weekly window primary (Kimi); otherwise
 * CodexBar's primary is first. The corner shows the first window's reset
 * countdown, falling back to its name when it has not started. Exported so
 * tooling (sample renders) produces exactly what the controller produces.
 */
function buildKeyView(provider, snapshot, { stale = false, now = Date.now() } = {}) {
  const windows = pickWindows(snapshot);
  const hero = windows.hero;
  const heroName = windowNameFromMinutes(hero.windowMinutes);
  const cornerText = hero.resetsAt ? formatCountdown(hero.resetsAt, now) : heroName;

  // Bar labels: uniform short names derived from window length ("5h"/"7d");
  // when both windows derive the same name (Cursor's equal 30-day windows),
  // fall back to CodexBar's own labels so the bars stay distinguishable.
  const meterName = windows.meter ? windowNameFromMinutes(windows.meter.windowMinutes) : null;
  const clash = windows.meter && heroName && heroName === meterName;
  const rows = [
    barRow(clash ? windows.heroLabel || "1st" : heroName, hero),
    windows.meter
      ? barRow(clash ? windows.meterLabel || "2nd" : meterName, windows.meter)
      : null
  ].filter(Boolean);

  return {
    kind: "usage",
    provider,
    rows,
    cornerText,
    stale: Boolean(stale)
  };
}

/** One bar row: short label + remaining + its own colour tier. */
function barRow(label, window) {
  return {
    label: label || "—",
    remaining: window.remaining,
    colorRole: window.remaining === null ? null : statusFor(window.remaining)
  };
}

/**
 * Orders the windows for display. A sub-daily (< 1440 min) CodexBar secondary
 * beats its primary (Kimi: 5h first over the 7d primary); any other shape
 * keeps CodexBar's primary first.
 */
function pickWindows(snapshot) {
  const primary = snapshot.primary;
  const secondary = snapshot.secondary;
  if (primary && secondary) {
    const pd = primary.windowMinutes;
    const sd = secondary.windowMinutes;
    if (Number.isFinite(pd) && Number.isFinite(sd) && sd < 1440 && sd < pd) {
      return {
        hero: secondary,
        heroLabel: snapshot.labels.secondary,
        meter: primary,
        meterLabel: snapshot.labels.primary
      };
    }
  }
  return {
    hero: primary,
    heroLabel: snapshot.labels.primary,
    meter: secondary || null,
    meterLabel: snapshot.labels.secondary
  };
}
