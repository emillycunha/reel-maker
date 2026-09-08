import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  GripVertical,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import AppHeader from "./AppHeader";
import ColorControl from "./ColorControl";
import { FontPicker, TextSizeColor } from "./TextStyleControls";
import { browserOnly, listBrowserTemplates, saveBrowserTemplate } from "./browserStorage";

type TextStyle = {
  font: string;
  size: number;
  x: number;
  y: number;
  width?: number;
  align: "left" | "center" | "right";
  color?: string;
  weight?: number;
  lineHeight?: number;
};
type CoverRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  opacity?: number;
  radius?: number;
};
type ExtraText = TextStyle & { id: string; text: string };
type ShapeKind = "rectangle" | "ellipse" | "line";
type ShapeSizeMode = "fixed" | "fit-text";
type TextLayerKey = "eyebrow" | "title" | "body" | "footer";
type ShapeLayer = {
  id: string;
  name: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity?: number;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
  sizeMode?: ShapeSizeMode;
  textLayer?: TextLayerKey;
  paddingX?: number;
  paddingY?: number;
  offsetX?: number;
  offsetY?: number;
};
export type CarouselSlide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  footer?: string;
  imageId?: string;
  /** Optional per-slide background color. Falls back to the project color. */
  background?: string;
  eyebrowStyle?: TextStyle;
  titleStyle?: TextStyle;
  bodyStyle?: TextStyle;
  footerStyle?: TextStyle;
  extraTexts?: ExtraText[];
  imageMode?: "panel" | "full" | "overlay";
  imageX?: number;
  imageY?: number;
  imageWidth?: number;
  imageHeight?: number;
  imageOpacity?: number;
  /** Masks flattened reference copy so the text layers remain editable. */
  coverRects?: CoverRect[];
  /** Editable vector layers rendered behind text. */
  shapes?: ShapeLayer[];
};
export type CarouselSettings = {
  format: "1:1" | "4:5" | "3:4";
  slides: CarouselSlide[];
  background: string;
  panel: string;
  accent: string;
  text: string;
  font: string;
  padding: number;
  radius: number;
};
const fonts = [
  "Bebas Neue",
  "Cuprum",
  "Radio Canada Big",
  "Space Grotesk",
  "Caveat",
  "Give You Glory",
  "Homenaje",
  "Play",
  "Yuyu",
  "Georgia",
  "Arial",
  "Helvetica",
];
const fontWeights: Record<string, number[]> = {
  "Bebas Neue": [400],
  Cuprum: [400, 500, 600, 700],
  "Radio Canada Big": [400, 500, 600, 700],
  "Space Grotesk": [300, 400, 500, 600, 700],
  Caveat: [400, 500, 600, 700],
  "Give You Glory": [400],
  Homenaje: [400],
  Play: [400, 700],
  Yuyu: [400],
  Georgia: [400, 700],
  Arial: [400, 700],
  Helvetica: [400, 700],
};
const fontName = (value?: string) =>
  fonts.includes(value || "") ? value! : "Space Grotesk";
function duplicateCarousel(carousel: CarouselSettings): CarouselSettings {
  return {
    ...carousel,
    slides: carousel.slides.map((slide) => ({
      ...slide,
      id: crypto.randomUUID(),
      extraTexts: slide.extraTexts?.map((extra) => ({
        ...extra,
        id: crypto.randomUUID(),
      })),
      shapes: slide.shapes?.map((shape) => ({
        ...shape,
        id: crypto.randomUUID(),
      })),
    })),
  };
}
const textLayerLabels: Record<TextLayerKey, string> = {
  eyebrow: "Eyebrow",
  title: "Headline",
  body: "Body",
  footer: "Footer",
};
const styles = {
  eyebrow: {
    font: "Space Grotesk",
    size: 28,
    x: 8,
    y: 10,
    width: 84,
    align: "left" as const,
    weight: 700,
  },
  title: {
    font: "Space Grotesk",
    size: 68,
    x: 8,
    y: 18,
    width: 84,
    align: "left" as const,
    weight: 800,
  },
  body: {
    font: "Space Grotesk",
    size: 31,
    x: 8,
    y: 86,
    width: 84,
    align: "left" as const,
    weight: 400,
  },
  footer: {
    font: "Space Grotesk",
    size: 24,
    x: 8,
    y: 93,
    width: 84,
    align: "left" as const,
    weight: 700,
  },
};
export const defaultCarousel: CarouselSettings = {
  format: "4:5",
  background: "#10130f",
  panel: "#1d2419",
  accent: "#d6efab",
  text: "#f4f5f0",
  font: "Space Grotesk",
  padding: 84,
  radius: 34,
  slides: [
    {
      id: crypto.randomUUID(),
      eyebrow: "COACHING NOTES",
      title: "Build the player before the result",
      body: "A practical idea for your next training session",
      footer: "",
    },
    {
      id: crypto.randomUUID(),
      eyebrow: "01",
      title: "Make the game the teacher",
      body: "Create the problem then give players time to recognize and solve it",
      footer: "",
    },
    {
      id: crypto.randomUUID(),
      eyebrow: "SAVE THIS",
      title: "Try it at your next practice",
      body: "Keep the constraint simple and let the repetitions do the work",
      footer: "",
    },
  ],
};
type Props = {
  project: any;
  assets: any[];
  savedProjects: any[];
  onChange: (v: any) => void;
  onOpen: (q: any) => void;
  onOpenSaved: (f: string) => void;
  onSave: (p: any) => Promise<boolean>;
  onImport: (f: FileList | null) => Promise<any[]>;
};
const esc = (s: string) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function wrap(text: string, maxWidth: number, st: TextStyle) {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  if (!ctx) return [String(text)];
  ctx.font = `${st.weight || 400} ${st.size}px "${fontName(st.font)}"`;
  const lines: string[] = [];
  for (const paragraph of String(text).split(/\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    else if (!paragraph.trim()) lines.push("");
  }
  return lines;
}
type TextLayout = {
  lines: string[];
  x: number;
  firstBaseline: number;
  lineGap: number;
  left: number;
  top: number;
  width: number;
  height: number;
  anchor: "start" | "middle" | "end";
};
function textLayout(
  text: string,
  st: TextStyle,
  width: number,
  height: number,
): TextLayout {
  const anchor =
      st.align === "left" ? "start" : st.align === "right" ? "end" : "middle",
    requested = (width * Math.max(5, st.width ?? 84)) / 100,
    x = (width * st.x) / 100,
    available =
      st.align === "left"
        ? width - x
        : st.align === "right"
          ? x
          : 2 * Math.min(x, width - x),
    maxWidth = Math.max(st.size, Math.min(requested, available)),
    lines = wrap(text, maxWidth, st),
    canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  if (ctx) ctx.font = `${st.weight || 400} ${st.size}px "${fontName(st.font)}"`;
  const measuredWidth = Math.max(
      st.size,
      ...lines.map(
        (line) => ctx?.measureText(line).width ?? line.length * st.size * 0.55,
      ),
    ),
    renderedWidth = Math.min(maxWidth, measuredWidth),
    firstBaseline = (height * st.y) / 100,
    lineGap = st.size * (st.lineHeight ?? 1.15),
    blockHeight = lines.length
      ? st.size * 1.08 + Math.max(0, lines.length - 1) * lineGap
      : 0,
    left =
      anchor === "start"
        ? x
        : anchor === "end"
          ? x - renderedWidth
          : x - renderedWidth / 2;
  return {
    lines,
    x,
    firstBaseline,
    lineGap,
    left,
    top: firstBaseline - st.size * 0.82,
    width: renderedWidth,
    height: blockHeight,
    anchor,
  };
}
function textSvg(
  text: string,
  st: TextStyle,
  color: string,
  width: number,
  height: number,
) {
  const layout = textLayout(text, st, width, height);
  return layout.lines
    .map(
      (line, i) =>
        `<text x="${layout.x}" y="${layout.firstBaseline + i * layout.lineGap}" fill="${st.color || color}" font-family="${esc(fontName(st.font))}" font-size="${st.size}" font-weight="${st.weight || 400}" text-anchor="${layout.anchor}">${esc(line)}</text>`,
    )
    .join("");
}
function textLayer(
  slide: CarouselSlide,
  carousel: CarouselSettings,
  key: TextLayerKey,
) {
  const base = styles[key];
  const style = {
    ...base,
    font: carousel.font,
    ...(slide[`${key}Style` as keyof CarouselSlide] as TextStyle | undefined),
  } as TextStyle;
  const text =
    key === "title"
      ? slide.title
      : key === "body"
        ? slide.body
        : key === "footer"
          ? slide.footer || ""
          : slide.eyebrow;
  return { text, style };
}
function shapeSvg(
  shape: ShapeLayer,
  slide: CarouselSlide,
  carousel: CarouselSettings,
  width: number,
  height: number,
) {
  const fitText = shape.sizeMode === "fit-text" && shape.kind !== "line";
  let x = (width * shape.x) / 100,
    y = (height * shape.y) / 100,
    shapeWidth = (width * shape.width) / 100,
    shapeHeight = (height * shape.height) / 100;
  if (fitText) {
    const key = shape.textLayer || "title",
      linked = textLayer(slide, carousel, key),
      layout = textLayout(linked.text, linked.style, width, height),
      paddingX = shape.paddingX ?? 24,
      paddingY = shape.paddingY ?? 18;
    x = layout.left - paddingX + (width * (shape.offsetX ?? 0)) / 100;
    y = layout.top - paddingY + (height * (shape.offsetY ?? 0)) / 100;
    shapeWidth = layout.width + paddingX * 2;
    shapeHeight = layout.height + paddingY * 2;
  }
  const fill = esc(shape.fill || carousel.accent),
    stroke = esc(shape.stroke || shape.fill || carousel.accent),
    opacity = shape.opacity ?? 1,
    strokeWidth = shape.strokeWidth ?? 0;
  if (shape.kind === "ellipse") {
    return `<ellipse cx="${x + shapeWidth / 2}" cy="${y + shapeHeight / 2}" rx="${shapeWidth / 2}" ry="${shapeHeight / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
  }
  if (shape.kind === "line") {
    return `<line x1="${x}" y1="${y}" x2="${x + shapeWidth}" y2="${y + shapeHeight}" stroke="${fill}" stroke-width="${Math.max(1, strokeWidth || 8)}" stroke-linecap="round" opacity="${opacity}"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${shapeWidth}" height="${shapeHeight}" rx="${shape.radius ?? 0}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}
function dimensions(format: CarouselSettings["format"]) {
  return format === "1:1"
    ? [1080, 1080]
    : format === "3:4"
      ? [1080, 1440]
      : [1080, 1350];
}
function svgFor(s: CarouselSlide, c: CarouselSettings, asset: any) {
  const background = s.background || c.background;
  const [w, h] = dimensions(c.format),
    e = { ...styles.eyebrow, font: c.font, ...s.eyebrowStyle },
    t = { ...styles.title, font: c.font, ...s.titleStyle },
    b = { ...styles.body, font: c.font, ...s.bodyStyle },
    f = { ...styles.footer, font: c.font, ...s.footerStyle };
  const mode = s.imageMode || "panel",
    ix = (w * (s.imageX ?? 8)) / 100,
    iy = (h * (s.imageY ?? 46)) / 100,
    iw = (w * (s.imageWidth ?? 84)) / 100,
    ih = (h * (s.imageHeight ?? 34)) / 100,
    opacity = s.imageOpacity ?? 1,
    href = asset?.url ? esc(new URL(asset.url, location.origin).href) : "",
    image = href
      ? `<image href="${href}" x="${mode === "full" ? 0 : ix}" y="${mode === "full" ? 0 : iy}" width="${mode === "full" ? w : iw}" height="${mode === "full" ? h : ih}" opacity="${opacity}" preserveAspectRatio="xMidYMid slice" clip-path="${mode === "panel" ? "url(#photo)" : ""}"/>`
      : "";
  const panel =
    mode === "full" || !href
      ? ""
      : `<rect x="${c.padding / 2}" y="${c.padding / 2}" width="${w - c.padding}" height="${h - c.padding}" rx="${c.radius}" fill="${c.panel}"/>`;
  const covers = (s.coverRects || [])
    .map(
      (cover) =>
        `<rect x="${(w * cover.x) / 100}" y="${(h * cover.y) / 100}" width="${(w * cover.width) / 100}" height="${(h * cover.height) / 100}" rx="${(cover.radius || 0) * (w / 1080)}" fill="${esc(cover.fill || background)}" opacity="${cover.opacity ?? 1}"/>`,
    )
    .join("");
  const shapes = (s.shapes || [])
    .map((shape) => shapeSvg(shape, s, c, w, h))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><clipPath id="photo"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${c.radius}"/></clipPath></defs><rect width="${w}" height="${h}" fill="${background}"/>${mode === "full" ? image : ""}${panel}${mode !== "full" ? image : ""}${covers}${shapes}${textSvg(s.eyebrow.toUpperCase(), e, c.accent, w, h)}${textSvg(s.title, t, c.text, w, h)}${textSvg(s.body, b, c.text, w, h)}${textSvg((s.footer || "").toUpperCase(), f, c.text, w, h)}${(s.extraTexts || []).map((x) => textSvg(x.text, x, c.text, w, h)).join("")}</svg>`;
}
function download(name: string, data: Blob | string, type = "image/svg+xml") {
  const url = URL.createObjectURL(
      data instanceof Blob ? data : new Blob([data], { type }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CarouselEditor({
  project: p,
  assets,
  savedProjects,
  onChange,
  onOpen,
  onOpenSaved,
  onSave,
  onImport,
}: Props) {
  const c: CarouselSettings = {
    ...defaultCarousel,
    ...p.carousel,
    font: fontName(p.carousel?.font),
    slides: p.carousel?.slides?.length
      ? p.carousel.slides
      : defaultCarousel.slides,
  };
  const [selected, setSelected] = useState(0),
    [projects, setProjects] = useState(false),
    [layer, setLayer] = useState("title"),
    [shapeId, setShapeId] = useState(""),
    [templates, setTemplates] = useState<any[]>([]),
    [templateName, setTemplateName] = useState(""),
    [templateSaveMessage, setTemplateSaveMessage] = useState(""),
    [templateFile, setTemplateFile] = useState("");
  const open = useRef<HTMLInputElement>(null),
    media = useRef<HTMLInputElement>(null),
    slide = c.slides[Math.min(selected, c.slides.length - 1)],
    asset = assets.find((a) => a.id === slide.imageId),
    svg = useMemo(() => svgFor(slide, c, asset), [slide, c, asset]);
  const update = (v: Partial<CarouselSettings>) =>
      onChange({
        mode: "carousel",
        carousel: { ...c, ...v },
        format: c.format,
      }),
    updateSlide = (v: Partial<CarouselSlide>) =>
      update({
        slides: c.slides.map((x) => (x.id === slide.id ? { ...x, ...v } : x)),
      }),
    selectedShape =
      (slide.shapes || []).find((shape) => shape.id === shapeId) ||
      slide.shapes?.[0],
    updateShape = (v: Partial<ShapeLayer>) => {
      if (!selectedShape) return;
      updateSlide({
        shapes: (slide.shapes || []).map((shape) =>
          shape.id === selectedShape.id ? { ...shape, ...v } : shape,
        ),
      });
    },
    extraIndex = layer.startsWith("extra-") ? Number(layer.slice(6)) : -1,
    layerStyle: TextStyle =
      extraIndex >= 0
        ? {
            ...(slide.extraTexts?.[extraIndex] || styles.body),
            font: fontName(slide.extraTexts?.[extraIndex]?.font),
          }
        : {
            ...styles[layer as keyof typeof styles],
            ...(slide[`${layer}Style` as keyof CarouselSlide] as
              TextStyle | undefined),
            font: fontName(
              (
                slide[`${layer}Style` as keyof CarouselSlide] as
                  TextStyle | undefined
              )?.font || c.font,
            ),
          };
  useEffect(() => {
    document.fonts
      ?.load(
        `${layerStyle.weight || 400} ${layerStyle.size}px "${layerStyle.font}"`,
      )
      .then(() => onChange({ ...p }))
      .catch(() => {});
  }, [layerStyle.font, layerStyle.size, layerStyle.weight]);
  const updateLayerStyle = (v: Partial<TextStyle>) =>
    extraIndex >= 0
      ? updateSlide({
          extraTexts: (slide.extraTexts || []).map((x, i) =>
            i === extraIndex ? { ...x, ...v } : x,
          ),
        })
      : updateSlide({ [`${layer}Style`]: { ...layerStyle, ...v } });
  const applyFontToAll = (font: string) => {
    const styleKeys = [
      "eyebrowStyle",
      "titleStyle",
      "bodyStyle",
      "footerStyle",
    ] as const;
    const slides = c.slides.map((current) => {
      const next = { ...current } as CarouselSlide;
      for (const key of styleKeys) {
        const style = current[key];
        if (style) next[key] = { ...style, font };
      }
      if (current.extraTexts) {
        next.extraTexts = current.extraTexts.map((x) => ({ ...x, font }));
      }
      return next;
    });
    update({ font, slides });
  };
  const refreshTemplates = () =>
    browserOnly
      ? (() => {
          const items = listBrowserTemplates("carousel");
          setTemplates(items);
          setTemplateFile((current) => current && items.some((item: any) => item.file === current) ? current : "");
        })()
      : fetch("/api/carousel/templates")
      .then((r) => r.json())
      .then((x) => {
        const items = x.items || [];
        setTemplates(items);
        setTemplateFile((current) => {
          if (current && items.some((item: any) => item.file === current))
            return current;
          const firstSlideId = c.slides[0]?.id;
          const match = items.find(
            (item: any) => item.carousel?.slides?.[0]?.id === firstSlideId,
          );
          return match?.file || current;
        });
      })
      .catch(() => {});
  useEffect(() => {
    refreshTemplates();
  }, []);
  async function saveTemplate() {
    const selectedTemplate = templates.find((t) => t.file === templateFile),
      name = templateName.trim() || selectedTemplate?.name;
    setTemplateSaveMessage("");
    if (!name) {
      setTemplateSaveMessage("Choose a template or enter a new template name");
      return;
    }
    const carousel = selectedTemplate?.name === name ? c : duplicateCarousel(c);
    try {
      if (browserOnly) {
        saveBrowserTemplate("carousel", name, carousel);
        setTemplateName("");
        setTemplateSaveMessage(`Saved ${name} in this browser`);
        refreshTemplates();
        return;
      }
      const r = await fetch("/api/carousel/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, carousel }),
      });
      if (!r.ok) throw new Error(`Save failed (${r.status})`);
      setTemplateName("");
      setTemplateSaveMessage(`Saved ${name}`);
      refreshTemplates();
    } catch (error) {
      setTemplateSaveMessage(
        error instanceof Error ? error.message : "Could not save template",
      );
    }
  }
  async function png(s: CarouselSlide, i: number) {
    const source = svgFor(
        s,
        c,
        assets.find((a) => a.id === s.imageId),
      ),
      url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" })),
      img = new Image();
    await new Promise<void>((ok, no) => {
      img.onload = () => ok();
      img.onerror = no;
      img.src = url;
    });
    const [w, h] = dimensions(c.format),
      canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob(
      (b) => b && download(`slide-${String(i + 1).padStart(2, "0")}.png`, b),
      "image/png",
    );
  }
  return (
    <div className="app carousel-app">
      <AppHeader
        name={p.name}
        mode="carousel"
        onName={(name) => onChange({ name })}
        onMode={(mode) => onChange({ mode, meme: p.meme })}
        onOpen={() => setProjects(true)}
        onNew={() => {
          setSelected(0);
          setLayer("title");
          setShapeId("");
          setTemplateFile("");
          setTemplateSaveMessage("");
          onChange({
            name: "Untitled carousel",
            mode: "carousel",
            format: defaultCarousel.format,
            carousel: duplicateCarousel(defaultCarousel),
          });
        }}
        newLabel="New carousel"
        onSave={() => onSave({ ...p, mode: "carousel", carousel: c })}
        onExport={() =>
          c.slides.forEach((s, i) => setTimeout(() => png(s, i), i * 250))
        }
        exportLabel="Export PNGs"
      />
      <input
        hidden
        ref={open}
        type="file"
        accept=".json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onOpen(JSON.parse(await f.text()));
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={media}
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const a = (await onImport(e.target.files))[0];
          if (a) updateSlide({ imageId: a.id });
          e.target.value = "";
        }}
      />
      {projects && (
        <div className="modal-backdrop" onMouseDown={() => setProjects(false)}>
          <div
            className="modal project-picker"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Open project</h2>
            <button
              className="secondary wide"
              onClick={() => open.current?.click()}
            >
              Choose project file
            </button>
            {savedProjects.map((x) => (
              <button
                className="project-row"
                key={x.filename}
                onClick={() => {
                  onOpenSaved(x.filename);
                  setProjects(false);
                }}
              >
                {x.name}
              </button>
            ))}
            <button className="text-button" onClick={() => setProjects(false)}>
              Close
            </button>
          </div>
        </div>
      )}
      <main className="carousel-layout">
        <aside className="carousel-slides">
          <div className="section-title">
            <h2>
              Slides <span>{c.slides.length}</span>
            </h2>
            <button
              className="icon"
              onClick={() => {
                const n = {
                  id: crypto.randomUUID(),
                  eyebrow: "NEW SLIDE",
                  title: "Add your headline",
                  body: "Add supporting copy",
                  footer: "",
                };
                update({ slides: [...c.slides, n] });
                setSelected(c.slides.length);
                setShapeId("");
              }}
            >
              <Plus />
            </button>
          </div>
          {c.slides.map((s, i) => (
            <button
              key={s.id}
              className={`slide-row ${i === selected ? "active" : ""}`}
              onClick={() => {
                setSelected(i);
                setShapeId(s.shapes?.[0]?.id || "");
              }}
            >
              <GripVertical size={14} />
              <span>{String(i + 1).padStart(2, "0")}</span>
              <strong>{s.title}</strong>
            </button>
          ))}
        </aside>
        <section className="carousel-stage">
          <div
            className={`carousel-preview ${c.format === "1:1" ? "square" : c.format === "3:4" ? "three-four" : "portrait"}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="carousel-stage-actions">
            <button
              className="secondary"
              onClick={() => download(`slide-${selected + 1}.svg`, svg)}
            >
              <Download size={15} /> Download SVG
            </button>
            <button className="primary" onClick={() => png(slide, selected)}>
              <Download size={15} /> Download PNG
            </button>
          </div>
          <p>
            SVG source stays editable and PNG exports at{" "}
            {dimensions(c.format).join(" × ")}
          </p>
        </section>
        <aside className="carousel-controls">
          <h2>Edit slide</h2>
          <details className="editor-section" open>
            <summary>Template library</summary>
            <div className="editor-section-body">
            <p className="template-help">
              Choose a saved layout, then edit its copy and typography below.
            </p>
            <label>
              Template
              <select
                value={templateFile}
                onChange={(e) => {
                  const t = templates.find((x) => x.file === e.target.value);
                  if (t) {
                    setTemplateSaveMessage("");
                    setTemplateFile(t.file);
                    setSelected(0);
                    setLayer("title");
                    setShapeId(t.carousel.slides?.[0]?.shapes?.[0]?.id || "");
                    update(t.carousel);
                  }
                }}
              >
                <option value="">Choose a saved template</option>
                {templates.map((t) => (
                  <option value={t.file} key={t.file}>
                    {t.name}
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
              <button className="secondary" onClick={saveTemplate}>
                Save template
              </button>
            </div>
            {templateSaveMessage && (
              <p className="template-help" role="status">
                {templateSaveMessage}
              </p>
            )}
            <FontPicker
              label="Template font"
              fonts={fonts}
              value={c.font}
              onChange={applyFontToAll}
            />
            <p className="template-help">
              Applies to every editable text layer in this carousel.
            </p>
            </div>
          </details>
          <details className="editor-section" open>
            <summary>Slide content</summary>
            <div className="editor-section-body">
          <label>
            Format
            <select
              value={c.format}
              onChange={(e) =>
                update({ format: e.target.value as CarouselSettings["format"] })
              }
            >
              <option value="4:5">Portrait · 1080 × 1350</option>
              <option value="3:4">Portrait · 1080 × 1440</option>
              <option value="1:1">Square · 1080 × 1080</option>
            </select>
          </label>
          <label>
            Eyebrow
            <input
              value={slide.eyebrow}
              onFocus={() => setLayer("eyebrow")}
              onChange={(e) => updateSlide({ eyebrow: e.target.value })}
            />
          </label>
          <label>
            Headline
            <textarea
              value={slide.title}
              onFocus={() => setLayer("title")}
              onChange={(e) => updateSlide({ title: e.target.value })}
            />
          </label>
          <label>
            Body
            <textarea
              value={slide.body}
              onFocus={() => setLayer("body")}
              onChange={(e) => updateSlide({ body: e.target.value })}
            />
          </label>
          <label>
            Footer
            <textarea
              placeholder="ALL CAPS FOOTER"
              value={slide.footer || ""}
              onFocus={() => setLayer("footer")}
              onChange={(e) => updateSlide({ footer: e.target.value })}
            />
          </label>
            </div>
          </details>
          <details className="editor-section">
            <summary>Text layers</summary>
            <div className="editor-section-body">
            <div className="section-title">
              <span className="section-description">Style and position every text layer.</span>
              <button
                className="secondary compact"
                onClick={() => {
                  const xs = [
                    ...(slide.extraTexts || []),
                    {
                      id: crypto.randomUUID(),
                      text: "New text",
                      ...styles.body,
                      y: 72,
                    },
                  ];
                  updateSlide({ extraTexts: xs });
                  setLayer(`extra-${xs.length - 1}`);
                }}
              >
                <Plus size={14} /> Add text
              </button>
            </div>
            <label>
              Edit layer
              <select value={layer} onChange={(e) => setLayer(e.target.value)}>
                <option value="eyebrow">Eyebrow</option>
                <option value="title">Headline</option>
                <option value="body">Body</option>
                <option value="footer">Footer</option>
                {(slide.extraTexts || []).map((x, i) => (
                  <option value={`extra-${i}`} key={x.id}>
                    Extra text {i + 1}
                  </option>
                ))}
              </select>
            </label>
            {extraIndex >= 0 && (
              <label>
                Text
                <textarea
                  value={slide.extraTexts?.[extraIndex]?.text || ""}
                  onChange={(e) =>
                    updateSlide({
                      extraTexts: (slide.extraTexts || []).map((x, i) =>
                        i === extraIndex ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
            )}
            <FontPicker
              label="Font"
              fonts={fonts}
              value={layerStyle.font}
              onChange={(font) =>
                updateLayerStyle({ font, weight: fontWeights[font][0] })
              }
            />
            <TextSizeColor
              size={layerStyle.size}
              color={layerStyle.color || c.text}
              min={16}
              max={200}
              onSize={(size) => updateLayerStyle({ size })}
              onColor={(color) => updateLayerStyle({ color })}
            />
            <label>
              Line height{" "}
              <span>{(layerStyle.lineHeight ?? 1.15).toFixed(2)}</span>
              <input
                type="range"
                min="0.7"
                max="2"
                step="0.05"
                value={layerStyle.lineHeight ?? 1.15}
                onChange={(e) =>
                  updateLayerStyle({ lineHeight: +e.target.value })
                }
              />
            </label>
            <label>
              Text width <span>{layerStyle.width ?? 84}%</span>
              <input
                type="range"
                min="5"
                max="100"
                value={layerStyle.width ?? 84}
                onChange={(e) => updateLayerStyle({ width: +e.target.value })}
              />
            </label>
            {fontWeights[layerStyle.font].length > 1 && (
              <label>
                Font weight
                <select
                  value={layerStyle.weight || fontWeights[layerStyle.font][0]}
                  onChange={(e) =>
                    updateLayerStyle({ weight: +e.target.value })
                  }
                >
                  {fontWeights[layerStyle.font].map((weight) => (
                    <option value={weight} key={weight}>
                      {weight}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="two-cols">
              <label>
                Horizontal <span>{layerStyle.x}%</span>
                <input
                  type="range"
                  min="3"
                  max="97"
                  value={layerStyle.x}
                  onChange={(e) => updateLayerStyle({ x: +e.target.value })}
                />
              </label>
              <label>
                Vertical <span>{layerStyle.y}%</span>
                <input
                  type="range"
                  min="3"
                  max="94"
                  value={layerStyle.y}
                  onChange={(e) => updateLayerStyle({ y: +e.target.value })}
                />
              </label>
            </div>
            <label>
              Alignment
              <select
                value={layerStyle.align}
                onChange={(e) =>
                  updateLayerStyle({
                    align: e.target.value as TextStyle["align"],
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            {extraIndex >= 0 && (
              <button
                className="danger"
                onClick={() => {
                  updateSlide({
                    extraTexts: (slide.extraTexts || []).filter(
                      (_, i) => i !== extraIndex,
                    ),
                  });
                  setLayer("title");
                }}
              >
                <Trash2 size={14} /> Remove text layer
                </button>
              )}
            </div>
          </details>
          <details className="editor-section shape-controls">
            <summary>Shape layers</summary>
            <div className="editor-section-body">
            <div className="section-title">
              <span className="section-description">Build editable accents behind text.</span>
              <button
                className="secondary compact"
                onClick={() => {
                  const shape: ShapeLayer = {
                    id: crypto.randomUUID(),
                    name: `Shape ${(slide.shapes?.length || 0) + 1}`,
                    kind: "rectangle",
                    x: 8,
                    y: 18,
                    width: 60,
                    height: 20,
                    fill: c.accent,
                    opacity: 1,
                    radius: 0,
                    strokeWidth: 0,
                    sizeMode: "fixed",
                  };
                  updateSlide({ shapes: [...(slide.shapes || []), shape] });
                  setShapeId(shape.id);
                }}
              >
                <Plus size={14} /> Add shape
              </button>
            </div>
            {slide.shapes?.length ? (
              <>
                <label>
                  Edit shape
                  <select
                    value={selectedShape?.id || ""}
                    onChange={(e) => setShapeId(e.target.value)}
                  >
                    {slide.shapes.map((shape) => (
                      <option value={shape.id} key={shape.id}>
                        {shape.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedShape && (
                  <>
                    <label>
                      Name
                      <input
                        value={selectedShape.name}
                        onChange={(e) => updateShape({ name: e.target.value })}
                      />
                    </label>
                    <label>
                      Shape
                      <select
                        value={selectedShape.kind}
                        onChange={(e) => {
                          const kind = e.target.value as ShapeKind;
                          updateShape({
                            kind,
                            sizeMode:
                              kind === "line"
                                ? "fixed"
                                : selectedShape.sizeMode || "fixed",
                          });
                        }}
                      >
                        <option value="rectangle">Rectangle</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="line">Line</option>
                      </select>
                    </label>
                    {selectedShape.kind !== "line" && (
                      <label>
                        Size behavior
                        <select
                          value={selectedShape.sizeMode || "fixed"}
                          onChange={(e) =>
                            updateShape({
                              sizeMode: e.target.value as ShapeSizeMode,
                            })
                          }
                        >
                          <option value="fixed">Fixed size</option>
                          <option value="fit-text">Fit linked text</option>
                        </select>
                      </label>
                    )}
                    {selectedShape.sizeMode === "fit-text" &&
                    selectedShape.kind !== "line" ? (
                      <>
                        <label>
                          Linked text
                          <select
                            value={selectedShape.textLayer || "title"}
                            onChange={(e) =>
                              updateShape({
                                textLayer: e.target.value as TextLayerKey,
                              })
                            }
                          >
                            {Object.entries(textLayerLabels).map(
                              ([value, label]) => (
                                <option value={value} key={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <div className="two-cols">
                          <label>
                            Side padding{" "}
                            <span>{selectedShape.paddingX ?? 24}px</span>
                            <input
                              type="range"
                              min="0"
                              max="160"
                              value={selectedShape.paddingX ?? 24}
                              onChange={(e) =>
                                updateShape({ paddingX: +e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Top padding{" "}
                            <span>{selectedShape.paddingY ?? 18}px</span>
                            <input
                              type="range"
                              min="0"
                              max="120"
                              value={selectedShape.paddingY ?? 18}
                              onChange={(e) =>
                                updateShape({ paddingY: +e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <div className="two-cols">
                          <label>
                            Horizontal nudge{" "}
                            <span>{selectedShape.offsetX ?? 0}%</span>
                            <input
                              type="range"
                              min="-20"
                              max="20"
                              value={selectedShape.offsetX ?? 0}
                              onChange={(e) =>
                                updateShape({ offsetX: +e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Vertical nudge{" "}
                            <span>{selectedShape.offsetY ?? 0}%</span>
                            <input
                              type="range"
                              min="-20"
                              max="20"
                              value={selectedShape.offsetY ?? 0}
                              onChange={(e) =>
                                updateShape({ offsetY: +e.target.value })
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="two-cols">
                          <label>
                            Horizontal <span>{selectedShape.x}%</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={selectedShape.x}
                              onChange={(e) =>
                                updateShape({ x: +e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Vertical <span>{selectedShape.y}%</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={selectedShape.y}
                              onChange={(e) =>
                                updateShape({ y: +e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <div className="two-cols">
                          <label>
                            Width <span>{selectedShape.width}%</span>
                            <input
                              type="range"
                              min="1"
                              max="100"
                              value={selectedShape.width}
                              onChange={(e) =>
                                updateShape({ width: +e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Height <span>{selectedShape.height}%</span>
                            <input
                              type="range"
                              min={selectedShape.kind === "line" ? -100 : 1}
                              max="100"
                              value={selectedShape.height}
                              onChange={(e) =>
                                updateShape({ height: +e.target.value })
                              }
                            />
                          </label>
                        </div>
                      </>
                    )}
                    <div className="color-grid shape-colors">
                      <ColorControl
                        label="Shape fill"
                        value={selectedShape.fill}
                        onChange={(fill) => updateShape({ fill })}
                      />
                      <ColorControl
                        label="Shape border"
                        value={selectedShape.stroke || selectedShape.fill}
                        onChange={(stroke) => updateShape({ stroke })}
                      />
                    </div>
                    <label>
                      Opacity{" "}
                      <span>
                        {Math.round((selectedShape.opacity ?? 1) * 100)}%
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(selectedShape.opacity ?? 1) * 100}
                        onChange={(e) =>
                          updateShape({ opacity: +e.target.value / 100 })
                        }
                      />
                    </label>
                    <label>
                      Border width{" "}
                      <span>{selectedShape.strokeWidth ?? 0}px</span>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={selectedShape.strokeWidth ?? 0}
                        onChange={(e) =>
                          updateShape({ strokeWidth: +e.target.value })
                        }
                      />
                    </label>
                    {selectedShape.kind === "rectangle" && (
                      <label>
                        Corner radius <span>{selectedShape.radius ?? 0}px</span>
                        <input
                          type="range"
                          min="0"
                          max="160"
                          value={selectedShape.radius ?? 0}
                          onChange={(e) =>
                            updateShape({ radius: +e.target.value })
                          }
                        />
                      </label>
                    )}
                    <button
                      className="danger wide"
                      onClick={() => {
                        updateSlide({
                          shapes: (slide.shapes || []).filter(
                            (shape) => shape.id !== selectedShape.id,
                          ),
                        });
                        setShapeId("");
                      }}
                    >
                      <Trash2 size={14} /> Remove shape
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="template-help">No shapes on this slide yet.</p>
            )}
            </div>
          </details>
          <details className="editor-section">
            <summary>Image layer</summary>
            <div className="editor-section-body">
            <label>
              Image
              <select
                value={slide.imageId || ""}
                onChange={(e) => updateSlide({ imageId: e.target.value })}
              >
                <option value="">No image</option>
                {assets
                  .filter((a) => a.kind === "image")
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="secondary wide"
              onClick={() => media.current?.click()}
            >
              <Upload size={15} /> Import image
            </button>
            {slide.imageId && (
              <>
                <label>
                  Image layout
                  <select
                    value={slide.imageMode || "panel"}
                    onChange={(e) =>
                      updateSlide({
                        imageMode: e.target.value as CarouselSlide["imageMode"],
                      })
                    }
                  >
                    <option value="panel">Contained panel</option>
                    <option value="full">Full-slide background</option>
                    <option value="overlay">Free overlay</option>
                  </select>
                </label>
                {slide.imageMode !== "full" && (
                  <>
                    <label>
                      Horizontal position <span>{slide.imageX ?? 8}%</span>
                      <input
                        type="range"
                        min="0"
                        max="90"
                        value={slide.imageX ?? 8}
                        onChange={(e) =>
                          updateSlide({ imageX: +e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Vertical position <span>{slide.imageY ?? 46}%</span>
                      <input
                        type="range"
                        min="0"
                        max="90"
                        value={slide.imageY ?? 46}
                        onChange={(e) =>
                          updateSlide({ imageY: +e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Width <span>{slide.imageWidth ?? 84}%</span>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={slide.imageWidth ?? 84}
                        onChange={(e) =>
                          updateSlide({ imageWidth: +e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Height <span>{slide.imageHeight ?? 34}%</span>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={slide.imageHeight ?? 34}
                        onChange={(e) =>
                          updateSlide({ imageHeight: +e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                <label>
                  Opacity{" "}
                  <span>{Math.round((slide.imageOpacity ?? 1) * 100)}%</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={(slide.imageOpacity ?? 1) * 100}
                    onChange={(e) =>
                      updateSlide({ imageOpacity: +e.target.value / 100 })
                    }
                  />
                </label>
              </>
            )}
            </div>
          </details>
          <details className="editor-section">
            <summary>Slide style</summary>
            <div className="editor-section-body">
            <div className="color-grid">
              <ColorControl
                label="Background (this slide)"
                value={slide.background || c.background}
                onChange={(background) => updateSlide({ background })}
              />
              {slide.background && (
                <button
                  className="text-button"
                  onClick={() => updateSlide({ background: undefined })}
                >
                  Use project background
                </button>
              )}
              <ColorControl
                label="Panel"
                value={c.panel}
                onChange={(panel) => update({ panel })}
              />
              <ColorControl
                label="Accent"
                value={c.accent}
                onChange={(accent) => update({ accent })}
              />
              <ColorControl
                label="Text"
                value={c.text}
                onChange={(text) => update({ text })}
              />
            </div>
            </div>
          </details>
          <div className="row-actions">
            <button
              className="secondary"
              onClick={() => {
                const n = {
                  ...slide,
                  id: crypto.randomUUID(),
                  shapes: slide.shapes?.map((shape) => ({
                    ...shape,
                    id: crypto.randomUUID(),
                  })),
                };
                update({
                  slides: [
                    ...c.slides.slice(0, selected + 1),
                    n,
                    ...c.slides.slice(selected + 1),
                  ],
                });
                setSelected(selected + 1);
                setShapeId(n.shapes?.[0]?.id || "");
              }}
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              className="danger"
              disabled={c.slides.length === 1}
              onClick={() => {
                update({ slides: c.slides.filter((x) => x.id !== slide.id) });
                setSelected(Math.max(0, selected - 1));
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
