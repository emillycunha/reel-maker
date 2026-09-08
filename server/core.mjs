import { colorSettings } from "../shared/editing.mjs";
export function validateProject(p, assets) {
  if (!p || !Array.isArray(p.shots) || !p.shots.length || p.shots.length > 200)
    throw Error("Add between 1 and 200 shots before exporting.");
  if (!["9:16", "1:1", "16:9"].includes(p.format))
    throw Error("Invalid format.");
  for (const s of p.shots) {
    const a = assets.get(s.assetId);
    if (!a || a.kind !== "video")
      throw Error("A video is missing. Import it again.");
    if (
      !Number.isFinite(s.in) ||
      !Number.isFinite(s.out) ||
      s.in < 0 ||
      s.out - s.in < 0.1 ||
      s.out > a.duration + 0.05
    )
      throw Error(
        "Each trim must be within its source clip and at least 0.1 seconds.",
      );
  }
  for (const id of [p.voiceover, p.music].filter(Boolean))
    if (assets.get(id)?.kind !== "audio")
      throw Error("An audio file is missing.");
  const duration = p.shots.reduce((n, s) => n + s.out - s.in, 0);
  if (duration > 600) throw Error("Reels are limited to 10 minutes.");
  if (p.voiceover && assets.get(p.voiceover).duration > duration + 0.15)
    throw Error(
      "The timeline is shorter than the voiceover. Add more footage before exporting.",
    );
  if (p.captions !== undefined) {
    if (!Array.isArray(p.captions) || p.captions.length > 500)
      throw Error("Invalid caption track");
    let previousEnd = 0;
    for (const c of p.captions) {
      if (
        !Number.isFinite(c.start) ||
        !Number.isFinite(c.end) ||
        c.start < previousEnd - 0.001 ||
        c.end <= c.start ||
        c.end > duration + 0.05 ||
        typeof c.text !== "string" ||
        c.text.length > 200
      )
        throw Error(
          "Caption times must be ordered, non-overlapping, and within the reel.",
        );
      previousEnd = c.end;
    }
  }
  colorSettings(p.color);
  return duration;
}
export function srt(shots, captions) {
  let t = 0;
  const stamp = (n) => {
    const ms = Math.round(n * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  if (captions)
    return captions
      .filter((c) => c.text.trim())
      .map(
        (c, i) =>
          `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.trim()}\n`,
      )
      .join("\n");
  let i = 0;
  return shots
    .map((s) => {
      const start = t;
      t += s.out - s.in;
      return s.caption?.trim()
        ? `${++i}\n${stamp(start)} --> ${stamp(t)}\n${s.caption.trim()}\n`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}
