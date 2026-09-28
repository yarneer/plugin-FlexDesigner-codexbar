/**
 * Renderer: KeyView → PNG data URL sized to the key. Drawing only — no state,
 * no time lookups; everything textual arrives pre-computed in the KeyView.
 *
 * The key is a 60px-tall strip: a hero number plus a thin meter, not a chart.
 * Status colour never carries meaning alone — the digits are always drawn.
 */
const { createCanvas, Path2D } = require("@napi-rs/canvas");
const { statusFor } = require("./format");
const { logoFor } = require("./logos");

const KEY_HEIGHT = 60;
const DEFAULT_WIDTH = 240;

// Fixed status palette — reserved for state, never reused as series colours.
const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b"
};

const INK = {
  surface: "#1a1a19",
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
  track: "#3a3a37"
};

function newCanvas(width) {
  const canvas = createCanvas(width, KEY_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = INK.surface;
  ctx.fillRect(0, 0, width, KEY_HEIGHT);
  return { canvas, ctx };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Thin meter with a rounded data end anchored to the track start. */
function meter(ctx, x, y, w, h, remainingPercent, color) {
  ctx.fillStyle = INK.track;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  const filled = Math.max(0, Math.min(100, remainingPercent)) / 100;
  const fw = w * filled;
  if (fw > 0.5) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, fw, h, h / 2);
    ctx.fill();
  }
}

/**
 * Draws the provider's brand logo (12px) at the top-left and returns the x
 * where the label text should start. Providers without a logo get text only.
 */
function drawLogo(ctx, provider, x, y) {
  const logo = logoFor(provider);
  if (!logo) return x;
  const size = 12;
  try {
    const p = new Path2D(logo.path);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = logo.hex;
    ctx.fill(p);
    ctx.restore();
  } catch {
    return x; // malformed path — degrade to text-only header
  }
  return x + size + 4;
}

/**
 * @param {{kind:"usage", provider:string, cornerText:string, stale:boolean,
 *          rows:[{label:string, remaining:number|null, colorRole:string|null}]}|{kind:"error", provider:string, reason:{message:string}}} view
 * @param {{width?:number}} [opts]
 * @returns {string} PNG data URL
 */
function renderKeyView(view, opts = {}) {
  return view.kind === "error" ? renderError(view, opts) : renderUsage(view, opts);
}

/**
 * Two-bar layout: header (logo + provider + reset countdown), then one bar
 * row per window stacked below — e.g. 5-hour on top, weekly beneath. Each row
 * shows its own digits next to its bar, so colour never carries meaning alone.
 */
function renderUsage(view, opts) {
  const width = opts.width || DEFAULT_WIDTH;
  const { canvas, ctx } = newCanvas(width);
  const pad = 8;

  // Header: logo + provider label (left), reset countdown or window name (right).
  ctx.font = "600 10px sans-serif";
  ctx.fillStyle = INK.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const labelX = drawLogo(ctx, view.provider, pad, pad - 1);
  ctx.fillText(String(view.provider).toUpperCase(), labelX, pad);

  if (view.cornerText) {
    ctx.textAlign = "right";
    ctx.fillStyle = view.stale ? STATUS.warning : INK.muted;
    ctx.fillText(
      view.stale ? `${view.cornerText} ·stale` : view.cornerText,
      width - pad,
      pad
    );
  } else if (view.stale) {
    ctx.textAlign = "right";
    ctx.fillStyle = STATUS.warning;
    ctx.fillText("·stale", width - pad, pad);
  }

  // Bar rows. A single window centres vertically; two stack with the first
  // (hero, e.g. 5-hour) on top.
  const rows = (view.rows || []).slice(0, 2);
  const rowH = 17;
  const firstY = rows.length === 2 ? 24 : 30;
  const barX = 36;
  const pctRight = width - pad;
  const barRight = pctRight - 44;

  ctx.textBaseline = "alphabetic";
  rows.forEach((row, i) => {
    const top = firstY + i * rowH;
    const color = (row.colorRole && STATUS[row.colorRole]) || INK.secondary;

    ctx.font = "400 9px sans-serif";
    ctx.fillStyle = INK.muted;
    ctx.textAlign = "left";
    ctx.fillText(row.label, pad, top + 8);

    meter(ctx, barX, top + 3, barRight - barX, 6, row.remaining || 0, color);

    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = (row.colorRole && STATUS[row.colorRole]) || INK.secondary;
    ctx.fillText(pctText(row.remaining), pctRight, top + 10);
  });

  return canvas.toDataURL("image/png");
}

function pctText(remaining) {
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
  const errLabelX = drawLogo(ctx, view.provider, pad, pad - 1);
  ctx.fillText(String(view.provider).toUpperCase(), errLabelX, pad);

  ctx.font = "700 13px sans-serif";
  ctx.fillStyle = STATUS.critical;
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

module.exports = { renderKeyView, KEY_HEIGHT, DEFAULT_WIDTH, STATUS };
