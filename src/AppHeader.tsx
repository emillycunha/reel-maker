import { Download, ExternalLink, Film, FolderOpen, Images, Plus, Sparkles } from "lucide-react";
import { browserOnly } from "./browserStorage";

export type EditorMode = "reel" | "meme" | "carousel";

type Props = {
  name: string;
  mode: EditorMode;
  onName: (name: string) => void;
  onMode: (mode: EditorMode) => void;
  onOpen: () => void;
  onNew?: () => void;
  newLabel?: string;
  onSave: () => void;
  onExport: () => void;
  exportLabel: string;
  saving?: boolean;
  exportDisabled?: boolean;
};

export default function AppHeader(props: Props) {
  return (
    <header className="app-header">
      <button className="brand" onClick={() => props.onMode("reel")}>
        <span className="brand-icon"><Film size={21} /></span>
        reel<span className="brand-light">maker</span>
        <span className="beta">BETA</span>
      </button>
      <div className="project-name">
        <input aria-label="Project name" value={props.name} onChange={(e) => props.onName(e.target.value)} />
        <span><span className="dot" /> {browserOnly ? "Saved in this browser" : "Saved in project/saved"}</span>
      </div>
      <div className="header-actions">
        <div className="mode-switcher" aria-label="Editor mode">
          <button className={props.mode === "reel" ? "active" : ""} onClick={() => props.onMode("reel")} title="Reel mode"><Film size={15} /> Reel</button>
          <button className={props.mode === "meme" ? "active" : ""} onClick={() => props.onMode("meme")} title="Meme mode"><Sparkles size={15} /> Meme</button>
          <button className={props.mode === "carousel" ? "active" : ""} onClick={() => props.onMode("carousel")} title="Carousel builder"><Images size={15} /> Carousel</button>
        </div>
        <button className="secondary" onClick={props.onOpen}><FolderOpen size={15} /> Open project</button>
        {props.onNew && <button className="secondary" onClick={props.onNew}><Plus size={15} /> {props.newLabel || "New project"}</button>}
        <button className="secondary" disabled={props.saving} onClick={props.onSave}><Download size={15} /> {props.saving ? "Saving…" : "Save project"}</button>
        <button className="primary" disabled={props.exportDisabled} onClick={props.onExport}>{props.exportLabel} <Download size={15} /></button>
        {browserOnly && <a className="secondary header-source" href="https://github.com/emillycunha/reel-maker" target="_blank" rel="noreferrer">Source <ExternalLink size={14} /></a>}
      </div>
    </header>
  );
}
