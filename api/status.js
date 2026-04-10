const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

const ALLOWED_FAL_HOSTS = ["queue.fal.run","fal.run","storage.googleapis.com"];
function isSafeUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const p = new URL(url);
    return p.protocol === "https:" && ALLOWED_FAL_HOSTS.some(h => p.hostname === h || p.hostname.endsWith("."+h));
  } catch { return false; }
}

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` } });
  const user = await res.json();
  if (!user?.id) throw new Error("Invalid session");
  return user.id;
}

function extractVideoUrl(result) {
  if (!result) return null;
  if (result.video?.url) return result.video.url;
  if (result.videos?.[0]?.url) return result.videos[0].url;
  if (typeof result.url === "string" && result.url.startsWith("http")) return result.url;
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

// Extract human-readable error from fal.ai error responses
function extractErrorMessage(data) {
  // Common fal.ai error formats
  if (data?.detail) {
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map(d => d.msg || d.message || JSON.stringify(d)).join("; ");
  }
  if (data?.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  if (data?.message) return data.message;
  if (data?.logs) {
    const errLog = data.logs.find(l => l.level === "ERROR" || l.message?.includes("sensitive") || l.message?.includes("error"));
    if (errLog) return errLog.message;
  }
  return "Generation failed";
}

// Refund credits in Supabase
async function refundCredits(userId, endpoint, reqId, serviceKey) {
  try {
    const searchKey = encodeURIComponent(reqId + "|" + endpoint);
    const findRes = await fetch(
      `${SB_URL}/rest/v1/generations?result_url=eq.${searchKey}&select=id,type&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const found = await findRes.json();
    if (!found?.[0]) return;

    const genType = found[0].type;
    const genId = found[0].id;

    // Mark generation as failed in DB
    await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", result_url: null }),
    });

    // Get current credits and refund
    const profRes = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=images_remaining,videos_remaining`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const prof = (await profRes.json())?.[0];
    if (!prof) return;

    // Refund 1 image credit or 2 video credits (minimum)
    const patch = genType === "image"
      ? { images_remaining: (prof.images_remaining || 0) + 1 }
      : { videos_remaining: (prof.videos_remaining || 0) + 2 }; // refund 2 video credits minimum

    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });

    console.log(`✓ Refunded credits for user ${userId} gen ${genId} type=${genType}`);
  } catch (e) {
    console.error("Refund error:", e.message);
  }
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

  if (!request_id || typeof request_id !== "string" || request_id.length > 200)
    return res.status(400).json({ error: "Invalid request_id" });
  if (!user_token) return res.status(401).json({ error: "Authentication required" });

  let userId;
  try { userId = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid or expired session" }); }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  // Ownership check
  if (SERVICE_KEY) {
    try {
      const searchKey = encodeURIComponent(request_id + "|" + endpoint);
      const ownerRes = await fetch(
        `${SB_URL}/rest/v1/generations?result_url=eq.${searchKey}&select=user_id&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const ownerRows = await ownerRes.json();
      if (Array.isArray(ownerRows) && ownerRows.length > 0 && ownerRows[0].user_id !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
    } catch {}
  }

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
      if (!resultRes.ok) return res.status(200).json({ status: "COMPLETED", error: "Could not fetch result" });

      const result = await resultRes.json();

      // Check if result itself contains an error (e.g. sensitive content)
      if (result?.detail || (result?.status === "FAILED")) {
        const errMsg = extractErrorMessage(result);
        console.error(`Generation error in result: ${errMsg}`);
        if (SERVICE_KEY) await refundCredits(userId, endpoint, request_id, SERVICE_KEY);
        return res.status(200).json({ status: "FAILED", error: errMsg });
      }

      const url = type === "image" ? extractImageUrl(result) : extractVideoUrl(result);
      console.log(`Status COMPLETED: endpoint=${endpoint} url=${url} type=${type}`);

      if (!url) {
        // No URL in result — treat as failure
        const errMsg = extractErrorMessage(result) || "No output URL in result";
        if (SERVICE_KEY) await refundCredits(userId, endpoint, request_id, SERVICE_KEY);
        return res.status(200).json({ status: "FAILED", error: errMsg });
      }

      // Update DB with completed URL
      if (SERVICE_KEY) {
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
          }
        } catch (e) { console.error("DB update error:", e.message); }
      }

      return res.status(200).json({ status: "COMPLETED", url, type });
    }

    if (falStatus === "FAILED") {
      const errMsg = extractErrorMessage(statusData);
      console.error(`Generation FAILED: ${errMsg} endpoint=${endpoint}`);
      // Refund credits
      if (SERVICE_KEY) await refundCredits(userId, endpoint, request_id, SERVICE_KEY);
      return res.status(200).json({ status: "FAILED", error: errMsg });
    }

    return res.status(200).json({ status: statusData.status || "IN_PROGRESS", position: statusData.queue_position });

  } catch (err) {
    console.error("Status error:", err.message);
    return res.status(200).json({ status: "IN_PROGRESS" });
  }
}
