// ─── RATE LIMITER ───
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 5;

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

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

const PLAN_CREDITS = {
  test:    { images: 20,  videos: 2  },
  basic:   { images: 40,  videos: 8  },
  pro:     { images: 90,  videos: 18 },
  creator: { images: 200, videos: 30 },
};

const RESOLUTION_MAP   = { test: "1K", basic: "1K", pro: "2K", creator: "4K" };
const MAX_DURATION     = { test: 5, basic: 5, pro: 8, creator: 10 };
const VALID_TYPES      = ["image", "video"];
const VALID_RATIOS_IMG = ["1:1", "16:9", "9:16", "4:3", "3:4"];
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
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "Server misconfiguration" });

  const { type, prompt: rawPrompt, aspect_ratio, duration, audio,
          image_urls, start_frame, end_frame, multishot, user_token } = req.body || {};

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

  // Fetch profile with SERVICE KEY — cannot be spoofed by user
  let profile;
  try {
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,images_remaining,videos_remaining`,
      { headers: sbServiceHeaders() }
    );
    const profiles = await profileRes.json();
    profile = profiles?.[0];
    if (!profile) return res.status(403).json({ error: "Profile not found" });
  } catch {
    return res.status(500).json({ error: "Failed to verify profile" });
  }

  const { plan: userPlan, images_remaining: imagesRemaining, videos_remaining: videosRemaining } = profile;

  if (!userPlan || userPlan === "none" || !PLAN_CREDITS[userPlan])
    return res.status(403).json({ error: "No active plan. Please subscribe first." });

  if (!isVid && imagesRemaining <= 0)
    return res.status(403).json({ error: "No image credits remaining." });

  if (isVid && videosRemaining <= 0)
    return res.status(403).json({ error: "No video credits remaining." });

  // Deduct credit with SERVICE KEY — user token cannot touch this
  try {
    const newImages = !isVid ? imagesRemaining - 1 : imagesRemaining;
    const newVideos =  isVid ? videosRemaining  - 1 : videosRemaining;
    const deductRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...sbServiceHeaders(true), Prefer: "return=representation" },
      body: JSON.stringify({ images_remaining: newImages, videos_remaining: newVideos }),
    });
    if (!deductRes.ok) throw new Error("Credit deduction failed");
  } catch (err) {
    console.error("Credit deduction error:", err.message);
    return res.status(500).json({ error: "Failed to deduct credit. Please try again." });
  }

  const imageResolution = RESOLUTION_MAP[userPlan] || "1K";
  const allowedDuration = Math.min(typeof duration === "number" ? duration : 5, MAX_DURATION[userPlan] || 5);

  try {
    let endpoint, body;

    if (!isVid) {
      const hasRefs = Array.isArray(image_urls) && image_urls.length > 0
        && image_urls.every(u => typeof u === "string" && u.startsWith("https://"));
      endpoint = hasRefs ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2";
      body = { prompt, aspect_ratio: safeRatio, resolution: imageResolution, limit_generations: true };
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

    const falRes = await fetch(`https://queue.fal.run/${endpoint}`, {
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
            user_id: userId, type, prompt, style: safeRatio,
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
    // Refund credit on server failure
    try {
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH",
        headers: { ...sbServiceHeaders(true), Prefer: "return=representation" },
        body: JSON.stringify({ images_remaining: imagesRemaining, videos_remaining: videosRemaining }),
      });
    } catch {}
    return res.status(500).json({ error: "Generation failed. Your credit has been refunded." });
  }
}
