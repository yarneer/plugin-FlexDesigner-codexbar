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
 *   usage: {kind:"usage", provider, mainRemaining, mainWindowName, cornerText,
 *           secondary:{label, remaining}|null, colorRole, stale}
 *   error: {kind:"error", provider, reason:{kind, message}}
 */
const { normaliseSnapshot } = require("./snapshot");
const {
  statusFor,
  formatCountdown,
  windowNameFromMinutes
} = require("./format");

function createController(deps = {}) {
  const {
    runCli,
    draw,
    log = { info() {}, warn() {} },
    now = () => Date.now()
  } = deps;

  if (typeof runCli !== "function" || typeof draw !== "function") {
    throw new Error("controller requires runCli and draw");
  }

  /** provider id → {snapshot, error, inflight, keyUids:Set} */
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
      state = { snapshot: null, error: null, inflight: null, keyUids: new Set() };
      providers.set(id, state);
    }
    return state;
  }

  /** Redraws every key showing this provider with the current state. */
  function emit(id) {
    const state = providers.get(id);
    if (!state) return;
    const view = state.snapshot
      ? buildUsageView(id, state.snapshot)
      : {
          kind: "error",
          provider: id,
          reason: state.error || { kind: "unknown", message: "no data yet" }
        };
    for (const uid of state.keyUids) draw(uid, view);
  }

  /**
   * Snapshot → usage KeyView. The big number is always the window CodexBar
   * marks primary (for Kimi that is the 7-day window); the corner shows the
   * reset countdown, falling back to the window name when the window has not
   * started yet (no reset time).
   */
  function buildUsageView(id, snapshot) {
    const primary = snapshot.primary;
    const mainWindowName =
      snapshot.labels.primary || windowNameFromMinutes(primary.windowMinutes);
    const cornerText = primary.resetsAt
      ? formatCountdown(primary.resetsAt, now())
      : mainWindowName;
    const secondaryWindow = snapshot.secondary;
    return {
      kind: "usage",
      provider: id,
      mainRemaining: primary.remaining,
      mainWindowName,
      cornerText,
      secondary: secondaryWindow
        ? {
            label:
              snapshot.labels.secondary ||
              windowNameFromMinutes(secondaryWindow.windowMinutes) ||
              "2nd",
            remaining: secondaryWindow.remaining
          }
        : null,
      colorRole: primary.remaining === null ? null : statusFor(primary.remaining),
      stale: false
    };
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
        } else {
          state.error = result.reason;
          log.warn(`[codexbar] ${id} refresh failed: ${result.reason.message}`);
        }
      } catch (err) {
        // runCli is typed not to throw; this is a belt-and-braces guard so a
        // buggy runner can never kill the event loop.
        state.error = { kind: "internal", message: redactMessage(err) };
        log.warn(`[codexbar] ${id} runner threw: ${state.error.message}`);
      } finally {
        state.inflight = null;
        emit(id);
      }
    })();

    return state.inflight;
  }

  function redactMessage(err) {
    return String((err && err.message) || err).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted]");
  }

  /** SDK: key(s) appeared on a device. */
  function onAlive(payload) {
    for (const key of payload.keys || []) {
      const id = providerOf(key);
      keys.set(key.uid, id);
      ensureProvider(id).keyUids.add(key.uid);
    }
    for (const key of payload.keys || []) {
      refresh(providerOf(key));
    }
  }

  /** SDK: a key was clicked (or its config data round-tripped). */
  function onKeyClick(payload) {
    const key = payload.key;
    if (!key || !keys.has(key.uid)) return;
    refresh(keys.get(key.uid));
  }

  /** SDK: key(s) removed from the device. */
  function onDead(payload) {
    for (const key of payload.keys || []) {
      const id = keys.get(key.uid);
      if (id === undefined) continue;
      keys.delete(key.uid);
      const state = providers.get(id);
      if (state) state.keyUids.delete(key.uid);
    }
  }

  return { onAlive, onKeyClick, onDead };
}

module.exports = { createController };
