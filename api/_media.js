// Measure an MP4/MOV duration on the server (reads the 'mvhd' box) so billing never trusts the client.
// Returns seconds, or null if it can't be read.
export async function probeVideoSeconds(url, maxBytes = 120 * 1024 * 1024) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const i = buf.indexOf("mvhd");
    if (i < 0) return null;
    const version = buf.readUInt8(i + 4);
    if (version === 1) {
      const timescale = buf.readUInt32BE(i + 4 + 4 + 16);
      const duration = Number(buf.readBigUInt64BE(i + 4 + 4 + 16 + 4));
      return timescale ? duration / timescale : null;
    }
    const timescale = buf.readUInt32BE(i + 4 + 4 + 8);
    const duration = buf.readUInt32BE(i + 4 + 4 + 8 + 4);
    return timescale ? duration / timescale : null;
  } catch {
    return null;
  }
}
