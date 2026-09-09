export type WebMcpProject = {
  version: 1;
  name: string;
  mode?: "reel" | "meme" | "carousel";
  format: string;
  meme?: Record<string, unknown>;
  carousel?: {
    format: "1:1" | "4:5" | "3:4";
    slides: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  style: Record<string, unknown>;
  shots: unknown[];
  [key: string]: unknown;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (input: any) => unknown | Promise<unknown>;
};

type ModelContext = {
  registerTool: (
    tool: ToolDefinition,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
};

type WebMcpApi = {
  getProject: () => WebMcpProject;
  setProject: (project: WebMcpProject) => void;
  saveProject: (project: WebMcpProject) => Promise<boolean>;
  defaults: {
    reel: WebMcpProject;
    meme: Record<string, unknown>;
    carousel: WebMcpProject["carousel"];
  };
};

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const result = (message: string, project: WebMcpProject) => ({
  ok: true,
  message,
  project: {
    name: project.name,
    mode: project.mode || "reel",
    format: project.format,
    slideCount: project.carousel?.slides?.length || 0,
    shotCount: project.shots.length,
  },
});

const clone = <T>(value: T): T => structuredClone(value);

const canvasFormat = (
  mode: "reel" | "meme" | "carousel",
  current: string,
  carouselFormat?: "1:1" | "4:5" | "3:4",
) => {
  if (mode === "carousel") return carouselFormat || "4:5";
  return ["9:16", "1:1", "16:9"].includes(current) ? current : "9:16";
};

export function registerWebMcpTools(api: WebMcpApi) {
  const modelContext = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!modelContext?.registerTool) return () => {};

  const controller = new AbortController();
  const register = (tool: ToolDefinition) => {
    modelContext
      .registerTool(tool, { signal: controller.signal })
      .catch((error) => {
        console.warn(`Could not register WebMCP tool ${tool.name}`, error);
      });
  };

  register({
    name: "get_reel_maker_project",
    description:
      "Read a concise summary of the Reel Maker project currently open in this browser tab.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true },
    execute: () => result("Current project summary", api.getProject()),
  });

  register({
    name: "create_reel_maker_project",
    description:
      "Create a blank Reel, Meme, or Carousel project in the open Reel Maker page. This replaces the current unsaved editor state but does not delete saved browser projects.",
    inputSchema: objectSchema(
      {
        mode: {
          type: "string",
          enum: ["reel", "meme", "carousel"],
          description: "Editor to open for the new project.",
        },
        name: { type: "string", minLength: 1, maxLength: 120 },
      },
      ["mode"],
    ),
    annotations: { destructiveHint: true },
    execute: ({ mode, name }) => {
      const base = clone(api.defaults.reel);
      const project: WebMcpProject = {
        ...base,
        name: String(name || `Untitled ${mode}`),
        mode,
      };
      if (mode === "meme") project.meme = clone(api.defaults.meme);
      if (mode === "carousel") {
        project.carousel = clone(api.defaults.carousel);
        project.format = project.carousel!.format;
      }
      api.setProject(project);
      return result(`Created a blank ${mode} project`, project);
    },
  });

  register({
    name: "set_reel_maker_mode",
    description:
      "Switch the open project between Reel, Meme, and Carousel editors without uploading media or exporting files.",
    inputSchema: objectSchema(
      {
        mode: { type: "string", enum: ["reel", "meme", "carousel"] },
      },
      ["mode"],
    ),
    execute: ({ mode }) => {
      const current = api.getProject();
      const project = {
        ...current,
        mode,
        meme: current.meme || clone(api.defaults.meme),
        carousel: current.carousel || clone(api.defaults.carousel),
      };
      project.format = canvasFormat(
        mode,
        current.format,
        project.carousel!.format,
      );
      api.setProject(project);
      return result(`Switched to ${mode}`, project);
    },
  });

  register({
    name: "update_meme",
    description:
      "Update the text and visual settings of the open meme. This cannot select local media; the user must import background images and clips through the page.",
    inputSchema: objectSchema({
      text: { type: "string", maxLength: 500 },
      format: { type: "string", enum: ["9:16", "1:1", "16:9"] },
      textSize: { type: "number", minimum: 12, maximum: 180 },
      textColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      textFont: {
        type: "string",
        enum: ["Arial", "Helvetica", "Georgia", "Verdana"],
      },
      textPosition: { type: "number", minimum: 0, maximum: 100 },
      layout: { type: "string", enum: ["v1", "v2"] },
    }),
    execute: (input) => {
      const current = api.getProject();
      const meme = { ...(current.meme || clone(api.defaults.meme)) };
      for (const key of [
        "text",
        "textSize",
        "textColor",
        "textFont",
        "textPosition",
        "layout",
      ]) {
        if (input[key] !== undefined) meme[key] = input[key];
      }
      const project = {
        ...current,
        mode: "meme" as const,
        format: input.format || canvasFormat("meme", current.format),
        meme,
      };
      api.setProject(project);
      return result("Updated the meme", project);
    },
  });

  register({
    name: "replace_carousel_slides",
    description:
      "Replace the open carousel's text slides with supplied editable copy. Existing carousel colors and typography are preserved.",
    inputSchema: objectSchema(
      {
        name: { type: "string", minLength: 1, maxLength: 120 },
        format: { type: "string", enum: ["4:5", "3:4", "1:1"] },
        slides: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: objectSchema(
            {
              eyebrow: { type: "string", maxLength: 100 },
              title: { type: "string", maxLength: 240 },
              body: { type: "string", maxLength: 800 },
              footer: { type: "string", maxLength: 120 },
              background: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
            },
            ["title"],
          ),
        },
      },
      ["slides"],
    ),
    annotations: { destructiveHint: true },
    execute: ({ name, format, slides }) => {
      const current = api.getProject();
      const carousel = clone(current.carousel || api.defaults.carousel)!;
      carousel.format = format || carousel.format;
      carousel.slides = slides.map((slide: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        eyebrow: "",
        body: "",
        footer: "",
        ...slide,
      }));
      const project = {
        ...current,
        name: name || current.name || "Untitled carousel",
        mode: "carousel" as const,
        format: carousel.format,
        carousel,
      };
      api.setProject(project);
      return result(
        `Replaced the carousel with ${slides.length} slides`,
        project,
      );
    },
  });

  register({
    name: "set_carousel_theme",
    description:
      "Update the open carousel's colors and font while preserving all slide copy and images.",
    inputSchema: objectSchema({
      background: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      panel: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      accent: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      text: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      font: { type: "string", minLength: 1, maxLength: 80 },
    }),
    execute: (input) => {
      const current = api.getProject();
      const carousel = {
        ...clone(current.carousel || api.defaults.carousel)!,
        ...input,
      };
      const project = {
        ...current,
        mode: "carousel" as const,
        format: carousel.format,
        carousel,
      };
      api.setProject(project);
      return result("Updated the carousel theme", project);
    },
  });

  register({
    name: "save_reel_maker_project",
    description:
      "Save the current project in this browser (hosted edition) or the local Reel Maker project folder (desktop edition). This does not upload media or export files.",
    inputSchema: objectSchema({}),
    execute: async () => {
      const project = api.getProject();
      const saved = await api.saveProject(project);
      if (!saved) throw new Error("Reel Maker could not save the project.");
      return result("Saved the current project", project);
    },
  });

  return () => controller.abort();
}
