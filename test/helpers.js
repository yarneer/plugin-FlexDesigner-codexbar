/**
 * Test harness for the controller seam: a scriptable runCli, a draw recorder
 * and the SDK-shaped key payloads. No Flexbar, no CodexBar, no canvas.
 */
const { createController } = require("../src/controller");

const CID = "com.xli.codexbar.usage";

/** SDK-shaped key object. */
function key(uid, provider = "codex") {
  return { uid, cid: CID, data: { provider, account: "" }, style: { width: 240 } };
}

/**
 * @param {(provider: string) => object|Promise<object>} responder returns a
 *        runCodexBar-style result for each call
 * @param {{now?: () => number, scheduler?: object}} [deps] extra controller deps
 */
function createHarness(responder, deps = {}) {
  const calls = [];
  const draws = [];
  const logs = [];
  const controller = createController({
    runCli: async (provider) => {
      calls.push(provider);
      return responder(provider, calls.length);
    },
    draw: (uid, view) => draws.push({ uid, view }),
    log: {
      info: (msg) => logs.push(`INFO ${msg}`),
      warn: (msg) => logs.push(`WARN ${msg}`)
    },
    ...deps
  });
  return { controller, calls, draws, logs };
}

/** Deterministic fake clock + timer queue: advance(ms) runs due callbacks. */
function fakeClock(startMs = 0) {
  let now = startMs;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    scheduler: {
      setTimeout(fn, ms) {
        const id = nextId++;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      }
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let due = null;
        for (const [id, t] of timers) {
          if (t.at <= target && (!due || t.at < due.t.at)) due = { id, ...t };
        }
        if (!due) break;
        timers.delete(due.id);
        now = due.at;
        due.fn();
      }
      now = target;
    },
    pending() {
      return timers.size;
    }
  };
}

function fixture(name) {
  return require(`./fixtures/${name}.json`);
}

/** A successful runCli result for the first entry of a fixture file. */
function successFrom(name) {
  return { status: "success", entry: fixture(name)[0] };
}

module.exports = { CID, key, createHarness, fakeClock, fixture, successFrom };
