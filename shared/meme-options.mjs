export const MEME_MAX_TRIM_SECONDS = 15;

export const memeOptions = {
  freeText: "",
  freeX: 50,
  freeY: 45,
  freeSize: 64,
  freeColor: "#ffffff",
  freeFont: "Arial",
  freeOutline: 4,
  sourceVolume: 1,
  soundtrackId: "",
  soundtrackVolume: 0.25,
  fadeIn: 0,
  fadeOut: 0,
  overlayMode: "cutout",
  layout: "v1",
  boxX: 10,
  boxY: 40,
  boxWidth: 80,
  boxHeight: 50,
};
export function normalizeMeme(m) {
  return { ...memeOptions, ...m };
}
export function maskBox(m, width, height) {
  const v = normalizeMeme(m),
    w = Math.max(2, Math.round((width * v.boxWidth) / 100 / 2) * 2),
    h = Math.max(2, Math.round((height * v.boxHeight) / 100 / 2) * 2);
  return {
    x: Math.min(width - w, Math.max(0, Math.round((width * v.boxX) / 100))),
    y: Math.min(height - h, Math.max(0, Math.round((height * v.boxY) / 100))),
    width: w,
    height: h,
  };
}
export function audioEnvelope(t, duration, fadeIn, fadeOut) {
  return Math.max(
    0,
    Math.min(
      1,
      fadeIn > 0 ? t / Math.min(fadeIn, duration / 2) : 1,
      fadeOut > 0 ? (duration - t) / Math.min(fadeOut, duration / 2) : 1,
    ),
  );
}
