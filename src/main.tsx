import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Film,
  Plus,
  Upload,
  ArrowUpRight,
  Play,
  Pause,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Scissors,
  Copy,
  Trash2,
  Download,
  Check,
  Music2,
  Mic,
  Sparkles,
  SlidersHorizontal,
  Type,
  GripVertical,
  X,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import "./style.css";
import MemeEditor, { type MemeSettings, defaultMeme } from "./MemeEditor";
import AppHeader, { type EditorMode } from "./AppHeader";
import CarouselEditor, { type CarouselSettings, defaultCarousel } from "./CarouselEditor";
import {
  captionSlides,
  colorPresets,
  neutralColor,
  type Grade,
} from "../shared/editing.mjs";
type Asset = {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  duration: number;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
};
type Shot = {
  id: string;
  assetId: string;
  in: number;
  out: number;
  caption: string;
};
type Style = {
  preset: string;
  font: string;
  size: number;
  color: string;
  outline: number;
  shadow: boolean;
  background: boolean;
  position: number;
  allCaps?: boolean;
  horizontalPosition?: number;
  freePlacement?: boolean;
  maxWords?: number;
};
type Project = {
  version: 1;
  mode?: EditorMode;
  meme?: MemeSettings;
  carousel?: CarouselSettings;
  color?: Grade;
  name: string;
  format: string;
  shots: Shot[];
  captions?: { start: number; end: number; text: string }[];
  transcript: string;
  voiceover: string;
  music: string;
  musicVolume: number;
  style: Style;
};
type SavedProject = {
  filename: string;
  name: string;
  updatedAt: string;
  size: number;
};
const initial: Project = {
  version: 1,
  name: "Untitled reel",
  format: "9:16",
  shots: [],
  transcript: "",
  voiceover: "",
  music: "",
  musicVolume: 0.15,
  style: {
    preset: "Essential",
    font: "Arial",
    size: 58,
    color: "#ffffff",
    outline: 4,
    shadow: true,
    background: false,
    position: 76,
  },
};
const uid = () => crypto.randomUUID();
const time = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toFixed(1).padStart(4, "0")}`;
function captionCanvas(text: string, style: Style, format: string) {
  const c = document.createElement("canvas");
  [c.width, c.height] =
    format === "1:1"
      ? [1080, 1080]
      : format === "16:9"
        ? [1920, 1080]
        : [1080, 1920];
  const ctx = c.getContext("2d")!;
  ctx.font = `800 ${style.size}px ${style.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (ctx.measureText(next).width > c.width * 0.8 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const lh = style.size * 1.22;
  const x = (c.width * (style.horizontalPosition ?? 50)) / 100;
  const y = style.freePlacement
    ? (c.height * style.position) / 100
    : Math.min(
        (c.height * style.position) / 100,
        c.height * 0.88 - ((lines.length - 1) * lh) / 2,
      );
  lines.forEach((l, i) => {
    const yy = y + (i - (lines.length - 1) / 2) * lh;
    if (style.background) {
      ctx.fillStyle = "rgba(0,0,0,.72)";
      const w = ctx.measureText(l).width;
      ctx.fillRect(x - w / 2 - 20, yy - lh / 2, w + 40, lh);
    }
    ctx.shadowColor = style.shadow ? "rgba(0,0,0,.8)" : "transparent";
    ctx.shadowBlur = style.shadow ? 8 : 0;
    ctx.shadowOffsetY = style.shadow ? 3 : 0;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = style.outline * 2;
    if (style.outline) ctx.strokeText(l, x, yy);
    ctx.fillStyle = style.color;
    ctx.fillText(l, x, yy);
  });
  return c.toDataURL("image/png");
}
function App() {
  const [p, setP] = useState<Project>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("reel-maker") || "null") || initial
      );
    } catch {
      return initial;
    }
  });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState("Captions");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [modal, setModal] = useState("");
  const [plan, setPlan] = useState("");
  const [job, setJob] = useState<any>(null);
  const [libraryTab, setLibraryTab] = useState("Clips");
  const fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    voice = useRef<HTMLAudioElement>(null),
    music = useRef<HTMLAudioElement>(null);
  const shot = p.shots[selected];
  const asset = assets.find((a) => a.id === shot?.assetId);
  const total = p.shots.reduce((n, s) => n + s.out - s.in, 0);
  const before = p.shots
    .slice(0, selected)
    .reduce((n, s) => n + s.out - s.in, 0);
  const update = (v: Partial<Project>) => {
    setP((old) => ({ ...old, ...v }));
    setJob((current: any) =>
      current?.status === "rendering" ? current : null,
    );
  };
  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then(setAssets)
      .catch(() =>
        setNotice("Cannot reach the local engine. Run npm run dev."),
      );
  }, []);
  const refreshSavedProjects = () =>
    fetch("/api/projects")
      .then((r) => r.json())
      .then((items) => setSavedProjects(Array.isArray(items) ? items : []))
      .catch(() => {});
  useEffect(() => {
    refreshSavedProjects();
  }, []);
  useEffect(() => {
    localStorage.setItem("reel-maker", JSON.stringify(p));
  }, [p]);
  useEffect(() => {
    if (!job || job.status !== "rendering") return;
    const timer = setInterval(
      () =>
        fetch(`/api/jobs/${job.id}`)
          .then((r) => r.json())
          .then(setJob)
          .catch(() => setNotice("Lost connection to render engine.")),
      1000,
    );
    return () => clearInterval(timer);
  }, [job]);
  useEffect(() => {
    if (video.current && shot) {
      video.current.currentTime = shot.in;
      if (playing) video.current.play().catch(() => setPlaying(false));
    }
  }, [selected, shot?.assetId, shot?.in, shot?.out]);
  useEffect(() => {
    for (const el of [voice.current, music.current])
      if (el) {
        if (playing) {
          el.currentTime = before + elapsed;
          el.play().catch(() => {});
        } else el.pause();
      }
    if (music.current) music.current.volume = p.musicVolume;
  }, [playing, selected, p.musicVolume]);
  async function importFiles(files: FileList | null) {
    if (!files) return [];
    const imported: Asset[] = [];
    setBusy("Importing media…");
    try {
      for (const file of Array.from(files)) {
        const r = await fetch(
          "/api/import?name=" + encodeURIComponent(file.name),
          { method: "POST", body: file },
        );
        const a = await r.json();
        if (!r.ok) throw Error(a.error);
        imported.push(a);
        setAssets((old) => [...old, a]);
        if (a.kind === "audio" && !p.voiceover) update({ voiceover: a.id });
      }
      setNotice("Media imported and stored locally.");
      return imported;
    } catch (e) {
      setNotice((e as Error).message);
      return [];
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function add(a: Asset) {
    update({
      shots: [
        ...p.shots,
        {
          id: uid(),
          assetId: a.id,
          in: 0,
          out: Math.min(a.duration, 3),
          caption: "",
        },
      ],
    });
    setSelected(p.shots.length);
  }
  function changeShot(v: Partial<Shot>) {
    update({
      shots: p.shots.map((s, i) => (i === selected ? { ...s, ...v } : s)),
    });
  }
  function move(delta: number) {
    const to = selected + delta;
    if (to < 0 || to >= p.shots.length) return;
    const shots = [...p.shots];
    [shots[selected], shots[to]] = [shots[to], shots[selected]];
    update({ shots });
    setSelected(to);
  }
  function download(name: string, text: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveProject(project = p) {
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "Could not save project.");
      refreshSavedProjects();
      setNotice(`Saved to saved/${result.filename}`);
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    }
  }
  async function openSavedProject(filename: string) {
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(filename)}`),
        q = await r.json();
      if (!r.ok) throw Error(q.error || "Could not open saved project.");
      if (
        q.version !== 1 ||
        !Array.isArray(q.shots) ||
        !q.style ||
        !(q.mode === "carousel" ? q.carousel?.slides?.length : ["9:16", "1:1", "16:9"].includes(q.format))
      )
        throw Error("Not a Reel Maker project");
      setP(q);
      setSelected(0);
      setPlaying(false);
      setNotice(`Opened saved/${filename}`);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function toggle() {
    if (!shot) return;
    if (playing) {
      video.current?.pause();
      setPlaying(false);
    } else {
      if (video.current) {
        if (video.current.currentTime >= shot.out)
          video.current.currentTime = shot.in;
        video.current
          .play()
          .catch(() =>
            setNotice("This media cannot be previewed by your browser."),
          );
      }
      setPlaying(true);
    }
  }
  function applyTranscript() {
    const sentences =
      p.transcript
        .match(/[^.!?\n]+[.!?]?/g)
        ?.map((s) => s.trim())
        .filter(Boolean) || [];
    if (!p.shots.length) {
      setNotice("Add shots to your timeline first.");
      return;
    }
    update({
      shots: p.shots.map((s, i) => ({ ...s, caption: sentences[i] || "" })),
      captions: undefined,
    });
    setNotice(
      "Sentences assigned in order. Review caption timing on each shot.",
    );
  }
  function applyPlan() {
    try {
      const parsed = JSON.parse(plan);
      const entries = Array.isArray(parsed) ? parsed : parsed.shots;
      if (!Array.isArray(entries) || !entries.length)
        throw Error("Provide a JSON array of shots.");
      const shots = entries.map((s: any) => {
        const a = assets.find((a) => a.id === s.assetId || a.name === s.clip);
        if (!a || a.kind !== "video")
          throw Error(`Clip not found: ${s.clip || s.assetId}`);
        if (
          !Number.isFinite(s.in) ||
          !Number.isFinite(s.out) ||
          s.in < 0 ||
          s.out > a.duration ||
          s.out - s.in < 0.1
        )
          throw Error(`Invalid trim for ${a.name}`);
        return {
          id: uid(),
          assetId: a.id,
          in: s.in,
          out: s.out,
          caption: String(s.caption || s.voiceover || ""),
        };
      });
      update({ shots });
      setSelected(0);
      setModal("");
      setNotice("Edit plan applied. Every shot is editable.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const slides = useMemo(
    () => captionSlides(p),
    [p.shots, p.captions, p.style.allCaps, p.style.maxWords],
  );
  const grade = { ...neutralColor, ...p.color };
  async function render() {
    setBusy("Preparing captions…");
    try {
      let offset = 0;
      const images = p.shots.map((s) => {
        const start = offset;
        offset += s.out - s.in;
        return slides
          .filter((c) => c.start < offset && c.end > start)
          .map((c) => ({
            start: Math.max(0, c.start - start),
            end: Math.min(offset - start, c.end - start),
            image: captionCanvas(c.text, p.style, p.format),
          }));
      });
      const r = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: p, images }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      setJob({
        ...j,
        status: "rendering",
        progress: 0,
        message: "Preparing render",
      });
      setModal("export");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const activeCaption =
    slides.find((c) => c.start <= before + elapsed && c.end > before + elapsed)
      ?.text || "";
  const captionPreview = useMemo(
    () =>
      activeCaption ? captionCanvas(activeCaption, p.style, p.format) : "",
    [activeCaption, p.style, p.format],
  );
  const warnings = [
    ...(p.shots.length ? [] : ["Add at least one shot."]),
    ...(p.voiceover &&
    (assets.find((a) => a.id === p.voiceover)?.duration || 0) > total + 0.15
      ? ["Timeline is shorter than the voiceover."]
      : []),
    ...(p.shots.some((s) => !assets.find((a) => a.id === s.assetId))
      ? ["Some source media is missing."]
      : []),
  ];
  if (p.mode === "meme")
    return (
      <MemeEditor
        project={p}
        assets={assets}
        savedProjects={savedProjects}
        onChange={update}
        onAssets={(a) =>
          setAssets((old) => [...old.filter((x) => x.id !== a.id), a])
        }
        onImport={importFiles}
        onOpen={(q) => {
          setP(q);
          setSelected(0);
          setPlaying(false);
        }}
        onOpenSaved={openSavedProject}
        onSave={saveProject}
        renderText={captionCanvas}
        notice={notice}
        busy={busy}
      />
    );
  if (p.mode === "carousel")
    return (
      <CarouselEditor
        project={p}
        assets={assets}
        savedProjects={savedProjects}
        onChange={update}
        onImport={importFiles}
        onOpen={(q) => { setP(q); setSelected(0); setPlaying(false); }}
        onOpenSaved={openSavedProject}
        onSave={saveProject}
      />
    );
  return (
    <div className="app">
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="video/*,audio/*,image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => importFiles(e.target.files)}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json"
        hidden
        onChange={async (e) => {
          try {
            const file = e.target.files?.[0];
            if (!file) return;
            const q = JSON.parse(await file.text());
            if (
              q.version !== 1 ||
              !Array.isArray(q.shots) ||
              !q.style ||
              !(q.mode === "carousel" ? q.carousel?.slides?.length : ["9:16", "1:1", "16:9"].includes(q.format))
            )
              throw Error("Not a Reel Maker project");
            setP(q);
            setSelected(0);
            setPlaying(false);
            setNotice("Project opened. Media is linked to this local library.");
          } catch (err) {
            setNotice((err as Error).message);
          }
          e.target.value = "";
        }}
      />
      <AppHeader name={p.name} mode="reel" onName={(name) => update({name})}
        onMode={(mode) => { setPlaying(false); update({ mode, meme: p.meme || {...defaultMeme}, carousel: p.carousel || {...defaultCarousel} }); }}
        onOpen={() => setModal("projects")} onSave={() => saveProject()}
        onExport={() => setModal("export")} exportLabel="Export reel" />
      <main>
        <aside className="library">
          <div className="section-title">
            <h2>
              Media library <span>{assets.length}</span>
            </h2>
            <button
              className="icon"
              title="Import media"
              onClick={() => fileInput.current?.click()}
            >
              <Plus size={19} />
            </button>
          </div>
          <div className="tabs">
            {["Clips", "Audio"].map((t) => (
              <button
                className={libraryTab === t ? "active" : ""}
                onClick={() => setLibraryTab(t)}
                key={t}
              >
                {t === "Clips" ? <Film size={15} /> : <Music2 size={15} />} {t}{" "}
                <small>
                  {
                    assets.filter(
                      (a) => a.kind === (t === "Clips" ? "video" : "audio"),
                    ).length
                  }
                </small>
              </button>
            ))}
          </div>
          <button
            className="dropzone"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              importFiles(e.dataTransfer.files);
            }}
          >
            <div className="upload-icon">
              <Upload size={20} />
            </div>
            <strong>
              Drop your {libraryTab === "Clips" ? "clips" : "audio"} here
            </strong>
            <span>
              or <em>browse files</em> to import
            </span>
            <small>MP4, MOV, WebM, MP3, WAV · up to 500 MB</small>
          </button>
          <div className="asset-grid">
            {assets
              .filter(
                (a) => a.kind === (libraryTab === "Clips" ? "video" : "audio"),
              )
              .map((a) => (
                <button
                  className="asset"
                  key={a.id}
                  title={
                    a.kind === "video" ? "Add to timeline" : "Use as voiceover"
                  }
                  onClick={() =>
                    a.kind === "video" ? add(a) : update({ voiceover: a.id })
                  }
                >
                  <div className="thumb">
                    {a.thumbnail ? (
                      <img src={a.thumbnail} />
                    ) : (
                      <Mic size={26} />
                    )}
                    <span>{time(a.duration)}</span>
                    <i>
                      <Plus size={14} />
                    </i>
                  </div>
                  <strong>{a.name}</strong>
                  <small>
                    {a.kind === "video"
                      ? `${a.width} × ${a.height}`
                      : "Audio file"}{" "}
                    {p.shots.some((s) => s.assetId === a.id) &&
                      " · In timeline"}
                  </small>
                </button>
              ))}
          </div>
          {!assets.length && (
            <div className="library-empty">
              <Film size={25} />
              <p>
                A good reel starts
                <br />
                with a few great clips.
              </p>
            </div>
          )}
        </aside>
        <section className="editor">
          <div className="preview-heading">
            <select
              aria-label="Aspect ratio"
              value={p.format}
              onChange={(e) => update({ format: e.target.value })}
            >
              <option>9:16</option>
              <option>1:1</option>
              <option>16:9</option>
            </select>
          </div>
          <div className="preview-stage">
            <div
              className="video-frame"
              style={{ aspectRatio: p.format.replace(":", "/") }}
            >
              {asset ? (
                <video
                  key={asset.url}
                  ref={video}
                  style={{
                    filter: `brightness(${1 + grade.brightness}) contrast(${grade.contrast}) saturate(${grade.saturation}) sepia(${Math.abs(grade.warmth) * 0.25}) hue-rotate(${grade.warmth < 0 ? 180 : 0}deg)`,
                  }}
                  src={asset.url}
                  muted
                  playsInline
                  onLoadedMetadata={() => {
                    if (video.current && shot)
                      video.current.currentTime = shot.in;
                  }}
                  onTimeUpdate={() => {
                    const v = video.current;
                    if (!v || !shot) return;
                    setElapsed(Math.max(0, v.currentTime - shot.in));
                    if (playing && v.currentTime >= shot.out) {
                      if (selected < p.shots.length - 1) {
                        setSelected(selected + 1);
                        setElapsed(0);
                      } else {
                        v.pause();
                        setPlaying(false);
                        setElapsed(shot.out - shot.in);
                      }
                    }
                  }}
                  onEnded={() => {
                    if (playing && selected < p.shots.length - 1) {
                      setSelected(selected + 1);
                      setElapsed(0);
                    } else setPlaying(false);
                  }}
                />
              ) : (
                <div className="preview-empty">
                  <div className="empty-frame">
                    <Film size={32} />
                  </div>
                  <h3>
                    Make something
                    <br />
                    worth watching.
                  </h3>
                  <p>
                    Import your clips, add your voice.
                    <br />
                    Your next story starts here.
                  </p>
                  <button onClick={() => fileInput.current?.click()}>
                    <Plus size={15} /> Import media
                  </button>
                </div>
              )}
              {activeCaption && (
                <img
                  className="caption-overlay"
                  src={captionPreview}
                  alt={activeCaption}
                />
              )}
              <span className="safe-tag">
                {asset ? "PREVIEW" : "YOUR CANVAS"}
              </span>
            </div>
          </div>
          <div className="player-controls">
            <span>
              {time(before + elapsed)} <b>/ {time(total)}</b>
            </span>
            <div>
              <button
                className="icon"
                title="Previous shot"
                onClick={() => {
                  setSelected(Math.max(0, selected - 1));
                  setElapsed(0);
                }}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="play"
                aria-label={playing ? "Pause" : "Play"}
                disabled={!shot}
                onClick={toggle}
              >
                {playing ? (
                  <Pause size={17} />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
              </button>
              <button
                className="icon"
                title="Next shot"
                onClick={() => {
                  setSelected(Math.min(p.shots.length - 1, selected + 1));
                  setElapsed(0);
                }}
                disabled={!shot}
              >
                <ChevronRight size={19} />
              </button>
            </div>
            <span className="preview-quality">
              FIT <ChevronDown size={12} />
            </span>
          </div>
          <div className="timeline">
            <div className="section-title">
              <h2>
                Timeline <span>{p.shots.length} shots</span>
              </h2>
              <button className="ai-button" onClick={() => setModal("match")}>
                <Sparkles size={15} /> Auto Match
              </button>
            </div>
            <div className="ruler">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i}>{time(i * (total ? total / 5 : 3))}</span>
              ))}
            </div>
            <div className="shot-track">
              {p.shots.map((s, i) => {
                const a = assets.find((a) => a.id === s.assetId);
                return (
                  <button
                    key={s.id}
                    className={
                      "timeline-shot " + (i === selected ? "selected" : "")
                    }
                    onClick={() => {
                      setPlaying(false);
                      video.current?.pause();
                      setSelected(i);
                      setElapsed(0);
                    }}
                  >
                    <img src={a?.thumbnail} />
                    <span>
                      {String(i + 1).padStart(2, "0")}{" "}
                      <small>{(s.out - s.in).toFixed(1)}s</small>
                    </span>
                  </button>
                );
              })}
              <button
                className="add-shot"
                onClick={() => fileInput.current?.click()}
              >
                <Plus size={20} />
                <span>
                  {p.shots.length
                    ? "Add media"
                    : "Add clips from your library to start editing"}
                </span>
              </button>
            </div>
            <div className="audio-track">
              <Mic size={14} />
              <select
                aria-label="Voiceover"
                value={p.voiceover}
                onChange={(e) => update({ voiceover: e.target.value })}
              >
                <option value="">Add a voiceover to tell your story</option>
                {assets
                  .filter((a) => a.kind === "audio")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <button
                className="icon"
                title="Import audio"
                onClick={() => {
                  setLibraryTab("Audio");
                  fileInput.current?.click();
                }}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
        </section>
        <aside className="inspector">
          <div className="inspector-tabs">
            {["Captions", "Shot", "Audio", "Color"].map((t) => (
              <button
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
                key={t}
              >
                {t === "Captions" ? (
                  <Type size={16} />
                ) : t === "Shot" || t === "Color" ? (
                  <SlidersHorizontal size={16} />
                ) : (
                  <Music2 size={16} />
                )}{" "}
                {t}
              </button>
            ))}
          </div>
          <div className="inspector-body">
            {tab === "Captions" ? (
              <>
                <div className="section-title">
                  <h2>Make every word count</h2>
                  <span className="tiny-label">STYLE</span>
                </div>
                <label className="toggle-label">
                  ALL CAPS
                  <input
                    type="checkbox"
                    checked={p.style.allCaps ?? false}
                    onChange={(e) =>
                      update({
                        style: { ...p.style, allCaps: e.target.checked },
                      })
                    }
                  />
                </label>
                <label>
                  Maximum words per slide
                  <select
                    value={p.style.maxWords ?? 4}
                    onChange={(e) =>
                      update({
                        style: { ...p.style, maxWords: +e.target.value },
                      })
                    }
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "word" : "words"}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="hint">
                  {slides.length} caption slides. Longer phrases split
                  automatically; original text is preserved.
                </p>
                <div className="presets">
                  {["Essential", "Spotlight", "Boxed"].map((v, i) => (
                    <button
                      key={v}
                      className={p.style.preset === v ? "selected" : ""}
                      onClick={() =>
                        update({
                          style: {
                            ...p.style,
                            preset: v,
                            color: i === 1 ? "#dcfa8b" : "#ffffff",
                            background: i === 2,
                            outline: i === 2 ? 0 : 4,
                          },
                        })
                      }
                    >
                      <span className={"preset-sample preset-" + i}>Aa</span>
                      <small>{v}</small>
                    </button>
                  ))}
                </div>
                <label>
                  Font family
                  <select
                    value={p.style.font}
                    onChange={(e) =>
                      update({ style: { ...p.style, font: e.target.value } })
                    }
                  >
                    {[
                      "Arial",
                      "Helvetica",
                      "Georgia",
                      "Verdana",
                      "Trebuchet MS",
                    ].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <div className="two-cols">
                  <label>
                    Size{" "}
                    <div className="unit-input">
                      <input
                        type="number"
                        min="24"
                        max="120"
                        value={p.style.size}
                        onChange={(e) =>
                          update({
                            style: {
                              ...p.style,
                              size: Math.max(
                                24,
                                Math.min(120, +e.target.value),
                              ),
                            },
                          })
                        }
                      />
                      <span>px</span>
                    </div>
                  </label>
                  <label>
                    Text color{" "}
                    <div className="color-input">
                      <input
                        aria-label="Text color"
                        type="color"
                        value={p.style.color}
                        onChange={(e) =>
                          update({
                            style: { ...p.style, color: e.target.value },
                          })
                        }
                      />
                      <span>{p.style.color.toUpperCase()}</span>
                    </div>
                  </label>
                </div>
                <label className="range-label">
                  Outline <span>{p.style.outline} px</span>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={p.style.outline}
                    onChange={(e) =>
                      update({
                        style: { ...p.style, outline: +e.target.value },
                      })
                    }
                  />
                </label>
                {[
                  ["shadow", "Drop shadow"],
                  ["background", "Background box"],
                ].map(([key, label]) => (
                  <label className="toggle-label" key={key}>
                    {label}
                    <input
                      type="checkbox"
                      checked={p.style[key as "shadow" | "background"]}
                      onChange={(e) =>
                        update({
                          style: { ...p.style, [key]: e.target.checked },
                        })
                      }
                    />
                  </label>
                ))}
                <label className="range-label">
                  Vertical position <span>{p.style.position}%</span>
                  <input
                    type="range"
                    min="15"
                    max="85"
                    value={p.style.position}
                    onChange={(e) =>
                      update({
                        style: { ...p.style, position: +e.target.value },
                      })
                    }
                  />
                </label>
                <div className="divider" />
                {p.captions && (
                  <>
                    <h2>Caption phrases</h2>
                    <p className="hint">
                      Times are seconds from the start of the voiceover. These
                      captions stay with the audio when you rearrange shots.
                    </p>
                    {p.captions.map((cue, index) => (
                      <div key={index} className="timed-cue">
                        <textarea
                          aria-label={`Caption ${index + 1}`}
                          rows={2}
                          value={cue.text}
                          onChange={(e) =>
                            update({
                              captions: p.captions!.map((c, i) =>
                                i === index
                                  ? { ...c, text: e.target.value }
                                  : c,
                              ),
                            })
                          }
                        />
                        <div className="two-cols">
                          <label>
                            Start
                            <input
                              type="number"
                              step="0.01"
                              value={cue.start}
                              onChange={(e) =>
                                update({
                                  captions: p.captions!.map((c, i) =>
                                    i === index
                                      ? { ...c, start: +e.target.value }
                                      : c,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            End
                            <input
                              type="number"
                              step="0.01"
                              value={cue.end}
                              onChange={(e) =>
                                update({
                                  captions: p.captions!.map((c, i) =>
                                    i === index
                                      ? { ...c, end: +e.target.value }
                                      : c,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    <div className="divider" />
                  </>
                )}
                <div className="section-title">
                  <h2>Transcript</h2>
                  <span className="tiny-label">MANUAL</span>
                </div>
                <textarea
                  rows={4}
                  placeholder="Paste your voiceover transcript here…"
                  value={p.transcript}
                  onChange={(e) => update({ transcript: e.target.value })}
                />
                <button className="wide secondary" onClick={applyTranscript}>
                  Assign sentences to shots
                </button>
              </>
            ) : tab === "Shot" ? (
              <>
                <h2>{shot ? `Shot ${selected + 1}` : "Select a shot"}</h2>
                <p className="muted">Fine-tune the moment.</p>
                {shot && (
                  <>
                    <label>
                      Source clip
                      <select
                        value={shot.assetId}
                        onChange={(e) => {
                          const a = assets.find(
                            (a) => a.id === e.target.value,
                          )!;
                          changeShot({
                            assetId: a.id,
                            in: 0,
                            out: Math.min(3, a.duration),
                          });
                        }}
                      >
                        {assets
                          .filter((a) => a.kind === "video")
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="two-cols">
                      <label>
                        In (seconds)
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max={shot.out - 0.1}
                          value={shot.in}
                          onChange={(e) =>
                            changeShot({
                              in: Math.max(
                                0,
                                Math.min(shot.out - 0.1, +e.target.value),
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Out (seconds)
                        <input
                          type="number"
                          step="0.1"
                          min={shot.in + 0.1}
                          max={asset?.duration}
                          value={shot.out}
                          onChange={(e) =>
                            changeShot({
                              out: Math.min(
                                asset?.duration || 999,
                                Math.max(shot.in + 0.1, +e.target.value),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Caption
                      <textarea
                        rows={4}
                        value={shot.caption}
                        onChange={(e) =>
                          changeShot({ caption: e.target.value })
                        }
                      />
                    </label>
                    <div className="two-cols">
                      <button
                        className="secondary"
                        onClick={() => move(-1)}
                        disabled={selected === 0}
                      >
                        <ChevronLeft size={14} /> Earlier
                      </button>
                      <button
                        className="secondary"
                        onClick={() => move(1)}
                        disabled={selected === p.shots.length - 1}
                      >
                        Later <ChevronRight size={14} />
                      </button>
                    </div>
                    <button
                      className="wide secondary"
                      onClick={() => {
                        const shots = [...p.shots];
                        shots.splice(selected + 1, 0, { ...shot, id: uid() });
                        update({ shots });
                        setSelected(selected + 1);
                      }}
                    >
                      <Copy size={14} /> Duplicate shot
                    </button>
                    <button
                      className="wide danger"
                      onClick={() => {
                        update({
                          shots: p.shots.filter((_, i) => i !== selected),
                        });
                        setSelected(Math.max(0, selected - 1));
                      }}
                    >
                      <Trash2 size={14} /> Remove shot
                    </button>
                  </>
                )}
              </>
            ) : tab === "Color" ? (
              <>
                <h2>Color & finish</h2>
                <p className="muted">Give the whole reel a consistent look.</p>
                <div className="color-presets">
                  {Object.entries(colorPresets).map(([name, value]) => (
                    <button
                      className="secondary"
                      key={name}
                      onClick={() => update({ color: { ...value } })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                {(
                  [
                    {
                      key: "brightness",
                      label: "Brightness",
                      min: -0.2,
                      max: 0.2,
                      step: 0.01,
                    },
                    {
                      key: "contrast",
                      label: "Contrast",
                      min: 0.5,
                      max: 1.5,
                      step: 0.01,
                    },
                    {
                      key: "saturation",
                      label: "Saturation",
                      min: 0,
                      max: 2,
                      step: 0.01,
                    },
                    {
                      key: "warmth",
                      label: "Warmth",
                      min: -1,
                      max: 1,
                      step: 0.01,
                    },
                  ] as const
                ).map((control) => (
                  <label className="range-label" key={control.key}>
                    {control.label}
                    <span>{grade[control.key].toFixed(2)}</span>
                    <input
                      aria-label={control.label}
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={grade[control.key]}
                      onChange={(e) =>
                        update({
                          color: { ...grade, [control.key]: +e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  className="secondary wide"
                  onClick={() => update({ color: { ...neutralColor } })}
                >
                  Reset color
                </button>
                <p className="hint">
                  Applies to all shots, leaving captions unchanged. Browser
                  color is an approximation; the exported MP4 uses native FFmpeg
                  grading.
                </p>
              </>
            ) : (
              <>
                <h2>Set the tone</h2>
                <p className="muted">A voice, a soundtrack, a story.</p>
                <label>
                  Voiceover
                  <select
                    value={p.voiceover}
                    onChange={(e) => update({ voiceover: e.target.value })}
                  >
                    <option value="">None</option>
                    {assets
                      .filter((a) => a.kind === "audio")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Background music
                  <select
                    value={p.music}
                    onChange={(e) => update({ music: e.target.value })}
                  >
                    <option value="">None</option>
                    {assets
                      .filter((a) => a.kind === "audio")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="range-label">
                  Music volume <span>{Math.round(p.musicVolume * 100)}%</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={p.musicVolume}
                    onChange={(e) => update({ musicVolume: +e.target.value })}
                  />
                </label>
                <button
                  className="wide secondary"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={15} /> Import audio
                </button>
                <p className="hint">
                  Source clip audio is muted. Music loops to fill the reel.
                </p>
              </>
            )}
          </div>
        </aside>
      </main>
      {p.voiceover && (
        <audio
          ref={voice}
          src={assets.find((a) => a.id === p.voiceover)?.url}
        />
      )}{" "}
      {p.music && (
        <audio
          ref={music}
          loop
          src={assets.find((a) => a.id === p.music)?.url}
        />
      )}
      {(notice || busy) && (
        <div className="toast">
          {busy ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}{" "}
          {busy || notice}
          <button className="icon" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <section className="modal">
            <button
              className="modal-close icon"
              aria-label="Close"
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            {modal === "projects" ? (
              <>
                <span className="eyebrow">PROJECTS</span>
                <h1>Open project</h1>
                <button className="secondary wide" onClick={() => projectInput.current?.click()}>
                  Choose project file
                </button>
                <div className="project-list">
                  {savedProjects.map((item) => (
                    <button className="project-row" key={item.filename} onClick={() => { openSavedProject(item.filename); setModal(""); }}>
                      <strong>{item.name}</strong><span>{new Date(item.updatedAt).toLocaleString()}</span>
                    </button>
                  ))}
                  {!savedProjects.length && <p className="muted">No saved projects yet</p>}
                </div>
              </>
            ) : modal === "match" ? (
              <>
                <span className="eyebrow">
                  <Sparkles size={15} /> CHAT-ASSISTED EDITING
                </span>
                <h1>A first cut. Your final say.</h1>
                <p className="muted">
                  Download your media manifest, share it with your AI editor
                  alongside clip previews, then paste the returned JSON edit
                  plan. This app does not send media to an AI service.
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      "reel-manifest.json",
                      JSON.stringify(
                        {
                          transcript: p.transcript,
                          clips: assets.filter((a) => a.kind === "video"),
                          instructions:
                            "Return an array of {clip: exact filename, in: seconds, out: seconds, caption: text}. Analyze supplied previews; do not infer visuals from filenames.",
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <Download size={15} /> Download manifest
                </button>
                <label>
                  Edit plan
                  <textarea
                    rows={9}
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder={
                      '[{"clip":"your-clip.mp4","in":0,"out":2.8,"caption":"Your story starts here"}]'
                    }
                  />
                </label>
                <button className="primary wide" onClick={applyPlan}>
                  Apply editable timeline <ArrowUpRight size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">THE FINAL FRAME</span>
                <h1>Ready for the world.</h1>
                <p className="muted">
                  MP4 · H.264 · {p.format} · 30 fps · {time(total)}
                </p>
                <div className="export-checks">
                  <p>
                    <CheckCircle2 size={17} /> Local rendering with native
                    FFmpeg
                  </p>
                  <p>
                    <CheckCircle2 size={17} /> Burned-in captions + separate SRT
                  </p>
                  <p>
                    <CheckCircle2 size={17} /> Source and trim validation
                  </p>
                </div>
                <p className="hint">
                  Review the preview for faces, logos, text, and caption
                  placement. Visual content and speech synchronization require
                  your review.
                </p>
                {warnings.map((w) => (
                  <p className="warning" key={w}>
                    {w}
                  </p>
                ))}
                {job?.status === "rendering" ? (
                  <>
                    <progress value={job.progress} max="100" />
                    <p>{job.message}</p>
                  </>
                ) : job?.status === "complete" ? (
                  <div className="export-links">
                    <a className="primary" href={job.video} download>
                      Download MP4 <Download size={16} />
                    </a>
                    <a className="secondary" href={job.srt} download>
                      Download SRT
                    </a>
                    <button className="secondary" onClick={() => setJob(null)}>
                      New export
                    </button>
                  </div>
                ) : (
                  <>
                    {job?.status === "error" && (
                      <p className="warning">{job.message}</p>
                    )}
                    <button
                      className="primary wide"
                      disabled={warnings.length > 0 || !!busy}
                      onClick={render}
                    >
                      Render reel <ArrowUpRight size={17} />
                    </button>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
