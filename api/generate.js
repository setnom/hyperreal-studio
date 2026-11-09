import { deductCredits, addCredits, insufficientMsg } from "./_credits.js";
import { buildIdSheetPrompt } from "./_idsheet.js";
import { VIDEO_MODELS, IMAGE_MODELS, findImageModel, videoCredits, imageCredits, clampDuration, pickRes, pickMode, draftCompleteCredits } from "./_models.js";
import { probeVideoSeconds } from "./_media.js";
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

// In-memory rate limit — secondary defense (primary is atomic credit deduction in Supabase)
// Note: resets per serverless instance, but the atomic deduction in DB is the real guard
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 5;        // max 5 generate requests per minute per user

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimits.set(userId, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Supabase-backed rate limit — persists across all serverless instances
// Checks last_generate_at timestamp in profiles table
async function checkDbRateLimit(userId, serviceKey) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=last_generate_at`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = await res.json();
    const lastAt = rows?.[0]?.last_generate_at;
    if (lastAt) {
      const diff = Date.now() - new Date(lastAt).getTime();
      if (diff < 3000) return false; // min 3 seconds between requests globally
    }
    // Update last_generate_at
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ last_generate_at: new Date().toISOString() }),
    });
    return true;
  } catch { return true; } // fail open to not block legitimate users
}

const PLAN_CREDITS = {
  test:    { images: 20,  videos: 2  },
  basic:   { images: 40,  videos: 8  },
  pro:     { images: 90,  videos: 18 },
  creator: { images: 200, videos: 30 },
};

const RESOLUTION_MAP   = { test: "1K", basic: "1K", pro: "2K", creator: "4K" };
const MAX_DURATION     = { test: 5, basic: 5, pro: 8, creator: 10 };
const VALID_TYPES      = ["image", "video"];
const VALID_RATIOS_IMG = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"];
const VALID_RATIOS_VID = ["16:9", "9:16", "1:1"];
const MAX_PROMPT_LEN   = 2000;

function sbServiceHeaders(contentType = false) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY not configured");
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  if (contentType) h["Content-Type"] = "application/json";
  return h;
}

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY not configured");
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` },
  });
  const user = await res.json();
  if (!user?.id) throw new Error("Invalid session");
  return user.id;
}

const ALLOWED_MEDIA_HOSTS = [
  "pygcsyqahhdtmwmqklnl.supabase.co", "storage.googleapis.com",
  "fal.run", "cdn.fal.run", "v3b.fal.media", "v2.fal.media", "fal.media", "nanobanano.studio",
];
function isSafeImageUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === "https:" && ALLOWED_MEDIA_HOSTS.some(h => p.hostname === h || p.hostname.endsWith("." + h));
  } catch { return false; }
}

// ── NanoJutsu hidden prompts (never shown to the user) ──
const JUTSU_PROMPTS = {
  motion: "Recreate @Video1 shot-for-shot with the new subject from the reference images. Replace the main character in @Video1 with the person or character shown in @Image1; additional references (@Image2, @Image3…) define their outfit, accessories, products or props. Preserve EXACTLY from @Video1: every body movement, gesture, pose, step, timing and rhythm; facial expressions and head motion; lip movements perfectly synced to the original speech; camera framing, camera movement, lens and focal length; shot composition and duration; lighting direction, color temperature and shadows; the background, set and every secondary person and object. Take from the references: identity, face, skin tone, hairstyle, body proportions, clothing, accessories and products, consistent and photorealistic in every frame with no flicker, warping, morphing or identity drift. Match the new subject to the scene's lighting, film grain, depth of field and motion blur so it looks filmed in-camera. Keep the original audio, voices and dialogue timing.",
  swap: "Edit @Video1 by replacing exactly ONE object with the object shown in @Image1 (any additional images show other angles or details of that same object). Find the object in @Video1 that is equivalent to @Image1 in function, category or placement (a drink for a drink, a bag for a bag, a phone for a phone, a shoe for a shoe, a car for a car), or the object named in the additional instructions, and swap it for an exact replica of @Image1: same shape, proportions, materials, colors, logos, labels, printed text and fine details. Scale it correctly for the scene and for the hands or body interacting with it, and keep every interaction identical: grip, finger placement, contact points and occlusions when hands or people pass in front of it. Track it perfectly through camera movement, rotation, perspective changes, motion blur, depth of field and focus pulls. Relight it to match the scene: light direction, intensity, color temperature, reflections, specular highlights, and cast and contact shadows. Everything else in @Video1 must stay identical: people, faces, movements, lip sync, background, camera, framing, timing, color grade and audio. Do not add, remove or alter any other object. No flicker, morphing or texture swimming.",
};

function sanitizePrompt(prompt) {
  if (typeof prompt !== "string") return "";
  return prompt.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, MAX_PROMPT_LEN);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "Server misconfiguration" });

  const { type, prompt: rawPrompt, user_prompt: rawUserPrompt, aspect_ratio, style_id, image_quality, duration, audio,
          image_urls, start_frame, end_frame, multishot, max_realism, model_id, video_url, resolution, mode, video_urls, audio_urls, middle_frames, gen_id, user_token, char_height, gpt_quality } = req.body || {};

  // Validate style_id against allowed values only
  const VALID_STYLE_IDS = ["photorealistic", "cinematic", "product", "portrait", "pixar", "ads", "neutral", "restore", "colorize", "idsheet"];
  const safeStyleId = VALID_STYLE_IDS.includes(style_id) ? style_id : "photorealistic";

  if (!user_token || typeof user_token !== "string")
    return res.status(401).json({ error: "Authentication required" });

  const isDraftComplete = type === "video" && mode === "complete";
  const isJutsu = type === "video" && model_id === "nanojutsu";
  const prompt = isJutsu ? (sanitizePrompt(rawUserPrompt) || "jutsu") : (sanitizePrompt(rawPrompt) || (isDraftComplete ? "draft" : ""));
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  if (!VALID_TYPES.includes(type))
    return res.status(400).json({ error: "Invalid type" });

  const isVid = type === "video";
  const validRatios = isVid ? VALID_RATIOS_VID : VALID_RATIOS_IMG;
  const safeRatio = validRatios.includes(aspect_ratio) ? aspect_ratio : (isVid ? "16:9" : "1:1");

  let userId;
  try {
    userId = await verifyToken(user_token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (!checkRateLimit(userId))
    return res.status(429).json({ error: "Too many requests. Wait a moment and try again." });

  // DB-backed rate limit (persists across serverless instances)
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (SERVICE_KEY) {
    const dbAllowed = await checkDbRateLimit(userId, SERVICE_KEY);
    if (!dbAllowed)
      return res.status(429).json({ error: "Please wait a moment before generating again." });
  }

  // Fetch profile with SERVICE KEY — cannot be spoofed by user
  let profile;
  try {
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,credits,subscription_status`,
      { headers: sbServiceHeaders() }
    );
    const profiles = await profileRes.json();
    profile = profiles?.[0];
    if (!profile) return res.status(403).json({ error: "Profile not found" });
  } catch {
    return res.status(500).json({ error: "Failed to verify profile" });
  }

  const { plan: userPlan, credits: creditsBalance = 0, subscription_status } = profile;

  if (!userPlan || userPlan === "none" || !PLAN_CREDITS[userPlan])
    return res.status(403).json({ error: "No active plan. Please subscribe first." });

  // Block generation if subscription has payment issues
  if (subscription_status === "payment_failed")
    return res.status(403).json({ error: "Your subscription has a payment issue. Please resolve it to continue generating." });

  // Duration capped by plan — computed early because video cost depends on it
  const allowedDuration = Math.min(
    Math.max(typeof duration === "number" && isFinite(duration) ? Math.floor(duration) : 5, 1),
    MAX_DURATION[userPlan] || 5
  );
  const imageResolution = (() => {
    const planMax = RESOLUTION_MAP[userPlan] || "1K";
    const ORDER = ["1K", "2K", "4K"];
    const requestedRes = ["1K", "2K", "4K"].includes(image_quality) ? image_quality : "1K";
    return ORDER[Math.min(ORDER.indexOf(requestedRes), ORDER.indexOf(planMax))];
  })();

  // Model selection (server decides price — never trust the client)
  // Backward compat: old clients send max_realism instead of model_id
  const vModel = isVid ? (VIDEO_MODELS.find(m => m.id === model_id) || VIDEO_MODELS[0]) : null;
  const iModel = !isVid ? (IMAGE_MODELS.find(m => m.id === model_id) || findImageModel(max_realism === true ? "gpt2" : "nb2")) : null;
  const refList = Array.isArray(image_urls) ? image_urls.filter(u => typeof u === "string" && isSafeImageUrl(u)) : [];
  const hasRefs = !isVid && refList.length > 0 && (iModel.maxRefs || 0) > 0;
  const hasStart = typeof start_frame === "string" && isSafeImageUrl(start_frame);
  const hasEnd   = typeof end_frame   === "string" && isSafeImageUrl(end_frame);
  const hasVideo = typeof video_url === "string" && isSafeImageUrl(video_url);

  // ── Video settings (v18): per-model modes, resolution, duration — credits pay per second ──
  const safeList = (arr, n) => (Array.isArray(arr) ? arr.filter(u => typeof u === "string" && isSafeImageUrl(u)).slice(0, n) : []);
  const vRes  = isVid ? pickRes(vModel, resolution) : null;
  const vR    = isVid ? vModel.res[vRes] : null;
  const vMd   = isVid && !isDraftComplete ? pickMode(vModel, mode === "omni" ? "refs" : mode) : null;
  const vMode = isDraftComplete ? "complete" : (vMd?.id || null);
  let vDur    = isVid ? clampDuration(vModel, duration) : 0;
  const vImgs   = isVid && vMd ? safeList(image_urls, vMd.images || 0) : [];
  const vVids   = isVid && vMd ? safeList(video_urls, vMd.videos || 0) : [];
  const vAuds   = isVid && vMd ? safeList(audio_urls, vMd.audios || 0) : [];
  const vMiddle = isVid && vMd ? safeList(middle_frames, Math.max(0, (vMd.frames || 0) - 2)) : [];
  const vSource = isVid && vMd?.source && hasVideo ? video_url : null;

  if (isVid && vMd) {
    if (vMd.id === "frames" && (vMd.needsImage || vR.needsImage) && !hasStart)
      return res.status(400).json({ error: `${vModel.name} ${vRes} necesita un fotograma inicial. / requires a start frame.` });
    if (vMd.source && !vSource)
      return res.status(400).json({ error: `${vModel.name} necesita un video. / requires a video.` });
    if (vMd.id === "refs" && vImgs.length + vVids.length === 0)
      return res.status(400).json({ error: "Añade al menos una imagen o video de referencia. / Add at least one reference." });
    if (vMd.outFromSource && vImgs.length === 0)
      return res.status(400).json({ error: vMd.id === "swap" ? "Sube una imagen del objeto nuevo. / Upload the new object image." : "Sube al menos una imagen de tu personaje. / Upload at least one character image." });
    if (vAuds.length && vImgs.length + vVids.length === 0)
      return res.status(400).json({ error: "El audio necesita al menos una imagen o video. / Audio needs an image or video." });
  }

  // Draft → 1080p: load the draft generation (must belong to this user)
  let draftRow = null;
  if (isDraftComplete) {
    if (!vModel.complete) return res.status(400).json({ error: "Este modelo no tiene borradores. / No draft support." });
    try {
      const r = await fetch(`${SB_URL}/rest/v1/generations?id=eq.${encodeURIComponent(gen_id)}&user_id=eq.${userId}&select=id,draft_id,duration_sec,status&limit=1`, { headers: sbServiceHeaders() });
      draftRow = (await r.json())?.[0];
    } catch {}
    if (!draftRow?.draft_id) return res.status(404).json({ error: "Borrador no encontrado o vencido (7 días). / Draft not found or expired." });
    vDur = clampDuration(vModel, draftRow.duration_sec || duration);
  }

  // Measure attached videos on the server — fal bills input seconds. Unreadable → bill the mode maximum.
  let inputSec = 0;
  const toMeasure = vSource ? [vSource, ...vVids] : vVids;
  if (toMeasure.length) {
    const maxIn = vMd.source ? vMd.sourceSec : (vMd.videoSec || 15);
    for (const u of toMeasure) {
      const measured = await probeVideoSeconds(u);
      inputSec += measured ? measured : maxIn;
    }
    if (inputSec > maxIn + 0.5)
      return res.status(400).json({ error: `Los videos suman ${inputSec.toFixed(1)}s. Máximo ${maxIn}s. / Videos too long.` });
    if (vMd.minSourceSec && inputSec < vMd.minSourceSec - 0.3)
      return res.status(400).json({ error: `El video debe durar al menos ${vMd.minSourceSec}s. / Video must be at least ${vMd.minSourceSec}s.` });
    inputSec = Math.ceil(inputSec);
  }

  const isIdSheet = !isVid && safeStyleId === "idsheet";
  const safeGptQ = gpt_quality === "medium" ? "medium" : "high";
  if (isIdSheet && (iModel.kind !== "gpt" || !hasRefs))
    return res.status(400).json({ error: "ID Sheet: usa GPT Image 2 y sube al menos 1 imagen del personaje. / ID Sheet needs GPT Image 2 and at least 1 character image." });
  const creditCost = !isVid ? imageCredits(iModel, imageResolution, hasRefs, { nRefs: Math.min(refList.length, iModel.maxRefs || 0), style: safeStyleId, gptQuality: safeGptQ })
    : isDraftComplete ? draftCompleteCredits(vModel, vDur)
    : videoCredits(vModel, vDur, vRes, inputSec, vMode, { nImages: vImgs.length, nAudios: vAuds.length });
  if (creditsBalance < creditCost)
    return res.status(403).json({ error: insufficientMsg(creditCost, creditsBalance) });

  // Concurrent generation limit per plan
  const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 3, creator: 4 };
  const concurrentLimit = CONCURRENT_LIMITS[userPlan] || 1;
  try {
    const pendingRes = await fetch(
      `${SB_URL}/rest/v1/generations?user_id=eq.${userId}&status=eq.processing&created_at=gte.${new Date(Date.now() - 25 * 60 * 1000).toISOString()}&select=id`,
      { headers: sbServiceHeaders() }
    );
    const pending = await pendingRes.json();
    if (Array.isArray(pending) && pending.length >= concurrentLimit) {
      return res.status(429).json({
        error: `Límite de generaciones simultáneas alcanzado (${concurrentLimit} para plan ${userPlan}). Esperá que terminen las actuales.`,
        concurrent_limit: concurrentLimit,
        pending_count: pending.length,
      });
    }
  } catch { /* if check fails, allow — don't block */ }

  // Atomic credit deduction (compare-and-swap in _credits.js)
  let creditsAfter;
  try {
    const d = await deductCredits(userId, creditCost, SERVICE_KEY);
    if (!d.ok) {
      return d.reason === "insufficient"
        ? res.status(403).json({ error: insufficientMsg(creditCost, d.before ?? 0) })
        : res.status(409).json({ error: "Credit already used. Please try again." });
    }
    creditsAfter = d.after;
  } catch (err) {
    console.error("Credit deduction error:", err.message);
    return res.status(500).json({ error: "Failed to deduct credit. Please try again." });
  }

  try {
    let endpoint, body;

    if (!isVid) {
      const refs = hasRefs ? refList.slice(0, iModel.maxRefs) : [];
      endpoint = hasRefs && iModel.edit ? iModel.edit : iModel.t2i;
      if (iModel.kind === "gpt") {
        // Custom sizes (multiples of 16) by plan-capped resolution: 1K ≈1 MP · 2K ≈4 MP · 4K ≈8.3 MP (max for GPT Image 2)
        const GPT_SIZES = {
          "1K": { "1:1": [1024, 1024], "16:9": [1360, 768],  "9:16": [768, 1360],  "4:3": [1184, 880],  "3:4": [880, 1184] },
          "2K": { "1:1": [2048, 2048], "16:9": [2720, 1536], "9:16": [1536, 2720], "4:3": [2368, 1776], "3:4": [1776, 2368] },
          "4K": { "1:1": [2880, 2880], "16:9": [3840, 2160], "9:16": [2160, 3840], "4:3": [3328, 2496], "3:4": [2496, 3328] },
        };
        const sizes = GPT_SIZES[imageResolution] || GPT_SIZES["1K"];
        const r = isIdSheet ? "16:9" : safeRatio;
        body = { prompt, quality: safeGptQ, output_format: "png", num_images: 1 };
        if (sizes[r]) body.image_size = { width: sizes[r][0], height: sizes[r][1] };
        // ID Sheet: full master prompt is built here (bypasses the 2000-char user prompt cap) · always 16:9
        if (isIdSheet) body.prompt = buildIdSheetPrompt(char_height, rawUserPrompt).prompt;
      } else if (iModel.kind === "nano") {
        body = { prompt, resolution: imageResolution, limit_generations: true };
        if (safeRatio !== "auto") body.aspect_ratio = safeRatio;
      } else {
        // flux / seedream — fal image_size presets
        const SIZE_MAP = { "1:1": "square_hd", "16:9": "landscape_16_9", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "3:4": "portrait_4_3" };
        body = { prompt, num_images: 1, image_size: SIZE_MAP[safeRatio] || "square_hd" };
      }
      if (refs.length) body.image_urls = refs;
    } else {
      const m = vModel;
      const ep = { ...m.ep, ...(vR.ep || {}) };
      const dur = String(vDur);
      const wantAudio = m.audioToggle ? audio === true : true;
      if (isDraftComplete) {
        endpoint = m.complete.ep;
        body = { draft_id: draftRow.draft_id, resolution: "1080p" };
      } else if (m.kind === "klingO3Edit") {
        endpoint = ep.edit;
        body = { prompt, video_url: vSource };
        if (vImgs.length) body.image_urls = vImgs;
      } else if (m.kind === "kling4") {
        const base = { prompt, duration: dur, resolution: vRes, generate_audio: wantAudio };
        if (vMode === "edit") {
          endpoint = ep.edit;
          body = { prompt, video_url: vSource, resolution: vRes };
          if (vImgs.length) body.image_urls = vImgs;
        } else if (vMode === "refs") {
          endpoint = ep.ref;
          body = { ...base, aspect_ratio: safeRatio };
          if (vImgs.length) body.image_urls = vImgs;
          if (vVids.length) body.video_urls = vVids;
        } else if (vMiddle.length) {
          endpoint = ep.ref; // multi-keyframe: start + middle + end
          body = { ...base, aspect_ratio: safeRatio, start_image_url: start_frame, middle_image_urls: vMiddle };
          if (hasEnd) body.end_image_url = end_frame;
        } else if (hasStart) {
          endpoint = ep.i2v;
          body = { ...base, start_image_url: start_frame };
          if (hasEnd) body.end_image_url = end_frame;
        } else {
          endpoint = ep.t2v;
          body = { ...base, aspect_ratio: safeRatio };
        }
      } else if (m.kind === "jutsu") {
        // NanoJutsu → Wavespeed Seedance 2.5 Motion Control directly (no hidden prompt). Same inputs: video + images + optional prompt.
        endpoint = "ws:" + ep.ws;
        const userText = sanitizePrompt(rawUserPrompt);
        body = {
          video: vSource,
          duration: Math.min(30, Math.max(4, Math.ceil(inputSec || 5))),
          resolution: vRes,
          seed: -1,
        };
        if (vImgs.length) body.images = vImgs;
        if (userText && userText !== "jutsu") body.prompt = userText;
      } else if (m.kind === "seedance") {
        const base = { duration: dur, resolution: vRes, aspect_ratio: safeRatio, generate_audio: true, enable_safety_checker: true, end_user_id: userId };
        if (m.draft) base.draft = true;
        if (vMode === "refs") {
          endpoint = ep.ref;
          body = { prompt, ...base };
          const imgs = [...(hasStart ? [start_frame] : []), ...vImgs].slice(0, 9);
          if (imgs.length) body.image_urls = imgs;
          if (vVids.length) body.video_urls = vVids;
          if (vAuds.length) body.audio_urls = vAuds;
        } else if (vMode === "extend") {
          endpoint = ep.ref;
          body = { prompt: `Extend @Video1 forward, continuing seamlessly from its last frame. ${prompt}`, ...base, video_urls: [vSource] };
          delete body.aspect_ratio;
        } else {
          endpoint = hasStart && ep.i2v ? ep.i2v : ep.t2v;
          body = { prompt, ...base };
          if (hasStart) body.image_url = start_frame;
          if (hasEnd)   body.end_image_url = end_frame;
        }
      } else if (m.kind === "flux3") {
        const base = { prompt, duration: dur, resolution: vRes, generate_audio: wantAudio };
        if (hasStart) {
          endpoint = ep.i2v;
          body = { ...base, image_url: start_frame, aspect_ratio: "auto" };
          if (hasEnd) body.end_image_url = end_frame;
        } else {
          endpoint = ep.t2v;
          body = { ...base, aspect_ratio: safeRatio };
        }
      } else if (m.kind === "wan3") {
        const base = { prompt, duration: vDur, resolution: vRes, audio: wantAudio };
        if (vMode === "refs") {
          endpoint = ep.ref;
          body = { ...base, aspect_ratio: safeRatio };
          if (vImgs.length) body.image_urls = vImgs;
          if (vVids.length) body.video_urls = vVids;
          if (vAuds.length) body.audio_urls = vAuds;
        } else if (hasStart) {
          endpoint = ep.i2v;
          body = { ...base, start_image_url: start_frame };
          if (hasEnd) body.end_image_url = end_frame;
        } else {
          endpoint = ep.t2v;
          body = { ...base, aspect_ratio: safeRatio };
        }
      } else if (m.kind === "minimax") {
        const base = { prompt, duration: vDur, resolution: vRes.toUpperCase(), prompt_expansion_mode: "balanced" };
        if (vMode === "refs") {
          endpoint = ep.ref;
          body = { ...base, aspect_ratio: safeRatio };
          if (vImgs.length) body.reference_image_urls = vImgs;
          if (vVids.length) body.reference_video_urls = vVids;
          if (vAuds.length) body.reference_audio_urls = vAuds;
        } else if (hasStart) {
          endpoint = ep.i2v;
          body = { ...base, start_image_url: start_frame, image_url: start_frame };
          if (hasEnd) body.end_image_url = end_frame;
        } else {
          endpoint = ep.t2v;
          body = { ...base, aspect_ratio: safeRatio };
        }
      } else {
        // kling3 family (3.0 std/pro/turbo/omni)
        const useI2V = (hasStart || vMd.needsImage || vR.needsImage) && ep.i2v;
        endpoint = useI2V ? ep.i2v : ep.t2v;
        body = { prompt, duration: dur, generate_audio: wantAudio };
        if (!useI2V) body.aspect_ratio = safeRatio;
        if (hasStart) { body.start_image_url = start_frame; body.image_url = start_frame; }
        if (hasEnd && vMd.endFrame) body.end_image_url = end_frame;
      }
      if (!endpoint) throw new Error(`Model ${m.id} has no endpoint for this input`);
    }
    console.log(`generate: model=${isVid ? `${vModel.id} ${vRes} ${vMode} ${vDur}s in=${inputSec}s img=${vImgs.length} vid=${vVids.length} aud=${vAuds.length}` : iModel.id} endpoint=${endpoint} credits=${creditCost} user=${userId}`);

    let data;
    if (endpoint.startsWith("ws:")) {
      // ── Wavespeed submit (NanoJutsu) ──
      const WS_KEY = process.env.WAVESPEED_API_KEY;
      if (!WS_KEY) throw new Error("Server misconfiguration (WAVESPEED_API_KEY)");
      const wsRes = await fetch(`https://api.wavespeed.ai/api/v3/${endpoint.slice(3)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${WS_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const wsData = await wsRes.json().catch(() => ({}));
      const wsId = wsData?.data?.id;
      if (!wsRes.ok || !wsId) {
        console.error("wavespeed submit error:", wsRes.status, JSON.stringify(wsData).slice(0, 300));
        throw new Error(wsData?.message || wsData?.data?.error || wsData?.error || `wavespeed error ${wsRes.status}`);
      }
      data = { request_id: wsId };
    } else {
      const WEBHOOK_URL = "https://nanobanano.studio/api/webhook?source=fal";
      const falRes = await fetch(`https://queue.fal.run/${endpoint}?fal_webhook=${encodeURIComponent(WEBHOOK_URL)}`, {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      data = await falRes.json().catch(() => ({}));
      if (!falRes.ok && !data.request_id) {
        console.error("fal submit error:", falRes.status, JSON.stringify(data).slice(0, 300));
        throw new Error(data?.detail?.[0]?.msg || data?.detail || data?.error || `fal error ${falRes.status}`);
      }
    }

    if (data.request_id) {
      try {
        const genRow = {
          user_id: userId, type,
          prompt: (isDraftComplete ? "1080p · " : "") + sanitizePrompt(rawUserPrompt || rawPrompt).slice(0, 3500), // user's raw input
          style: safeStyleId,
          status: "processing", result_url: data.request_id + "|" + endpoint, credits_cost: creditCost,
        };
        const insertGen = (row) => fetch(`${SB_URL}/rest/v1/generations`, {
          method: "POST",
          headers: { ...sbServiceHeaders(true), Prefer: "return=representation" },
          body: JSON.stringify(row),
        });
        // v18 columns (model_id, duration_sec) — fall back if the SQL migration hasn't run yet
        const ins = await insertGen({ ...genRow, model_id: isVid ? vModel.id : iModel.id, duration_sec: isVid ? vDur : null });
        if (!ins.ok) await insertGen(genRow);
      } catch {}

      // Log usage transaction
      try {
        await fetch(`${SB_URL}/rest/v1/credit_transactions`, {
          method: "POST",
          headers: { ...sbServiceHeaders(true) },
          body: JSON.stringify({
            user_id: userId,
            type: "generation",
            description: `${isVid ? "Video" : "Imagen"} · ${isVid ? vModel.name : iModel.name}`,
            images_delta: 0,
            videos_delta: 0,
            credits_delta: -creditCost,
            credits_after: creditsAfter,
            meta: { endpoint, style: safeStyleId, model: isVid ? vModel.id : iModel.id },
          }),
        });
      } catch {}
      return res.status(200).json({
        success: true, request_id: data.request_id, endpoint, type,
        status_url: data.status_url, response_url: data.response_url,
        resolution: !isVid ? imageResolution : undefined,
        audio: isVid ? (audio === true) : undefined,
      });
    }

    const url = !isVid ? data.images?.[0]?.url : data.video?.url;
    if (!url) throw new Error("No result from model");
    return res.status(200).json({ success: true, completed: true, url, type, resolution: !isVid ? imageResolution : undefined });

  } catch (err) {
    console.error("Generation error:", err.message);
    // Refund credit atomically
    try { await addCredits(userId, creditCost, SERVICE_KEY); } catch {}
    return res.status(500).json({ error: "Generation failed. Your credit has been refunded." });
  }
}
