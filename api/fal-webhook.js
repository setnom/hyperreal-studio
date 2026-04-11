// fal.ai webhook receiver
// fal.ai sends POST here when a generation completes (regardless of user tab state)
// Payload: { request_id, status: "OK"|"ERROR", payload: { images/video/... } }

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";

function extractUrl(payload) {
  if (!payload) return null;
  // Image: { images: [{ url }] }
  if (payload.images?.[0]?.url) return payload.images[0].url;
  // Video: { video: { url } }
  if (payload.video?.url) return payload.video.url;
  // Array: { videos: [{ url }] }
  if (payload.videos?.[0]?.url) return payload.videos[0].url;
  // Direct url
  if (typeof payload.url === "string") return payload.url;
  return null;
}

function sbHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export default async function handler(req, res) {
  // fal.ai only sends POST
  if (req.method !== "POST") return res.status(405).end();

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: "Misconfiguration" });

  // Parse body
  const body = req.body;
  if (!body) return res.status(400).json({ error: "Empty body" });

  const { request_id, status, payload, error: falError } = body;

  console.log(`fal-webhook: request_id=${request_id} status=${status}`);

  if (!request_id) return res.status(400).json({ error: "Missing request_id" });

  // Find generation in DB by result_url containing request_id
  // result_url is stored as "requestId|endpoint"
  let genRow = null;
  try {
    const findRes = await fetch(
      `${SB_URL}/rest/v1/generations?result_url=like.${encodeURIComponent(request_id + "|")}%&select=id,user_id,type,status&limit=1`,
      { headers: sbHeaders(SERVICE_KEY) }
    );
    const found = await findRes.json();
    genRow = found?.[0] || null;
  } catch (e) {
    console.error("DB lookup error:", e.message);
  }

  if (!genRow) {
    console.warn(`fal-webhook: no generation found for request_id=${request_id}`);
    // Still return 200 to prevent fal.ai from retrying
    return res.status(200).json({ received: true });
  }

  // Idempotency — if already completed, skip
  if (genRow.status === "completed") {
    console.log(`fal-webhook: gen ${genRow.id} already completed, skipping`);
    return res.status(200).json({ received: true });
  }

  if (status === "OK") {
    const url = extractUrl(payload);
    if (!url) {
      console.error(`fal-webhook: OK status but no URL in payload for ${request_id}`);
      return res.status(200).json({ received: true });
    }

    // Update generation to completed with real URL
    try {
      await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genRow.id}`, {
        method: "PATCH",
        headers: { ...sbHeaders(SERVICE_KEY), Prefer: "return=minimal" },
        body: JSON.stringify({ result_url: url, status: "completed" }),
      });
      console.log(`✓ fal-webhook: gen ${genRow.id} completed → ${url}`);
    } catch (e) {
      console.error("DB update error:", e.message);
    }

  } else if (status === "ERROR") {
    console.error(`fal-webhook: ERROR for ${request_id}: ${falError}`);

    // Mark as failed + refund credits
    try {
      await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genRow.id}`, {
        method: "PATCH",
        headers: { ...sbHeaders(SERVICE_KEY), Prefer: "return=minimal" },
        body: JSON.stringify({ result_url: null, status: "failed" }),
      });

      // Refund credits
      const profRes = await fetch(
        `${SB_URL}/rest/v1/profiles?id=eq.${genRow.user_id}&select=images_remaining,videos_remaining`,
        { headers: sbHeaders(SERVICE_KEY) }
      );
      const prof = (await profRes.json())?.[0];
      if (prof) {
        const patch = genRow.type === "image"
          ? { images_remaining: (prof.images_remaining || 0) + 1 }
          : { videos_remaining: (prof.videos_remaining || 0) + 2 };
        await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${genRow.user_id}`, {
          method: "PATCH",
          headers: { ...sbHeaders(SERVICE_KEY), Prefer: "return=minimal" },
          body: JSON.stringify(patch),
        });
        console.log(`✓ fal-webhook: refunded credits for user ${genRow.user_id}`);
      }
    } catch (e) {
      console.error("Refund error:", e.message);
    }
  }

  // Always return 200 quickly — fal.ai will retry if we don't
  return res.status(200).json({ received: true });
}
