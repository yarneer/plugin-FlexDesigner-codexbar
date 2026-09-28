/**
 * Renderer: KeyView → PNG data URL sized to the key. Drawing only — no state,
 * no time lookups; everything textual arrives pre-computed in the KeyView.
 */
const { createCanvas } = require("@napi-rs/canvas");

const KEY_HEIGHT = 60;
const DEFAULT_WIDTH = 240;

const INK = {
  surface: "#1a1a19",
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781"
};

function newCanvas(width) {
  const canvas = createCanvas(width, KEY_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = INK.surface;
  ctx.fillRect(0, 0, width, KEY_HEIGHT);
  return { canvas, ctx };
}

/**
 * @param {{kind:"usage", provider:string, mainRemaining:number|null}|{kind:"error", provider:string, reason:{message:string}}} view
 * @param {{width?:number}} [opts]
 * @returns {string} PNG data URL
 */
function renderKeyView(view, opts = {}) {
  return view.kind === "error" ? renderError(view, opts) : renderUsage(view, opts);
}

function renderUsage(view, opts) {
  const width = opts.width || DEFAULT_WIDTH;
  const { canvas, ctx } = newCanvas(width);
  const pad = 8;

  ctx.font = "600 10px sans-serif";
  ctx.fillStyle = INK.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(view.provider).toUpperCase(), pad, pad);

  ctx.textBaseline = "alphabetic";
  ctx.font = "700 26px sans-serif";
  ctx.fillStyle = INK.primary;
  ctx.fillText(heroText(view.mainRemaining), pad, 43);

  return canvas.toDataURL("image/png");
}

function heroText(remaining) {
  return Number.isFinite(remaining) ? `${Math.round(remaining)}%` : "—%";
}

/** A silent key is indistinguishable from a healthy one — always say why. */
function renderError(view, opts) {
  const width = opts.width || DEFAULT_WIDTH;
  const { canvas, ctx } = newCanvas(width);
  const pad = 8;

  ctx.font = "600 10px sans-serif";
  ctx.fillStyle = INK.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(view.provider).toUpperCase(), pad, pad);

  ctx.font = "700 13px sans-serif";
  ctx.fillStyle = "#d03b3b";
  ctx.fillText("— unavailable", pad, 22);

  ctx.font = "400 9px sans-serif";
  ctx.fillStyle = INK.secondary;
  let text = (view.reason && view.reason.message) || "unknown error";
  while (ctx.measureText(text).width > width - pad * 2 && text.length > 4) {
    text = text.slice(0, -2);
  }
  ctx.fillText(text, pad, 42);

  return canvas.toDataURL("image/png");
}

module.exports = { renderKeyView, KEY_HEIGHT, DEFAULT_WIDTH };
