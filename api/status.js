const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "FAL_KEY not configured" });

  const { request_id, endpoint, type, user_token, status_url, response_url } = req.body || {};
  
  if (!request_id) return res.status(400).json({ error: "request_id required" });

  const headers = { Authorization: `Key ${FAL_KEY}` };

  try {
    // Use direct status_url if provided, otherwise construct it
    const checkUrl = status_url || `https://queue.fal.run/${endpoint}/requests/${request_id}/status`;
    console.log("Polling:", checkUrl);
    
    const statusRes = await fetch(checkUrl, { method: "GET", headers });

    if (!statusRes.ok) {
      const errBody = await statusRes.text().catch(() => "");
      console.error("Status HTTP", statusRes.status, errBody.substring(0, 200));
      return res.status(200).json({ status: "IN_PROGRESS", debug: `HTTP ${statusRes.status}` });
    }

    const statusData = await statusRes.json();
    console.log("Status:", statusData.status, "queue:", statusData.queue_position);

    if (statusData.status === "COMPLETED") {
      // Use direct response_url if provided
      const resultUrl = response_url || `https://queue.fal.run/${endpoint}/requests/${request_id}/response`;
      console.log("Fetching:", resultUrl);
      
      const resultRes = await fetch(resultUrl, { method: "GET", headers });

      if (!resultRes.ok) {
        console.error("Result HTTP", resultRes.status);
        return res.status(200).json({ status: "COMPLETED", error: "Could not fetch result" });
      }

      const result = await resultRes.json();
      
      const url = type === "image"
        ? (result.images?.[0]?.url || null)
        : (result.video?.url || null);

      console.log("URL:", url ? "found" : "missing");

      // Save to Supabase
      if (url && endpoint) {
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
        if (SERVICE_KEY) {
          try {
            const searchKey = encodeURIComponent(request_id + "|" + endpoint);
            const findRes = await fetch(
              `${SB_URL}/rest/v1/generations?result_url=eq.${searchKey}&select=id&limit=1`,
              { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
            );
            const found = await findRes.json();
            if (found?.[0]?.id) {
              await fetch(
                `${SB_URL}/rest/v1/generations?id=eq.${found[0].id}`,
                {
                  method: "PATCH",
                  headers: {
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    "Content-Type": "application/json",
                    Prefer: "return=representation",
                  },
                  body: JSON.stringify({ result_url: url, status: "completed" }),
                }
              );
            }
          } catch (e) {
            console.error("DB error:", e.message);
          }
        }
      }

      return res.status(200).json({ status: "COMPLETED", url, type });
    }

    if (statusData.status === "FAILED") {
      return res.status(200).json({ status: "FAILED", error: statusData.error || "Failed" });
    }

    return res.status(200).json({
      status: statusData.status || "IN_PROGRESS",
      position: statusData.queue_position,
    });

  } catch (err) {
    console.error("Error:", err.message);
    return res.status(200).json({ status: "IN_PROGRESS", debug: err.message });
  }
}
