export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "FAL_KEY not configured" });

  const { data_url } = req.body;
  if (!data_url) return res.status(400).json({ error: "data_url required" });

  try {
    // Extract mime type and base64 data
    const matches = data_url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Invalid data URL format" });

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";

    // Method 1: fal.ai storage upload via initiateUpload
    try {
      const initRes = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content_type: mimeType,
          file_name: `ref_${Date.now()}.${ext}`,
        }),
      });

      if (initRes.ok) {
        const { upload_url, file_url } = await initRes.json();
        const putRes = await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: buffer,
        });
        if (putRes.ok) {
          return res.status(200).json({ success: true, url: file_url });
        }
      }
    } catch (e) {
      console.error("Method 1 failed:", e.message);
    }

    // Method 2: Direct fal CDN upload
    try {
      const cdnRes = await fetch("https://fal.run/fal-ai/any/upload", {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": mimeType,
        },
        body: buffer,
      });
      if (cdnRes.ok) {
        const cdnData = await cdnRes.json();
        if (cdnData.url) return res.status(200).json({ success: true, url: cdnData.url });
      }
    } catch (e) {
      console.error("Method 2 failed:", e.message);
    }

    // Method 3: Use data URL directly (works for smaller images)
    // Truncate if too large
    if (data_url.length < 5000000) {
      return res.status(200).json({ success: true, url: data_url });
    }

    return res.status(500).json({ error: "Failed to upload image. Try a smaller image." });

  } catch (err) {
    return res.status(500).json({ error: "Upload failed", message: err.message });
  }
}
