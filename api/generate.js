import { deductCredits, addCredits, insufficientMsg } from "./_credits.js";
import { VIDEO_MODELS, IMAGE_MODELS, findImageModel, videoCredits, imageCredits } from "./_models.js";
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
          image_urls, start_frame, end_frame, multishot, max_realism, model_id, video_url, user_token } = req.body || {};

  // Validate style_id against allowed values only
  const VALID_STYLE_IDS = ["photorealistic", "cinematic", "product", "portrait", "pixar", "ads", "neutral", "restore", "colorize"];
  const safeStyleId = VALID_STYLE_IDS.includes(style_id) ? style_id : "photorealistic";

  if (!user_token || typeof user_token !== "string")
    return res.status(401).json({ error: "Authentication required" });

  const prompt = sanitizePrompt(rawPrompt);
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

  if (isVid && vModel.needsImage && !hasStart)
    return res.status(400).json({ error: `${vModel.name} necesita una imagen inicial. / requires a start image.` });
  if (isVid && vModel.needsVideo && !hasVideo)
    return res.status(400).json({ error: `${vModel.name} necesita un video. / requires a video.` });

  const creditCost = isVid ? videoCredits(vModel, allowedDuration) : imageCredits(iModel, imageResolution, hasRefs);
  if (creditsBalance < creditCost)
    return res.status(403).json({ error: insufficientMsg(creditCost, creditsBalance) });

  // Concurrent generation limit per plan
  const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 3, creator: 4 };
  const concurrentLimit = CONCURRENT_LIMITS[userPlan] || 1;
  try {
    const pendingRes = await fetch(
      `${SB_URL}/rest/v1/generations?user_id=eq.${userId}&status=eq.processing&select=id`,
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
        const GPT_SIZE_MAP = { "1:1": "square_hd", "16:9": "landscape_16_9", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "3:4": "portrait_4_3" };
        body = { prompt, quality: "high", output_format: "png", num_images: 1 };
        if (GPT_SIZE_MAP[safeRatio]) body.image_size = GPT_SIZE_MAP[safeRatio];
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
      const dur = String(m.fixedSec || allowedDuration);
      if (m.kind === "klingEdit") {
        endpoint = m.v2v;
        body = { prompt, video_url };
        const vrefs = Array.isArray(image_urls) ? image_urls.filter(u => typeof u === "string" && isSafeImageUrl(u)).slice(0, 4) : [];
        if (hasStart) vrefs.unshift(start_frame);
        if (vrefs.length) body.image_urls = vrefs;
      } else if (m.kind === "seedance") {
        endpoint = hasStart && m.i2v ? m.i2v : m.t2v;
        body = { prompt, duration: dur, aspect_ratio: safeRatio, resolution: "720p", generate_audio: true, enable_safety_checker: true, end_user_id: userId };
        if (hasStart) body.image_url = start_frame;
        if (hasEnd)   body.end_image_url = end_frame;
      } else {
        // kling3 / kling4 family
        const useI2V = (hasStart || m.needsImage) && m.i2v;
        endpoint = useI2V ? m.i2v : m.t2v;
        body = { prompt, duration: dur, generate_audio: audio === true };
        if (!useI2V) body.aspect_ratio = safeRatio;
        if (hasStart) { body.start_image_url = start_frame; body.image_url = start_frame; }
        if (hasEnd && m.endFrame) body.end_image_url = end_frame;
      }
      if (!endpoint) throw new Error(`Model ${m.id} has no endpoint for this input`);
    }
    console.log(`generate: model=${isVid ? vModel.id : iModel.id} endpoint=${endpoint} credits=${creditCost} user=${userId}`);

    const WEBHOOK_URL = "https://nanobanano.studio/api/webhook?source=fal";
    const falRes = await fetch(`https://queue.fal.run/${endpoint}?fal_webhook=${encodeURIComponent(WEBHOOK_URL)}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await falRes.json().catch(() => ({}));
    if (!falRes.ok && !data.request_id) {
      console.error("fal submit error:", falRes.status, JSON.stringify(data).slice(0, 300));
      throw new Error(data?.detail?.[0]?.msg || data?.detail || data?.error || `fal error ${falRes.status}`);
    }

    if (data.request_id) {
      try {
        await fetch(`${SB_URL}/rest/v1/generations`, {
          method: "POST",
          headers: { ...sbServiceHeaders(true), Prefer: "return=representation" },
          body: JSON.stringify({
            user_id: userId, type,
            prompt: sanitizePrompt(rawUserPrompt || rawPrompt).slice(0, 3500), // save user's raw input, not the styled version
            style: safeStyleId,
            status: "processing", result_url: data.request_id + "|" + endpoint, credits_cost: creditCost,
          }),
        });
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
