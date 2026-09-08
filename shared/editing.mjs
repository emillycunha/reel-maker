// Shared by preview and export: presentation never overwrites the source transcript.
export function captionSlides(project) {
  const limit = Math.max(
    1,
    Math.min(4, Math.floor(project.style?.maxWords || 4)),
  );
  let offset = 0;
  const cues =
    project.captions ??
    project.shots.map((s) => {
      const start = offset;
      offset += s.out - s.in;
      return { start, end: offset, text: s.caption || "" };
    });
  return cues.flatMap((cue) => {
    const words = cue.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    // Balance groups so five words become 3+2 rather than a flashing one-word tail.
    const count = Math.ceil(words.length / limit);
    const size = Math.ceil(words.length / count);
    const timed =
      Array.isArray(cue.words) &&
      cue.words.length === words.length &&
      cue.words.every(
        (w, i) =>
          Number.isFinite(w.start) &&
          w.start >= cue.start &&
          w.start < cue.end &&
          (i === 0 || w.start >= cue.words[i - 1].start),
      );
    const slides = [];
    for (let i = 0; i < words.length; i += size) {
      const end = Math.min(i + size, words.length);
      const text = words.slice(i, end).join(" ");
      slides.push({
        start:
          i === 0
            ? cue.start
            : timed
              ? cue.words[i].start
              : cue.start + ((cue.end - cue.start) * i) / words.length,
        end:
          end === words.length
            ? cue.end
            : timed
              ? cue.words[end].start
              : cue.start + ((cue.end - cue.start) * end) / words.length,
        text: project.style?.allCaps ? text.toUpperCase() : text,
      });
    }
    return slides;
  });
}
export const neutralColor = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  warmth: 0,
};
export const colorPresets = {
  Original: neutralColor,
  Warm: { brightness: 0.02, contrast: 1.04, saturation: 1.08, warmth: 0.4 },
  Cool: { brightness: 0, contrast: 1.06, saturation: 0.92, warmth: -0.35 },
  Cinematic: {
    brightness: -0.02,
    contrast: 1.16,
    saturation: 0.82,
    warmth: 0.12,
  },
  "Black & white": { brightness: 0, contrast: 1.08, saturation: 0, warmth: 0 },
};
export function colorSettings(color) {
  const ranges = {
    brightness: [-0.2, 0.2],
    contrast: [0.5, 1.5],
    saturation: [0, 2],
    warmth: [-1, 1],
  };
  return Object.fromEntries(
    Object.entries(neutralColor).map(([key, defaultValue]) => {
      const value = color?.[key] ?? defaultValue;
      if (
        !Number.isFinite(value) ||
        value < ranges[key][0] ||
        value > ranges[key][1]
      )
        throw Error(`Invalid color ${key}`);
      return [key, value];
    }),
  );
}
export function colorFilter(color) {
  const c = colorSettings(color);
  if (Object.keys(neutralColor).every((k) => c[k] === neutralColor[k]))
    return "null";
  return `eq=brightness=${c.brightness}:contrast=${c.contrast}:saturation=${c.saturation},colorbalance=rs=${c.warmth * 0.1}:bs=${-c.warmth * 0.1}:rm=${c.warmth * 0.08}:bm=${-c.warmth * 0.08}`;
}
