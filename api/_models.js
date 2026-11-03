// ─── Model catalog (shared by frontend and backend) ───
// Credit prices guarantee ≥40% margin at the WORST revenue per credit:
//   Basic yearly = $15.99 / 800 credits = $0.0200 per credit
//   credits ≥ fal_cost / (0.60 × 0.0200)  →  ~84 credits per $1 of fal cost
// fal prices checked Nov 2026 (audio ON = worst case). Re-check when fal changes prices.
export const MIN_REVENUE_PER_CREDIT = 0.02;

// ── VIDEO CATALOG v18 ─────────────────────────────────────────────────────────
// res[k]: perSec = credits per output second · fal = fal USD/s (worst case)
//         vin   = credits per BILLED second when a video is attached (billed = input+output, see billing)
//         inExtra = extra credits per INPUT video second (MiniMax reference tokens)
// modes: which sub-tabs the model shows (refs · frames · edit · extend) with their upload limits
// category: "create" (Crear video) or "edit" (Editar video)
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
export const MODE_LABELS = {
  frames: { es: "Fotogramas", en: "Frames" },
  refs:   { es: "Referencias", en: "References" },
  edit:   { es: "Editar video", en: "Edit video" },
  extend: { es: "Extender", en: "Extend" },
};

export const VIDEO_MODELS = [
  // ── Kling ──
  { id: "kling4", family: "Kling", name: "Kling 4.0", badge: "Nuevo", kind: "kling4", category: "create",
    durRange: [3, 30], aspects: ASPECTS, audioToggle: true,
    res: { "720p":  { perSec: 14, fal: 0.157, vin: 8,  falVin: 0.094 },
           "1080p": { perSec: 20, fal: 0.235, vin: 12, falVin: 0.141 } }, defRes: "1080p", billing: "min2x",
    modes: [
      { id: "refs",   images: 10, videos: 5, audios: 0, videoSec: 30, hint: { es: "Hasta 10 imágenes y 5 videos", en: "Up to 10 images and 5 videos" } },
      { id: "frames", frames: 10, hint: { es: "Hasta 10 fotogramas. El primero es el fotograma inicial.", en: "Up to 10 frames. The first one is the start frame." } },
      { id: "edit",   images: 4, videos: 0, source: true, sourceSec: 30, hint: { es: "El video que Kling 4.0 modifica", en: "The video Kling 4.0 edits" } },
    ],
    ep: { t2v: "kling/v4/text-to-video", i2v: "kling/v4/image-to-video", ref: "kling/v4/reference-to-video", edit: "kling/v4/video-to-video/edit" } },
  { id: "kling3_std", family: "Kling", name: "Kling 3.0", badge: "Standard", kind: "kling3", category: "create",
    durRange: [3, 15], aspects: ASPECTS, audioToggle: true,
    res: { "720p": { perSec: 12, fal: 0.126 } }, defRes: "720p",
    modes: [{ id: "frames", frames: 2, endFrame: true }],
    ep: { t2v: "fal-ai/kling-video/v3/standard/text-to-video", i2v: "fal-ai/kling-video/v3/standard/image-to-video" } },
  { id: "kling3_pro", family: "Kling", name: "Kling 3.0 Pro", badge: "Pro", kind: "kling3", category: "create",
    durRange: [3, 15], aspects: ASPECTS, audioToggle: true,
    res: { "1080p": { perSec: 15, fal: 0.168 },
           "4K":    { perSec: 36, fal: 0.42, ep: { t2v: "fal-ai/kling-video/v3/4k/text-to-video", i2v: "fal-ai/kling-video/v3/4k/image-to-video" } } }, defRes: "1080p",
    modes: [{ id: "frames", frames: 2, endFrame: true }],
    ep: { t2v: "fal-ai/kling-video/v3/pro/text-to-video", i2v: "fal-ai/kling-video/v3/pro/image-to-video" } },
  { id: "kling_o3", family: "Kling", name: "Kling 3.0 Omni", badge: "Omni", kind: "kling3", category: "create",
    durRange: [3, 15], aspects: ASPECTS, audioToggle: true,
    res: { "1080p": { perSec: 13, fal: 0.14 },
           "4K":    { perSec: 36, fal: 0.42, needsImage: true, ep: { i2v: "fal-ai/kling-video/o3/4k/image-to-video" } } }, defRes: "1080p",
    modes: [{ id: "frames", frames: 2, endFrame: true }],
    ep: { t2v: "fal-ai/kling-video/o3/pro/text-to-video", i2v: "fal-ai/kling-video/o3/pro/image-to-video" } },
  { id: "kling3_turbo", family: "Kling", name: "Kling 3.0 Turbo", badge: "Rápido", kind: "kling3", category: "create",
    durOptions: [5, 10], audioToggle: true,
    res: { "1080p": { perSec: 15, fal: 0.168 } }, defRes: "1080p",
    modes: [{ id: "frames", frames: 1, needsImage: true }],
    ep: { i2v: "fal-ai/kling-video/v3/turbo/pro/image-to-video" } },
  { id: "kling_o3_edit", family: "Kling", name: "Kling 3.0 Omni Edit", badge: "Editar", kind: "klingO3Edit", category: "edit",
    res: { "720p": { perSec: 11, fal: 0.126 } }, defRes: "720p",
    modes: [{ id: "edit", images: 4, videos: 0, source: true, sourceSec: 10, hint: { es: "Video de hasta 10s", en: "Video up to 10s" } }],
    ep: { edit: "fal-ai/kling-video/o3/standard/video-to-video/edit" } },
  // ── Seedance ──
  { id: "seedance25", family: "Seedance", name: "Seedance 2.5", badge: "Top", kind: "seedance", category: "create",
    durRange: [4, 30], aspects: ASPECTS,
    // Priced for ≥40% margin on monthly plans ($0.025/credit) per Juan's decision (Nov 2026)
    res: { "480p":  { perSec: 15, fal: 0.2205, vin: 9,  falVin: 0.1323 },
           "720p":  { perSec: 32, fal: 0.473,  vin: 19, falVin: 0.2838 },
           "1080p": { perSec: 78, fal: 1.164,  vin: 47, falVin: 0.6984 } }, defRes: "720p", billing: "sum",
    modes: [
      { id: "frames", frames: 2, endFrame: true },
      { id: "refs",   images: 9, videos: 3, audios: 3, videoSec: 15, hint: { es: "Imagen, video o audio · @Image1 @Video1 @Audio1", en: "Image, video or audio · @Image1 @Video1 @Audio1" } },
      { id: "extend", images: 0, videos: 0, source: true, sourceSec: 15, hint: { es: "Continúa un video desde su último frame", en: "Continues a video from its last frame" } },
    ],
    ep: { t2v: "bytedance/seedance-2.5/text-to-video", i2v: "bytedance/seedance-2.5/image-to-video", ref: "bytedance/seedance-2.5/reference-to-video" } },
  { id: "seedance25_draft", family: "Seedance", name: "Seedance 2.5 Draft", badge: "Borrador", kind: "seedance", category: "create", draft: true,
    durRange: [4, 30], aspects: ASPECTS,
    res: { "480p": { perSec: 15, fal: 0.2205, vin: 9, falVin: 0.1323 } }, defRes: "480p", billing: "sum",
    complete: { perSec: 78, fal: 1.164, ep: "bytedance/seedance-2.5/draft/complete" },
    modes: [
      { id: "refs",   images: 9, videos: 3, audios: 3, videoSec: 15, hint: { es: "Imagen, video o audio", en: "Image, video or audio" } },
      { id: "frames", frames: 2, endFrame: true },
    ],
    ep: { t2v: "bytedance/seedance-2.5/text-to-video", i2v: "bytedance/seedance-2.5/image-to-video", ref: "bytedance/seedance-2.5/reference-to-video" } },
  { id: "seedance2", family: "Seedance", name: "Seedance 2.0", badge: "", kind: "seedance", category: "create",
    durRange: [4, 15], aspects: ASPECTS,
    res: { "480p": { perSec: 13, fal: 0.141 }, "720p": { perSec: 26, fal: 0.303 }, "1080p": { perSec: 58, fal: 0.682 } }, defRes: "720p",
    modes: [{ id: "frames", frames: 2, endFrame: true }],
    ep: { t2v: "bytedance/seedance-2.0/text-to-video", i2v: "bytedance/seedance-2.0/image-to-video" } },
  { id: "seedance2_fast", family: "Seedance", name: "Seedance 2.0 Fast", badge: "Rápido", kind: "seedance", category: "create",
    durRange: [4, 15], aspects: ASPECTS,
    res: { "480p": { perSec: 10, fal: 0.113 }, "720p": { perSec: 21, fal: 0.242 } }, defRes: "720p",
    modes: [{ id: "frames", frames: 2, endFrame: true }],
    ep: { t2v: "bytedance/seedance-2.0/fast/text-to-video", i2v: "bytedance/seedance-2.0/fast/image-to-video" } },
  // ── Wan ──
  { id: "wan3", family: "Wan", name: "Wan 3.0", badge: "", kind: "wan3", category: "create",
    durRange: [2, 30], aspects: ASPECTS, audioToggle: true,
    res: { "480p": { perSec: 5, fal: 0.05 }, "720p": { perSec: 9, fal: 0.10 }, "1080p": { perSec: 17, fal: 0.20 } }, defRes: "1080p",
    modes: [
      { id: "frames", frames: 2, endFrame: true },
      { id: "refs",   images: 10, videos: 5, audios: 5, videoSec: 15, hint: { es: "Hasta 10 imágenes, 5 videos y 5 audios", en: "Up to 10 images, 5 videos and 5 audio files" } },
    ],
    ep: { t2v: "alibaba/wan-3.0/text-to-video", i2v: "alibaba/wan-3.0/image-to-video", ref: "alibaba/wan-3.0/reference-to-video" } },
  // ── FLUX ──
  { id: "flux3max", family: "FLUX", name: "FLUX 3 Max", badge: "Nuevo", kind: "flux3", category: "create",
    durRange: [5, 20], aspects: ["16:9", "9:16", "1:1"], audioToggle: true,
    // fal list price after the promo (Nov 7): 720p $0.17/s · 1080p $0.29/s
    res: { "720p": { perSec: 15, fal: 0.17 }, "1080p": { perSec: 25, fal: 0.29 } }, defRes: "720p",
    modes: [ { id: "frames", frames: 2, endFrame: true } ],
    ep: { t2v: "blackforestlabs/flux-3-max/text-to-video", i2v: "blackforestlabs/flux-3-max/image-to-video" } },
  // ── MiniMax ──
  { id: "minimax_h3", family: "MiniMax", name: "MiniMax H3 Max", badge: "", kind: "minimax", category: "create",
    durRange: [5, 15], aspects: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    res: { "480p": { perSec: 5, fal: 0.05, inExtra: 1 }, "768p": { perSec: 7, fal: 0.08, inExtra: 7 }, "1080p": { perSec: 14, fal: 0.16, inExtra: 7 } }, defRes: "768p",
    modes: [
      { id: "refs",   images: 4, videos: 2, audios: 2, videoSec: 10, hint: { es: "Hasta 4 imágenes, 2 videos y 2 audios", en: "Up to 4 images, 2 videos and 2 audio files" } },
      { id: "frames", frames: 2, endFrame: true },
    ],
    ep: { t2v: "minimax/h3-max/text-to-video", i2v: "minimax/h3-max/image-to-video", ref: "minimax/h3-max/reference-to-video" } },
];

// ── NanoJutsu (Jutsu tab) — Seedance 2.5 reference-to-video with hidden expert prompts ──
// Output length follows the source video (4–30 s). fal bills input + output seconds (×0.6 rate) → credits = vin × (in + out).
VIDEO_MODELS.push({
  id: "nanojutsu", family: "NanoJutsu", name: "NanoJutsu", badge: "Nuevo", kind: "jutsu", category: "jutsu",
  res: { "480p":  { perSec: 15, fal: 0.2205, vin: 9,  falVin: 0.1323 },
         "720p":  { perSec: 32, fal: 0.473,  vin: 19, falVin: 0.2838 },
         "1080p": { perSec: 78, fal: 1.164,  vin: 47, falVin: 0.6984 } }, defRes: "480p",
  modes: [
    { id: "motion", source: true, sourceSec: 30, minSourceSec: 4, images: 12, outFromSource: true },
    { id: "swap",   source: true, sourceSec: 30, minSourceSec: 4, images: 12, outFromSource: true },
  ],
  ep: { ref: "bytedance/seedance-2.5/reference-to-video" },
});

export const findVideoModel = (id) => VIDEO_MODELS.find(m => m.id === id) || VIDEO_MODELS[0];
export const modelResolutions = (m) => Object.keys(m.res);
export const pickRes = (m, res) => (m.res[res] ? res : m.defRes);
export const pickMode = (m, mode) => (m.modes.find(x => x.id === mode) || m.modes[0]);
export function clampDuration(m, sec) {
  const n = Math.round(Number(sec) || 5);
  if (m.durOptions) return m.durOptions.includes(n) ? n : m.durOptions[0];
  if (m.durRange) return Math.min(m.durRange[1], Math.max(m.durRange[0], n));
  return 5;
}

// inputSec = total seconds of attached video(s) (refs / source). The server re-measures them.
export function videoCredits(model, durationSec, res, inputSec = 0, mode = "frames", extras = {}) {
  const r = model.res[pickRes(model, res)];
  const md = pickMode(model, mode);
  const inSec = Math.ceil(inputSec || 0);
  // NanoJutsu: output = source length; billed input + output
  if (md.outFromSource) {
    const src = Math.min(30, Math.max(4, inSec || md.sourceSec));
    return Math.ceil(r.vin * (src + src));
  }
  // Edit modes: output length = source length
  if (md.id === "edit") {
    const src = Math.max(3, inSec || md.sourceSec);
    if (model.kind === "klingO3Edit") return r.perSec * src;
    if (r.vin) return Math.ceil(r.vin * Math.max(src * 2, src + src)); // input + output, min 2× output
    return r.perSec * src;
  }
  const out = clampDuration(model, durationSec);
  if (inSec > 0 && r.vin) {
    const billed = model.billing === "min2x" ? Math.max(out + inSec, 2 * out) : out + inSec;
    return Math.ceil(r.vin * billed);
  }
  // MiniMax: images/audio beyond the free reference allowance when videos/audio are attached (~$0.02 each)
  const tokenExtra = model.kind === "minimax" && (inSec > 0 || extras.nAudios) ? 2 * ((extras.nImages || 0) + (extras.nAudios || 0)) : 0;
  return r.perSec * out + (inSec > 0 && r.inExtra ? Math.ceil(r.inExtra * inSec) : 0) + tokenExtra;
}

export function draftCompleteCredits(model, durationSec) {
  return model.complete ? model.complete.perSec * clampDuration(model, durationSec) : 0;
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
    t2i: "fal-ai/gpt-image-2", edit: "openai/gpt-image-2/edit", maxRefs: 14,
    // input image tokens scale with the number of refs → price by tiers (≥40% margin at $0.02/credit)
    // GPT is billed by tokens: output size × quality + every input image. Credits = base(quality) + 3 per reference (+2 ID Sheet long prompt)
    gptQualities: { medium: { base: 10, fal: 0.06, label: { es: "Media", en: "Medium" } },
                    high:   { base: 24, fal: 0.211, label: { es: "Alta", en: "High" } },
                    high2k: { base: 48, fal: 0.475, label: { es: "Alta 2K", en: "High 2K" } } },
    perRef: 3, idSheetExtra: 2 },
  { id: "flux2pro", family: "Black Forest Labs", name: "FLUX.2 Pro", badge: "",     kind: "flux",
    cost: 5, costWithRefs: 10, falCost: 0.045, falCostWithRefs: 0.09,
    t2i: "fal-ai/flux-2-pro", edit: "fal-ai/flux-2-pro/edit", maxRefs: 4 },
  { id: "seedream5",family: "ByteDance",name: "Seedream 5.0 Pro", badge: "",        kind: "seedream",
    cost: 6, falCost: 0.0675,
    t2i: "bytedance/seedream/v5/pro/text-to-image", maxRefs: 0 },
];

export const findImageModel = (id) => IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0];

export function imageCredits(model, resolution = "1K", hasRefs = false, opts = {}) {
  if (model.gptQualities) {
    const q = model.gptQualities[opts.gptQuality] || model.gptQualities.high;
    const n = hasRefs ? Math.max(1, Math.min(model.maxRefs || 1, Number(opts.nRefs) || 1)) : 0;
    return q.base + n * (model.perRef || 0) + (opts.style === "idsheet" ? (model.idSheetExtra || 0) : 0);
  }
  if (hasRefs && model.costWithRefs) return model.costWithRefs;
  return typeof model.cost === "number" ? model.cost : (model.cost[resolution] ?? model.cost["1K"]);
}

// ─── Vid Pro (Wavespeed · bytedance/seedance-2.5/image-to-video-spicy) ───
// Juan's real cost per second (30 s quotes): 480p $5.50 · 720p $10.80 · 1080p $27 · 4K $54.
// credits/s = cost/s ÷ (0.6 × $0.025) → ≥40% margin on monthly plans (same basis as Seedance 2.5 / NanoJutsu).
export const WS_VID_RATES = {
  "480p":  { perSec: 13,  cost: 5.5 / 30 },
  "720p":  { perSec: 24,  cost: 10.8 / 30 },
  "1080p": { perSec: 60,  cost: 27 / 30 },
  "4k":    { perSec: 120, cost: 54 / 30 },
};
export const WS_VID_DUR = [5, 30]; // seconds (slider)
export const wsVidRes = (r) => (WS_VID_RATES[r] ? r : "720p");
export const wsVidDur = (d) => Math.max(WS_VID_DUR[0], Math.min(WS_VID_DUR[1], Math.round(Number(d) || 5)));
export const wsVidCredits = (dur, res) => WS_VID_RATES[wsVidRes(res)].perSec * wsVidDur(dur);
