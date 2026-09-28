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
 */
function createHarness(responder) {
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
    }
  });
  return { controller, calls, draws, logs };
}

function fixture(name) {
  return require(`./fixtures/${name}.json`);
}

/** A successful runCli result for the first entry of a fixture file. */
function successFrom(name) {
  return { status: "success", entry: fixture(name)[0] };
}

module.exports = { CID, key, createHarness, fixture, successFrom };
