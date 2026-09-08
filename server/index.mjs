import { createMemeEngine, validateCutout, validateMeme } from "./meme.mjs";
import http from "node:http";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { validateProject, srt } from "./core.mjs";
import { captionSlides, colorFilter } from "../shared/editing.mjs";
import { createAgentApi } from "./agent-api.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "data");
const saved = path.join(root, "saved");
const templates = path.join(saved, "templates");
for (const d of ["media", "exports"])
  await fs.mkdir(path.join(data, d), { recursive: true });
await fs.mkdir(saved, { recursive: true });
await fs.mkdir(templates, { recursive: true });
const assets = new Map();
for (const f of await fs.readdir(path.join(data, "media")))
  if (f.endsWith(".json")) {
    try {
      const a = JSON.parse(
        await fs.readFile(path.join(data, "media", f), "utf8"),
      );
      assets.set(a.id, a);
    } catch {}
  }
const jobs = new Map();
const memeEngine = createMemeEngine({
  root,
  data,
  assets,
  jobs,
  run,
  probe: async (file) => probe(file),
});
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    let out = "",
      err = "";
    const p = spawn(cmd, args);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-6000)));
    p.on("error", reject);
    p.on("close", (c) =>
      c ? reject(Error(err || `${cmd} failed`)) : resolve(out),
    );
  });
}
const probe = async (file) =>
  JSON.parse(
    await run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      file,
    ]),
  );
async function body(req, max = 15e6) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Error("Request too large.");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}
function projectFilename(name) {
  const base =
    String(name || "Untitled reel")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .replace(/[. ]+$/, "") || "Untitled reel";
  return `${base}.reel.json`;
}
function templateFilename(name, kind = "carousel") {
  return projectFilename(name).replace(/\.reel\.json$/, `.${kind}.json`);
}
function templateFile(filename) {
  const decoded = decodeURIComponent(filename);
  if (path.basename(decoded) !== decoded || !/\.(carousel|meme)\.json$/.test(decoded) || decoded.includes("..")) throw Error("Invalid template name");
  return path.join(templates, decoded);
}
function savedFile(filename) {
  const decoded = decodeURIComponent(filename);
  if (
    path.basename(decoded) !== decoded ||
    !decoded.endsWith(".reel.json") ||
    decoded.includes("..")
  )
    throw Error("Invalid saved project name");
  return path.join(saved, decoded);
}
function projectSummary(filename, stat) {
  return {
    filename,
    name: filename.slice(0, -".reel.json".length),
    updatedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}
async function listSavedProjects() {
  const files = (await fs.readdir(saved, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".reel.json"))
    .map(async (entry) => projectSummary(entry.name, await fs.stat(path.join(saved, entry.name))));
  const projects = await Promise.all(files);
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
const readSavedProject = async (filename) => JSON.parse(await fs.readFile(savedFile(filename), "utf8"));
async function writeSavedProject(project) {
  if (!project || project.version !== 1 || typeof project.name !== "string" || !Array.isArray(project.shots) || !project.style)
    throw Error("Invalid Reel Maker project");
  const filename = projectFilename(project.name);
  await fs.writeFile(path.join(saved, filename), JSON.stringify(project, null, 2) + "\n");
  return projectSummary(filename, await fs.stat(path.join(saved, filename)));
}
const agentApi = createAgentApi({ assets, listProjects:listSavedProjects, readProject:readSavedProject, saveProject:writeSavedProject });
async function serve(req, res, file) {
  const st = await fs.stat(file);
  const ext = path.extname(file);
  const type =
    {
      ".mp4": "video/mp4",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".mov": "video/quicktime",
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".srt": "application/x-subrip",
    }[ext] || "application/octet-stream";
  let start = 0,
    end = st.size - 1,
    status = 200;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!m) {
      res.writeHead(416);
      return res.end();
    }
    start = +m[1];
    end = m[2] ? Math.min(+m[2], end) : end;
    if (start > end) {
      res.writeHead(416);
      return res.end();
    }
    status = 206;
  }
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": end - start + 1,
    "Accept-Ranges": "bytes",
    ...(status === 206
      ? { "Content-Range": `bytes ${start}-${end}/${st.size}` }
      : {}),
  });
  createReadStream(file, { start, end }).pipe(res);
}
async function render(id, p, images) {
  const job = jobs.get(id);
  try {
    const duration = validateProject(p, assets);
    const dir = path.join(data, "exports", id);
    await fs.mkdir(dir);
    const [w, h] =
      p.format === "1:1"
        ? [1080, 1080]
        : p.format === "16:9"
          ? [1920, 1080]
          : [1080, 1920];
    for (let i = 0; i < p.shots.length; i++) {
      job.message = `Rendering shot ${i + 1} of ${p.shots.length}`;
      job.progress = Math.round((i / p.shots.length) * 85);
      const s = p.shots[i],
        a = assets.get(s.assetId);
      const args = [
        "-y",
        "-ss",
        String(s.in),
        "-i",
        path.join(data, "media", a.file),
      ];
      let filter = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,${colorFilter(p.color)},setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=0.1[v]`;
      const overlays = Array.isArray(images[i])
        ? images[i]
        : images[i]
          ? [{ start: 0, end: s.out - s.in, image: images[i] }]
          : [];
      if (overlays.length > 100) throw Error("Too many captions in one shot");
      for (let j = 0; j < overlays.length; j++) {
        const cue = overlays[j];
        if (
          !Number.isFinite(cue.start) ||
          !Number.isFinite(cue.end) ||
          cue.start < 0 ||
          cue.end <= cue.start ||
          !/^data:image\/png;base64,/.test(cue.image)
        )
          throw Error("Invalid timed caption");
        const png = path.join(dir, `caption-${i}-${j}.png`);
        await fs.writeFile(png, Buffer.from(cue.image.split(",")[1], "base64"));
        args.push("-i", png);
        filter += `;[${j === 0 ? "v" : `c${j - 1}`}][${j + 1}:v]overlay=0:0:enable='gte(t,${cue.start})*lt(t,${cue.end})'[c${j}]`;
      }
      filter += `;[${overlays.length ? `c${overlays.length - 1}` : "v"}]null[out]`;
      args.push(
        "-filter_complex",
        filter,
        "-map",
        "[out]",
        "-frames:v",
        String(Math.round((s.out - s.in) * 30)),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        path.join(dir, `shot-${i}.mp4`),
      );
      await run("ffmpeg", args);
    }
    job.message = "Mixing audio and finishing MP4";
    await fs.writeFile(
      path.join(dir, "concat.txt"),
      p.shots.map((_, i) => `file 'shot-${i}.mp4'`).join("\n"),
    );
    const args = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      path.join(dir, "concat.txt"),
    ];
    let inputs = 1;
    let voice, music;
    if (p.voiceover) {
      voice = inputs++;
      args.push("-i", path.join(data, "media", assets.get(p.voiceover).file));
    }
    if (p.music) {
      music = inputs++;
      args.push(
        "-stream_loop",
        "-1",
        "-i",
        path.join(data, "media", assets.get(p.music).file),
      );
    }
    args.push("-map", "0:v", "-c:v", "copy");
    const vol = Math.max(0, Math.min(1, Number(p.musicVolume) || 0));
    if (voice && music)
      args.push(
        "-filter_complex",
        `[${voice}:a]apad[v];[${music}:a]volume=${vol}[m];[v][m]amix=inputs=2:duration=longest:normalize=0[a]`,
        "-map",
        "[a]",
      );
    else if (voice) args.push("-map", `${voice}:a`, "-af", "apad");
    else if (music) args.push("-map", `${music}:a`, "-af", `volume=${vol}`);
    args.push(
      "-t",
      String(duration),
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      path.join(dir, "reel.mp4"),
    );
    await run("ffmpeg", args);
    await fs.writeFile(
      path.join(dir, "captions.srt"),
      srt([], captionSlides(p)),
    );
    const result = await probe(path.join(dir, "reel.mp4"));
    if (
      !result.streams.some(
        (s) => s.codec_type === "video" && s.width === w && s.height === h,
      )
    )
      throw Error("Output validation failed");
    job.status = "complete";
    job.progress = 100;
    job.message = "Your reel is ready";
    job.video = `/exports/${id}/reel.mp4`;
    job.srt = `/exports/${id}/captions.srt`;
  } catch (e) {
    job.status = "error";
    job.message = e.message;
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:4318");
    if (
      req.headers.origin &&
      ![
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4318",
        "http://localhost:4318",
      ].includes(req.headers.origin)
    )
      return json(res, { error: "Origin denied" }, 403);
    if (await agentApi(req, res, url, body, json)) return;
    if (req.method === "GET" && url.pathname === "/api/carousel/templates") {
      const files = (await fs.readdir(templates)).filter((f) => f.endsWith(".carousel.json"));
      const items = await Promise.all(files.map(async (file) => ({ file, ...JSON.parse(await fs.readFile(templateFile(file), "utf8")) })));
      return json(res, { items:items.sort((a,b) => a.name.localeCompare(b.name)) });
    }
    if (req.method === "POST" && url.pathname === "/api/carousel/templates") {
      const value = JSON.parse(await body(req));
      if (!value?.name || !value.carousel || !Array.isArray(value.carousel.slides)) throw Error("Template name and carousel settings are required");
      const filename = templateFilename(value.name);
      await fs.writeFile(templateFile(filename), JSON.stringify({ name:String(value.name), carousel:value.carousel }, null, 2) + "\n");
      return json(res, { ok:true, file:filename, name:value.name }, 201);
    }
    if (req.method === "GET" && url.pathname === "/api/meme/templates") {
      const files = (await fs.readdir(templates)).filter((f) => f.endsWith(".meme.json"));
      const items = await Promise.all(files.map(async (file) => ({ file, ...JSON.parse(await fs.readFile(templateFile(file), "utf8")) })));
      return json(res, { items:items.sort((a,b) => a.name.localeCompare(b.name)) });
    }
    if (req.method === "POST" && url.pathname === "/api/meme/templates") {
      const value = JSON.parse(await body(req));
      if (!value?.name || !value.meme) throw Error("Template name and meme settings are required");
      const filename = templateFilename(value.name, "meme");
      await fs.writeFile(templateFile(filename), JSON.stringify({ name:String(value.name), format:value.format || "9:16", meme:value.meme }, null, 2) + "\n");
      return json(res, { ok:true, file:filename, name:value.name }, 201);
    }
    if (req.method === "GET" && url.pathname === "/api/projects") {
      return json(res, await listSavedProjects());
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/projects/")) {
      const filename = url.pathname.slice("/api/projects/".length);
      return json(
        res,
        await readSavedProject(filename),
      );
    }
    if (req.method === "POST" && url.pathname === "/api/projects") {
      return json(res, await writeSavedProject(JSON.parse(await body(req))));
    }
    if (req.method === "GET" && url.pathname === "/api/assets")
      return json(res, [...assets.values()]);
    if (req.method === "POST" && url.pathname === "/api/import") {
      const name = path.basename(url.searchParams.get("name") || "media.mp4");
      const ext = path.extname(name).toLowerCase();
      if (
        ![
          ".mp4",
          ".mov",
          ".webm",
          ".mkv",
          ".mp3",
          ".wav",
          ".m4a",
          ".aac",
          ".ogg",
          ".png",
          ".jpg",
          ".jpeg",
          ".webp",
        ].includes(ext)
      )
        throw Error("Choose a video, audio, or image file.");
      const id = randomUUID(),
        file = id + ext,
        full = path.join(data, "media", file);
      try {
        await fs.writeFile(full, await body(req, 500e6));
        const info = await probe(full),
          v = info.streams.find(
            (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
          ),
          audio = info.streams.find((s) => s.codec_type === "audio");
        if (!v && !audio) throw Error("No readable media stream");
        const a = {
          id,
          name,
          file,
          kind: [".png", ".jpg", ".jpeg", ".webp"].includes(ext)
            ? "image"
            : v
              ? "video"
              : "audio",
          duration: [".png", ".jpg", ".jpeg", ".webp"].includes(ext)
            ? 0
            : Number(info.format.duration),
          width: v?.width,
          height: v?.height,
          url: `/media/${file}`,
        };
        if (
          a.kind !== "image" &&
          (!Number.isFinite(a.duration) || a.duration <= 0)
        )
          throw Error("Cannot determine media duration");
        if (v) {
          await run("ffmpeg", [
            "-y",
            "-ss",
            "0",
            "-i",
            full,
            "-frames:v",
            "1",
            "-vf",
            "scale=480:-2",
            path.join(data, "media", id + ".jpg"),
          ]);
          a.thumbnail = `/media/${id}.jpg`;
        }
        await fs.writeFile(
          path.join(data, "media", id + ".json"),
          JSON.stringify(a),
        );
        assets.set(id, a);
        return json(res, a);
      } catch (e) {
        await fs.rm(full, { force: true });
        throw e;
      }
    }
    if (req.method === "POST" && url.pathname === "/api/cutout") {
      const request = JSON.parse(await body(req));
      validateCutout(request, assets);
      if (
        [...jobs.values()].some(
          (j) => j.kind === "cutout" && j.status === "rendering",
        )
      )
        throw Error("A cutout is already processing. Wait for it to finish.");
      const id = randomUUID();
      jobs.set(id, {
        id,
        kind: "cutout",
        status: "rendering",
        progress: 0,
        message: "Preparing cutout",
      });
      memeEngine.removeBackground(id, request);
      return json(res, { id });
    }
    if (req.method === "POST" && url.pathname === "/api/meme/render") {
      const { project, povImage, extraImage } = JSON.parse(await body(req));
      validateMeme(project, assets);
      const id = randomUUID();
      jobs.set(id, {
        id,
        status: "rendering",
        progress: 0,
        message: "Preparing meme",
      });
      memeEngine.renderMeme(id, project, povImage, extraImage);
      return json(res, { id });
    }
    if (req.method === "POST" && url.pathname === "/api/render") {
      const { project, images = [] } = JSON.parse(await body(req));
      validateProject(project, assets);
      const id = randomUUID();
      jobs.set(id, {
        id,
        status: "rendering",
        progress: 0,
        message: "Preparing render",
      });
      render(id, project, images);
      return json(res, { id });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/"))
      return json(
        res,
        jobs.get(url.pathname.split("/").pop()) || {
          status: "error",
          message: "Render no longer available",
        },
      );
    if (req.method === "GET" && /^\/(media|exports)\//.test(url.pathname)) {
      const target = path.resolve(data, "." + decodeURIComponent(url.pathname));
      if (!target.startsWith(data + path.sep)) throw Error("Invalid path");
      return await serve(req, res, target);
    }
    if (req.method === "GET") {
      const target = path.resolve(
        root,
        "dist",
        "." + decodeURIComponent(url.pathname),
      );
      if (
        !target.startsWith(path.join(root, "dist") + path.sep) &&
        target !== path.join(root, "dist")
      )
        throw Error("Invalid path");
      try {
        return await serve(req, res, target);
      } catch {
        return await serve(req, res, path.join(root, "dist/index.html"));
      }
    }
    json(res, { error: "Not found" }, 404);
  } catch (e) {
    json(res, { error: e.message }, 400);
  }
});
server.listen(4318, "127.0.0.1", () =>
  console.log("Reel Maker engine: http://127.0.0.1:4318"),
);
