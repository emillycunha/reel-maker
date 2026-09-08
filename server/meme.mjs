import {
  normalizeMeme,
  maskBox,
  MEME_MAX_TRIM_SECONDS,
} from "../shared/meme-options.mjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
export function validateCutout(request, assets) {
  const a = assets.get(request.assetId);
  if (!a || a.kind !== "video" || a.cutout)
    throw Error("Choose an original video for background removal.");
  if (
    !Number.isFinite(request.in) ||
    !Number.isFinite(request.out) ||
    request.in < 0 ||
    request.out > a.duration + 0.01 ||
    request.out - request.in < 0.2 ||
    request.out - request.in > MEME_MAX_TRIM_SECONDS
  )
    throw Error(
      `Choose a trim between 0.2 and ${MEME_MAX_TRIM_SECONDS} seconds within the source video.`,
    );
  if (!["human", "ai", "green"].includes(request.method))
    throw Error("Unknown removal method");
  return a;
}
export function validateMeme(p, assets) {
  const m = normalizeMeme(p.meme),
    b = assets.get(m?.backgroundId),
    source = assets.get(m?.overlayId),
    a = assets.get(m?.cutoutId);
  if (!["9:16", "1:1", "16:9"].includes(p.format))
    throw Error("Invalid format");
  if (!b || b.kind !== "image")
    throw Error("Import and select a background image.");
  if (
    !source ||
    source.kind !== "video" ||
    source.cutout ||
    !Number.isFinite(source.duration) ||
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height)
  )
    throw Error("Import and select an original meme video.");
  if (
    !Number.isFinite(m.in) ||
    !Number.isFinite(m.out) ||
    m.in < 0 ||
    m.out > source.duration + 0.01 ||
    m.out - m.in < 0.2 ||
    m.out - m.in > MEME_MAX_TRIM_SECONDS
  )
    throw Error(
      `Choose a trim between 0.2 and ${MEME_MAX_TRIM_SECONDS} seconds within the meme video.`,
    );
  if (!["cutout", "original"].includes(m.overlayMode))
    throw Error("Invalid meme overlay type");
  if (
    m.overlayMode === "cutout" &&
    (!a?.cutout ||
      a.sourceId !== m.overlayId ||
      Math.abs(a.sourceIn - m.in) > 0.01 ||
      Math.abs(a.sourceOut - m.out) > 0.01)
  )
    throw Error("Remove the video background for the current trim first.");
  for (const [key, min, max] of [
    ["x", 0, 100],
    ["y", 0, 100],
    ["size", 10, 150],
  ])
    if (!Number.isFinite(m[key]) || m[key] < min || m[key] > max)
      throw Error("Invalid overlay placement");
  if (typeof m.text !== "string" || m.text.length > 300)
    throw Error("POV text must be at most 300 characters.");
  if (!["v1", "v2"].includes(m.layout)) throw Error("Invalid meme layout");
  for (const [key, min, max] of [
    ["sourceVolume", 0, 1],
    ["soundtrackVolume", 0, 1],
    ["fadeIn", 0, 2],
    ["fadeOut", 0, 2],
    ["freeX", 0, 100],
    ["freeY", 0, 100],
    ["freeSize", 24, 120],
    ["freeOutline", 0, 10],
    ["boxX", 0, 100],
    ["boxY", 0, 100],
    ["boxWidth", 10, 100],
    ["boxHeight", 10, 100],
  ])
    if (!Number.isFinite(m[key]) || m[key] < min || m[key] > max)
      throw Error(`Invalid ${key}`);
  if (typeof m.freeText !== "string" || m.freeText.length > 300)
    throw Error("Free text must be at most 300 characters");
  if (m.soundtrackId && assets.get(m.soundtrackId)?.kind !== "audio")
    throw Error("Additional audio is missing");
  return m.overlayMode === "original"
    ? Math.round((m.out - m.in) * 30) / 30
    : a.duration;
}
export function createMemeEngine({ root, data, assets, jobs, run, probe }) {
  const save = async (a) => {
    await fs.writeFile(
      path.join(data, "media", a.id + ".json"),
      JSON.stringify(a),
    );
    assets.set(a.id, a);
  };
  async function removeBackground(id, request) {
    const job = jobs.get(id),
      dir = path.join(data, "media", id + "-frames"),
      raw = path.join(data, "media", id + "-raw");
    try {
      const a = validateCutout(request, assets),
        duration = Math.round((request.out - request.in) * 30) / 30;
      await fs.mkdir(raw, { recursive: true });
      await fs.mkdir(dir, { recursive: true });
      job.message = "Extracting frames";
      const filter =
        "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=0.1";
      await run("ffmpeg", [
        "-y",
        "-ss",
        String(request.in),
        "-i",
        path.join(data, "media", a.file),
        "-vf",
        filter,
        "-frames:v",
        String(Math.round(duration * 30)),
        path.join(raw, "frame-%06d.png"),
      ]);
      if (request.method === "green") {
        job.message = "Removing green screen";
        await run("ffmpeg", [
          "-y",
          "-framerate",
          "30",
          "-i",
          path.join(raw, "frame-%06d.png"),
          "-vf",
          "format=rgba,colorkey=0x00FF00:0.25:0.08",
          path.join(dir, "frame-%06d.png"),
        ]);
      } else {
        job.message = "Removing background locally";
        await new Promise((resolve, reject) => {
          const proc = spawn(
            path.join(root, ".venv-rembg/bin/python"),
            [path.join(root, "server/remove-background.py"), raw, dir],
            {
              env: {
                ...process.env,
                U2NET_HOME: path.join(data, "models"),
                REEL_MAKER_BG_MODEL:
                  request.method === "human" ? "u2net_human_seg" : "u2netp",
                OMP_NUM_THREADS: "4",
              },
            },
          );
          let err = "",
            buffer = "";
          proc.stdout.on("data", (chunk) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines)
              try {
                const v = JSON.parse(line);
                job.progress = Math.round((v.frame / v.total) * 90);
                job.message = `Removing background: frame ${v.frame} of ${v.total}`;
              } catch {}
          });
          proc.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
          proc.on("error", () =>
            reject(
              Error(
                "Background-removal engine is not installed. Run npm run setup:meme.",
              ),
            ),
          );
          proc.on("close", (c) =>
            c ? reject(Error(err || "Background removal failed")) : resolve(),
          );
        });
      }
      job.message = "Saving transparent cutout";
      const file = id + ".mov";
      await run("ffmpeg", [
        "-y",
        "-framerate",
        "30",
        "-i",
        path.join(dir, "frame-%06d.png"),
        "-c:v",
        "prores_ks",
        "-profile:v",
        "4",
        "-pix_fmt",
        "yuva444p10le",
        "-an",
        path.join(data, "media", file),
      ]);
      const info = await probe(path.join(data, "media", file)),
        v = info.streams.find((s) => s.codec_type === "video");
      const result = {
        id,
        name: `Cutout — ${a.name}`,
        kind: "video",
        file,
        url: `/media/${file}`,
        thumbnail: `/media/${id}-frames/frame-000001.png`,
        duration,
        width: v.width,
        height: v.height,
        cutout: true,
        framesUrl: `/media/${id}-frames/`,
        frameCount: Math.round(duration * 30),
        sourceId: a.id,
        sourceIn: request.in,
        sourceOut: request.out,
        method: request.method,
      };
      await save(result);
      job.status = "complete";
      job.progress = 100;
      job.message = "Background removed";
      job.asset = result;
    } catch (e) {
      job.status = "error";
      job.message = e.message;
    } finally {
      await fs.rm(raw, { recursive: true, force: true });
    }
  }
  async function renderMeme(id, p, povImage, extraImage) {
    const job = jobs.get(id);
    try {
      const duration = validateMeme(p, assets),
        m = normalizeMeme(p.meme),
        bg = assets.get(m.backgroundId),
        cutout = assets.get(m.cutoutId),
        source = assets.get(m.overlayId),
        overlay = m.overlayMode === "original" ? source : cutout;
      const dir = path.join(data, "exports", id);
      await fs.mkdir(dir);
      const [w, h] =
        p.format === "1:1"
          ? [1080, 1080]
          : p.format === "16:9"
            ? [1920, 1080]
            : [1080, 1920];
      const width = Math.round((w * m.size) / 100 / 2) * 2,
        height = Math.round((width * overlay.height) / overlay.width / 2) * 2;
      const x = Math.round((w * m.x) / 100 - width / 2),
        y = Math.round((h * m.y) / 100 - height / 2);
      const args = [
        "-y",
        "-loop",
        "1",
        "-i",
        path.join(data, "media", bg.file),
      ];
      if (m.overlayMode === "original")
        args.push(
          "-ss",
          String(m.in),
          "-i",
          path.join(data, "media", source.file),
        );
      else args.push("-i", path.join(data, "media", cutout.file));
      let filter = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30[bg];[1:v]scale=${width}:${height},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=0.1[fg]`,
        input = 2;
      if (m.layout === "v2") {
        const box = maskBox(m, w, h);
        filter += `;color=c=black@0.0:s=${w}x${h}:r=30,format=rgba[clear];[clear][fg]overlay=${x}:${y}:shortest=1:format=auto,crop=${box.width}:${box.height}:${box.x}:${box.y}[masked];[bg][masked]overlay=${box.x}:${box.y}:shortest=1[base]`;
      } else filter += `;[bg][fg]overlay=${x}:${y}:shortest=1[base]`;
      let current = "base";
      for (const [name, text, image] of [
        ["free", m.freeText, extraImage],
        ["pov", m.text, povImage],
      ]) {
        if (!text.trim()) continue;
        if (
          typeof image !== "string" ||
          !image.startsWith("data:image/png;base64,")
        )
          throw Error(`${name} text image is missing`);
        const png = path.join(dir, name + ".png");
        await fs.writeFile(png, Buffer.from(image.split(",")[1], "base64"));
        args.push("-i", png);
        filter += `;[${current}][${input++}:v]overlay=0:0[${name}Layer]`;
        current = name + "Layer";
      }
      filter += `;[${current}]null[out]`;
      const tracks = [];
      if (m.keepAudio) {
        const info = await probe(path.join(data, "media", source.file));
        if (info.streams.some((s) => s.codec_type === "audio")) {
          args.push(
            "-ss",
            String(m.in),
            "-i",
            path.join(data, "media", source.file),
          );
          filter += `;[${input++}:a]volume=${m.sourceVolume},apad[sourceAudio]`;
          tracks.push("sourceAudio");
        }
      }
      if (m.soundtrackId) {
        args.push(
          "-stream_loop",
          "-1",
          "-i",
          path.join(data, "media", assets.get(m.soundtrackId).file),
        );
        filter += `;[${input++}:a]volume=${m.soundtrackVolume}[soundtrack]`;
        tracks.push("soundtrack");
      }
      if (tracks.length) {
        filter +=
          ";" +
          tracks.map((t) => `[${t}]`).join("") +
          (tracks.length === 2
            ? "amix=inputs=2:duration=longest:normalize=0:dropout_transition=0"
            : "anull");
        if (m.fadeIn > 0)
          filter += `,afade=t=in:st=0:d=${Math.min(m.fadeIn, duration / 2)}`;
        if (m.fadeOut > 0) {
          const fade = Math.min(m.fadeOut, duration / 2);
          filter += `,afade=t=out:st=${duration - fade}:d=${fade}`;
        }
        filter += `,alimiter=limit=0.95:level=0:latency=1,atrim=duration=${duration}[audioOut]`;
      }
      args.push("-filter_complex", filter, "-map", "[out]");
      if (tracks.length) args.push("-map", "[audioOut]", "-c:a", "aac");
      else args.push("-an");
      args.push(
        "-t",
        String(duration),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        path.join(dir, "meme.mp4"),
      );
      job.message = `Compositing background, ${m.overlayMode === "original" ? "original clip" : "cutout"}, and POV text`;
      job.progress = 25;
      await run("ffmpeg", args);
      const info = await probe(path.join(dir, "meme.mp4"));
      if (
        !info.streams.some(
          (s) => s.codec_type === "video" && s.width === w && s.height === h,
        )
      )
        throw Error("Meme output validation failed");
      await fs.writeFile(
        path.join(dir, "project.reel.json"),
        JSON.stringify(p, null, 2),
      );
      job.status = "complete";
      job.progress = 100;
      job.message = "Meme ready";
      job.video = `/exports/${id}/meme.mp4`;
    } catch (e) {
      job.status = "error";
      job.message = e.message;
    }
  }
  return { removeBackground, renderMeme };
}
