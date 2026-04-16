// Wavespeed AI — polling for generate-ws and video-ws results
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const WS_BASE = "https://api.wavespeed.ai/api/v3";

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

function humanizeError(msg) {
  if (!msg) return "Generation failed";
  const m = msg.toLowerCase();
  if (m.includes("likenesses") || m.includes("real people")) return "La imagen contiene personas reales. El modelo no puede procesarla. Tu crédito fue devuelto.";
  if (m.includes("sensitive") || m.includes("nsfw")) return "Contenido sensible detectado. Tu crédito fue devuelto.";
  return msg;
}

async function refundCredits(userId, type, serviceKey) {
  try {
    const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=images_remaining,videos_remaining`, {
      headers: sbHeaders(serviceKey)
    });
    const prof = (await profRes.json())?.[0];
    if (!prof) return;
    const patch = type === "image"
      ? { images_remaining: (prof.images_remaining || 0) + 1 }
      : { videos_remaining: (prof.videos_remaining || 0) + 2 };
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH", headers: sbHeaders(serviceKey), body: JSON.stringify(patch)
    });
  } catch (e) { console.error("WS refund error:", e.message); }
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

  const { request_id, type, user_token, gen_id } = req.body || {};
  if (!request_id || !user_token) return res.status(400).json({ error: "Missing params" });

  let userId;
  try { userId = await verifyToken(user_token); }
  catch { return res.status(401).json({ error: "Invalid session" }); }

  try {
    const pollRes = await fetch(`${WS_BASE}/predictions/${request_id}/result`, {
      headers: { Authorization: `Bearer ${WS_KEY}` }
    });

    // 404 = still processing
    if (pollRes.status === 404) return res.status(200).json({ status: "IN_PROGRESS" });

    if (!pollRes.ok) {
      const errBody = await pollRes.json().catch(() => ({}));
      const errMsg = humanizeError(errBody?.message || errBody?.error || "Generation failed");
      await refundCredits(userId, type, SERVICE_KEY);
      if (gen_id) {
        await fetch(`${SB_URL}/rest/v1/generations?id=eq.${gen_id}`, {
          method: "PATCH", headers: sbHeaders(SERVICE_KEY), body: JSON.stringify({ status: "failed" })
        }).catch(() => {});
      }
      return res.status(200).json({ status: "FAILED", error: errMsg });
    }

    const data = await pollRes.json();
    const status = (data?.data?.status || "").toUpperCase();

    if (status === "COMPLETED" || data?.data?.outputs?.length > 0) {
      // Extract URL — Wavespeed returns outputs array
      const outputs = data?.data?.outputs || [];
      const url = outputs[0] || null;

      if (!url) {
        await refundCredits(userId, type, SERVICE_KEY);
        return res.status(200).json({ status: "FAILED", error: "No output URL in result" });
      }

      // Update DB
      if (gen_id && SERVICE_KEY) {
        await fetch(`${SB_URL}/rest/v1/generations?id=eq.${gen_id}`, {
          method: "PATCH",
          headers: sbHeaders(SERVICE_KEY),
          body: JSON.stringify({ result_url: url, status: "completed" }),
        }).catch(() => {});
      }

      return res.status(200).json({ status: "COMPLETED", url, type });
    }

    if (status === "FAILED" || data?.data?.error) {
      const errMsg = humanizeError(data?.data?.error || data?.message || "Generation failed");
      await refundCredits(userId, type, SERVICE_KEY);
      if (gen_id) {
        await fetch(`${SB_URL}/rest/v1/generations?id=eq.${gen_id}`, {
          method: "PATCH", headers: sbHeaders(SERVICE_KEY), body: JSON.stringify({ status: "failed" })
        }).catch(() => {});
      }
      return res.status(200).json({ status: "FAILED", error: errMsg });
    }

    return res.status(200).json({ status: "IN_PROGRESS" });

  } catch (e) {
    console.error("status-ws error:", e.message);
    return res.status(200).json({ status: "IN_PROGRESS" });
  }
}
