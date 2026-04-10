// Director — bytedance/seedance-2.0/reference-to-video
// Credits: 5s=3, 6-10s=4, 11-15s=5
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

  const { image_url, audio_url, prompt, duration, aspect_ratio, keep_frame, user_token } = req.body || {};
  const FAL_ENDPOINT = keep_frame ? FAL_ENDPOINT_I2V : FAL_ENDPOINT_REF;
  const FAL_KEY = process.env.FAL_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!FAL_KEY || !SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!image_url || !isSafeUrl(image_url)) return res.status(400).json({ error: "Invalid image URL" });
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt required" });
  if (audio_url && !isSafeUrl(audio_url)) return res.status(400).json({ error: "Invalid audio URL" });

  const safeDuration = [5,6,7,8,9,10,11,12,13,14,15].includes(Number(duration)) ? Number(duration) : 5;
  const safeAspect = ["9:16","16:9","1:1","4:3","3:4","21:9"].includes(aspect_ratio) ? aspect_ratio : "9:16";
  const creditsNeeded = calcCredits(safeDuration);

  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }
  const userId = authUser.id;

  // Get profile
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,videos_remaining,subscription_status`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profile = (await profileRes.json())?.[0];
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  const { plan, videos_remaining, subscription_status } = profile;
  if (!["pro","creator"].includes(plan))
    return res.status(403).json({ error: "Director requires Pro or Creator plan." });
  if (subscription_status === "payment_failed")
    return res.status(403).json({ error: "Your subscription has a payment issue." });
  if ((videos_remaining ?? 0) < creditsNeeded)
    return res.status(403).json({ error: `Not enough credits. Need ${creditsNeeded}, have ${videos_remaining}.` });

  // Deduct atomically
  const deductRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&videos_remaining=eq.${videos_remaining}`,
    { method: "PATCH", headers: sbHeaders(SERVICE_KEY), body: JSON.stringify({ videos_remaining: videos_remaining - creditsNeeded }) }
  );
  const deducted = await deductRes.json();
  if (!Array.isArray(deducted) || deducted.length === 0)
    return res.status(409).json({ error: "Credit deduction failed. Try again." });

  console.log(`Director: plan=${plan} dur=${safeDuration}s credits=${creditsNeeded} user=${userId}`);

  try {
    const falBody = keep_frame
      ? {
          // image-to-video: just image + prompt, no audio, no references
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
          // reference-to-video: image + optional audio + prompt with @image1
          prompt: prompt.trim().slice(0, 3500),
          image_url,
          duration: String(safeDuration),
          aspect_ratio: safeAspect,
          resolution: "720p",
          generate_audio: !audio_url,
          enable_safety_checker: true,
          end_user_id: userId,
          ...(audio_url ? { audio_url } : {}),
        };

    const falRes = await fetch(`https://queue.fal.run/${FAL_ENDPOINT}`, {
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
          prompt: prompt.trim().slice(0, 200),
          style: "director", status: "processing",
          result_url: falData.request_id + "|" + FAL_ENDPOINT,
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
    try {
      const cur = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=videos_remaining`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json());
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbHeaders(SERVICE_KEY), body: JSON.stringify({ videos_remaining: (cur?.[0]?.videos_remaining || 0) + creditsNeeded }) });
    } catch {}
    return res.status(500).json({ error: `Director generation failed: ${err.message}` });
  }
}
