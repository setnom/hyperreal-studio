const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

const ALLOWED_FAL_HOSTS = ["queue.fal.run", "fal.run", "storage.googleapis.com"];
function isSafeUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      ALLOWED_FAL_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h));
  } catch { return false; }
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

// Extract video URL from any fal.ai model response format
function extractVideoUrl(result) {
  if (!result) return null;
  // Standard format: { video: { url: "..." } }
  if (result.video?.url) return result.video.url;
  // Array format: { videos: [{ url: "..." }] }
  if (result.videos?.[0]?.url) return result.videos[0].url;
  // Direct url field
  if (typeof result.url === "string" && result.url.startsWith("http")) return result.url;
  // Output field: { output: { video: { url: "..." } } }
  if (result.output?.video?.url) return result.output.video.url;
  return null;
}

function extractImageUrl(result) {
  if (!result) return null;
  if (result.images?.[0]?.url) return result.images[0].url;
  if (result.image?.url) return result.image.url;
  if (typeof result.url === "string" && result.url.startsWith("http")) return result.url;
  return null;
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

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "Server misconfiguration" });

  const { request_id, endpoint, type, user_token, status_url, response_url } = req.body || {};

  // Relaxed validation — Seedance IDs may contain dots and other chars
  if (!request_id || typeof request_id !== "string" || request_id.length > 200)
    return res.status(400).json({ error: "Invalid request_id" });

  if (!user_token || typeof user_token !== "string")
    return res.status(401).json({ error: "Authentication required" });

  let userId;
  try {
    userId = await verifyToken(user_token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  // Ownership check — allow if not found (don't block legitimate polling)
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (SERVICE_KEY) {
    try {
      const searchKey = encodeURIComponent(request_id + "|" + endpoint);
      const ownerRes = await fetch(
        `${SB_URL}/rest/v1/generations?result_url=eq.${searchKey}&select=user_id&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const ownerRows = await ownerRes.json();
      if (Array.isArray(ownerRows) && ownerRows.length > 0 && ownerRows[0].user_id !== userId) {
        console.warn(`Ownership violation: ${userId} tried to poll request owned by ${ownerRows[0].user_id}`);
        return res.status(403).json({ error: "Access denied" });
      }
    } catch { /* allow if check fails */ }
  }

  // Build fal.ai URLs
  const safeStatusUrl = isSafeUrl(status_url)
    ? status_url
    : (endpoint ? `https://queue.fal.run/${endpoint}/requests/${request_id}/status` : null);
  const safeResultUrl = isSafeUrl(response_url)
    ? response_url
    : (endpoint ? `https://queue.fal.run/${endpoint}/requests/${request_id}/response` : null);

  if (!safeStatusUrl) return res.status(400).json({ error: "Invalid status URL" });

  const headers = { Authorization: `Key ${FAL_KEY}` };

  try {
    const statusRes = await fetch(safeStatusUrl, { method: "GET", headers });
    if (!statusRes.ok) return res.status(200).json({ status: "IN_PROGRESS" });

    const statusData = await statusRes.json();
    const falStatus = (statusData.status || "").toUpperCase();

    if (falStatus === "COMPLETED") {
      if (!safeResultUrl) return res.status(400).json({ error: "Invalid result URL" });

      const resultRes = await fetch(safeResultUrl, { method: "GET", headers });
      if (!resultRes.ok)
        return res.status(200).json({ status: "COMPLETED", error: "Could not fetch result" });

      const result = await resultRes.json();

      // Support all model output formats
      const url = type === "image" ? extractImageUrl(result) : extractVideoUrl(result);

      console.log(`Status COMPLETED: endpoint=${endpoint} url=${url} type=${type}`);

      // Update DB
      if (url && endpoint && SERVICE_KEY) {
        try {
          const searchKey = encodeURIComponent(request_id + "|" + endpoint);
          const findRes = await fetch(
            `${SB_URL}/rest/v1/generations?result_url=eq.${searchKey}&select=id&limit=1`,
            { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
          );
          const found = await findRes.json();
          if (found?.[0]?.id) {
            await fetch(`${SB_URL}/rest/v1/generations?id=eq.${found[0].id}`, {
              method: "PATCH",
              headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify({ result_url: url, status: "completed" }),
            });
            console.log(`DB updated: gen ${found[0].id} → ${url}`);
          }
        } catch (e) { console.error("DB update error:", e.message); }
      }

      return res.status(200).json({ status: "COMPLETED", url, type });
    }

    if (falStatus === "FAILED")
      return res.status(200).json({ status: "FAILED", error: statusData.error || "Generation failed" });

    return res.status(200).json({ status: statusData.status || "IN_PROGRESS", position: statusData.queue_position });

  } catch (err) {
    console.error("Status error:", err.message);
    return res.status(200).json({ status: "IN_PROGRESS" });
  }
}
