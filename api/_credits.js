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

// ─── Credit packs (one-time Stripe payments) ───
// id → accepted totals in cents + credits granted. Keep in sync with PACKS in App.jsx and Stripe prices.
export const PACK_CATALOG = {
  img_s: { cents: [599],        credits: 160 },
  img_m: { cents: [1299],       credits: 400 },
  img_l: { cents: [2799],       credits: 960 },
  vid_s: { cents: [3999],       credits: 1200 }, // price_1UXjvfEkbBokZiaiRvPv0L9C
  vid_m: { cents: [5799, 5999], credits: 1800 }, // price_1UXjt4EkbBokZiaiepZrcXJU (5999 = old price)
  vid_l: { cents: [8999],       credits: 3000 }, // price_1UXjwyEkbBokZiaioOrTXpND
};
export function packFromSession(session) {
  const ref = session?.client_reference_id;
  if (ref && PACK_CATALOG[ref]) return PACK_CATALOG[ref].cents.includes(session.amount_total) ? ref : null;
  if (session?.mode !== "payment") return null;
  const hit = Object.entries(PACK_CATALOG).filter(([, p]) => p.cents.includes(session.amount_total));
  return hit.length === 1 ? hit[0][0] : null; // only if the amount is unambiguous
}

// Idempotent: adds credits once per Stripe payment id (shared with /api/pack). Returns "applied" | "duplicate" | "error"
export async function applyPackPayment(userId, credits, paymentId, key) {
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=credits,processed_pack_payments`, { headers: H });
    const cur = (await r.json())?.[0];
    if (!cur) return "error";
    const done = Array.isArray(cur.processed_pack_payments) ? cur.processed_pack_payments : [];
    if (done.includes(paymentId)) return "duplicate";
    const upd = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&credits=eq.${cur.credits || 0}`, {
      method: "PATCH",
      headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ credits: (cur.credits || 0) + credits, processed_pack_payments: [...done, paymentId] }),
    });
    const rows = upd.ok ? await upd.json() : [];
    if (Array.isArray(rows) && rows.length) return "applied";
    await new Promise(res => setTimeout(res, 150 + Math.random() * 200));
  }
  return "error";
}
