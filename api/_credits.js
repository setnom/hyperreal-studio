// ─── Unified credit system ───
// Files starting with "_" inside /api are NOT deployed as Vercel functions.
// Conversion keeps the same profitability as the old images/videos split:
//   1 old image credit = 8 credits · 1 old video credit = 60 credits
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";

export const IMG_UNIT = 8;   // Nano Banana 2 / Seedream image
export const VID_UNIT = 60;  // one legacy video credit
export const VID_PER_SEC = 12; // main Video tab (Kling 3.0): 12 credits / second

export const PLAN_CREDITS_V2 = { test: 275, basic: 800, pro: 1800, creator: 3400 };

export const COSTS = {
  image: (maxRealism) => (maxRealism ? 3 : 1) * IMG_UNIT,       // 8 · GPT Image 2 = 24
  video: (durationSec) => Math.max(5, Number(durationSec) || 5) * VID_PER_SEC, // 5s = 60
  legacyVideo: (legacyCredits) => legacyCredits * VID_UNIT,      // motion / director / wavespeed tables
  legacyImage: (legacyCredits) => legacyCredits * IMG_UNIT,
};

const h = (key, json = false) => ({
  apikey: key, Authorization: `Bearer ${key}`,
  ...(json ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
});

export async function getCredits(userId, key) {
  const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=credits`, { headers: h(key) });
  const rows = await r.json();
  return rows?.[0]?.credits ?? 0;
}

// Atomic compare-and-swap deduction. Returns { ok, before, after } or { ok:false, reason }
export async function deductCredits(userId, amount, key) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = await getCredits(userId, key);
    if (before < amount) return { ok: false, reason: "insufficient", before };
    const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&credits=eq.${before}`, {
      method: "PATCH", headers: h(key, true), body: JSON.stringify({ credits: before - amount }),
    });
    const rows = r.ok ? await r.json() : [];
    if (Array.isArray(rows) && rows.length > 0) return { ok: true, before, after: before - amount };
    await new Promise(res => setTimeout(res, 120 + Math.random() * 200)); // lost the race, retry
  }
  return { ok: false, reason: "conflict" };
}

// Atomic add (refunds, plan renewals, packs). Returns new balance or null
export async function addCredits(userId, amount, key) {
  if (!amount || amount <= 0) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await getCredits(userId, key);
    const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&credits=eq.${before}`, {
      method: "PATCH", headers: h(key, true), body: JSON.stringify({ credits: before + amount }),
    });
    const rows = r.ok ? await r.json() : [];
    if (Array.isArray(rows) && rows.length > 0) return before + amount;
    await new Promise(res => setTimeout(res, 120 + Math.random() * 200));
  }
  console.error(`addCredits failed user=${userId} amount=${amount}`);
  return null;
}

export function insufficientMsg(need, have) {
  return `No tenés créditos suficientes. Necesitás ${need}, tenés ${have}. / Not enough credits. Need ${need}, have ${have}.`;
}

// Classify a failure for the UI chip: "nsfw" (content blocked) | "error"
export function classifyFailure(msg = "") {
  const m = String(msg).toLowerCase();
  return /nsfw|sensitive|safety|harmful|likeness|real people|private information|content polic|moderat|blocked|seguridad|sensible|personas reales|bloque/.test(m) ? "nsfw" : "error";
}

// Mark a generation failed + refunded (extra columns may not exist yet → best effort, never blocks the refund)
export async function tagFailure(genId, reason, refunded, key) {
  try {
    await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genId}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ fail_reason: reason, refunded }),
    });
  } catch {}
}
