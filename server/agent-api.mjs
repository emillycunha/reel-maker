const cleanText = (value, punctuation = false) => {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return punctuation ? text : text.replace(/[.,!?;:…“”"'’()[\]{}—–-]/g, "").replace(/\s+/g, " ");
};

function resolveAsset(value, assets, kind) {
  if (!value) return null;
  const matches = [...assets.values()].filter(
    (asset) => asset.id === value || asset.name === value || asset.file === value,
  );
  const asset = matches.find((item) => !kind || item.kind === kind);
  if (!asset) throw Error(`Asset not found: ${value}`);
  return asset;
}

const baseStyle = {
  preset: "Essential", font: "Arial", size: 58, color: "#ffffff",
  outline: 4, shadow: true, background: false, position: 76,
  allCaps: false, maxWords: 4,
};

export function createAgentApi({ assets, listProjects, readProject, saveProject }) {
  return async function agentApi(req, res, url, readBody, json) {
    if (!url.pathname.startsWith("/api/agent")) return false;
    if (req.method === "GET" && url.pathname === "/api/agent") {
      json(res, {
        api: "reel-maker-agent", version: 1,
        routes: {
          assets: "GET /api/agent/assets?kind=video|audio|image&q=text&limit=50",
          projects: "GET /api/agent/projects?q=text&limit=30",
          project: "GET /api/agent/projects/:filename",
          reel: "POST /api/agent/reels",
          carousel: "POST /api/agent/carousels",
          patch: "PATCH /api/agent/projects/:filename",
        },
        defaults: { shotSeconds: 2.5, maxShotSeconds: 3, captionWords: 4, captionPunctuation: false },
      });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/agent/assets") {
      const kind = url.searchParams.get("kind");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
      const all = [...assets.values()].filter((a) => (!kind || a.kind === kind) && (!q || a.name.toLowerCase().includes(q)));
      json(res, { items: all.slice(offset, offset + limit).map((a) => ({ id:a.id, name:a.name, type:a.kind, sec:+(a.duration || 0).toFixed(2), w:a.width, h:a.height })), next: offset + limit < all.length ? offset + limit : null });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/agent/projects") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 30));
      const all = (await listProjects()).filter((p) => !q || p.name.toLowerCase().includes(q));
      json(res, { items: all.slice(0, limit).map(({ filename, name, updatedAt }) => ({ file:filename, name, updated:updatedAt })), total:all.length });
      return true;
    }
    const projectRoute = url.pathname.match(/^\/api\/agent\/projects\/(.+)$/);
    if (req.method === "GET" && projectRoute) {
      const p = await readProject(projectRoute[1]);
      json(res, url.searchParams.get("view") === "full" ? p : { name:p.name, mode:p.mode || "reel", format:p.format, shots:p.shots?.length || 0, transcript:p.transcript || "", voiceover:p.voiceover || "", music:p.music || "" });
      return true;
    }
    if (req.method === "PATCH" && projectRoute) {
      const current = await readProject(projectRoute[1]);
      const patch = JSON.parse(await readBody(req));
      const next = { ...current, ...patch, style:{...current.style,...patch.style}, meme:{...current.meme,...patch.meme}, carousel:{...current.carousel,...patch.carousel} };
      const result = await saveProject(next);
      json(res, { ok:true, file:result.filename, name:result.name });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/agent/reels") {
      const input = JSON.parse(await readBody(req));
      if (!input?.name || !Array.isArray(input.shots) || !input.shots.length) throw Error("name and shots are required");
      const punctuation = input.captions?.punctuation === true;
      const shots = input.shots.map((shot, index) => {
        const asset = resolveAsset(shot.asset || shot.clip || shot.assetId, assets, "video");
        const start = Number(shot.in ?? shot.start ?? 0);
        const duration = Math.min(3, Number(shot.duration ?? ((shot.out ?? start + 2.5) - start)));
        if (!Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration < .1 || start + duration > asset.duration + .05) throw Error(`Invalid shot ${index + 1}`);
        return { id:crypto.randomUUID(), assetId:asset.id, in:start, out:start + duration, caption:cleanText(shot.caption, punctuation) };
      });
      const voice = resolveAsset(input.voiceover, assets, "audio");
      const music = resolveAsset(input.music, assets, "audio");
      const project = { version:1, mode:"reel", name:String(input.name), format:input.format || "9:16", shots, transcript:cleanText(input.transcript, punctuation), voiceover:voice?.id || "", music:music?.id || "", musicVolume:Number(input.musicVolume ?? .12), style:{...baseStyle,...input.style,maxWords:Math.min(4,Math.max(1,Number(input.style?.maxWords)||4))} };
      const result = await saveProject(project);
      json(res, { ok:true, file:result.filename, name:result.name, shots:shots.length, seconds:+shots.reduce((n,s)=>n+s.out-s.in,0).toFixed(2) }, 201);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/agent/carousels") {
      const input = JSON.parse(await readBody(req));
      if (!input?.name || !Array.isArray(input.slides) || !input.slides.length || input.slides.length > 20) throw Error("name and 1-20 slides are required");
      const slides = input.slides.map((s) => ({
        id:crypto.randomUUID(), eyebrow:String(s.eyebrow || ""), title:String(s.title || ""), body:String(s.body || ""),
        imageId:resolveAsset(s.image, assets, "image")?.id, imageMode:s.imageMode || "panel",
        imageX:s.imageX, imageY:s.imageY, imageWidth:s.imageWidth, imageHeight:s.imageHeight, imageOpacity:s.imageOpacity,
        eyebrowStyle:s.eyebrowStyle, titleStyle:s.titleStyle, bodyStyle:s.bodyStyle,
        extraTexts:Array.isArray(s.extraTexts) ? s.extraTexts.map((x) => ({ id:crypto.randomUUID(), text:String(x.text || ""), font:x.font || "Arial", size:Number(x.size || 31), x:Number(x.x ?? 8), y:Number(x.y ?? 72), align:x.align || "left", color:x.color })) : [],
      }));
      const carousel = { format:["1:1","3:4","4:5"].includes(input.format) ? input.format : "4:5", slides, background:input.theme?.background || "#10130f", panel:input.theme?.panel || "#1d2419", accent:input.theme?.accent || "#d6efab", text:input.theme?.text || "#f4f5f0", font:input.theme?.font || "Space Grotesk", padding:Number(input.theme?.padding || 84), radius:Number(input.theme?.radius || 34) };
      const project = { version:1, mode:"carousel", name:String(input.name), format:carousel.format, shots:[], transcript:"", voiceover:"", music:"", musicVolume:.12, style:baseStyle, carousel };
      const result = await saveProject(project);
      json(res, { ok:true, file:result.filename, name:result.name, slides:slides.length, format:carousel.format }, 201);
      return true;
    }
    json(res, { error:"Unknown agent endpoint", docs:"GET /api/agent" }, 404);
    return true;
  };
}
