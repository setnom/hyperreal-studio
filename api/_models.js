// ─── Model catalog (shared by frontend and backend) ───
// Credit prices guarantee ≥40% margin at the WORST revenue per credit:
//   Basic yearly = $15.99 / 800 credits = $0.0200 per credit
//   credits ≥ fal_cost / (0.60 × 0.0200)  →  ~84 credits per $1 of fal cost
// fal prices checked Nov 2026 (audio ON = worst case). Re-check when fal changes prices.
export const MIN_REVENUE_PER_CREDIT = 0.02;

// res: per-resolution pricing. perSec = credits/second · fal = fal USD/second (worst case, audio on)
//      vin = credits per BILLED second when a video is attached (fal bills input+output seconds × 0.6)
// durRange: [min,max] seconds for the slider · durOptions: fixed choices when the model only takes those
// modes (Seedance 2.5): frames = text/first-last frame · omni = references (images+video) · extend = continue a video
export const VIDEO_MODELS = [
  // ── Kling ──
  { id: "kling3_std",   family: "Kling", name: "Kling 3.0",       badge: "Standard", kind: "kling3", durRange: [3, 15],
    res: { "720p": { perSec: 12, fal: 0.126 } }, defRes: "720p",
    t2v: "fal-ai/kling-video/v3/standard/text-to-video", i2v: "fal-ai/kling-video/v3/standard/image-to-video", endFrame: true },
  { id: "kling3_pro",   family: "Kling", name: "Kling 3.0 Pro",   badge: "Pro",      kind: "kling3", durRange: [3, 15],
    res: { "1080p": { perSec: 15, fal: 0.168 },
           "4K":    { perSec: 36, fal: 0.42, t2v: "fal-ai/kling-video/v3/4k/text-to-video", i2v: "fal-ai/kling-video/v3/4k/image-to-video" } }, defRes: "1080p",
    t2v: "fal-ai/kling-video/v3/pro/text-to-video", i2v: "fal-ai/kling-video/v3/pro/image-to-video", endFrame: true },
  { id: "kling3_turbo", family: "Kling", name: "Kling 3.0 Turbo", badge: "Rápido",   kind: "kling3", durOptions: [5, 10],
    res: { "1080p": { perSec: 15, fal: 0.168 } }, defRes: "1080p",
    i2v: "fal-ai/kling-video/v3/turbo/pro/image-to-video", needsImage: true },
  { id: "kling_o3",     family: "Kling", name: "Kling 3.0 Omni",  badge: "Omni",     kind: "kling3", durRange: [3, 15],
    res: { "1080p": { perSec: 13, fal: 0.14 },
           "4K":    { perSec: 36, fal: 0.42, i2v: "fal-ai/kling-video/o3/4k/image-to-video", needsImage: true } }, defRes: "1080p",
    t2v: "fal-ai/kling-video/o3/pro/text-to-video", i2v: "fal-ai/kling-video/o3/pro/image-to-video", endFrame: true },
  { id: "kling_o3_edit",family: "Kling", name: "Kling 3.0 Omni Edit", badge: "Editar video", kind: "klingEdit", maxInputSec: 10,
    res: { "720p": { perSec: 11, fal: 0.126 } }, defRes: "720p",
    v2v: "fal-ai/kling-video/o3/standard/video-to-video/edit", needsVideo: true },
  { id: "kling4",       family: "Kling", name: "Kling 4.0",       badge: "Nuevo",    kind: "kling4", durOptions: [5, 10],
    res: { "720p": { perSec: 16, fal: 0.157 }, "1080p": { perSec: 24, fal: 0.235 } }, defRes: "720p",
    t2v: "kling/v4/text-to-video", i2v: "kling/v4/image-to-video" },
  // ── Seedance ──
  { id: "seedance25",   family: "Seedance", name: "Seedance 2.5", badge: "Top", kind: "seedance", durRange: [4, 30],
    res: { "480p": { perSec: 19, fal: 0.2205, vin: 12 }, "720p": { perSec: 40, fal: 0.473, vin: 24 } }, defRes: "720p",
    modes: ["frames", "omni", "extend"], maxInputSec: 15,
    t2v: "bytedance/seedance-2.5/text-to-video", i2v: "bytedance/seedance-2.5/image-to-video", ref: "bytedance/seedance-2.5/reference-to-video" },
  { id: "seedance2",    family: "Seedance", name: "Seedance 2.0", badge: "",    kind: "seedance", durRange: [4, 15],
    res: { "480p": { perSec: 13, fal: 0.141 }, "720p": { perSec: 26, fal: 0.303 }, "1080p": { perSec: 58, fal: 0.682 } }, defRes: "720p",
    t2v: "bytedance/seedance-2.0/text-to-video", i2v: "bytedance/seedance-2.0/image-to-video" },
  { id: "seedance2_fast", family: "Seedance", name: "Seedance 2.0 Fast", badge: "Rápido", kind: "seedance", durRange: [4, 15],
    res: { "480p": { perSec: 10, fal: 0.113 }, "720p": { perSec: 21, fal: 0.242 } }, defRes: "720p",
    t2v: "bytedance/seedance-2.0/fast/text-to-video", i2v: "bytedance/seedance-2.0/fast/image-to-video" },
];

export const modelResolutions = (m) => Object.keys(m.res);
export const pickRes = (m, res) => (m.res[res] ? res : m.defRes);
export function clampDuration(m, sec) {
  const n = Math.round(Number(sec) || 5);
  if (m.durOptions) return m.durOptions.includes(n) ? n : m.durOptions[0];
  if (m.durRange) return Math.min(m.durRange[1], Math.max(m.durRange[0], n));
  return 5;
}

// cost: number or { "1K","2K","4K" } · costWithRefs: price when reference images are sent
export const IMAGE_MODELS = [
  { id: "nb2",      family: "Google",   name: "Nano Banana 2",    badge: "",        kind: "nano",
    cost: { "1K": 8, "2K": 11, "4K": 14 }, falCost: { "1K": 0.08, "2K": 0.12, "4K": 0.16 },
    t2i: "fal-ai/nano-banana-2", edit: "fal-ai/nano-banana-2/edit", maxRefs: 14 },
  { id: "nbpro",    family: "Google",   name: "Nano Banana Pro",  badge: "Pro",     kind: "nano",
    cost: { "1K": 13, "2K": 13, "4K": 26 }, falCost: { "1K": 0.15, "2K": 0.15, "4K": 0.30 },
    t2i: "fal-ai/nano-banana-pro", edit: "fal-ai/nano-banana-pro/edit", maxRefs: 14 },
  { id: "gpt2",     family: "OpenAI",   name: "GPT Image 2",      badge: "Máx realismo", kind: "gpt",
    cost: 24, costWithRefs: 32, falCost: 0.211, falCostWithRefs: 0.37,
    t2i: "fal-ai/gpt-image-2", edit: "openai/gpt-image-2/edit", maxRefs: 4 },
  { id: "flux2pro", family: "Black Forest Labs", name: "FLUX.2 Pro", badge: "",     kind: "flux",
    cost: 5, costWithRefs: 10, falCost: 0.045, falCostWithRefs: 0.09,
    t2i: "fal-ai/flux-2-pro", edit: "fal-ai/flux-2-pro/edit", maxRefs: 4 },
  { id: "seedream5",family: "ByteDance",name: "Seedream 5.0 Pro", badge: "",        kind: "seedream",
    cost: 6, falCost: 0.0675,
    t2i: "bytedance/seedream/v5/pro/text-to-image", maxRefs: 0 },
];

export const findVideoModel = (id) => VIDEO_MODELS.find(m => m.id === id) || VIDEO_MODELS[0];
export const findImageModel = (id) => IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0];

// inputSec = seconds of attached video (omni / extend / edit). Server re-measures it — never trusts the client.
export function videoCredits(model, durationSec, res, inputSec = 0, mode = "frames") {
  const r = model.res[pickRes(model, res)];
  if (model.kind === "klingEdit") return r.perSec * Math.max(3, Math.ceil(inputSec || model.maxInputSec));
  const out = clampDuration(model, durationSec);
  if (inputSec > 0 && r.vin && (mode === "omni" || mode === "extend")) return Math.ceil(r.vin * (out + Math.ceil(inputSec)));
  return r.perSec * out;
}

export function imageCredits(model, resolution = "1K", hasRefs = false) {
  if (hasRefs && model.costWithRefs) return model.costWithRefs;
  return typeof model.cost === "number" ? model.cost : (model.cost[resolution] ?? model.cost["1K"]);
}
