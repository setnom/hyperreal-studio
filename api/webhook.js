import Stripe from 'stripe';

export const config = {
  api: { bodyParser: false },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";

const PLAN_CREDITS = {
  test:    { images: 20,  videos: 2  },
  basic:   { images: 40,  videos: 8  },
  pro:     { images: 90,  videos: 18 },
  creator: { images: 200, videos: 30 },
};

const PRICE_TO_PLAN = {
  "price_1TJYG2EkbBokZiaivYSd44qP":  "test",
  "price_1TJGutEkbBokZiaidisQbR4y": "basic",
  "price_1TJGvwEkbBokZiaisvzBQCeV": "pro",
  "price_1TJGwtEkbBokZiaiFpc24OZG": "creator",
};

const VALID_PLANS = ["test", "basic", "pro", "creator"];

function sbHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

// Try to find user by email — case insensitive search
async function findUserByEmail(email, serviceKey) {
  if (!email) return null;
  const clean = email.toLowerCase().trim();
  const res = await fetch(
    `${SB_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(clean)}&select=id,plan&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const data = await res.json();
  if (data?.[0]) return data[0];

  // Fallback: search auth.users table via admin API
  const authRes = await fetch(
    `${SB_URL}/auth/v1/admin/users?email=${encodeURIComponent(clean)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const authData = await authRes.json();
  const authUser = authData?.users?.[0];
  if (authUser?.id) return { id: authUser.id, plan: null };
  return null;
}

async function setPlan(userId, plan, email, serviceKey) {
  const credits = PLAN_CREDITS[plan];
  if (!credits) { console.error("Unknown plan:", plan); return; }
  const res = await fetch(`${SB_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      id: userId,
      email: email || "",
      plan,
      images_remaining: credits.images,
      videos_remaining: credits.videos,
      subscription_status: "active",
      subscription_start: new Date().toISOString(),
    }),
  });
  const body = await res.text();
  console.log(`setPlan ${plan} for ${userId}: status=${res.status}, body=${body.slice(0,100)}`);
}

async function deactivatePlan(userId, serviceKey) {
  await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: sbHeaders(serviceKey),
    body: JSON.stringify({ plan: "none", subscription_status: "cancelled" }),
  });
}

// Extract plan from a Stripe subscription object
async function getPlanFromSubscription(stripe, sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  if (priceId && PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const STRIPE_SECRET  = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_SECRET || !WEBHOOK_SECRET || !SERVICE_KEY) {
    console.error("Missing env vars");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const stripe = new Stripe(STRIPE_SECRET);
  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  console.log("Stripe event:", event.type);

  // ─── checkout.session.completed ───
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;
    console.log("checkout email:", email, "client_ref:", session.client_reference_id);

    // Try to get plan: 1) client_reference_id, 2) subscription price, 3) line items
    let plan = VALID_PLANS.includes(session.client_reference_id) ? session.client_reference_id : null;

    if (!plan && session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        plan = await getPlanFromSubscription(stripe, sub);
        console.log("Plan from subscription:", plan);
      } catch (e) { console.error("Sub lookup error:", e.message); }
    }

    if (!plan && session.amount_total) {
      // Fallback: guess plan by price paid
      const amt = session.amount_total;
      if (amt <= 999) plan = "test";
      else if (amt <= 1999) plan = "basic";
      else if (amt <= 4799) plan = "pro";
      else plan = "creator";
      console.log("Plan guessed from amount:", amt, "→", plan);
    }

    if (!email) { console.error("No email in checkout session"); return res.status(200).json({ received: true }); }
    if (!plan)  { console.error("Could not determine plan"); return res.status(200).json({ received: true }); }

    try {
      const user = await findUserByEmail(email, SERVICE_KEY);
      if (user) {
        await setPlan(user.id, plan, email, SERVICE_KEY);
        console.log(`✓ Activated ${plan} for ${email}`);
      } else {
        console.error(`User not found for email: ${email} — they may need to register first`);
      }
    } catch (err) {
      console.error("Activation error:", err.message);
    }
  }

  // ─── invoice.payment_succeeded ───
  // Handles BOTH first payment (subscription_create) and renewals (subscription_cycle)
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    const reason = invoice.billing_reason;
    console.log("invoice reason:", reason);

    // Process both first payment and renewals
    if (reason === "subscription_create" || reason === "subscription_cycle") {
      try {
        const customer = await stripe.customers.retrieve(invoice.customer);
        const email = customer.email;
        const priceId = invoice.lines?.data?.[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId];

        console.log("invoice email:", email, "priceId:", priceId, "plan:", plan);

        if (email && plan) {
          const user = await findUserByEmail(email, SERVICE_KEY);
          if (user) {
            await setPlan(user.id, plan, email, SERVICE_KEY);
            console.log(`✓ ${reason === "subscription_create" ? "First payment" : "Renewal"}: ${plan} for ${email}`);
          } else {
            console.error(`User not found for invoice: ${email}`);
          }
        }
      } catch (e) { console.error("Invoice handler error:", e.message); }
    }
  }

  // ─── customer.subscription.updated ───
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    if (sub.status === "active") {
      try {
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;
        const plan = await getPlanFromSubscription(stripe, sub);

        if (email && plan) {
          const user = await findUserByEmail(email, SERVICE_KEY);
          if (user && user.plan !== plan) {
            await setPlan(user.id, plan, email, SERVICE_KEY);
            console.log(`✓ Plan updated to ${plan} for ${email}`);
          }
        }
      } catch (e) { console.error("Update error:", e.message); }
    }
  }

  // ─── customer.subscription.deleted ───
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    try {
      const customer = await stripe.customers.retrieve(sub.customer);
      const email = customer.email;
      if (email) {
        const user = await findUserByEmail(email, SERVICE_KEY);
        if (user) {
          await deactivatePlan(user.id, SERVICE_KEY);
          console.log(`✓ Deactivated for ${email}`);
        }
      }
    } catch (e) { console.error("Deactivation error:", e.message); }
  }

  // ─── invoice.payment_failed ───
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    try {
      const customer = await stripe.customers.retrieve(invoice.customer);
      const email = customer.email;
      if (email) {
        const user = await findUserByEmail(email, SERVICE_KEY);
        if (user) {
          await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
            method: "PATCH",
            headers: sbHeaders(SERVICE_KEY),
            body: JSON.stringify({ subscription_status: "payment_failed" }),
          });
          console.warn(`Payment failed for ${email}`);
        }
      }
    } catch (e) { console.error("payment_failed error:", e.message); }
  }

  res.status(200).json({ received: true });
}
