import { useState, useEffect, useRef } from "react";

// ─── CONFIG ───
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5Z2NzeXFhaGhkdG13bXFrbG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTIxNzcsImV4cCI6MjA5MTA2ODE3N30.YddNMUlpSQSkIqf2q8RAVqEH-vYUfPunjv21Lwy0d_Y";
const PRICES = {
  test: { link: "https://buy.stripe.com/3cI4gz3qW7q1dyf5rNeME0K", images: 20, videos: 2 },
  basic: { link: "https://buy.stripe.com/14AcN57Hc39LgKraM7eME0H", images: 40, videos: 8 },
  pro: { link: "https://buy.stripe.com/6oU14n7Hc25H8dVf2neME0I", images: 90, videos: 18 },
  creator: { link: "https://buy.stripe.com/aFacN55z4bGh3XF2fBeME0J", images: 200, videos: 30 },
};

// Extra credit packs — one-time purchase, only for Basic+ subscribers
const PACKS = {
  img_s:  { link: "https://buy.stripe.com/bJeaEX9PkaCdbq77zVeME0L", type: "images", amount: 20,  price: 5.99,  label: "Pack S", emoji: "📦" },
  img_m:  { link: "https://buy.stripe.com/fZu9AT2mS4dP1Px3jFeME0M", type: "images", amount: 50,  price: 12.99, label: "Pack M", emoji: "📦" },
  img_l:  { link: "https://buy.stripe.com/bJe6oHbXsh0BgKrg6reME0N", type: "images", amount: 120, price: 27.99, label: "Pack L", emoji: "📦" },
  vid_s:  { link: "https://buy.stripe.com/6oUaEXe5A11D3XFf2neME0O", type: "videos", amount: 5,   price: 12.99, label: "Pack S", emoji: "🎬" },
  vid_m:  { link: "https://buy.stripe.com/cNi4gz8Lgh0B2TBdYjeME0P", type: "videos", amount: 12,  price: 27.99, label: "Pack M", emoji: "🎬" },
  vid_l:  { link: "https://buy.stripe.com/3cI3cv9Pk9y9dyfbQbeME0Q",              type: "videos", amount: 30,  price: 59.99, label: "Pack L", emoji: "🎬" },
};

// Plans that can purchase extra packs (basic and above)
const PACK_ELIGIBLE_PLANS = ["basic", "pro", "creator"];

const hdr = (t) => ({ apikey: SB_KEY, Authorization: `Bearer ${t || SB_KEY}`, "Content-Type": "application/json" });

const sb = {
  signUp: (e, p) => fetch(`${SB_URL}/auth/v1/signup`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: p }) }).then(r => r.json()),
  signIn: (e, p) => fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: p }) }).then(r => r.json()),
  getUser: (t) => fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } }).then(r => r.json()),
  getProfile: (id, t) => fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}&select=*`, { headers: hdr(t) }).then(r => r.json()).then(d => d?.[0]),
  // NOTE: updateProfile intentionally removed — plan/credits can only be modified by backend API
  addGen: (uid, type, prompt, style, t) => fetch(`${SB_URL}/rest/v1/generations`, { method: "POST", headers: { ...hdr(t), Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, type, prompt, style, status: "completed" }) }).then(r => r.json()),
  getGens: (uid, t) => fetch(`${SB_URL}/rest/v1/generations?user_id=eq.${uid}&select=*&order=created_at.desc&limit=1000`, { headers: hdr(t) }).then(r => r.json()),
  googleSignIn: () => {
    window.location.href = `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin)}`;
  },
};

function openCheckout(planId) {
  const plan = PRICES[planId];
  if (plan?.link) {
    const successReturn = encodeURIComponent(window.location.origin + "?payment=success&plan=" + planId);
    window.location.href = plan.link + "?prefilled_email=" + encodeURIComponent("") + "&client_reference_id=" + planId;
  }
}

function openPack(packId, userEmail) {
  const pack = PACKS[packId];
  if (!pack?.link || pack.link === "PENDING_STRIPE_LINK") return;
  // {CHECKOUT_SESSION_ID} is replaced by Stripe automatically with the real session ID
  const successUrl = window.location.origin + "?pack=success&id=" + packId + "&type=" + pack.type + "&amount=" + pack.amount + "&sid={CHECKOUT_SESSION_ID}";
  window.location.href = pack.link +
    "?prefilled_email=" + encodeURIComponent(userEmail || "") +
    "&client_reference_id=" + packId +
    "&success_url=" + encodeURIComponent(successUrl);
}

// ─── i18n ───
const TEXTS = {
  es: {
    hero_badge: "Contenido que convierte · IA Generativa",
    hero_title_1: "Crea contenido que ",
    hero_title_2: "vende",
    hero_title_3: "",
    hero_sub: "Empieza a vender con contenido profesional hoy mismo — sin cámara, sin equipo y sin experiencia.",
    start: "Iniciar →",
    start_now: "Comenzar ahora →",
    stat_save: "Ahorro vs tradicional",
    stat_fast: "Más rápido",
    stat_price: "Por imagen",
    plans_title: "Planes",
    plans_sub: "Cancela cuando quieras",
    launch_badge: "🔥 Precio de lanzamiento",
    subscribe: "Suscribirme",
    learn_title: "¿Prefieres aprender a hacerlo tú mismo?",
    learn_sub: "Domina IA generativa en nuestra comunidad",
    learn_cta: "Conocer HyperReal AI Lab →",
    footer: "© 2026 NanoBanano Studio · Powered by HyperReal AI Lab",
    login_title: "Inicia sesión",
    signup_title: "Crea tu cuenta",
    login_sub: "Accede a tu estudio",
    signup_sub: "Empieza a generar contenido IA",
    google_btn: "Continuar con Google",
    or_email: "o con email",
    email_ph: "Email",
    pass_ph: "Contraseña (mín. 6 caracteres)",
    login_btn: "Entrar",
    signup_btn: "Registrarme",
    no_account: "¿No tienes cuenta? ",
    has_account: "¿Ya tienes cuenta? ",
    register: "Regístrate",
    signin: "Inicia sesión",
    back: "← Volver",
    loading: "Cargando...",
    confirm_email: "✓ Revisa tu email para confirmar",
    choose_plan: "Elige tu plan",
    choose_plan_sub: "Selecciona un plan para empezar a generar",
    no_plan: "Sin plan activo",
    choose_plan_btn: "Elegir plan →",
    plan_label: "Plan",
    no_plan_label: "Sin plan",
    change_plan: "Cambiar plan",
    images_label: "Imágenes",
    videos_label: "Videos",
    tab_image: "🖼️ Imagen",
    tab_video: "🎬 Video",
    tab_gallery: "📁 Galería",
    tab_motion: "🎭 Motion",
    tab_director: "🎬 Director",
    library: "Biblioteca",
    no_gens: "Sin generaciones aún",
    prompt_img: "Describe la imagen que quieres generar...",
    prompt_vid: "Describe la escena del video...",
    style_label: "Estilo",
    ratio_label: "Proporción",
    vid_ratio: "Proporción de video",
    horizontal: "Horizontal",
    vertical: "Vertical",
    square: "Cuadrado",
    duration: "Duración",
    audio: "Audio nativo",
    audio_sub: "IA genera audio ambiental",
    multishot: "Multishot",
    multishot_sub: "División automática en múltiples tomas",
    frames: "Frames inicio / fin",
    optional: "Opcional",
    start_frame: "Frame inicial",
    end_frame: "Frame final",
    upload: "+ Subir",
    ref_images: "Imágenes de referencia",
    ref_sub: "Opcional · Hasta 14 imágenes para guiar la generación",
    gen_image: "Generar Imagen",
    gen_video: "Generar Video",
    generating_img: "Generando imagen",
    generating_vid: "Generando video",
    powered_img: "Contenido premium directo de nuestros GPUs",
    powered_vid: "Contenido premium directo de nuestros GPUs",
    est_time: "puede tardar de",
    est_to: "a",
    est_min: "min",
    no_credits_img: "Sin créditos de imagen",
    no_credits_vid: "Sin créditos de video",
    no_credits_sub: "Actualiza tu plan para obtener más créditos",
    upgrade: "Actualizar plan →",
    download: "↓ Descargar",
    close: "Cerrar",
    no_limits: "¿Crear sin límites?",
    learn_lab: "Aprende en HyperReal AI Lab →",
    plan_for_gen: "Elige un plan para generar →",
    timeout: "La generación tardó demasiado. Contacta soporte.",
    failed: "La generación falló. Intenta con otro prompt.",
    upload_err: "Error al subir imagen. Intenta con una más pequeña.",
    frame_err: "Error al subir frame. Intenta con una imagen más pequeña.",
    conn_err: "Error de conexión con el servidor.",
    payment_ok: "¡Pago recibido! Activando tu plan...",
    plan_active: "✓ Plan activado",
    payment_cancel: "Pago cancelado",
    processing: "Procesando pago... Refresca en unos segundos.",
    logout: "Salir",
    per_month: "/mes",
    // User panel
    my_plan: "Mi Plan",
    next_billing: "Próxima facturación",
    billing_until: "Plan hasta",
    no_billing: "Sin fecha activa",
    cancel_sub: "Cancelar suscripción",
    cancel_confirm_title: "¿Cancelar suscripción?",
    cancel_confirm_body: "Si cancelas, pierdes tu precio actual para siempre. Si continúas activo y los precios suben, tú mantienes la tarifa a la que te registraste. Si definitivamente estás seguro de cancelar, no te preocupes, puedes reactivar cuando quieras, te estaremos esperando.",
    cancel_confirm_yes: "Sí, cancelar",
    cancel_confirm_no: "No, mantener",
    cancel_done: "Suscripción cancelada. Tus créditos siguen activos hasta fin de ciclo.",
    img_credits: "Imágenes restantes",
    vid_credits: "Videos restantes",
    // TyC
    terms: "Términos y Condiciones",
    privacy: "Privacidad",
    styles: { photorealistic: "Fotorrealista", cinematic: "Cinemático", product: "Producto", portrait: "Retrato", pixar: "Pixar 3D", ads: "Anuncio Ads", neutral: "Neutro", restore: "Restaurar", colorize: "Colorear" },
  },
  en: {
    hero_badge: "Content That Converts · Generative AI",
    hero_title_1: "Create content that ",
    hero_title_2: "sells",
    hero_title_3: "",
    hero_sub: "Start selling with professional content today — no camera, no equipment, no experience needed.",
    start: "Start →",
    start_now: "Get started →",
    stat_save: "Savings vs traditional",
    stat_fast: "Faster",
    stat_price: "Per image",
    plans_title: "Plans",
    plans_sub: "Cancel anytime",
    launch_badge: "🔥 Launch price",
    subscribe: "Subscribe",
    learn_title: "Prefer to learn how to do it yourself?",
    learn_sub: "Master generative AI in our community",
    learn_cta: "Discover HyperReal AI Lab →",
    footer: "© 2026 NanoBanano Studio · Powered by HyperReal AI Lab",
    login_title: "Sign in",
    signup_title: "Create account",
    login_sub: "Access your studio",
    signup_sub: "Start generating AI content",
    google_btn: "Continue with Google",
    or_email: "or with email",
    email_ph: "Email",
    pass_ph: "Password (min 6 characters)",
    login_btn: "Sign in",
    signup_btn: "Sign up",
    no_account: "Don't have an account? ",
    has_account: "Already have an account? ",
    register: "Sign up",
    signin: "Sign in",
    back: "← Back",
    loading: "Loading...",
    confirm_email: "✓ Check your email to confirm",
    choose_plan: "Choose your plan",
    choose_plan_sub: "Select a plan to start generating",
    no_plan: "No active plan",
    choose_plan_btn: "Choose plan →",
    plan_label: "Plan",
    no_plan_label: "No plan",
    change_plan: "Change plan",
    images_label: "Images",
    videos_label: "Videos",
    tab_image: "🖼️ Image",
    tab_video: "🎬 Video",
    tab_gallery: "📁 Gallery",
    tab_motion: "🎭 Motion",
    tab_director: "🎬 Director",
    library: "Library",
    no_gens: "No generations yet",
    prompt_img: "Describe the image you want to generate...",
    prompt_vid: "Describe the video scene...",
    style_label: "Style",
    ratio_label: "Aspect ratio",
    vid_ratio: "Aspect ratio",
    horizontal: "Horizontal",
    vertical: "Vertical",
    square: "Square",
    duration: "Duration",
    audio: "Native audio",
    audio_sub: "AI generates ambient audio",
    multishot: "Multishot",
    multishot_sub: "Auto-split into multiple shots",
    frames: "Start / end frames",
    optional: "Optional",
    start_frame: "Start frame",
    end_frame: "End frame",
    upload: "+ Upload",
    ref_images: "Reference images",
    ref_sub: "Optional · Up to 14 images to guide generation",
    gen_image: "Generate Image",
    gen_video: "Generate Video",
    generating_img: "Generating image",
    generating_vid: "Generating video",
    powered_img: "Contenido premium directo de nuestros GPUs",
    powered_vid: "Contenido premium directo de nuestros GPUs",
    est_time: "may take from",
    est_to: "to",
    est_min: "min",
    no_credits_img: "No image credits left",
    no_credits_vid: "No video credits left",
    no_credits_sub: "Upgrade your plan to get more credits",
    upgrade: "Upgrade plan →",
    download: "↓ Download",
    close: "Close",
    no_limits: "Create without limits?",
    learn_lab: "Learn at HyperReal AI Lab →",
    plan_for_gen: "Choose a plan to generate →",
    timeout: "Generation took too long. Contact support.",
    failed: "Generation failed. Try a different prompt.",
    upload_err: "Error uploading image. Try a smaller one.",
    frame_err: "Error uploading frame. Try a smaller image.",
    conn_err: "Server connection error.",
    payment_ok: "Payment received! Activating your plan...",
    plan_active: "✓ Plan activated",
    payment_cancel: "Payment cancelled",
    processing: "Processing payment... Refresh in a few seconds.",
    logout: "Log out",
    per_month: "/mo",
    // User panel
    my_plan: "My Plan",
    next_billing: "Next billing",
    billing_until: "Plan until",
    no_billing: "No active date",
    cancel_sub: "Cancel subscription",
    cancel_confirm_title: "Cancel subscription?",
    cancel_confirm_body: "If you cancel, you lose your current price forever. If you stay active and prices go up, you keep the rate you signed up for. If you're absolutely sure you want to cancel, don't worry — you can reactivate anytime, we'll be here waiting for you.",
    cancel_confirm_yes: "Yes, cancel",
    cancel_confirm_no: "No, keep it",
    cancel_done: "Subscription cancelled. Your credits remain active until end of cycle.",
    img_credits: "Images remaining",
    vid_credits: "Videos remaining",
    // TyC
    terms: "Terms & Conditions",
    privacy: "Privacy",
    styles: { photorealistic: "Photorealistic", cinematic: "Cinematic", product: "Product", portrait: "Portrait", pixar: "Pixar 3D", ads: "Ad Creative", neutral: "Neutral", restore: "Restore", colorize: "Coloring Page" },
  },
};

function detectLang() {
  const nav = (typeof navigator !== "undefined" ? navigator.language || navigator.userLanguage || "" : "").toLowerCase();
  return nav.startsWith("es") ? "es" : "en";
}

// ─── STYLE PROMPT ENGINEERING ───
// Each style injects targeted technical parameters to genuinely influence generation
const STYLE_PROMPTS = {
  photorealistic: {
    prefix: "",
    suffix: "Camera system: smartphone-class optics equivalent to 24–28mm full-frame, f/1.8 aperture, lens-to-subject distance 0.6–1.2m, subject-to-background distance 1.5–3.0m, computational photography pipeline with realistic depth mapping. Lighting: natural ambient light 4800–6500K, mixed environmental bounce, slight exposure inconsistency between planes, no studio lighting. Sensor behavior: small sensor CMOS characteristics, subtle noise in shadows, non-uniform noise distribution, highlight rolloff slightly compressed with non-linear falloff, mild dynamic range limitations. Optics: slight edge softness, minimal chromatic aberration, subtle lens breathing, non-uniform focus transition, depth of field consistent with focal length and distance. Skin & materials: visible microtexture, natural pores, slight tonal variation, non-uniform specular response with T-zone slightly more reflective, real fabric fiber irregularity, no plastic smoothing. Imperfections: micro asymmetry preserved, slight exposure imbalance, minimal motion micro-blur if handheld, environmental dust particles, subtle color cast bleed. Color: neutral white balance with slight real-world deviation, no HDR look, no overprocessing. Composition: handheld framing, natural perspective, no perfect symmetry. No text, no logos, no artificial CGI look, no over-smoothing, no perfect gradients. Photographic realism.",
  },
  cinematic: {
    prefix: "cinematic still frame, ",
    suffix: "Camera system: digital cinema camera equivalent to ARRI Alexa 35 sensor, large format look, 35mm full-frame equivalent lens, aperture T1.8–T2.8, lens-to-subject distance 1.5–3.0m, subject-to-background distance 3.0–8.0m, cinematic depth of field physically consistent. Lighting: controlled cinematic lighting 3200K–5600K depending on source, directional key light at 30–45 degrees, soft falloff with controlled contrast ratio 1:4 to 1:8, practical lights integrated in scene, subtle mixed color temperatures. Sensor behavior: high dynamic range with smooth highlight rolloff, non-linear highlight compression, rich shadow detail retention, minimal but present sensor noise, filmic tonal response no HDR clipping. Optics: cinema lens characteristics, shallow depth of field with organic falloff, subtle focus breathing, slight edge softness, minimal chromatic aberration, natural bokeh with non-uniform edge behavior. Color science: cinematic color grading baseline, natural skin tones, slight color separation warm highlights cooler shadows, no oversaturation, no digital clipping. Skin & materials: realistic microtexture, visible pores, subtle tonal variation, non-uniform specular highlights zone-dependent, no beauty smoothing. Imperfections: slight lens imperfections, micro contrast variation across frame, subtle atmospheric diffusion, minimal halation in highlights, no perfect gradients. Atmosphere: controlled cinematic environment, slight haze or air particles for depth separation, subtle volumetric light if justified. Composition: deliberate framing, stable camera tripod or controlled dolly, balanced negative space, subject-background separation driven by optics and light. Motion blur: shutter consistent with 180 degree shutter rule, natural motion blur only if justified. No text, no logos, no CGI look, no over-sharpening, no artificial blur. Photographic realism.",
  },
  product: {
    prefix: "",
    suffix: "professional product photography, studio lighting setup, clean white or gradient background, macro detail, crisp sharp edges, commercial advertising quality, reflection on surface, isolated subject, brand campaign style, 4K studio shot",
  },
  portrait: {
    prefix: "",
    suffix: "portrait photography, Rembrandt lighting, catchlight in eyes, soft bokeh background, skin retouching, high-end fashion editorial, sharp facial features, professional studio backdrop, 85mm portrait lens, magazine cover quality",
  },
  pixar: {
    prefix: "Pixar 3D animation style, ",
    suffix: "rendered in Pixar RenderMan, subsurface scattering on skin, expressive oversized eyes, smooth rounded character design, vibrant saturated color palette, soft global illumination, cinematic depth of field, detailed hair simulation, whimsical stylized realism, Disney-Pixar aesthetic, high-end CGI quality, studio lighting rig, 8K render",
  },
  ads: {
    prefix: "high-converting advertising visual, ",
    suffix: "bold punchy composition, eye-catching hero product placement, strong visual hierarchy, vibrant contrast colors that stop the scroll, clear focal point with negative space for text overlay, professional retouching, aspirational lifestyle feel, optimized for mobile feed 9:16 and square 1:1, Meta Ads and TikTok Ads ready, emotional trigger lighting, premium brand aesthetic, photorealistic commercial quality",
  },
  neutral: {
    prefix: "",
    suffix: "",
  },
  restore: {
    prefix: "",
    suffix: "Do not alter facial features or characteristics. Restore, colorize, and enhance this old photograph to ultra-high quality 8K resolution. IDENTITY & COMPOSITION - NON-NEGOTIABLE: Preserve 100% of facial geometry, bone structure, expressions, and identity. Zero alterations. Keep exact composition: same pose, framing, background, and all elements. Do NOT reimagine, stylize, or add anything that wasn't in the original.",
  },
  colorize: {
    prefix: "",
    suffix: "Transform the provided image into a high-quality black-and-white illustration in a coloring page style. GENERAL REQUIREMENTS: Completely remove color and any complex shading. Convert the image into clean line art, with well-defined black lines on a pure white background. Do not use grays, gradients, or fills: only outlines. The result should look like a professional coloring book page. LINE TREATMENT: Use continuous, smooth, and closed lines. Medium to consistent line thickness. Prioritize clear and simplified contours, avoiding visual noise. Keep important details but remove unnecessary micro-details. Ensure all areas are clearly enclosed so they can be colored. SIMPLIFICATION AND STYLE: Simplify complex textures into easy-to-color shapes. Maintain the essence and proportions of the original subject. Clean, friendly style, like a children's illustration or professional coloring book. Avoid hyperrealism; prioritize clarity and readability. MAIN SUBJECT: Preserve the shape, pose, and key features of the original subject. Keep facial expressions clear if applicable. Clearly define the subject's edges to separate it from the background. BACKGROUND: Simplify the background or remove it if very complex. Reduce to minimal elements with clear lines. Avoid visual clutter. FINAL QUALITY: High resolution. Sharp edges, no pixelation. No artifacts, smudges, or noise. Balanced and centered composition. OUTPUT: Pure black-and-white image, only black lines on a white background, ready to print and color. Add small wide spaces to make coloring easier. High level of detail.",
  },
};

function buildStyledPrompt(userPrompt, styleId) {
  const s = STYLE_PROMPTS[styleId] || STYLE_PROMPTS.photorealistic;
  // Neutral — no modification
  if (!s.prefix && !s.suffix) return userPrompt.trim() || "Generate image";
  // Restore/Colorize — suffix only, works with empty prompt
  if (styleId === "restore" || styleId === "colorize") {
    const base = userPrompt.trim();
    return base ? `${base}. ${s.suffix}` : s.suffix;
  }
  const base = (userPrompt.trim() || "").replace(/[.,]+$/, "");
  if (!base) return s.suffix;
  return `${s.prefix}${base}, ${s.suffix}`;
}
const PLANS = [
  { id: "test", name: "Test", nameEn: "Test", price: 9.99, oldPrice: 29.99, images: 20, videos: 2, maxDuration: [5], resolution: "1K",
    features: { es: ["20 imágenes premium (calidad 1K)/mes", "2 videos premium (5s)/mes", "Calidad de imagen 1K", "Soporte por email"], en: ["20 premium images (1K quality)/mo", "2 premium videos (5s)/mo", "1K image quality", "Email support"] },
    color: "#22c55e", popular: false },
  { id: "basic", name: "Básico", nameEn: "Basic", price: 19.99, oldPrice: 49.99, images: 40, videos: 8, maxDuration: [5], resolution: "1K",
    features: { es: ["40 imágenes premium (calidad 1K)/mes", "8 videos premium (5s)/mes", "Calidad de imagen 1K", "Soporte por email"], en: ["40 premium images (1K quality)/mo", "8 premium videos (5s)/mo", "1K image quality", "Email support"] },
    color: "#00f0ff", popular: false },
  { id: "pro", name: "Pro", nameEn: "Pro", price: 47.99, oldPrice: 99.99, images: 90, videos: 18, maxDuration: [5, 8], resolution: "2K",
    features: { es: ["90 imágenes premium (calidad 2K)/mes", "18 videos premium (5-8s)/mes", "Calidad de imagen 2K", "Prioridad en cola", "Soporte prioritario"], en: ["90 premium images (2K quality)/mo", "18 premium videos (5-8s)/mo", "2K image quality", "Priority queue", "Priority support"] },
    color: "#b44aff", popular: true },
  { id: "creator", name: "Creador", nameEn: "Creator", price: 99.99, oldPrice: 199, images: 200, videos: 30, maxDuration: [5, 8, 10], resolution: "4K",
    features: { es: ["200 imágenes premium (calidad 4K)/mes", "30 videos premium (5-15s)/mes", "Calidad de imagen 4K", "Cola prioritaria máxima", "Soporte dedicado", "Acceso anticipado a modelos"], en: ["200 premium images (4K quality)/mo", "30 premium videos (5-15s)/mo", "4K image quality", "Max priority queue", "Dedicated support", "Early access to models"] },
    color: "#ff6b2b", popular: false },
];
const STYLES = [
  { id: "photorealistic", label: "Fotorrealista", icon: "📸" },
  { id: "cinematic", label: "Cinemático", icon: "🎬" },
  { id: "product", label: "Producto", icon: "🛍️" },
  { id: "portrait", label: "Retrato", icon: "👤" },
  { id: "pixar", label: "Pixar 3D", icon: "🎭" },
  { id: "ads", label: "Anuncio Ads", icon: "🚀" },
  { id: "neutral", label: "Neutro", icon: "⚪" },
  { id: "restore", label: "Restaurar", icon: "🔧" },
  { id: "colorize", label: "Colorear", icon: "🖍️" },
];
const RATIOS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"];
const SAMPLE = ["Luxury perfume bottle on black marble, volumetric lighting, 8K", "Latin woman CEO in modern office, golden hour, shallow DOF", "Gourmet burger floating, ingredients exploding, dark bg, studio light", "Futuristic car in neon-lit Tokyo street, rain reflections, cinematic"];

const P = { LAND: 0, AUTH: 1, DASH: 2, PLANS: 3 };
const T = { IMG: 0, VID: 1, GAL: 2, MOT: 3, DIR: 4 };

// ─── HOOKS ───
function useW() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return w;
}

// ─── COMPONENTS ───
const GIcon = () => <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;

function Generating({ type, duration, lang, genStatus }) {
  const [d, setD] = useState("");
  const [p, setP] = useState(0);
  useEffect(() => {
    const a = setInterval(() => setD(x => x.length >= 3 ? "" : x + "."), 400);
    const b = setInterval(() => {
      setP(v => {
        if (genStatus?.phase === "queued") return Math.min(v + 0.5, 15);
        if (genStatus?.phase === "generating") return Math.min(v + Math.random() * 3, 95);
        if (genStatus?.phase === "done") return 100;
        return Math.min(v + 1, 95);
      });
    }, 800);
    return () => { clearInterval(a); clearInterval(b); };
  }, [genStatus?.phase]);

  const formatTime = (s) => s >= 60 ? `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}` : `${s}s`;
  const isEn = lang === "en";
  const phase = genStatus?.phase || "generating";
  const pos = genStatus?.position;
  const elapsed = genStatus?.elapsed || 0;
  const estMin = type === T.VID ? "5" : "0:15";
  const estMax = type === T.VID ? "10" : "1";

  const phaseColor = phase === "queued" ? "#ffb800" : phase === "done" ? "#00ff88" : "#00f0ff";
  const phaseLabel = phase === "queued"
    ? (pos ? (isEn ? `In queue · position ${pos}` : `En cola · posición ${pos}`) : (isEn ? "In queue…" : "En cola…"))
    : phase === "done"
    ? (isEn ? "✓ Ready!" : "✓ ¡Listo!")
    : (isEn ? (type === T.VID ? "Generating video" : "Generating image") : (type === T.VID ? "Generando video" : "Generando imagen"));

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(6,6,14,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, borderRadius: 14, backdropFilter: "blur(8px)" }}>
      <div style={{ width: 40, height: 40, border: `3px solid rgba(0,240,255,.12)`, borderTop: `3px solid ${phaseColor}`, borderRadius: "50%", animation: phase === "done" ? "none" : "spin .8s linear infinite", marginBottom: 12 }} />
      <p style={{ color: "#e0e0f0", fontSize: 14, fontWeight: 600, margin: "0 0 3px" }}>{phaseLabel}{phase !== "done" && d}</p>
      <p style={{ color: "#5a5a70", fontSize: 11, margin: "0 0 4px" }}>Contenido premium directo de nuestros GPUs</p>
      <p style={{ color: "#3a3a50", fontSize: 10, margin: "0 0 10px", fontFamily: "'JetBrains Mono',monospace" }}>
        {elapsed > 0 ? formatTime(elapsed) : "—"} {phase === "generating" ? (isEn ? `· may take ${estMin}–${estMax} min` : `· puede tardar ${estMin}–${estMax} min`) : ""}
      </p>
      <div style={{ width: 150, height: 3, background: "rgba(255,255,255,.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${p}%`, background: phase === "queued" ? "linear-gradient(90deg,#ffb800,#ff8c00)" : phase === "done" ? "#00ff88" : "linear-gradient(90deg,#00f0ff,#b44aff)", borderRadius: 2, transition: "width .5s" }} />
      </div>
      {phase === "queued" && pos && (
        <p style={{ color: "#ffb800", fontSize: 9, margin: "8px 0 0", fontFamily: "'JetBrains Mono',monospace" }}>
          {isEn ? `~${pos * 15}s wait` : `~${pos * 15}s de espera`}
        </p>
      )}
    </div>
  );
}

function PlanCard({ pl, onAction, actionLabel, isDesk, lang, features }) {
  const popularLabel = lang === "en" ? "Most Popular" : "Más Popular";
  const launchBadge = lang === "en" ? "🔥 Launch price" : "🔥 Precio de lanzamiento";
  const perMonth = lang === "en" ? "/mo" : "/mes";
  return (
    <div style={{ padding: isDesk ? "28px 22px" : "18px 14px", borderRadius: 16, background: pl.popular ? "linear-gradient(135deg, rgba(180,74,255,.1), rgba(0,240,255,.06))" : "rgba(255,255,255,.02)", border: pl.popular ? "1.5px solid rgba(180,74,255,.3)" : "1px solid rgba(255,255,255,.05)", position: "relative", flex: isDesk ? 1 : "unset", display: "flex", flexDirection: "column", transition: "transform .2s, box-shadow .2s", cursor: "default" }}
      onMouseEnter={e => { if (isDesk) { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 12px 40px ${pl.color}15`; } }}
      onMouseLeave={e => { if (isDesk) { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; } }}>
      {pl.popular && <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #b44aff, #00f0ff)", color: "#06060e", fontSize: 9, fontWeight: 700, padding: "4px 12px", borderRadius: 6, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{popularLabel}</div>}
      
      {/* Launch badge */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10, padding: "3px 8px", borderRadius: 5, background: "rgba(255,184,0,.08)", border: "1px solid rgba(255,184,0,.15)", alignSelf: "flex-start" }}>
        <span style={{ fontSize: 9, color: "#ffb800", fontWeight: 600 }}>{launchBadge}</span>
      </div>
      
      <p style={{ fontSize: isDesk ? 18 : 15, fontWeight: 700, margin: 0, color: pl.color }}>{lang === "en" ? pl.nameEn : pl.name}</p>
      <p style={{ fontSize: isDesk ? 11 : 10, color: "#5a5a70", margin: "3px 0 12px" }}>{pl.images} imgs + {pl.videos} videos{perMonth}</p>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: isDesk ? 14 : 12, color: "#5a5a70", textDecoration: "line-through", fontFamily: "'JetBrains Mono',monospace" }}>${pl.oldPrice}</span>
        <span style={{ fontSize: isDesk ? 36 : 26, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>${pl.price}</span>
        <span style={{ fontSize: 12, color: "#5a5a70" }}>{perMonth}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16, flex: 1 }}>
        {(features || []).map((f, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: isDesk ? 12 : 11, color: "#8a8a9e", lineHeight: 1.4 }}><span style={{ color: pl.color, fontSize: 9, marginTop: 2, flexShrink: 0 }}>✦</span>{f}</div>)}
      </div>
      <button onClick={onAction} style={{ width: "100%", padding: isDesk ? "13px" : "11px", fontSize: 13, fontWeight: 700, color: "#06060e", background: `linear-gradient(135deg, ${pl.color}, ${pl.color}cc)`, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 0 24px ${pl.color}25`, transition: "box-shadow .2s" }}>{actionLabel}</button>
    </div>
  );
}

// ─── APP ───
function CarouselSection({ lang, isDesk }) {
  const slides = [
    { src: "/images/carousel_realismo.webp",  tag: lang === "en" ? "Ultra\nRealism"    : "Ultra\nRealismo",    color: "#00f0ff", duration: 3000 },
    { src: "/images/carousel_restaurar.webp", tag: lang === "en" ? "Photo\nRestore"   : "Restauración",       color: "#b44aff", duration: 3000 },
    { src: "/images/carousel_anuncio1.webp",  tag: lang === "en" ? "Winning\nAd"      : "Anuncio",             color: "#ffb800", duration: 3000 },
    { src: "/images/carousel_anuncio2.webp",  tag: lang === "en" ? "Winning\nAd"      : "Anuncio",             color: "#ffb800", duration: 3000 },
    { src: "/images/carousel_animado.webp",   tag: lang === "en" ? "Animated\nStyle"  : "Estilo\nAnimado",     color: "#ff6b2b", duration: 3000 },
    { src: "/images/carousel_ugc.webp",       tag: "UGC",                                                      color: "#00ff88", duration: 5000 },
  ];
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState(null);
  const [transitioning, setTransitioning] = useState(false);

  const go = (n) => {
    if (transitioning) return;
    setPrev(idx);
    setTransitioning(true);
    setIdx(n);
    setTimeout(() => { setPrev(null); setTransitioning(false); }, 600);
  };

  useEffect(() => {
    const t = setTimeout(() => go((idx + 1) % slides.length), slides[idx].duration);
    return () => clearTimeout(t);
  }, [idx, transitioning]);

  const s = slides[idx];
  const p = prev !== null ? slides[prev] : null;

  return (
    <div style={{ marginBottom: isDesk ? 48 : 32 }}>
      {/* Carousel container */}
      <div style={{ position: "relative", maxWidth: isDesk ? 680 : "100%", margin: "0 auto", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,.5)", aspectRatio: "1/1" }}>

        {/* Previous image — fades out */}
        {p && (
          <img src={p.src} alt={p.tag} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: transitioning ? 0 : 1, transition: "opacity .6s ease", zIndex: 1 }} />
        )}

        {/* Current image — fades in */}
        <img src={s.src} alt={s.tag} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: transitioning ? 1 : 1, transition: "opacity .6s ease", zIndex: 2 }} />

        {/* Ribbon — outside overflow so it shows fully, clipped by wrapper */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 3, overflow: "hidden" }}>
          <div key={idx} style={{ position: "absolute", top: 24, left: -40, width: 180, textAlign: "center", transform: "rotate(-35deg)", background: s.color, color: "#06060e", fontSize: s.tag.length > 10 ? 7 : 9, fontWeight: 900, padding: "7px 0", letterSpacing: 1, textTransform: "uppercase", boxShadow: `0 2px 14px ${s.color}88`, whiteSpace: "pre-line", lineHeight: 1.3, opacity: transitioning ? 0 : 1, transition: "opacity .3s ease" }}>
            {s.tag}
          </div>
        </div>

        {/* Bottom gradient */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 90, background: "linear-gradient(transparent, rgba(6,6,14,.75))", zIndex: 4 }} />

        {/* Dots */}
        <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 7, zIndex: 5 }}>
          {slides.map((sl, i) => (
            <button key={i} onClick={() => go(i)} style={{ width: i === idx ? 24 : 8, height: 8, borderRadius: 4, border: "none", background: i === idx ? s.color : "rgba(255,255,255,.3)", cursor: "pointer", padding: 0, transition: "all .4s ease" }} />
          ))}
        </div>

        {/* Arrows desktop */}
        {isDesk && (
          <>
            <button onClick={() => go((idx - 1 + slides.length) % slides.length)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.15)", borderRadius: "50%", width: 40, height: 40, color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", zIndex: 5, lineHeight: 1 }}>‹</button>
            <button onClick={() => go((idx + 1) % slides.length)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.15)", borderRadius: "50%", width: 40, height: 40, color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", zIndex: 5, lineHeight: 1 }}>›</button>
          </>
        )}
      </div>

      {/* Tagline below carousel */}
      <div style={{ textAlign: "center", marginTop: isDesk ? 28 : 20, padding: "0 16px" }}>
        <p style={{ fontSize: isDesk ? 22 : 17, fontWeight: 800, lineHeight: 1.3, margin: "0 0 8px", letterSpacing: -0.5 }}>
          {lang === "en"
            ? <>All this was generated with no experience.<br /><span style={{ background: "linear-gradient(135deg,#00f0ff,#b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>No complex prompts. Just describe it — AI does the rest.</span></>
            : <>Todo esto fue generado sin experiencia.<br /><span style={{ background: "linear-gradient(135deg,#00f0ff,#b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Sin prompts complicados. Solo describelo — la IA hace el resto.</span></>}
        </p>
        <p style={{ fontSize: isDesk ? 13 : 12, color: "#5a5a70", margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
          {lang === "en"
            ? "NanoBanano Studio is not just a generator — it's your creative partner. Get professional results from day one, no design skills required."
            : "NanoBanano Studio no es solo un generador — es tu aliado creativo. Resultados profesionales desde el primer día, sin conocimientos de diseño."}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const w = useW();
  const isDesk = w >= 768;
  const [lang, setLang] = useState(detectLang());
  const t = (key) => {
    const v = TEXTS[lang]?.[key];
    if (v !== undefined) return v;
    const en = TEXTS.en[key];
    if (en !== undefined) return en;
    return key;
  };
  const planName = (pl) => lang === "en" ? pl.nameEn : pl.name;
  const planFeatures = (pl) => pl.features[lang] || pl.features.en;
  const styleName = (id) => t("styles")?.[id] || id;
  
  // Get allowed durations based on user plan
  const getUserPlanData = () => PLANS.find(p => p.id === profile?.plan) || PLANS[0];
  const getAllowedDurations = () => getUserPlanData().maxDuration || [5];

  const [page, setPage] = useState(P.LAND);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authLoad, setAuthLoad] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState(T.IMG);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("photorealistic");
  const [ratio, setRatio] = useState("1:1");
  const [imgQuality, setImgQuality] = useState("1K");
  const [vidDur, setVidDur] = useState(5);
  const [vidRatio, setVidRatio] = useState("16:9");

  // Motion Control state
  const [motionImage, setMotionImage] = useState(null);       // character image file
  const [motionVideo, setMotionVideo] = useState(null);       // reference motion video file
  const [motionImageUrl, setMotionImageUrl] = useState(null); // uploaded URL
  const [motionVideoUrl, setMotionVideoUrl] = useState(null); // uploaded URL
  const [motionOrientation, setMotionOrientation] = useState("video"); // "video" | "image"
  const [motionSceneFrom, setMotionSceneFrom] = useState("image"); // "image" | "video"
  const [motionPrompt, setMotionPrompt] = useState("");
  const [motionDur, setMotionDur] = useState(5); // start at 5 — safe for all plans
  const [motionUploadProgress, setMotionUploadProgress] = useState({ img: false, vid: false });
  const [motionUploadError, setMotionUploadError] = useState(null);
  const [motionImagePreview, setMotionImagePreview] = useState(null); // blob URL for preview
  const [motionVideoPreview, setMotionVideoPreview] = useState(null); // blob URL for preview
  const [motionVideoDuration, setMotionVideoDuration] = useState(0); // actual duration of uploaded video
  // Director tab states
  // Director tab states — multi-image/multi-audio for reference-to-video mode
  const [dirImages, setDirImages] = useState([]);        // array of { file, preview, url }
  const [dirAudios, setDirAudios] = useState([]);        // array of { file, name, url }
  const [dirUploading, setDirUploading] = useState({ img: false, aud: false });
  const [dirUploadError, setDirUploadError] = useState(null);
  const [dirPrompt, setDirPrompt] = useState("");
  const [dirMention, setDirMention] = useState(null); // { query, start } when user types @image
  const [dirDuration, setDirDuration] = useState(5);
  const [dirAspect, setDirAspect] = useState("9:16");
  const [dirKeepFrame, setDirKeepFrame] = useState(false);
  const [genning, setGenning] = useState(false);
  const [genStatus, setGenStatus] = useState({ phase: "idle", position: null, elapsed: 0 });
  const [gens, setGens] = useState([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const gallerysentinel = useRef(null);

  // Infinite scroll — load 20 more when sentinel enters viewport
  useEffect(() => {
    const el = gallerysentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(v => v + 20);
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [gallerysentinel.current, gens.length]);
  const [payMsg, setPayMsg] = useState("");
  const [activating, setActivating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [refImages, setRefImages] = useState([]);
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);
  const [multishot, setMultishot] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [showTyC, setShowTyC] = useState(false);

  useEffect(() => {
    if (!langOpen) return;
    const close = () => setLangOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [langOpen]);

  useEffect(() => {
    if (!userPanelOpen) return;
    const close = () => setUserPanelOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [userPanelOpen]);

  // Clamp motionDur to plan max whenever tab changes to Motion or plan changes
  useEffect(() => {
    if (tab === T.MOT && profile?.plan) {
      const maxDur = profile.plan === "basic" ? 5 : profile.plan === "pro" ? 8 : 15;
      if (motionDur > maxDur) setMotionDur(maxDur);
    }
  }, [tab, profile?.plan]);

  // Auto-redirect logged-in users away from landing page
  useEffect(() => {
    if (page === P.LAND && session) setPage(P.DASH);
  }, [page, session]);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (hash && hash.includes("access_token")) {
      const hp = new URLSearchParams(hash.substring(1));
      const token = hp.get("access_token");
      if (token) {
        const s = { access_token: token, refresh_token: hp.get("refresh_token") };
        try { sessionStorage.setItem("hrs_s", JSON.stringify(s)); } catch {} setSession(s); loadProfile(s);
        window.history.replaceState(null, "", window.location.pathname); return;
      }
    }
    if (params.get("payment") === "success") {
      const planFromUrl = params.get("plan");
      setPayMsg("¡Pago recibido! Activando tu plan...");
      window.history.replaceState(null, "", window.location.pathname);
      const saved = (() => { try { return JSON.parse(sessionStorage.getItem("hrs_s") || "null"); } catch { return null; } })();
      if (!saved?.access_token) return;
      setSession(saved);

      const goToDash = async () => {
        // Load everything and go to dashboard
        const u = await sb.getUser(saved.access_token);
        if (u?.id) {
          const p = await sb.getProfile(u.id, saved.access_token);
          if (p) {
            setProfile({ ...p, userId: u.id });
            const g = await sb.getGens(u.id, saved.access_token);
            if (Array.isArray(g)) {
              const mapped = g.map(gen => ({ ...gen, url: gen.result_url && !gen.result_url.includes("|") ? gen.result_url : gen.url }));
              setGens(mapped); setVisibleCount(20);
            }
            loadFavorites(saved.access_token);
          }
        }
        setPage(P.DASH);
        setPayMsg("✓ Plan activado");
        setTimeout(() => setPayMsg(""), 5000);
      };

      const activate = async (attempt = 1) => {
        setPayMsg(attempt === 1 ? "Activando tu plan..." : `Verificando${".".repeat(attempt % 4)}   `);
        try {
          // Call activate endpoint
          const r = await fetch("/api/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_token: saved.access_token, plan: planFromUrl }),
          });
          const d = await r.json();
          console.log(`Activate attempt ${attempt}:`, d);

          if (d.ok) {
            // Wait 800ms for Supabase write to propagate then verify
            await new Promise(res => setTimeout(res, 800));
            const u = await sb.getUser(saved.access_token);
            if (u?.id) {
              const p = await sb.getProfile(u.id, saved.access_token);
              console.log("Profile after activate:", p?.plan, p?.images_remaining);
              if (p && p.plan && p.plan !== "none") {
                setProfile({ ...p, userId: u.id });
                const g = await sb.getGens(u.id, saved.access_token);
                if (Array.isArray(g)) {
                  const mapped = g.map(gen => ({ ...gen, url: gen.result_url && !gen.result_url.includes("|") ? gen.result_url : gen.url }));
                  setGens(mapped); setVisibleCount(20);
                }
                loadFavorites(saved.access_token);
                setPage(P.DASH);
                setPayMsg("✓ Plan activado");
                setTimeout(() => setPayMsg(""), 5000);
                return;
              }
            }
            // activate said ok but profile not updated yet — wait and try reading again
            await new Promise(res => setTimeout(res, 2000));
            const u2 = await sb.getUser(saved.access_token);
            if (u2?.id) {
              const p2 = await sb.getProfile(u2.id, saved.access_token);
              if (p2 && p2.plan && p2.plan !== "none") {
                setProfile({ ...p2, userId: u2.id });
                setPage(P.DASH);
                setPayMsg("✓ Plan activado");
                setTimeout(() => setPayMsg(""), 5000);
                return;
              }
            }
          }
        } catch (e) { console.error("Activate error:", e.message); }

        // Retry up to 6 times (18 seconds total)
        if (attempt < 6) {
          setTimeout(() => activate(attempt + 1), 3000);
        } else {
          setPayMsg("Pago confirmado. Contacta soporte si no ves tu plan activo.");
          await goToDash(); // Go to dash anyway — don't leave user stuck
        }
      };

      activate();
      return;
    }
    if (params.get("pack") === "cancel") { setPayMsg("Compra cancelada"); window.history.replaceState(null, "", window.location.pathname); }

    // Pack purchase success
    if (params.get("pack") === "success") {
      const packType = params.get("type");
      const packAmount = parseInt(params.get("amount") || "0");
      const sessionId = params.get("sid"); // Stripe checkout session ID
      window.history.replaceState(null, "", window.location.pathname);
      const saved = (() => { try { return JSON.parse(sessionStorage.getItem("hrs_s") || "null"); } catch { return null; } })();
      if (saved?.access_token && packType && packAmount > 0) {
        setSession(saved);
        setPayMsg(packType === "images" ? `Agregando ${packAmount} imágenes...` : `Agregando ${packAmount} videos...`);
        const applyPack = async (attempt = 1) => {
          try {
            const r = await fetch("/api/pack", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_token: saved.access_token, type: packType, amount: packAmount, session_id: sessionId }),
            });
            const d = await r.json();
            console.log("Pack response attempt", attempt, ":", d);
            if (d.ok) {
              const label = packType === "images" ? `+${packAmount} imágenes` : `+${packAmount} videos`;
              await loadProfile(saved);
              setPayMsg(`✓ ${label} agregadas a tu cuenta`);
              setTimeout(() => setPayMsg(""), 6000);
              return;
            }
            // 409 = already applied, don't retry
            if (d.status === 409 || (d.error && d.error.includes("already been applied"))) {
              await loadProfile(saved);
              setPayMsg("✓ Créditos ya aplicados");
              setTimeout(() => setPayMsg(""), 4000);
              return;
            }
            console.warn("Pack failed:", d.error);
            if (attempt < 5) setTimeout(() => applyPack(attempt + 1), 3000);
            else setPayMsg(`Error al agregar créditos. Contacta soporte con: pack=${packType} amount=${packAmount}`);
          } catch (e) {
            console.error("Pack error:", e);
            if (attempt < 5) setTimeout(() => applyPack(attempt + 1), 3000);
          }
        };
        applyPack();
        return;
      }
      const saved2 = (() => { try { return JSON.parse(sessionStorage.getItem("hrs_s") || "null"); } catch { return null; } })();
      if (saved2?.access_token) { setSession(saved2); loadProfile(saved2); }
      return;
    }
    const saved = (() => { try { return JSON.parse(sessionStorage.getItem("hrs_s") || "null"); } catch { return null; } })();
    if (saved?.access_token) { setSession(saved); loadProfile(saved); }
  }, []);

  const activatePlan = async (s, plan) => {
    // Plan activation is handled by Stripe webhook — just reload profile
    try {
      const u = await sb.getUser(s.access_token);
      if (u?.id) {
        const p = await sb.getProfile(u.id, s.access_token);
        if (p) {
          setProfile({ ...p, userId: u.id });
          const g = await sb.getGens(u.id, s.access_token);
          if (Array.isArray(g)) setGens(g);
          setPage(P.DASH);
          setPayMsg("✓ Plan activado");
          setTimeout(() => setPayMsg(""), 3000);
        }
      }
    } catch {}
  };
  const loadProfile = async (s) => {
    try {
      const u = await sb.getUser(s.access_token);
      if (!u?.id) { setPage(P.DASH); return; }

      const p = await sb.getProfile(u.id, s.access_token);

      if (!p) {
        setPage(P.PLANS);
        return;
      }

      setProfile({ ...p, userId: u.id });

      const g = await sb.getGens(u.id, s.access_token);
      if (Array.isArray(g)) {
        const mapped = g.map(gen => ({ ...gen, url: gen.result_url && !gen.result_url.includes("|") ? gen.result_url : gen.url }));
        setGens(mapped);
        setVisibleCount(20);

        // ── Recover ALL pending generations silently ──────────────────────
        const pendings = g.filter(gen =>
          gen.status === "processing" &&
          gen.result_url &&
          gen.result_url.includes("|")
        );

        if (pendings.length > 0) {
          console.log(`Found ${pendings.length} pending generation(s) to recover`);

          const MAX_POLL_AGE = 6 * 60 * 60 * 1000; // 6 hours

          const refreshCredits = async () => {
            try {
              const u2 = await sb.getUser(s.access_token);
              if (u2?.id) {
                const p2 = await sb.getProfile(u2.id, s.access_token);
                if (p2) setProfile(prev => ({ ...prev, videos_remaining: p2.videos_remaining, images_remaining: p2.images_remaining }));
              }
            } catch {}
          };

          const recoverOne = async (pending) => {
            const parts = pending.result_url.split("|");
            const reqId = parts[0];
            const ep = parts.slice(1).join("|");
            const genType = pending.type;
            const age = Date.now() - new Date(pending.created_at).getTime();

            const checkStatus = async () => {
              try {
                const res = await fetch("/api/status", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ request_id: reqId, endpoint: ep, type: genType, user_token: s.access_token }),
                });
                return await res.json();
              } catch { return { status: "IN_PROGRESS" }; }
            };

            const handleCompleted = (url) => {
              console.log(`✓ Recovered gen ${pending.id}: ${url}`);
              setGens(prev => prev.map(gen =>
                gen.id === pending.id
                  ? { ...gen, url, status: "completed", result_url: url }
                  : gen
              ));
              if (Notification.permission === "granted") {
                new Notification("NanoBanano Studio", {
                  body: genType === "video" ? "🎬 Tu video está listo" : "📸 Tu imagen está lista",
                  icon: "/favicon.png"
                });
              }
            };

            const handleFailed = () => {
              console.log(`✗ Gen ${pending.id} failed — removing`);
              setGens(prev => prev.filter(gen => gen.id !== pending.id));
              refreshCredits();
            };

            const handleExpired = async () => {
              console.log(`Gen ${pending.id} expired — marking failed`);
              try {
                await fetch(`${SB_URL}/rest/v1/generations?id=eq.${pending.id}`, {
                  method: "PATCH",
                  headers: { ...hdr(s.access_token), Prefer: "return=minimal" },
                  body: JSON.stringify({ status: "failed" }),
                });
              } catch {}
              setGens(prev => prev.filter(gen => gen.id !== pending.id));
            };

            // Always check once immediately regardless of age
            const sd = await checkStatus();
            if (sd.status === "COMPLETED" && sd.url) { handleCompleted(sd.url); return; }
            if (sd.status === "FAILED") { handleFailed(); return; }

            // If too old and still not done — give up
            if (age > MAX_POLL_AGE) { await handleExpired(); return; }

            // Still IN_PROGRESS — poll silently in background (every 4s, up to 20 min)
            const MAX_ATTEMPTS = Math.ceil((20 * 60 * 1000) / 4000); // ~300 attempts
            let attempts = 0;
            const poll = async () => {
              attempts++;
              if (attempts > MAX_ATTEMPTS) { await handleExpired(); return; }
              const d = await checkStatus();
              if (d.status === "COMPLETED" && d.url) { handleCompleted(d.url); playDoneSound(); return; }
              if (d.status === "FAILED") { handleFailed(); return; }
              setTimeout(poll, 4000);
            };
            setTimeout(poll, 4000);
          };

          // Process all pendings in parallel — don't await, run concurrently
          pendings.forEach(p => recoverOne(p));
        }
        // ── End recovery ──────────────────────────────────────────────────
      }

      loadFavorites(s.access_token);
      if (Notification.permission === "default") Notification.requestPermission().catch(() => {});

      const hasNoPlan = p.plan === "none" || p.plan === null || p.plan === undefined || p.plan === "";
      setPage(hasNoPlan ? P.PLANS : P.DASH);

    } catch (err) {
      console.error("loadProfile error:", err);
      setPage(P.DASH);
    }
  };
  const handleAuth = async () => {
    setAuthErr(""); setAuthLoad(true);
    try { const res = authMode === "signup" ? await sb.signUp(email, pw) : await sb.signIn(email, pw);
      if (res.error) { setAuthErr(res.error_description || res.error?.message || "Error"); return; }
      if (res.access_token) { try { sessionStorage.setItem("hrs_s", JSON.stringify(res)); } catch {} setSession(res); await loadProfile(res); }
      else if (authMode === "signup") { setAuthErr("✓ Revisa tu email para confirmar"); }
    } catch { setAuthErr("Error de conexión"); } finally { setAuthLoad(false); } };
  const logout = () => { setSession(null); setProfile(null); setGens([]); setFavorites({}); try { sessionStorage.removeItem("hrs_s"); } catch {} setPage(P.LAND); };
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState("");
  const [audioOn, setAudioOn] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [favorites, setFavorites] = useState({});
  const [paymentFailedModal, setPaymentFailedModal] = useState(false);

  // Load favorites from server after login
  const loadFavorites = async (token) => {
    try {
      const res = await fetch(`/api/favorites?user_token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || {});
      }
    } catch {}
  };

  // Debounced save to server
  let _favSaveTimer = null;
  const saveFavoritesToServer = (favs, token) => {
    if (!token) return;
    clearTimeout(_favSaveTimer);
    _favSaveTimer = setTimeout(async () => {
      try {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: favs, user_token: token }),
        });
      } catch {}
    }, 800);
  };

  const toggleFav = (id) => {
    setFavorites(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveFavoritesToServer(next, session?.access_token);
      return next;
    });
  };

  const openPreview = (g, idx) => { setPreviewItem(g); setPreviewIndex(idx ?? null); };

  useEffect(() => {
    if (!previewItem) return;
    const handle = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        const idx = previewIndex ?? gens.findIndex(g => g.id === previewItem.id);
        const next = idx + 1 < gens.length ? idx + 1 : 0;
        setPreviewItem(gens[next]); setPreviewIndex(next);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        const idx = previewIndex ?? gens.findIndex(g => g.id === previewItem.id);
        const prev = idx - 1 >= 0 ? idx - 1 : gens.length - 1;
        setPreviewItem(gens[prev]); setPreviewIndex(prev);
      } else if (e.key === "Escape") {
        setPreviewItem(null); setPreviewIndex(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [previewItem, previewIndex, gens]);

  // Direct download without opening new tab
  const downloadFile = async (url, filename) => {
    // Show loading state on all download buttons
    const btns = document.querySelectorAll("[data-download-btn]");
    btns.forEach(b => { b.textContent = "⏳"; b.disabled = true; });

    const done = () => btns.forEach(b => { b.textContent = "↓ " + (lang === "en" ? "Download" : "Descargar"); b.disabled = false; });

    try {
      // Try backend proxy first (bypasses CORS headers on fal CDN)
      const proxyRes = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, filename, user_token: session?.access_token }),
      });

      if (proxyRes.ok) {
        const blob = await proxyRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename || "nanobanano-" + Date.now();
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        done();
        return;
      }
    } catch (e) {
      console.warn("Proxy download failed, trying direct fetch:", e.message);
    }

    try {
      // Direct fetch with no-cors mode — works for same-origin or permissive CORS
      const directRes = await fetch(url, { mode: "cors" });
      if (directRes.ok) {
        const blob = await directRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename || "nanobanano-" + Date.now();
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        done();
        return;
      }
    } catch (e) {
      console.warn("Direct fetch failed:", e.message);
    }

    // Last resort: force download via hidden iframe trick
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "nanobanano-" + Date.now();
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
    done();
  };

  // Max file size before compression: 20MB (browser handles it, canvas compresses)
  const MAX_FILE_MB = 20;

  // Compress image to max 1200px, JPEG quality 0.7 — better quality for AI reference
  const compressImage = (file, maxSize = 1200) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = (h / w) * maxSize; w = maxSize; }
          else { w = (w / h) * maxSize; h = maxSize; }
        }
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });

  // Upload file via our server API
  const uploadFile = async (file) => {
    // Validate size before trying
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      throw new Error(`Image too large. Max ${MAX_FILE_MB}MB per image.`);
    }
    const dataUrl = await compressImage(file);
    console.log("Uploading image, size:", Math.round(dataUrl.length / 1024), "KB");
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_url: dataUrl, user_token: session?.access_token }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Upload response error:", res.status, errText);
      throw new Error("Upload failed: " + res.status);
    }
    const data = await res.json();
    console.log("Upload result:", data);
    if (data.success && data.url) return data.url;
    throw new Error(data.error || "Upload returned no URL");
  };

  const playDoneSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6 — acorde mayor
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t); osc.stop(t + 0.5);
      });
    } catch {}
  };

  const handleGen = async () => {
    if ((!prompt.trim() && style !== "restore" && style !== "colorize") || !profile || !session) return;
    const isVid = tab === T.VID;
    if (isVid && profile.videos_remaining <= 0) return;
    if (!isVid && profile.images_remaining <= 0) return;
    // Block if payment failed
    if (profile.subscription_status === "payment_failed") {
      setPaymentFailedModal(true);
      return;
    }
    setGenning(true);
    setGenResult(null);
    setGenError("");
    setGenStatus({ phase: "queued", position: null, elapsed: 0 });

    try {
      // Upload reference images via server
      let imageUrls = [];
      if (!isVid && refImages.length > 0) {
        try {
          for (const file of refImages) {
            const url = await uploadFile(file);
            imageUrls.push(url);
          }
        } catch (uploadErr) {
          setGenError(lang === "en"
            ? `Error uploading reference image: ${uploadErr.message}. Max ${MAX_FILE_MB}MB per image (jpg, png, webp).`
            : `Error al subir imagen de referencia: ${uploadErr.message}. Máx ${MAX_FILE_MB}MB por imagen (jpg, png, webp).`);
          setGenning(false);
          return;
        }
      }

      // Upload video frames via server
      let startFrameUrl = null;
      let endFrameUrl = null;
      try {
        if (isVid && startFrame) startFrameUrl = await uploadFile(startFrame);
        if (isVid && endFrame) endFrameUrl = await uploadFile(endFrame);
      } catch (uploadErr) {
        setGenError("Error al subir frame. Intenta con una imagen más pequeña.");
        setGenning(false);
        return;
      }

      // Step 1: Submit request (returns immediately with request_id)
      const submitRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: isVid ? "video" : "image",
          prompt: buildStyledPrompt(prompt, tab === T.IMG ? style : "cinematic"),
          user_prompt: prompt.trim(), // raw user input — saved to DB, never sent to fal.ai
          style_id: tab === T.IMG ? style : "cinematic",
          aspect_ratio: isVid ? vidRatio : ratio,
          image_quality: !isVid ? imgQuality : undefined,
          plan: profile.plan || "basic",
          duration: isVid ? vidDur : undefined,
          audio: isVid ? audioOn : undefined,
          image_urls: !isVid && imageUrls.length > 0 ? imageUrls : undefined,
          start_frame: isVid ? startFrameUrl : undefined,
          end_frame: isVid ? endFrameUrl : undefined,
          multishot: isVid ? multishot : undefined,
          user_token: session.access_token,
        }),
      });

      const submitData = await submitRes.json();

      // If direct result (rare)
      if (submitData.completed && submitData.url) {
        await saveGenResult(isVid, submitData);
        return;
      }

      if (!submitData.success || !submitData.request_id) {
        setGenError(submitData.error || "Error al enviar solicitud.");
        setGenning(false);
        return;
      }

      // Step 2: Poll for result every 3 seconds
      const { request_id, endpoint, type: genType, status_url, response_url } = submitData;
      let attempts = 0;
      const maxAttempts = 200;
      setGenStatus({ phase: "queued", position: null, elapsed: 0 });
      const pollStart = Date.now();

      const poll = async () => {
        if (attempts >= maxAttempts) {
          setGenError("La generación tardó demasiado. Contacta soporte.");
          setGenning(false);
          setGenStatus({ phase: "idle", position: null, elapsed: 0 });
          return;
        }
        attempts++;

        try {
          const statusRes = await fetch("/api/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request_id, endpoint, type: genType, user_token: session.access_token, status_url, response_url }),
          });
          const statusData = await statusRes.json();
          const elapsed = Math.round((Date.now() - pollStart) / 1000);

          if (statusData.status === "COMPLETED" && statusData.url) {
            setGenStatus({ phase: "done", position: null, elapsed });
            playDoneSound();
            // Browser notification if tab not focused
            if (document.hidden && Notification.permission === "granted") {
              new Notification("NanoBanano Studio", {
                body: genType === "video" ? "🎬 Tu video está listo" : "📸 Tu imagen está lista",
                icon: "/favicon.png",
              });
            }
            await saveGenResult(isVid, { ...submitData, url: statusData.url });
            return;
          }

          if (statusData.status === "FAILED") { // with error refresh
            setGenError("La generación falló. Intenta con otro prompt.");
            setGenning(false);
            setGenStatus({ phase: "idle", position: null, elapsed: 0 });
            return;
          }

          // Update phase based on queue position
          const pos = statusData.position;
          if (pos > 0) {
            setGenStatus({ phase: "queued", position: pos, elapsed });
          } else {
            setGenStatus({ phase: "generating", position: null, elapsed });
          }

          setTimeout(poll, 3000);
        } catch {
          setTimeout(poll, 5000);
        }
      };

      setTimeout(poll, 3000);

    } catch (err) {
      console.error("Generation error:", err);
      setGenError(err.message || "Error de conexión con el servidor.");
      setGenning(false);
    }
  };

  const saveGenResult = async (isVid, data) => {
    // Update UI immediately with the result
    setGenResult({ type: isVid ? "video" : "image", url: data.url, resolution: data.resolution, audio: data.audio });
    setGenning(false);
    setTimeout(() => setGenStatus({ phase: "idle", position: null, elapsed: 0 }), 3000);

    // Refresh everything from Supabase — profile credits + real generation history
    // Small delay to ensure DB update from status.js has propagated
    await new Promise(r => setTimeout(r, 1500));
    try {
      const u = await sb.getUser(session.access_token);
      if (u?.id) {
        // Update credits
        const p = await sb.getProfile(u.id, session.access_token);
        if (p) setProfile(prev => ({ ...prev, images_remaining: p.images_remaining, videos_remaining: p.videos_remaining }));
        // Refresh real generation list from DB (has correct IDs and URLs)
        const g = await sb.getGens(u.id, session.access_token);
        if (Array.isArray(g) && g.length > 0) {
          const mapped = g.map(gen => ({ ...gen, url: gen.result_url && !gen.result_url.includes("|") ? gen.result_url : gen.url }));
          setGens(mapped);
        } else {
          // Fallback — prepend locally if DB fetch fails
          setGens(prev => [{ id: Date.now(), type: isVid ? "video" : "image", prompt, style: tab === T.IMG ? style : "cinematic", created_at: new Date().toISOString(), url: data.url }, ...prev]);
        }
      }
    } catch {
      // Fallback on any error
      setGens(prev => [{ id: Date.now(), type: isVid ? "video" : "image", prompt, style: tab === T.IMG ? style : "cinematic", created_at: new Date().toISOString(), url: data.url }, ...prev]);
    }
  };

  const STRIPE_PORTAL = "https://billing.stripe.com/p/login/14AdR90eK7q1eCjbQbeME00";

  const cancelSubscription = () => {
    // Open Stripe Customer Portal — handles real cancellation, invoices, payment methods
    window.open(
      `${STRIPE_PORTAL}?prefilled_email=${encodeURIComponent(profile?.email || "")}`,
      "_blank"
    );
    setCancelModal(false);
    setUserPanelOpen(false);
  };

  // Billing date logic:
  // - Active: next renewal date (subscription_end from Stripe)
  // - Cancelled/Failed: plan expiry date (subscription_end — when access ends)
  const getNextBilling = () => {
    // Always prefer the real date from Stripe
    if (profile?.subscription_end) {
      const d = new Date(profile.subscription_end);
      return d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { day: "numeric", month: "long", year: "numeric" });
    }
    // Fallback: calculate from subscription_start
    const start = profile?.subscription_start || profile?.created_at;
    if (!start) return null;
    const d = new Date(start);
    const now = new Date();
    while (d < now) d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { day: "numeric", month: "long", year: "numeric" });
  };

  const inp = { width: "100%", padding: "12px 14px", fontSize: 14, color: "#e0e0f0", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, fontFamily: "inherit" };
  const maxW = page === P.DASH ? (isDesk ? 900 : 520) : (isDesk ? 1000 : 520);

  const wrap = (ch) => (
    <div style={{ minHeight: "100vh", background: "#06060e", color: "#e8e8ef", fontFamily: "'Syne', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 20% 0%, rgba(0,240,255,.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(180,74,255,.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(255,107,43,.03) 0%, transparent 50%)" }} />
      <div style={{ maxWidth: maxW, margin: "0 auto", padding: isDesk ? "32px 40px 80px" : "20px 16px 60px", position: "relative", zIndex: 1 }}>
        {payMsg && <div style={{ padding: "10px 14px", marginBottom: 14, borderRadius: 8, background: payMsg.includes("✓") ? "rgba(0,240,255,.08)" : "rgba(255,184,0,.08)", border: `1px solid ${payMsg.includes("✓") ? "rgba(0,240,255,.2)" : "rgba(255,184,0,.2)"}`, fontSize: 13, textAlign: "center", color: payMsg.includes("✓") ? "#00f0ff" : "#ffb800", animation: "fadeUp .4s ease" }}>{payMsg}</div>}
        {ch}
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0}textarea::placeholder,input::placeholder{color:#3a3a50}button:active{transform:scale(.97)!important}input:focus,textarea:focus{outline:none;border-color:rgba(0,240,255,.3)!important}::selection{background:rgba(0,240,255,.2)}`}</style>
    </div>
  );

  // ─── TyC PAGE ───
  if (showTyC) return wrap(
    <div style={{ maxWidth: 720, margin: "0 auto", animation: "fadeUp .4s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <button onClick={() => setShowTyC(false)} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, color: "#e0e0f0", padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← {t("back")}</button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{t("terms")}</h1>
      </div>
      {[
        { title: lang === "es" ? "1. Política de No Reembolso" : "1. No-Refund Policy",
          body: lang === "es"
            ? "NanoBanano Studio es un servicio de generación de contenido basado en créditos. Los créditos se asignan al inicio de cada ciclo de facturación y se consumen con cada generación completada. Los créditos no utilizados al final del ciclo NO se transfieren al siguiente período y se consideran consumidos. No se emiten reembolsos una vez que el pago ha sido procesado, independientemente del uso real de los créditos. Al suscribirte, aceptas que el servicio tiene valor en la disponibilidad de los créditos, no solo en su uso."
            : "NanoBanano Studio is a credit-based content generation service. Credits are assigned at the start of each billing cycle and are consumed with each completed generation. Unused credits at the end of the cycle are NOT carried over and are considered consumed. No refunds are issued once payment has been processed, regardless of actual credit usage. By subscribing, you agree that the service has value in the availability of credits, not only in their use." },
        { title: lang === "es" ? "2. Protección de Precio para Suscriptores Activos" : "2. Price Lock for Active Subscribers",
          body: lang === "es"
            ? "Los suscriptores activos conservan el precio al que se registraron indefinidamente, incluso si NanoBanano Studio actualiza sus precios para nuevos clientes. Esta garantía aplica únicamente mientras la suscripción permanezca activa. Si cancelas tu suscripción, perderás la protección de precio y al reactivar se aplicará la tarifa vigente en ese momento."
            : "Active subscribers keep the price they signed up for indefinitely, even if NanoBanano Studio updates pricing for new customers. This guarantee only applies while the subscription remains active. If you cancel, you lose price protection and the current rate applies upon reactivation." },
        { title: lang === "es" ? "3. Uso Aceptable" : "3. Acceptable Use",
          body: lang === "es"
            ? "Queda estrictamente prohibido usar NanoBanano Studio para generar contenido ilegal, difamatorio, que viole derechos de terceros, contenido sexual explícito no consensuado, material que represente menores en situaciones inapropiadas, o contenido que promueva violencia o discriminación. NanoBanano Studio se reserva el derecho de suspender cuentas que violen estas normas sin previo aviso ni reembolso."
            : "It is strictly prohibited to use NanoBanano Studio to generate illegal, defamatory content, content that violates third-party rights, non-consensual explicit sexual content, material depicting minors in inappropriate situations, or content promoting violence or discrimination. NanoBanano Studio reserves the right to suspend accounts violating these terms without notice or refund." },
        { title: lang === "es" ? "4. Propiedad del Contenido Generado" : "4. Ownership of Generated Content",
          body: lang === "es"
            ? "El contenido generado mediante NanoBanano Studio es de uso personal y comercial del usuario. NanoBanano Studio no reclama derechos de propiedad sobre el contenido generado. Sin embargo, el usuario es responsable de verificar que el contenido generado no infringe derechos de terceros en su jurisdicción."
            : "Content generated through NanoBanano Studio is for personal and commercial use by the user. NanoBanano Studio does not claim ownership rights over generated content. However, the user is responsible for verifying that generated content does not infringe third-party rights in their jurisdiction." },
        { title: lang === "es" ? "5. Disponibilidad del Servicio" : "5. Service Availability",
          body: lang === "es"
            ? "NanoBanano Studio no garantiza disponibilidad ininterrumpida del servicio. Mantenimientos programados, fallos técnicos o interrupciones de servicios de terceros de generación de IA pueden afectar temporalmente el servicio. Estos casos no dan derecho a reembolso, pero podrán resultar en compensación de créditos a discreción del equipo."
            : "NanoBanano Studio does not guarantee uninterrupted service availability. Scheduled maintenance, technical failures, or third-party service interruptions AI generation services may temporarily affect the service. These cases do not entitle users to refunds but may result in credit compensation at the team's discretion." },
        { title: lang === "es" ? "6. Privacidad y Datos" : "6. Privacy and Data",
          body: lang === "es"
            ? "NanoBanano Studio almacena únicamente los datos necesarios para operar el servicio: email, historial de generaciones y estado de suscripción. No vendemos datos a terceros. Los datos de pago son procesados exclusivamente por Stripe y no son almacenados por NanoBanano Studio. Puedes solicitar la eliminación de tu cuenta y datos en cualquier momento contactando a soporte."
            : "NanoBanano Studio stores only the data necessary to operate the service: email, generation history, and subscription status. We do not sell data to third parties. Payment data is processed exclusively by Stripe and is not stored by NanoBanano Studio. You can request deletion of your account and data at any time by contacting support." },
        { title: lang === "es" ? "7. Cancelación y Ciclos de Facturación" : "7. Cancellation and Billing Cycles",
          body: lang === "es"
            ? "Puedes cancelar tu suscripción en cualquier momento desde tu panel de usuario. La cancelación entra en efecto al final del ciclo de facturación actual. Los créditos del ciclo en curso permanecen disponibles hasta la fecha de renovación. No se realizan cargos adicionales tras la cancelación."
            : "You can cancel your subscription at any time from your user panel. Cancellation takes effect at the end of the current billing cycle. Credits for the current cycle remain available until the renewal date. No additional charges are made after cancellation." },
      ].map((section, i) => (
        <div key={i} style={{ marginBottom: 28, padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "#00f0ff" }}>{section.title}</h3>
          <p style={{ fontSize: 13, color: "#7a7a90", lineHeight: 1.7, margin: 0 }}>{section.body}</p>
        </div>
      ))}
      <p style={{ textAlign: "center", fontSize: 10, color: "#2a2a3a", marginTop: 16, fontFamily: "'JetBrains Mono',monospace" }}>
        {lang === "es" ? "Última actualización: Abril 2026 · NanoBanano Studio" : "Last updated: April 2026 · NanoBanano Studio"}
      </p>
    </div>
  );

  // ─── BACK BUTTON ───
  const BackBtn = ({ to, label }) => (
    <button onClick={() => { if (to !== undefined) setPage(to); else window.history.back(); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#8a8a9e", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", marginBottom: 20 }}>
      ← {label || t("back")}
    </button>
  );

  // ─── USER PANEL (dropdown) ───
  const hasPlanForPanel = profile?.plan && profile.plan !== "none";
  const planDataForPanel = PLANS.find(p => p.id === profile?.plan) || PLANS[0];
  const imgTotal = PRICES[profile?.plan]?.images || 0;
  const vidTotal = PRICES[profile?.plan]?.videos || 0;
  const imgRemain = profile?.images_remaining ?? 0;
  const vidRemain = profile?.videos_remaining ?? 0;
  const imgPct = imgTotal > 0 ? Math.round((imgRemain / imgTotal) * 100) : 0;
  const vidPct = vidTotal > 0 ? Math.round((vidRemain / vidTotal) * 100) : 0;
  const nextBill = getNextBilling();

  const UserPanel = () => (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setUserPanelOpen(o => !o); }}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: hasPlanForPanel ? `${planDataForPanel.color}22` : "rgba(255,255,255,.06)", border: `1.5px solid ${hasPlanForPanel ? planDataForPanel.color + "60" : "rgba(255,255,255,.12)"}`, cursor: "pointer", fontSize: 15, transition: "all .2s" }}
        title={t("my_plan")}
      >
        👤
      </button>
      {userPanelOpen && (
        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 260, background: "#0e0e1a", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, zIndex: 1000, boxShadow: "0 16px 48px rgba(0,0,0,.6)", overflow: "hidden" }}>
          {/* Plan header */}
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1, textTransform: "uppercase" }}>{t("my_plan")}</span>
              {hasPlanForPanel && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${planDataForPanel.color}20`, color: planDataForPanel.color, fontWeight: 700, textTransform: "uppercase" }}>{lang === "en" ? planDataForPanel.nameEn : planDataForPanel.name}</span>}
            </div>
            <p style={{ fontSize: 11, color: "#5a5a70", margin: 0 }}>{profile?.email}</p>
          </div>
          {/* Credits bars */}
          {hasPlanForPanel && (
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              {/* Images bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#8a8a9e" }}>🖼️ {t("img_credits")}</span>
                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#00f0ff" }}>{imgRemain}<span style={{ color: "#3a3a50" }}>/{imgTotal}</span></span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${imgPct}%`, background: "linear-gradient(90deg, #00f0ff, #00c8ff)", borderRadius: 3, transition: "width .4s ease" }} />
                </div>
              </div>
              {/* Videos bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#8a8a9e" }}>🎬 {t("vid_credits")}</span>
                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#b44aff" }}>{vidRemain}<span style={{ color: "#3a3a50" }}>/{vidTotal}</span></span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${vidPct}%`, background: "linear-gradient(90deg, #b44aff, #8a2be2)", borderRadius: 3, transition: "width .4s ease" }} />
                </div>
              </div>
            </div>
          )}
          {/* Billing */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            {(() => {
              const isCancelled = profile?.subscription_status === "cancelled";
              const isFailed = profile?.subscription_status === "payment_failed";
              const isActive = profile?.subscription_status === "active" || (!isCancelled && !isFailed);
              const billingLabel = (isCancelled || isFailed) ? t("billing_until") : t("next_billing");
              const billingColor = isFailed ? "#ff4d6a" : isCancelled ? "#ffb800" : "#3a3a50";
              const dateColor = isFailed ? "#ff4d6a" : isCancelled ? "#ffb800" : "#5a5a70";
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: billingColor, letterSpacing: 1, textTransform: "uppercase" }}>{billingLabel}</span>
                    {isCancelled && <span style={{ fontSize: 8, background: "rgba(255,184,0,.12)", color: "#ffb800", border: "1px solid rgba(255,184,0,.2)", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>{lang === "en" ? "CANCELLED" : "CANCELADO"}</span>}
                    {isFailed && <span style={{ fontSize: 8, background: "rgba(255,77,106,.12)", color: "#ff4d6a", border: "1px solid rgba(255,77,106,.2)", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>{lang === "en" ? "PAYMENT ISSUE" : "PAGO FALLIDO"}</span>}
                  </div>
                  <p style={{ fontSize: 11, color: dateColor, margin: "0 0 4px", fontWeight: (isCancelled || isFailed) ? 600 : 400 }}>
                    {nextBill || t("no_billing")}
                  </p>
                  {isCancelled && nextBill && (
                    <p style={{ fontSize: 9, color: "#8a6a00", margin: "0 0 4px", lineHeight: 1.4 }}>
                      {lang === "en" ? "Your plan ends on this date. Resubscribe to continue." : "Tu plan termina en esta fecha. Resuscríbete para continuar."}
                    </p>
                  )}
                  {hasPlanForPanel && (
                    <button onClick={() => window.open(`${STRIPE_PORTAL}?prefilled_email=${encodeURIComponent(profile?.email || "")}`, "_blank")}
                      style={{ fontSize: 10, color: isFailed ? "#ff4d6a" : "#00f0ff", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
                      {isFailed
                        ? (lang === "en" ? "Fix payment →" : "Resolver pago →")
                        : (lang === "en" ? "Manage billing →" : "Gestionar facturación →")}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
          {/* Actions */}
          <div style={{ padding: "10px 16px" }}>
            {hasPlanForPanel && (
              <button onClick={() => { setUserPanelOpen(false); setPage(P.PLANS); }}
                style={{ display: "block", width: "100%", padding: "8px", fontSize: 11, fontWeight: 600, color: "#e0e0f0", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", marginBottom: 6, textAlign: "center" }}>
                {t("change_plan")}
              </button>
            )}
            <button onClick={() => { setUserPanelOpen(false); logout(); }}
              style={{ display: "block", width: "100%", padding: "8px", fontSize: 11, fontWeight: 600, color: "#ff4d6a", background: "rgba(255,77,106,.04)", border: "1px solid rgba(255,77,106,.15)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", marginBottom: hasPlanForPanel ? 8 : 0, textAlign: "center" }}>
              {t("logout")}
            </button>
            {hasPlanForPanel && (
              <button onClick={() => { setUserPanelOpen(false); setCancelModal(true); }}
                style={{ display: "block", width: "100%", padding: "6px", fontSize: 10, color: "#3a3a50", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "center", textDecoration: "underline" }}>
                {t("cancel_sub")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ─── CANCEL MODAL ───
  const CancelModal = () => !cancelModal ? null : (
    <div onClick={() => setCancelModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: "100%", background: "#0e0e1a", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, padding: 28, animation: "fadeUp .3s ease" }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, textAlign: "center", margin: "0 0 12px" }}>{t("cancel_confirm_title")}</h3>
        <p style={{ fontSize: 13, color: "#7a7a90", lineHeight: 1.7, textAlign: "center", margin: "0 0 24px" }}>{t("cancel_confirm_body")}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setCancelModal(false)}
            style={{ flex: 1, padding: "12px", fontSize: 13, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {t("cancel_confirm_no")}
          </button>
          <button onClick={cancelSubscription}
            style={{ flex: 1, padding: "12px", fontSize: 13, fontWeight: 600, color: "#ff4d6a", background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.2)", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {lang === "en" ? "Manage in Stripe →" : "Gestionar en Stripe →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── PAYMENT FAILED MODAL ───
  const PaymentFailedModal = () => !paymentFailedModal ? null : (
    <div onClick={() => setPaymentFailedModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 400, width: "100%", background: "#0e0e1a", border: "1px solid rgba(255,77,106,.25)", borderRadius: 20, padding: 28, animation: "fadeUp .3s ease", textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>💳</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 10px", color: "#ff4d6a" }}>
          {lang === "en" ? "Payment issue" : "Problema de pago"}
        </h3>
        <p style={{ fontSize: 13, color: "#7a7a90", lineHeight: 1.7, margin: "0 0 24px" }}>
          {lang === "en"
            ? "We couldn't process your last payment. Please update your payment method to continue generating."
            : "No pudimos procesar tu último pago. Actualiza tu método de pago para continuar generando."}
        </p>
        <button
          onClick={() => { window.open(`${STRIPE_PORTAL}?prefilled_email=${encodeURIComponent(profile?.email || "")}`, "_blank"); setPaymentFailedModal(false); }}
          style={{ width: "100%", padding: "13px", fontSize: 14, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg, #ff4d6a, #ff6b2b)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
          {lang === "en" ? "Update payment method →" : "Actualizar método de pago →"}
        </button>
        <button onClick={() => setPaymentFailedModal(false)} style={{ background: "none", border: "none", color: "#3a3a50", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {lang === "en" ? "Close" : "Cerrar"}
        </button>
      </div>
    </div>
  );
  const Footer = () => (
    <div style={{ textAlign: "center", marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,.03)" }}>
      <p style={{ fontSize: 9, color: "#2a2a3a", fontFamily: "'JetBrains Mono',monospace", margin: "0 0 6px" }}>
        © 2026 NanoBanano Studio · Powered by HyperReal AI Lab
      </p>
      <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
        <button onClick={() => setShowTyC(true)} style={{ fontSize: 9, color: "#3a3a50", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>{t("terms")}</button>
        <button onClick={() => setShowTyC(true)} style={{ fontSize: 9, color: "#3a3a50", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>{t("privacy")}</button>
      </div>
    </div>
  );

  const logo = (s = 28) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <img src="/images/banano.webp" alt="NB" style={{ width: s, height: s, borderRadius: 7, objectFit: "cover" }} />
      <span style={{ fontSize: s * .52, fontWeight: 700, letterSpacing: -.3 }}>NanoBanano Studio</span>
    </div>
  );

  // Language selector component — dropdown
  const langOptions = [
    { code: "en", flag: "🇬🇧", label: "English" },
    { code: "es", flag: "🇪🇸", label: "Español" },
  ];
  const currentLang = langOptions.find(l => l.code === lang);
  const LangSelector = () => (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setLangOpen(o => !o); }}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "#e0e0f0", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
      >
        <span style={{ fontSize: 14 }}>{currentLang.flag}</span>
        <span>{currentLang.label}</span>
        <span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{langOpen ? "▲" : "▼"}</span>
      </button>
      {langOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#0e0e1a", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, overflow: "hidden", zIndex: 999, minWidth: 130, boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
          {langOptions.map(opt => (
            <button key={opt.code} onClick={() => { setLang(opt.code); setLangOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 14px", fontSize: 12, fontWeight: opt.code === lang ? 700 : 400, color: opt.code === lang ? "#00f0ff" : "#a0a0b8", background: opt.code === lang ? "rgba(0,240,255,.07)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ fontSize: 15 }}>{opt.flag}</span> {opt.label}
              {opt.code === lang && <span style={{ marginLeft: "auto", fontSize: 10, color: "#00f0ff" }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ═══ LANDING ═══
  if (page === P.LAND) {
    return wrap(
    <>
      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isDesk ? 80 : 44 }}>
        {logo(isDesk ? 32 : 28)}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LangSelector />
          {session ? <UserPanel /> : <button onClick={() => setPage(P.AUTH)} style={{ padding: isDesk ? "10px 24px" : "8px 18px", fontSize: isDesk ? 13 : 12, fontWeight: 600, color: "#06060e", background: "#00f0ff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>{t("start")}</button>}
        </div>
      </div>

      {/* Hero */}
      <div style={{ display: isDesk ? "flex" : "block", alignItems: "center", gap: 60, marginBottom: isDesk ? 80 : 44 }}>
        <div style={{ flex: 1, textAlign: isDesk ? "left" : "center", animation: "fadeUp .8s ease" }}>
          <div style={{ display: "inline-block", fontSize: isDesk ? 10 : 9, fontFamily: "'JetBrains Mono',monospace", color: "#00f0ff", letterSpacing: 3, textTransform: "uppercase", marginBottom: 16, padding: "5px 12px", border: "1px solid rgba(0,240,255,.2)", borderRadius: 20, background: "rgba(0,240,255,.04)" }}>{t("hero_badge")}</div>
          <h1 style={{ fontSize: isDesk ? 48 : 32, fontWeight: 800, lineHeight: 1.08, margin: "0 0 16px", letterSpacing: -1.5 }}>
            {t("hero_title_1")}<span style={{ background: "linear-gradient(135deg, #b44aff, #00f0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{t("hero_title_2")}</span>{t("hero_title_3")}
          </h1>
          <p style={{ fontSize: isDesk ? 17 : 14, color: "#6a6a80", lineHeight: 1.6, maxWidth: isDesk ? 460 : 380, margin: isDesk ? "0" : "0 auto 24px" }}>{t("hero_sub")}</p>
          {isDesk && <button onClick={() => setPage(session ? P.DASH : P.AUTH)} style={{ marginTop: 24, padding: "14px 36px", fontSize: 15, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 30px rgba(0,240,255,.25)" }}>{session ? (lang === "en" ? "Generate now →" : "Generar ahora →") : t("start_now")}</button>}
          {!isDesk && <button onClick={() => setPage(session ? P.DASH : P.AUTH)} style={{ marginTop: 8, padding: "14px 32px", fontSize: 15, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 24px rgba(0,240,255,.25)", width: "100%" }}>{session ? (lang === "en" ? "⚡ Generate now →" : "⚡ Generar ahora →") : t("start_now")}</button>}
        </div>
        {isDesk && (
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div style={{ width: 380, height: 380, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,.08)", position: "relative" }}>
              <img src="/images/hero.webp" alt="AI Generation" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "40px 16px 12px", background: "linear-gradient(transparent, rgba(6,6,14,.9))" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(0,240,255,.12)", border: "1px solid rgba(0,240,255,.2)", fontSize: 10, color: "#00f0ff", fontWeight: 600 }}>{t("images_label")}</span>
                  <span style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(180,74,255,.12)", border: "1px solid rgba(180,74,255,.2)", fontSize: 10, color: "#b44aff", fontWeight: 600 }}>{t("videos_label")}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {!isDesk && (
          <div style={{ marginBottom: 24, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,.06)", maxWidth: 300, margin: "0 auto 24px" }}>
            <img src="/images/hero.webp" alt="AI Generation" style={{ width: "100%", display: "block" }} />
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: isDesk ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: isDesk ? 16 : 8, marginBottom: isDesk ? 56 : 36 }}>
        {[{ v: "97%", l: t("stat_save") }, { v: "300×", l: t("stat_fast") }, { v: "<$0.25", l: t("stat_price") }, ...(isDesk ? [{ v: "5s", l: "Videos IA" }] : [])].map((s, i) => (
          <div key={i} style={{ padding: isDesk ? "24px 16px" : "16px 8px", background: "rgba(255,255,255,.02)", borderRadius: 14, border: "1px solid rgba(255,255,255,.04)", textAlign: "center" }}>
            <p style={{ fontSize: isDesk ? 28 : 20, fontWeight: 800, margin: 0, fontFamily: "'JetBrains Mono',monospace", background: "linear-gradient(135deg, #00f0ff, #b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.v}</p>
            <p style={{ fontSize: isDesk ? 11 : 9, color: "#5a5a70", margin: "4px 0 0" }}>{s.l}</p>
          </div>
        ))}
      </div>

      <CarouselSection lang={lang} isDesk={isDesk} />

      {/* Pricing */}
      <p style={{ fontSize: isDesk ? 14 : 12, color: "#5a5a70", textAlign: "center", marginBottom: isDesk ? 20 : 14, fontStyle: "italic" }}>
        {lang === "en"
          ? "Creating this type of content with agencies normally costs $500–$2,000 per video."
          : "Crear este tipo de contenido con agencias normalmente cuesta $500–$2,000 por video."}
      </p>
      <h2 style={{ fontSize: isDesk ? 28 : 20, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>{t("plans_title")}</h2>
      <p style={{ fontSize: isDesk ? 14 : 12, color: "#5a5a70", textAlign: "center", marginBottom: isDesk ? 32 : 18 }}>{t("plans_sub")}</p>
      <div style={{ display: "flex", flexDirection: isDesk ? "row" : "column", gap: isDesk ? 16 : 10, marginBottom: isDesk ? 60 : 36, alignItems: isDesk ? "stretch" : "unset" }}>
        {PLANS.map(pl => {
          const planCta = {
            test:    { es: "Probar sin riesgo →",      en: "Try risk-free →" },
            basic:   { es: "Empezar a crear →",        en: "Start creating →" },
            pro:     { es: "Empezar a vender →",       en: "Start selling →" },
            creator: { es: "Escalar mi contenido →",   en: "Scale my content →" },
          };
          const cta = lang === "en" ? planCta[pl.id].en : planCta[pl.id].es;
          return <PlanCard key={pl.id} pl={pl} onAction={() => setPage(session ? P.PLANS : P.AUTH)} actionLabel={cta} isDesk={isDesk} lang={lang} features={planFeatures(pl)} />;
        })}
      </div>

      {/* Skool CTA */}
      <div style={{ textAlign: "center", padding: isDesk ? "32px 24px" : "18px 14px", borderRadius: 16, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
        <p style={{ fontSize: isDesk ? 16 : 13, fontWeight: 600, margin: "0 0 6px" }}>{t("learn_title")}</p>
        <p style={{ fontSize: isDesk ? 13 : 11, color: "#5a5a70", margin: "0 0 14px", lineHeight: 1.5 }}>{t("learn_sub")}</p>
        <button onClick={() => window.open("https://www.skool.com/premium", "_blank")} style={{ padding: "10px 28px", fontSize: 12, fontWeight: 700, color: "#e0e0f0", background: "transparent", border: "1px solid rgba(0,240,255,.25)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>{t("learn_cta")}</button>
      </div>

      <Footer />
      <CancelModal />
    </>
  );
  } // end P.LAND

  // ═══ AUTH ═══
  if (page === P.AUTH) return wrap(
    <div style={{ animation: "fadeUp .5s ease" }}>
      {/* Nav bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isDesk ? 48 : 28 }}>
        <BackBtn to={P.LAND} />
        <LangSelector />
      </div>

      {isDesk ? (
        /* ── DESKTOP: two columns ── */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center", maxWidth: 900, margin: "0 auto" }}>
          {/* Left — branding */}
          <div style={{ padding: "40px 0" }}>
            {logo(42)}
            <h2 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1, margin: "28px 0 16px", letterSpacing: -1 }}>
              {lang === "es" ? <>Crea contenido que <span style={{ background: "linear-gradient(135deg,#b44aff,#00f0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>vende</span></> : <>Create content that <span style={{ background: "linear-gradient(135deg,#b44aff,#00f0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>sells</span></>}
            </h2>
            <p style={{ fontSize: 15, color: "#5a5a70", lineHeight: 1.65, marginBottom: 32 }}>
              {lang === "es" ? "Imágenes y videos de calidad profesional en segundos. Sin equipos. Sin estudios." : "Professional-quality images and videos in seconds. No equipment. No studios."}
            </p>
            {/* Mini stats */}
            <div style={{ display: "flex", gap: 24 }}>
              {[["97%", lang === "es" ? "Ahorro" : "Savings"], ["300×", lang === "es" ? "Más rápido" : "Faster"], ["$0.25", lang === "es" ? "Por imagen" : "Per image"]].map(([v, l]) => (
                <div key={l}>
                  <p style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "'JetBrains Mono',monospace", background: "linear-gradient(135deg,#00f0ff,#b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{v}</p>
                  <p style={{ fontSize: 10, color: "#4a4a60", margin: "3px 0 0" }}>{l}</p>
                </div>
              ))}
            </div>
            {/* Hero image preview */}
            <div style={{ marginTop: 36, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,.07)", position: "relative", height: 200 }}>
              <img src="/images/hero.webp" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,6,14,.8) 0%, transparent 60%)" }} />
              <div style={{ position: "absolute", bottom: 12, left: 14, display: "flex", gap: 6 }}>
                <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "rgba(0,240,255,.15)", border: "1px solid rgba(0,240,255,.25)", color: "#00f0ff", fontWeight: 600 }}>Imagen Premium</span>
                <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "rgba(180,74,255,.15)", border: "1px solid rgba(180,74,255,.25)", color: "#b44aff", fontWeight: 600 }}>Video Premium</span>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 20, padding: "36px 32px" }}>
            <h3 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{authMode === "login" ? t("login_title") : t("signup_title")}</h3>
            <p style={{ fontSize: 13, color: "#5a5a70", margin: "0 0 24px" }}>{authMode === "login" ? t("login_sub") : t("signup_sub")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => sb.googleSignIn()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px", fontSize: 14, fontWeight: 600, color: "#e0e0f0", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}><GIcon /> {t("google_btn")}</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} /><span style={{ fontSize: 11, color: "#3a3a50" }}>{t("or_email")}</span><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} /></div>
              <input type="email" placeholder={t("email_ph")} value={email} onChange={e => setEmail(e.target.value)} style={inp} />
              <input type="password" placeholder={t("pass_ph")} value={pw} onChange={e => setPw(e.target.value)} style={inp} onKeyDown={e => e.key === "Enter" && handleAuth()} />
              {authErr && <p style={{ fontSize: 12, color: authErr.includes("✓") ? "#00f0ff" : "#ff4d6a", textAlign: "center" }}>{authErr}</p>}
              <button onClick={handleAuth} disabled={authLoad || !email || pw.length < 6} style={{ padding: "13px", fontSize: 14, fontWeight: 700, color: "#06060e", background: authLoad ? "rgba(0,240,255,.3)" : "linear-gradient(135deg,#00f0ff,#00c8ff)", border: "none", borderRadius: 10, cursor: authLoad ? "wait" : "pointer", fontFamily: "inherit", marginTop: 2 }}>{authLoad ? t("loading") : authMode === "login" ? t("login_btn") : t("signup_btn")}</button>
              <p style={{ fontSize: 12, color: "#5a5a70", textAlign: "center", marginTop: 6 }}>{authMode === "login" ? t("no_account") : t("has_account")}<button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthErr(""); }} style={{ background: "none", border: "none", color: "#00f0ff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>{authMode === "login" ? t("register") : t("signin")}</button></p>
              <p style={{ fontSize: 10, color: "#3a3a50", textAlign: "center", marginTop: 4 }}>
                {lang === "es" ? "Al registrarte aceptas nuestros " : "By signing up you agree to our "}
                <button onClick={() => setShowTyC(true)} style={{ background: "none", border: "none", color: "#5a5a70", cursor: "pointer", fontFamily: "inherit", fontSize: 10, textDecoration: "underline" }}>{t("terms")}</button>
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ── MOBILE: single column ── */
        <div style={{ maxWidth: 400, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            {logo(30)}
            <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 20 }}>{authMode === "login" ? t("login_title") : t("signup_title")}</h2>
            <p style={{ fontSize: 13, color: "#5a5a70", marginTop: 5 }}>{authMode === "login" ? t("login_sub") : t("signup_sub")}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => sb.googleSignIn()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px", fontSize: 14, fontWeight: 600, color: "#e0e0f0", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}><GIcon /> {t("google_btn")}</button>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} /><span style={{ fontSize: 11, color: "#3a3a50" }}>{t("or_email")}</span><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} /></div>
            <input type="email" placeholder={t("email_ph")} value={email} onChange={e => setEmail(e.target.value)} style={inp} />
            <input type="password" placeholder={t("pass_ph")} value={pw} onChange={e => setPw(e.target.value)} style={inp} onKeyDown={e => e.key === "Enter" && handleAuth()} />
            {authErr && <p style={{ fontSize: 12, color: authErr.includes("✓") ? "#00f0ff" : "#ff4d6a", textAlign: "center" }}>{authErr}</p>}
            <button onClick={handleAuth} disabled={authLoad || !email || pw.length < 6} style={{ padding: "13px", fontSize: 14, fontWeight: 700, color: "#06060e", background: authLoad ? "rgba(0,240,255,.3)" : "linear-gradient(135deg,#00f0ff,#00c8ff)", border: "none", borderRadius: 10, cursor: authLoad ? "wait" : "pointer", fontFamily: "inherit", marginTop: 2 }}>{authLoad ? t("loading") : authMode === "login" ? t("login_btn") : t("signup_btn")}</button>
            <p style={{ fontSize: 12, color: "#5a5a70", textAlign: "center", marginTop: 6 }}>{authMode === "login" ? t("no_account") : t("has_account")}<button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthErr(""); }} style={{ background: "none", border: "none", color: "#00f0ff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>{authMode === "login" ? t("register") : t("signin")}</button></p>
            <p style={{ fontSize: 10, color: "#3a3a50", textAlign: "center", marginTop: 8 }}>
              {lang === "es" ? "Al registrarte aceptas nuestros " : "By signing up you agree to our "}
              <button onClick={() => setShowTyC(true)} style={{ background: "none", border: "none", color: "#5a5a70", cursor: "pointer", fontFamily: "inherit", fontSize: 10, textDecoration: "underline" }}>{t("terms")}</button>
            </p>
          </div>
        </div>
      )}
      <Footer />
    </div>
  );

  // ═══ PLAN SELECTION ═══
  const manualActivate = async (planId) => {
    // Redirect to Stripe checkout — webhook handles plan activation
    openCheckout(planId);
  };

  if (page === P.PLANS) return wrap(
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {logo(isDesk ? 28 : 24)}
          <BackBtn to={P.DASH} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LangSelector />
          <UserPanel />
        </div>
      </div>
      <div style={{ textAlign: "center", marginBottom: isDesk ? 36 : 24 }}>
        <h2 style={{ fontSize: isDesk ? 28 : 22, fontWeight: 800, marginBottom: 6 }}>{t("choose_plan")}</h2>
        <p style={{ fontSize: 13, color: "#5a5a70" }}>{t("choose_plan_sub")}</p>
      </div>
      <div style={{ display: "flex", flexDirection: isDesk ? "row" : "column", gap: isDesk ? 16 : 10, alignItems: isDesk ? "stretch" : "unset" }}>
        {PLANS.map(pl => {
          const planCta = {
            test:    { es: "Probar sin riesgo →",      en: "Try risk-free →" },
            basic:   { es: "Empezar a crear →",        en: "Start creating →" },
            pro:     { es: "Empezar a vender →",       en: "Start selling →" },
            creator: { es: "Escalar mi contenido →",   en: "Scale my content →" },
          };
          const cta = lang === "en" ? planCta[pl.id].en : planCta[pl.id].es;
          return <PlanCard key={pl.id} pl={pl} onAction={() => openCheckout(pl.id)} actionLabel={cta} isDesk={isDesk} lang={lang} features={planFeatures(pl)} />;
        })}
      </div>
      <Footer />
      <CancelModal />
    </div>
  );

  // ═══ DASHBOARD ═══
  const planData = PLANS.find(p => p.id === profile?.plan) || PLANS[0];
  const hasPlan = profile?.plan && profile.plan !== "none";

  return wrap(
    <>
      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isDesk ? 24 : 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {logo(isDesk ? 26 : 22)}
          <button onClick={() => setPage(P.LAND)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11, color: "#5a5a70", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>← {lang === "en" ? "Home" : "Inicio"}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LangSelector />
          <UserPanel />
        </div>
      </div>

      {!hasPlan && (
        <div style={{ padding: "16px", borderRadius: 12, background: "rgba(255,184,0,.06)", border: "1px solid rgba(255,184,0,.15)", textAlign: "center", marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#ffb800", margin: "0 0 8px" }}>{t("no_plan")}</p>
          <button onClick={() => setPage(P.PLANS)} style={{ padding: "9px 22px", fontSize: 13, fontWeight: 700, color: "#06060e", background: "#ffb800", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>Elegir plan →</button>
        </div>
      )}

      {/* Plan + Credits */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, padding: "4px 12px", borderRadius: 16, background: `${hasPlan ? planData.color : "#5a5a70"}12`, border: `1px solid ${hasPlan ? planData.color : "#5a5a70"}30`, color: hasPlan ? planData.color : "#5a5a70", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{t("plan_label")} {hasPlan ? (lang==="en"?planData.nameEn:planData.name) : t("no_plan_label")}</span>
        {hasPlan && <button onClick={() => setPage(P.PLANS)} style={{ fontSize: 10, color: "#5a5a70", background: "none", border: "1px solid rgba(255,255,255,.06)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>Cambiar plan</button>}
      </div>

      {/* Dashboard layout */}
      <div style={{ display: isDesk ? "grid" : "block", gridTemplateColumns: isDesk ? "280px 1fr" : "unset", gap: isDesk ? 24 : 0 }}>
        {/* Sidebar on desktop */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: isDesk ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ padding: isDesk ? "18px" : "12px", borderRadius: 12, background: "rgba(0,240,255,.04)", border: "1px solid rgba(0,240,255,.1)" }}>
              <p style={{ fontSize: 9, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", margin: 0 }}>Imágenes</p>
              <p style={{ fontSize: isDesk ? 32 : 26, fontWeight: 800, margin: "4px 0 0", fontFamily: "'JetBrains Mono',monospace", color: "#00f0ff" }}>{profile?.images_remaining ?? 0}</p>
              <p style={{ fontSize: 9, color: "#3a3a50", margin: "2px 0 0" }}>Imagen Premium</p>
            </div>
            <div style={{ padding: isDesk ? "18px" : "12px", borderRadius: 12, background: "rgba(180,74,255,.04)", border: "1px solid rgba(180,74,255,.1)" }}>
              <p style={{ fontSize: 9, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", margin: 0 }}>Videos</p>
              <p style={{ fontSize: isDesk ? 32 : 26, fontWeight: 800, margin: "4px 0 0", fontFamily: "'JetBrains Mono',monospace", color: "#b44aff" }}>{profile?.videos_remaining ?? 0}</p>
              <p style={{ fontSize: 9, color: "#3a3a50", margin: "2px 0 0" }}>Video Premium</p>
            </div>
          </div>

          {/* Gallery on desktop sidebar */}
          {isDesk && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Biblioteca</p>
              {gens.length === 0 ? <p style={{ fontSize: 11, color: "#3a3a50" }}>Sin generaciones aún</p> : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 350, overflow: "auto" }}>
                    {gens.slice(0, visibleCount).map((g, i) => (
                      <div key={g.id || i} onClick={() => openPreview(g, i)} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,.05)", cursor: "pointer", transition: "border-color .2s", position: "relative" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = g.type === "image" ? "rgba(0,240,255,.3)" : "rgba(180,74,255,.3)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.05)"}>
                        {g.url && g.status !== "processing" ? (
                          g.type === "image" ? <img src={g.url} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                          : <video src={g.url} muted style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }} />
                        ) : (
                          <div style={{ width: "100%", height: 80, background: "rgba(255,255,255,.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                            {g.status === "processing" ? <div style={{ width: 18, height: 18, border: "2px solid rgba(0,240,255,.2)", borderTop: "2px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite" }} /> : (g.type === "image" ? "🖼️" : "🎬")}
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 4px 3px", background: "linear-gradient(transparent, rgba(0,0,0,.7))" }}>
                          <span style={{ fontSize: 7, color: g.type === "image" ? "#00f0ff" : "#b44aff", fontWeight: 600 }}>{g.type === "image" ? "IMG" : "VID"}</span>
                        </div>
                        {favorites[g.id] && (
                          <div style={{ position: "absolute", top: 4, right: 4, fontSize: 11, lineHeight: 1 }}>❤️</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {visibleCount < gens.length && (
                    <div ref={gallerysentinel} style={{ height: 20 }} />
                  )}
                </>
              )}
            </div>
          )}

          {/* CTA desktop sidebar */}
          {isDesk && (
            <div style={{ padding: "14px", borderRadius: 10, background: "rgba(255,255,255,.015)", border: "1px solid rgba(255,255,255,.03)", textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#4a4a60", margin: "0 0 5px" }}>¿Crear sin límites?</p>
              <button onClick={() => window.open("https://www.skool.com/premium", "_blank")} style={{ fontSize: 10, color: "#00f0ff", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>HyperReal AI Lab →</button>
            </div>
          )}
        </div>

        {/* Main area */}
        <div>
          {/* Tabs */}
          {isDesk ? (
            <div style={{ display: "flex", gap: 3, marginBottom: 16, background: "rgba(255,255,255,.02)", borderRadius: 9, padding: 3 }}>
              {[
                { k: T.IMG, l: t("tab_image") },
                { k: T.VID, l: t("tab_video") },
                { k: T.MOT, l: t("tab_motion") },
                { k: T.DIR, l: t("tab_director") },
              ].map(tb => (
                <button key={tb.k} onClick={() => setTab(tb.k)} style={{ flex: 1, padding: "10px 0", fontSize: 11, fontWeight: tab === tb.k ? 700 : 400, color: tab === tb.k ? "#fff" : "#5a5a70", background: tab === tb.k ? (tb.k === T.MOT ? "rgba(255,107,43,.12)" : tb.k === T.DIR ? "rgba(0,240,255,.1)" : "rgba(255,255,255,.06)") : "transparent", border: tab === tb.k && tb.k === T.MOT ? "1px solid rgba(255,107,43,.25)" : tab === tb.k && tb.k === T.DIR ? "1px solid rgba(0,240,255,.2)" : "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{tb.l}</button>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 3, marginBottom: 3, background: "rgba(255,255,255,.02)", borderRadius: 9, padding: 3 }}>
                {[
                  { k: T.IMG, l: lang === "es" ? "🖼️ Imagen" : "🖼️ Image" },
                  { k: T.VID, l: lang === "es" ? "🎬 Video" : "🎬 Video" },
                  { k: T.GAL, l: "📁" },
                ].map(tb => (
                  <button key={tb.k} onClick={() => setTab(tb.k)} style={{ flex: tb.k === T.GAL ? "0 0 44px" : 1, padding: "9px 4px", fontSize: 11, fontWeight: tab === tb.k ? 700 : 400, color: tab === tb.k ? "#fff" : "#5a5a70", background: tab === tb.k ? "rgba(255,255,255,.06)" : "transparent", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{tb.l}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 3, background: "rgba(255,107,43,.03)", borderRadius: 9, padding: 3, border: "1px solid rgba(255,107,43,.08)" }}>
                {[
                  { k: T.MOT, l: "🎭 Motion" },
                  { k: T.DIR, l: "🎬 Director" },
                ].map(tb => (
                  <button key={tb.k} onClick={() => setTab(tb.k)} style={{ flex: 1, padding: "9px 4px", fontSize: 11, fontWeight: tab === tb.k ? 700 : 400, color: tab === tb.k ? "#fff" : "#5a5a70", background: tab === tb.k ? (tb.k === T.MOT ? "rgba(255,107,43,.15)" : "rgba(0,240,255,.1)") : "transparent", border: tab === tb.k ? (tb.k === T.MOT ? "1px solid rgba(255,107,43,.3)" : "1px solid rgba(0,240,255,.2)") : "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{tb.l}</button>
                ))}
              </div>
            </div>
          )}

          {(tab === T.IMG || tab === T.VID) && (
            <div style={{ animation: "fadeUp .4s ease" }}>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={tab === T.IMG ? t("prompt_img") : t("prompt_vid")} rows={isDesk ? 4 : 3} style={{ ...inp, paddingRight: 40, resize: "none", lineHeight: 1.5, borderRadius: 12, fontSize: isDesk ? 14 : 13 }} />
                <button onClick={() => setPrompt(SAMPLE[Math.floor(Math.random() * SAMPLE.length)])} style={{ position: "absolute", right: 10, top: 10, width: 28, height: 28, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 6, color: "#8a8a9e", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>🎲</button>
              </div>

              {tab === T.IMG && (
                <>
                  <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{t("style_label")}</p>
                  <div style={{ display: "grid", gridTemplateColumns: isDesk ? "repeat(6,1fr)" : "repeat(3,1fr)", gap: 5, marginBottom: 8 }}>
                    {STYLES.map(s => (
                      <button key={s.id} onClick={() => setStyle(s.id)} style={{ padding: "9px 4px", fontSize: 10, fontWeight: style === s.id ? 600 : 400, color: style === s.id ? "#fff" : "#6a6a80", background: style === s.id ? "rgba(0,240,255,.08)" : "rgba(255,255,255,.02)", border: style === s.id ? "1px solid rgba(0,240,255,.25)" : "1px solid rgba(255,255,255,.04)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                        <span style={{ display: "block", fontSize: 15, marginBottom: 2 }}>{s.icon}</span>{lang === "en" ? t("styles")?.[s.id] : s.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{t("ratio_label")}</p>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                    {RATIOS.map(r => (
                      <button key={r} onClick={() => setRatio(r)} style={{ flex: r === "auto" ? "2" : "1", padding: "8px 0", fontSize: r === "auto" ? 11 : 10, fontWeight: ratio === r ? 700 : 400, color: ratio === r ? (r === "auto" ? "#ffb800" : "#00f0ff") : "#5a5a70", background: ratio === r ? (r === "auto" ? "rgba(255,184,0,.08)" : "rgba(0,240,255,.08)") : "rgba(255,255,255,.02)", border: ratio === r ? (r === "auto" ? "1px solid rgba(255,184,0,.25)" : "1px solid rgba(0,240,255,.2)") : "1px solid rgba(255,255,255,.04)", borderRadius: 6, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>
                        {r === "auto" ? (lang === "en" ? "✦ Auto" : "✦ Auto") : r}
                      </button>
                    ))}
                  </div>

                  {/* Quality selector — options depend on plan */}
                  {(() => {
                    const planQualities = { test: ["1K"], basic: ["1K"], pro: ["1K", "2K"], creator: ["1K", "2K", "4K"] };
                    const available = planQualities[profile?.plan] || ["1K"];
                    if (available.length <= 1) return null; // Only show if plan has options
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{lang === "en" ? "Quality" : "Calidad"}</p>
                        <div style={{ display: "flex", gap: 4 }}>
                          {available.map(q => (
                            <button key={q} onClick={() => setImgQuality(q)}
                              style={{ flex: 1, padding: "8px 0", fontSize: 10, fontWeight: imgQuality === q ? 700 : 400, color: imgQuality === q ? "#00f0ff" : "#5a5a70", background: imgQuality === q ? "rgba(0,240,255,.08)" : "rgba(255,255,255,.02)", border: imgQuality === q ? "1px solid rgba(0,240,255,.2)" : "1px solid rgba(255,255,255,.04)", borderRadius: 6, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Reference images upload */}
                  <div style={{ marginBottom: 14, padding: "12px", borderRadius: 10, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 11, color: "#e0e0f0", margin: 0, fontWeight: 500 }}>📎 {t("ref_images")}</p>
                        <p style={{ fontSize: 9, color: "#5a5a70", margin: "2px 0 0" }}>
                          {lang === "en"
                            ? `Optional · Up to 14 images · Max ${MAX_FILE_MB}MB each · jpg, png, webp`
                            : `Opcional · Hasta 14 imágenes · Máx ${MAX_FILE_MB}MB cada una · jpg, png, webp`}
                        </p>
                      </div>
                      <span style={{ fontSize: 9, color: "#00f0ff", fontFamily: "'JetBrains Mono',monospace" }}>{refImages.length}/14</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {refImages.map((file, i) => (
                        <div key={i} style={{ position: "relative", width: 48, height: 48, borderRadius: 6, overflow: "hidden", border: `1px solid ${file.size > MAX_FILE_MB * 1024 * 1024 ? "rgba(255,77,106,.4)" : "rgba(0,240,255,.15)"}` }}>
                          <img src={URL.createObjectURL(file)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          {file.size > MAX_FILE_MB * 1024 * 1024 && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(255,77,106,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 8, color: "#fff", fontWeight: 700 }}>+{MAX_FILE_MB}MB</span>
                            </div>
                          )}
                          <button onClick={() => setRefImages(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: "#ff4d6a", border: "none", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                      {refImages.length < 14 && (
                        <label style={{ width: 48, height: 48, borderRadius: 6, border: "1px dashed rgba(0,240,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: "#5a5a70", background: "rgba(0,240,255,.03)" }}>
                          +
                          <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple hidden onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setRefImages(prev => [...prev, ...files].slice(0, 14));
                            e.target.value = "";
                          }} />
                        </label>
                      )}
                    </div>
                  </div>
                </>
              )}

              {tab === T.VID && (
                <>
                  <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Relación de aspecto</p>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {["16:9", "9:16", "1:1"].map(r => (
                      <button key={r} onClick={() => setVidRatio(r)} style={{ flex: 1, padding: "8px 0", fontSize: 11, fontWeight: vidRatio === r ? 600 : 400, color: vidRatio === r ? "#b44aff" : "#5a5a70", background: vidRatio === r ? "rgba(180,74,255,.08)" : "rgba(255,255,255,.02)", border: vidRatio === r ? "1px solid rgba(180,74,255,.2)" : "1px solid rgba(255,255,255,.04)", borderRadius: 6, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>
                        <span style={{ display: "block", fontSize: 9, marginBottom: 2, color: vidRatio === r ? "#8a8a9e" : "#3a3a50" }}>{r === "16:9" ? t("horizontal") : r === "9:16" ? t("vertical") : t("square")}</span>{r}
                      </button>
                    ))}
                  </div>

                  <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{t("duration")}</p>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {getAllowedDurations().map(d => (
                      <button key={d} onClick={() => setVidDur(d)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: vidDur === d ? 600 : 400, color: vidDur === d ? "#b44aff" : "#5a5a70", background: vidDur === d ? "rgba(180,74,255,.08)" : "rgba(255,255,255,.02)", border: vidDur === d ? "1px solid rgba(180,74,255,.2)" : "1px solid rgba(255,255,255,.04)", borderRadius: 6, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>{d}s</button>
                    ))}
                  </div>

                  {/* Audio toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", marginBottom: 14, borderRadius: 8, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div>
                      <p style={{ fontSize: 12, color: "#e0e0f0", margin: 0, fontWeight: 500 }}>🔊 Audio nativo</p>
                      <p style={{ fontSize: 9, color: "#5a5a70", margin: "2px 0 0" }}>IA genera audio ambiental</p>
                    </div>
                    <button onClick={() => setAudioOn(!audioOn)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", background: audioOn ? "linear-gradient(135deg, #b44aff, #8a2be2)" : "rgba(255,255,255,.08)", cursor: "pointer", position: "relative", transition: "background .3s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: audioOn ? 23 : 3, transition: "left .3s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
                    </button>
                  </div>

                  {/* Multishot toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", marginBottom: 14, borderRadius: 8, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div>
                      <p style={{ fontSize: 12, color: "#e0e0f0", margin: 0, fontWeight: 500 }}>🎬 Multi-shot</p>
                      <p style={{ fontSize: 9, color: "#5a5a70", margin: "2px 0 0" }}>Divide en múltiples tomas automáticamente</p>
                    </div>
                    <button onClick={() => setMultishot(!multishot)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", background: multishot ? "linear-gradient(135deg, #ff6b2b, #ff4d6a)" : "rgba(255,255,255,.08)", cursor: "pointer", position: "relative", transition: "background .3s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: multishot ? 23 : 3, transition: "left .3s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
                    </button>
                  </div>

                  {/* Start & End Frames */}
                  <div style={{ marginBottom: 14, padding: "12px", borderRadius: 10, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <p style={{ fontSize: 11, color: "#e0e0f0", margin: "0 0 8px", fontWeight: 500 }}>🖼️ Frames de inicio / final <span style={{ fontSize: 9, color: "#5a5a70", fontWeight: 400 }}>· Opcional</span></p>
                    <div style={{ display: "flex", gap: 10 }}>
                      {/* Start frame */}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 9, color: "#5a5a70", marginBottom: 4 }}>Frame inicial</p>
                        {startFrame ? (
                          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(180,74,255,.15)" }}>
                            <img src={URL.createObjectURL(startFrame)} alt="" style={{ width: "100%", height: 70, objectFit: "cover", display: "block" }} />
                            <button onClick={() => setStartFrame(null)} style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: "#ff4d6a", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                          </div>
                        ) : (
                          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 70, borderRadius: 8, border: "1px dashed rgba(180,74,255,.2)", cursor: "pointer", fontSize: 11, color: "#5a5a70", background: "rgba(180,74,255,.03)" }}>
                            + Subir
                            <input type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) setStartFrame(e.target.files[0]); e.target.value = ""; }} />
                          </label>
                        )}
                      </div>
                      {/* End frame */}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 9, color: "#5a5a70", marginBottom: 4 }}>Frame final</p>
                        {endFrame ? (
                          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(180,74,255,.15)" }}>
                            <img src={URL.createObjectURL(endFrame)} alt="" style={{ width: "100%", height: 70, objectFit: "cover", display: "block" }} />
                            <button onClick={() => setEndFrame(null)} style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: "#ff4d6a", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                          </div>
                        ) : (
                          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 70, borderRadius: 8, border: "1px dashed rgba(180,74,255,.2)", cursor: "pointer", fontSize: 11, color: "#5a5a70", background: "rgba(180,74,255,.03)" }}>
                            + Subir
                            <input type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) setEndFrame(e.target.files[0]); e.target.value = ""; }} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* No credits — show packs for eligible plans, upgrade for others */}
              {hasPlan && ((tab === T.IMG && (profile?.images_remaining ?? 0) <= 0) || (tab === T.VID && (profile?.videos_remaining ?? 0) <= 0)) && (() => {
                const isPackEligible = PACK_ELIGIBLE_PLANS.includes(profile?.plan);
                const isImg = tab === T.IMG;
                const imgPacks = [
                  { id: "img_s", label: "Pack S", amount: 20,  price: 5.99  },
                  { id: "img_m", label: "Pack M", amount: 50,  price: 12.99 },
                  { id: "img_l", label: "Pack L", amount: 120, price: 27.99 },
                ];
                const vidPacks = [
                  { id: "vid_s", label: "Pack S", amount: 5,  price: 12.99 },
                  { id: "vid_m", label: "Pack M", amount: 12, price: 27.99 },
                  { id: "vid_l", label: "Pack L", amount: 30, price: 59.99 },
                ];
                const packs = isImg ? imgPacks : vidPacks;
                return (
                  <div style={{ padding: "16px", borderRadius: 12, background: "rgba(0,240,255,.04)", border: "1px solid rgba(0,240,255,.12)", marginBottom: 14, animation: "fadeUp .4s ease" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#e0e0f0", margin: "0 0 4px" }}>
                      {isImg ? (lang === "en" ? "📸 Out of image credits" : "📸 Sin créditos de imagen") : (lang === "en" ? "🎬 Out of video credits" : "🎬 Sin créditos de video")}
                    </p>
                    {isPackEligible ? (
                      <>
                        <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 12px" }}>
                          {lang === "en" ? "Add extra credits — quality follows your plan" : "Agrega créditos extra — calidad según tu plan actual"}
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          {packs.map(pk => (
                            <button key={pk.id} onClick={() => openPack(pk.id, profile?.email)}
                              style={{ flex: 1, padding: "12px 6px", borderRadius: 10, border: "1px solid rgba(0,240,255,.25)", background: "linear-gradient(135deg, rgba(0,240,255,.08), rgba(0,240,255,.04))", cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "border-color .2s, background .2s" }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,240,255,.5)"; e.currentTarget.style.background = "rgba(0,240,255,.12)"; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,240,255,.25)"; e.currentTarget.style.background = "linear-gradient(135deg, rgba(0,240,255,.08), rgba(0,240,255,.04))"; }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: "#8a8aaa", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 1 }}>{pk.label}</p>
                              <p style={{ fontSize: 15, fontWeight: 800, color: "#00f0ff", margin: "0 0 4px", fontFamily: "'JetBrains Mono',monospace" }}>+{pk.amount}</p>
                              <p style={{ fontSize: 10, color: "#8a8aaa", margin: "0 0 6px" }}>{isImg ? (lang === "en" ? "images" : "imágenes") : (lang === "en" ? "videos" : "videos")}</p>
                              <p style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0 }}>${pk.price}</p>
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setPage(P.PLANS)} style={{ width: "100%", marginTop: 8, padding: "8px", fontSize: 11, color: "#5a5a70", background: "transparent", border: "1px solid rgba(255,255,255,.06)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
                          {lang === "en" ? "Or upgrade plan →" : "O actualiza tu plan →"}
                        </button>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 11, color: "#5a5a70", margin: "0 0 10px" }}>
                          {lang === "en" ? "Upgrade to Basic or higher to buy extra credit packs" : "Actualiza a Básico o superior para comprar packs extra"}
                        </p>
                        <button onClick={() => setPage(P.PLANS)} style={{ width: "100%", padding: "10px", fontSize: 13, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                          {lang === "en" ? "Upgrade plan →" : "Actualizar plan →"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}

              <button onClick={hasPlan ? handleGen : () => setPage(P.PLANS)} disabled={hasPlan && (genning || (!prompt.trim() && style !== "restore" && style !== "colorize") || (tab === T.IMG && (profile?.images_remaining ?? 0) <= 0) || (tab === T.VID && (profile?.videos_remaining ?? 0) <= 0))} style={{ width: "100%", padding: isDesk ? "15px" : "13px", fontSize: 14, fontWeight: 700, color: !hasPlan || (hasPlan && ((tab === T.IMG && (profile?.images_remaining ?? 0) <= 0) || (tab === T.VID && (profile?.videos_remaining ?? 0) <= 0))) ? "#06060e" : genning || (!prompt.trim() && style !== "restore" && style !== "colorize") ? "#3a3a50" : "#06060e", background: !hasPlan ? "#ffb800" : (hasPlan && ((tab === T.IMG && (profile?.images_remaining ?? 0) <= 0) || (tab === T.VID && (profile?.videos_remaining ?? 0) <= 0))) ? "rgba(255,255,255,.06)" : genning || (!prompt.trim() && style !== "restore" && style !== "colorize") ? "rgba(255,255,255,.03)" : tab === T.IMG ? "linear-gradient(135deg, #00f0ff, #00c8ff)" : "linear-gradient(135deg, #b44aff, #8a2be2)", border: "none", borderRadius: 11, cursor: genning && hasPlan ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: !hasPlan ? "0 0 20px rgba(255,184,0,.2)" : genning || (!prompt.trim() && style !== "restore" && style !== "colorize") ? "none" : tab === T.IMG ? "0 0 22px rgba(0,240,255,.2)" : "0 0 22px rgba(180,74,255,.2)" }}>
                {!hasPlan ? t("plan_for_gen") : genning ? (t("loading")) : tab === T.IMG ? `${t("gen_image")} (${profile?.images_remaining ?? 0})` : `${t("gen_video")} (${profile?.videos_remaining ?? 0})`}
              </button>
              {genning && <div style={{ marginTop: 14, position: "relative", height: isDesk ? 180 : 150, borderRadius: 14, overflow: "hidden" }}><Generating type={tab} duration={vidDur} lang={lang} genStatus={genStatus} /></div>}

              {/* Error */}
              {genError && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", fontSize: 12, color: "#ff4d6a", textAlign: "center" }}>{genError}</div>}

              {/* Result preview */}
              {genResult && !genning && (
                <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,240,255,.15)", animation: "fadeUp .5s ease" }}>
                  {genResult.type === "image" ? (
                    <img src={genResult.url} alt="Generated" style={{ width: "100%", display: "block", borderRadius: 14 }} />
                  ) : (
                    <video src={genResult.url} controls autoPlay style={{ width: "100%", display: "block", borderRadius: 14 }} />
                  )}
                  <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "#5a5a70" }}>✓ {genResult.type === "image" ? "Imagen Premium" : "Video Premium"}</span>
                      {genResult.resolution && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(0,240,255,.1)", color: "#00f0ff", fontWeight: 600 }}>{genResult.resolution}</span>}
                      {genResult.audio && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(180,74,255,.1)", color: "#b44aff", fontWeight: 600 }}>🔊 Audio</span>}
                    </div>
                    <button data-download-btn onClick={() => downloadFile(genResult.url, `nanobanano-${genResult.type === "image" ? "img" : "vid"}-${Date.now()}.${genResult.type === "image" ? "png" : "mp4"}`)} style={{ fontSize: 11, color: "#00f0ff", background: "rgba(0,240,255,.08)", border: "1px solid rgba(0,240,255,.15)", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>↓ {t("download")}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ MOTION CONTROL TAB ═══ */}
          {tab === T.MOT && (() => {
            const isMotionEligible = ["basic","pro","creator"].includes(profile?.plan);
            const isTestPlan = profile?.plan === "test" || !profile?.plan;
            const motionMaxDur = profile?.plan === "basic" ? 5 : profile?.plan === "pro" ? 8 : 15;
            const motionCredits = motionVideoDuration > 10 ? 3 : 2; // 5-10s = 2 credits, 11-15s = 3 credits
            const canGenMotion = isMotionEligible && motionImageUrl && motionVideoUrl && !genning && !motionUploadProgress.img && !motionUploadProgress.vid && (profile?.videos_remaining ?? 0) >= motionCredits;

            const uploadMotionFile = async (file, isImg) => {
              if (!file) return;
              const fieldKey = isImg ? "img" : "vid";
              setMotionUploadError(null);

              // Videos: validate size AND duration before accepting
              if (!isImg) {
                // Size check
                if (file.size > 10 * 1024 * 1024) {
                  const mb = (file.size / 1024 / 1024).toFixed(1);
                  const isIphone = /iPhone|iPad/i.test(navigator.userAgent);
                  const isMobile = /Android/i.test(navigator.userAgent);
                  const tip = isIphone
                    ? (lang === "es" ? " En iPhone: Ajustes → Cámara → Formato → Compatible. Grabá en 1080p." : " On iPhone: Settings → Camera → Format → Most Compatible. Record in 1080p.")
                    : isMobile
                      ? (lang === "es" ? " Comprimí con VidCompact o grabá en 1080p." : " Compress with VidCompact or record in 1080p.")
                      : (lang === "es" ? " Comprimí con Handbrake (gratis) o exportá en calidad media." : " Compress with Handbrake (free) or export at medium quality.");
                  setMotionUploadError((lang === "es" ? `Video muy pesado (${mb}MB). Máx 10MB.` : `Video too large (${mb}MB). Max 10MB.`) + tip);
                  return;
                }

                // Duration check — fal.ai generates the same duration as the reference video
                // So we must limit the video duration to the plan max
                const planMaxSec = profile?.plan === "basic" ? 5 : profile?.plan === "pro" ? 8 : 15;
                try {
                  const videoDuration = await new Promise((resolve, reject) => {
                    const vid = document.createElement("video");
                    vid.preload = "metadata";
                    vid.onloadedmetadata = () => { URL.revokeObjectURL(vid.src); resolve(vid.duration); };
                    vid.onerror = () => reject(new Error("Cannot read video metadata"));
                    vid.src = URL.createObjectURL(file);
                  });
                  if (videoDuration > planMaxSec + 0.5) { // 0.5s tolerance
                    setMotionUploadError(
                      lang === "es"
                        ? `Tu video dura ${videoDuration.toFixed(1)}s pero tu plan permite máximo ${planMaxSec}s. Recortá el video antes de subirlo.`
                        : `Your video is ${videoDuration.toFixed(1)}s but your plan allows max ${planMaxSec}s. Please trim the video before uploading.`
                    );
                    return;
                  }
                  setMotionVideoDuration(videoDuration);
                } catch (e) {
                  console.warn("Could not read video duration:", e.message);
                  // Continue anyway — backend will handle it
                }
              }

              // Show preview immediately
              if (isImg) {
                setMotionImage(file);
                if (motionImagePreview) URL.revokeObjectURL(motionImagePreview);
                setMotionImagePreview(URL.createObjectURL(file));
              } else {
                setMotionVideo(file);
                if (motionVideoPreview) URL.revokeObjectURL(motionVideoPreview);
                setMotionVideoPreview(URL.createObjectURL(file));
              }

              setMotionUploadProgress(p => ({ ...p, [fieldKey]: true }));

              try {
                let dataUrl;

                if (isImg) {
                  // Compress image with canvas — instantaneous, no libraries
                  // Limits to 1800px max dimension, JPEG quality 0.88
                  dataUrl = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                      try {
                        const MAX_PX = 1800;
                        let w = img.width, h = img.height;
                        if (w > MAX_PX || h > MAX_PX) {
                          if (w > h) { h = Math.round((h/w)*MAX_PX); w = MAX_PX; }
                          else { w = Math.round((w/h)*MAX_PX); h = MAX_PX; }
                        }
                        const canvas = document.createElement("canvas");
                        canvas.width = w; canvas.height = h;
                        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL("image/jpeg", 0.88));
                      } catch(e) { reject(e); }
                    };
                    img.onerror = () => reject(new Error("Cannot load image"));
                    img.src = URL.createObjectURL(file);
                  });
                } else {
                  // Video — read as-is (already validated ≤10MB)
                  dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                  });
                }

                // If result fits Vercel body limit (~3MB base64) → /api/upload
                if (dataUrl.length <= 3 * 1024 * 1024) {
                  const r = await fetch("/api/upload", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data_url: dataUrl, user_token: session?.access_token }),
                  });
                  const d = await r.json();
                  if (d.error) throw new Error(d.error);
                  if (!d.url) throw new Error("No URL returned");
                  if (isImg) setMotionImageUrl(d.url);
                  else setMotionVideoUrl(d.url);
                } else {
                  // Larger — presigned PUT directly to fal.ai storage (CSP allows it)
                  const mime = isImg ? "image/jpeg" : file.type;
                  const initR = await fetch("/api/upload-init", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mime_type: mime, file_name: `motion.${isImg ? "jpg" : file.name.split(".").pop()}`, user_token: session?.access_token }),
                  });
                  const initD = await initR.json();
                  if (!initD.upload_url) throw new Error(initD.error || "No upload URL");
                  const blob = isImg ? await (await fetch(dataUrl)).blob() : file;
                  const putRes = await fetch(initD.upload_url, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
                  if (!putRes.ok) throw new Error(`PUT failed: ${putRes.status}`);
                  if (isImg) setMotionImageUrl(initD.file_url);
                  else setMotionVideoUrl(initD.file_url);
                }
              } catch (e) {
                console.error("Upload error:", e.message);
                setMotionUploadError(lang === "es" ? `Error al subir: ${e.message}` : `Upload error: ${e.message}`);
                if (isImg) { setMotionImage(null); setMotionImageUrl(null); setMotionImagePreview(null); }
                else { setMotionVideo(null); setMotionVideoUrl(null); setMotionVideoPreview(null); }
              } finally {
                setMotionUploadProgress(p => ({ ...p, [fieldKey]: false }));
              }
            };

            const handleMotionGen = async () => {
              if (!canGenMotion) return;
              setGenning(true); setGenError(null);
              setGenStatus({ phase: "queued", position: null, elapsed: 0 });
              try {
                const r = await fetch("/api/motion", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    image_url: motionImageUrl,
                    video_url: motionVideoUrl,
                    video_duration: motionVideoDuration,
                    character_orientation: motionOrientation,
                    prompt: motionPrompt.trim() || undefined,
                    user_token: session?.access_token,
                  }),
                });
                const data = await r.json();
                if (data.error) { setGenError(data.error); setGenning(false); return; }
                // Clear local state after submitting
                setMotionImageUrl(null); setMotionVideoUrl(null);
                setMotionImage(null); setMotionVideo(null);
                setMotionImagePreview(null); setMotionVideoPreview(null);
                if (data.completed && data.url) { await saveGenResult(true, data); return; }
                const { request_id, endpoint, status_url, response_url } = data;
                setGenStatus({ phase: "queued", position: null, elapsed: 0 });
                const pollStart = Date.now(); let attempts = 0;
                const poll = async () => {
                  attempts++;
                  if (attempts > 150) { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); return; }
                  try {
                    const sr = await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id, endpoint, type: "video", user_token: session?.access_token, status_url, response_url }) });
                    const sd = await sr.json();
                    const elapsed = Math.round((Date.now() - pollStart) / 1000);
                    if (sd.status === "COMPLETED" && sd.url) { await saveGenResult(true, { url: sd.url }); playDoneSound(); return; }
                    if (sd.status === "FAILED") { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); setGenError((lang === "es" ? "❌ Generación fallida" : "❌ Generation failed") + (sd.error ? `: ${sd.error}` : "") + (lang === "es" ? " — Crédito devuelto." : " — Credit refunded.")); try { const u2 = await sb.getUser(session.access_token); if (u2?.id) { const p2 = await sb.getProfile(u2.id, session.access_token); if (p2) setProfile(prev => ({ ...prev, videos_remaining: p2.videos_remaining, images_remaining: p2.images_remaining })); } } catch {} return; }
                    setGenStatus({ phase: (sd.position ?? 0) > 0 ? "queued" : "generating", position: sd.position || null, elapsed });
                    setTimeout(poll, 4000);
                  } catch { setTimeout(poll, 5000); }
                };
                setTimeout(poll, 3000);
              } catch (e) { setGenError(e.message); setGenning(false); }
            };

            return (
              <div style={{ animation: "fadeUp .4s ease" }}>
                {/* Upgrade overlay for Test plan users */}
                <div style={{ position: "relative" }}>
                  {isTestPlan && (
                    <div style={{ position: "absolute", inset: 0, zIndex: 10, borderRadius: 14, background: "rgba(6,6,14,.82)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", textAlign: "center" }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>🎭</div>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>{lang === "es" ? "Función exclusiva" : "Exclusive feature"}</p>
                      <p style={{ fontSize: 11, color: "#a0a0b8", margin: "0 0 6px", lineHeight: 1.5 }}>
                        {lang === "es" ? "Motion Control está disponible para planes Basic, Pro y Creator." : "Motion Control is available on Basic, Pro & Creator plans."}
                      </p>
                      <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 18px" }}>
                        {lang === "es" ? "Transferí movimientos reales a tus imágenes con IA." : "Transfer real movements to your images with AI."}
                      </p>
                      <button onClick={() => setPage(P.PLANS)} style={{ padding: "12px 28px", fontSize: 13, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg,#ff6b2b,#ffb800)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 20px rgba(255,107,43,.4)" }}>
                        {lang === "es" ? "🚀 Cambiar de plan" : "🚀 Upgrade plan"}
                      </button>
                    </div>
                  )}
                  <div style={{ opacity: isTestPlan ? 0.25 : 1, pointerEvents: isTestPlan ? "none" : "auto" }}>
                    {/* Header */}
                    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(255,107,43,.05)", border: "1px solid rgba(255,107,43,.12)" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#ff6b2b", margin: "0 0 2px" }}>🎭 Motion Control Premium</p>
                      <p style={{ fontSize: 9, color: "#5a5a70", margin: 0 }}>{lang === "es" ? `Transfiere el movimiento de un video a tu imagen — cuesta ${motionCredits} créditos de video` : `Transfer motion from a video to your image — costs ${motionCredits} video credits`}</p>
                    </div>

                    {/* Two upload boxes side by side */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                      {/* Character Image */}
                      <div>
                        <p style={{ fontSize: 10, color: "#8a8a9e", marginBottom: 6, fontWeight: 600 }}>{lang === "es" ? "📸 Tu imagen / personaje" : "📸 Your image / character"}</p>
                        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 140, borderRadius: 12, border: motionImagePreview ? "1px solid rgba(0,240,255,.3)" : "1px dashed rgba(255,255,255,.15)", background: motionImagePreview ? "rgba(0,240,255,.04)" : "rgba(255,255,255,.02)", cursor: "pointer", overflow: "hidden", position: "relative" }}>
                          {motionImagePreview
                            ? <>
                                <img src={motionImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                {motionUploadProgress.img && (
                                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                    <div style={{ width: 22, height: 22, border: "2px solid rgba(0,240,255,.3)", borderTop: "2px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite", marginBottom: 4 }} />
                                    <span style={{ fontSize: 9, color: "#00f0ff" }}>{lang === "es" ? "Subiendo..." : "Uploading..."}</span>
                                  </div>
                                )}
                                {!motionUploadProgress.img && motionImageUrl && (
                                  <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,240,255,.85)", borderRadius: 4, padding: "2px 6px", fontSize: 9, color: "#06060e", fontWeight: 700 }}>✓ Listo</div>
                                )}
                              </>
                            : <><span style={{ fontSize: 24, marginBottom: 6 }}>🖼️</span><span style={{ fontSize: 10, color: "#5a5a70", textAlign: "center", padding: "0 8px" }}>{lang === "es" ? "Toca para subir imagen" : "Tap to upload image"}</span></>}
                          {motionImagePreview && !motionUploadProgress.img && <button onClick={e => { e.preventDefault(); setMotionImage(null); setMotionImageUrl(null); setMotionImagePreview(null); }} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "#ff4d6a", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>}
                          <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={e => uploadMotionFile(e.target.files[0], true)} />
                        </label>
                      </div>
                      {/* Motion Video */}
                      <div>
                        <p style={{ fontSize: 10, color: "#8a8a9e", marginBottom: 6, fontWeight: 600 }}>{lang === "es" ? "🎬 Video de movimiento" : "🎬 Motion reference video"}</p>
                        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 140, borderRadius: 12, border: motionVideoPreview ? "1px solid rgba(180,74,255,.3)" : "1px dashed rgba(255,255,255,.15)", background: motionVideoPreview ? "rgba(180,74,255,.04)" : "rgba(255,255,255,.02)", cursor: "pointer", overflow: "hidden", position: "relative" }}>
                          {motionVideoPreview
                            ? <>
                                <video src={motionVideoPreview} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                {motionUploadProgress.vid && (
                                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                    <div style={{ width: 22, height: 22, border: "2px solid rgba(180,74,255,.3)", borderTop: "2px solid #b44aff", borderRadius: "50%", animation: "spin .8s linear infinite", marginBottom: 4 }} />
                                    <span style={{ fontSize: 9, color: "#b44aff" }}>{lang === "es" ? "Subiendo..." : "Uploading..."}</span>
                                  </div>
                                )}
                                {!motionUploadProgress.vid && motionVideoUrl && (
                                  <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(180,74,255,.85)", borderRadius: 4, padding: "2px 6px", fontSize: 9, color: "#fff", fontWeight: 700 }}>✓ Listo</div>
                                )}
                              </>
                            : <><span style={{ fontSize: 24, marginBottom: 6 }}>🎬</span><span style={{ fontSize: 10, color: "#5a5a70", textAlign: "center", padding: "0 8px" }}>{lang === "es" ? "Toca para subir video" : "Tap to upload video"}</span></>}
                          {motionVideoPreview && !motionUploadProgress.vid && <button onClick={e => { e.preventDefault(); setMotionVideo(null); setMotionVideoUrl(null); setMotionVideoPreview(null); }} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "#ff4d6a", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>}
                          <input type="file" accept="video/mp4,video/mov,video/webm,video/m4v" style={{ display: "none" }} onChange={e => uploadMotionFile(e.target.files[0], false)} />
                        </label>
                      </div>
                    </div>
                    <p style={{ fontSize: 9, color: "#3a3a50", margin: "-8px 0 14px", textAlign: "center" }}>
                      {lang === "es" ? "📎 Máx 10MB por archivo · jpg, png, webp · mp4, mov, webm" : "📎 Max 10MB per file · jpg, png, webp · mp4, mov, webm"}
                    </p>
                    {/* Orientation — the only real parameter that affects background */}
                    <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#e0e0f0", margin: "0 0 4px" }}>{lang === "es" ? "Modo de orientación:" : "Orientation mode:"}</p>
                      <p style={{ fontSize: 9, color: "#5a5a70", margin: "0 0 10px" }}>
                        {motionOrientation === "video"
                          ? (lang === "es" ? "🎬 Sigue el video — mejor para baile, acciones complejas (máx. 15s)" : "🎬 Follows video — better for dance, complex actions (max 15s)")
                          : (lang === "es" ? "🖼️ Sigue la imagen — mejor para movimientos de cámara (máx. 10s)" : "🖼️ Follows image — better for camera movements (max 10s)")}
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[["video", lang === "es" ? "🎬 Seguir video" : "🎬 Follow video"], ["image", lang === "es" ? "🖼️ Seguir imagen" : "🖼️ Follow image"]].map(([v, l]) => (
                          <button key={v} onClick={() => { setMotionOrientation(v); if (v === "image" && motionDur > 10) setMotionDur(10); }} style={{ flex: 1, padding: "9px", fontSize: 11, fontWeight: motionOrientation === v ? 700 : 400, color: motionOrientation === v ? "#fff" : "#5a5a70", background: motionOrientation === v ? "rgba(0,240,255,.08)" : "rgba(255,255,255,.02)", border: motionOrientation === v ? "1px solid rgba(0,240,255,.25)" : "1px solid rgba(255,255,255,.05)", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
                        ))}
                      </div>
                    </div>

                    {/* Duration info — real duration comes from uploaded video */}
                    <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,107,43,.05)", border: "1px solid rgba(255,107,43,.1)" }}>
                      <p style={{ fontSize: 10, color: "#ff6b2b", fontWeight: 700, margin: "0 0 3px" }}>
                        ⏱ {lang === "es" ? "Duración = duración del video que subiste" : "Duration = length of your uploaded video"}
                      </p>
                      <p style={{ fontSize: 9, color: "#5a5a70", margin: 0 }}>
                        {lang === "es"
                          ? `Límite de tu plan: máx ${motionMaxDur}s · ${motionCredits} crédito${motionCredits > 1 ? "s" : ""} de video · (5-10s = 2 · 11-15s = 3)`
                          : `Your plan limit: max ${motionMaxDur}s · ${motionCredits} video credit${motionCredits > 1 ? "s" : ""} · (5-10s = 2 · 11-15s = 3)`}
                        {motionVideoDuration > 0 && <span style={{ color: "#00f0ff", marginLeft: 8 }}>· {lang === "es" ? "Video detectado:" : "Detected:"} {motionVideoDuration.toFixed(1)}s ✓</span>}
                      </p>
                    </div>

                    {/* Additional prompt */}
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{lang === "es" ? "Descripción de escena (opcional)" : "Scene description (optional)"}</p>
                      <textarea value={motionPrompt} onChange={e => setMotionPrompt(e.target.value)} placeholder={lang === "es" ? "Ej: fondo de ciudad de noche, iluminación cálida... (no describas el movimiento, el video ya lo define)" : "E.g. city background at night, warm lighting... (don't describe the motion, the video defines it)"} rows={2} style={{ ...inp, resize: "none", fontSize: 12, lineHeight: 1.5, borderRadius: 10 }} maxLength={500} />
                      <p style={{ fontSize: 9, color: "#3a3a50", margin: "3px 0 0", textAlign: "right" }}>{motionPrompt.length}/500</p>
                    </div>

                    {/* Upload error */}
                    {motionUploadError && (
                      <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", fontSize: 11, color: "#ff4d6a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{motionUploadError}</span>
                        <button onClick={() => setMotionUploadError(null)} style={{ background: "none", border: "none", color: "#ff4d6a", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
                      </div>
                    )}

                    {/* Credits warning */}
                {/* Video pack section when credits = 0 */}
                {hasPlan && (profile?.videos_remaining ?? 0) < motionCredits && (() => {
                  const isPackEligible = PACK_ELIGIBLE_PLANS.includes(profile?.plan);
                  const vidPacks = [
                    { id: "vid_s", label: "Pack S", amount: 5,  price: 12.99 },
                    { id: "vid_m", label: "Pack M", amount: 12, price: 27.99 },
                    { id: "vid_l", label: "Pack L", amount: 30, price: 59.99 },
                  ];
                  return (
                    <div style={{ padding: "14px", borderRadius: 12, background: "rgba(0,240,255,.04)", border: "1px solid rgba(0,240,255,.12)", marginBottom: 14, animation: "fadeUp .4s ease" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#e0e0f0", margin: "0 0 4px" }}>
                        {lang === "es" ? "🎬 Sin créditos de video" : "🎬 Out of video credits"}
                      </p>
                      {isPackEligible ? (
                        <>
                          <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 10px" }}>
                            {lang === "es" ? "Agrega créditos extra" : "Add extra credits"}
                          </p>
                          <div style={{ display: "flex", gap: 6 }}>
                            {vidPacks.map(pk => (
                              <button key={pk.id} onClick={() => openPack(pk.id, profile?.email)}
                                style={{ flex: 1, padding: "10px 4px", borderRadius: 9, border: "1px solid rgba(0,240,255,.25)", background: "rgba(0,240,255,.06)", cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                                <p style={{ fontSize: 10, fontWeight: 600, color: "#8a8aaa", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 1 }}>{pk.label}</p>
                                <p style={{ fontSize: 14, fontWeight: 800, color: "#00f0ff", margin: "0 0 2px", fontFamily: "'JetBrains Mono',monospace" }}>+{pk.amount}</p>
                                <p style={{ fontSize: 9, color: "#8a8aaa", margin: "0 0 4px" }}>{lang === "es" ? "videos" : "videos"}</p>
                                <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>${pk.price}</p>
                              </button>
                            ))}
                          </div>
                          <button onClick={() => setPage(P.PLANS)} style={{ width: "100%", marginTop: 7, padding: "7px", fontSize: 10, color: "#5a5a70", background: "transparent", border: "1px solid rgba(255,255,255,.06)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                            {lang === "es" ? "O actualiza tu plan →" : "Or upgrade plan →"}
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 10px" }}>
                            {lang === "es" ? "Actualiza a Básico o superior para comprar packs extra" : "Upgrade to Basic or higher to buy extra packs"}
                          </p>
                          <button onClick={() => setPage(P.PLANS)} style={{ width: "100%", padding: "10px", fontSize: 13, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                            {lang === "es" ? "Actualizar plan →" : "Upgrade plan →"}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                    {/* Generate button */}
                    <button onClick={handleMotionGen} disabled={!canGenMotion}
                      style={{ width: "100%", padding: isDesk ? "15px" : "13px", fontSize: 14, fontWeight: 700, color: canGenMotion ? "#06060e" : "#3a3a50", background: canGenMotion ? "linear-gradient(135deg, #ff6b2b, #ffb800)" : "rgba(255,255,255,.03)", border: "none", borderRadius: 11, cursor: canGenMotion ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: canGenMotion ? "0 0 22px rgba(255,107,43,.3)" : "none", transition: "all .2s" }}>
                      {genning ? (lang === "es" ? "Generando..." : "Generating...") : (motionUploadProgress.img || motionUploadProgress.vid) ? (lang === "es" ? "⏳ Subiendo archivos..." : "⏳ Uploading files...") : !motionImage ? (lang === "es" ? "Sube una imagen primero" : "Upload an image first") : !motionVideo ? (lang === "es" ? "Sube un video de movimiento" : "Upload a motion video") : !motionImageUrl || !motionVideoUrl ? (lang === "es" ? "Esperando upload..." : "Waiting for upload...") : (profile?.videos_remaining ?? 0) < motionCredits ? (lang === "es" ? "Sin créditos suficientes" : "Not enough credits") : (lang === "es" ? `🎭 Generar Motion (${motionCredits} créditos)` : `🎭 Generate Motion (${motionCredits} credits)`)}
                    </button>
                    {genning && <div style={{ marginTop: 14, position: "relative", height: isDesk ? 180 : 150, borderRadius: 14, overflow: "hidden" }}><Generating type={T.VID} duration={motionDur} lang={lang} genStatus={genStatus} /></div>}
                    {genError && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", fontSize: 12, color: "#ff4d6a", textAlign: "center" }}>{genError}</div>}
                    {genResult && !genning && tab === T.MOT && (
                      <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,107,43,.2)", animation: "fadeUp .5s ease" }}>
                        <video src={genResult.url} controls autoPlay style={{ width: "100%", display: "block", borderRadius: 14 }} />
                        <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.02)" }}>
                          <span style={{ fontSize: 10, color: "#5a5a70" }}>✓ Motion Control Premium</span>
                          <button onClick={() => downloadFile(genResult.url, `motion-${Date.now()}.mp4`)} style={{ fontSize: 10, color: "#ff6b2b", background: "rgba(255,107,43,.08)", border: "1px solid rgba(255,107,43,.15)", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>↓ {lang === "es" ? "Descargar" : "Download"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Director tab */}
          {tab === T.DIR && (() => {
            const dirCredits = dirDuration <= 5 ? 3 : dirDuration <= 10 ? 4 : 5;
            const isDirEligible = ["pro","creator"].includes(profile?.plan);
            const isDirLocked = !isDirEligible;
            const primaryImage = dirImages[0];
            const canGenDir = isDirEligible && primaryImage?.url && dirPrompt.trim() && !genning && !dirUploading.img && !dirUploading.aud && (profile?.videos_remaining ?? 0) >= dirCredits;

            // Upload helper — shared for both images and audios
            const uploadDirFile = async (file, isImg) => {
              if (!file) return;
              setDirUploadError(null);

              // Block video files
              if (file.type.startsWith("video/")) {
                setDirUploadError(lang === "es" ? "❌ No se permiten videos en Director. Solo imágenes y audio." : "❌ Videos not allowed. Use images or audio only.");
                return;
              }
              // In keepFrame mode: only 1 image, no audio
              if (dirKeepFrame) {
                if (!isImg) { setDirUploadError(lang === "es" ? "⚠️ Desactivá 'Mantener frame' para usar audio." : "⚠️ Disable 'Keep frame' to add audio."); return; }
                if (dirImages.length >= 1) { setDirUploadError(lang === "es" ? "⚠️ En modo frame inicial solo se permite 1 imagen." : "⚠️ Keep frame mode: only 1 image allowed."); return; }
              }
              // Limits
              if (isImg && dirImages.length >= 9) { setDirUploadError(lang === "es" ? "Máx 9 imágenes." : "Max 9 images."); return; }
              if (!isImg && dirAudios.length >= 2) { setDirUploadError(lang === "es" ? "Máx 2 audios." : "Max 2 audios."); return; }

              setDirUploading(p => ({ ...p, [isImg ? "img" : "aud"]: true }));
              try {
                let dataUrl;
                if (isImg) {
                  dataUrl = await new Promise((res, rej) => {
                    const img = new Image();
                    img.onload = () => {
                      try {
                        const MAX_PX = 1800;
                        let w = img.width, h = img.height;
                        if (w > MAX_PX || h > MAX_PX) { if (w > h) { h = Math.round((h/w)*MAX_PX); w = MAX_PX; } else { w = Math.round((w/h)*MAX_PX); h = MAX_PX; } }
                        const canvas = document.createElement("canvas");
                        canvas.width = w; canvas.height = h;
                        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                        res(canvas.toDataURL("image/jpeg", 0.88));
                      } catch(e) { rej(e); }
                    };
                    img.onerror = () => rej(new Error("Cannot load image"));
                    img.src = URL.createObjectURL(file);
                  });
                } else {
                  dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
                }
                // Upload
                let uploadedUrl;
                if (dataUrl.length <= 3 * 1024 * 1024) {
                  const r = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data_url: dataUrl, user_token: session?.access_token }) });
                  const d = await r.json();
                  if (d.error) throw new Error(d.error);
                  uploadedUrl = d.url;
                } else {
                  const mime = isImg ? "image/jpeg" : file.type;
                  const initR = await fetch("/api/upload-init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mime_type: mime, file_name: `dir.${isImg ? "jpg" : file.name.split(".").pop()}`, user_token: session?.access_token }) });
                  const initD = await initR.json();
                  if (!initD.upload_url) throw new Error(initD.error || "No upload URL");
                  const blob = isImg ? await (await fetch(dataUrl)).blob() : file;
                  const putRes = await fetch(initD.upload_url, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
                  if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);
                  uploadedUrl = initD.file_url;
                }
                if (isImg) {
                  setDirImages(prev => [...prev, { file, preview: URL.createObjectURL(file), url: uploadedUrl }]);
                } else {
                  setDirAudios(prev => [...prev, { file, name: file.name, url: uploadedUrl }]);
                }
              } catch(e) {
                setDirUploadError(e.message);
              } finally {
                setDirUploading(p => ({ ...p, [isImg ? "img" : "aud"]: false }));
              }
            };

            const handleDirGen = async () => {
              if (!canGenDir) return;
              setGenning(true); setGenError(null);
              setGenStatus({ phase: "queued", position: null, elapsed: 0 });
              try {
                const imageUrls = dirImages.map(i => i.url).filter(Boolean);
                const audioUrls = dirAudios.map(a => a.url).filter(Boolean);
                const r = await fetch("/api/director", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    image_urls: imageUrls,
                    audio_urls: (!dirKeepFrame && audioUrls.length > 0) ? audioUrls : undefined,
                    prompt: dirPrompt.trim() + (dirKeepFrame ? " Mantain the exact initial frame as provided." : ""),
                    duration: dirDuration,
                    aspect_ratio: dirAspect,
                    keep_frame: dirKeepFrame,
                    user_token: session?.access_token,
                  }),
                });
                const data = await r.json();
                if (data.error) { setGenError(data.error); setGenning(false); return; }
                if (data.completed && data.url) { await saveGenResult(true, data); return; }
                if (data.request_id) {
                  const { request_id, endpoint, status_url, response_url } = data;
                  const pollStart = Date.now(); let attempts = 0;
                  const poll = async () => {
                    attempts++;
                    if (attempts > 150) { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); return; }
                    try {
                      const sr = await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id, endpoint, type: "video", user_token: session?.access_token, status_url, response_url }) });
                      const sd = await sr.json();
                      const elapsed = Math.round((Date.now() - pollStart) / 1000);
                      if (sd.status === "COMPLETED" && sd.url) { await saveGenResult(true, { url: sd.url }); playDoneSound(); return; }
                      if (sd.status === "FAILED") { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); setGenError((lang === "es" ? "❌ Generación fallida" : "❌ Generation failed") + (sd.error ? `: ${sd.error}` : "") + (lang === "es" ? " — Crédito devuelto." : " — Credit refunded.")); try { const u2 = await sb.getUser(session.access_token); if (u2?.id) { const p2 = await sb.getProfile(u2.id, session.access_token); if (p2) setProfile(prev => ({ ...prev, videos_remaining: p2.videos_remaining })); } } catch {} return; }
                      setGenStatus({ phase: (sd.position ?? 0) > 0 ? "queued" : "generating", position: sd.position || null, elapsed });
                      setTimeout(poll, 4000);
                    } catch { setTimeout(poll, 5000); }
                  };
                  setTimeout(poll, 3000);
                }
              } catch(e) { setGenError(e.message); setGenning(false); }
            };

            return (
              <div style={{ animation: "fadeUp .4s ease" }}>
                {/* Upgrade overlay for non-eligible users */}
                <div style={{ position: "relative" }}>
                  {isDirLocked && (
                    <div style={{ position: "absolute", inset: 0, zIndex: 10, borderRadius: 14, background: "rgba(6,6,14,.82)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", textAlign: "center" }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>🎬</div>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>{lang === "es" ? "Función exclusiva" : "Exclusive feature"}</p>
                      <p style={{ fontSize: 11, color: "#a0a0b8", margin: "0 0 6px", lineHeight: 1.5 }}>
                        {lang === "es" ? "Director está disponible para planes Pro y Creator." : "Director is available on Pro & Creator plans."}
                      </p>
                      <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 18px" }}>
                        {lang === "es" ? "Generación cinematográfica con IA de última generación y audio nativo." : "Cinematic generation with cutting-edge AI and native audio."}
                      </p>
                      <button onClick={() => setPage(P.PLANS)} style={{ padding: "12px 28px", fontSize: 13, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg,#00f0ff,#b44aff)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 20px rgba(0,240,255,.3)" }}>
                        {lang === "es" ? "🚀 Cambiar de plan" : "🚀 Upgrade plan"}
                      </button>
                    </div>
                  )}
                  <div style={{ opacity: isDirLocked ? 0.25 : 1, pointerEvents: isDirLocked ? "none" : "auto" }}>
                {/* Header */}
                <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(0,240,255,.04)", border: "1px solid rgba(0,240,255,.1)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#00f0ff", margin: "0 0 2px" }}>🎬 Director Premium</p>
                  <p style={{ fontSize: 9, color: "#5a5a70", margin: 0 }}>{lang === "es" ? "IA cinematográfica con audio nativo · Solo imagen de referencia" : "Cinematic AI with native audio · Reference image only"}</p>
                </div>

                {/* Warning about real people restriction */}
                <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "rgba(255,184,0,.06)", border: "1px solid rgba(255,184,0,.2)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                  <p style={{ fontSize: 10, color: "#c8a020", margin: 0, lineHeight: 1.5 }}>
                    {lang === "es"
                      ? "El modelo no procesa imágenes que contengan rostros de personas reales reconocibles. Usá ilustraciones, personajes animados, productos o paisajes para mejores resultados."
                      : "The model cannot process images containing recognizable real people's faces. Use illustrations, animated characters, products, or landscapes for best results."}
                  </p>
                </div>

                {/* Upload area — multi-image + multi-audio */}
                <div style={{ marginBottom: 10 }}>
                  {/* Images section */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 10, color: "#8a8a9e", fontWeight: 600, margin: 0 }}>
                        {dirKeepFrame
                          ? (lang === "es" ? "🖼️ Frame inicial *" : "🖼️ Initial frame *")
                          : (lang === "es" ? `🖼️ Imágenes de referencia * (${dirImages.length}/9)` : `🖼️ Reference images * (${dirImages.length}/9)`)}
                      </p>
                      {dirImages.length > 0 && !dirKeepFrame && (
                        <p style={{ fontSize: 9, color: "#5a5a70", margin: 0 }}>
                          {lang === "es" ? "Usá @image1, @image2... en el prompt" : "Use @image1, @image2... in prompt"}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {dirImages.map((img, i) => (
                        <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 9, overflow: "hidden", border: "1px solid rgba(0,240,255,.25)", flexShrink: 0 }}>
                          <img src={img.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          {/* Number badge */}
                          <div style={{ position: "absolute", bottom: 3, left: 3, background: "rgba(0,0,0,.75)", borderRadius: 4, padding: "1px 5px", fontSize: 9, color: "#00f0ff", fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", backdropFilter: "blur(4px)" }}>{i+1}</div>
                          <button onClick={() => setDirImages(prev => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,.75)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      ))}
                      {/* Add image button */}
                      {((!dirKeepFrame && dirImages.length < 9) || (dirKeepFrame && dirImages.length === 0)) && (
                        <label style={{ width: 72, height: 72, borderRadius: 9, border: "1px dashed rgba(255,255,255,.12)", background: "rgba(255,255,255,.02)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {dirUploading.img
                            ? <div style={{ width: 18, height: 18, border: "2px solid rgba(0,240,255,.3)", borderTop: "2px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                            : <><span style={{ fontSize: 22, color: "#5a5a70" }}>+</span><span style={{ fontSize: 8, color: "#5a5a70" }}>img</span></>}
                          <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) uploadDirFile(f, true); }} />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Audio section — hidden in keepFrame mode */}
                  {!dirKeepFrame && (
                    <div>
                      <p style={{ fontSize: 10, color: "#8a8a9e", fontWeight: 600, marginBottom: 6 }}>
                        {lang === "es" ? `🎵 Audio (opcional · ${dirAudios.length}/2)` : `🎵 Audio (optional · ${dirAudios.length}/2)`}
                      </p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {dirAudios.map((aud, i) => (
                          <div key={i} style={{ position: "relative", height: 50, minWidth: 120, maxWidth: 160, borderRadius: 9, border: "1px solid rgba(180,74,255,.3)", background: "rgba(180,74,255,.04)", display: "flex", alignItems: "center", gap: 6, padding: "0 8px", flexShrink: 0 }}>
                            <span style={{ fontSize: 16 }}>🎵</span>
                            <span style={{ fontSize: 9, color: "#b44aff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{aud.name.slice(0, 16)}</span>
                            <button onClick={() => setDirAudios(prev => prev.filter((_, j) => j !== i))} style={{ width: 14, height: 14, borderRadius: "50%", background: "#ff4d6a", border: "none", color: "#fff", fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
                          </div>
                        ))}
                        {dirAudios.length < 2 && (
                          <label style={{ height: 50, minWidth: 80, borderRadius: 9, border: "1px dashed rgba(255,255,255,.12)", background: "rgba(255,255,255,.01)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
                            {dirUploading.aud
                              ? <div style={{ width: 16, height: 16, border: "2px solid rgba(180,74,255,.3)", borderTop: "2px solid #b44aff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                              : <><span style={{ fontSize: 16 }}>+</span><span style={{ fontSize: 8, color: "#5a5a70" }}>audio</span></>}
                            <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac" style={{ display: "none" }} onChange={e => uploadDirFile(e.target.files[0], false)} />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 9, color: "#3a3a50", margin: "0 0 14px", textAlign: "center" }}>
                  {dirKeepFrame
                    ? (lang === "es" ? "📎 1 imagen · jpg, png, webp · El video comenzará exactamente con tu frame" : "📎 1 image · jpg, png, webp · Video starts exactly with your frame")
                    : (lang === "es" ? "📎 Hasta 5 imgs · jpg, png, webp · Hasta 2 audios: mp3, wav, m4a" : "📎 Up to 5 imgs · jpg, png, webp · Up to 2 audios: mp3, wav, m4a")}
                </p>

                {dirUploadError && (
                  <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", fontSize: 11, color: "#ff4d6a", display: "flex", justifyContent: "space-between" }}>
                    <span>{dirUploadError}</span>
                    <button onClick={() => setDirUploadError(null)} style={{ background: "none", border: "none", color: "#ff4d6a", cursor: "pointer" }}>×</button>
                  </div>
                )}

                {/* Prompt with @image autocomplete */}
                <div style={{ marginBottom: 12, position: "relative" }}>
                  <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{lang === "es" ? "Descripción de escena *" : "Scene description *"}</p>
                  <textarea value={dirPrompt}
                    onChange={e => {
                      const val = e.target.value;
                      setDirPrompt(val);
                      // Detect @image trigger — look for @image followed by optional digits at cursor
                      const pos = e.target.selectionStart;
                      const before = val.slice(0, pos);
                      const match = before.match(/@image(\d*)$/);
                      if (match && dirImages.length > 0 && !dirKeepFrame) {
                        setDirMention({ query: match[1], start: pos - match[0].length });
                      } else {
                        setDirMention(null);
                      }
                    }}
                    onKeyDown={e => {
                      // Close mention dropdown on Escape
                      if (e.key === "Escape" && dirMention) { setDirMention(null); e.preventDefault(); }
                    }}
                    onBlur={() => setTimeout(() => setDirMention(null), 150)}
                    placeholder={lang === "es"
                      ? (dirImages.length > 1 ? "Describe la escena. Escribí @image1, @image2... para referenciar tus imágenes..." : "Describe la escena. Escribí @image1 para referenciar tu imagen. Ej: @image1 camina por una calle de noche...")
                      : (dirImages.length > 1 ? "Describe the scene. Type @image1, @image2... to reference your images..." : "Describe the scene. Type @image1 to reference your image. E.g. @image1 walks down a neon-lit street...")}
                    rows={3} style={{ ...inp, resize: "none", fontSize: 12, lineHeight: 1.5, borderRadius: 10 }} maxLength={3500} />

                  {/* Autocomplete dropdown */}
                  {dirMention && dirImages.length > 0 && (() => {
                    const filtered = dirImages
                      .map((img, i) => ({ img, i, num: i+1 }))
                      .filter(({ num }) => !dirMention.query || String(num).startsWith(dirMention.query));
                    if (!filtered.length) return null;
                    const insertMention = (num) => {
                      const tag = `@image${num}`;
                      const before = dirPrompt.slice(0, dirMention.start);
                      const after = dirPrompt.slice(dirMention.start + 1 + "image".length + dirMention.query.length);
                      setDirPrompt(before + tag + (after.startsWith(" ") ? "" : " ") + after);
                      setDirMention(null);
                    };
                    return (
                      <div style={{ position: "absolute", left: 0, right: 0, zIndex: 50, background: "#0e0e1e", border: "1px solid rgba(0,240,255,.25)", borderRadius: 10, padding: "6px", boxShadow: "0 8px 24px rgba(0,0,0,.5)", marginTop: 2 }}>
                        <p style={{ fontSize: 9, color: "#3a3a50", margin: "0 0 6px 4px", letterSpacing: 1 }}>IMÁGENES</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {filtered.map(({ img, num }) => (
                            <div key={num} onMouseDown={() => insertMention(num)}
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", borderRadius: 8, background: "rgba(0,240,255,.06)", border: "1px solid rgba(0,240,255,.15)", cursor: "pointer" }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,.14)"}
                              onMouseLeave={e => e.currentTarget.style.background = "rgba(0,240,255,.06)"}>
                              <div style={{ position: "relative" }}>
                                <img src={img.preview} alt="" style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover", display: "block" }} />
                                <div style={{ position: "absolute", bottom: -2, right: -2, background: "#00f0ff", borderRadius: 3, padding: "0 3px", fontSize: 8, color: "#06060e", fontWeight: 800, lineHeight: "14px" }}>{num}</div>
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#00f0ff", fontFamily: "'JetBrains Mono',monospace" }}>@image{num}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <p style={{ fontSize: 9, color: "#3a3a50", margin: "3px 0 0", textAlign: "right" }}><span style={{ color: dirPrompt.length > 3000 ? "#ffb800" : "#3a3a50" }}>{dirPrompt.length}</span>/3500</p>
                </div>

                {/* Aspect ratio */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{lang === "es" ? "Formato" : "Aspect ratio"}</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["9:16","📱 9:16"],["16:9","🖥️ 16:9"],["1:1","⬛ 1:1"]].map(([v,l]) => (
                      <button key={v} onClick={() => setDirAspect(v)} style={{ flex: 1, padding: "8px 4px", fontSize: 10, fontWeight: dirAspect === v ? 700 : 400, color: dirAspect === v ? "#00f0ff" : "#5a5a70", background: dirAspect === v ? "rgba(0,240,255,.08)" : "rgba(255,255,255,.02)", border: dirAspect === v ? "1px solid rgba(0,240,255,.25)" : "1px solid rgba(255,255,255,.04)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Keep initial frame toggle */}
                <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: "rgba(0,240,255,.03)", border: "1px solid rgba(0,240,255,.08)" }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#e0e0f0", margin: "0 0 2px" }}>{lang === "es" ? "🎯 Mantener frame inicial" : "🎯 Keep initial frame"}</p>
                    <p style={{ fontSize: 9, color: "#5a5a70", margin: 0 }}>{lang === "es" ? "El video comienza exactamente con tu imagen · Solo 1 imagen · Sin audio" : "Video starts exactly with your image · 1 image only · No audio"}</p>
                  </div>
                  <div onClick={() => { setDirKeepFrame(v => !v); if (!dirKeepFrame) { setDirImages(prev => prev.slice(0,1)); setDirAudios([]); } }} style={{ width: 44, height: 24, borderRadius: 12, background: dirKeepFrame ? "#00f0ff" : "rgba(255,255,255,.1)", cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: 3, left: dirKeepFrame ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
                  </div>
                </div>

                {/* Duration + credits — slider 5-15s */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", margin: 0 }}>{lang === "es" ? "Duración" : "Duration"}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "#00f0ff" }}>{dirDuration}s</span>
                      <span style={{ fontSize: 10, color: "#00f0ff", background: "rgba(0,240,255,.08)", border: "1px solid rgba(0,240,255,.2)", borderRadius: 5, padding: "2px 8px", fontWeight: 700 }}>{dirCredits} {lang === "es" ? "créditos" : "credits"}</span>
                    </div>
                  </div>
                  <div style={{ position: "relative", paddingBottom: 4 }}>
                    <input type="range" min={5} max={15} step={1} value={dirDuration}
                      onChange={e => setDirDuration(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#00f0ff", cursor: "pointer", height: 4 }} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: "#3a3a50", fontFamily: "'JetBrains Mono',monospace" }}>5s</span>
                      <span style={{ fontSize: 9, color: "#3a3a50", fontFamily: "'JetBrains Mono',monospace" }}>10s</span>
                      <span style={{ fontSize: 9, color: "#3a3a50", fontFamily: "'JetBrains Mono',monospace" }}>15s</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 9, color: "#3a3a50", margin: "6px 0 0", textAlign: "center" }}>
                    {lang === "es" ? "5s = 3 créditos · 6–10s = 4 créditos · 11–15s = 5 créditos" : "5s = 3 credits · 6–10s = 4 credits · 11–15s = 5 credits"}
                  </p>
                </div>

                {/* Video pack section when credits insufficient */}
                {hasPlan && (profile?.videos_remaining ?? 0) < dirCredits && (() => {
                  const isPackEligible = PACK_ELIGIBLE_PLANS.includes(profile?.plan);
                  const vidPacks = [
                    { id: "vid_s", label: "Pack S", amount: 5,  price: 12.99 },
                    { id: "vid_m", label: "Pack M", amount: 12, price: 27.99 },
                    { id: "vid_l", label: "Pack L", amount: 30, price: 59.99 },
                  ];
                  return (
                    <div style={{ padding: "14px", borderRadius: 12, background: "rgba(0,240,255,.04)", border: "1px solid rgba(0,240,255,.12)", marginBottom: 14, animation: "fadeUp .4s ease" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#e0e0f0", margin: "0 0 4px" }}>
                        {lang === "es" ? "🎬 Sin créditos de video" : "🎬 Out of video credits"}
                      </p>
                      {isPackEligible ? (
                        <>
                          <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 10px" }}>
                            {lang === "es" ? "Agrega créditos extra" : "Add extra credits"}
                          </p>
                          <div style={{ display: "flex", gap: 6 }}>
                            {vidPacks.map(pk => (
                              <button key={pk.id} onClick={() => openPack(pk.id, profile?.email)}
                                style={{ flex: 1, padding: "10px 4px", borderRadius: 9, border: "1px solid rgba(0,240,255,.25)", background: "rgba(0,240,255,.06)", cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                                <p style={{ fontSize: 10, fontWeight: 600, color: "#8a8aaa", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 1 }}>{pk.label}</p>
                                <p style={{ fontSize: 14, fontWeight: 800, color: "#00f0ff", margin: "0 0 2px", fontFamily: "'JetBrains Mono',monospace" }}>+{pk.amount}</p>
                                <p style={{ fontSize: 9, color: "#8a8aaa", margin: "0 0 4px" }}>videos</p>
                                <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>${pk.price}</p>
                              </button>
                            ))}
                          </div>
                          <button onClick={() => setPage(P.PLANS)} style={{ width: "100%", marginTop: 7, padding: "7px", fontSize: 10, color: "#5a5a70", background: "transparent", border: "1px solid rgba(255,255,255,.06)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                            {lang === "es" ? "O actualiza tu plan →" : "Or upgrade plan →"}
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 10px" }}>
                            {lang === "es" ? "Actualiza a Básico o superior para comprar packs extra" : "Upgrade to Basic or higher to buy extra packs"}
                          </p>
                          <button onClick={() => setPage(P.PLANS)} style={{ width: "100%", padding: "10px", fontSize: 13, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                            {lang === "es" ? "Actualizar plan →" : "Upgrade plan →"}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                <button onClick={handleDirGen} disabled={!canGenDir}
                  style={{ width: "100%", padding: isDesk ? "15px" : "13px", fontSize: 14, fontWeight: 700, color: canGenDir ? "#06060e" : "#3a3a50", background: canGenDir ? "linear-gradient(135deg,#00f0ff,#b44aff)" : "rgba(255,255,255,.03)", border: "none", borderRadius: 11, cursor: canGenDir ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: canGenDir ? "0 0 22px rgba(0,240,255,.25)" : "none", transition: "all .2s" }}>
                  {genning ? (lang === "es" ? "Generando..." : "Generating...") : (dirUploading.img || dirUploading.aud) ? (lang === "es" ? "⏳ Subiendo..." : "⏳ Uploading...") : !primaryImage ? (lang === "es" ? "Sube una imagen primero" : "Upload an image first") : !primaryImage.url ? (lang === "es" ? "Esperando upload..." : "Waiting for upload...") : !dirPrompt.trim() ? (lang === "es" ? "Escribí una descripción" : "Write a description") : (profile?.videos_remaining ?? 0) < dirCredits ? (lang === "es" ? "Sin créditos suficientes" : "Not enough credits") : (lang === "es" ? `🎬 Generar Director (${dirCredits} créditos)` : `🎬 Generate Director (${dirCredits} credits)`)}
                </button>

                {genning && <div style={{ marginTop: 14, position: "relative", height: isDesk ? 180 : 150, borderRadius: 14, overflow: "hidden" }}><Generating type={T.VID} duration={dirDuration} lang={lang} genStatus={genStatus} /></div>}
                {genError && <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", fontSize: 11, color: "#ff4d6a" }}>{genError}</div>}

                {genResult && !genning && tab === T.DIR && (
                  <div style={{ marginTop: 14, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,240,255,.15)" }}>
                    <video src={genResult.url} controls playsInline style={{ width: "100%", display: "block", maxHeight: 300, objectFit: "contain", background: "#000" }} />
                    <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.02)" }}>
                      <span style={{ fontSize: 10, color: "#5a5a70" }}>✓ Director Premium</span>
                      <button onClick={() => downloadFile(genResult.url, `director-${Date.now()}.mp4`)} style={{ fontSize: 10, color: "#00f0ff", background: "rgba(0,240,255,.08)", border: "1px solid rgba(0,240,255,.15)", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>↓ {lang === "es" ? "Descargar" : "Download"}</button>
                    </div>
                  </div>
                )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Mobile gallery */}
          {!isDesk && tab === T.GAL && (
            <div style={{ animation: "fadeUp .4s ease" }}>
              {gens.length === 0 ? (
                <div style={{ textAlign: "center", padding: "36px 18px" }}><p style={{ fontSize: 28, marginBottom: 6 }}>📁</p><p style={{ color: "#5a5a70", fontSize: 12 }}>Sin generaciones aún</p></div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {gens.slice(0, visibleCount).map((g, i) => (
                      <div key={g.id || i} onClick={() => openPreview(g, i)} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,.05)", cursor: "pointer", position: "relative", aspectRatio: "1" }}>
                        {g.url && g.status !== "processing" ? (
                          g.type === "image" ? <img src={g.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <video src={g.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                            {g.status === "processing" ? <div style={{ width: 22, height: 22, border: "2px solid rgba(0,240,255,.2)", borderTop: "2px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite" }} /> : (g.type === "image" ? "🖼️" : "🎬")}
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 6px 4px", background: "linear-gradient(transparent, rgba(0,0,0,.8))" }}>
                          <span style={{ fontSize: 8, color: g.type === "image" ? "#00f0ff" : "#b44aff", fontWeight: 600 }}>{g.type === "image" ? "IMG" : "VID"}</span>
                        </div>
                        {favorites[g.id] && (
                          <div style={{ position: "absolute", top: 4, right: 4, fontSize: 12, lineHeight: 1 }}>❤️</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {visibleCount < gens.length && (
                    <div ref={gallerysentinel} style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 20, height: 20, border: "2px solid rgba(0,240,255,.2)", borderTop: "2px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile CTA */}
      {!isDesk && (
        <div style={{ marginTop: 24, padding: "12px", borderRadius: 9, background: "rgba(255,255,255,.015)", border: "1px solid rgba(255,255,255,.03)", textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#4a4a60", margin: "0 0 5px" }}>¿Crear sin límites?</p>
          <button onClick={() => window.open("https://www.skool.com/premium", "_blank")} style={{ fontSize: 10, color: "#00f0ff", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Aprende en HyperReal AI Lab →</button>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div onClick={() => { setPreviewItem(null); setPreviewIndex(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)", animation: "fadeUp .3s ease" }}>
          {/* Prev arrow */}
          {gens.length > 1 && (
            <button onClick={e => { e.stopPropagation(); const idx = previewIndex ?? gens.findIndex(g => g.id === previewItem.id); const p = idx - 1 >= 0 ? idx - 1 : gens.length - 1; setPreviewItem(gens[p]); setPreviewIndex(p); }}
              style={{ position: "fixed", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", borderRadius: "50%", width: 40, height: 40, color: "#e0e0f0", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001 }}>‹</button>
          )}
          {/* Next arrow */}
          {gens.length > 1 && (
            <button onClick={e => { e.stopPropagation(); const idx = previewIndex ?? gens.findIndex(g => g.id === previewItem.id); const n = idx + 1 < gens.length ? idx + 1 : 0; setPreviewItem(gens[n]); setPreviewIndex(n); }}
              style={{ position: "fixed", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", borderRadius: "50%", width: 40, height: 40, color: "#e0e0f0", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001 }}>›</button>
          )}
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", borderRadius: 16, overflow: "hidden", background: "#0a0a14", border: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column" }}>
            {/* Media — fixed, doesn't scroll */}
            <div style={{ flexShrink: 0, position: "relative" }}>
              {previewItem.url ? (
                previewItem.type === "image" ? (
                  <img src={previewItem.url} alt="" style={{ width: "100%", display: "block", maxHeight: "55vh", objectFit: "contain", background: "#06060e" }} />
                ) : (
                  <video src={previewItem.url} controls autoPlay style={{ width: "100%", display: "block", maxHeight: "55vh" }} />
                )
              ) : (
                <div style={{ width: "100%", height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.02)", fontSize: 40 }}>{previewItem.type === "image" ? "🖼️" : "🎬"}</div>
              )}
              {/* Heart button over image */}
              <button
                onClick={e => { e.stopPropagation(); toggleFav(previewItem.id); }}
                style={{ position: "absolute", top: 10, right: 10, background: favorites[previewItem.id] ? "rgba(255,60,90,.85)" : "rgba(0,0,0,.5)", border: favorites[previewItem.id] ? "1px solid rgba(255,60,90,.4)" : "1px solid rgba(255,255,255,.15)", borderRadius: "50%", width: 34, height: 34, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", backdropFilter: "blur(4px)" }}
                title={favorites[previewItem.id] ? (lang === "en" ? "Remove from favorites" : "Quitar de favoritos") : (lang === "en" ? "Add to favorites" : "Agregar a favoritos")}>
                {favorites[previewItem.id] ? "❤️" : "🤍"}
              </button>
              {/* Counter */}
              {gens.length > 1 && (
                <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.6)", borderRadius: 20, padding: "3px 10px", fontSize: 10, color: "#8a8a9e", fontFamily: "'JetBrains Mono',monospace", backdropFilter: "blur(4px)" }}>
                  {(previewIndex ?? gens.findIndex(g => g.id === previewItem.id)) + 1} / {gens.length}
                </div>
              )}
            </div>
            {/* Info — scrollable */}
            <div style={{ padding: "14px 16px", overflowY: "auto", flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: previewItem.type === "image" ? "#00f0ff" : "#b44aff", fontWeight: 600, textTransform: "uppercase" }}>{previewItem.type === "image" ? t("tab_image") : t("tab_video")}</span>
                  <span style={{ fontSize: 9, color: "#3a3a50", fontFamily: "'JetBrains Mono',monospace" }}>{new Date(previewItem.created_at).toLocaleDateString()}</span>
                  {(() => {
                    const STYLE_NAMES = { photorealistic: lang === "en" ? "📸 Photorealistic" : "📸 Fotorrealista", cinematic: lang === "en" ? "🎬 Cinematic" : "🎬 Cinemático", product: lang === "en" ? "🛍️ Product" : "🛍️ Producto", portrait: lang === "en" ? "👤 Portrait" : "👤 Retrato", pixar: "🎭 Pixar 3D", ads: lang === "en" ? "🚀 Ad Creative" : "🚀 Anuncio Ads", neutral: lang === "en" ? "⚪ Neutral" : "⚪ Neutro", restore: lang === "en" ? "🔧 Restore" : "🔧 Restaurar", colorize: lang === "en" ? "🖍️ Coloring Page" : "🖍️ Colorear" };
                    const RATIO_PATTERN = /^\d+:\d+$/;
                    const s = previewItem.style;
                    if (!s) return null;
                    if (STYLE_NAMES[s]) return (
                      <span style={{ fontSize: 9, color: "#a78bff", background: "rgba(167,139,255,.08)", border: "1px solid rgba(167,139,255,.15)", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{STYLE_NAMES[s]}</span>
                    );
                    if (RATIO_PATTERN.test(s)) return (
                      <span style={{ fontSize: 9, color: "#5a5a70", fontFamily: "'JetBrains Mono',monospace" }}>{s}</span>
                    );
                    return null;
                  })()}
                  {isDesk && <span style={{ fontSize: 9, color: "#2a2a3a" }}>← →</span>}
                </div>
                <button onClick={() => { setPreviewItem(null); setPreviewIndex(null); }} style={{ background: "none", border: "none", color: "#5a5a70", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>
              {/* Prompt hidden from UI — copy button only, no visible text */}
              {previewItem.prompt && (
                <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={e => {
                      navigator.clipboard?.writeText(previewItem.prompt).catch(() => {});
                      const b = e.currentTarget;
                      b.textContent = "✓ " + (lang === "en" ? "Copied!" : "¡Copiado!");
                      setTimeout(() => { b.textContent = "📋 " + (lang === "en" ? "Copy prompt" : "Copiar prompt"); }, 1500);
                    }}
                    style={{ fontSize: 10, color: "#6a6a80", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                    📋 {lang === "en" ? "Copy prompt" : "Copiar prompt"}
                  </button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {previewItem.url && (
                  <button data-download-btn onClick={() => downloadFile(previewItem.url, `nanobanano-${previewItem.type}-${Date.now()}.${previewItem.type === "image" ? "png" : "mp4"}`)} style={{ flex: 1, padding: "10px", fontSize: 12, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>↓ {t("download")}</button>
                )}
                <button onClick={() => setPreviewItem(null)} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#5a5a70", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>{t("close")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <CancelModal />
      <PaymentFailedModal />
    </>
  );
}
