const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";

// Block SSRF — private IPs, localhost, internal ranges
function isSafeUrl(url) {
  try {
    const p = new URL(url);
    if (p.protocol !== "https:") return false;
    const h = p.hostname;
    // Block private/internal ranges
    if (h === "localhost" || h === "127.0.0.1") return false;
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (h === "169.254.169.254") return false; // AWS metadata
    if (h === "metadata.google.internal") return false; // GCP metadata
    if (h === "100.100.100.200") return false; // Alibaba metadata
    return true;
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

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || (origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio"));
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, filename, user_token } = req.body || {};

  if (!user_token) return res.status(401).json({ error: "Authentication required" });
  if (!url || typeof url !== "string" || !isSafeUrl(url))
    return res.status(400).json({ error: "Invalid URL" });

  try {
    await verifyToken(user_token);
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    const fileRes = await fetch(url, {
      headers: { "User-Agent": "NanoBanano/1.0" },
    });
    if (!fileRes.ok) return res.status(502).json({ error: `Failed to fetch file: ${fileRes.status}` });

    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";

    // Only allow media types — block HTML, JS, etc.
    const allowedTypes = ["image/", "video/", "application/octet-stream"];
    if (!allowedTypes.some(t => contentType.startsWith(t)))
      return res.status(400).json({ error: "Unsupported content type" });

    const buffer = await fileRes.arrayBuffer();
    if (buffer.byteLength > 500 * 1024 * 1024)
      return res.status(413).json({ error: "File too large to proxy (max 500MB)" });

    const safeFilename = (filename || "nanobanano-file").replace(/[^a-zA-Z0-9._-]/g, "_");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", buffer.byteLength);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    console.error("Download proxy error:", err.message);
    return res.status(500).json({ error: "Download failed" });
  }
}
