// Motion Control — fal-ai/kling-video/v3/pro/motion-control
// Files stored in Supabase Storage, deleted immediately after result
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const BUCKET = "motion-refs";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const FAL_ENDPOINT = "fal-ai/kling-video/v3/pro/motion-control";
const MOTION_MAX_DUR = { basic: 5, pro: 8, creator: 15 };

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` } });
  const data = await res.json();
  if (!data?.id) throw new Error("Invalid session");
  return data;
}

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...extra };
}

// Generate a signed URL from a Supabase Storage path (valid for 10 minutes)
async function getSignedUrl(path, serviceKey, expiresIn = 600) {
  const res = await fetch(
    `${SB_URL}/storage/v1/object/sign/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.signedURL) throw new Error("Failed to generate signed URL");
  return `${SB_URL}/storage/v1${data.signedURL}`;
}

// Delete files from Supabase Storage immediately after use
async function deleteStorageFiles(paths, serviceKey) {
  try {
    const res = await fetch(
      `${SB_URL}/storage/v1/object/${BUCKET}`,
      {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      }
    );
    const result = await res.json();
    console.log(`✓ Deleted motion ref files: ${paths.join(", ")} → status=${res.status}`);
    return res.ok;
  } catch (e) {
    console.error("Failed to delete storage files:", e.message);
    return false;
  }
}

// Validate that path belongs to the authenticated user
function validateStoragePath(path, userId) {
  if (!path || typeof path !== "string") return false;
  // Path format: userId/timestamp_filename.ext
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === userId && /^[a-zA-Z0-9._-]+$/.test(parts[1]);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || (origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio"));
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image_path, video_path, character_orientation, prompt, duration, user_token } = req.body || {};

  const FAL_KEY = process.env.FAL_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!FAL_KEY || !SERVICE_KEY) return res.status(500).json({ error: "Server misconfiguration" });
  if (!user_token) return res.status(401).json({ error: "Auth required" });

  const safeOrientation = ["video", "image"].includes(character_orientation) ? character_orientation : "video";
  const safeDur = typeof duration === "number" && isFinite(duration) ? Math.floor(Math.max(1, duration)) : 5;

  // Verify user
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }
  const userId = authUser.id;

  // Validate storage paths belong to this user (prevent accessing other users' files)
  if (!validateStoragePath(image_path, userId)) return res.status(400).json({ error: "Invalid image path" });
  if (!validateStoragePath(video_path, userId)) return res.status(400).json({ error: "Invalid video path" });

  // Get profile — verify plan and credits
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,videos_remaining,subscription_status`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profile = (await profileRes.json())?.[0];
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  const { plan, videos_remaining, subscription_status } = profile;
  if (!["basic","pro","creator"].includes(plan)) return res.status(403).json({ error: "Motion Control requires Basic plan or higher." });
  if (subscription_status === "payment_failed") return res.status(403).json({ error: "Your subscription has a payment issue." });

  const maxDur = MOTION_MAX_DUR[plan] || 5;
  const finalDur = Math.min(safeDur, maxDur);
  const creditsNeeded = (plan === "creator" && finalDur > 8) ? 3 : 2;

  if ((videos_remaining ?? 0) < creditsNeeded)
    return res.status(403).json({ error: `Not enough video credits. Need ${creditsNeeded}, have ${videos_remaining}.` });

  // Deduct credits atomically
  const deductRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&videos_remaining=eq.${videos_remaining}`,
    { method: "PATCH", headers: sbHeaders(SERVICE_KEY), body: JSON.stringify({ videos_remaining: videos_remaining - creditsNeeded }) }
  );
  const deducted = await deductRes.json();
  if (!Array.isArray(deducted) || deducted.length === 0)
    return res.status(409).json({ error: "Credit deduction failed. Try again." });

  console.log(`Motion: plan=${plan} dur=${finalDur}s credits=${creditsNeeded} user=${userId}`);

  const filesToDelete = [image_path, video_path];

  try {
    // Generate 10-minute signed URLs for fal.ai
    const [imageSignedUrl, videoSignedUrl] = await Promise.all([
      getSignedUrl(image_path, SERVICE_KEY, 600),
      getSignedUrl(video_path, SERVICE_KEY, 600),
    ]);

    // Submit to fal.ai with signed URLs
    const falRes = await fetch(`https://queue.fal.run/${FAL_ENDPOINT}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageSignedUrl,
        video_url: videoSignedUrl,
        character_orientation: safeOrientation,
        duration: finalDur,
        cfg_scale: 0.8,
        generate_audio: false,
        ...(prompt?.trim() ? { prompt: prompt.trim().slice(0, 500) } : {}),
      }),
    });
    const falData = await falRes.json();
    if (!falRes.ok || !falData.request_id) throw new Error(falData.detail || "Submission failed");

    const { request_id } = falData;

    // Save pending generation record
    try {
      await fetch(`${SB_URL}/rest/v1/generations`, {
        method: "POST", headers: sbHeaders(SERVICE_KEY),
        body: JSON.stringify({
          user_id: userId, type: "video",
          prompt: prompt?.trim() || "Motion Control",
          style: "motion_control", status: "processing",
          result_url: request_id + "|" + FAL_ENDPOINT,
        }),
      });
    } catch {}

    // Poll for completion in background then delete files
    // We start an async poll here — the main response returns immediately
    // The frontend polls /api/status separately
    // Files are deleted as soon as we detect completion OR after 10min max (fal.ai SLA)
    const pollAndDelete = async () => {
      const maxAttempts = 120; // 10 minutes at 5s intervals
      let attempts = 0;
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
        try {
          const statusRes = await fetch(
            `https://queue.fal.run/${FAL_ENDPOINT}/requests/${request_id}/status`,
            { headers: { Authorization: `Key ${FAL_KEY}` } }
          );
          const statusData = await statusRes.json();
          if (statusData.status === "COMPLETED" || statusData.status === "FAILED") {
            await deleteStorageFiles(filesToDelete, SERVICE_KEY);
            return;
          }
        } catch {}
      }
      // Max time reached — delete anyway
      await deleteStorageFiles(filesToDelete, SERVICE_KEY);
    };
    pollAndDelete(); // fire and forget — doesn't block the response

    return res.status(200).json({
      success: true,
      request_id,
      endpoint: FAL_ENDPOINT,
      status_url: falData.status_url,
      response_url: falData.response_url,
      type: "video",
    });

  } catch (err) {
    console.error("Motion error:", err.message);
    // Delete files on error too
    await deleteStorageFiles(filesToDelete, SERVICE_KEY);
    // Refund credits
    try {
      const cur = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=videos_remaining`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json());
      const refundVal = (cur?.[0]?.videos_remaining || 0) + creditsNeeded;
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: sbHeaders(SERVICE_KEY), body: JSON.stringify({ videos_remaining: refundVal }) });
    } catch {}
    return res.status(500).json({ error: "Motion generation failed. Your credits have been refunded." });
  }
}
