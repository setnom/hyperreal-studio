export const config = {
  api: { bodyParser: { sizeLimit: '200mb' } },
};

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const ALLOWED_MIME   = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const MAX_B64_SIZE   = 4 * 1024 * 1024; // ~3MB actual file (base64 adds 33% overhead, Vercel limit ~4.5MB body)

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

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: "Server misconfiguration" });

  const { data_url, user_token } = req.body || {};

  // Require authentication — prevents anonymous upload abuse
  if (!user_token || typeof user_token !== "string")
    return res.status(401).json({ error: "Authentication required" });

  try {
    await verifyToken(user_token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (!data_url || typeof data_url !== "string")
    return res.status(400).json({ error: "data_url required" });

  // Validate data URL format and MIME type
  const matches = data_url.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: "Invalid data URL format" });

  const mimeType = matches[1].toLowerCase();
  console.log(`Upload: mime=${mimeType} b64size=${Math.round(base64Data.length/1024)}KB`);
  if (!ALLOWED_MIME.includes(mimeType))
    return res.status(400).json({ error: "Only image files (jpeg, png, webp, gif) and video files (mp4, mov, webm) are allowed" });

  const base64Data = matches[2];
  if (base64Data.length > MAX_B64_SIZE)
    return res.status(400).json({ error: "File too large for this upload method. Use a smaller file." });

  let buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid base64 data" });
  }

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : mimeType.includes("gif") ? "gif" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("quicktime") ? "mov" : mimeType.includes("webm") ? "webm" : mimeType.includes("m4v") ? "m4v" : "jpg";

  // Method 1: fal.ai storage
  try {
    const initRes = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: mimeType, file_name: `ref_${Date.now()}.${ext}` }),
    });
    if (initRes.ok) {
      const { upload_url, file_url } = await initRes.json();
      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: buffer,
      });
      if (putRes.ok) return res.status(200).json({ success: true, url: file_url });
    }
  } catch (e) {
    console.error("Upload method 1 failed:", e.message);
  }

  // Method 2: Direct fal CDN
  try {
    const cdnRes = await fetch("https://fal.run/fal-ai/any/upload", {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": mimeType },
      body: buffer,
    });
    if (cdnRes.ok) {
      const cdnData = await cdnRes.json();
      if (cdnData.url) return res.status(200).json({ success: true, url: cdnData.url });
    }
  } catch (e) {
    console.error("Upload method 2 failed:", e.message);
  }

  // Method 3: Data URL fallback (small images only)
  if (buffer.length < 2 * 1024 * 1024) {
    return res.status(200).json({ success: true, url: data_url });
  }

  return res.status(500).json({ error: "Failed to upload image. Try a smaller image." });
}
