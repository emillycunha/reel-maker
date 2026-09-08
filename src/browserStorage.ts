const PREFIX = "reel-maker.browser.v1";

export const browserOnly =
  typeof window !== "undefined" &&
  (import.meta.env.VITE_BROWSER_ONLY === "true" ||
    !["localhost", "127.0.0.1"].includes(window.location.hostname));

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(`${PREFIX}.${key}`) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(value));
}

function safeName(name: string) {
  return String(name || "Untitled project")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled project";
}

export type BrowserSavedProject = {
  filename: string;
  name: string;
  updatedAt: string;
  size: number;
  project: any;
};

export function listBrowserProjects() {
  return read<BrowserSavedProject[]>("projects", []).slice().sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function saveBrowserProject(project: any) {
  const name = safeName(project.name);
  const filename = `${name}.reel.json`;
  const serialized = JSON.stringify(project);
  const item: BrowserSavedProject = {
    filename,
    name,
    updatedAt: new Date().toISOString(),
    size: new Blob([serialized]).size,
    project,
  };
  const projects = listBrowserProjects().filter((x) => x.filename !== filename);
  write("projects", [item, ...projects]);
  return item;
}

export function openBrowserProject(filename: string) {
  return listBrowserProjects().find((x) => x.filename === filename)?.project;
}

export type BrowserTemplate = {
  file: string;
  name: string;
  [key: string]: any;
};

export function listBrowserTemplates(kind: "meme" | "carousel") {
  return read<BrowserTemplate[]>(`${kind}.templates`, []);
}

export function saveBrowserTemplate(
  kind: "meme" | "carousel",
  name: string,
  value: any,
) {
  const cleanName = safeName(name);
  const file = `${cleanName}.${kind}.json`;
  const item = { file, name: cleanName, [kind]: value };
  const items = listBrowserTemplates(kind).filter((x) => x.file !== file);
  write(`${kind}.templates`, [item, ...items]);
  return item;
}
