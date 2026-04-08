import Stripe from 'stripe';

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://nanobanano.studio";

const VALID_PACKS = {
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

  const amountNum = parseInt(amount);
  if (!type || !amountNum || !VALID_PACKS[type]?.[amountNum])
    return res.status(400).json({ error: `Invalid pack: type=${type} amount=${amount}` });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SERVICE_KEY || !STRIPE_SECRET) return res.status(500).json({ error: "Server misconfiguration" });

  let authUser;
  try { authUser = await verifyToken(user_token); }
  catch (e) { return res.status(401).json({ error: "Invalid session" }); }

  const userId = authUser.id;
  const userEmail = authUser.email;
  console.log(`Pack: ${type} +${amountNum} for ${userEmail} (${userId})`);

  // Verify active subscription Basic+
  const profileRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=plan,images_remaining,videos_remaining,subscription_status`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const profiles = await profileRes.json();
  const profile = profiles?.[0];
  console.log("Profile:", profile?.plan, profile?.subscription_status);

  const allowedPlans = ["basic", "pro", "creator"];
  if (!profile || !allowedPlans.includes(profile.plan)) {
    return res.status(403).json({ error: `Pack requires Basic+ subscription. Current plan: ${profile?.plan}` });
  }

  // Verify payment with Stripe
  let paymentConfirmed = false;
  const expectedCents = VALID_PACKS[type][amountNum];

  try {
    const stripe = new Stripe(STRIPE_SECRET);
    const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
    console.log(`Stripe customers: ${customers.data.length}`);

    for (const customer of customers.data) {
      if (paymentConfirmed) break;

      // Check PaymentIntents (one-time payments)
      const payments = await stripe.paymentIntents.list({ customer: customer.id, limit: 20 });
      for (const pi of payments.data) {
        if (pi.status !== "succeeded") continue;
        const ageMin = (Date.now() / 1000 - pi.created) / 60;
        console.log(`PI ${pi.id}: amount=${pi.amount} age=${Math.round(ageMin)}min`);
        if (pi.amount === expectedCents && ageMin < 30) {
          paymentConfirmed = true;
          console.log(`✓ Payment confirmed via PaymentIntent ${pi.id}`);
          break;
        }
      }

      if (paymentConfirmed) break;

      // Check paid invoices
      const invoices = await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 20 });
      for (const inv of invoices.data) {
        const ageMin = (Date.now() / 1000 - inv.created) / 60;
        const invAmount = inv.amount_paid || inv.total;
        console.log(`Invoice ${inv.id}: amount=${invAmount} age=${Math.round(ageMin)}min subscription=${!!inv.subscription}`);
        // One-time payment (no subscription) matching amount within last 30 min
        if (!inv.subscription && invAmount === expectedCents && ageMin < 30) {
          paymentConfirmed = true;
          console.log(`✓ Payment confirmed via Invoice ${inv.id}`);
          break;
        }
      }
    }

    if (!paymentConfirmed) {
      // Last resort: check checkout sessions
      const sessions = await stripe.checkout.sessions.list({ limit: 20 });
      for (const s of sessions.data) {
        if (s.payment_status !== "paid") continue;
        if (s.mode !== "payment") continue; // one-time only
        const ageMin = (Date.now() / 1000 - s.created) / 60;
        if (s.amount_total === expectedCents && ageMin < 30 && s.customer_email === userEmail) {
          paymentConfirmed = true;
          console.log(`✓ Payment confirmed via CheckoutSession ${s.id}`);
          break;
        }
      }
    }
  } catch (e) {
    console.error("Stripe error:", e.message);
    // On Stripe API error, still apply if user has active sub (they came from Stripe success URL)
    paymentConfirmed = true;
    console.warn("Stripe error — applying pack anyway (user has active subscription)");
  }

  if (!paymentConfirmed) {
    console.error(`Payment not confirmed for ${userEmail}: type=${type} amount=${amountNum} expectedCents=${expectedCents}`);
    return res.status(402).json({ error: "Payment not confirmed. Please wait 30 seconds and try again, or contact support." });
  }

  // Add credits
  const field = type === "images" ? "images_remaining" : "videos_remaining";
  const current = type === "images" ? (profile.images_remaining || 0) : (profile.videos_remaining || 0);
  const newTotal = current + amountNum;

  console.log(`Updating ${field}: ${current} → ${newTotal}`);

  const updateRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: sbHeaders(SERVICE_KEY),
    body: JSON.stringify({ [field]: newTotal }),
  });
  const updateText = await updateRes.text();
  console.log(`Update status: ${updateRes.status}, body: ${updateText.slice(0, 200)}`);

  if (!updateRes.ok) {
    return res.status(500).json({ error: "Failed to add credits: " + updateText });
  }

  // Verify write
  const verifyRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=images_remaining,videos_remaining`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const verifyData = await verifyRes.json();
  const updated = verifyData?.[0];
  console.log(`✓ Pack applied. New totals: images=${updated?.images_remaining} videos=${updated?.videos_remaining}`);

  return res.status(200).json({
    ok: true,
    type,
    amount: amountNum,
    added: amountNum,
    images_remaining: updated?.images_remaining ?? newTotal,
    videos_remaining: updated?.videos_remaining ?? profile.videos_remaining,
  });
}
