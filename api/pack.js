import Stripe from 'stripe';

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

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

function sbReadHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function sbWriteHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app") && origin.includes("hyperreal-studio");
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user_token, type, amount, session_id } = req.body || {};
  if (!user_token) return res.status(401).json({ error: "Auth required" });

  const amountNum = parseInt(amount);
  const expectedCents = PACK_AMOUNTS_CENTS[type]?.[amountNum];
  if (!expectedCents) return res.status(400).json({ error: `Invalid pack: ${type} x${amount}` });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SERVICE_KEY || !STRIPE_SECRET) return res.status(500).json({ error: "Server misconfiguration" });

  // 1. Verify user
  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch (e) { return res.status(401).json({ error: "Invalid session" }); }

  const userId = authUser.id;
  const userEmail = authUser.email;
  console.log(`Pack: ${type} +${amountNum} for ${userEmail} session_id=${session_id}`);

  // 2. Get profile
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,images_remaining,videos_remaining,subscription_status,processed_pack_payments`,
    { headers: sbReadHeaders(SERVICE_KEY) }
  );
  const profiles = await profileRes.json();
  const profile = profiles?.[0];
  console.log("Profile:", profile?.plan, profile?.subscription_status);

  if (!profile) return res.status(404).json({ error: "Profile not found" });
  if (!["basic", "pro", "creator"].includes(profile.plan))
    return res.status(403).json({ error: "Requires Basic, Pro, or Creator subscription" });
  if (profile.subscription_status === "payment_failed")
    return res.status(403).json({ error: "Subscription has a payment issue. Resolve it first." });

  const processedPayments = Array.isArray(profile.processed_pack_payments) ? profile.processed_pack_payments : [];

  // 3. Verify payment with Stripe
  const stripe = new Stripe(STRIPE_SECRET);
  let confirmedPaymentId = null;

  // Strategy A: Use session_id directly if provided (most reliable)
  if (session_id && session_id.startsWith("cs_")) {
    try {
      console.log("Verifying session directly:", session_id);
      const session = await stripe.checkout.sessions.retrieve(session_id);
      console.log(`Session: status=${session.payment_status} amount=${session.amount_total} expected=${expectedCents}`);

      if (session.payment_status === "paid" && session.amount_total === expectedCents) {
        const paymentId = session.payment_intent || session_id;

        if (processedPayments.includes(paymentId)) {
          console.warn(`Already processed: ${paymentId}`);
          return res.status(409).json({ error: "This payment has already been applied to your account." });
        }

        confirmedPaymentId = paymentId;
        console.log(`✓ Confirmed via session ${session_id} → payment ${confirmedPaymentId}`);
      } else {
        console.warn(`Session not paid or wrong amount: status=${session.payment_status} amount=${session.amount_total}`);
      }
    } catch (e) {
      console.warn("Session retrieve error:", e.message);
    }
  }

  // Strategy B: Search by customer email (fallback if no session_id)
  if (!confirmedPaymentId) {
    const WINDOW = 30 * 60;
    try {
      const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
      console.log(`Customers for ${userEmail}: ${customers.data.length}`);

      for (const customer of customers.data) {
        if (confirmedPaymentId) break;

        // PaymentIntents
        const pis = await stripe.paymentIntents.list({ customer: customer.id, limit: 20 });
        for (const pi of pis.data) {
          if (pi.status !== "succeeded") continue;
          if (Date.now() / 1000 - pi.created > WINDOW) continue;
          if (pi.amount !== expectedCents) continue;
          if (processedPayments.includes(pi.id)) {
            return res.status(409).json({ error: "This payment has already been applied to your account." });
          }
          confirmedPaymentId = pi.id;
          console.log(`✓ Confirmed via PI ${pi.id}`);
          break;
        }
        if (confirmedPaymentId) break;

        // Checkout Sessions
        const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 20 });
        for (const s of sessions.data) {
          if (s.payment_status !== "paid") continue;
          if (Date.now() / 1000 - s.created > WINDOW) continue;
          if (s.amount_total !== expectedCents) continue;
          const pid = s.payment_intent || s.id;
          if (processedPayments.includes(pid)) {
            return res.status(409).json({ error: "This payment has already been applied to your account." });
          }
          confirmedPaymentId = pid;
          console.log(`✓ Confirmed via Session ${s.id}`);
          break;
        }
      }
    } catch (e) {
      console.error("Stripe search error:", e.message);
      return res.status(503).json({ error: "Payment verification unavailable. Try again in a moment." });
    }
  }

  // Hard gate — must confirm
  if (!confirmedPaymentId) {
    console.error(`No confirmed payment for ${userEmail}: ${type} x${amountNum} (${expectedCents} cents)`);
    return res.status(402).json({
      error: "Payment not confirmed. If you just paid, wait 30 seconds and try again.",
      hint: "Make sure the email on your account matches the email used for payment.",
    });
  }

  // 4. Apply credits + record payment ID (idempotency)
  const field = type === "images" ? "images_remaining" : "videos_remaining";
  const current = (type === "images" ? profile.images_remaining : profile.videos_remaining) || 0;
  const newTotal = current + amountNum;
  const updatedPayments = [...processedPayments, confirmedPaymentId];

  console.log(`Applying: ${field} ${current} → ${newTotal} | payment: ${confirmedPaymentId}`);

  const updateRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: sbWriteHeaders(SERVICE_KEY),
    body: JSON.stringify({
      [field]: newTotal,
      processed_pack_payments: updatedPayments,
    }),
  });

  const updateText = await updateRes.text();
  console.log(`PATCH: ${updateRes.status} → ${updateText.slice(0, 150)}`);

  if (!updateRes.ok) {
    return res.status(500).json({ error: `DB update failed (${updateRes.status})` });
  }

  let updatedRows = [];
  try { updatedRows = JSON.parse(updateText); } catch {}
  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    return res.status(500).json({ error: "No rows updated — profile not found" });
  }

  const updated = updatedRows[0];
  console.log(`✓ Pack applied: +${amountNum} ${type} for ${userEmail}`);

  return res.status(200).json({
    ok: true, type, amount: amountNum, added: amountNum,
    images_remaining: updated.images_remaining,
    videos_remaining: updated.videos_remaining,
  });
}
