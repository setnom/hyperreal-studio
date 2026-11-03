// ─── Model catalog (shared by frontend and backend) ───
// Credit prices guarantee ≥40% margin at the WORST revenue per credit:
//   Basic yearly = $15.99 / 800 credits = $0.0200 per credit
//   credits ≥ fal_cost / (0.60 × 0.0200)  →  ~84 credits per $1 of fal cost
// fal prices checked Nov 2026 (audio ON = worst case). Re-check when fal changes prices.
export const MIN_REVENUE_PER_CREDIT = 0.02;

// perSec = credits per second · falPerSec = fal USD/second (720p, audio on)
export const VIDEO_MODELS = [
  // ── Kling ──
  { id: "kling3_std",   family: "Kling", name: "Kling 3.0",            badge: "Standard", perSec: 12, falPerSec: 0.126, kind: "kling3",
    t2v: "fal-ai/kling-video/v3/standard/text-to-video", i2v: "fal-ai/kling-video/v3/standard/image-to-video", endFrame: true },
  { id: "kling3_pro",   family: "Kling", name: "Kling 3.0 Pro",        badge: "Pro",      perSec: 15, falPerSec: 0.168, kind: "kling3",
    t2v: "fal-ai/kling-video/v3/pro/text-to-video", i2v: "fal-ai/kling-video/v3/pro/image-to-video", endFrame: true },
  { id: "kling3_turbo", family: "Kling", name: "Kling 3.0 Turbo",      badge: "Rápido",   perSec: 15, falPerSec: 0.168, kind: "kling3",
    i2v: "fal-ai/kling-video/v3/turbo/pro/image-to-video", needsImage: true },
  { id: "kling_o3",     family: "Kling", name: "Kling 3.0 Omni",       badge: "Omni",     perSec: 13, falPerSec: 0.14,  kind: "kling3",
    t2v: "fal-ai/kling-video/o3/pro/text-to-video", i2v: "fal-ai/kling-video/o3/pro/image-to-video", endFrame: true },
  { id: "kling_o3_edit",family: "Kling", name: "Kling 3.0 Omni Edit",  badge: "Editar video", perSec: 11, falPerSec: 0.126, kind: "klingEdit",
    v2v: "fal-ai/kling-video/o3/standard/video-to-video/edit", needsVideo: true, fixedSec: 10 },
  { id: "kling4",       family: "Kling", name: "Kling 4.0",            badge: "Nuevo",    perSec: 16, falPerSec: 0.157, kind: "kling4",
    t2v: "kling/v4/text-to-video", i2v: "kling/v4/image-to-video" },
  // ── Seedance ──
  { id: "seedance25",   family: "Seedance", name: "Seedance 2.5",      badge: "Top",      perSec: 40, falPerSec: 0.473, kind: "seedance",
    t2v: "bytedance/seedance-2.5/text-to-video", i2v: "bytedance/seedance-2.5/image-to-video" },
  { id: "seedance2",    family: "Seedance", name: "Seedance 2.0",      badge: "",         perSec: 26, falPerSec: 0.303, kind: "seedance",
    t2v: "bytedance/seedance-2.0/text-to-video", i2v: "bytedance/seedance-2.0/image-to-video" },
  { id: "seedance2_fast", family: "Seedance", name: "Seedance 2.0 Fast", badge: "Rápido", perSec: 21, falPerSec: 0.242, kind: "seedance",
    t2v: "bytedance/seedance-2.0/fast/text-to-video", i2v: "bytedance/seedance-2.0/fast/image-to-video" },
];

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

export function videoCredits(model, durationSec) {
  const sec = model.fixedSec || Math.max(5, Number(durationSec) || 5);
  return model.perSec * sec;
}

export function imageCredits(model, resolution = "1K", hasRefs = false) {
  if (hasRefs && model.costWithRefs) return model.costWithRefs;
  return typeof model.cost === "number" ? model.cost : (model.cost[resolution] ?? model.cost["1K"]);
}
