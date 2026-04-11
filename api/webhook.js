import Stripe from 'stripe';

async function getRawBody(req) {
  if (req.body) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return Buffer.from(raw);
  }
  const chunks = [];
  for await (const chunk of req) {
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

// Plan hierarchy — higher index = higher tier
const PLAN_ORDER = ["none", "test", "basic", "pro", "creator"];

function planRank(plan) {
  const idx = PLAN_ORDER.indexOf(plan || "none");
  return idx === -1 ? 0 : idx;
}

const PRICE_TO_PLAN = {
  "price_1TJYG2EkbBokZiaivYSd44qP": "test",
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

async function getProfile(userId, serviceKey) {
  const res = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=id,plan,images_remaining,videos_remaining,pending_plan,email&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const data = await res.json();
  return data?.[0] || null;
}

async function findUserByEmail(email, serviceKey) {
  if (!email) return null;
  const clean = email.toLowerCase().trim();
  const res = await fetch(
    `${SB_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(clean)}&select=id,plan,images_remaining,videos_remaining,pending_plan&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const data = await res.json();
  if (data?.[0]) return data[0];

  const authRes = await fetch(
    `${SB_URL}/auth/v1/admin/users?email=${encodeURIComponent(clean)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const authData = await authRes.json();
  const authUser = authData?.users?.[0];
  if (authUser?.id) return { id: authUser.id, plan: null, images_remaining: 0, videos_remaining: 0, pending_plan: null };
  return null;
}

// Core plan activation — handles upgrade/downgrade/first-time logic
async function activatePlan(userId, newPlan, email, serviceKey, periodEnd = null, isRenewal = false) {
  const credits = PLAN_CREDITS[newPlan];
  if (!credits) { console.error("Unknown plan:", newPlan); return; }

  // Get current profile state
  const profile = await getProfile(userId, serviceKey);
  const currentPlan = profile?.plan || "none";
  const currentImages = profile?.images_remaining ?? 0;
  const currentVideos = profile?.videos_remaining ?? 0;
  const isFirstTime = currentPlan === "none" || currentPlan === null;

  const isUpgrade = planRank(newPlan) > planRank(currentPlan);
  const isDowngrade = planRank(newPlan) < planRank(currentPlan);

  console.log(`activatePlan: ${currentPlan} → ${newPlan} | upgrade=${isUpgrade} downgrade=${isDowngrade} renewal=${isRenewal} firstTime=${isFirstTime}`);

  if (isRenewal) {
    // Monthly renewal — check if there's a pending downgrade to apply
    const pendingPlan = profile?.pending_plan;
    if (pendingPlan && VALID_PLANS.includes(pendingPlan)) {
      const pendingCredits = PLAN_CREDITS[pendingPlan];
      console.log(`Applying pending downgrade: ${currentPlan} → ${pendingPlan}`);
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH",
        headers: sbHeaders(serviceKey),
        body: JSON.stringify({
          plan: pendingPlan,
          images_remaining: pendingCredits.images,
          videos_remaining: pendingCredits.videos,
          subscription_status: "active",
          subscription_start: new Date().toISOString(),
          subscription_end: periodEnd || null,
          pending_plan: null,
        }),
      });
      console.log(`✓ Downgrade applied: ${pendingPlan} for ${email}`);
    } else {
      // Normal renewal — reset credits to current plan value
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH",
        headers: sbHeaders(serviceKey),
        body: JSON.stringify({
          plan: currentPlan,
          images_remaining: PLAN_CREDITS[currentPlan]?.images ?? credits.images,
          videos_remaining: PLAN_CREDITS[currentPlan]?.videos ?? credits.videos,
          subscription_status: "active",
          subscription_start: new Date().toISOString(),
          subscription_end: periodEnd || null,
        }),
      });
      console.log(`✓ Renewal reset: ${currentPlan} credits for ${email}`);
    }
    return;
  }

  if (isFirstTime) {
    // First purchase — assign full credits, activate plan immediately
    await fetch(`${SB_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: userId,
        email: email || "",
        plan: newPlan,
        images_remaining: credits.images,
        videos_remaining: credits.videos,
        subscription_status: "active",
        subscription_start: new Date().toISOString(),
        subscription_end: periodEnd || null,
        pending_plan: null,
      }),
    });
    console.log(`✓ First activation: ${newPlan} (${credits.images} imgs, ${credits.videos} vids) for ${email}`);
    return;
  }

  if (isUpgrade) {
    // Upgrade — apply immediately, ADD credits to existing balance, clear any pending downgrade
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: sbHeaders(serviceKey),
      body: JSON.stringify({
        plan: newPlan,
        images_remaining: currentImages + credits.images,
        videos_remaining: currentVideos + credits.videos,
        subscription_status: "active",
        subscription_start: new Date().toISOString(),
        subscription_end: periodEnd || null,
        pending_plan: null,
      }),
    });
    console.log(`✓ Upgrade: ${currentPlan} → ${newPlan} | imgs: ${currentImages}+${credits.images}=${currentImages + credits.images} | vids: ${currentVideos}+${credits.videos}=${currentVideos + credits.videos} for ${email}`);
    return;
  }

  if (isDowngrade) {
    // Downgrade — keep current plan & status, ADD the purchased credits, save pending_plan for next renewal
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: sbHeaders(serviceKey),
      body: JSON.stringify({
        // Plan stays the same (currentPlan) until next renewal
        images_remaining: currentImages + credits.images,
        videos_remaining: currentVideos + credits.videos,
        pending_plan: newPlan,  // will be applied on next subscription_cycle
      }),
    });
    console.log(`✓ Downgrade scheduled: keeps ${currentPlan} until renewal | imgs: ${currentImages}+${credits.images} | pending: ${newPlan} for ${email}`);
    return;
  }

  // Same plan — just add credits (user bought same tier again)
  await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: sbHeaders(serviceKey),
    body: JSON.stringify({
      images_remaining: currentImages + credits.images,
      videos_remaining: currentVideos + credits.videos,
      subscription_status: "active",
    }),
  });
  console.log(`✓ Same plan repurchase: +${credits.images} imgs, +${credits.videos} vids for ${email}`);
}

async function getPlanFromSubscription(stripe, sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  if (priceId && PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  // ─── Route fal.ai webhooks (no Stripe signature) ───
  if (req.query?.source === "fal" || !req.headers["stripe-signature"]) {
    // Only handle if it looks like a fal.ai payload (has request_id)
    const body = req.body;
    if (body?.request_id) {
      console.log(`fal-webhook: request_id=${body.request_id} status=${body.status}`);
      if (!SERVICE_KEY) return res.status(200).json({ received: true });

      const { request_id, status, payload, error: falError } = body;

      // Extract URL from payload
      const extractUrl = (p) => {
        if (!p) return null;
        if (p.images?.[0]?.url) return p.images[0].url;
        if (p.video?.url) return p.video.url;
        if (p.videos?.[0]?.url) return p.videos[0].url;
        if (typeof p.url === "string") return p.url;
        return null;
      };

      const sbH = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" });

      // Find generation in DB
      let genRow = null;
      try {
        const r1 = await fetch(
          `${SB_URL}/rest/v1/generations?result_url=like.${encodeURIComponent(request_id + "|%")}&select=id,user_id,type,status&limit=1`,
          { headers: sbH(SERVICE_KEY) }
        );
        genRow = (await r1.json())?.[0] || null;
        if (!genRow) {
          const r2 = await fetch(
            `${SB_URL}/rest/v1/generations?result_url=eq.${encodeURIComponent(request_id)}&select=id,user_id,type,status&limit=1`,
            { headers: sbH(SERVICE_KEY) }
          );
          genRow = (await r2.json())?.[0] || null;
        }
        console.log(`fal-webhook lookup: ${genRow ? `found gen ${genRow.id}` : "not found"}`);
      } catch (e) { console.error("fal-webhook lookup error:", e.message); }

      if (genRow && genRow.status !== "completed") {
        if (status === "OK") {
          const url = extractUrl(payload);
          if (url) {
            try {
              await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genRow.id}`, {
                method: "PATCH",
                headers: { ...sbH(SERVICE_KEY), Prefer: "return=minimal" },
                body: JSON.stringify({ result_url: url, status: "completed" }),
              });
              console.log(`✓ fal-webhook: gen ${genRow.id} completed → ${url}`);
            } catch (e) { console.error("fal-webhook update error:", e.message); }
          }
        } else if (status === "ERROR") {
          console.error(`fal-webhook ERROR for ${request_id}: ${falError}`);
          try {
            await fetch(`${SB_URL}/rest/v1/generations?id=eq.${genRow.id}`, {
              method: "PATCH",
              headers: { ...sbH(SERVICE_KEY), Prefer: "return=minimal" },
              body: JSON.stringify({ result_url: null, status: "failed" }),
            });
            const profRes = await fetch(
              `${SB_URL}/rest/v1/profiles?id=eq.${genRow.user_id}&select=images_remaining,videos_remaining`,
              { headers: sbH(SERVICE_KEY) }
            );
            const prof = (await profRes.json())?.[0];
            if (prof) {
              const patch = genRow.type === "image"
                ? { images_remaining: (prof.images_remaining || 0) + 1 }
                : { videos_remaining: (prof.videos_remaining || 0) + 2 };
              await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${genRow.user_id}`, {
                method: "PATCH",
                headers: { ...sbH(SERVICE_KEY), Prefer: "return=minimal" },
                body: JSON.stringify(patch),
              });
            }
          } catch (e) { console.error("fal-webhook refund error:", e.message); }
        }
      }
      return res.status(200).json({ received: true });
    }
  }

  const STRIPE_SECRET  = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET || !WEBHOOK_SECRET || !SERVICE_KEY) {
    console.error("Missing env vars");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  let event;
  try {
    const stripe = new Stripe(STRIPE_SECRET);
    const buf = await getRawBody(req);
    const sig = req.headers["stripe-signature"];

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

      let plan = VALID_PLANS.includes(session.client_reference_id) ? session.client_reference_id : null;

      if (!plan && session.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          plan = await getPlanFromSubscription(stripe, sub);
          console.log("Plan from subscription:", plan);
        } catch (e) { console.error("Sub lookup error:", e.message); }
      }

      if (!email) { console.error("No email in checkout session"); return res.status(200).json({ received: true }); }
      if (!plan)  { console.error("Could not determine plan"); return res.status(200).json({ received: true }); }

      try {
        const user = await findUserByEmail(email, SERVICE_KEY);
        if (user) {
          await activatePlan(user.id, plan, email, SERVICE_KEY);
          console.log(`✓ checkout.session.completed processed for ${email} → ${plan}`);
        } else {
          console.error(`User not found for email: ${email}`);
        }
      } catch (err) { console.error("Activation error:", err.message); }
    }

    // ─── invoice.payment_succeeded ───
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const reason = invoice.billing_reason;
      console.log("invoice reason:", reason);

      if (reason === "subscription_create" || reason === "subscription_cycle") {
        try {
          const customer = await stripe.customers.retrieve(invoice.customer);
          const email = customer.email;
          const priceId = invoice.lines?.data?.[0]?.price?.id;
          const plan = PRICE_TO_PLAN[priceId];
          console.log("invoice email:", email, "priceId:", priceId, "plan:", plan);

          if (email && plan) {
            const periodEnd = invoice.lines?.data?.[0]?.period?.end
              ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
              : null;
            const user = await findUserByEmail(email, SERVICE_KEY);
            if (user) {
              const isRenewal = reason === "subscription_cycle";
              // subscription_create is handled by checkout.session.completed — skip to avoid double credit
              if (!isRenewal) {
                console.log("subscription_create — skipping, handled by checkout.session.completed");
              } else {
                // Verify subscription still active before renewal
                if (invoice.subscription) {
                  const sub = await stripe.subscriptions.retrieve(invoice.subscription);
                  if (sub.status !== "active") {
                    console.warn(`Subscription not active (${sub.status}), skipping renewal for ${email}`);
                    return res.status(200).json({ received: true });
                  }
                }
                await activatePlan(user.id, plan, email, SERVICE_KEY, periodEnd, true);
              }
            } else {
              console.error(`User not found for invoice: ${email}`);
            }
          }
        } catch (e) { console.error("Invoice handler error:", e.message); }
      }
    }

    // ─── invoice.payment_failed ───
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      try {
        const customer = await stripe.customers.retrieve(invoice.customer);
        const email = customer.email;
        console.log(`Payment failed for ${email}, attempt ${invoice.attempt_count}`);
        if (email) {
          const user = await findUserByEmail(email, SERVICE_KEY);
          if (user) {
            await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
              method: "PATCH",
              headers: sbHeaders(SERVICE_KEY),
              body: JSON.stringify({ subscription_status: "payment_failed" }),
            });
            console.warn(`✗ Account frozen for ${email} (attempt ${invoice.attempt_count})`);
          }
        }
      } catch (e) { console.error("payment_failed error:", e.message); }
    }

    // ─── customer.subscription.updated ───
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      try {
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;
        const plan = await getPlanFromSubscription(stripe, sub);
        console.log(`Sub updated: status=${sub.status} plan=${plan} email=${email}`);

        if (email) {
          const user = await findUserByEmail(email, SERVICE_KEY);
          if (user) {
            if (sub.status === "active" && plan) {
              // Only reactivate if was frozen due to payment issue
              const profile = await getProfile(user.id, SERVICE_KEY);
              if (profile?.subscription_status === "payment_failed") {
                await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
                  method: "PATCH",
                  headers: sbHeaders(SERVICE_KEY),
                  body: JSON.stringify({ subscription_status: "active" }),
                });
                console.log(`✓ Unfrozen account for ${email}`);
              }
            } else if (sub.status === "past_due" || sub.status === "unpaid") {
              await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
                method: "PATCH",
                headers: sbHeaders(SERVICE_KEY),
                body: JSON.stringify({ subscription_status: "payment_failed" }),
              });
              console.warn(`✗ Frozen account for ${email} (sub status: ${sub.status})`);
            }
          }
        }
      } catch (e) { console.error("Sub update error:", e.message); }
    }

    // ─── customer.subscription.deleted ───
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      try {
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;
        console.log(`Subscription cancelled for ${email}`);
        if (email) {
          const user = await findUserByEmail(email, SERVICE_KEY);
          if (user) {
            const profile = await getProfile(user.id, SERVICE_KEY);
            // If there's a pending downgrade, apply it now
            if (profile?.pending_plan && VALID_PLANS.includes(profile.pending_plan)) {
              const pendingCredits = PLAN_CREDITS[profile.pending_plan];
              await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
                method: "PATCH",
                headers: sbHeaders(SERVICE_KEY),
                body: JSON.stringify({
                  plan: profile.pending_plan,
                  images_remaining: pendingCredits.images,
                  videos_remaining: pendingCredits.videos,
                  subscription_status: "active",
                  pending_plan: null,
                }),
              });
              console.log(`✓ Pending downgrade applied on cancellation: ${profile.pending_plan} for ${email}`);
            } else {
              // No pending plan — deactivate
              await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
                method: "PATCH",
                headers: sbHeaders(SERVICE_KEY),
                body: JSON.stringify({ plan: "none", subscription_status: "cancelled", pending_plan: null }),
              });
              console.log(`✓ Plan deactivated for ${email}`);
            }
          }
        }
      } catch (e) { console.error("Sub deleted error:", e.message); }
    }

    res.status(200).json({ received: true });
  } catch (outerErr) {
    console.error("Webhook handler crash:", outerErr.message);
    res.status(200).json({ received: true, error: outerErr.message });
  }
}
