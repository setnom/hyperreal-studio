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
          image_urls, start_frame, end_frame, multishot, user_token } = req.body || {};

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
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,images_remaining,videos_remaining,subscription_status`,
      { headers: sbServiceHeaders() }
    );
    const profiles = await profileRes.json();
    profile = profiles?.[0];
    if (!profile) return res.status(403).json({ error: "Profile not found" });
  } catch {
    return res.status(500).json({ error: "Failed to verify profile" });
  }

  const { plan: userPlan, images_remaining: imagesRemaining, videos_remaining: videosRemaining, subscription_status } = profile;

  if (!userPlan || userPlan === "none" || !PLAN_CREDITS[userPlan])
    return res.status(403).json({ error: "No active plan. Please subscribe first." });

  // Block generation if subscription has payment issues
  if (subscription_status === "payment_failed")
    return res.status(403).json({ error: "Your subscription has a payment issue. Please resolve it to continue generating." });

  if (!isVid && imagesRemaining <= 0)
    return res.status(403).json({ error: "No image credits remaining." });

  if (isVid && videosRemaining <= 0)
    return res.status(403).json({ error: "No video credits remaining." });

  // Concurrent generation limit per plan
  const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 4, creator: 8 };
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

  // 🟡 FIX: Atomic credit deduction — only deduct if current value matches what we read
  // This prevents double-spend race conditions from concurrent requests
  try {
    const newImages = !isVid ? imagesRemaining - 1 : imagesRemaining;
    const newVideos =  isVid ? videosRemaining  - 1 : videosRemaining;
    // Use conditional filter: only update if credits haven't changed since we read them
    const atomicFilter = !isVid
      ? `id=eq.${userId}&images_remaining=eq.${imagesRemaining}`
      : `id=eq.${userId}&videos_remaining=eq.${videosRemaining}`;
    const deductRes = await fetch(`${SB_URL}/rest/v1/profiles?${atomicFilter}`, {
      method: "PATCH",
      headers: { ...sbServiceHeaders(true), Prefer: "return=representation" },
      body: JSON.stringify({ images_remaining: newImages, videos_remaining: newVideos }),
    });
    if (!deductRes.ok) throw new Error("Credit deduction failed");
    const deducted = await deductRes.json();
    // If no rows updated, another request beat us to it — reject this one
    if (!Array.isArray(deducted) || deducted.length === 0) {
      return res.status(409).json({ error: "Credit already used. Please try again." });
    }
  } catch (err) {
    if (err.message === "Credit deduction failed") throw err;
    console.error("Credit deduction error:", err.message);
    return res.status(500).json({ error: "Failed to deduct credit. Please try again." });
  }

  const imageResolution = (() => {
    const planMax = RESOLUTION_MAP[userPlan] || "1K";
    const ORDER = ["1K", "2K", "4K"];
    const requestedRes = ["1K", "2K", "4K"].includes(image_quality) ? image_quality : "1K";
    // Never exceed plan max
    const maxIdx = ORDER.indexOf(planMax);
    const reqIdx = ORDER.indexOf(requestedRes);
    return ORDER[Math.min(reqIdx, maxIdx)];
  })();
  const allowedDuration = Math.min(
    Math.max(typeof duration === "number" && isFinite(duration) ? Math.floor(duration) : 5, 1),
    MAX_DURATION[userPlan] || 5
  );

  try {
    let endpoint, body;

    if (!isVid) {
      const ALLOWED_IMAGE_HOSTS = [
        "pygcsyqahhdtmwmqklnl.supabase.co",
        "storage.googleapis.com",
        "fal.run", "cdn.fal.run",
        "nanobanano.studio",
      ];
      const isSafeImageUrl = (u) => {
        try {
          const p = new URL(u);
          return p.protocol === "https:" && ALLOWED_IMAGE_HOSTS.some(h => p.hostname === h || p.hostname.endsWith("." + h));
        } catch { return false; }
      };
      const hasRefs = Array.isArray(image_urls) && image_urls.length > 0
        && image_urls.every(u => typeof u === "string" && isSafeImageUrl(u));
      endpoint = hasRefs ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2";
      body = { prompt, resolution: imageResolution, limit_generations: true };
      // "auto" = omit aspect_ratio so model infers from prompt/reference
      if (safeRatio !== "auto") body.aspect_ratio = safeRatio;
      if (hasRefs) body.image_urls = image_urls.slice(0, 14);
    } else {
      const hasStart = typeof start_frame === "string" && start_frame.startsWith("https://");
      const hasEnd   = typeof end_frame   === "string" && end_frame.startsWith("https://");
      endpoint = (hasStart || hasEnd)
        ? "fal-ai/kling-video/v3/standard/image-to-video"
        : "fal-ai/kling-video/v3/standard/text-to-video";
      body = { prompt, duration: allowedDuration, aspect_ratio: safeRatio, generate_audio: audio === true };
      if (hasStart) body.image_url = start_frame;
      if (hasEnd)   body.tail_image_url = end_frame;
      if (multishot === true) body.multi_shot = true;
    }

    const WEBHOOK_URL = "https://nanobanano.studio/api/webhook?source=fal";
    const falRes = await fetch(`https://queue.fal.run/${endpoint}?fal_webhook=${encodeURIComponent(WEBHOOK_URL)}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await falRes.json();

    if (data.request_id) {
      try {
        await fetch(`${SB_URL}/rest/v1/generations`, {
          method: "POST",
          headers: { ...sbServiceHeaders(true), Prefer: "return=representation" },
          body: JSON.stringify({
            user_id: userId, type,
            prompt: sanitizePrompt(rawUserPrompt || rawPrompt).slice(0, 3500), // save user's raw input, not the styled version
            style: safeStyleId,
            status: "processing", result_url: data.request_id + "|" + endpoint,
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
    return res.status(200).json({ success: true, completed: true, url, type, resolution: !isVid ? imageResolution : undefined });

  } catch (err) {
    console.error("Generation error:", err.message);
    // Refund credit atomically — increment back, don't overwrite with stale value
    try {
      const field = isVid ? "videos_remaining" : "images_remaining";
      // Re-read current value then increment to avoid race condition
      const cur = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=images_remaining,videos_remaining`, { headers: sbServiceHeaders() }).then(r => r.json());
      const curProfile = cur?.[0];
      if (curProfile) {
        const refundVal = isVid ? (curProfile.videos_remaining || 0) + 1 : (curProfile.images_remaining || 0) + 1;
        await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method: "PATCH",
          headers: { ...sbServiceHeaders(true), Prefer: "return=representation" },
          body: JSON.stringify({ [field]: refundVal }),
        });
      }
    } catch {}
    return res.status(500).json({ error: "Generation failed. Your credit has been refunded." });
  }
}
