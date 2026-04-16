// Wavespeed AI — Alibaba WAN 2.6 image-to-video-pro
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const WS_BASE = "https://api.wavespeed.ai/api/v3";
const WS_ENDPOINT = "alibaba/wan-2.6/image-to-video-pro";

const ALLOWED_IMG_HOSTS = ["v3b.fal.media","v2.fal.media","fal.media","cdn.fal.run","storage.googleapis.com","pygcsyqahhdtmwmqklnl.supabase.co","res.cloudinary.com"];
function isSafeUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const p = new URL(url);
    return p.protocol === "https:" && ALLOWED_IMG_HOSTS.some(h => p.hostname === h || p.hostname.endsWith("."+h));
  } catch { return false; }
}

async function verifyToken(user_token) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${user_token}` }
  });
  const user = await res.json();
  if (!user?.id) throw new Error("Invalid session");
  return user.id;
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
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const WS_KEY = process.env.WAVESPEED_API_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!WS_KEY || !SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });

  const { prompt, image_url, duration = 5, resolution = "1080p", user_token } = req.body || {};
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt required" });
  if (!image_url || !isSafeUrl(image_url)) return res.status(400).json({ error: "Invalid image URL" });

  const safeDuration = [5, 10, 15].includes(Number(duration)) ? Number(duration) : 5;
  const safeResolution = ["1080p", "2k", "4k"].includes(resolution) ? resolution : "1080p";
  // Credits: 5s=2, 10s=3, 15s=4
  const creditsNeeded = safeDuration <= 5 ? 2 : safeDuration <= 10 ? 3 : 4;

  let userId;
  try { userId = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  // Check video credits
  const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=videos_remaining,plan,subscription_status`, {
    headers: sbHeaders(SERVICE_KEY)
  });
  const prof = (await profRes.json())?.[0];
  if (!prof?.plan || prof.plan === "none") return res.status(403).json({ error: "No active plan" });
  if (prof.subscription_status === "payment_failed") return res.status(403).json({ error: "Payment issue — update payment method" });
  if ((prof.videos_remaining ?? 0) < creditsNeeded) return res.status(402).json({ error: `Need ${creditsNeeded} video credits. Have ${prof.videos_remaining ?? 0}.` });

  // Deduct credits atomically
  const deductRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&videos_remaining=gte.${creditsNeeded}`, {
    method: "PATCH",
    headers: sbHeaders(SERVICE_KEY),
    body: JSON.stringify({ videos_remaining: prof.videos_remaining - creditsNeeded }),
  });
  if (!deductRes.ok) return res.status(409).json({ error: "Credit deduction failed — try again" });

  // Save generation record
  const genRes = await fetch(`${SB_URL}/rest/v1/generations`, {
    method: "POST",
    headers: sbHeaders(SERVICE_KEY),
    body: JSON.stringify({ user_id: userId, type: "video", status: "processing", prompt: prompt.trim().slice(0, 3500), result_url: `pending|${WS_ENDPOINT}` }),
  });
  const gen = (await genRes.json())?.[0];
  const genId = gen?.id;

  // Submit to Wavespeed
  try {
    const wsRes = await fetch(`${WS_BASE}/${WS_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WS_KEY}` },
      body: JSON.stringify({
        prompt: prompt.trim().slice(0, 3500),
        image: image_url,
        duration: safeDuration,
        resolution: safeResolution,
        shot_type: "single",
        enable_prompt_expansion: false,
        seed: -1,
      }),
    });
    const wsData = await wsRes.json();

    if (!wsRes.ok || !wsData?.data?.id) {
      // Refund on submission failure
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH", headers: sbHeaders(SERVICE_KEY),
        body: JSON.stringify({ videos_remaining: prof.videos_remaining }),
      });
      if (genId) await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, {
        method: "PATCH", headers: sbHeaders(SERVICE_KEY),
        body: JSON.stringify({ status: "failed" }),
      });
      return res.status(500).json({ error: wsData?.message || "Wavespeed submission failed" });
    }

    const requestId = wsData.data.id;

    // Update gen record
    if (genId) {
      await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, {
        method: "PATCH", headers: sbHeaders(SERVICE_KEY),
        body: JSON.stringify({ result_url: `${requestId}|ws-vid` }),
      });
    }

    return res.status(200).json({ request_id: requestId, endpoint: "ws-vid", gen_id: genId, credits_used: creditsNeeded });

  } catch (e) {
    console.error("video-ws error:", e.message);
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH", headers: sbHeaders(SERVICE_KEY),
      body: JSON.stringify({ videos_remaining: prof.videos_remaining }),
    }).catch(() => {});
    return res.status(500).json({ error: "Internal error" });
  }
}
