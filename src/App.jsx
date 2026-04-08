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
  const successUrl = window.location.origin + "?pack=success&id=" + packId + "&type=" + pack.type + "&amount=" + pack.amount;
  window.location.href = pack.link +
    "?prefilled_email=" + encodeURIComponent(userEmail || "") +
    "&client_reference_id=" + packId;
}

// ─── i18n ───
const TEXTS = {
  es: {
    hero_badge: "Nano Banana 2 + Kling 3.0",
    hero_title_1: "Genera contenido ",
    hero_title_2: "hiperrealista",
    hero_title_3: " con IA",
    hero_sub: "Imágenes y videos de calidad profesional en segundos. Sin equipos. Sin estudios. Sin esperas.",
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
    audio_sub: "Kling 3.0 genera audio ambiental",
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
    powered_img: "Powered by Nano Banana 2",
    powered_vid: "Powered by Kling 3.0",
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
    no_billing: "Sin facturación activa",
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
    hero_badge: "Nano Banana 2 + Kling 3.0",
    hero_title_1: "Generate ",
    hero_title_2: "hyperrealistic",
    hero_title_3: " AI content",
    hero_sub: "Professional-quality images and videos in seconds. No equipment. No studios. No waiting.",
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
    audio_sub: "Kling 3.0 generates ambient audio",
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
    powered_img: "Powered by Nano Banana 2",
    powered_vid: "Powered by Kling 3.0",
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
    no_billing: "No active billing",
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
    features: { es: ["20 imágenes Nano Banana 2/mes", "2 videos Kling 3.0 (5s)/mes", "Calidad de imagen 1K", "Soporte por email"], en: ["20 Nano Banana 2 images/mo", "2 Kling 3.0 videos (5s)/mo", "1K image quality", "Email support"] },
    color: "#22c55e", popular: false },
  { id: "basic", name: "Básico", nameEn: "Basic", price: 19.99, oldPrice: 49.99, images: 40, videos: 8, maxDuration: [5], resolution: "1K",
    features: { es: ["40 imágenes Nano Banana 2/mes", "8 videos Kling 3.0 (5s)/mes", "Calidad de imagen 1K", "Soporte por email"], en: ["40 Nano Banana 2 images/mo", "8 Kling 3.0 videos (5s)/mo", "1K image quality", "Email support"] },
    color: "#00f0ff", popular: false },
  { id: "pro", name: "Pro", nameEn: "Pro", price: 47.99, oldPrice: 99.99, images: 90, videos: 18, maxDuration: [5, 8], resolution: "2K",
    features: { es: ["90 imágenes Nano Banana 2/mes", "18 videos Kling 3.0 (5-8s)/mes", "Calidad de imagen 2K", "Prioridad en cola", "Soporte prioritario"], en: ["90 Nano Banana 2 images/mo", "18 Kling 3.0 videos (5-8s)/mo", "2K image quality", "Priority queue", "Priority support"] },
    color: "#b44aff", popular: true },
  { id: "creator", name: "Creador", nameEn: "Creator", price: 99.99, oldPrice: 199, images: 200, videos: 30, maxDuration: [5, 8, 10], resolution: "4K",
    features: { es: ["200 imágenes Nano Banana 2/mes", "30 videos Kling 3.0 (5-10s)/mes", "Calidad de imagen 4K", "Cola prioritaria máxima", "Soporte dedicado", "Acceso anticipado a modelos"], en: ["200 Nano Banana 2 images/mo", "30 Kling 3.0 videos (5-10s)/mo", "4K image quality", "Max priority queue", "Dedicated support", "Early access to models"] },
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
const T = { IMG: 0, VID: 1, GAL: 2 };

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
  const estMin = type === T.VID ? (duration === 10 ? "2" : duration === 8 ? "1:30" : "1") : "0:15";
  const estMax = type === T.VID ? (duration === 10 ? "4" : duration === 8 ? "3" : "2") : "1";

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
      <p style={{ color: "#5a5a70", fontSize: 11, margin: "0 0 4px" }}>Powered by {type === T.VID ? "Kling 3.0" : "Nano Banana 2"}</p>
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
export default function App() {
  const w = useW();
  const isDesk = w >= 768;
  const [lang, setLang] = useState(detectLang());
  const t = (key) => TEXTS[lang]?.[key] || TEXTS.en[key] || key;
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
  const [vidDur, setVidDur] = useState(5);
  const [vidRatio, setVidRatio] = useState("16:9");
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
      const packId = params.get("id");
      const packType = params.get("type");
      const packAmount = parseInt(params.get("amount") || "0");
      window.history.replaceState(null, "", window.location.pathname);
      const saved = (() => { try { return JSON.parse(sessionStorage.getItem("hrs_s") || "null"); } catch { return null; } })();
      if (saved?.access_token && packId) {
        setSession(saved);
        setPayMsg(`Activando pack...`);
        const applyPack = async (attempt = 1) => {
          try {
            const r = await fetch("/api/pack", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_token: saved.access_token, pack_id: packId, type: packType, amount: packAmount }),
            });
            const d = await r.json();
            if (d.ok) {
              setProfile(prev => prev ? {
                ...prev,
                images_remaining: d.images_remaining,
                videos_remaining: d.videos_remaining,
              } : prev);
              await loadProfile(saved);
              const label = packType === "images" ? `+${d.added} imágenes` : `+${d.added} videos`;
              setPayMsg(`✓ ${label} agregadas a tu cuenta`);
              setTimeout(() => setPayMsg(""), 5000);
              return;
            }
            if (attempt < 4) setTimeout(() => applyPack(attempt + 1), 3000);
            else setPayMsg("Error aplicando pack. Contacta soporte.");
          } catch {
            if (attempt < 4) setTimeout(() => applyPack(attempt + 1), 3000);
          }
        };
        applyPack();
        return;
      }
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

        // Resume polling for any pending generation (page was reloaded mid-generation)
        const pending = g.find(gen => gen.status === "processing" && gen.result_url && gen.result_url.includes("|"));
        if (pending) {
          const [reqId, ep] = pending.result_url.split("|");
          const genType = pending.type;
          console.log("Resuming pending generation:", reqId, ep);
          setGenning(true);
          setGenStatus({ phase: "generating", position: null, elapsed: 0 });
          const pollStart = Date.now();
          let attempts = 0;
          const resumePoll = async () => {
            attempts++;
            if (attempts > 100) { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); return; }
            try {
              const statusRes = await fetch("/api/status", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request_id: reqId, endpoint: ep, type: genType, user_token: s.access_token }),
              });
              const statusData = await statusRes.json();
              const elapsed = Math.round((Date.now() - pollStart) / 1000);
              if (statusData.status === "COMPLETED" && statusData.url) {
                const newGen = { ...pending, url: statusData.url, status: "completed", result_url: statusData.url };
                setGens(prev => prev.map(gen => gen.id === pending.id ? newGen : gen));
                setGenResult({ type: genType, url: statusData.url });
                setGenning(false);
                setGenStatus({ phase: "done", position: null, elapsed });
                playDoneSound();
                if (document.hidden && Notification.permission === "granted") {
                  new Notification("NanoBanano Studio", { body: genType === "video" ? "🎬 Tu video está listo" : "📸 Tu imagen está lista", icon: "/favicon.png" });
                }
                return;
              }
              if (statusData.status === "FAILED") { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); return; }
              const pos = statusData.position;
              setGenStatus({ phase: pos > 0 ? "queued" : "generating", position: pos || null, elapsed });
              setTimeout(resumePoll, 3000);
            } catch { setTimeout(resumePoll, 5000); }
          };
          setTimeout(resumePoll, 2000);
        }
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
          style_id: tab === T.IMG ? style : "cinematic",
          aspect_ratio: isVid ? vidRatio : ratio,
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

          if (statusData.status === "FAILED") {
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
    // Backend already deducted credits and saved generation, just refresh profile
    try {
      const u = await sb.getUser(session.access_token);
      if (u?.id) {
        const p = await sb.getProfile(u.id, session.access_token);
        if (p) setProfile(prev => ({ ...prev, images_remaining: p.images_remaining, videos_remaining: p.videos_remaining }));
      }
    } catch {}
    setGens(prev => [{ id: Date.now(), type: isVid ? "video" : "image", prompt, style: tab === T.IMG ? style : "cinematic", created_at: new Date().toISOString(), url: data.url }, ...prev]);
    setGenResult({ type: isVid ? "video" : "image", url: data.url, resolution: data.resolution, audio: data.audio });
    setGenning(false);
    setTimeout(() => setGenStatus({ phase: "idle", position: null, elapsed: 0 }), 3000);
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

  // Compute next billing date (30 days from subscription_start or today)
  const getNextBilling = () => {
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
            ? "NanoBanano Studio no garantiza disponibilidad ininterrumpida del servicio. Mantenimientos programados, fallos técnicos o interrupciones de servicios de terceros (Nano Banana 2, Kling 3.0) pueden afectar temporalmente el servicio. Estos casos no dan derecho a reembolso, pero podrán resultar en compensación de créditos a discreción del equipo."
            : "NanoBanano Studio does not guarantee uninterrupted service availability. Scheduled maintenance, technical failures, or third-party service interruptions (Nano Banana 2, Kling 3.0) may temporarily affect the service. These cases do not entitle users to refunds but may result in credit compensation at the team's discretion." },
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
            <span style={{ fontSize: 9, color: "#3a3a50", letterSpacing: 1, textTransform: "uppercase" }}>{t("next_billing")}</span>
            <p style={{ fontSize: 11, color: "#5a5a70", margin: "3px 0 4px" }}>{nextBill || t("no_billing")}</p>
            {hasPlanForPanel && (
              <button onClick={() => window.open(`${STRIPE_PORTAL}?prefilled_email=${encodeURIComponent(profile?.email || "")}`, "_blank")}
                style={{ fontSize: 10, color: "#00f0ff", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
                {lang === "en" ? "Manage billing →" : "Gestionar facturación →"}
              </button>
            )}
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
  if (page === P.LAND) return wrap(
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
            {t("hero_title_1")}<span style={{ background: "linear-gradient(135deg, #00f0ff, #b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{t("hero_title_2")}</span>{t("hero_title_3")}
          </h1>
          <p style={{ fontSize: isDesk ? 17 : 14, color: "#6a6a80", lineHeight: 1.6, maxWidth: isDesk ? 460 : 380, margin: isDesk ? "0" : "0 auto 24px" }}>{t("hero_sub")}</p>
          {isDesk && <button onClick={() => setPage(session ? P.DASH : P.AUTH)} style={{ marginTop: 24, padding: "14px 36px", fontSize: 15, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 30px rgba(0,240,255,.25)" }}>{session ? (lang === "en" ? "Generate now →" : "Generar ahora →") : t("start_now")}</button>}
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
      <div style={{ display: "grid", gridTemplateColumns: isDesk ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: isDesk ? 16 : 8, marginBottom: isDesk ? 80 : 44 }}>
        {[{ v: "97%", l: t("stat_save") }, { v: "300×", l: t("stat_fast") }, { v: "$0.25", l: t("stat_price") }, ...(isDesk ? [{ v: "5s", l: "Videos IA" }] : [])].map((s, i) => (
          <div key={i} style={{ padding: isDesk ? "24px 16px" : "16px 8px", background: "rgba(255,255,255,.02)", borderRadius: 14, border: "1px solid rgba(255,255,255,.04)", textAlign: "center" }}>
            <p style={{ fontSize: isDesk ? 28 : 20, fontWeight: 800, margin: 0, fontFamily: "'JetBrains Mono',monospace", background: "linear-gradient(135deg, #00f0ff, #b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.v}</p>
            <p style={{ fontSize: isDesk ? 11 : 9, color: "#5a5a70", margin: "4px 0 0" }}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <h2 style={{ fontSize: isDesk ? 28 : 20, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>{t("plans_title")}</h2>
      <p style={{ fontSize: isDesk ? 14 : 12, color: "#5a5a70", textAlign: "center", marginBottom: isDesk ? 32 : 18 }}>{t("plans_sub")}</p>
      <div style={{ display: "flex", flexDirection: isDesk ? "row" : "column", gap: isDesk ? 16 : 10, marginBottom: isDesk ? 60 : 36, alignItems: isDesk ? "stretch" : "unset" }}>
        {PLANS.map(pl => <PlanCard key={pl.id} pl={pl} onAction={() => setPage(session ? P.PLANS : P.AUTH)} actionLabel={session ? (lang === "en" ? `Subscribe → $${pl.price}/mo` : `Suscribirme → $${pl.price}/mes`) : t("start_now")} isDesk={isDesk} lang={lang} features={planFeatures(pl)} />)}
      </div>

      {/* Skool CTA */}
      <div style={{ textAlign: "center", padding: isDesk ? "32px 24px" : "18px 14px", borderRadius: 16, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
        <p style={{ fontSize: isDesk ? 16 : 13, fontWeight: 600, margin: "0 0 6px" }}>{t("learn_title")}</p>
        <p style={{ fontSize: isDesk ? 13 : 11, color: "#5a5a70", margin: "0 0 14px", lineHeight: 1.5 }}>{t("learn_sub")}</p>
        <button onClick={() => window.open("https://www.skool.com/premium", "_blank")} style={{ padding: "10px 28px", fontSize: 12, fontWeight: 700, color: "#e0e0f0", background: "transparent", border: "1px solid rgba(0,240,255,.25)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>{t("learn_cta")}</button>
      </div>

      <p style={{ textAlign: "center", fontSize: 9, color: "#2a2a3a", marginTop: 32, fontFamily: "'JetBrains Mono',monospace" }}>© 2026 NanoBanano Studio · Powered by HyperReal AI Lab</p>
      <Footer />
      <CancelModal />
    </>
  );

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
              {lang === "es" ? <>Genera contenido <span style={{ background: "linear-gradient(135deg,#00f0ff,#b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>hiperrealista</span> con IA</> : <>Generate <span style={{ background: "linear-gradient(135deg,#00f0ff,#b44aff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>hyperrealistic</span> AI content</>}
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
                <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "rgba(0,240,255,.15)", border: "1px solid rgba(0,240,255,.25)", color: "#00f0ff", fontWeight: 600 }}>Nano Banana 2</span>
                <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "rgba(180,74,255,.15)", border: "1px solid rgba(180,74,255,.25)", color: "#b44aff", fontWeight: 600 }}>Kling 3.0</span>
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
        {PLANS.map(pl => <PlanCard key={pl.id} pl={pl} onAction={() => openCheckout(pl.id)} actionLabel={`${t("subscribe")} → $${pl.price}${t("per_month")}`} isDesk={isDesk} lang={lang} features={planFeatures(pl)} />)}
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
              <p style={{ fontSize: 9, color: "#3a3a50", margin: "2px 0 0" }}>Nano Banana 2</p>
            </div>
            <div style={{ padding: isDesk ? "18px" : "12px", borderRadius: 12, background: "rgba(180,74,255,.04)", border: "1px solid rgba(180,74,255,.1)" }}>
              <p style={{ fontSize: 9, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", margin: 0 }}>Videos</p>
              <p style={{ fontSize: isDesk ? 32 : 26, fontWeight: 800, margin: "4px 0 0", fontFamily: "'JetBrains Mono',monospace", color: "#b44aff" }}>{profile?.videos_remaining ?? 0}</p>
              <p style={{ fontSize: 9, color: "#3a3a50", margin: "2px 0 0" }}>Kling 3.0 Standard</p>
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
                        {g.url ? (
                          g.type === "image" ? <img src={g.url} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                          : <video src={g.url} muted style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }} />
                        ) : (
                          <div style={{ width: "100%", height: 80, background: "rgba(255,255,255,.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{g.type === "image" ? "🖼️" : "🎬"}</div>
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
          {/* Tabs (mobile shows gallery tab, desktop doesn't need it) */}
          <div style={{ display: "flex", gap: 3, marginBottom: 16, background: "rgba(255,255,255,.02)", borderRadius: 9, padding: 3 }}>
            {[{ k: T.IMG, l: t("tab_image") }, { k: T.VID, l: t("tab_video") }, ...(!isDesk ? [{ k: T.GAL, l: t("tab_gallery") }] : [])].map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: tab === t.k ? 700 : 400, color: tab === t.k ? "#fff" : "#5a5a70", background: tab === t.k ? "rgba(255,255,255,.06)" : "transparent", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{t.l}</button>
            ))}
          </div>

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
                  {/* Style influence preview */}
                  {prompt.trim() && (
                    <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 8, background: "rgba(0,240,255,.03)", border: "1px solid rgba(0,240,255,.08)" }}>
                      <p style={{ fontSize: 8, color: "#3a3a60", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 4px" }}>
                        {lang === "en" ? "✦ prompt that will be sent" : "✦ prompt que se enviará"}
                      </p>
                      <p style={{ fontSize: 10, color: "#5a5a70", margin: 0, lineHeight: 1.5, fontFamily: "'JetBrains Mono',monospace", wordBreak: "break-word" }}>
                        {buildStyledPrompt(prompt, style)}
                      </p>
                    </div>
                  )}
                  <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{t("ratio_label")}</p>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                    {RATIOS.map(r => (
                      <button key={r} onClick={() => setRatio(r)} style={{ flex: r === "auto" ? "2" : "1", padding: "8px 0", fontSize: r === "auto" ? 11 : 10, fontWeight: ratio === r ? 700 : 400, color: ratio === r ? (r === "auto" ? "#ffb800" : "#00f0ff") : "#5a5a70", background: ratio === r ? (r === "auto" ? "rgba(255,184,0,.08)" : "rgba(0,240,255,.08)") : "rgba(255,255,255,.02)", border: ratio === r ? (r === "auto" ? "1px solid rgba(255,184,0,.25)" : "1px solid rgba(0,240,255,.2)") : "1px solid rgba(255,255,255,.04)", borderRadius: 6, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>
                        {r === "auto" ? (lang === "en" ? "✦ Auto" : "✦ Auto") : r}
                      </button>
                    ))}
                  </div>

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
                      <p style={{ fontSize: 9, color: "#5a5a70", margin: "2px 0 0" }}>Kling 3.0 genera audio ambiental</p>
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
                        <div style={{ display: "flex", gap: 6 }}>
                          {packs.map(pk => (
                            <button key={pk.id} onClick={() => openPack(pk.id, profile?.email)}
                              style={{ flex: 1, padding: "10px 4px", borderRadius: 8, border: "1px solid rgba(0,240,255,.2)", background: "rgba(0,240,255,.06)", cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: "#00f0ff", margin: "0 0 2px" }}>{pk.label}</p>
                              <p style={{ fontSize: 11, color: "#e0e0f0", margin: "0 0 2px", fontFamily: "'JetBrains Mono',monospace" }}>+{pk.amount} {isImg ? (lang === "en" ? "img" : "img") : (lang === "en" ? "vid" : "vid")}</p>
                              <p style={{ fontSize: 10, color: "#5a5a70", margin: 0 }}>${pk.price}</p>
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
                      <span style={{ fontSize: 10, color: "#5a5a70" }}>✓ {genResult.type === "image" ? "Nano Banana 2" : "Kling 3.0"}</span>
                      {genResult.resolution && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(0,240,255,.1)", color: "#00f0ff", fontWeight: 600 }}>{genResult.resolution}</span>}
                      {genResult.audio && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(180,74,255,.1)", color: "#b44aff", fontWeight: 600 }}>🔊 Audio</span>}
                    </div>
                    <button data-download-btn onClick={() => downloadFile(genResult.url, `nanobanano-${genResult.type === "image" ? "img" : "vid"}-${Date.now()}.${genResult.type === "image" ? "png" : "mp4"}`)} style={{ fontSize: 11, color: "#00f0ff", background: "rgba(0,240,255,.08)", border: "1px solid rgba(0,240,255,.15)", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>↓ {t("download")}</button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                        {g.url ? (
                          g.type === "image" ? <img src={g.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <video src={g.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{g.type === "image" ? "🖼️" : "🎬"}</div>
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
              {/* Prompt box — max 3 lines, copy button */}
              {previewItem.prompt && (
                <div style={{ marginBottom: 12, borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <span style={{ fontSize: 9, color: "#3a3a50", letterSpacing: 1, textTransform: "uppercase" }}>Prompt</span>
                    <button
                      onClick={e => {
                        navigator.clipboard?.writeText(previewItem.prompt).catch(() => {});
                        const b = e.currentTarget;
                        b.textContent = "✓";
                        setTimeout(() => { b.textContent = lang === "en" ? "Copy" : "Copiar"; }, 1500);
                      }}
                      style={{ fontSize: 10, color: "#00f0ff", background: "rgba(0,240,255,.06)", border: "1px solid rgba(0,240,255,.15)", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                      {lang === "en" ? "Copy" : "Copiar"}
                    </button>
                  </div>
                  <div style={{ maxHeight: 60, overflow: "hidden", position: "relative", padding: "8px 10px" }}>
                    <p style={{ fontSize: 11, color: "#6a6a80", margin: 0, lineHeight: 1.55, fontFamily: "'JetBrains Mono',monospace", wordBreak: "break-word" }}>
                      {previewItem.prompt}
                    </p>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 20, background: "linear-gradient(transparent, rgba(10,10,20,0.95))" }} />
                  </div>
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
