// Director — bytedance/seedance-2.0/reference-to-video
// Credits: 5s=180, 6-10s=240, 11-15s=300 (legacy 3/4/5 × 60)
import { COSTS, deductCredits, addCredits, insufficientMsg } from "./_credits.js";
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const FAL_ENDPOINT_REF = "bytedance/seedance-2.0/reference-to-video";
const FAL_ENDPOINT_I2V = "bytedance/seedance-2.0/image-to-video";

const ALLOWED_HOSTS = [
  "pygcsyqahhdtmwmqklnl.supabase.co","storage.googleapis.com",
  "fal.run","cdn.fal.run","v3b.fal.media","v2.fal.media","fal.media","fal-cdn.batata.so","nanobanano.studio",
];
function isSafeUrl(url) {
  try { const p = new URL(url); return p.protocol === "https:" && ALLOWED_HOSTS.some(h => p.hostname === h || p.hostname.endsWith("." + h)); }
  catch { return false; }
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
function calcCredits(duration) {
  return duration <= 5 ? 3 : duration <= 10 ? 4 : 5;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || (origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio"));
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image_urls, audio_urls, prompt, duration, aspect_ratio, keep_frame, user_token } = req.body || {};
  // Support both array format (new) and single URL (backward compat)
  const imageUrlsArr = Array.isArray(image_urls) ? image_urls.filter(Boolean) : (image_urls ? [image_urls] : []);
  const audioUrlsArr = Array.isArray(audio_urls) ? audio_urls.filter(Boolean) : (audio_urls ? [audio_urls] : []);
  const image_url = imageUrlsArr[0]; // primary image (first in array)

  const FAL_ENDPOINT = keep_frame ? FAL_ENDPOINT_I2V : FAL_ENDPOINT_REF;
  const FAL_KEY = process.env.FAL_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!FAL_KEY || !SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!image_url || !isSafeUrl(image_url)) return res.status(400).json({ error: "Invalid or missing image URL" });
  // Validate all image and audio URLs
  for (const u of [...imageUrlsArr.slice(1), ...audioUrlsArr]) {
    if (!isSafeUrl(u)) return res.status(400).json({ error: `Unsafe URL: ${u}` });
  }
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt required" });


  const safeDuration = [5,6,7,8,9,10,11,12,13,14,15].includes(Number(duration)) ? Number(duration) : 5;
  const safeAspect = ["9:16","16:9","1:1","4:3","3:4","21:9"].includes(aspect_ratio) ? aspect_ratio : "9:16";
  // Seedance 2.0 720p ≈ $0.303/s → 26 credits/s keeps ≥40% margin; never cheaper than the old table
  const creditsNeeded = Math.max(COSTS.legacyVideo(calcCredits(safeDuration)), 26 * safeDuration);

  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }
  const userId = authUser.id;

  // Get profile
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,credits,subscription_status`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profile = (await profileRes.json())?.[0];
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  const { plan, credits: creditsBalance = 0, subscription_status } = profile;
  if (!["pro","creator"].includes(plan))
    return res.status(403).json({ error: "Director requires Pro or Creator plan." });
  if (subscription_status === "payment_failed")
    return res.status(403).json({ error: "Your subscription has a payment issue." });
  if (creditsBalance < creditsNeeded)
    return res.status(403).json({ error: insufficientMsg(creditsNeeded, creditsBalance) });

  // Concurrent generation limit per plan
  const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 3, creator: 4 };
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

  // Deduct atomically
  const deduct = await deductCredits(userId, creditsNeeded, SERVICE_KEY);
  if (!deduct.ok)
    return deduct.reason === "insufficient"
      ? res.status(403).json({ error: insufficientMsg(creditsNeeded, deduct.before ?? 0) })
      : res.status(409).json({ error: "Credit deduction failed. Try again." });

  console.log(`Director: plan=${plan} dur=${safeDuration}s credits=${creditsNeeded} user=${userId}`);

  try {
    const falBody = keep_frame
      ? {
          // image-to-video: single image as start frame, no audio, no references
          prompt: prompt.trim().slice(0, 3500),
          image_url,
          duration: String(safeDuration),
          aspect_ratio: safeAspect,
          resolution: "720p",
          generate_audio: true,
          enable_safety_checker: true,
          end_user_id: userId,
        }
      : {
          // reference-to-video: multiple images + optional audios + prompt with @image1..@imageN
          prompt: prompt.trim().slice(0, 3500),
          image_urls: imageUrlsArr,
          duration: String(safeDuration),
          aspect_ratio: safeAspect,
          resolution: "720p",
          generate_audio: audioUrlsArr.length === 0,
          enable_safety_checker: true,
          end_user_id: userId,
          ...(audioUrlsArr.length > 0 ? { audio_urls: audioUrlsArr } : {}),
        };

    const WEBHOOK_URL = "https://nanobanano.studio/api/webhook?source=fal";
    const falRes = await fetch(`https://queue.fal.run/${FAL_ENDPOINT}?fal_webhook=${encodeURIComponent(WEBHOOK_URL)}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(falBody),
    });
    const falData = await falRes.json();
    if (!falRes.ok || !falData.request_id) {
      console.error("fal.ai Director error:", JSON.stringify(falData));
      throw new Error(falData.detail || falData.error || "Submission failed");
    }

    // Save pending generation
    try {
      await fetch(`${SB_URL}/rest/v1/generations`, {
        method: "POST", headers: sbHeaders(SERVICE_KEY),
        body: JSON.stringify({
          user_id: userId, type: "video",
          prompt: prompt.trim().slice(0, 3500),
          style: "director", status: "processing",
          result_url: falData.request_id + "|" + FAL_ENDPOINT, credits_cost: creditsNeeded,
        }),
      });
    } catch {}

    return res.status(200).json({
      success: true, request_id: falData.request_id, endpoint: FAL_ENDPOINT,
      status_url: falData.status_url, response_url: falData.response_url, type: "video",
    });

  } catch (err) {
    console.error("Director error:", err.message);
    // Refund
    try { await addCredits(userId, creditsNeeded, SERVICE_KEY); } catch {}
    return res.status(500).json({ error: `Director generation failed: ${err.message}` });
  }
}
