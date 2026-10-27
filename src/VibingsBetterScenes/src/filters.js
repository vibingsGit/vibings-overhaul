// Video filters as CSS (filter + transform) and an SVG colour filter for
// gamma, warmth and the red/green/blue levels. Kept free of React so the
// maths can be tested.

export const VIDEO_DEFAULTS = {
  brightness: 100, contrast: 100, saturation: 100, gamma: 100, hue: 0, warmth: 100,
  red: 100, green: 100, blue: 100, blur: 0, sharpen: 0,
  rotate: 0, zoom: 100, stretch: 100, flipH: false, flipV: false,
};

export const SVG_FILTER_ID = "vbs-video-colour";

export function isDefaultVideo(v) {
  return Object.entries(VIDEO_DEFAULTS).every(([k, d]) => (v?.[k] ?? d) === d);
}

const needsSvg = (v) => v.gamma !== 100 || v.warmth !== 100 || v.red !== 100 || v.green !== 100 || v.blue !== 100 || v.sharpen > 0;

/**
 * { filter, transform } CSS for the video element. fit scales a video
 * turned by 90° so it stays inside the player (player height / width).
 */
export function videoCss(values, fit = 1) {
  const v = { ...VIDEO_DEFAULTS, ...(values || {}) };
  const f = [];
  if (needsSvg(v)) f.push("url(#" + SVG_FILTER_ID + ")");
  if (v.brightness !== 100) f.push("brightness(" + v.brightness / 100 + ")");
  if (v.contrast !== 100) f.push("contrast(" + v.contrast / 100 + ")");
  if (v.saturation !== 100) f.push("saturate(" + v.saturation / 100 + ")");
  if (v.hue) f.push("hue-rotate(" + v.hue + "deg)");
  if (v.blur) f.push("blur(" + v.blur + "px)");
  const t = [];
  if (v.rotate) t.push("rotate(" + v.rotate + "deg)");
  const turned = Math.abs(v.rotate) % 180 === 90 ? fit : 1;
  const sx = (v.zoom / 100) * turned * (v.stretch / 100) * (v.flipH ? -1 : 1);
  const sy = (v.zoom / 100) * turned * (v.flipV ? -1 : 1);
  if (sx !== 1 || sy !== 1) t.push("scale(" + sx + ", " + sy + ")");
  return { filter: f.join(" ") || "none", transform: t.join(" ") || "none" };
}

/**
 * The SVG colour filter: per channel gain (red/green/blue and warmth) and a
 * gamma exponent, then an optional sharpening convolution.
 */
export function svgFilterMarkup(values) {
  const v = { ...VIDEO_DEFAULTS, ...(values || {}) };
  const warm = (v.warmth - 100) / 100; // -1 … 1
  const gain = {
    R: (v.red / 100) * (1 + Math.max(0, warm) * 0.25 - Math.max(0, -warm) * 0.15),
    G: v.green / 100,
    B: (v.blue / 100) * (1 + Math.max(0, -warm) * 0.25 - Math.max(0, warm) * 0.15),
  };
  const exponent = 100 / Math.max(10, v.gamma); // gamma above 100 brightens the mid tones
  const fn = (c) => '<feFunc' + c + ' type="gamma" amplitude="' + gain[c].toFixed(3) + '" exponent="' + exponent.toFixed(3) + '" offset="0"/>';
  const k = (v.sharpen / 100) * 1.5;
  const sharpen = v.sharpen > 0
    ? '<feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 ' + (-k).toFixed(3) + ' 0 ' + (-k).toFixed(3) + ' ' + (1 + 4 * k).toFixed(3) + ' ' + (-k).toFixed(3) + ' 0 ' + (-k).toFixed(3) + ' 0"/>'
    : "";
  return '<filter id="' + SVG_FILTER_ID + '" color-interpolation-filters="sRGB"><feComponentTransfer>' + fn("R") + fn("G") + fn("B") + "</feComponentTransfer>" + sharpen + "</filter>";
}
