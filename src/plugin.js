/**
 * SDK adapter — wires FlexDesigner events to the key controller and the
 * controller's KeyViews to plugin.draw. All behaviour lives in the controller;
 * this file only translates payloads and swallows device-level failures.
 */
const { plugin, logger } = require("@eniac/flexdesigner");
const { createController } = require("./controller");
const { runCodexBar } = require("./codexbar");
const { renderKeyView } = require("./render");

const CID = "com.xli.codexbar.usage";
const DEFAULT_INTERVAL_SECONDS = 120;

/** Latest global config, updated on plugin.config.updated. */
let globalConfig = {};

/** key uid → {serialNumber, key} so draws go to the right device/key. */
const keyRegistry = new Map();

const controller = createController({
  runCli: (provider) =>
    runCodexBar({ provider, pathOverride: globalConfig.codexbarPath || "" }),
  draw: (keyUid, keyView) => {
    const rec = keyRegistry.get(keyUid);
    if (!rec) return;
    const width = rec.key.style && rec.key.style.width;
    const dataUrl = renderKeyView(keyView, { width });
    // plugin.draw rejects while the device is disconnected; an unhandled
    // rejection would take down every key, so swallow and log.
    Promise.resolve(plugin.draw(rec.serialNumber, rec.key, "base64", dataUrl)).catch((err) => {
      logger.warn(`[${keyView.provider}] draw failed: ${err.message}`);
    });
  },
  log: { info: logger.info, warn: logger.warn }
});

function ourKeys(list) {
  return (list || []).filter((key) => key && key.cid === CID);
}

plugin.on("plugin.alive", (payload) => {
  const keys = ourKeys(payload.keys);
  for (const key of keys) keyRegistry.set(key.uid, { serialNumber: payload.serialNumber, key });
  controller.onAlive({ keys });
});

plugin.on("plugin.data", (payload) => {
  const key = payload.data && payload.data.key;
  if (!key || key.cid !== CID) return;
  keyRegistry.set(key.uid, { serialNumber: payload.serialNumber, key });
  controller.onKeyClick({ key });
  return { status: "success" };
});

plugin.on("plugin.dead", (payload) => {
  const keys = ourKeys(payload.keys);
  for (const key of keys) keyRegistry.delete(key.uid);
  controller.onDead({ keys });
});

plugin.on("plugin.config.updated", (payload) => {
  globalConfig = (payload && payload.config) || {};
  const seconds = Number(globalConfig.intervalSeconds);
  controller.onConfig({
    intervalMs:
      Number.isFinite(seconds) && seconds >= 1 ? seconds * 1000 : DEFAULT_INTERVAL_SECONDS * 1000,
    codexbarPath: globalConfig.codexbarPath || ""
  });
});

plugin.start();
logger.info("CodexBar Usage plugin started");
