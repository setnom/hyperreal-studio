// In-memory rate limiter (resets on redeploy, but prevents abuse during runtime)
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 requests per minute per user

function checkRateLimit(userId) {
  const now = Date.now();
  const userLimits = rateLimits.get(userId);
  if (!userLimits) {
    rateLimits.set(userId, { count: 1, start: now });
    return true;
  }
  if (now - userLimits.start > RATE_LIMIT_WINDOW) {
    rateLimits.set(userId, { count: 1, start: now });
    return true;
  }
  if (userLimits.count >= RATE_LIMIT_MAX) return false;
  userLimits.count++;
  return true;
}

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5Z2NzeXFhaGhkdG13bXFrbG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTIxNzcsImV4cCI6MjA5MTA2ODE3N30.YddNMUlpSQSkIqf2q8RAVqEH-vYUfPunjv21Lwy0d_Y";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "FAL_KEY not configured" });

  const { type, prompt, aspect_ratio, plan, duration, audio, image_urls, start_frame, end_frame, multishot, user_token } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });
  if (!user_token) return res.status(401).json({ error: "Authentication required" });

  // ─── VERIFY USER & CREDITS ───
  let userId, userPlan, imagesRemaining, videosRemaining;
  try {
    // Get user from token
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${user_token}` },
    });
    const user = await userRes.json();
    if (!user?.id) return res.status(401).json({ error: "Invalid session" });
    userId = user.id;

    // Get profile with credits
    const profileRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${user_token}`, "Content-Type": "application/json" },
    });
    const profiles = await profileRes.json();
    const profile = profiles?.[0];
    if (!profile) return res.status(403).json({ error: "Profile not found" });

    userPlan = profile.plan;
    imagesRemaining = profile.images_remaining;
    videosRemaining = profile.videos_remaining;

    // Check plan
    if (!userPlan || userPlan === "none") {
      return res.status(403).json({ error: "No active plan. Please subscribe first." });
    }

    // Check credits
    if (type === "image" && imagesRemaining <= 0) {
      return res.status(403).json({ error: "No image credits remaining." });
    }
    if (type === "video" && videosRemaining <= 0) {
      return res.status(403).json({ error: "No video credits remaining." });
    }
  } catch (err) {
    return res.status(500).json({ error: "Auth verification failed" });
  }

  // ─── RATE LIMIT ───
  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: "Too many requests. Wait a moment and try again." });
  }

  // ─── DEDUCT CREDIT BEFORE GENERATION ───
  try {
    const newImages = type === "image" ? imagesRemaining - 1 : imagesRemaining;
    const newVideos = type === "video" ? videosRemaining - 1 : videosRemaining;
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${user_token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ images_remaining: newImages, videos_remaining: newVideos }),
    });
  } catch {}

  // ─── RESOLUTION BY PLAN ───
  const resolutionMap = { test: "1K", basic: "1K", pro: "2K", creator: "4K" };
  const imageResolution = resolutionMap[userPlan] || "1K";

  // ─── VIDEO DURATION LIMITS BY PLAN ───
  const maxDuration = { test: 5, basic: 5, pro: 8, creator: 10 };
  const allowedDuration = Math.min(duration || 5, maxDuration[userPlan] || 5);

  try {
    let endpoint;
    let body;

    if (type === "image") {
      const hasRefs = image_urls && Array.isArray(image_urls) && image_urls.length > 0;
      endpoint = hasRefs ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2";
      body = {
        prompt,
        aspect_ratio: aspect_ratio || "1:1",
        resolution: imageResolution,
        limit_generations: true,
      };
      if (hasRefs) body.image_urls = image_urls.slice(0, 14);

    } else if (type === "video") {
      const hasStartFrame = start_frame && typeof start_frame === "string" && start_frame.startsWith("http");
      const hasEndFrame = end_frame && typeof end_frame === "string" && end_frame.startsWith("http");
      endpoint = (hasStartFrame || hasEndFrame)
        ? "fal-ai/kling-video/v3/standard/image-to-video"
        : "fal-ai/kling-video/v3/standard/text-to-video";
      body = {
        prompt,
        duration: allowedDuration,
        aspect_ratio: aspect_ratio || "16:9",
      };
      // Always explicitly set audio — Kling defaults to true if not specified
      body.generate_audio = audio === true;
      
      if (hasStartFrame) body.image_url = start_frame;
      if (hasEndFrame) body.tail_image_url = end_frame;
      if (multishot === true) body.multi_shot = true;
      
      console.log("Video request:", JSON.stringify({ endpoint, duration, audio, generate_audio: body.generate_audio, aspect_ratio: body.aspect_ratio, hasStartFrame, hasEndFrame, multishot }));

    } else {
      return res.status(400).json({ error: "Invalid type" });
    }

    // Submit to fal queue
    const falRes = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await falRes.json();

    if (data.request_id) {
      console.log("Submit response:", JSON.stringify({ request_id: data.request_id, status_url: data.status_url, response_url: data.response_url }));
      
      // Save generation record
      try {
        await fetch(`${SB_URL}/rest/v1/generations`, {
          method: "POST",
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${user_token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            user_id: userId,
            type,
            prompt,
            style: req.body.aspect_ratio || "1:1",
            status: "processing",
            result_url: data.request_id + "|" + endpoint,
          }),
        });
      } catch {}

      return res.status(200).json({
        success: true,
        request_id: data.request_id,
        endpoint,
        type,
        status_url: data.status_url,
        response_url: data.response_url,
        resolution: type === "image" ? imageResolution : undefined,
        audio: type === "video" ? (audio === true) : undefined,
      });
    }

    // Direct result
    const url = type === "image" ? data.images?.[0]?.url : data.video?.url;
    return res.status(200).json({
      success: true,
      completed: true,
      url,
      type,
      resolution: type === "image" ? imageResolution : undefined,
    });

  } catch (err) {
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}
