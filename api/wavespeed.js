// Wavespeed AI — unified handler for Seedream 4.5 Edit + WAN 2.6 I2V Pro + polling
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const WS_BASE = "https://api.wavespeed.ai/api/v3";

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

function sbH(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

async function refundCredits(userId, type, serviceKey) {
  try {
    const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=images_remaining,videos_remaining`, { headers: sbH(serviceKey) });
    const prof = (await profRes.json())?.[0];
    if (!prof) return;
    const patch = type === "image" ? { images_remaining: (prof.images_remaining || 0) + 1 } : { videos_remaining: (prof.videos_remaining || 0) + 2 };
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbH(serviceKey), body: JSON.stringify(patch) });
  } catch(e) { console.error("WS refund error:", e.message); }
}

function humanizeError(msg) {
  if (!msg) return "Generation failed";
  const m = msg.toLowerCase();
  if (m.includes("likenesses") || m.includes("real people")) return "La imagen contiene personas reales. Crédito devuelto.";
  if (m.includes("sensitive") || m.includes("nsfw")) return "Contenido sensible detectado. Crédito devuelto.";
  return msg;
}

// ── action: generate_img ─────────────────────────────────────────────────────
async function generateImg(body, userId, WS_KEY, SERVICE_KEY, res) {
  const { prompt, image_urls, size = "1024*1024" } = body;
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt required" });
  const images = Array.isArray(image_urls) ? image_urls.filter(Boolean) : [];
  if (images.length === 0) return res.status(400).json({ error: "At least one image required" });
  for (const u of images) { if (!isSafeUrl(u)) return res.status(400).json({ error: "Invalid image URL" }); }
  const validSizes = ["1024*1024","1344*768","768*1344","1536*1024","1024*1536","2048*2048"];
  const safeSize = validSizes.includes(size) ? size : "1024*1024";

  const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=images_remaining,plan,subscription_status`, { headers: sbH(SERVICE_KEY) });
  const prof = (await profRes.json())?.[0];
  if (!prof?.plan || prof.plan === "none") return res.status(403).json({ error: "No active plan" });
  if (prof.subscription_status === "payment_failed") return res.status(403).json({ error: "Payment issue" });
  if ((prof.images_remaining ?? 0) <= 0) return res.status(402).json({ error: "No image credits" });

  const deductRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&images_remaining=gt.0`, {
    method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ images_remaining: prof.images_remaining - 1 })
  });
  if (!deductRes.ok) return res.status(409).json({ error: "Credit deduction failed" });

  const genRes = await fetch(`${SB_URL}/rest/v1/generations`, {
    method: "POST", headers: sbH(SERVICE_KEY),
    body: JSON.stringify({ user_id: userId, type: "image", status: "processing", prompt: prompt.trim().slice(0, 3500), result_url: `pending|ws-img` })
  });
  const gen = (await genRes.json())?.[0];
  const genId = gen?.id;

  try {
    const wsRes = await fetch(`${WS_BASE}/bytedance/seedream-v4.5/edit`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${WS_KEY}` },
      body: JSON.stringify({ prompt: prompt.trim().slice(0, 3500), images, size: safeSize, enable_sync_mode: false, enable_base64_output: false })
    });
    const wsData = await wsRes.json();
    if (!wsRes.ok || !wsData?.data?.id) {
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ images_remaining: prof.images_remaining }) });
      if (genId) await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ status: "failed" }) });
      return res.status(500).json({ error: wsData?.message || "Submission failed" });
    }
    const requestId = wsData.data.id;
    if (genId) await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ result_url: `${requestId}|ws-img` }) });
    return res.status(200).json({ request_id: requestId, endpoint: "ws-img", gen_id: genId });
  } catch(e) {
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ images_remaining: prof.images_remaining }) }).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}

// ── action: generate_vid ─────────────────────────────────────────────────────
async function generateVid(body, userId, WS_KEY, SERVICE_KEY, res) {
  const { prompt, image_url, duration = 5, resolution = "1080p" } = body;
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt required" });
  if (!image_url || !isSafeUrl(image_url)) return res.status(400).json({ error: "Invalid image URL" });
  const safeDuration = [5, 10, 15].includes(Number(duration)) ? Number(duration) : 5;
  const safeResolution = ["1080p", "2k", "4k"].includes(resolution) ? resolution : "1080p";
  const creditsNeeded = safeDuration <= 5 ? 2 : safeDuration <= 10 ? 3 : 4;

  const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=videos_remaining,plan,subscription_status`, { headers: sbH(SERVICE_KEY) });
  const prof = (await profRes.json())?.[0];
  if (!prof?.plan || prof.plan === "none") return res.status(403).json({ error: "No active plan" });
  if (prof.subscription_status === "payment_failed") return res.status(403).json({ error: "Payment issue" });
  if ((prof.videos_remaining ?? 0) < creditsNeeded) return res.status(402).json({ error: `Need ${creditsNeeded} video credits. Have ${prof.videos_remaining ?? 0}.` });

  const deductRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&videos_remaining=gte.${creditsNeeded}`, {
    method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ videos_remaining: prof.videos_remaining - creditsNeeded })
  });
  if (!deductRes.ok) return res.status(409).json({ error: "Credit deduction failed" });

  const genRes = await fetch(`${SB_URL}/rest/v1/generations`, {
    method: "POST", headers: sbH(SERVICE_KEY),
    body: JSON.stringify({ user_id: userId, type: "video", status: "processing", prompt: prompt.trim().slice(0, 3500), result_url: `pending|ws-vid` })
  });
  const gen = (await genRes.json())?.[0];
  const genId = gen?.id;

  try {
    const wsRes = await fetch(`${WS_BASE}/alibaba/wan-2.6/image-to-video-pro`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${WS_KEY}` },
      body: JSON.stringify({ prompt: prompt.trim().slice(0, 3500), image: image_url, duration: safeDuration, resolution: safeResolution, shot_type: "single", enable_prompt_expansion: false, seed: -1 })
    });
    const wsData = await wsRes.json();
    if (!wsRes.ok || !wsData?.data?.id) {
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ videos_remaining: prof.videos_remaining }) });
      if (genId) await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ status: "failed" }) });
      return res.status(500).json({ error: wsData?.message || "Submission failed" });
    }
    const requestId = wsData.data.id;
    if (genId) await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ result_url: `${requestId}|ws-vid` }) });
    return res.status(200).json({ request_id: requestId, endpoint: "ws-vid", gen_id: genId, credits_used: creditsNeeded });
  } catch(e) {
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ videos_remaining: prof.videos_remaining }) }).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}

// ── action: status ───────────────────────────────────────────────────────────
async function pollStatus(body, userId, WS_KEY, SERVICE_KEY, res) {
  const { request_id, type, gen_id } = body;
  if (!request_id) return res.status(400).json({ error: "Missing request_id" });

  try {
    const pollRes = await fetch(`${WS_BASE}/predictions/${request_id}/result`, {
      headers: { Authorization: `Bearer ${WS_KEY}` }
    });
    if (pollRes.status === 404) return res.status(200).json({ status: "IN_PROGRESS" });

    if (!pollRes.ok) {
      const errBody = await pollRes.json().catch(() => ({}));
      const errMsg = humanizeError(errBody?.message || errBody?.error || "Generation failed");
      await refundCredits(userId, type, SERVICE_KEY);
      if (gen_id) await fetch(`${SB_URL}/rest/v1/generations?id=eq.${gen_id}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ status: "failed" }) }).catch(() => {});
      return res.status(200).json({ status: "FAILED", error: errMsg });
    }

    const data = await pollRes.json();
    const status = (data?.data?.status || "").toUpperCase();
    const outputs = data?.data?.outputs || [];
    const url = outputs[0] || null;

    if (status === "COMPLETED" || url) {
      if (!url) {
        await refundCredits(userId, type, SERVICE_KEY);
        return res.status(200).json({ status: "FAILED", error: "No output URL" });
      }
      if (gen_id) {
        await fetch(`${SB_URL}/rest/v1/generations?id=eq.${gen_id}`, {
          method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ result_url: url, status: "completed" })
        }).catch(() => {});
      }
      return res.status(200).json({ status: "COMPLETED", url, type });
    }

    if (status === "FAILED" || data?.data?.error) {
      const errMsg = humanizeError(data?.data?.error || "Generation failed");
      await refundCredits(userId, type, SERVICE_KEY);
      if (gen_id) await fetch(`${SB_URL}/rest/v1/generations?id=eq.${gen_id}`, { method: "PATCH", headers: sbH(SERVICE_KEY), body: JSON.stringify({ status: "failed" }) }).catch(() => {});
      return res.status(200).json({ status: "FAILED", error: errMsg });
    }

    return res.status(200).json({ status: "IN_PROGRESS" });
  } catch(e) {
    console.error("WS status error:", e.message);
    return res.status(200).json({ status: "IN_PROGRESS" });
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
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

  const body = req.body || {};
  const { action, user_token } = body;
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!["generate_img","generate_vid","status"].includes(action)) return res.status(400).json({ error: "Invalid action" });

  let userId;
  try { userId = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  if (action === "generate_img") return generateImg(body, userId, WS_KEY, SERVICE_KEY, res);
  if (action === "generate_vid") return generateVid(body, userId, WS_KEY, SERVICE_KEY, res);
  if (action === "status") return pollStatus(body, userId, WS_KEY, SERVICE_KEY, res);
}
