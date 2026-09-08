import {
  memeOptions,
  MEME_MAX_TRIM_SECONDS,
  maskBox,
  audioEnvelope,
  type MemeOptions,
} from "../shared/meme-options.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Play,
  Pause,
  Download,
  Sparkles,
  Scissors,
} from "lucide-react";
import AppHeader from "./AppHeader";
import { FontPicker, TextSizeColor } from "./TextStyleControls";
import {
  browserOnly,
  listBrowserTemplates,
  saveBrowserTemplate,
} from "./browserStorage";
export type MemeSettings = MemeOptions & {
  backgroundId: string;
  overlayId: string;
  cutoutId: string;
  in: number;
  out: number;
  x: number;
  y: number;
  size: number;
  overlayMode: "cutout" | "original";
  text: string;
  keepAudio: boolean;
  method: "human" | "ai" | "green";
  textSize: number;
  textPosition: number;
  textColor: string;
  textFont: string;
  textOutline?: number;
  processingJobId?: string;
};
export const defaultMeme: MemeSettings = {
  ...memeOptions,
  layout: "v2",
  boxX: 10,
  boxY: 55,
  boxWidth: 80,
  boxHeight: 30,
  backgroundId: "",
  overlayId: "",
  cutoutId: "",
  in: 0,
  out: 3,
  x: 50,
  y: 66,
  size: 100,
  text: "",
  keepAudio: true,
  method: "human",
  textSize: 65,
  textPosition: 25,
  textColor: "#ffffff",
  textFont: "Verdana",
  textOutline: 4,
};
type Props = {
  project: any;
  assets: any[];
  savedProjects: { filename: string; name: string }[];
  onChange: (v: any) => void;
  onAssets: (a: any) => void;
  onImport: (files: FileList | null) => Promise<any[]>;
  onOpen: (p: any) => void;
  onOpenSaved: (filename: string) => void;
  onSave: (p: any) => Promise<boolean>;
  renderText: (text: string, style: any, format: string) => string;
  notice: string;
  busy: string;
};
export default function MemeEditor({
  project: p,
  assets,
  savedProjects,
  onChange,
  onAssets,
  onImport,
  onOpen,
  onOpenSaved,
  onSave,
  renderText,
  notice,
  busy,
}: Props) {
  const m: MemeSettings = { ...defaultMeme, ...p.meme };
  const [job, setJob] = useState<any>(() =>
      m.processingJobId
        ? {
            id: m.processingJobId,
            status: "rendering",
            message: "Restoring background removal",
            progress: 0,
          }
        : null,
    ),
    [elapsed, setElapsed] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [projectsOpen, setProjectsOpen] = useState(false),
    [templates, setTemplates] = useState<any[]>([]),
    [templateName, setTemplateName] = useState("");
  const file = useRef<HTMLInputElement>(null),
    open = useRef<HTMLInputElement>(null),
    audio = useRef<HTMLAudioElement>(null),
    soundtrack = useRef<HTMLAudioElement>(null),
    originalVideo = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    savedTimer = useRef<number | null>(null),
    downloadedJob = useRef("");
  const sound = assets.find((a) => a.id === m.soundtrackId);
  const bg = assets.find((a) => a.id === m.backgroundId),
    source = assets.find((a) => a.id === m.overlayId),
    cutout = assets.find((a) => a.id === m.cutoutId);
  const trimReady =
    source?.kind === "video" &&
    Number.isFinite(m.in) &&
    Number.isFinite(m.out) &&
    m.in >= 0 &&
    m.out <= source.duration + 0.01 &&
    m.out - m.in >= 0.2;
  const exportTrimReady = trimReady && m.out - m.in <= MEME_MAX_TRIM_SECONDS;
  const cutoutReady = !!(
    cutout?.cutout &&
    cutout.sourceId === m.overlayId &&
    Math.abs(cutout.sourceIn - m.in) < 0.01 &&
    Math.abs(cutout.sourceOut - m.out) < 0.01
  );
  const canPlay =
    !!source && trimReady && (m.overlayMode === "original" || cutoutReady);
  const ready =
    !!source &&
    exportTrimReady &&
    (m.overlayMode === "original" || cutoutReady);
  const overlay = m.overlayMode === "original" ? source : cutout;
  const duration = ready
      ? m.overlayMode === "original"
        ? Math.round((m.out - m.in) * 30) / 30
        : cutout.duration
      : Math.max(0, m.out - m.in),
    working = job?.status === "rendering";
  const refreshTemplates = () =>
    browserOnly
      ? setTemplates(listBrowserTemplates("meme"))
      : fetch("/api/meme/templates")
          .then((r) => r.json())
          .then((x) => setTemplates(x.items || []))
          .catch(() => {});
  useEffect(() => {
    refreshTemplates();
  }, []);
  async function saveTemplate() {
    const name = templateName.trim() || p.name || "Meme template";
    if (browserOnly) {
      saveBrowserTemplate("meme", name, m);
      setTemplateName("");
      refreshTemplates();
      return;
    }
    const r = await fetch("/api/meme/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, format: p.format, meme: m }),
    });
    if (r.ok) {
      setTemplateName("");
      refreshTemplates();
    }
  }
  function update(v: Partial<MemeSettings>) {
    onChange({ meme: { ...m, ...v } });
    if (!working) setJob(null);
    setError("");
    if ("in" in v || "out" in v || "overlayId" in v) {
      setPlaying(false);
      setElapsed(0);
    }
  }
  function projectNameFromMedia(filename: string) {
    return filename.replace(/\.[^.]+$/, "").trim() || "Untitled meme";
  }
  function selectOverlay(asset: any) {
    if (!asset) return;
    onChange({ name: projectNameFromMedia(asset.name) });
    update({
      overlayId: asset.id,
      cutoutId: "",
      in: 0,
      out: asset.duration || 3,
      size: 100,
    });
  }
  function downloadRenderedMeme(url: string) {
    const name = String(p.name || "meme")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim();
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "meme"}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  useEffect(() => {
    if (!working || browserOnly) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${job.id}`),
          j = await r.json();
        if (!active) return;
        if (
          j.status === "complete" &&
          j.video &&
          downloadedJob.current !== j.id
        ) {
          downloadedJob.current = j.id;
          downloadRenderedMeme(j.video);
          setJob({ ...j, message: "Meme downloaded" });
        } else {
          setJob(j);
        }
        if (j.status === "complete" && j.asset) {
          onAssets(j.asset);
          onChange({
            meme: { ...m, cutoutId: j.asset.id, processingJobId: undefined },
          });
        }
      } catch {
        if (active) setError("Cannot reach the local engine.");
      }
    }, 700);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.id, working]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - elapsed * 1000;
    const timer = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      if (t >= duration) {
        setElapsed(duration);
        setPlaying(false);
      } else setElapsed(t);
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [playing, duration]);
  useEffect(() => {
    const video = originalVideo.current;
    if (!video || m.overlayMode !== "original" || !source) return;
    const sync = () => {
      video.currentTime = Math.min(source.duration || m.out, m.in + elapsed);
      if (playing) video.play().catch(() => {});
      else video.pause();
    };
    if (video.readyState >= 2) sync();
    else video.addEventListener("loadeddata", sync, { once: true });
    return () => video.removeEventListener("loadeddata", sync);
  }, [playing, m.overlayMode, m.overlayId, m.in, source?.url]);
  useEffect(() => {
    const video = originalVideo.current;
    if (!video || playing || m.overlayMode !== "original") return;
    video.currentTime = Math.min(source?.duration || m.out, m.in + elapsed);
  }, [elapsed, playing, m.overlayMode, m.in, source?.duration]);
  useEffect(() => {
    const a = soundtrack.current;
    if (!a) return;
    if (playing) {
      a.currentTime = sound?.duration ? elapsed % sound.duration : elapsed;
      a.play().catch(() => {});
    } else a.pause();
  }, [playing, m.soundtrackId]);
  useEffect(() => {
    const envelope = audioEnvelope(elapsed, duration, m.fadeIn, m.fadeOut);
    if (audio.current)
      audio.current.volume = Math.max(
        0,
        Math.min(1, m.sourceVolume * envelope),
      );
    if (soundtrack.current)
      soundtrack.current.volume = Math.max(
        0,
        Math.min(1, m.soundtrackVolume * envelope),
      );
  }, [
    elapsed,
    duration,
    m.sourceVolume,
    m.soundtrackVolume,
    m.fadeIn,
    m.fadeOut,
  ]);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (playing && m.keepAudio) {
      a.currentTime = m.in + elapsed;
      a.play().catch(() => {});
    } else a.pause();
  }, [playing, m.keepAudio]);
  async function requestCutout() {
    setError("");
    setPlaying(false);
    if (browserOnly) {
      setError(
        "Background removal requires the desktop edition. Choose Original clip to use the rectangle mask and export WebM in your browser.",
      );
      return;
    }
    if (!exportTrimReady) {
      setError(
        `Trim the clip to between 0.2 and ${MEME_MAX_TRIM_SECONDS} seconds before removing the background.`,
      );
      return;
    }
    try {
      const r = await fetch("/api/cutout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: m.overlayId,
          in: m.in,
          out: m.out,
          method: m.method,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      onChange({ meme: { ...m, processingJobId: j.id } });
      setJob({
        ...j,
        status: "rendering",
        message: "Preparing background removal",
        progress: 0,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const pov = useMemo(
    () =>
      renderText(
        m.text,
        {
          font: m.textFont,
          size: m.textSize,
          color: m.textColor,
          outline: m.textOutline ?? 4,
          shadow: true,
          background: false,
          position: m.textPosition,
        },
        p.format,
      ),
    [
      m.text,
      m.textFont,
      m.textSize,
      m.textColor,
      m.textPosition,
      m.textOutline,
      p.format,
    ],
  );
  const extraImage = useMemo(
    () =>
      renderText(
        m.freeText,
        {
          font: m.freeFont,
          size: m.freeSize,
          color: m.freeColor,
          outline: m.freeOutline,
          shadow: true,
          background: false,
          position: m.freeY,
          horizontalPosition: m.freeX,
          freePlacement: true,
        },
        p.format,
      ),
    [
      m.freeText,
      m.freeFont,
      m.freeSize,
      m.freeColor,
      m.freeOutline,
      m.freeX,
      m.freeY,
      p.format,
    ],
  );
  const dimensions =
    p.format === "1:1"
      ? [1080, 1080]
      : p.format === "16:9"
        ? [1920, 1080]
        : [1080, 1920];
  const box = maskBox(m, dimensions[0], dimensions[1]);
  const overlayWidth = overlay?.width ? (dimensions[0] * m.size) / 100 : 0;
  const overlayHeight =
    overlay?.width && overlay?.height
      ? (overlayWidth * overlay.height) / overlay.width
      : 0;
  const overlayLeft = (dimensions[0] * m.x) / 100 - overlayWidth / 2;
  const overlayTop = (dimensions[1] * m.y) / 100 - overlayHeight / 2;
  const clipPath =
    m.layout === "v2" && overlayHeight > 0
      ? `inset(${Math.max(0, ((box.y - overlayTop) / overlayHeight) * 100)}% ${Math.max(0, ((overlayLeft + overlayWidth - box.x - box.width) / overlayWidth) * 100)}% ${Math.max(0, ((overlayTop + overlayHeight - box.y - box.height) / overlayHeight) * 100)}% ${Math.max(0, ((box.x - overlayLeft) / overlayWidth) * 100)}%)`
      : undefined;
  async function render() {
    setError("");
    setPlaying(false);
    if (browserOnly) {
      await renderInBrowser();
      return;
    }
    try {
      const r = await fetch("/api/meme/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { ...p, meme: m },
          povImage: pov,
          extraImage,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      downloadedJob.current = "";
      setJob({
        ...j,
        status: "rendering",
        message: "Rendering meme",
        progress: 0,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function renderInBrowser() {
    if (!bg || !source || m.overlayMode !== "original" || !ready) {
      setError(
        "Choose a background and an original video clip before exporting.",
      );
      return;
    }
    if (!("MediaRecorder" in window)) {
      setError(
        "This browser does not support video recording. Try current Chrome or Edge.",
      );
      return;
    }
    const output = document.createElement("canvas");
    output.width = dimensions[0];
    output.height = dimensions[1];
    const ctx = output.getContext("2d");
    if (!ctx) {
      setError("Could not initialize the browser renderer.");
      return;
    }
    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(Error("Could not load an image for export."));
        image.src = src;
      });
    const waitForVideo = (video: HTMLVideoElement) =>
      new Promise<void>((resolve, reject) => {
        if (video.readyState >= 2) return resolve();
        video.onloadeddata = () => resolve();
        video.onerror = () =>
          reject(Error("Could not load the video for export."));
      });
    const drawCover = (
      media: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number,
    ) => {
      const scale = Math.max(
        output.width / sourceWidth,
        output.height / sourceHeight,
      );
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      ctx.drawImage(
        media,
        (output.width - width) / 2,
        (output.height - height) / 2,
        width,
        height,
      );
    };
    let audioContext: AudioContext | null = null;
    let soundtrackElement: HTMLAudioElement | null = null;
    try {
      const [background, povLayer, freeLayer] = await Promise.all([
        loadImage(bg.url),
        m.text ? loadImage(pov) : Promise.resolve(null),
        m.freeText ? loadImage(extraImage) : Promise.resolve(null),
      ]);
      const clip = document.createElement("video");
      clip.src = source.url;
      clip.preload = "auto";
      clip.playsInline = true;
      await waitForVideo(clip);
      clip.currentTime = m.in;

      const canvasStream = output.captureStream(30);
      const tracks = [...canvasStream.getVideoTracks()];
      const AudioContextClass = window.AudioContext;
      if (AudioContextClass && (m.keepAudio || sound)) {
        audioContext = new AudioContextClass();
        const destination = audioContext.createMediaStreamDestination();
        if (m.keepAudio) {
          const clipSource = audioContext.createMediaElementSource(clip);
          const gain = audioContext.createGain();
          gain.gain.value = m.sourceVolume;
          clipSource.connect(gain).connect(destination);
        }
        if (sound) {
          soundtrackElement = new Audio(sound.url);
          soundtrackElement.loop = true;
          const musicSource =
            audioContext.createMediaElementSource(soundtrackElement);
          const gain = audioContext.createGain();
          gain.gain.value = m.soundtrackVolume;
          musicSource.connect(gain).connect(destination);
        }
        tracks.push(...destination.stream.getAudioTracks());
        await audioContext.resume();
      }
      const stream = new MediaStream(tracks);
      const mimeType =
        [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
        ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined,
      );
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      setJob({
        status: "rendering",
        progress: 0,
        message: "Rendering in this browser",
      });
      recorder.start(250);
      await Promise.all([
        clip.play(),
        soundtrackElement?.play() || Promise.resolve(),
      ]);
      const started = performance.now();
      let lastProgress = 0;
      await new Promise<void>((resolve) => {
        const draw = () => {
          const elapsedSeconds = Math.min(
            duration,
            (performance.now() - started) / 1000,
          );
          ctx.clearRect(0, 0, output.width, output.height);
          drawCover(
            background,
            background.naturalWidth,
            background.naturalHeight,
          );
          const videoWidth = (output.width * m.size) / 100;
          const videoHeight = videoWidth * (clip.videoHeight / clip.videoWidth);
          const left = (output.width * m.x) / 100 - videoWidth / 2;
          const top = (output.height * m.y) / 100 - videoHeight / 2;
          ctx.save();
          if (m.layout === "v2") {
            ctx.beginPath();
            ctx.rect(box.x, box.y, box.width, box.height);
            ctx.clip();
          }
          ctx.drawImage(clip, left, top, videoWidth, videoHeight);
          ctx.restore();
          if (povLayer)
            ctx.drawImage(povLayer, 0, 0, output.width, output.height);
          if (freeLayer)
            ctx.drawImage(freeLayer, 0, 0, output.width, output.height);
          const progress = Math.round((elapsedSeconds / duration) * 100);
          if (progress >= lastProgress + 5) {
            lastProgress = progress;
            setJob({
              status: "rendering",
              progress,
              message: "Rendering in this browser",
            });
          }
          if (elapsedSeconds >= duration || clip.ended) resolve();
          else requestAnimationFrame(draw);
        };
        draw();
      });
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "video/webm",
      });
      const url = URL.createObjectURL(blob);
      const name =
        String(p.name || "meme")
          .replace(/[\\/:*?"<>|]/g, "-")
          .trim() || "meme";
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.webm`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setJob({
        status: "complete",
        progress: 100,
        message: "Browser-rendered WebM downloaded",
      });
    } catch (e) {
      setJob(null);
      setError(e instanceof Error ? e.message : "Browser export failed.");
    } finally {
      soundtrackElement?.pause();
      if (audioContext) await audioContext.close().catch(() => {});
    }
  }
  async function save() {
    setSaving(true);
    setSaved(false);
    const ok = await onSave({ ...p, meme: m });
    setSaving(false);
    if (!ok) return;
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1800);
  }
  return (
    <div className="meme-app">
      <AppHeader
        name={p.name}
        mode="meme"
        onName={(name) => onChange({ name })}
        onMode={(mode) => {
          setPlaying(false);
          onChange({ mode });
        }}
        onOpen={() => setProjectsOpen(true)}
        onNew={() => {
          setPlaying(false);
          setJob(null);
          setElapsed(0);
          setError("");
          setSaved(false);
          onChange({
            name: "Untitled meme",
            mode: "meme",
            format: "9:16",
            shots: [],
            meme: { ...defaultMeme },
          });
        }}
        newLabel="New meme"
        onSave={save}
        saving={saving}
        onExport={render}
        exportDisabled={!ready || !bg || working}
        exportLabel={
          browserOnly
            ? working
              ? "Rendering…"
              : "Export WebM"
            : working
              ? "Rendering…"
              : saved
                ? "Download meme"
                : "Export meme"
        }
      />
      {projectsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setProjectsOpen(false)}
        >
          <section
            className="modal project-picker"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h1>Open project</h1>
            <button
              className="secondary wide"
              onClick={() => open.current?.click()}
            >
              Choose project file
            </button>
            <div className="project-list">
              {savedProjects.map((item) => (
                <button
                  className="project-row"
                  key={item.filename}
                  onClick={() => {
                    onOpenSaved(item.filename);
                    setProjectsOpen(false);
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <button
              className="text-button"
              onClick={() => setProjectsOpen(false)}
            >
              Close
            </button>
          </section>
        </div>
      )}
      <input
        hidden
        ref={file}
        type="file"
        accept="video/*,image/png,image/jpeg,image/webp,audio/*"
        multiple
        onChange={async (e) => {
          const imported = await onImport(e.target.files);
          e.target.value = "";
          const video = [...imported]
            .reverse()
            .find((asset) => asset.kind === "video");
          if (video) selectOverlay(video);
        }}
      />
      <input
        hidden
        ref={open}
        type="file"
        accept=".json"
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f) return;
            const q = JSON.parse(await f.text());
            if (q.version !== 1 || !q.style || !Array.isArray(q.shots))
              throw Error("Invalid project");
            onOpen(q);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <div className="meme-layout">
        <aside className="meme-controls">
          <fieldset disabled={working || !!busy}>
            <details className="meme-control-section" open>
              <summary>Background image</summary>
              <div className="meme-control-body">
                <p className="muted">A still image fills the entire frame.</p>
                <button
                  className="secondary wide"
                  onClick={() => file.current?.click()}
                >
                  <Upload size={15} /> Import image or meme clip
                </button>
                <label>
                  Background
                  <select
                    value={m.backgroundId}
                    onChange={(e) => update({ backgroundId: e.target.value })}
                  >
                    <option value="">Choose an image</option>
                    {assets
                      .filter((a) => a.kind === "image")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </details>
            <details className="meme-control-section">
              <summary>Meme video overlay</summary>
              <div className="meme-control-body">
                <label>
                  Original clip
                  <select
                    value={m.overlayId}
                    onChange={(e) => {
                      const a = assets.find((a) => a.id === e.target.value);
                      if (a) selectOverlay(a);
                      else update({ overlayId: "", cutoutId: "" });
                    }}
                  >
                    <option value="">Choose a video</option>
                    {assets
                      .filter((a) => a.kind === "video" && !a.cutout)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Overlay type
                  <select
                    value={m.overlayMode}
                    onChange={(e) =>
                      update({
                        overlayMode: e.target.value as "cutout" | "original",
                      })
                    }
                  >
                    <option value="cutout">Transparent cutout</option>
                    <option value="original">Original clip · no cutout</option>
                  </select>
                </label>
                <div className="two-cols">
                  <label>
                    Trim start (s)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={m.in}
                      onChange={(e) =>
                        update({ in: +e.target.value, cutoutId: "" })
                      }
                    />
                  </label>
                  <label>
                    Trim end (s)
                    <input
                      type="number"
                      min="0.2"
                      step="0.1"
                      max={
                        m.overlayMode === "cutout"
                          ? Math.min(
                              MEME_MAX_TRIM_SECONDS,
                              source?.duration || MEME_MAX_TRIM_SECONDS,
                            )
                          : source?.duration
                      }
                      value={m.out}
                      onChange={(e) =>
                        update({ out: +e.target.value, cutoutId: "" })
                      }
                    />
                  </label>
                </div>
                {m.overlayMode === "cutout" ? (
                  <>
                    <label>
                      Removal method
                      <select
                        value={m.method}
                        onChange={(e) =>
                          update({
                            method: e.target.value as "human" | "ai" | "green",
                            cutoutId: "",
                          })
                        }
                      >
                        <option value="human">
                          Human cutout · better for people
                        </option>
                        <option value="ai">Fast cutout · lightweight</option>
                        <option value="green">Green screen</option>
                      </select>
                    </label>
                    <button
                      className="primary wide"
                      disabled={!source || !exportTrimReady}
                      onClick={requestCutout}
                    >
                      <Scissors size={15} />
                      {cutoutReady
                        ? "Remove background again"
                        : "Remove background"}
                    </button>
                    {trimReady && !exportTrimReady && (
                      <p className="warning">
                        This trim is {(m.out - m.in).toFixed(1)}s. Shorten it to{" "}
                        {MEME_MAX_TRIM_SECONDS} seconds or less before removing
                        the background.
                      </p>
                    )}
                    {cutoutReady && (
                      <p className="success">✓ Transparent cutout ready</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="success">
                      ✓ Original video will be composited as-is. No background
                      removal is needed.
                    </p>
                    {trimReady && !exportTrimReady && (
                      <p className="warning">
                        Preview is available. Trim this clip to{" "}
                        {MEME_MAX_TRIM_SECONDS} seconds or less to export.
                      </p>
                    )}
                  </>
                )}
                {canPlay && (
                  <>
                    {(
                      [
                        {
                          key: "size",
                          label: "Overlay size",
                          min: 10,
                          max: 150,
                        },
                        {
                          key: "x",
                          label: "Horizontal position",
                          min: 0,
                          max: 100,
                        },
                        {
                          key: "y",
                          label: "Vertical position",
                          min: 0,
                          max: 100,
                        },
                      ] as const
                    ).map((c) => (
                      <label className="range-label" key={c.key}>
                        {c.label}
                        <span>{m[c.key]}%</span>
                        <input
                          aria-label={c.label}
                          type="range"
                          min={c.min}
                          max={c.max}
                          value={m[c.key]}
                          onChange={(e) => update({ [c.key]: +e.target.value })}
                        />
                      </label>
                    ))}
                  </>
                )}
              </div>
            </details>
            <details className="meme-control-section">
              <summary>Layout</summary>
              <div className="meme-control-body">
                <label>
                  Meme version
                  <select
                    value={m.layout}
                    onChange={(e) =>
                      update({ layout: e.target.value as "v1" | "v2" })
                    }
                  >
                    <option value="v1">V1 · Free cutout</option>
                    <option value="v2">V2 · Rectangle mask</option>
                  </select>
                </label>
                {m.layout === "v2" && (
                  <>
                    {(
                      [
                        { key: "boxX", label: "Box left", min: 0, max: 90 },
                        { key: "boxY", label: "Box top", min: 0, max: 90 },
                        {
                          key: "boxWidth",
                          label: "Box width",
                          min: 10,
                          max: 100,
                        },
                        {
                          key: "boxHeight",
                          label: "Box height",
                          min: 10,
                          max: 100,
                        },
                      ] as const
                    ).map((c) => (
                      <label className="range-label" key={c.key}>
                        {c.label}
                        <span>{m[c.key]}%</span>
                        <input
                          aria-label={c.label}
                          type="range"
                          min={c.min}
                          max={c.max}
                          value={m[c.key]}
                          onChange={(e) => update({ [c.key]: +e.target.value })}
                        />
                      </label>
                    ))}
                  </>
                )}
              </div>
            </details>
            <details className="meme-control-section">
              <summary>Audio mix</summary>
              <div className="meme-control-body">
                <label className="toggle-label">
                  Keep meme clip audio
                  <input
                    type="checkbox"
                    checked={m.keepAudio}
                    onChange={(e) => update({ keepAudio: e.target.checked })}
                  />
                </label>
                <label className="range-label">
                  Meme audio volume
                  <span>{Math.round(m.sourceVolume * 100)}%</span>
                  <input
                    aria-label="Meme audio volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={m.sourceVolume}
                    onChange={(e) => update({ sourceVolume: +e.target.value })}
                  />
                </label>
                <label>
                  Additional audio
                  <select
                    value={m.soundtrackId}
                    onChange={(e) => update({ soundtrackId: e.target.value })}
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
                <button
                  className="secondary wide"
                  onClick={() => file.current?.click()}
                >
                  Import audio
                </button>
                <label className="range-label">
                  Additional audio volume
                  <span>{Math.round(m.soundtrackVolume * 100)}%</span>
                  <input
                    aria-label="Additional audio volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={m.soundtrackVolume}
                    onChange={(e) =>
                      update({ soundtrackVolume: +e.target.value })
                    }
                  />
                </label>
                {(["fadeIn", "fadeOut"] as const).map((key) => (
                  <label className="range-label" key={key}>
                    {key === "fadeIn" ? "Audio fade in" : "Audio fade out"}
                    <span>{m[key]}s</span>
                    <input
                      aria-label={
                        key === "fadeIn" ? "Audio fade in" : "Audio fade out"
                      }
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={m[key]}
                      onChange={(e) => update({ [key]: +e.target.value })}
                    />
                  </label>
                ))}
              </div>
            </details>
          </fieldset>
        </aside>
        <section className="meme-stage">
          <div className="preview-heading">
            <select
              aria-label="Aspect ratio"
              value={p.format}
              onChange={(e) => onChange({ format: e.target.value })}
            >
              <option>9:16</option>
              <option>1:1</option>
              <option>16:9</option>
            </select>
          </div>
          <div className="meme-preview-area">
            <div
              ref={canvas}
              className="meme-canvas"
              style={{
                aspectRatio: p.format.replace(":", "/"),
                height: `min(100%, calc(100cqw * ${p.format === "9:16" ? 16 / 9 : p.format === "16:9" ? 9 / 16 : 1}))`,
              }}
            >
              {bg ? (
                <img
                  className="meme-background"
                  src={bg.url}
                  alt="Background"
                />
              ) : (
                <div className="meme-placeholder">
                  <Upload />
                  <p>Choose a background image</p>
                </div>
              )}
              {(ready || (m.overlayMode === "original" && canPlay)) &&
                overlay &&
                (m.overlayMode === "original" ? (
                  <video
                    ref={originalVideo}
                    className="meme-cutout meme-original"
                    src={source.url}
                    muted
                    playsInline
                    preload="auto"
                    aria-label="Original meme overlay"
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = Math.min(
                        source.duration || m.out,
                        m.in + elapsed,
                      );
                      if (playing) e.currentTarget.play().catch(() => {});
                    }}
                    onEnded={() => {
                      setPlaying(false);
                      setElapsed(duration);
                    }}
                    style={{
                      clipPath,
                      width: `${m.size}%`,
                      left: `${m.x}%`,
                      top: `${m.y}%`,
                    }}
                  />
                ) : (
                  <img
                    className="meme-cutout"
                    alt="Transparent meme overlay"
                    src={`${cutout.framesUrl}frame-${String(Math.min(cutout.frameCount, Math.floor(elapsed * 30) + 1)).padStart(6, "0")}.png`}
                    style={{
                      clipPath,
                      width: `${m.size}%`,
                      left: `${m.x}%`,
                      top: `${m.y}%`,
                    }}
                  />
                ))}
              {m.layout === "v2" && (
                <div
                  className="meme-mask-guide"
                  style={{
                    left: `${(box.x / dimensions[0]) * 100}%`,
                    top: `${(box.y / dimensions[1]) * 100}%`,
                    width: `${(box.width / dimensions[0]) * 100}%`,
                    height: `${(box.height / dimensions[1]) * 100}%`,
                  }}
                />
              )}
              {m.freeText && (
                <>
                  <img
                    className="caption-overlay"
                    src={extraImage}
                    alt={m.freeText}
                  />
                  <button
                    className="free-text-handle"
                    aria-label="Drag free text"
                    style={{ left: `${m.freeX}%`, top: `${m.freeY}%` }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setPlaying(false);
                    }}
                    onPointerMove={(e) => {
                      if (
                        !e.currentTarget.hasPointerCapture(e.pointerId) ||
                        working
                      )
                        return;
                      const r = canvas.current!.getBoundingClientRect();
                      update({
                        freeX: Math.round(
                          Math.max(
                            0,
                            Math.min(
                              100,
                              ((e.clientX - r.left) / r.width) * 100,
                            ),
                          ),
                        ),
                        freeY: Math.round(
                          Math.max(
                            0,
                            Math.min(
                              100,
                              ((e.clientY - r.top) / r.height) * 100,
                            ),
                          ),
                        ),
                      });
                    }}
                  >
                    ↔ Move text
                  </button>
                </>
              )}
              {m.text && (
                <img className="caption-overlay" src={pov} alt={m.text} />
              )}
            </div>
          </div>
          <div className="meme-playbar">
            <button
              className="play"
              aria-label={playing ? "Pause meme" : "Play meme"}
              disabled={!canPlay}
              onClick={() => {
                if (elapsed >= duration) setElapsed(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              aria-label="Meme playhead"
              type="range"
              min="0"
              max={duration || 1}
              step="0.033333"
              value={elapsed}
              onChange={(e) => {
                setPlaying(false);
                setElapsed(+e.target.value);
              }}
            />
            <span>
              {elapsed.toFixed(1)} / {duration.toFixed(1)}s
            </span>
          </div>
          {(working || job?.status === "complete") && (
            <div className="meme-status">
              <p>{job.message}</p>
              {working && <progress max="100" value={job.progress} />}{" "}
            </div>
          )}
          {(error || job?.status === "error") && (
            <p className="warning">{error || job.message}</p>
          )}
          {(busy || notice) && <p className="hint">{busy || notice}</p>}
        </section>
        <aside className="meme-controls">
          <details className="meme-control-section meme-template-controls" open>
            <summary>Templates</summary>
            <div className="meme-control-body">
              <label>
                Meme template
                <select
                  value=""
                  onChange={(e) => {
                    const item = templates.find(
                      (x) => x.file === e.target.value,
                    );
                    if (item)
                      onChange({
                        format: item.format || p.format,
                        meme: { ...defaultMeme, ...item.meme },
                      });
                  }}
                >
                  <option value="">Choose a saved template</option>
                  {templates.map((item) => (
                    <option value={item.file} key={item.file}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="template-save">
                <input
                  value={templateName}
                  placeholder="New template name"
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button className="secondary wide" onClick={saveTemplate}>
                  Save template
                </button>
              </div>
            </div>
          </details>
          <fieldset disabled={working}>
            <details className="meme-control-section" open>
              <summary>POV text</summary>
              <div className="meme-control-body">
                <label>
                  POV text
                  <textarea
                    rows={4}
                    maxLength={300}
                    value={m.text}
                    onChange={(e) => update({ text: e.target.value })}
                  />
                </label>
                <FontPicker
                  label="Font"
                  fonts={["Arial", "Helvetica", "Georgia", "Verdana"]}
                  value={m.textFont}
                  onChange={(textFont) => update({ textFont })}
                />
                <TextSizeColor
                  size={m.textSize}
                  color={m.textColor}
                  min={30}
                  max={120}
                  sizeLabel="Text size"
                  onSize={(textSize) => update({ textSize })}
                  onColor={(textColor) => update({ textColor })}
                />
                <label className="range-label">
                  Text position<span>{m.textPosition}%</span>
                  <input
                    aria-label="POV text position"
                    type="range"
                    min="10"
                    max="85"
                    value={m.textPosition}
                    onChange={(e) => update({ textPosition: +e.target.value })}
                  />
                </label>
                <div className="divider" />
                <label className="range-label">
                  Text outline<span>{m.textOutline ?? 4}px</span>
                  <input
                    aria-label="POV text outline"
                    type="range"
                    min="0"
                    max="10"
                    value={m.textOutline ?? 4}
                    onChange={(e) => update({ textOutline: +e.target.value })}
                  />
                </label>
              </div>
            </details>
            <details className="meme-control-section">
              <summary>Free text layer</summary>
              <div className="meme-control-body">
                <p className="hint">
                  Independent of POV. Drag its handle in the preview or use the
                  position sliders.
                </p>
                <label>
                  Free text
                  <textarea
                    maxLength={300}
                    rows={3}
                    value={m.freeText}
                    onChange={(e) => update({ freeText: e.target.value })}
                  />
                </label>
                <FontPicker
                  label="Free text font"
                  fonts={["Arial", "Helvetica", "Georgia", "Verdana"]}
                  value={m.freeFont}
                  onChange={(freeFont) => update({ freeFont })}
                />
                <TextSizeColor
                  size={m.freeSize}
                  color={m.freeColor}
                  min={24}
                  max={120}
                  sizeLabel="Free text size"
                  colorLabel="Free text color"
                  onSize={(freeSize) => update({ freeSize })}
                  onColor={(freeColor) => update({ freeColor })}
                />
                {(
                  [
                    {
                      key: "freeOutline",
                      label: "Free text outline",
                      min: 0,
                      max: 10,
                    },
                    {
                      key: "freeX",
                      label: "Free text horizontal",
                      min: 0,
                      max: 100,
                    },
                    {
                      key: "freeY",
                      label: "Free text vertical",
                      min: 0,
                      max: 100,
                    },
                  ] as const
                ).map((c) => (
                  <label className="range-label" key={c.key}>
                    {c.label}
                    <span>{m[c.key]}</span>
                    <input
                      aria-label={c.label}
                      type="range"
                      min={c.min}
                      max={c.max}
                      value={m[c.key]}
                      onChange={(e) => update({ [c.key]: +e.target.value })}
                    />
                  </label>
                ))}
              </div>
            </details>
          </fieldset>
        </aside>
      </div>
      {source && <audio ref={audio} src={source.url} />}
      {sound && <audio ref={soundtrack} src={sound.url} loop />}
    </div>
  );
}
