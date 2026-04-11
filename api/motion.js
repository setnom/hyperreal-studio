// Motion Control — fal-ai/kling-video/v3/pro/motion-control
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const FAL_ENDPOINT = "fal-ai/kling-video/v3/pro/motion-control";
const MOTION_MAX_DUR = { basic: 5, pro: 8, creator: 15 };

// Allowed hosts for image/video URLs
const ALLOWED_HOSTS = [
  "pygcsyqahhdtmwmqklnl.supabase.co",
  "storage.googleapis.com",
  "fal.run","cdn.fal.run","v3b.fal.media","v2.fal.media","fal.media","fal-cdn.batata.so",
  "nanobanano.studio",
];
function isSafeUrl(url) {
  if (!url || typeof url !== "string") return false;
  // Allow data URLs for inline image data (base64 encoded, image types only)
  if (url.startsWith("data:image/")) return true;
  try {
    const p = new URL(url);
    return p.protocol === "https:" && ALLOWED_HOSTS.some(h => p.hostname === h || p.hostname.endsWith("." + h));
  } catch { return false; }
}

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` } });
  const data = await res.json();
  if (!data?.id) throw new Error("Invalid session");
  return data;
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || (origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio"));
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Accept both image_path/video_path (legacy) and image_url/video_url (new)
  const body = req.body || {};
  const image_url = body.image_url || body.image_path;
  const video_url = body.video_url || body.video_path;
  const { character_orientation, prompt, video_duration, user_token } = body;

  // video_duration sent by frontend after reading metadata
  const videoDurSec = typeof video_duration === "number" && isFinite(video_duration) ? video_duration : 0;

  const FAL_KEY = process.env.FAL_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!FAL_KEY || !SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!image_url || !isSafeUrl(image_url)) return res.status(400).json({ error: "Invalid or missing image URL" });
  if (!video_url || !isSafeUrl(video_url)) return res.status(400).json({ error: "Invalid or missing video URL" });

  const safeOrientation = ["video", "image"].includes(character_orientation) ? character_orientation : "video";
  const safeDur = typeof duration === "number" && isFinite(duration) ? Math.floor(Math.max(1, duration)) : 5;

  // Verify user
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }
  const userId = authUser.id;

  // Get profile — verify plan and credits
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,videos_remaining,subscription_status`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profile = (await profileRes.json())?.[0];
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  const { plan, videos_remaining, subscription_status } = profile;
  if (!["basic","pro","creator"].includes(plan))
    return res.status(403).json({ error: "Motion Control requires Basic plan or higher." });
  if (subscription_status === "payment_failed")
    return res.status(403).json({ error: "Your subscription has a payment issue." });

  const maxDur = MOTION_MAX_DUR[plan] || 5;
  // If video is longer than plan allows, reject — frontend should have caught this
  if (videoDurSec > maxDur + 0.5) {
    return res.status(403).json({ error: `Video duration (${videoDurSec.toFixed(1)}s) exceeds plan limit (${maxDur}s).` });
  }
  const creditsNeeded = videoDurSec > 10 ? 3 : 2; // 5-10s = 2 credits, 11-15s = 3 credits

  if ((videos_remaining ?? 0) < creditsNeeded)
    return res.status(403).json({ error: `Not enough credits. Need ${creditsNeeded}, have ${videos_remaining}.` });

  // Concurrent generation limit per plan
  const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 4, creator: 8 };
  const concurrentLimit = CONCURRENT_LIMITS[plan] || 1;
  try {
    const pendingRes = await fetch(
      `${SB_URL}/rest/v1/generations?user_id=eq.${userId}&status=eq.processing&select=id`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const pending = await pendingRes.json();
    if (Array.isArray(pending) && pending.length >= concurrentLimit) {
      return res.status(429).json({
        error: `Límite de generaciones simultáneas alcanzado (${concurrentLimit} para plan ${plan}). Esperá que terminen las actuales.`,
        concurrent_limit: concurrentLimit,
        pending_count: pending.length,
      });
    }
  } catch { /* allow if check fails */ }

  // Deduct credits atomically
  const deductRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&videos_remaining=eq.${videos_remaining}`,
    { method: "PATCH", headers: sbHeaders(SERVICE_KEY), body: JSON.stringify({ videos_remaining: videos_remaining - creditsNeeded }) }
  );
  const deducted = await deductRes.json();
  if (!Array.isArray(deducted) || deducted.length === 0)
    return res.status(409).json({ error: "Credit deduction failed. Try again." });

  console.log(`Motion: plan=${plan} dur=${finalDur}s credits=${creditsNeeded} user=${userId}`);

  const WEBHOOK_URL = "https://nanobanano.studio/api/webhook?source=fal";
  try {
    // Submit to fal.ai
    const falRes = await fetch(`https://queue.fal.run/${FAL_ENDPOINT}?fal_webhook=${encodeURIComponent(WEBHOOK_URL)}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url,
        video_url,
        character_orientation: safeOrientation,
        cfg_scale: 0.8,
        generate_audio: false,
        ...(prompt?.trim() ? { prompt: prompt.trim().slice(0, 500) } : {}),
      }),
    });
    const falData = await falRes.json();
    if (!falRes.ok || !falData.request_id) {
      console.error("fal.ai error:", JSON.stringify(falData));
      throw new Error(falData.detail || falData.error || "Submission failed");
    }

    const { request_id } = falData;

    // Save pending generation
    try {
      await fetch(`${SB_URL}/rest/v1/generations`, {
        method: "POST", headers: sbHeaders(SERVICE_KEY),
        body: JSON.stringify({
          user_id: userId, type: "video",
          prompt: (prompt?.trim() || "Motion Control").slice(0, 3500),
          style: "motion_control", status: "processing",
          result_url: request_id + "|" + FAL_ENDPOINT,
        }),
      });
    } catch {}

    return res.status(200).json({
      success: true, request_id, endpoint: FAL_ENDPOINT,
      status_url: falData.status_url,
      response_url: falData.response_url,
      type: "video",
    });

  } catch (err) {
    console.error("Motion error:", err.message);
    // Refund credits
    try {
      const cur = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=videos_remaining`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      }).then(r => r.json());
      const refundVal = (cur?.[0]?.videos_remaining || 0) + creditsNeeded;
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH", headers: sbHeaders(SERVICE_KEY),
        body: JSON.stringify({ videos_remaining: refundVal }),
      });
    } catch {}
    return res.status(500).json({ error: `Motion generation failed: ${err.message}` });
  }
}
