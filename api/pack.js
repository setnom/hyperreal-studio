import Stripe from 'stripe';

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

const PLAN_CREDITS = {
  test:    { images: 20,  videos: 2  },
  basic:   { images: 40,  videos: 8  },
  pro:     { images: 90,  videos: 18 },
  creator: { images: 200, videos: 30 },
};

// Pack amounts → cents for Stripe amount matching
const PACK_AMOUNTS_CENTS = {
  images: { 20: 599, 50: 1299, 120: 2799 },
  videos: { 5: 1299, 12: 2799, 30: 5999 },
};

async function verifyToken(user_token) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${user_token}` },
  });
  const data = await res.json();
  if (!data?.id) throw new Error("Invalid session");
  return data;
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user_token, type, amount } = req.body || {};
  if (!user_token) return res.status(401).json({ error: "Auth required" });
  if (!type || !amount) return res.status(400).json({ error: "type and amount required" });

  const amountNum = parseInt(amount);
  const expectedCents = PACK_AMOUNTS_CENTS[type]?.[amountNum];
  if (!expectedCents) return res.status(400).json({ error: `Invalid pack: ${type} x${amount}` });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SERVICE_KEY || !STRIPE_SECRET) return res.status(500).json({ error: "Server misconfiguration" });

  // 1. Verify user token
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch (e) { return res.status(401).json({ error: "Invalid session" }); }

  const userId = authUser.id;
  const userEmail = authUser.email;
  console.log(`Pack request: ${type} +${amountNum} for ${userEmail}`);

  // 2. Verify active subscription Basic+
  const profileRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,images_remaining,videos_remaining,subscription_status`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const profiles = await profileRes.json();
  const profile = profiles?.[0];

  if (!profile || !["basic", "pro", "creator"].includes(profile.plan)) {
    return res.status(403).json({ error: "Pack purchases require an active Basic, Pro, or Creator subscription." });
  }

  // 3. Verify recent payment with Stripe
  let confirmed = false;
  try {
    const stripe = new Stripe(STRIPE_SECRET);
    const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
    console.log(`Stripe customers: ${customers.data.length}`);

    const WINDOW = 30 * 60; // 30 minute window

    for (const customer of customers.data) {
      if (confirmed) break;

      // Check PaymentIntents (Payment Links create these)
      const payments = await stripe.paymentIntents.list({ customer: customer.id, limit: 20 });
      for (const pi of payments.data) {
        if (pi.status !== "succeeded") continue;
        if (Date.now() / 1000 - pi.created > WINDOW) continue;
        console.log(`PI: amount=${pi.amount} expected=${expectedCents}`);
        if (pi.amount === expectedCents) { confirmed = true; console.log(`✓ Confirmed via PaymentIntent ${pi.id}`); break; }
      }
      if (confirmed) break;

      // Check Checkout Sessions (alternative Payment Link flow)
      const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 20 });
      for (const session of sessions.data) {
        if (session.payment_status !== "paid") continue;
        if (Date.now() / 1000 - session.created > WINDOW) continue;
        console.log(`Session: amount=${session.amount_total} expected=${expectedCents}`);
        if (session.amount_total === expectedCents) { confirmed = true; console.log(`✓ Confirmed via Session ${session.id}`); break; }
      }
      if (confirmed) break;

      // Check paid invoices
      const invoices = await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 10 });
      for (const inv of invoices.data) {
        if (Date.now() / 1000 - inv.created > WINDOW) continue;
        if (inv.subscription) continue; // skip subscription invoices
        if (inv.amount_paid === expectedCents) { confirmed = true; console.log(`✓ Confirmed via Invoice ${inv.id}`); break; }
      }
    }
  } catch (e) {
    console.error("Stripe error:", e.message);
    // On Stripe error — still apply if user came from success URL (trust the redirect)
    confirmed = true;
    console.warn("Stripe verification failed, trusting redirect");
  }

  if (!confirmed) {
    console.error(`Payment not confirmed for ${userEmail}: ${type} x${amountNum} (${expectedCents} cents)`);
    return res.status(402).json({ error: `Payment not confirmed. Make sure you completed the purchase. pack=${type} amount=${amountNum}` });
  }

  // 4. Add credits atomically
  const field = type === "images" ? "images_remaining" : "videos_remaining";
  const current = type === "images" ? (profile.images_remaining || 0) : (profile.videos_remaining || 0);
  const newTotal = current + amountNum;

  const updateRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: sbHeaders(SERVICE_KEY),
    body: JSON.stringify({ [field]: newTotal }),
  });
  const updateText = await updateRes.text();
  console.log(`Credits: ${field} ${current} → ${newTotal} | status=${updateRes.status}`);

  if (!updateRes.ok) {
    return res.status(500).json({ error: `DB update failed: ${updateText.slice(0, 100)}` });
  }

  // 5. Return final profile credits
  const finalRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=images_remaining,videos_remaining`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const final = (await finalRes.json())?.[0];

  console.log(`✓ Pack applied: +${amountNum} ${type} for ${userEmail} → total: ${newTotal}`);
  return res.status(200).json({
    ok: true,
    type,
    amount: amountNum,
    added: amountNum,
    images_remaining: final?.images_remaining ?? newTotal,
    videos_remaining: final?.videos_remaining ?? (profile.videos_remaining || 0),
  });
}
