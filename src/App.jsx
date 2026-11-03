import { useState, useEffect, useRef, Component } from "react";
import { VIDEO_MODELS, IMAGE_MODELS, MODE_LABELS, findVideoModel, findImageModel, videoCredits, imageCredits, clampDuration, pickRes, pickMode, draftCompleteCredits } from "../api/_models.js";

// ─── ERROR BOUNDARY — prevents blank screen on any crash ───
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err) { console.error("App crash:", err); }
  render() {
    if (this.state.error) {
      const isEs = (navigator.language || navigator.userLanguage || "en").toLowerCase().startsWith("es");
      return (
        <div style={{ minHeight: "100vh", background: "#06060e", color: "#e0e0f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 40, marginBottom: 16 }}>⚠️</p>
          <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#fff" }}>
            {isEs ? "Algo salió mal" : "Something went wrong"}
          </p>
          <p style={{ fontSize: 13, color: "#5a5a70", marginBottom: 8, maxWidth: 360, lineHeight: 1.6 }}>
            {isEs
              ? "Ocurrió un error inesperado en la aplicación. Podés intentar recargar la página."
              : "An unexpected error occurred. You can try reloading the page."}
          </p>
          <div style={{ margin: "16px 0 24px", padding: "14px 20px", borderRadius: 12, background: "rgba(0,240,255,.04)", border: "1px solid rgba(0,240,255,.12)", maxWidth: 380 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#00f0ff", marginBottom: 6 }}>
              {isEs ? "¿El error persiste?" : "Does the error persist?"}
            </p>
            <p style={{ fontSize: 12, color: "#8a8a9e", lineHeight: 1.6, marginBottom: 10 }}>
              {isEs
                ? "Tomá una captura de pantalla de este error y enviá un correo explicando lo que estabas haciendo cuando ocurrió."
                : "Take a screenshot of this error and send an email explaining what you were doing when it occurred."}
            </p>
            <a href="mailto:soporte@nanobanano.studio?subject=Error%20en%20la%20app&body=Hola%2C%20tuve%20un%20error%20en%20NanoBanano%20Studio.%20Adjunto%20captura."
              style={{ display: "inline-block", padding: "8px 18px", fontSize: 12, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg,#00f0ff,#00c8ff)", borderRadius: 8, textDecoration: "none" }}>
              📧 soporte@nanobanano.studio
            </a>
          </div>
          <button onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            style={{ padding: "12px 28px", fontSize: 14, fontWeight: 700, color: "#06060e", background: "#00f0ff", border: "none", borderRadius: 10, cursor: "pointer" }}>
            {isEs ? "🔄 Recargar página" : "🔄 Reload page"}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── CONFIG ───
const SB_URL = "https://pygcsyqahhdtmwmqklnl.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5Z2NzeXFhaGhkdG13bXFrbG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTIxNzcsImV4cCI6MjA5MTA2ODE3N30.YddNMUlpSQSkIqf2q8RAVqEH-vYUfPunjv21Lwy0d_Y";
const PRICES = {
  test: { annualLink: "", link: "https://buy.stripe.com/3cI4gz3qW7q1dyf5rNeME0K", images: 20, videos: 2 },
  basic: { annualLink: "", link: "https://buy.stripe.com/14AcN57Hc39LgKraM7eME0H", images: 40, videos: 8 },
  pro: { annualLink: "", link: "https://buy.stripe.com/6oU14n7Hc25H8dVf2neME0I", images: 90, videos: 18 },
  creator: { annualLink: "", link: "https://buy.stripe.com/aFacN55z4bGh3XF2fBeME0J", images: 200, videos: 30 },
};

// Extra credit packs — one-time purchase, only for Basic+ subscribers
const PACKS = {
  img_s:  { link: "https://buy.stripe.com/bJeaEX9PkaCdbq77zVeME0L", type: "images", amount: 20,  price: 5.99,  label: "Pack S", emoji: "📦" },
  img_m:  { link: "https://buy.stripe.com/fZu9AT2mS4dP1Px3jFeME0M", type: "images", amount: 50,  price: 12.99, label: "Pack M", emoji: "📦" },
  img_l:  { link: "https://buy.stripe.com/bJe6oHbXsh0BgKrg6reME0N", type: "images", amount: 120, price: 27.99, label: "Pack L", emoji: "📦" },
  vid_s:  { link: "https://buy.stripe.com/eVq14n4v06lX0Lt4nJeME15", type: "videos", amount: 20,  price: 39.99, label: "Pack S", emoji: "🎬" },
  vid_m:  { link: "https://buy.stripe.com/3cI4gz2mScKlam35rNeME14", type: "videos", amount: 30,  price: 57.99, label: "Pack M", emoji: "🎬" },
  vid_l:  { link: "https://buy.stripe.com/6oU14nf9E25HfGn3jFeME16",              type: "videos", amount: 50,  price: 89.99, label: "Pack L", emoji: "🎬" },
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
  getTxHistory: (uid, t) => fetch(`${SB_URL}/rest/v1/credit_transactions?user_id=eq.${uid}&order=created_at.desc&limit=100`, { headers: hdr(t) }).then(r => r.json()),
  googleSignIn: () => {
    // flow=implicit forces #access_token response on all browsers including Windows Chrome/Edge
    window.location.href = `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin)}&flow_type=implicit`;
  },
};

function openCheckout(planId, userEmail, annual = false) {
  const plan = PRICES[planId];
  const link = annual ? plan?.annualLink : plan?.link;
  if (!link) return;
  const successUrl = encodeURIComponent(
    window.location.origin + "?payment=success&plan=" + planId
  );
  const cancelUrl = encodeURIComponent(window.location.origin);
  window.location.href = link
    + "?prefilled_email=" + encodeURIComponent(userEmail || "")
    + "&client_reference_id=" + planId + (annual ? "_annual" : "")
    + "&success_url=" + successUrl
    + "&cancel_url=" + cancelUrl;
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
    top_up: "⚡ Recargar",
    images_label: "Imágenes",
    videos_label: "Videos",
    tab_image: "🖼️ Imagen",
    tab_video: "🎬 Video",
    tab_gallery: "📁 Galería",
    tab_motion: "🎭 Motion",
    tab_director: "🎬 Director",
    tab_vid_edit: "🎭 Jutsu",
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
    no_credits_img: "Sin créditos suficientes",
    no_credits_vid: "Sin créditos suficientes",
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
    top_up: "⚡ Top up",
    images_label: "Images",
    videos_label: "Videos",
    tab_image: "🖼️ Image",
    tab_video: "🎬 Video",
    tab_gallery: "📁 Gallery",
    tab_motion: "🎭 Motion",
    tab_director: "🎬 Director",
    tab_vid_edit: "🎭 Jutsu",
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
    no_credits_img: "Not enough credits",
    no_credits_vid: "Not enough credits",
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
  idsheet: { prefix: "", suffix: "" }, // built server-side (api/_idsheet.js)
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
// ─── Unified credits (v15) — must match api/_credits.js ───
const IMG_UNIT = 8;        // Nano Banana 2 / Seedream image
const VID_UNIT = 60;       // legacy video credit (Motion, Director, Img/Vid Pro, Swap tables)
const VID_PER_SEC = 12;    // Video tab (Kling 3.0): 12 credits per second
const imgCost = (maxRealism) => (maxRealism ? 3 : 1) * IMG_UNIT;
const vidCost = (sec) => Math.max(5, Number(sec) || 5) * VID_PER_SEC;
const PLANS = [
  { id: "test", name: "Test", nameEn: "Test", price: 9.99, oldPrice: 29.99, credits: 275, images: 20, videos: 2, maxDuration: [5], resolution: "1K",
    features: { es: ["275 créditos/mes para imagen y video", "1 generación simultánea", "Calidad de imagen 1K", "Soporte por email"], en: ["275 credits/mo for image & video", "1 simultaneous generation", "1K image quality", "Email support"] },
    color: "#22c55e", popular: false },
  { id: "basic", name: "Básico", nameEn: "Basic", price: 19.99, oldPrice: 49.99, credits: 800, images: 40, videos: 8, maxDuration: [5], resolution: "1K",
    features: { es: ["800 créditos/mes para imagen y video", "2 generaciones simultáneas", "Calidad de imagen 1K", "Soporte por email"], en: ["800 credits/mo for image & video", "2 simultaneous generations", "1K image quality", "Email support"] },
    color: "#00f0ff", popular: false },
  { id: "pro", name: "Pro", nameEn: "Pro", price: 47.99, oldPrice: 99.99, credits: 1800, images: 90, videos: 18, maxDuration: [5, 8], resolution: "2K",
    features: { es: ["1800 créditos/mes para imagen y video", "3 generaciones simultáneas", "Calidad de imagen 2K", "Prioridad en cola", "Soporte prioritario"], en: ["1800 credits/mo for image & video", "3 simultaneous generations", "2K image quality", "Priority queue", "Priority support"] },
    color: "#b44aff", popular: true },
  { id: "creator", name: "Creador", nameEn: "Creator", price: 99.99, oldPrice: 199, credits: 3400, images: 200, videos: 30, maxDuration: [5, 8, 10], resolution: "4K",
    features: { es: ["3400 créditos/mes para imagen y video", "4 generaciones simultáneas", "Calidad de imagen 4K", "Cola prioritaria máxima", "Soporte dedicado", "Acceso anticipado a modelos"], en: ["3400 credits/mo for image & video", "4 simultaneous generations", "4K image quality", "Max priority queue", "Dedicated support", "Early access to models"] },
    color: "#ff6b2b", popular: false },
];
// Annual pricing (20% off monthly). annual = price per month when billed yearly
const ANNUAL = { test: 7.99, basic: 15.99, pro: 37.99, creator: 79.99 };
const PLAN_TAGLINE = {
  test:    { es: "Para probar tus primeras ideas con IA", en: "For testing your first AI ideas" },
  basic:   { es: "Para creadores explorando herramientas de IA", en: "For creators exploring AI tools" },
  pro:     { es: "Para crear contenido con IA de forma constante", en: "For creators building AI content consistently" },
  creator: { es: "Para creadores y equipos produciendo a escala", en: "For creators and teams producing at scale" },
};
const NO_PROMPT_STYLES = ["restore", "colorize", "idsheet"]; // styles that work with an empty prompt + need a reference image
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
  { id: "idsheet", label: "ID Sheet", icon: "🪪", onlyModel: "gpt2" }, // full master prompt lives in api/_idsheet.js
];
const RATIOS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"];
const SAMPLE = ["Luxury perfume bottle on black marble, volumetric lighting, 8K", "Latin woman CEO in modern office, golden hour, shallow DOF", "Gourmet burger floating, ingredients exploding, dark bg, studio light", "Futuristic car in neon-lit Tokyo street, rain reflections, cinematic"];

const P = { LAND: 0, AUTH: 1, DASH: 2, PLANS: 3 };
const T = { IMG: 0, VID: 1, GAL: 2, MOT: 3, DIR: 4, WS_IMG: 5, WS_VID: 6, VID_EDIT: 7 };

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
  const isVidType = type === T.VID || type === T.WS_VID || type === T.MOT || type === T.DIR || type === T.VID_EDIT;
  const estMin = isVidType ? "2" : "0:15";
  const estMax = isVidType ? "8" : "1";

  const phaseColor = phase === "queued" ? "#ffb800" : phase === "done" ? "#00ff88" : "#00f0ff";
  const phaseLabel = phase === "queued"
    ? (pos ? (isEn ? `In queue · position ${pos}` : `En cola · posición ${pos}`) : (isEn ? "In queue…" : "En cola…"))
    : phase === "done"
    ? (isEn ? "✓ Ready!" : "✓ ¡Listo!")
    : (isEn ? (isVidType ? "Generating video" : "Generating image") : (isVidType ? "Generando video" : "Generando imagen"));

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

export { ErrorBoundary };

// Tiny SVG shape showing aspect ratio visually
const RatioShape = ({ r, active, color = "#00f0ff" }) => {
  const c = active ? color : "#6a6a80";
  const shapes = {
    "auto":  { w: 12, h: 12, rx: 2 },
    "1:1":   { w: 12, h: 12, rx: 1 },
    "16:9":  { w: 18, h: 10, rx: 1 },
    "9:16":  { w: 10, h: 18, rx: 1 },
    "4:3":   { w: 16, h: 12, rx: 1 },
    "3:4":   { w: 12, h: 16, rx: 1 },
    "21:9":  { w: 20, h: 9,  rx: 1 },
  };
  const s = shapes[r] || shapes["1:1"];
  return (
    <svg width={s.w} height={s.h} viewBox={`0 0 ${s.w} ${s.h}`} style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
      <rect x="1" y="1" width={s.w - 2} height={s.h - 2} rx={s.rx} fill="none" stroke={c} strokeWidth="1.5" />
    </svg>
  );
};

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
  const [loadingProfile, setLoadingProfile] = useState(false); // prevents race during OAuth
  const [tab, setTab] = useState(T.IMG);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("neutral");
  const [uiPop, setUiPop] = useState(null);
  const [charHeight, setCharHeight] = useState(""); // ID Sheet height in cm (empty → 170) // v23: open settings popover in studio tabs
  const [ratio, setRatio] = useState("1:1");
  const [imgQuality, setImgQuality] = useState("1K");
  const [imgModelId, setImgModelId] = useState("nb2");
  const [vidModelId, setVidModelId] = useState("kling4");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [vidRefVideo, setVidRefVideo] = useState(null); // { file, url, preview, duration }
  const [vidRefUploading, setVidRefUploading] = useState(false);
  const [vidRes, setVidRes] = useState("1080p");
  const [vidMode, setVidMode] = useState("frames"); // frames | refs | edit | extend (per model)
  const [vidSub, setVidSub] = useState("create");   // Crear video | Editar video
  const [vidPop, setVidPop] = useState(null);       // open settings popover: dur | ratio | res | elements
  const [vidOmniImages, setVidOmniImages] = useState([]); // File[] reference images
  const [vidRefVids, setVidRefVids] = useState([]);  // [{url, preview, duration, name}] reference videos
  const [vidRefAuds, setVidRefAuds] = useState([]);  // [{url, name}] reference audio
  const [vidFrames, setVidFrames] = useState([]);    // File[] keyframes (Kling 4.0: up to 10)
  const [vidRefUploadingN, setVidRefUploadingN] = useState(0);
  const [jutsuMode, setJutsuMode] = useState("motion"); // motion | swap
  const [jutsuVideo, setJutsuVideo] = useState(null);   // {url, preview, duration, name}
  const [jutsuImages, setJutsuImages] = useState([]);   // File[]
  const [jutsuRes, setJutsuRes] = useState("480p");
  const [jutsuPromptOn, setJutsuPromptOn] = useState(true);
  const maxRealism = imgModelId === "gpt2"; // legacy flag kept for older code paths
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

  // Wavespeed Img (Seedream 4.5 Edit)
  const [wsImgPrompt, setWsImgPrompt] = useState("");
  const [wsImgImages, setWsImgImages] = useState([]);
  const [wsImgSize, setWsImgSize] = useState("2048*2048");
  const [wsImgUploading, setWsImgUploading] = useState(false);
  const [wsImgError, setWsImgError] = useState(null);

  // Wavespeed Vid (WAN 2.6 I2V Pro)
  const [wsVidPrompt, setWsVidPrompt] = useState("");
  const [wsVidImage, setWsVidImage] = useState(null);
  const [wsVidDuration, setWsVidDuration] = useState(5);
  const [wsVidRes, setWsVidRes] = useState("1080p");
  const [wsVidUploading, setWsVidUploading] = useState(false);
  const [wsVidError, setWsVidError] = useState(null);
  // ── VID_EDIT (Cambio de Personaje) states ──────────────────────────────────
  const [vidEditPrompt, setVidEditPrompt] = useState("");
  const [vidEditVideo, setVidEditVideo] = useState(null);   // { url, preview, name }
  const [vidEditImages, setVidEditImages] = useState([]);   // [{ url, preview }]
  const [vidEditDuration, setVidEditDuration] = useState(10);
  const [vidEditRes, setVidEditRes] = useState("720p");
  const [vidEditVidUploading, setVidEditVidUploading] = useState(false);
  const [vidEditImgUploading, setVidEditImgUploading] = useState(false);
  const [vidEditError, setVidEditError] = useState(null);
  const [showTopUpMenu, setShowTopUpMenu] = useState(false);
  const [genning, setGenning] = useState(false);
  const [activeJobs, setActiveJobs] = useState([]); // concurrent IMG/VID jobs: {id, type}
  const [genBtnLocked, setGenBtnLocked] = useState(false); // prevents double-click for 5s after submit
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
  const [openFaqIdx, setOpenFaqIdx] = useState(null); // FAQ accordion for landing page
  const [billingAnnual, setBillingAnnual] = useState(Object.values(PRICES).some(p => p.annualLink));
  const [planFaqIdx, setPlanFaqIdx] = useState(null); // FAQ accordion for plans page
  const [cancelModal, setCancelModal] = useState(false);
  const [showTyC, setShowTyC] = useState(false);
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [txHistory, setTxHistory] = useState(null);

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

  // Close top-up menu on outside click (setTimeout avoids same-event close)
  useEffect(() => {
    if (!showTopUpMenu) return;
    let timer;
    const close = () => setShowTopUpMenu(false);
    timer = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", close); };
  }, [showTopUpMenu]);

  // Auto-redirect logged-in users away from landing page — only if not mid-load
  useEffect(() => {
    if (page === P.LAND && session && !loadingProfile) setPage(P.DASH);
  }, [page, session, loadingProfile]);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);

    // ── Implicit flow: #access_token (Mac/iOS/most browsers) ──
    if (hash && hash.includes("access_token")) {
      const hp = new URLSearchParams(hash.substring(1));
      const token = hp.get("access_token");
      if (token) {
        const s = { access_token: token, refresh_token: hp.get("refresh_token") };
        try { sessionStorage.setItem("hrs_s", JSON.stringify(s)); } catch {}
        setSession(s); loadProfile(s);
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
    }

    // ── PKCE flow: ?code= — should not happen since we force implicit flow
    // But handle gracefully if it does (e.g. Supabase dashboard forces PKCE)
    const oauthCode = params.get("code");
    if (oauthCode && !params.get("payment") && !params.get("pack")) {
      window.history.replaceState(null, "", window.location.pathname);
      (async () => {
        try {
          const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=pkce`, {
            method: "POST",
            headers: { apikey: SB_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ auth_code: oauthCode }),
          });
          const data = await res.json();
          if (data?.access_token) {
            const s = { access_token: data.access_token, refresh_token: data.refresh_token };
            try { sessionStorage.setItem("hrs_s", JSON.stringify(s)); } catch {}
            setSession(s);
            await loadProfile(s);
            return;
          }
        } catch (e) { console.error("Code exchange error:", e.message); }
        // Exchange failed — redirect back to landing so user can retry
        setLoadingProfile(false);
        setPage(P.LAND);
      })();
      return;
    }
    if (params.get("payment") === "success") {
      const planFromUrl = params.get("plan");
      setPayMsg("¡Pago recibido! Activando tu plan...");
      window.history.replaceState(null, "", window.location.pathname);
      const saved = (() => { try { return JSON.parse(sessionStorage.getItem("hrs_s") || "null"); } catch { return null; } })();
      if (!saved?.access_token) {
        // No session — user needs to log in first, then the webhook will have activated their plan
        setPayMsg("✓ Pago recibido — iniciá sesión para ver tu plan activo");
        setPage(P.AUTH);
        return;
      }
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
              const label = `+${packAmount * (packType === "images" ? IMG_UNIT : VID_UNIT)} créditos`;
              await loadProfile(saved);
              setPayMsg(`✓ ${label} agregados a tu cuenta`);
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
    setLoadingProfile(true);
    try {
      const u = await sb.getUser(s.access_token);
      if (!u?.id) { setPage(P.DASH); setLoadingProfile(false); return; }

      const p = await sb.getProfile(u.id, s.access_token);

      if (!p) {
        setPage(P.PLANS);
        setLoadingProfile(false);
        return;
      }

      setProfile({ ...p, userId: u.id });

      const g = await sb.getGens(u.id, s.access_token);
      if (Array.isArray(g)) {
        const mapped = g.map(gen => ({ ...gen, url: gen.result_url && !gen.result_url.includes("|") ? gen.result_url : gen.url }));
        setGens(mapped);
        setVisibleCount(20);

        // ── Clean up stale processing gens (> 6 hours old with no result) ──
        const STALE_AGE = 6 * 60 * 60 * 1000;
        const stale = g.filter(gen =>
          gen.status === "processing" &&
          gen.result_url?.includes("|") &&
          (Date.now() - new Date(gen.created_at).getTime()) > STALE_AGE
        );
        if (stale.length > 0) {
          console.log(`Cleaning up ${stale.length} stale processing gen(s)`);
          for (const gen of stale) {
            try {
              await fetch(`${SB_URL}/rest/v1/generations?id=eq.${gen.id}`, {
                method: "PATCH",
                headers: { ...hdr(s.access_token), Prefer: "return=minimal" },
                body: JSON.stringify({ status: "failed" }),
              });
            } catch {}
          }
          setGens(prev => prev.map(gen =>
            stale.find(s => s.id === gen.id) ? { ...gen, status: "failed" } : gen
          ).filter(gen => gen.status !== "dismissed"));
        }

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
                if (p2) setProfile(prev => ({ ...prev, credits: p2.credits, videos_remaining: p2.videos_remaining, images_remaining: p2.images_remaining }));
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
    } finally {
      setLoadingProfile(false);
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
  const [showConcurrentUpgrade, setShowConcurrentUpgrade] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [favorites, setFavorites] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // generation waiting for delete confirmation
  const [deleting, setDeleting] = useState(false);
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
    const btns = document.querySelectorAll("[data-download-btn]");
    btns.forEach(b => { b.textContent = "⏳"; b.disabled = true; });
    const done = () => btns.forEach(b => { b.textContent = "↓ " + (lang === "en" ? "Download" : "Descargar"); b.disabled = false; });

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    try {
      // Try backend proxy first — get blob
      const proxyRes = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, filename, user_token: session?.access_token }),
      });

      if (proxyRes.ok) {
        const blob = await proxyRes.blob();

        // iOS: use navigator.share with File — triggers "Save to Photos" banner
        if (isIOS && navigator.share && navigator.canShare) {
          const ext = filename?.split(".").pop() || (blob.type.includes("video") ? "mp4" : "png");
          const mimeType = blob.type || (ext === "mp4" ? "video/mp4" : "image/png");
          const file = new File([blob], filename || `nanobanano-${Date.now()}.${ext}`, { type: mimeType });
          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: "NanoBanano Studio" });
              done();
              return;
            } catch(shareErr) {
              if (shareErr.name !== "AbortError") console.warn("Share failed:", shareErr.message);
              // Fall through to blob download if share fails/aborted
            }
          }
        }

        // Desktop / Android: standard blob download
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
      console.warn("Proxy download failed:", e.message);
    }

    try {
      const directRes = await fetch(url, { mode: "cors" });
      if (directRes.ok) {
        const blob = await directRes.blob();
        if (isIOS && navigator.share && navigator.canShare) {
          const ext = filename?.split(".").pop() || "png";
          const file = new File([blob], filename || `nanobanano-${Date.now()}.${ext}`, { type: blob.type });
          if (navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: "NanoBanano Studio" }); done(); return; } catch {}
          }
        }
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

    // Last resort
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
  // Upload a video straight to Supabase Storage (motion-refs bucket) and return a 1h signed URL
  const uploadVideoToStorage = async (file) => {
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const uid = session?.user?.id || profile?.userId || profile?.id;
    if (!uid) throw new Error("Not authenticated");
    const MAX_VID_MB = 50; // Supabase storage limit per file
    if (file.size > MAX_VID_MB * 1024 * 1024) throw new Error(lang === "es" ? `El archivo pesa ${Math.round(file.size / 1048576)}MB. Máximo ${MAX_VID_MB}MB — expórtalo en 720p/1080p o recórtalo.` : `File is ${Math.round(file.size / 1048576)}MB. Max ${MAX_VID_MB}MB — export at 720p/1080p or trim it.`);
    const safeExt = ext === "mov" || ext === "qt" ? "mov" : ext === "webm" ? "webm" : ext === "m4v" ? "m4v" : ext.match(/^(mp3|wav|m4a|aac|ogg)$/) ? ext : "mp4";
    const ctype = file.type || (safeExt === "mov" ? "video/quicktime" : safeExt === "webm" ? "video/webm" : "video/mp4");
    const path = `${uid}/${Date.now()}.${safeExt}`;
    const up = await fetch(`${SB_URL}/storage/v1/object/motion-refs/${path}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": ctype, "x-upsert": "true" },
      body: file,
    });
    if (!up.ok) {
      const body = await up.text().catch(() => "");
      let msg = body; try { const j = JSON.parse(body); msg = j.message || j.error || body; } catch {}
      console.error("Storage upload failed", up.status, body);
      if (/mime|content.?type/i.test(msg)) throw new Error(lang === "es" ? `Formato no permitido (${ctype}). Usa MP4 o MOV.` : `Format not allowed (${ctype}). Use MP4 or MOV.`);
      if (/size|large|exceed/i.test(msg)) throw new Error(lang === "es" ? `Archivo demasiado pesado (${Math.round(file.size / 1048576)}MB).` : `File too large (${Math.round(file.size / 1048576)}MB).`);
      throw new Error(`Upload error ${up.status}${msg ? `: ${String(msg).slice(0, 120)}` : ""}`);
    }
    const sign = await fetch(`${SB_URL}/storage/v1/object/sign/motion-refs/${path}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    const d = await sign.json();
    if (!d.signedURL) throw new Error("Could not get signed URL");
    return `${SB_URL}/storage/v1${d.signedURL}`;
  };

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
    const J = tab === T.VID_EDIT; // NanoJutsu reuses the video pipeline
    if ((!J && !prompt.trim() && !NO_PROMPT_STYLES.includes(style)) || !profile || !session) return;
    const isVid = tab === T.VID || J;
    const vM = findVideoModel((J ? "nanojutsu" : vidModelId)), iM = findImageModel(imgModelId);
    const vMd = pickMode(vM, (J ? jutsuMode : vidMode));
    const vModeNow = vMd.id;
    const vMulti = isVid && vModeNow === "frames" && (vMd.frames || 0) > 2;
    const vStart = vMulti ? vidFrames[0] : startFrame;
    const vEnd = vMulti ? (vidFrames.length > 1 ? vidFrames[vidFrames.length - 1] : null) : (vMd.endFrame ? endFrame : null);
    const vMiddle = vMulti ? vidFrames.slice(1, -1) : [];
    const vInSec = (vMd.source ? ((J ? jutsuVideo : vidRefVideo)?.duration || 0) : 0) + (vModeNow === "refs" ? vidRefVids.reduce((a, v) => a + (v.duration || 0), 0) : 0);
    const creditCostNow = isVid ? videoCredits(vM, vidDur, (J ? jutsuRes : vidRes), vInSec, vModeNow, { nImages: (J ? jutsuImages : vidOmniImages).length, nAudios: vidRefAuds.length }) : imageCredits(iM, imgQuality, refImages.length > 0 && iM.maxRefs > 0, { nRefs: Math.min(refImages.length, iM.maxRefs || 0), style });
    if (isVid && vMd.source && !(J ? jutsuVideo : vidRefVideo)?.url) { setGenError(lang === "es" ? "Sube el video primero." : "Upload the video first."); return; }
    if (isVid && vModeNow === "refs" && (J ? jutsuImages : vidOmniImages).length + vidRefVids.length === 0) { setGenError(lang === "es" ? "Añade al menos una imagen o video de referencia." : "Add at least one image or video reference."); return; }
    if (isVid && vModeNow === "frames" && (vMd.needsImage || vM.res[pickRes(vM, (J ? jutsuRes : vidRes))]?.needsImage) && !vStart) { setGenError(lang === "es" ? `${vM.name} necesita un fotograma inicial.` : `${vM.name} needs a start frame.`); return; }
    if (isVid && vidRefUploadingN > 0) { setGenError(lang === "es" ? "Espera a que terminen de subir los archivos." : "Wait for uploads to finish."); return; }
    if ((profile.credits ?? 0) < creditCostNow) return;

    // Restore & colorize require at least 1 reference image
    if (!isVid && NO_PROMPT_STYLES.includes(style) && refImages.length === 0) {
      setGenError(lang === "es"
        ? `⚠️ El modo "${style === "restore" ? "Restaurar" : style === "idsheet" ? "ID Sheet" : "Colorear"}" requiere subir al menos 1 imagen de referencia.`
        : `⚠️ "${style === "restore" ? "Restore" : style === "idsheet" ? "ID Sheet" : "Coloring Page"}" mode requires at least 1 reference image.`
      );
      return;
    }
    // Block if payment failed
    if (profile.subscription_status === "payment_failed") {
      setPaymentFailedModal(true);
      return;
    }
    // Concurrent generation limit
    const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 3, creator: 4 };
    const concurrentLimit = CONCURRENT_LIMITS[profile.plan] || 1;
    const pendingCount = activeJobs.length;
    if (pendingCount >= concurrentLimit) {
      setGenError(lang === "es"
        ? `⏳ Tenés ${pendingCount} generación${pendingCount > 1 ? "es" : ""} en curso. Tu plan ${profile.plan} permite máx ${concurrentLimit} simultánea${concurrentLimit > 1 ? "s" : ""}. Esperá que terminen.`
        : `⏳ You have ${pendingCount} generation${pendingCount > 1 ? "s" : ""} in progress. Your ${profile.plan} plan allows max ${concurrentLimit} simultaneous. Wait for them to finish.`
      );
      setShowConcurrentUpgrade(true);
      return;
    }
    setShowConcurrentUpgrade(false);
    const jobId = Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    setActiveJobs(j => [...j, { id: jobId, type: isVid ? "video" : "image", prompt: prompt.trim() }]);
    const endJob = () => setActiveJobs(j => j.filter(x => x.id !== jobId));
    setGenBtnLocked(true);
    setTimeout(() => setGenBtnLocked(false), 1500); // short debounce against double-clicks
    setGenResult(null);
    setGenError("");
    setGenStatus({ phase: "queued", position: null, elapsed: 0 });

    try {
      // Upload reference images via server
      let imageUrls = [];
      if (!isVid && refImages.length > 0) {
        try {
          for (const file of refImages.slice(0, findImageModel(imgModelId).maxRefs || 0)) {
            const url = await uploadFile(file);
            imageUrls.push(url);
          }
        } catch (uploadErr) {
          setGenError(lang === "en"
            ? `Error uploading reference image: ${uploadErr.message}. Max ${MAX_FILE_MB}MB per image (jpg, png, webp).`
            : `Error al subir imagen de referencia: ${uploadErr.message}. Máx ${MAX_FILE_MB}MB por imagen (jpg, png, webp).`);
          endJob();
          return;
        }
      }

      // Upload video frames via server
      let startFrameUrl = null;
      let endFrameUrl = null;
      const middleFrameUrls = [];
      try {
        if (isVid && vModeNow === "frames" && vStart) startFrameUrl = await uploadFile(vStart);
        if (isVid && vModeNow === "frames" && vEnd) endFrameUrl = await uploadFile(vEnd);
        if (isVid && vModeNow === "frames") { for (const f of vMiddle) middleFrameUrls.push(await uploadFile(f)); }
        if (isVid && (vModeNow === "refs" || vModeNow === "edit" || vMd.outFromSource)) { for (const f of (J ? jutsuImages : vidOmniImages).slice(0, vMd.images || 0)) imageUrls.push(await uploadFile(f)); }
      } catch (uploadErr) {
        setGenError("Error al subir frame. Intenta con una imagen más pequeña.");
        endJob();
        return;
      }

      // Step 1: Submit request (returns immediately with request_id)
      const submitRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: isVid ? "video" : "image",
          prompt: buildStyledPrompt(prompt, tab === T.IMG ? style : "cinematic"),
          user_prompt: J ? (jutsuPromptOn ? prompt.trim() : "") : prompt.trim(), // raw user input — saved to DB, never sent to fal.ai
          style_id: tab === T.IMG ? style : "cinematic",
          char_height: tab === T.IMG && style === "idsheet" ? (Number(charHeight) || 170) : undefined,
          aspect_ratio: isVid ? vidRatio : ratio,
          image_quality: !isVid ? imgQuality : undefined,
          max_realism: !isVid ? maxRealism : undefined,
          model_id: isVid ? (J ? "nanojutsu" : vidModelId) : imgModelId,
          video_url: isVid && vMd.source ? (J ? jutsuVideo : vidRefVideo)?.url : undefined,
          video_urls: isVid && vModeNow === "refs" && vidRefVids.length ? vidRefVids.map(v => v.url) : undefined,
          audio_urls: isVid && vModeNow === "refs" && vidRefAuds.length ? vidRefAuds.map(a => a.url) : undefined,
          middle_frames: isVid && middleFrameUrls.length ? middleFrameUrls : undefined,
          resolution: isVid ? pickRes(vM, (J ? jutsuRes : vidRes)) : undefined,
          mode: isVid ? vModeNow : undefined,
          plan: profile.plan || "basic",
          duration: isVid ? vidDur : undefined,
          audio: isVid ? audioOn : undefined,
          image_urls: imageUrls.length > 0 ? imageUrls : undefined,
          start_frame: isVid ? startFrameUrl : undefined,
          end_frame: isVid ? endFrameUrl : undefined,
          multishot: isVid ? multishot : undefined,
          user_token: session.access_token,
        }),
      });

      const submitData = await submitRes.json();

      // If direct result (rare)
      if (submitData.completed && submitData.url) {
        endJob();
        await saveGenResult(isVid, submitData);
        return;
      }

      if (!submitData.success || !submitData.request_id) {
        setGenError(submitData.error || "Error al enviar solicitud.");
        endJob();
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
          endJob();
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
            endJob();
            await saveGenResult(isVid, { ...submitData, url: statusData.url });
            return;
          }

          if (statusData.status === "FAILED") { // with error refresh
            setGenError(statusData.error || "La generación falló. Intenta con otro prompt.");
            setTimeout(reloadGens, 1200);
            endJob();
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
      endJob();
      setGenBtnLocked(false);
    }
  };

  // Reload generations + credits from DB (used after failures so the failed tile and refund show up)
  const reloadGens = async () => {
    try {
      const u = await sb.getUser(session.access_token);
      if (!u?.id) return;
      const [p, g] = await Promise.all([sb.getProfile(u.id, session.access_token), sb.getGens(u.id, session.access_token)]);
      if (p) setProfile(prev => ({ ...prev, credits: p.credits }));
      if (Array.isArray(g)) setGens(g.map(gen => ({ ...gen, url: gen.result_url && !gen.result_url.includes("|") ? gen.result_url : gen.url })));
    } catch {}
  };
  useEffect(() => { setUiPop(null); }, [tab]);
  useEffect(() => { const st = STYLES.find(x => x.id === style); if (st?.onlyModel && st.onlyModel !== imgModelId) setStyle("neutral"); }, [imgModelId]); // eslint-disable-line
  // v23: the right-hand feed also serves Motion/Director/Img Pro/Vid Pro → refresh it when those start/finish
  useEffect(() => { if (!session || ![T.MOT, T.DIR, T.WS_IMG, T.WS_VID].includes(tab)) return; const id = setTimeout(reloadGens, genning ? 2500 : 900); return () => clearTimeout(id); }, [genning, genResult]); // eslint-disable-line
  // Permanently delete a generation (DB row + our stored file + favorite)
  const deleteGenPermanent = async (g) => {
    if (!g?.id || !session) return false;
    setDeleting(true);
    try {
      const r = await fetch("/api/favorites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_generation", gen_id: g.id, user_token: session.access_token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setGenError(d.error || (lang === "es" ? "No se pudo eliminar." : "Could not delete.")); return false; }
      setGens(prev => prev.filter(x => x.id !== g.id));
      setFavorites(prev => { if (!prev[g.id]) return prev; const n = { ...prev }; delete n[g.id]; return n; });
      return true;
    } catch (e) { setGenError(e.message); return false; }
    finally { setDeleting(false); }
  };

  // Seedance 2.5 Draft → render the same take in 1080p (charged server-side from the saved duration)
  const handleDraftComplete = async (item) => {
    if (!session || !item?.id) return;
    const jobId = "draft_" + Date.now();
    setActiveJobs(j => [...j, { id: jobId, type: "video", prompt: "1080p · " + (item.prompt || "") }]);
    const endJob = () => setActiveJobs(j => j.filter(x => x.id !== jobId));
    setPreviewItem(null); setPreviewIndex(null);
    setGenError("");
    try {
      const r = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "video", model_id: item.model_id || "seedance25_draft", mode: "complete", gen_id: item.id, prompt: item.prompt || "draft", user_token: session.access_token }),
      });
      const d = await r.json();
      if (!d.success || !d.request_id) { setGenError(d.error || "Error"); endJob(); return; }
      let tries = 0;
      const poll = async () => {
        if (tries++ > 200) { endJob(); return; }
        try {
          const sr = await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request_id: d.request_id, endpoint: d.endpoint, type: "video", user_token: session.access_token, status_url: d.status_url, response_url: d.response_url }) });
          const sd = await sr.json();
          if (sd.status === "COMPLETED" && sd.url) { endJob(); playDoneSound(); await saveGenResult(true, { ...d, url: sd.url }); return; }
          if (sd.status === "FAILED") { endJob(); setGenError(sd.error || "Error"); setTimeout(reloadGens, 1200); return; }
        } catch {}
        setTimeout(poll, 4000);
      };
      setTimeout(poll, 4000);
    } catch (e) { setGenError(e.message); endJob(); }
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
        if (p) setProfile(prev => ({ ...prev, credits: p.credits, images_remaining: p.images_remaining, videos_remaining: p.videos_remaining }));
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
    try {
      if (profile?.subscription_end) {
        const d = new Date(profile.subscription_end);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { day: "numeric", month: "long", year: "numeric" });
      }
      const start = profile?.subscription_start || profile?.created_at;
      if (!start) return null;
      const d = new Date(start);
      if (isNaN(d.getTime())) return null;
      const now = new Date();
      let iters = 0;
      while (d < now && iters < 24) { d.setMonth(d.getMonth() + 1); iters++; }
      return d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { day: "numeric", month: "long", year: "numeric" });
    } catch { return null; }
  };

  const inp = { width: "100%", padding: "12px 14px", fontSize: 14, color: "#e0e0f0", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, fontFamily: "inherit" };
  const maxW = page === P.DASH ? (isDesk ? 900 : 520) : page === P.PLANS ? (isDesk ? 1320 : 520) : (isDesk ? 1000 : 520);

  const wrap = (ch) => (
    <div style={{ minHeight: "100vh", background: "#06060e", color: "#e8e8ef", fontFamily: "'Syne', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 20% 0%, rgba(0,240,255,.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(180,74,255,.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(255,107,43,.03) 0%, transparent 50%)" }} />
      <div style={{ maxWidth: maxW, margin: "0 auto", padding: isDesk ? "32px 40px 80px" : "20px 16px 60px", position: "relative", zIndex: 1 }}>
        {payMsg && <div style={{ padding: "10px 14px", marginBottom: 14, borderRadius: 8, background: payMsg.includes("✓") ? "rgba(0,240,255,.08)" : "rgba(255,184,0,.08)", border: `1px solid ${payMsg.includes("✓") ? "rgba(0,240,255,.2)" : "rgba(255,184,0,.2)"}`, fontSize: 13, textAlign: "center", color: payMsg.includes("✓") ? "#00f0ff" : "#ffb800", animation: "fadeUp .4s ease" }}>{payMsg}</div>}
        {ch}
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes nudge{0%,70%,100%{transform:translateY(0)}75%{transform:translateY(-3px)}82%{transform:translateY(1px)}88%{transform:translateY(-2px)}95%{transform:translateY(0)}}*{box-sizing:border-box;margin:0}textarea::placeholder,input::placeholder{color:#3a3a50}button:active{transform:scale(.97)!important}input:focus,textarea:focus{outline:none;border-color:rgba(0,240,255,.3)!important}::selection{background:rgba(0,240,255,.2)}`}</style>
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
  const credTotal = PLANS.find(p => p.id === profile?.plan)?.credits || 0;
  const credRemain = profile?.credits ?? 0;
  const credPct = credTotal > 0 ? Math.min(100, Math.round((credRemain / credTotal) * 100)) : 0;
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
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#8a8a9e" }}>⚡ {lang === "es" ? "Créditos" : "Credits"}</span>
                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#e8c23a" }}>{credRemain}<span style={{ color: "#3a3a50" }}>/{credTotal}</span></span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${credPct}%`, background: "linear-gradient(90deg, #e8d44d, #c8a800)", borderRadius: 3, transition: "width .4s ease" }} />
                </div>
                <p style={{ fontSize: 9, color: "#4a4a62", margin: "6px 0 0" }}>≈ {Math.floor(credRemain / IMG_UNIT)} {lang === "es" ? "imágenes" : "images"} · {Math.floor(credRemain / vidCost(5))} {lang === "es" ? "videos 5s" : "5s videos"}</p>
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
              <button onClick={() => { setUserPanelOpen(false); setShowTxHistory(true); }}
                style={{ display: "block", width: "100%", padding: "8px", fontSize: 11, fontWeight: 600, color: "#8a8aaa", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", marginBottom: 6, textAlign: "center" }}>
                📋 {lang === "es" ? "Historial de créditos" : "Credit history"}
              </button>
            )}
              <button onClick={() => { setUserPanelOpen(false); setPage(P.PLANS); }}
                style={{ display: "block", width: "100%", padding: "8px", fontSize: 11, fontWeight: 700, color: "#00ff88", background: "rgba(0,255,136,.08)", border: "1px solid rgba(0,255,136,.35)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", marginBottom: 6, textAlign: "center", boxShadow: "0 0 10px rgba(0,255,136,.2)", animation: "nudge 4s ease-in-out 3s infinite" }}>
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

  // ─── TX HISTORY MODAL ───
  const TxHistoryModal = () => {
    useEffect(() => {
      if (!showTxHistory || !session?.access_token || !session?.user?.id) return;
      if (txHistory !== null) return; // already loaded
      sb.getTxHistory(session.user.id, session.access_token)
        .then(data => setTxHistory(Array.isArray(data) ? data : []))
        .catch(() => setTxHistory([]));
    }, [showTxHistory]);

    if (!showTxHistory) return null;

    const typeLabel = (type) => {
      const map = {
        plan_activation: lang === "es" ? "🎉 Activación de plan" : "🎉 Plan activated",
        plan_upgrade: lang === "es" ? "⬆️ Upgrade de plan" : "⬆️ Plan upgrade",
        plan_renewal: lang === "es" ? "🔄 Renovación mensual" : "🔄 Monthly renewal",
        plan_downgrade_scheduled: lang === "es" ? "⬇️ Downgrade programado" : "⬇️ Downgrade scheduled",
        pack_purchase: lang === "es" ? "📦 Pack de créditos" : "📦 Credit pack",
        generation: lang === "es" ? "⚡ Generación" : "⚡ Generation",
        refund: lang === "es" ? "↩️ Reembolso" : "↩️ Refund",
        admin: lang === "es" ? "🔧 Ajuste admin" : "🔧 Admin adjustment",
      };
      return map[type] || type;
    };

    const deltaColor = (d) => d > 0 ? "#00ff88" : d < 0 ? "#ff4d6a" : "#5a5a70";
    const fmt = (d) => d > 0 ? `+${d}` : `${d}`;
    const fmtDate = (iso) => {
      const d = new Date(iso);
      return d.toLocaleDateString(lang === "es" ? "es-AR" : "en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    return (
      <div onClick={() => setShowTxHistory(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0", backdropFilter: "blur(8px)" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "#0e0e1a", border: "1px solid rgba(255,255,255,.1)", borderRadius: "20px 20px 0 0", padding: "0 0 24px", maxHeight: "85vh", display: "flex", flexDirection: "column", animation: "slideUp .3s ease" }}>
          {/* Header */}
          <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, margin: "0 0 2px", color: "#e0e0f0" }}>📋 {lang === "es" ? "Historial de créditos" : "Credit history"}</p>
              <p style={{ fontSize: 10, color: "#5a5a70", margin: 0 }}>{lang === "es" ? "Últimas 100 transacciones" : "Last 100 transactions"}</p>
            </div>
            <button onClick={() => setShowTxHistory(false)} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,.06)", border: "none", color: "#8a8aaa", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
          {/* Content */}
          <div style={{ overflowY: "auto", flex: 1, padding: "12px 20px" }}>
            {txHistory === null ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#5a5a70", fontSize: 12 }}>
                <div style={{ width: 20, height: 20, border: "2px solid rgba(0,240,255,.2)", borderTop: "2px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 12px" }} />
                {lang === "es" ? "Cargando..." : "Loading..."}
              </div>
            ) : txHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#5a5a70", fontSize: 12 }}>
                {lang === "es" ? "No hay transacciones registradas aún." : "No transactions recorded yet."}
                <p style={{ fontSize: 10, marginTop: 8, color: "#3a3a50" }}>{lang === "es" ? "Las nuevas transacciones se registrarán desde ahora." : "New transactions will be recorded from now on."}</p>
              </div>
            ) : (
              txHistory.map((tx, i) => (
                <div key={tx.id || i} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#c0c0d8", margin: "0 0 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{typeLabel(tx.type)}</p>
                    <p style={{ fontSize: 10, color: "#5a5a70", margin: "0 0 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.description || "—"}</p>
                    <p style={{ fontSize: 9, color: "#3a3a50", margin: 0 }}>{fmtDate(tx.created_at)}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {tx.images_delta !== 0 && (
                      <p style={{ fontSize: 11, fontWeight: 700, color: deltaColor(tx.images_delta), margin: "0 0 2px", fontFamily: "'JetBrains Mono',monospace" }}>
                        🖼️ {fmt(tx.images_delta)}
                        {tx.images_after !== null && tx.images_after !== undefined && <span style={{ color: "#3a3a50", fontSize: 9, fontWeight: 400 }}> → {tx.images_after}</span>}
                      </p>
                    )}
                    {tx.videos_delta !== 0 && (
                      <p style={{ fontSize: 11, fontWeight: 700, color: deltaColor(tx.videos_delta), margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>
                        🎬 {fmt(tx.videos_delta)}
                        {tx.videos_after !== null && tx.videos_after !== undefined && <span style={{ color: "#3a3a50", fontSize: 9, fontWeight: 400 }}> → {tx.videos_after}</span>}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

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

      {/* ── FAQ Section ── */}
      {(() => {
        const faqs = lang === "es" ? [
          { q: "¿Necesito experiencia en diseño o IA para usar NanoBanano Studio?", a: "Para nada. Solo describís lo que querés en español, elegís el estilo y hacés clic en generar. La plataforma hace todo el trabajo técnico. En segundos tenés una imagen o video profesional listo para usar." },
          { q: "¿Puedo cancelar mi suscripción en cualquier momento?", a: "Sí, sin condiciones ni penalizaciones. Cancelás desde tu panel cuando quieras y seguís teniendo acceso hasta que venza tu período actual. No se cobran períodos adicionales." },
          { q: "¿Qué pasa si se me acaban los créditos antes de fin de mes?", a: "Podés comprar packs de créditos adicionales sin cambiar tu plan (disponible para planes Básico, Pro y Creador). Los créditos extras no vencen con el mes — se mantienen hasta que los uses." },
          { q: "¿Las imágenes y videos que genero son míos? ¿Puedo usarlos comercialmente?", a: "Sí. Todo el contenido que generás con NanoBanano Studio te pertenece y podés usarlo con fines comerciales — para redes sociales, anuncios, productos, clientes, lo que necesités." },
          { q: "¿Cómo restauro fotos antiguas con IA?", a: "En NanoBanano Studio seleccionás el estilo 'Restaurar', subís tu foto antigua y la IA la restaura automáticamente preservando los rasgos originales con calidad hasta 4K." },
          { q: "¿Cuánto tarda en generarse un video?", a: "Las imágenes tardan entre 15 segundos y 1 minuto. Los videos pueden tardar entre 3 y 10 minutos. Podés cerrar la app y el video se guarda automáticamente cuando termina — lo encontrás en tu biblioteca al volver." },
          { q: "¿Cuál es la diferencia entre Imagen, Video, Motion y Director?", a: "Imagen genera fotos con IA. Video genera clips cinematográficos desde texto. Motion Control anima una imagen usando un video de referencia de movimiento. Director es el modo más avanzado — hasta 9 imágenes de referencia, audio y control total de escena con Seedance 2.0." },
        ] : [
          { q: "Do I need design or AI experience to use NanoBanano Studio?", a: "Not at all. Just describe what you want in plain language, choose a style, and hit generate. The platform handles all the technical work. In seconds you have a professional image or video ready to use." },
          { q: "Can I cancel my subscription at any time?", a: "Yes, with no conditions or penalties. Cancel from your dashboard at any time and keep access until your current period ends. No additional charges." },
          { q: "What happens if I run out of credits before the end of the month?", a: "You can buy additional credit packs without changing your plan (available for Basic, Pro, and Creator plans). Extra credits don't expire at month end — they stay until you use them." },
          { q: "Do I own the images and videos I generate? Can I use them commercially?", a: "Yes. All content you generate with NanoBanano Studio belongs to you and can be used commercially — for social media, ads, products, clients, whatever you need." },
          { q: "How do I restore old photos with AI?", a: "In NanoBanano Studio select the 'Restore' style, upload your old photo and the AI restores it automatically preserving original features with up to 4K quality." },
          { q: "How long does it take to generate a video?", a: "Images take 15 seconds to 1 minute. Videos can take 3 to 10 minutes. You can close the app and the video saves automatically when done — find it in your library when you return." },
          { q: "What's the difference between Image, Video, Motion, and Director modes?", a: "Image generates AI photos. Video generates cinematic clips from text. Motion Control animates an existing image using a reference motion video. Director is the most advanced — up to 9 reference images, audio, and full scene control with Seedance 2.0." },
        ];
        return (
          <div style={{ maxWidth: isDesk ? 720 : "100%", margin: "40px auto 16px", padding: isDesk ? "0" : "0 4px" }}>
            <h2 style={{ fontSize: isDesk ? 22 : 18, fontWeight: 800, color: "#e0e0f0", marginBottom: 20, textAlign: "center" }}>
              {lang === "es" ? "Preguntas frecuentes" : "Frequently asked questions"}
            </h2>
            {faqs.map((faq, i) => (
              <div key={i} style={{ marginBottom: 8, borderRadius: 10, border: `1px solid ${openFaqIdx === i ? "rgba(0,240,255,.2)" : "rgba(255,255,255,.06)"}`, background: openFaqIdx === i ? "rgba(0,240,255,.03)" : "rgba(255,255,255,.02)", overflow: "hidden", transition: "border-color .2s" }}>
                <button onClick={() => setOpenFaqIdx(openFaqIdx === i ? null : i)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", gap: 12 }}>
                  <span style={{ fontSize: isDesk ? 13 : 12, fontWeight: 600, color: "#e0e0f0", lineHeight: 1.4 }}>{faq.q}</span>
                  <span style={{ fontSize: 18, color: "#00f0ff", flexShrink: 0, transition: "transform .25s", transform: openFaqIdx === i ? "rotate(45deg)" : "rotate(0deg)", display: "inline-block" }}>+</span>
                </button>
                {openFaqIdx === i && (
                  <div style={{ padding: "0 16px 14px", animation: "fadeUp .2s ease" }}>
                    <p style={{ fontSize: isDesk ? 12 : 11, color: "#6a6a80", margin: 0, lineHeight: 1.65 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <Footer />
      <TxHistoryModal />
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
    openCheckout(planId, profile?.email);
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
      {/* ── Billing toggle (Promptwise-style) ── */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
        <div style={{ display: "inline-flex", padding: 4, borderRadius: 999, background: "#15151c", border: "1px solid rgba(255,255,255,.08)" }}>
          {[[false, lang === "es" ? "Mensual" : "Monthly"], [true, lang === "es" ? "Anual" : "Yearly"]].map(([v, l]) => (
            <button key={l} onClick={() => setBillingAnnual(v)} style={{ padding: "9px 22px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: billingAnnual === v ? "#0a0a0f" : "#8a8a9e", background: billingAnnual === v ? "#f2f2f2" : "transparent", display: "flex", alignItems: "center", gap: 8, transition: "all .2s" }}>
              {l}{v && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#e8f542", color: "#0a0a0f" }}>-20%</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isDesk ? "repeat(4, 1fr)" : "1fr", gap: isDesk ? 18 : 16, marginBottom: 56 }}>
        {PLANS.map(pl => {
          const theme = {
            test:    { band: "#d9d9d9", bandText: "#1a1a1a", bg: "#ffffff", ring: "#e5e5e5", dot: "#ffffff" },
            basic:   { band: "#d9d9d9", bandText: "#1a1a1a", bg: "#ffffff", ring: "#e5e5e5", dot: "#ffffff" },
            pro:     { band: "#eef55a", bandText: "#1a1a1a", bg: "linear-gradient(180deg,#f4fa7a 0%,#fbfdd6 35%,#ffffff 70%)", ring: "#eef55a", dot: "#eef55a" },
            creator: { band: "#ef7a45", bandText: "#1a1a1a", bg: "linear-gradient(180deg,#f59a6e 0%,#fde3d6 35%,#ffffff 70%)", ring: "#ef7a45", dot: "#ef7a45" },
          }[pl.id];
          const monthly = pl.price;
          const annualMo = ANNUAL[pl.id];
          const shown = billingAnnual ? annualMo : monthly;
          const saveYear = Math.round(monthly * 12 - annualMo * 12);
          const offPct = billingAnnual ? Math.round((1 - annualMo / pl.oldPrice) * 100) : Math.round((1 - monthly / pl.oldPrice) * 100);
          const isCurrent = profile?.plan === pl.id;
          const annualReady = !!PRICES[pl.id]?.annualLink;
          const canBuy = !billingAnnual || annualReady;
          const vidDur = pl.maxDuration.length > 1 ? `${pl.maxDuration[0]}-${pl.maxDuration[pl.maxDuration.length - 1]}s` : `${pl.maxDuration[0]}s`;
          const cta = isCurrent && !billingAnnual ? (lang === "es" ? "Tu plan actual" : "Current plan")
            : !canBuy ? (lang === "es" ? "Anual disponible pronto" : "Yearly coming soon")
            : billingAnnual && isCurrent ? (lang === "es" ? "Cambiar a anual" : "Switch to yearly")
            : pl.id === "test" ? (lang === "es" ? `Empezar ${pl.name}` : `Start ${pl.nameEn}`) : (lang === "es" ? "Mejorar ahora" : "Upgrade now");
          const fmt = n => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
          return (
            <div key={pl.id} style={{ borderRadius: 28, overflow: "hidden", background: theme.band, display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif" }}>
              {/* Top band */}
              <div style={{ padding: "11px 12px 10px", textAlign: "center", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: theme.bandText }}>
                {billingAnnual
                  ? <>{lang === "es" ? "Ahorras " : "Save "}<b>${saveYear}</b>{lang === "es" ? " vs mensual" : " compared to monthly"}</>
                  : <>{lang === "es" ? "Cambia a anual y ahorra " : "Switch to yearly to save "}<b>${saveYear}</b></>}
              </div>
              {/* Card body */}
              <div style={{ flex: 1, background: theme.bg, borderRadius: "26px 26px 26px 26px", padding: isDesk ? "26px 22px 22px" : "24px 20px 20px", color: "#111", display: "flex", flexDirection: "column", border: pl.id === "pro" || pl.id === "creator" ? `2px solid ${theme.ring}` : "none", borderTop: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -.8 }}>{lang === "en" ? pl.nameEn : pl.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 7, background: "#111", color: "#fff", letterSpacing: .8 }}>{offPct}% OFF</span>
                  {pl.popular && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 7, border: "1.5px solid #111", letterSpacing: .8 }}>💎 {lang === "es" ? "MÁS POPULAR" : "MOST POPULAR"}</span>}
                  {pl.id === "creator" && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 7, border: "1.5px solid #c2410c", color: "#c2410c", letterSpacing: .8 }}>✦ {lang === "es" ? "MEJOR VALOR" : "BEST VALUE"}</span>}
                </div>
                <p style={{ fontSize: 13, color: "#333", margin: "8px 0 18px" }}>{PLAN_TAGLINE[pl.id][lang === "en" ? "en" : "es"]}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 22, color: "#999", textDecoration: "line-through", fontWeight: 500 }}>${Math.round(pl.oldPrice)}</span>
                  <span style={{ fontSize: isDesk ? 40 : 44, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(shown)}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>/{lang === "es" ? "mes" : "month"}</span>
                </div>
                <p style={{ fontSize: 12, color: "#333", margin: "6px 0 0", minHeight: 16 }}>
                  {billingAnnual && <><span style={{ textDecoration: "line-through", color: "#999" }}>${Math.round(monthly * 12)}</span> <b>{fmt(+(annualMo * 12).toFixed(2))}</b> {lang === "es" ? "facturado anualmente" : "billed annually"}</>}
                </p>

                {/* Credits box */}
                <div style={{ marginTop: 18, borderRadius: 20, overflow: "hidden", background: pl.id === "test" ? "transparent" : theme.band, border: pl.id === "test" ? "1px solid #e5e5e5" : "none" }}>
                  {pl.id !== "test" && (
                    <div style={{ padding: "8px 10px", textAlign: "center", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#1a1a1a" }}>
                      {lang === "es" ? `Imagen ${pl.resolution} · Videos hasta 30s` : `${pl.resolution} images · videos up to 30s`}
                    </div>
                  )}
                  <div style={{ background: "#fff", borderRadius: 18, padding: "26px 14px", textAlign: "center", minHeight: 130, display: "flex", flexDirection: "column", justifyContent: "center", border: pl.id === "test" ? "none" : `1px solid ${theme.ring}` }}>
                    <p style={{ fontSize: 19, fontWeight: 600, margin: "0 0 8px" }}>{pl.credits.toLocaleString("en-US")} {lang === "es" ? "créditos/mes" : "credits/mo."}</p>
                    <p style={{ fontSize: 12, color: "#555", margin: "0 0 4px" }}>= {Math.floor(pl.credits / IMG_UNIT)} {lang === "es" ? "imágenes Nano Banana 2" : "Nano Banana 2 images"}</p>
                    <p style={{ fontSize: 12, color: "#555", margin: 0 }}>= {Math.floor(pl.credits / vidCost(5))} {lang === "es" ? "videos Kling 3.0 (5s)" : "Kling 3.0 videos (5s)"}</p>
                  </div>
                </div>

                {/* Pill CTA */}
                <button disabled={!canBuy || (isCurrent && !billingAnnual)} onClick={() => openCheckout(pl.id, profile?.email || session?.user?.email, billingAnnual)}
                  style={{ marginTop: 20, width: "100%", height: 54, borderRadius: 999, background: "#111", border: "none", cursor: canBuy && !(isCurrent && !billingAnnual) ? "pointer" : "default", opacity: canBuy ? 1 : .55, display: "flex", alignItems: "center", padding: 4, fontFamily: "inherit" }}>
                  <span style={{ width: 62, height: 46, borderRadius: 999, background: theme.dot, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#111", flexShrink: 0 }}>➜</span>
                  <span style={{ flex: 1, color: "#fff", fontSize: 15, fontWeight: 500, paddingRight: 30 }}>{cta}</span>
                </button>

                {/* Features */}
                <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 11 }}>
                  {planFeatures(pl).map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#222", lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 700 }}>✓</span><span>{f}</span>
                    </div>
                  ))}
                </div>

                {/* Models (Promptwise-style) */}
                {(() => {
                  const rank = { test: 0, basic: 1, pro: 2, creator: 3 }[pl.id];
                  const models = [
                    { n: "Nano Banana 2", k: "img", min: 0 },
                    { n: "Nano Banana Pro", k: "img", min: 0 },
                    { n: "GPT Image 2", k: "img", min: 0 },
                    { n: "FLUX.2 Pro", k: "img", min: 0 },
                    { n: "Seedream 5.0", k: "img", min: 0 },
                    { n: "Kling 3.0 / Omni", k: "vid", min: 0 },
                    { n: "Kling 4.0", k: "vid", min: 0 },
                    { n: "Seedance 2.0", k: "vid", min: 0 },
                    { n: "Wan 2.6", k: "vid", min: 0 },
                    { n: "Kling Motion", k: "vid", min: 1 },
                    { n: "Director", k: "vid", min: 2 },
                  ];
                  const Bars = ({ c }) => (
                    <svg width="18" height="16" viewBox="0 0 18 16" style={{ flexShrink: 0 }}>
                      <rect x="1" y="5" width="3" height="10" rx="1" fill={c[0]} /><rect x="5.5" y="2" width="3" height="13" rx="1" fill={c[1]} />
                      <rect x="10" y="7" width="3" height="8" rx="1" fill={c[2]} /><rect x="14.5" y="3" width="3" height="12" rx="1" fill={c[3]} />
                    </svg>
                  );
                  return (
                    <div style={{ marginTop: "auto", paddingTop: 22 }}>
                      <div style={{ border: "1.5px solid #ddd", borderRadius: 14, padding: "12px 14px", background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
                        <Bars c={["#3b82f6", "#6366f1", "#22d3ee", "#3b82f6"]} />
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, whiteSpace: "nowrap" }}>Seedance 2.5</span>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: "5px 10px", borderRadius: 6, background: "#111", color: "#fff" }}>FULL ACCESS</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                        {models.map(m => {
                          const ok = rank >= m.min;
                          return (
                            <span key={m.n} title={ok ? "" : (lang === "es" ? (m.min === 1 ? "Desde plan Básico" : "Desde plan Pro") : (m.min === 1 ? "From Basic plan" : "From Pro plan"))}
                              style={{ fontSize: 11, fontWeight: 500, padding: "4px 9px", borderRadius: 999, border: `1px solid ${ok ? "#d4d4d4" : "#eee"}`, color: ok ? "#222" : "#aaa", background: ok ? "#fafafa" : "transparent", display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span style={{ width: 6, height: 6, borderRadius: 3, background: ok ? (m.k === "img" ? "#22c55e" : "#6366f1") : "#ccc" }} />
                              {m.n}{!ok && " 🔒"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FAQ Section ── */}
      {(() => {
        const faqs = lang === "es" ? [
          { q: "¿Necesito experiencia en diseño o IA para usar NanoBanano Studio?", a: "Para nada. Solo describís lo que querés en español, elegís el estilo y hacés clic en generar. La plataforma hace todo el trabajo técnico. En segundos tenés una imagen o video profesional listo para usar." },
          { q: "¿Puedo cancelar mi suscripción en cualquier momento?", a: "Sí, sin condiciones ni penalizaciones. Cancelás desde tu panel cuando quieras y seguís teniendo acceso hasta que venza tu período actual. No se cobran períodos adicionales." },
          { q: "¿Qué pasa si se me acaban los créditos antes de fin de mes?", a: "Podés comprar packs de créditos adicionales sin cambiar tu plan (disponible para planes Básico, Pro y Creador). Los créditos extras no vencen con el mes — se mantienen hasta que los uses." },
          { q: "¿Las imágenes y videos que genero son míos? ¿Puedo usarlos comercialmente?", a: "Sí. Todo el contenido que generás con NanoBanano Studio te pertenece y podés usarlo con fines comerciales — para redes sociales, anuncios, productos, clientes, lo que necesités." },
          { q: "¿Por qué el modelo rechaza algunas imágenes en modo Director?", a: "El modelo de IA tiene restricciones de privacidad y no procesa rostros de personas reales reconocibles. Para mejores resultados usá ilustraciones, personajes animados, productos o paisajes. Si la generación falla, los créditos se devuelven automáticamente." },
          { q: "¿Cuánto tarda en generarse un video?", a: "Las imágenes tardan entre 15 segundos y 1 minuto. Los videos pueden tardar entre 3 y 10 minutos. Podés cerrar la app y el video se guarda automáticamente cuando termina — lo encontrás en tu biblioteca al volver." },
          { q: "¿Cuál es la diferencia entre Imagen, Video, Motion y Director?", a: "Imagen genera fotos con IA. Video genera clips cinematográficos desde texto. Motion Control anima una imagen usando un video de referencia de movimiento. Director es el modo más avanzado — hasta 9 imágenes de referencia, audio y control total de escena con Seedance 2.0." },
        ] : [
          { q: "Do I need design or AI experience to use NanoBanano Studio?", a: "Not at all. Just describe what you want in plain language, choose a style, and hit generate. The platform handles all the technical work. In seconds you have a professional image or video ready to use." },
          { q: "Can I cancel my subscription at any time?", a: "Yes, with no conditions or penalties. Cancel from your dashboard at any time and keep access until your current period ends. No additional charges." },
          { q: "What happens if I run out of credits before the end of the month?", a: "You can buy additional credit packs without changing your plan (available for Basic, Pro, and Creator plans). Extra credits don't expire at month end — they stay until you use them." },
          { q: "Do I own the images and videos I generate? Can I use them commercially?", a: "Yes. All content you generate with NanoBanano Studio belongs to you and can be used commercially — for social media, ads, products, clients, whatever you need." },
          { q: "Why does the model reject some images in Director mode?", a: "The AI model has privacy restrictions and cannot process recognizable real people's faces. For best results use illustrations, animated characters, products, or landscapes. If a generation fails, credits are automatically refunded." },
          { q: "How long does it take to generate a video?", a: "Images take 15 seconds to 1 minute. Videos can take 3 to 10 minutes. You can close the app and the video saves automatically when done — find it in your library when you return." },
          { q: "What's the difference between Image, Video, Motion, and Director modes?", a: "Image generates AI photos. Video generates cinematic clips from text. Motion Control animates an existing image using a reference motion video. Director is the most advanced — up to 9 reference images, audio, and full scene control with Seedance 2.0." },
        ];

        const [openIdx, setOpenIdx] = [planFaqIdx, setPlanFaqIdx];

        return (
          <div style={{ maxWidth: isDesk ? 700 : "100%", margin: "0 auto 48px", padding: isDesk ? "0" : "0 4px" }}>
            <h3 style={{ fontSize: isDesk ? 20 : 17, fontWeight: 800, color: "#e0e0f0", marginBottom: 20, textAlign: "center" }}>
              {lang === "es" ? "Preguntas frecuentes" : "Frequently asked questions"}
            </h3>
            {faqs.map((faq, i) => (
              <div key={i} style={{ marginBottom: 8, borderRadius: 10, border: `1px solid ${openIdx === i ? "rgba(0,240,255,.2)" : "rgba(255,255,255,.06)"}`, background: openIdx === i ? "rgba(0,240,255,.03)" : "rgba(255,255,255,.02)", overflow: "hidden", transition: "border-color .2s" }}>
                <button onClick={() => setOpenIdx(openIdx === i ? null : i)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", gap: 12 }}>
                  <span style={{ fontSize: isDesk ? 13 : 12, fontWeight: 600, color: "#e0e0f0", lineHeight: 1.4 }}>{faq.q}</span>
                  <span style={{ fontSize: 18, color: "#00f0ff", flexShrink: 0, transition: "transform .25s", transform: openIdx === i ? "rotate(45deg)" : "rotate(0deg)", display: "inline-block" }}>+</span>
                </button>
                {openIdx === i && (
                  <div style={{ padding: "0 16px 14px", animation: "fadeUp .2s ease" }}>
                    <p style={{ fontSize: isDesk ? 12 : 11, color: "#6a6a80", margin: 0, lineHeight: 1.65 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <Footer />
      <TxHistoryModal />
      <CancelModal />
    </div>
  );
  const planData = PLANS.find(p => p.id === profile?.plan) || PLANS[0];
  const hasPlan = profile?.plan && profile.plan !== "none";

  // Loading guard — show spinner instead of black screen while profile loads
  if (loadingProfile || (!profile && session)) {
    return (
      <div style={{ minHeight: "100vh", background: "#06060e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ width: 36, height: 36, border: "3px solid rgba(0,240,255,.15)", borderTop: "3px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
        <p style={{ color: "#5a5a70", fontSize: 13, fontFamily: "sans-serif" }}>Cargando...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Model catalog (v16) ──
  const curVidModel = findVideoModel(vidModelId);
  const curImgModel = findImageModel(imgModelId);
  const curImgCost = imageCredits(curImgModel, imgQuality, refImages.length > 0 && curImgModel.maxRefs > 0, { nRefs: Math.min(refImages.length, curImgModel.maxRefs || 0), style });
  const curVidMd = pickMode(curVidModel, vidMode);
  const curVidMode = curVidMd.id;
  const curVidRes = pickRes(curVidModel, vidRes);
  const curVidMulti = curVidMode === "frames" && (curVidMd.frames || 0) > 2;
  const curVidInSec = (curVidMd.source ? (vidRefVideo?.duration || 0) : 0) + (curVidMode === "refs" ? vidRefVids.reduce((a, v) => a + (v.duration || 0), 0) : 0);
  const curVidUsesVideo = curVidInSec > 0;
  const curVidCost = videoCredits(curVidModel, vidDur, curVidRes, curVidInSec, curVidMode, { nImages: vidOmniImages.length, nAudios: vidRefAuds.length });
  const curVidNeedsImage = curVidMode === "frames" && (curVidMd.needsImage || curVidModel.res[curVidRes]?.needsImage);
  const curVidBlocked = (curVidNeedsImage && !(curVidMulti ? vidFrames.length : startFrame))
    || (curVidMd.source && !vidRefVideo?.url)
    || (curVidMode === "refs" && vidOmniImages.length + vidRefVids.length === 0)
    || vidRefUploadingN > 0;
  const renderModelPicker = (kind) => {
    const list = kind === "vid" ? VIDEO_MODELS : IMAGE_MODELS;
    const cur = kind === "vid" ? curVidModel : curImgModel;
    const setId = kind === "vid" ? setVidModelId : setImgModelId;
    const families = [...new Set(list.map(m => m.family))];
    const priceOf = (m) => kind === "vid" ? `${Object.keys(m.res).length > 1 ? (lang === "es" ? "desde " : "from ") : ""}⚡ ${Math.min(...Object.values(m.res).map(r => r.perSec))}/s` : `⚡ ${imageCredits(m, imgQuality, false)}`;
    const open = modelMenuOpen === kind;
    return (
      <div style={{ position: "relative", marginBottom: 12 }}>
        <p style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{lang === "es" ? "Modelo" : "Model"}</p>
        <button onClick={() => setModelMenuOpen(open ? false : kind)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#14141c", border: `1px solid ${open ? "rgba(232,196,58,.4)" : "rgba(255,255,255,.08)"}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(232,196,58,.12)", color: "#e8c23a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{cur.family[0]}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#e2e2ea", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cur.name}</span>
            <span style={{ display: "block", fontSize: 10, color: "#5a5a78" }}>{cur.family}{cur.badge ? ` · ${cur.badge}` : ""}</span>
          </span>
          <span style={{ fontSize: 11, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{priceOf(cur)}</span>
          <span style={{ color: "#5a5a78", fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </button>
        {open && (
          <>
            <div onClick={() => setModelMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 61, background: "#14141c", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 6, maxHeight: 380, overflowY: "auto", boxShadow: "0 16px 40px rgba(0,0,0,.7)" }}>
              {families.map(fam => (
                <div key={fam} style={{ marginBottom: 4 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#6a6a82", letterSpacing: 1.2, textTransform: "uppercase", padding: "8px 10px 4px", margin: 0 }}>{fam}</p>
                  {list.filter(m => m.family === fam).map(m => {
                    const sel = m.id === cur.id;
                    return (
                      <button key={m.id} onClick={() => { setId(m.id); setModelMenuOpen(false); if (kind === "vid") { setVidRes(m.defRes); setVidDur(d => clampDuration(m, d)); if (!m.modes?.includes(vidMode)) setVidMode("frames"); } }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "none", background: sel ? "rgba(232,196,58,.1)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
                        onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ flex: 1, fontSize: 12, color: sel ? "#e8c23a" : "#d0d0e0", fontWeight: sel ? 600 : 400 }}>{m.name}</span>
                        {m.badge && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,.06)", color: "#8a8a9e" }}>{m.badge}</span>}
                        {m.needsImage && <span title={lang === "es" ? "Requiere imagen inicial" : "Requires start image"} style={{ fontSize: 10 }}>🖼️</span>}
                        {m.needsVideo && <span title={lang === "es" ? "Requiere video" : "Requires video"} style={{ fontSize: 10 }}>🎞️</span>}
                        <span style={{ fontSize: 10, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{priceOf(m)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── VIDEO PANEL v18 (Higgsfield-style) ──
  const VID_FAMILY_COLOR = { Kling: "#3b82f6", Seedance: "#6366f1", Wan: "#a855f7", MiniMax: "#f43f5e" };
  const vidEditModes = ["edit", "extend"];
  const vidModelsForSub = VIDEO_MODELS.filter(m => vidSub === "edit" ? m.modes.some(md => vidEditModes.includes(md.id)) : m.category === "create");
  const vidModesForSub = curVidModel.modes.filter(md => vidSub === "edit" ? vidEditModes.includes(md.id) : true);
  const selectVidModel = (m, sub = vidSub) => {
    setVidModelId(m.id);
    setVidRes(m.defRes);
    setVidDur(d => clampDuration(m, d));
    const allowed = m.modes.filter(md => sub === "edit" ? vidEditModes.includes(md.id) : true);
    if (!allowed.some(md => md.id === vidMode)) setVidMode(allowed[0]?.id || "frames");
    setModelMenuOpen(false);
    setVidPop(null);
  };
  const addRefVideo = async (file, maxSec, setter) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    const dur = await new Promise(r => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => r(v.duration || 0); v.onerror = () => r(0); v.src = preview; });
    if (maxSec && dur > maxSec + 0.5) { setGenError(lang === "es" ? `El video dura ${dur.toFixed(1)}s. Máximo ${maxSec}s.` : `Video is ${dur.toFixed(1)}s. Max ${maxSec}s.`); return; }
    setVidRefUploadingN(n => n + 1);
    try { const url = await uploadVideoToStorage(file); setter({ url, preview, duration: dur, name: file.name }); }
    catch (err) { setGenError((lang === "es" ? "Error subiendo archivo: " : "Upload error: ") + err.message); }
    finally { setVidRefUploadingN(n => n - 1); }
  };
  const addRefAudio = async (file) => {
    if (!file) return;
    setVidRefUploadingN(n => n + 1);
    try { const url = await uploadVideoToStorage(file); setVidRefAuds(p => [...p, { url, name: file.name }]); }
    catch (err) { setGenError((lang === "es" ? "Error subiendo audio: " : "Audio upload error: ") + err.message + (lang === "es" ? " (revisa que el bucket motion-refs acepte audio)" : "")); }
    finally { setVidRefUploadingN(n => n - 1); }
  };

  // ── STUDIO UI KIT v23 — shared look for every generator tab (same as the Video panel) ──
  const LL = (es, en) => (lang === "es" ? es : en);
  const isStudioTab = [T.IMG, T.VID, T.VID_EDIT, T.MOT, T.DIR, T.WS_IMG, T.WS_VID].includes(tab);
  const uiCard = { background: "#16161d", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14 };
  const uiTextarea = { width: "100%", background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontSize: 14, lineHeight: 1.5, resize: "none", fontFamily: "inherit", padding: 0 };
  const uiPill = (sel) => ({ padding: "8px 10px", fontSize: 12, fontWeight: sel ? 700 : 400, color: sel ? "#e8c23a" : "#b0b0c4", background: sel ? "rgba(232,196,58,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${sel ? "rgba(232,196,58,.35)" : "rgba(255,255,255,.08)"}`, borderRadius: 9, cursor: "pointer", fontFamily: "inherit" });
  const uiModeTab = (sel) => ({ flex: 1, padding: "9px 4px", borderRadius: 9, border: sel ? "1px solid rgba(255,255,255,.1)" : "1px solid transparent", background: sel ? "#24242e" : "transparent", color: sel ? "#f0f0f6" : "#6a6a82", fontSize: 12, fontWeight: sel ? 600 : 400, cursor: "pointer", fontFamily: "inherit" });
  const uiLabel = (txt, right) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 6px" }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f6" }}>{txt}</span>
      {right != null && <span style={{ fontSize: 11, color: "#6a6a82", fontFamily: "'JetBrains Mono',monospace" }}>{right}</span>}
    </div>
  );
  const uiSubTabs = (items, cur) => (
    <div style={{ display: "flex", gap: 16, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,.06)", overflowX: "auto" }}>
      {items.map(([k, l, fn]) => (
        <button key={k} onClick={fn} style={{ background: "none", border: "none", padding: "6px 0 10px", fontSize: 13, fontWeight: cur === k ? 600 : 400, color: cur === k ? "#f0f0f6" : "#6a6a82", borderBottom: cur === k ? "2px solid #f0f0f6" : "2px solid transparent", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{l}</button>
      ))}
    </div>
  );
  // Hero card: optional looping video from /public/models/<video>. If the file is missing it just shows the gradient.
  const uiHero = ({ video, title, name, color = "#e8c23a", chip, onChange }) => (
    <div style={{ position: "relative", height: 132, borderRadius: 16, overflow: "hidden", marginBottom: 10, background: `radial-gradient(120% 140% at 80% 10%, ${color}55 0%, #111118 60%)`, border: "1px solid rgba(255,255,255,.08)" }}>
      {video && <video key={video} src={`/models/${video}`} autoPlay muted loop playsInline onError={e => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)" }} />
      {onChange ? (
        <button onClick={onChange} style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 9, background: "rgba(20,20,26,.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.15)", color: "#f0f0f6", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✎ {LL("Cambiar", "Change")}</button>
      ) : chip ? (
        <span style={{ position: "absolute", top: 10, right: 10, padding: "5px 9px", borderRadius: 9, background: "rgba(20,20,26,.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.15)", color: "#e8c23a", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{chip}</span>
      ) : null}
      <div style={{ position: "absolute", left: 14, bottom: 12, right: 14 }}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#e8f542", letterSpacing: -.5, fontFamily: "'Inter',sans-serif", textTransform: "uppercase" }}>{title}</p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#d8d8e4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</p>
      </div>
    </div>
  );
  const uiSetting = (label, value, key, opts = {}) => (
    <button onClick={opts.static ? undefined : (opts.onClick || (() => setUiPop(uiPop === key ? null : key)))} style={{ ...uiCard, flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: opts.static ? "default" : "pointer", fontFamily: "inherit", textAlign: "left", borderColor: uiPop === key ? "rgba(232,196,58,.35)" : "rgba(255,255,255,.06)", width: opts.full ? "100%" : undefined, marginBottom: opts.full ? 8 : 0 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 10, color: "#6a6a82", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#e8e8f0", fontWeight: 500, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
      </span>
      {!opts.static && <span style={{ color: "#5a5a78", fontSize: 12, transform: uiPop === key ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>}
    </button>
  );
  const uiPopList = (key, items, cur, onPick) => uiPop === key ? (
    <div style={{ ...uiCard, padding: 6, marginBottom: 8, animation: "fadeUp .2s ease", maxHeight: 340, overflowY: "auto" }}>
      {items.map(it => {
        const sel = it.id === cur;
        return (
          <button key={it.id} onClick={() => { onPick(it.id); setUiPop(null); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, border: "none", background: sel ? "rgba(232,196,58,.1)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            {it.icon != null && <span style={{ fontSize: 16, width: 22, display: "flex", justifyContent: "center", color: sel ? "#e8c23a" : "#b0b0c4" }}>{it.icon}</span>}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, color: sel ? "#e8c23a" : "#e0e0ec", fontWeight: sel ? 600 : 400 }}>{it.label}</span>
              {it.sub && <span style={{ display: "block", fontSize: 10, color: "#6a6a82", marginTop: 1 }}>{it.sub}</span>}
            </span>
            {it.right && <span style={{ fontSize: 10, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{it.right}</span>}
            {sel && <span style={{ color: "#e8c23a", fontSize: 12 }}>✓</span>}
          </button>
        );
      })}
    </div>
  ) : null;
  const uiDropIcons = (icons) => (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
      {icons.map((ic, i) => <span key={i} style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(180deg,#2a2a34,#1a1a22)", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginLeft: i ? -8 : 0, boxShadow: "0 4px 10px rgba(0,0,0,.4)" }}>{ic}</span>)}
    </div>
  );
  const uiDrop = ({ title, sub, icons = [], accept, multiple = false, onFiles, children, canAdd = true, counter }) => (
    <div style={{ border: "1px dashed rgba(255,255,255,.12)", borderRadius: 14, padding: children ? "12px" : "22px 12px", marginBottom: 10, background: "rgba(255,255,255,.015)", position: "relative" }}>
      {counter && <span style={{ position: "absolute", top: 8, right: 10, fontSize: 10, color: "#6a6a82", fontFamily: "'JetBrains Mono',monospace" }}>{counter}</span>}
      {children}
      {canAdd && (
        <label style={{ display: "block", textAlign: "center", cursor: "pointer", paddingTop: children ? 10 : 0 }}>
          {!children && uiDropIcons(icons)}
          <span style={{ display: "block", fontSize: children ? 12 : 14, fontWeight: 600, color: "#e8e8f0" }}>{children ? `+ ${title}` : title}</span>
          {!children && sub && <span style={{ display: "block", fontSize: 11, color: "#6a6a82", marginTop: 4, padding: "0 6px" }}>{sub}</span>}
          <input type="file" accept={accept} multiple={multiple} hidden onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) onFiles(fs); }} />
        </label>
      )}
    </div>
  );
  const uiThumb = (src, onRemove, label, opts = {}) => (
    <div style={{ position: "relative", width: opts.size || 56, height: opts.size || 56, borderRadius: 8, overflow: "hidden", border: `1px solid ${opts.warn ? "rgba(255,77,106,.5)" : "rgba(255,255,255,.1)"}`, flexShrink: 0, background: "#0d0d14" }}>
      {src ? (opts.video ? <video src={src} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />)
           : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{opts.icon || "🔊"}</div>}
      {opts.warn && <span style={{ position: "absolute", inset: 0, background: "rgba(255,77,106,.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 700 }}>{opts.warn}</span>}
      {label && <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 8, textAlign: "center", background: "rgba(0,0,0,.65)", color: "#fff", padding: "1px 0", whiteSpace: "nowrap", overflow: "hidden" }}>{label}</span>}
      {onRemove && <button onClick={(e) => { e.preventDefault(); onRemove(); }} style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>}
    </div>
  );
  const uiSpinTile = (size = 56) => (
    <div style={{ width: size, height: size, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,.1)", flexShrink: 0 }}>
      <div style={{ width: 16, height: 16, border: "2px solid rgba(232,196,58,.25)", borderTop: "2px solid #e8c23a", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
    </div>
  );
  const uiErr = (msg, onClose) => (
    <div style={{ marginBottom: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.18)", fontSize: 11, color: "#ff4d6a", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span>{msg}</span>
      {onClose && <button onClick={onClose} style={{ background: "none", border: "none", color: "#ff4d6a", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
    </div>
  );
  const uiNote = (txt, tone = "muted") => (
    <div style={{ marginBottom: 10, padding: "9px 12px", borderRadius: 10, fontSize: 10.5, lineHeight: 1.5, ...(tone === "warn" ? { background: "rgba(232,196,58,.06)", border: "1px solid rgba(232,196,58,.2)", color: "#c8a830" } : { background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", color: "#6a6a82" }) }}>{txt}</div>
  );
  // Plan lock overlay (keeps the same eligibility rules each tab already had)
  const uiLock = (icon, text, sub) => (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, borderRadius: 14, background: "rgba(10,10,15,.82)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 60, padding: "60px 20px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: 15, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>{LL("Función exclusiva", "Exclusive feature")}</p>
      <p style={{ fontSize: 12, color: "#a0a0b8", margin: "0 0 6px", lineHeight: 1.5 }}>{text}</p>
      {sub && <p style={{ fontSize: 11, color: "#6a6a82", margin: "0 0 18px" }}>{sub}</p>}
      <button onClick={() => setPage(P.PLANS)} style={{ padding: "12px 28px", fontSize: 13, fontWeight: 700, color: "#0a0a0f", background: "linear-gradient(135deg,#e8f542,#e8c23a)", border: "none", borderRadius: 11, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 6px 24px rgba(232,196,58,.3)" }}>🚀 {LL("Cambiar de plan", "Upgrade plan")}</button>
    </div>
  );
  // Sticky generate bar (bottom of the left panel). needTopUp → opens the "Recargar" packs menu.
  const uiGenBar = ({ onClick, disabled, label, cost, needTopUp }) => {
    const live = needTopUp || !disabled;
    return (
      <div style={{ position: "sticky", bottom: 0, zIndex: 5, margin: "6px -14px 0", padding: "14px 14px 16px", background: "linear-gradient(180deg, rgba(13,13,20,0) 0%, #0d0d14 26%)" }}>
        <button onClick={needTopUp ? () => (PACK_ELIGIBLE_PLANS.includes(profile?.plan) ? setShowTopUpMenu(true) : setPage(P.PLANS)) : onClick} disabled={!live}
          style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700, letterSpacing: -.2, color: live ? "#0a0a0f" : "#5a5a70", background: live ? "linear-gradient(135deg,#e8f542,#e8c23a)" : "rgba(255,255,255,.05)", border: "none", borderRadius: 12, cursor: live ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: live ? "0 6px 24px rgba(232,196,58,.22)" : "none", transition: "all .2s" }}>
          <span>{needTopUp ? LL("⚡ Recargar créditos", "⚡ Top up credits") : label}</span>
          {cost != null && <span style={{ fontSize: 12, opacity: .8, fontFamily: "'JetBrains Mono',monospace" }}>{needTopUp ? `· ${LL("necesitas", "need")} ${cost}` : `⚡ ${cost}`}</span>}
        </button>
        {genError && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", fontSize: 11, color: "#ff4d6a", textAlign: "center" }}>
            {genError}
            {showConcurrentUpgrade && (
              <div style={{ marginTop: 6 }}>
                <button onClick={() => { setGenError(""); setShowConcurrentUpgrade(false); setPage(P.PLANS); }} style={{ fontSize: 11, fontWeight: 700, color: "#e8c23a", background: "rgba(232,196,58,.08)", border: "1px solid rgba(232,196,58,.2)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}>{LL("⚡ Mejorar plan →", "⚡ Upgrade plan →")}</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  // Inline result card (mobile only — on desktop the result appears in the right-hand feed)
  const uiResult = (isVideo, name, file) => (!isDesk && genResult && !genning) ? (
    <div style={{ ...uiCard, marginBottom: 10, overflow: "hidden", animation: "fadeUp .5s ease" }}>
      {isVideo ? <video src={genResult.url} controls autoPlay playsInline style={{ width: "100%", display: "block", maxHeight: 360, background: "#000" }} /> : <img src={genResult.url} alt="" style={{ width: "100%", display: "block" }} />}
      <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#6a6a82" }}>✓ {name}</span>
        <button data-download-btn onClick={() => downloadFile(genResult.url, `${file}-${Date.now()}.${isVideo ? "mp4" : "png"}`)} style={{ ...uiPill(true), padding: "5px 10px", fontSize: 11 }}>↓ {LL("Descargar", "Download")}</button>
      </div>
    </div>
  ) : null;
  const uiGenerating = (type, dur) => genning ? (
    <div style={{ marginBottom: 10, position: "relative", height: 150, borderRadius: 14, overflow: "hidden" }}><Generating type={type} duration={dur} lang={lang} genStatus={genStatus} /></div>
  ) : null;
  const goVidSub = (k) => {
    const list = VIDEO_MODELS.filter(x => k === "edit" ? x.modes.some(y => vidEditModes.includes(y.id)) : x.category === "create");
    selectVidModel(list.find(x => x.id === vidModelId) || list[0], k);
    setVidSub(k);
    setTab(T.VID);
  };
  const videoSubTabs = (cur) => uiSubTabs([
    ["create", LL("Crear video", "Create video"), () => goVidSub("create")],
    ["edit", LL("Editar video", "Edit video"), () => goVidSub("edit")],
    ["motion", "Motion Control", () => setTab(T.MOT)],
  ], cur);
  const imageSubTabs = (cur) => uiSubTabs([
    ["img", LL("Crear imagen", "Create image"), () => setTab(T.IMG)],
    ["pro", LL("Imagen Pro", "Image Pro"), () => setTab(T.WS_IMG)],
  ], cur);
  const styleLabel = (s) => (lang === "en" ? (t("styles")?.[s.id] || s.label) : s.label);
  const renderVideoPanel = () => {
    const m = curVidModel, md = curVidMd;
    const L = (o) => (o ? (lang === "es" ? o.es : o.en) : "");
    const card = { background: "#16161d", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14 };
    const settingCard = (label, value, key, extraStyle = {}) => (
      <button onClick={() => setVidPop(vidPop === key ? null : key)} style={{ ...card, flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderColor: vidPop === key ? "rgba(232,196,58,.4)" : "rgba(255,255,255,.06)", ...extraStyle }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 10, color: "#6a6a82", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <span style={{ display: "block", fontSize: 14, color: "#e8e8f0", fontWeight: 500, marginTop: 2 }}>{value}</span>
        </span>
        <span style={{ color: "#5a5a78", fontSize: 12, transform: vidPop === key ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </button>
    );
    const pill = (sel) => ({ padding: "8px 10px", fontSize: 12, fontWeight: sel ? 700 : 400, color: sel ? "#e8c23a" : "#b0b0c4", background: sel ? "rgba(232,196,58,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${sel ? "rgba(232,196,58,.35)" : "rgba(255,255,255,.06)"}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" });
    const thumb = (src, onRemove, label, isVideo) => (
      <div style={{ position: "relative", width: 52, height: 52, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", flexShrink: 0, background: "#0d0d14" }}>
        {src ? (isVideo ? <video src={src} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />)
             : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔊</div>}
        {label && <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 8, textAlign: "center", background: "rgba(0,0,0,.65)", color: "#fff", padding: "1px 0" }}>{label}</span>}
        <button onClick={onRemove} style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
    );
    const dropIcons = (icons) => (
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        {icons.map((ic, i) => <span key={i} style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(180deg,#2a2a34,#1a1a22)", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, marginLeft: i ? -8 : 0, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>{ic}</span>)}
      </div>
    );
    const dropzone = (title, sub, icons, accept, multiple, onFiles, children) => (
      <div style={{ border: "1px dashed rgba(255,255,255,.12)", borderRadius: 14, padding: children ? "12px" : "22px 12px", marginBottom: 10, background: "rgba(255,255,255,.015)" }}>
        {children}
        <label style={{ display: "block", textAlign: "center", cursor: "pointer", paddingTop: children ? 10 : 0 }}>
          {!children && dropIcons(icons)}
          <span style={{ display: "block", fontSize: children ? 12 : 14, fontWeight: 600, color: "#e8e8f0" }}>{children ? `+ ${title}` : title}</span>
          {!children && <span style={{ display: "block", fontSize: 11, color: "#6a6a82", marginTop: 4 }}>{sub}</span>}
          <input type="file" accept={accept} multiple={multiple} hidden onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; onFiles(fs); }} />
        </label>
      </div>
    );
    const refsCount = vidOmniImages.length + vidRefVids.length + vidRefAuds.length;
    const elements = [
      ...vidOmniImages.map((_, i) => `@Image${i + 1}`),
      ...vidRefVids.map((_, i) => `@Video${i + 1}`),
      ...vidRefAuds.map((_, i) => `@Audio${i + 1}`),
      ...(md.source && vidRefVideo ? ["@Video1"] : []),
    ];
    const res = m.res[curVidRes];

    return (
      <div>
        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 16, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          {[["create", lang === "es" ? "Crear video" : "Create video"], ["edit", lang === "es" ? "Editar video" : "Edit video"], ["motion", "Motion Control"]].map(([k, l]) => (
            <button key={k} onClick={() => {
              if (k === "motion") { setTab(T.MOT); return; }
              setVidSub(k);
              const list = VIDEO_MODELS.filter(x => k === "edit" ? x.modes.some(y => vidEditModes.includes(y.id)) : x.category === "create");
              const keep = list.find(x => x.id === vidModelId);
              selectVidModel(keep || list[0], k);
            }} style={{ background: "none", border: "none", padding: "6px 0 10px", fontSize: 13, fontWeight: vidSub === k ? 600 : 400, color: vidSub === k ? "#f0f0f6" : "#6a6a82", borderBottom: vidSub === k ? "2px solid #f0f0f6" : "2px solid transparent", cursor: "pointer", fontFamily: "inherit", marginBottom: -1 }}>{l}</button>
          ))}
        </div>

        {/* Hero card with model preview video */}
        <div style={{ position: "relative", height: 132, borderRadius: 16, overflow: "hidden", marginBottom: 10, background: `radial-gradient(120% 140% at 80% 10%, ${VID_FAMILY_COLOR[m.family] || "#444"}55 0%, #111118 60%)`, border: "1px solid rgba(255,255,255,.08)" }}>
          <video key={m.id} src={`/models/${m.id}.mp4`} autoPlay muted loop playsInline onError={e => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)" }} />
          <button onClick={() => setModelMenuOpen(modelMenuOpen === "vidhero" ? false : "vidhero")} style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 9, background: "rgba(20,20,26,.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.15)", color: "#f0f0f6", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✎ {lang === "es" ? "Cambiar" : "Change"}</button>
          <div style={{ position: "absolute", left: 14, bottom: 12 }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#e8f542", letterSpacing: -.5, fontFamily: "'Inter',sans-serif", textTransform: "uppercase" }}>{vidSub === "edit" ? (lang === "es" ? "Editar" : "Edit") : "General"}</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#d8d8e4" }}>{m.name}</p>
          </div>
        </div>

        {/* Model list (Cambiar) */}
        {modelMenuOpen === "vidhero" && (
          <>
            <div onClick={() => setModelMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
            <div style={{ position: "relative", zIndex: 61, ...card, padding: 6, marginBottom: 10, maxHeight: 360, overflowY: "auto", boxShadow: "0 16px 40px rgba(0,0,0,.6)" }}>
              {[...new Set(vidModelsForSub.map(x => x.family))].map(fam => (
                <div key={fam}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#6a6a82", letterSpacing: 1.2, textTransform: "uppercase", padding: "8px 10px 4px", margin: 0 }}>{fam}</p>
                  {vidModelsForSub.filter(x => x.family === fam).map(x => {
                    const sel = x.id === m.id;
                    const from = Math.min(...Object.values(x.res).map(r => r.perSec));
                    return (
                      <button key={x.id} onClick={() => selectVidModel(x)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: sel ? "rgba(232,196,58,.1)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: VID_FAMILY_COLOR[x.family] }} />
                        <span style={{ flex: 1, fontSize: 13, color: sel ? "#e8c23a" : "#e0e0ec", fontWeight: sel ? 600 : 400 }}>{x.name}</span>
                        {x.badge && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: x.badge === "Nuevo" ? "rgba(232,245,66,.12)" : "rgba(255,255,255,.06)", color: x.badge === "Nuevo" ? "#e8f542" : "#8a8a9e" }}>{x.badge}</span>}
                        <span style={{ fontSize: 10, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace" }}>{lang === "es" ? "desde" : "from"} ⚡{from}/s</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Mode tabs */}
        {vidModesForSub.length > 1 && (
          <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: "#16161d", border: "1px solid rgba(255,255,255,.06)", marginBottom: 10 }}>
            {vidModesForSub.map(x => (
              <button key={x.id} onClick={() => { setVidMode(x.id); setVidPop(null); }} style={{ flex: 1, padding: "9px 4px", borderRadius: 9, border: curVidMode === x.id ? "1px solid rgba(255,255,255,.1)" : "1px solid transparent", background: curVidMode === x.id ? "#24242e" : "transparent", color: curVidMode === x.id ? "#f0f0f6" : "#6a6a82", fontSize: 12, fontWeight: curVidMode === x.id ? 600 : 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {x.id === "refs" ? "▥ " : x.id === "frames" ? "▢ " : "✂ "}{L(MODE_LABELS[x.id])}
              </button>
            ))}
          </div>
        )}

        {/* ── Inputs per mode ── */}
        {curVidMode === "refs" && dropzone(
          lang === "es" ? "Añadir referencias" : "Add references",
          L(md.hint),
          [md.images ? "🖼️" : null, md.videos ? "🎞️" : null, md.audios ? "🔊" : null].filter(Boolean),
          [md.images ? "image/jpeg,image/png,image/webp" : "", md.videos ? "video/mp4,video/quicktime,video/webm" : "", md.audios ? "audio/mpeg,audio/wav,audio/mp4,audio/x-m4a" : ""].filter(Boolean).join(","),
          true,
          (fs) => {
            for (const f of fs) {
              if (f.type.startsWith("image/")) setVidOmniImages(p => p.length < (md.images || 0) ? [...p, f] : p);
              else if (f.type.startsWith("video/") && vidRefVids.length < (md.videos || 0)) {
                const used = vidRefVids.reduce((a, v) => a + (v.duration || 0), 0);
                addRefVideo(f, Math.max(1, (md.videoSec || 15) - used), (v) => setVidRefVids(p => [...p, v]));
              }
              else if (f.type.startsWith("audio/") && vidRefAuds.length < (md.audios || 0)) addRefAudio(f);
            }
          },
          refsCount > 0 || vidRefUploadingN > 0 ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {vidOmniImages.map((f, i) => <span key={"i" + i}>{thumb(URL.createObjectURL(f), () => setVidOmniImages(p => p.filter((_, j) => j !== i)), `@Image${i + 1}`)}</span>)}
              {vidRefVids.map((v, i) => <span key={"v" + i}>{thumb(v.preview, () => setVidRefVids(p => p.filter((_, j) => j !== i)), `@Video${i + 1}`, true)}</span>)}
              {vidRefAuds.map((a, i) => <span key={"a" + i}>{thumb(null, () => setVidRefAuds(p => p.filter((_, j) => j !== i)), `@Audio${i + 1}`)}</span>)}
              {vidRefUploadingN > 0 && <div style={{ width: 52, height: 52, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,.1)" }}><div style={{ width: 16, height: 16, border: "2px solid rgba(232,196,58,.2)", borderTop: "2px solid #e8c23a", borderRadius: "50%", animation: "spin .8s linear infinite" }} /></div>}
            </div>
          ) : null
        )}

        {curVidMode === "frames" && (md.frames || 0) > 2 && dropzone(
          lang === "es" ? "Añade fotogramas" : "Add frames",
          L(md.hint),
          ["🙂", "👕", "📦"], "image/jpeg,image/png,image/webp", true,
          (fs) => setVidFrames(p => [...p, ...fs.filter(f => f.type.startsWith("image/"))].slice(0, md.frames)),
          vidFrames.length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {vidFrames.map((f, i) => <span key={i}>{thumb(URL.createObjectURL(f), () => setVidFrames(p => p.filter((_, j) => j !== i)), i === 0 ? (lang === "es" ? "Inicio" : "Start") : i === vidFrames.length - 1 ? (lang === "es" ? "Final" : "End") : `${i + 1}`)}</span>)}
            </div>
          ) : null
        )}

        {curVidMode === "frames" && (md.frames || 0) <= 2 && (
          <div style={{ ...card, display: "flex", gap: 0, marginBottom: 10, overflow: "hidden" }}>
            {[["start", lang === "es" ? "Fotograma inicial" : "Start frame", startFrame, setStartFrame, true], ...(md.endFrame ? [["end", lang === "es" ? "Fotograma final" : "End frame", endFrame, setEndFrame, !!startFrame]] : [])].map(([k, label, file, setter, enabled], idx) => (
              <label key={k} style={{ flex: 1, position: "relative", minHeight: 150, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: enabled ? "pointer" : "default", borderLeft: idx ? "1px solid rgba(255,255,255,.06)" : "none", border: idx === 0 ? "1px dashed rgba(255,255,255,.12)" : undefined, borderRadius: idx === 0 ? 14 : 0, margin: idx === 0 ? 4 : 0, opacity: enabled ? 1 : .45 }}>
                <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.06)", color: (md.needsImage || res.needsImage) && k === "start" ? "#e8c23a" : "#8a8a9e" }}>{(md.needsImage || res.needsImage) && k === "start" ? (lang === "es" ? "Requerido" : "Required") : (lang === "es" ? "Opcional" : "Optional")}</span>
                {file ? (
                  <>
                    <img src={URL.createObjectURL(file)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={(e) => { e.preventDefault(); setter(null); }} style={{ position: "absolute", top: 8, left: 8, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,.7)", border: "none", color: "#fff", cursor: "pointer" }}>×</button>
                  </>
                ) : (
                  <>
                    {dropIcons(["🏞️"])}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0", textAlign: "center", padding: "0 8px" }}>{label}</span>
                  </>
                )}
                {enabled && <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setter(f); }} />}
              </label>
            ))}
          </div>
        )}

        {md.source && dropzone(
          curVidMode === "extend" ? (lang === "es" ? "Añade el video a extender" : "Add the video to extend") : (lang === "es" ? "Añade un video para editar" : "Add a video to edit"),
          `${L(md.hint)} · ${lang === "es" ? "máx" : "max"} ${md.sourceSec}s`,
          ["🎞️"], "video/mp4,video/quicktime,video/webm", false,
          (fs) => { if (fs[0]) addRefVideo(fs[0], md.sourceSec, (v) => setVidRefVideo(v)); },
          vidRefVideo || vidRefUploadingN > 0 ? (
            <div style={{ display: "flex", gap: 6 }}>
              {vidRefVideo && thumb(vidRefVideo.preview, () => setVidRefVideo(null), `${Math.round(vidRefVideo.duration)}s`, true)}
              {vidRefUploadingN > 0 && !vidRefVideo && <span style={{ fontSize: 11, color: "#8a8a9e", alignSelf: "center" }}>⏳ {lang === "es" ? "Subiendo..." : "Uploading..."}</span>}
            </div>
          ) : null
        )}
        {curVidMode === "edit" && (md.images || 0) > 0 && dropzone(
          lang === "es" ? "Añadir referencias" : "Add references",
          lang === "es" ? "Imágenes para usar en la edición" : "Images to use in the edit",
          ["🙂", "👕", "📦"], "image/jpeg,image/png,image/webp", true,
          (fs) => setVidOmniImages(p => [...p, ...fs.filter(f => f.type.startsWith("image/"))].slice(0, md.images)),
          vidOmniImages.length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {vidOmniImages.map((f, i) => <span key={i}>{thumb(URL.createObjectURL(f), () => setVidOmniImages(p => p.filter((_, j) => j !== i)), `@Image${i + 1}`)}</span>)}
            </div>
          ) : null
        )}

        {/* Prompt card */}
        <div style={{ ...card, padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#f0f0f6" }}>Prompt</p>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
            placeholder={curVidMode === "edit" ? (lang === "es" ? "Describe el cambio visual que quieres — p. ej. “Haz que nieve”. Usa @ para referencias." : "Describe the visual change — e.g. “Make it snow”. Use @ for references.")
              : curVidMode === "frames" ? (lang === "es" ? "Describe la escena o el movimiento entre fotogramas…" : "Describe the scene or the motion between frames…")
              : (lang === "es" ? "Describe tu escena en detalle. Usa @ para referenciar contenido multimedia" : "Describe your scene in detail. Use @ to reference media")}
            style={{ width: "100%", background: "transparent", border: "none", color: "#e8e8f0", fontSize: 14, lineHeight: 1.5, resize: "none", fontFamily: "inherit", padding: 0 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 8, position: "relative", flexWrap: "wrap" }}>
            {elements.length > 0 && (
              <button onClick={() => setVidPop(vidPop === "elements" ? null : "elements")} style={{ ...pill(vidPop === "elements"), padding: "5px 10px", fontSize: 12 }}>@ {lang === "es" ? "Elementos" : "Elements"}</button>
            )}
            {m.audioToggle && (
              <button onClick={() => setAudioOn(v => !v)} style={{ ...pill(audioOn), padding: "5px 10px", fontSize: 12 }}>{audioOn ? "🔊" : "🔇"} {audioOn ? (lang === "es" ? "Activado" : "On") : (lang === "es" ? "Desactivado" : "Off")}</button>
            )}
            <button onClick={() => setPrompt(SAMPLE[Math.floor(Math.random() * SAMPLE.length)])} style={{ ...pill(false), padding: "5px 10px", fontSize: 12 }}>🎲</button>
            {vidPop === "elements" && (
              <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 20, ...card, padding: 6, display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 260 }}>
                {elements.map(el => <button key={el} onClick={() => { setPrompt(p => (p ? p.trimEnd() + " " : "") + el + " "); setVidPop(null); }} style={{ ...pill(false), padding: "4px 8px", fontSize: 11 }}>{el}</button>)}
              </div>
            )}
          </div>
        </div>

        {/* Settings cards */}
        <button onClick={() => setModelMenuOpen(modelMenuOpen === "vidhero" ? false : "vidhero")} style={{ ...card, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span>
            <span style={{ display: "block", fontSize: 10, color: "#6a6a82" }}>{lang === "es" ? "Modelo" : "Model"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#e8e8f0", fontWeight: 500, marginTop: 2 }}>
              {m.name}
              <span style={{ width: 8, height: 8, borderRadius: 4, background: VID_FAMILY_COLOR[m.family] }} />
              {m.badge && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: m.badge === "Nuevo" ? "rgba(232,245,66,.12)" : "rgba(255,255,255,.06)", color: m.badge === "Nuevo" ? "#e8f542" : "#8a8a9e" }}>{m.badge}</span>}
            </span>
          </span>
          <span style={{ color: "#5a5a78" }}>›</span>
        </button>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {curVidMode !== "edit" && settingCard(lang === "es" ? "Duración" : "Duration", `${clampDuration(m, vidDur)}s`, "dur")}
          {m.aspects && !["edit", "extend"].includes(curVidMode) && settingCard(lang === "es" ? "Relación de aspecto" : "Aspect ratio", vidRatio, "ratio")}
        </div>
        {Object.keys(m.res).length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {settingCard(lang === "es" ? "Calidad" : "Quality", curVidRes, "res")}
          </div>
        )}

        {/* Popovers */}
        {vidPop === "dur" && (
          <div style={{ ...card, padding: 12, marginBottom: 8 }}>
            {m.durRange ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#e8e8f0", marginBottom: 6 }}><span>{clampDuration(m, vidDur)}s</span><span style={{ color: "#e8c23a" }}>⚡ {curVidCost}</span></div>
                <input type="range" min={m.durRange[0]} max={m.durRange[1]} step={1} value={clampDuration(m, vidDur)} onChange={e => setVidDur(Number(e.target.value))} style={{ width: "100%", accentColor: "#e8f542", cursor: "pointer" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#5a5a78" }}><span>{m.durRange[0]}s</span><span>{m.durRange[1]}s</span></div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>{m.durOptions.map(d => <button key={d} onClick={() => { setVidDur(d); setVidPop(null); }} style={{ ...pill(clampDuration(m, vidDur) === d), flex: 1 }}>{d}s</button>)}</div>
            )}
            {curVidUsesVideo && <p style={{ fontSize: 10, color: "#6a6a82", margin: "8px 0 0" }}>{lang === "es" ? "El costo incluye los segundos de video de entrada (fal los cobra)." : "Cost includes input video seconds (billed by fal)."}</p>}
          </div>
        )}
        {vidPop === "ratio" && (
          <div style={{ ...card, padding: 10, marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {m.aspects.map(r => <button key={r} onClick={() => { setVidRatio(r); setVidPop(null); }} style={{ ...pill(vidRatio === r), flex: "1 0 28%" }}>{r}</button>)}
          </div>
        )}
        {vidPop === "res" && (
          <div style={{ ...card, padding: 6, marginBottom: 8 }}>
            {Object.entries(m.res).map(([k, r]) => (
              <button key={k} onClick={() => { setVidRes(k); setVidPop(null); }} style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "9px 10px", borderRadius: 8, border: "none", background: curVidRes === k ? "rgba(232,196,58,.1)" : "transparent", color: curVidRes === k ? "#e8c23a" : "#e0e0ec", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                <span>{k}{r.needsImage ? (lang === "es" ? " · requiere imagen" : " · needs image") : ""}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>⚡{r.perSec}/s</span>
              </button>
            ))}
          </div>
        )}
        {m.draft && <p style={{ fontSize: 10, color: "#6a6a82", margin: "4px 2px 8px" }}>{lang === "es" ? `Borrador barato en 480p. Si te gusta, ábrelo en tu galería y genera la versión 1080p (⚡${m.complete.perSec}/s · válido 7 días).` : `Cheap 480p draft. If you like it, open it in your gallery and render 1080p (⚡${m.complete.perSec}/s · valid 7 days).`}</p>}
      </div>
    );
  };

  // ── NANOJUTSU PANEL (Jutsu tab) ──
  const jutsuModel = findVideoModel("nanojutsu");
  const jutsuMd = pickMode(jutsuModel, jutsuMode);
  const jutsuResNow = pickRes(jutsuModel, jutsuRes);
  const jutsuSecs = jutsuVideo?.duration || 0;
  const curJutsuCost = jutsuSecs ? videoCredits(jutsuModel, 0, jutsuResNow, jutsuSecs, jutsuMd.id) : 0; // 0 = no video yet → nothing to charge
  const jutsuFrom = videoCredits(jutsuModel, 0, jutsuResNow, jutsuMd.minSourceSec || 4, jutsuMd.id);   // price of the shortest clip
  const curJutsuBlocked = !jutsuVideo?.url || jutsuImages.length === 0 || vidRefUploadingN > 0;

  const renderJutsuPanel = () => {
    const card = { background: "#16161d", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14 };
    const isSwap = jutsuMd.id === "swap";
    const dropIcons = (icons) => (
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        {icons.map((ic, i) => <span key={i} style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(180deg,#2a2a34,#1a1a22)", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, marginLeft: i ? -8 : 0, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>{ic}</span>)}
      </div>
    );
    const thumb = (src, onRemove, label, isVideo) => (
      <div style={{ position: "relative", width: 56, height: 56, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", flexShrink: 0, background: "#0d0d14" }}>
        {isVideo ? <video src={src} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        {label && <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 8, textAlign: "center", background: "rgba(0,0,0,.65)", color: "#fff", padding: "1px 0" }}>{label}</span>}
        <button onClick={onRemove} style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
    );
    return (
      <div>
        {/* Hero */}
        <div style={{ position: "relative", height: 132, borderRadius: 16, overflow: "hidden", marginBottom: 10, background: "radial-gradient(120% 140% at 80% 10%, #b44aff55 0%, #111118 60%)", border: "1px solid rgba(255,255,255,.08)" }}>
          <video key={jutsuMd.id} src={`/models/${isSwap ? "nanojutsu_swap" : "nanojutsu"}.mp4`} autoPlay muted loop playsInline onError={e => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.78) 100%)" }} />
          <div style={{ position: "absolute", left: 14, bottom: 12 }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#e8f542", letterSpacing: -.5, fontFamily: "'Inter',sans-serif" }}>NANOJUTSU</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#d8d8e4" }}>{lang === "es" ? "Manipulación de la realidad" : "Reality manipulation"}</p>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: "#16161d", border: "1px solid rgba(255,255,255,.06)", marginBottom: 10 }}>
          {[["motion", lang === "es" ? "Transferencia de movimiento" : "Motion transfer", "◌"], ["swap", lang === "es" ? "Intercambio de objetos" : "Object swap", "⧉"]].map(([k, l, ic]) => (
            <button key={k} onClick={() => setJutsuMode(k)} title={l} style={{ flex: 1, minWidth: 0, padding: "9px 6px", borderRadius: 9, border: jutsuMd.id === k ? "1px solid rgba(255,255,255,.1)" : "1px solid transparent", background: jutsuMd.id === k ? "#24242e" : "transparent", color: jutsuMd.id === k ? "#f0f0f6" : "#6a6a82", fontSize: 12, fontWeight: jutsuMd.id === k ? 600 : 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ic} {l}</button>
          ))}
        </div>

        {/* Source video */}
        <div style={{ border: "1px dashed rgba(255,255,255,.12)", borderRadius: 14, padding: jutsuVideo ? 12 : "24px 12px", marginBottom: 10, background: "rgba(255,255,255,.015)" }}>
          {jutsuVideo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {thumb(jutsuVideo.preview, () => setJutsuVideo(null), `${Math.round(jutsuVideo.duration)}s`, true)}
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#e8e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{jutsuVideo.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: "#6a6a82" }}>@Video1 · {jutsuVideo.duration.toFixed(1)}s</p>
              </div>
            </div>
          ) : (
            <label style={{ display: "block", textAlign: "center", cursor: "pointer" }}>
              {dropIcons(["🎞️"])}
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#e8e8f0", lineHeight: 1.3 }}>
                {vidRefUploadingN > 0 ? (lang === "es" ? "⏳ Subiendo..." : "⏳ Uploading...") : isSwap ? (lang === "es" ? "Añade un video de referencia para editar" : "Add a reference video to edit") : (lang === "es" ? "Añade un video de referencia para extraer el movimiento" : "Add a reference video to extract the motion")}
              </span>
              <span style={{ display: "block", fontSize: 11, color: "#6a6a82", marginTop: 5 }}>{lang === "es" ? "Duración del video: de 4 a 30 segundos" : "Video length: 4 to 30 seconds"}</span>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                const preview = URL.createObjectURL(f);
                const dur = await new Promise(r => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => r(v.duration || 0); v.onerror = () => r(0); v.src = preview; });
                if (dur && (dur < 3.7 || dur > 30.5)) { setGenError(lang === "es" ? `El video dura ${dur.toFixed(1)}s. Debe durar de 4 a 30 segundos.` : `Video is ${dur.toFixed(1)}s. It must be 4–30 seconds.`); return; }
                setGenError("");
                addRefVideo(f, 30, (v) => setJutsuVideo(v));
              }} />
            </label>
          )}
        </div>

        {/* Reference images */}
        <div style={{ border: "1px dashed rgba(255,255,255,.12)", borderRadius: 14, padding: jutsuImages.length ? 12 : "24px 12px", marginBottom: 10, background: "rgba(255,255,255,.015)" }}>
          {jutsuImages.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {jutsuImages.map((f, i) => <span key={i}>{thumb(URL.createObjectURL(f), () => setJutsuImages(p => p.filter((_, j) => j !== i)), `@Image${i + 1}`)}</span>)}
            </div>
          )}
          {jutsuImages.length < jutsuMd.images && (
            <label style={{ display: "block", textAlign: "center", cursor: "pointer" }}>
              {!jutsuImages.length && dropIcons(["🙂", "👕", "📦"])}
              <span style={{ display: "block", fontSize: jutsuImages.length ? 12 : 14, fontWeight: 600, color: "#e8e8f0", lineHeight: 1.3 }}>
                {jutsuImages.length ? `+ ${lang === "es" ? "Añadir más" : "Add more"}` : isSwap ? (lang === "es" ? "Añade el objeto nuevo" : "Add the new object") : (lang === "es" ? "Añade tus personajes, productos o ropa" : "Add your characters, products or clothing")}
              </span>
              {!jutsuImages.length && <span style={{ display: "block", fontSize: 11, color: "#6a6a82", marginTop: 5 }}>{isSwap ? (lang === "es" ? `Fotos del objeto (varios ángulos) · hasta ${jutsuMd.images}` : `Photos of the object (several angles) · up to ${jutsuMd.images}`) : (lang === "es" ? `Hasta ${jutsuMd.images} imágenes` : `Up to ${jutsuMd.images} images`)}</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { const fs = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/")); e.target.value = ""; setJutsuImages(p => [...p, ...fs].slice(0, jutsuMd.images)); }} />
            </label>
          )}
        </div>

        {/* Prompt card with toggle */}
        <div style={{ ...card, marginBottom: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: jutsuPromptOn ? "1px solid rgba(255,255,255,.06)" : "none" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f6" }}>Prompt</span>
            <button onClick={() => setJutsuPromptOn(v => !v)} style={{ width: 40, height: 22, borderRadius: 11, border: "none", background: jutsuPromptOn ? "#e8f542" : "rgba(255,255,255,.12)", position: "relative", cursor: "pointer" }}>
              <span style={{ position: "absolute", top: 3, left: jutsuPromptOn ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </button>
          </div>
          {jutsuPromptOn && (
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
              placeholder={isSwap
                ? (lang === "es" ? "Describe qué cambiar — p. ej. 'reemplaza la taza por el termo de @Image1' o 'cambia la botella de la mesa'. Menciona las imágenes o videos adjuntos usando @..." : "Describe what to change — e.g. 'replace the mug with the bottle in @Image1'. Mention attachments with @...")
                : (lang === "es" ? "Describe tu nueva escena — p. ej. 'el personaje de @Image1 bailando en una azotea' o 'mismos movimientos, nueva ubicación: Tokio de noche'. Menciona las imágenes o videos adjuntos usando @..." : "Describe your new scene — e.g. 'the character from @Image1 dancing on a rooftop'. Mention attachments with @...")}
              style={{ width: "100%", background: "transparent", border: "none", color: "#e8e8f0", fontSize: 14, lineHeight: 1.5, resize: "none", fontFamily: "inherit", padding: "12px 14px" }} />
          )}
        </div>

        {/* Model + quality cards */}
        <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginBottom: 8 }}>
          <span>
            <span style={{ display: "block", fontSize: 10, color: "#6a6a82" }}>{lang === "es" ? "Modelo" : "Model"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#e8e8f0", fontWeight: 500, marginTop: 2 }}>
              NanoJutsu <span style={{ color: "#e8f542" }}>〰</span>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(232,245,66,.12)", color: "#e8f542" }}>{lang === "es" ? "Nuevo" : "New"}</span>
            </span>
          </span>
        </div>
        <button onClick={() => setVidPop(vidPop === "jres" ? null : "jres")} style={{ ...card, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderColor: vidPop === "jres" ? "rgba(232,196,58,.4)" : "rgba(255,255,255,.06)" }}>
          <span>
            <span style={{ display: "block", fontSize: 10, color: "#6a6a82" }}>{lang === "es" ? "Calidad" : "Quality"}</span>
            <span style={{ display: "block", fontSize: 14, color: "#e8e8f0", fontWeight: 500, marginTop: 2 }}>{jutsuResNow} <span style={{ fontSize: 11, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace", marginLeft: 6 }}>{jutsuSecs ? `⚡ ${curJutsuCost}` : `${lang === "es" ? "desde" : "from"} ⚡ ${jutsuFrom}`}</span></span>
          </span>
          <span style={{ color: "#5a5a78" }}>›</span>
        </button>
        {vidPop === "jres" && (
          <div style={{ ...card, padding: 6, marginBottom: 8 }}>
            <p style={{ fontSize: 11, color: "#6a6a82", margin: "4px 10px 6px" }}>{lang === "es" ? "Calidad" : "Quality"}</p>
            {Object.entries(jutsuModel.res).map(([k, r]) => (
              <button key={k} onClick={() => { setJutsuRes(k); setVidPop(null); }} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", borderRadius: 8, border: "none", background: jutsuResNow === k ? "rgba(255,255,255,.06)" : "transparent", color: "#e8e8f0", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                <span>{k}</span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace" }}>{jutsuSecs ? `⚡${videoCredits(jutsuModel, 0, k, jutsuSecs, jutsuMd.id)} · ${Math.ceil(jutsuSecs)}s` : `⚡${r.vin * 2}/s`}</span>
                  {jutsuResNow === k && <span>✓</span>}
                </span>
              </button>
            ))}
            <p style={{ fontSize: 10, color: "#5a5a78", margin: "6px 10px 4px" }}>{lang === "es" ? "Se cobra por segundo del video que subes (entrada + salida). Un clip corto en 480p es lo más barato; 1080p cuesta ~5× más." : "Charged per second of your uploaded video (input + output). A short 480p clip is cheapest; 1080p costs ~5× more."}</p>
          </div>
        )}
      </div>
    );
  };

  // ── NB REDESIGN v14: Higgsfield-style layout ──
  const navTabs = [
    { k: T.IMG,     label: lang==="es"?"Imagen":"Image",    color: "#00f0ff" },
    { k: T.VID,     label: lang==="es"?"Video":"Video",     color: "#b44aff" },
    { k: T.GAL,     label: lang==="es"?"Galería":"Gallery", color: "#8a8a9e" },
    { k: T.MOT,     label: "Motion",                        color: "#ff6b2b" },
    { k: T.DIR,     label: "Director",                      color: "#00f0ff" },
    { k: T.WS_IMG,  label: "Img Pro",                       color: "#ffb800" },
    { k: T.WS_VID,  label: "Vid Pro",                       color: "#00c8ff" },
    { k: T.VID_EDIT,label: "Jutsu",                         color: "#b44aff" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e2ea", fontFamily: "'Inter', 'Syne', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      {payMsg && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, padding: "10px 20px", borderRadius: 8, background: payMsg.includes("✓") ? "rgba(0,240,255,.12)" : "rgba(255,184,0,.12)", border: `1px solid ${payMsg.includes("✓") ? "rgba(0,240,255,.3)" : "rgba(255,184,0,.3)"}`, fontSize: 13, color: payMsg.includes("✓") ? "#00f0ff" : "#ffb800", whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,.5)" }}>{payMsg}</div>}
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes nudge{0%,70%,100%{transform:translateY(0)}75%{transform:translateY(-3px)}82%{transform:translateY(1px)}88%{transform:translateY(-2px)}95%{transform:translateY(0)}}*{box-sizing:border-box;margin:0}textarea::placeholder,input::placeholder{color:#3a3a4e}button:active{opacity:.85}input:focus,textarea:focus{outline:none;border-color:rgba(0,240,255,.4)!important}::selection{background:rgba(0,240,255,.15)}.nb-topnav-btn{background:none;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;padding:6px 14px;border-radius:8px;color:#5a5a78;transition:color .15s,background .15s;white-space:nowrap}.nb-topnav-btn:hover{color:#c0c0d8;background:rgba(255,255,255,.04)}.nb-topnav-btn.active{color:#e2e2ea;background:rgba(255,255,255,.07)}`}</style>

      {/* ── TOP NAV (Higgsfield-style) ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#0d0d14", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", height: 48, paddingLeft: 16, paddingRight: 16, gap: 0 }}>
        {/* Logo */}
        <div style={{ cursor: "pointer", marginRight: 20, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }} onClick={() => setPage(P.LAND)}>
          {logo(26)}
        </div>

        {/* Nav tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
          {navTabs.map(tb => (
            <button key={tb.k} onClick={() => setTab(tb.k)} className={`nb-topnav-btn${tab===tb.k?" active":""}`}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: isDesk?13:11, fontWeight: tab===tb.k?600:400, padding: isDesk?"6px 14px":"5px 10px", borderRadius: 8, color: tab===tb.k?"#e2e2ea":"#5a5a78", transition: "color .15s,background .15s", whiteSpace: "nowrap", position: "relative" }}>
              {tb.label}
              {tab===tb.k && <div style={{ position: "absolute", bottom: -1, left: "50%", transform: "translateX(-50%)", width: 20, height: 2, background: tb.color, borderRadius: 2 }} />}
            </button>
          ))}
        </div>

        {/* Right: credits + plan + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: isDesk?12:6, flexShrink: 0, marginLeft: 12 }}>
          {isDesk && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#4a4a62" }}>
              <span title={lang === "es" ? "Créditos disponibles" : "Available credits"}><span style={{ color: "#e8c23a", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>⚡ {profile?.credits ?? 0}</span> {lang === "es" ? "créditos" : "credits"}</span>
            </div>
          )}
          <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 12, background: `${hasPlan ? planData.color : "#5a5a70"}15`, border: `1px solid ${hasPlan ? planData.color : "#5a5a70"}35`, color: hasPlan ? planData.color : "#5a5a70", fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>
            {hasPlan ? (lang==="en"?planData.nameEn:planData.name) : t("no_plan_label")}
          </span>
          {hasPlan && (
            <button onClick={() => setPage(P.PLANS)} style={{ fontSize: 11, color: "#00ff88", background: "rgba(0,255,136,.06)", border: "1px solid rgba(0,255,136,.2)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              {isDesk ? t("change_plan") : "↑"}
            </button>
          )}
          <span style={{ position: "relative" }}>
            <button onClick={() => setShowTopUpMenu(v => !v)} style={{ fontSize: 11, color: "#0a0a0f", background: "linear-gradient(135deg,#e8d44d,#d4a017)", border: "none", borderRadius: 7, padding: isDesk?"5px 14px":"4px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: -.2 }}>
              {isDesk ? `${t("top_up")} ▾` : "＋"}
            </button>
            {showTopUpMenu && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 999, background: "#13131e", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 16, width: 272, boxShadow: "0 16px 48px rgba(0,0,0,.8)" }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#00f0ff", margin: "0 0 10px", letterSpacing: .5 }}>⚡ {lang === "es" ? "Packs pequeños" : "Small packs"}</p>
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {[["img_s",20,"$5.99"],["img_m",50,"$12.99"],["img_l",120,"$27.99"]].map(([id,amt,price]) => (
                    <button key={id} onClick={() => { openPack(id, profile?.email || session?.user?.email); setShowTopUpMenu(false); }} style={{ flex: 1, padding: "9px 4px", fontSize: 10, fontWeight: 700, color: "#0a0a0f", background: "linear-gradient(135deg,#00f0ff,#00b8cc)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4 }}>
                      {amt * IMG_UNIT} cr<br/><span style={{ fontSize: 9, opacity: .8 }}>{price}</span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#b44aff", margin: "0 0 10px", letterSpacing: .5 }}>⚡ {lang === "es" ? "Packs grandes" : "Large packs"}</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["vid_s",20,"$39.99"],["vid_m",30,"$57.99"],["vid_l",50,"$89.99"]].map(([id,amt,price]) => (
                    <button key={id} onClick={() => { openPack(id, profile?.email || session?.user?.email); setShowTopUpMenu(false); }} style={{ flex: 1, padding: "9px 4px", fontSize: 10, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#b44aff,#7a00ff)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4 }}>
                      {amt * VID_UNIT} cr<br/><span style={{ fontSize: 9, opacity: .8 }}>{price}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowTopUpMenu(false)} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "#5a5a70", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            )}
          </span>
          <LangSelector />
          <UserPanel />
        </div>
      </div>

      {/* ── NO PLAN BANNER ── */}
      {!hasPlan && (
        <div style={{ padding: "10px 20px", background: "rgba(255,184,0,.05)", borderBottom: "1px solid rgba(255,184,0,.12)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "#c89a00", margin: 0 }}>{t("no_plan")}</p>
          <button onClick={() => setPage(P.PLANS)} style={{ padding: "5px 16px", fontSize: 11, fontWeight: 700, color: "#0a0a0f", background: "#e8c23a", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>Elegir plan →</button>
        </div>
      )}

      {/* ── BODY: left form panel + right output panel ── */}
      <div style={{ display: "flex", flexDirection: isDesk ? "row" : "column", ...(isDesk ? { height: `calc(100vh - ${hasPlan ? 48 : 92}px)`, overflow: "hidden" } : { minHeight: "calc(100vh - 48px)" }) }}>

        {/* ── LEFT PANEL: form controls (Higgsfield left column) ── */}
        {tab !== T.GAL && (
          <div style={{ ...(isStudioTab ? { width: isDesk ? 360 : "100%", minWidth: isDesk ? 360 : "unset", maxWidth: isDesk ? 360 : "unset" } : { flex: 1, width: "100%" }), borderRight: isDesk && isStudioTab ? "1px solid rgba(255,255,255,.05)" : "none", ...(isDesk ? { height: "100%", minHeight: 0 } : {}), overflowY: "auto", background: "#0d0d14", display: "flex", flexDirection: "column" }}>

            {/* ── TAB CONTENT (form) ── */}
            <div style={{ flex: 1, padding: isStudioTab ? "16px 14px 0" : (isDesk ? "28px 32px" : "14px"), overflowY: "auto", width: "100%", maxWidth: isStudioTab ? "none" : 920, margin: "0 auto" }}>

          {(tab === T.IMG || tab === T.VID) && (
            <div style={{ animation: "fadeUp .4s ease" }}>
              {tab === T.VID && renderVideoPanel()}
              {tab === T.IMG && (() => {
                const curStyle = STYLES.find(s => s.id === style) || STYLES.find(s => s.id === "neutral");
                const planQualities = { test: ["1K"], basic: ["1K"], pro: ["1K", "2K"], creator: ["1K", "2K", "4K"] };
                const qualities = planQualities[profile?.plan] || ["1K"];
                const showQuality = qualities.length > 1 && curImgModel.kind === "nano";
                const imgFamilies = [...new Set(IMAGE_MODELS.map(m => m.family))];
                const stylesAvail = STYLES.filter(s => !s.onlyModel || s.onlyModel === curImgModel.id);
                const stylesSorted = [...stylesAvail.filter(s => s.id === "neutral"), ...stylesAvail.filter(s => s.onlyModel), ...stylesAvail.filter(s => s.id !== "neutral" && !s.onlyModel)];
                return (
                  <>
                    {imageSubTabs("img")}
                    {uiHero({ video: `${curImgModel.id}.mp4`, title: LL("Imagen", "Image"), name: curImgModel.name, color: "#e8c23a", onChange: () => setModelMenuOpen(modelMenuOpen === "imghero" ? false : "imghero") })}

                    {/* Model list (Cambiar) */}
                    {modelMenuOpen === "imghero" && (
                      <>
                        <div onClick={() => setModelMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
                        <div style={{ position: "relative", zIndex: 61, ...uiCard, padding: 6, marginBottom: 10, maxHeight: 360, overflowY: "auto", boxShadow: "0 16px 40px rgba(0,0,0,.6)" }}>
                          {imgFamilies.map(fam => (
                            <div key={fam}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: "#6a6a82", letterSpacing: 1.2, textTransform: "uppercase", padding: "8px 10px 4px", margin: 0 }}>{fam}</p>
                              {IMAGE_MODELS.filter(x => x.family === fam).map(x => {
                                const sel = x.id === curImgModel.id;
                                return (
                                  <button key={x.id} onClick={() => { setImgModelId(x.id); setModelMenuOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: sel ? "rgba(232,196,58,.1)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                                    <span style={{ flex: 1, fontSize: 13, color: sel ? "#e8c23a" : "#e0e0ec", fontWeight: sel ? 600 : 400 }}>{x.name}</span>
                                    {x.badge && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,.06)", color: "#8a8a9e" }}>{x.badge}</span>}
                                    <span style={{ fontSize: 10, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace" }}>⚡ {imageCredits(x, imgQuality, false)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Reference images */}
                    {curImgModel.maxRefs > 0 ? uiDrop({
                      title: LL("Imágenes de referencia", "Reference images"),
                      sub: LL(`Opcional · hasta ${curImgModel.maxRefs} · máx ${MAX_FILE_MB}MB · jpg, png, webp`, `Optional · up to ${curImgModel.maxRefs} · max ${MAX_FILE_MB}MB · jpg, png, webp`),
                      icons: ["🧍", "👕", "📦"],
                      accept: "image/jpeg,image/jpg,image/png,image/webp",
                      multiple: true,
                      onFiles: (fs) => setRefImages(prev => [...prev, ...fs].slice(0, curImgModel.maxRefs)),
                      canAdd: refImages.length < curImgModel.maxRefs,
                      counter: `${Math.min(refImages.length, curImgModel.maxRefs)}/${curImgModel.maxRefs}`,
                      children: refImages.length ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {refImages.map((file, i) => <span key={i}>{uiThumb(URL.createObjectURL(file), () => setRefImages(prev => prev.filter((_, idx) => idx !== i)), `@Image${i + 1}`, { warn: file.size > MAX_FILE_MB * 1024 * 1024 ? `+${MAX_FILE_MB}MB` : null })}</span>)}
                        </div>
                      ) : null,
                    }) : uiNote(LL(`${curImgModel.name} no usa imágenes de referencia.`, `${curImgModel.name} doesn't use reference images.`))}

                    {/* Prompt card */}
                    <div style={{ ...uiCard, padding: "12px 14px", marginBottom: 10 }}>
                      {uiLabel("Prompt")}
                      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder={style === "idsheet" ? LL("Opcional: notas extra del personaje (p. ej. «tatuaje en el antebrazo derecho»). El prompt completo de ID Sheet ya va incluido.", "Optional: extra character notes (e.g. “tattoo on right forearm”). The full ID Sheet prompt is already included.") : t("prompt_img")} style={uiTextarea} />
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <button onClick={() => setPrompt(SAMPLE[Math.floor(Math.random() * SAMPLE.length)])} style={{ ...uiPill(false), padding: "5px 10px", fontSize: 12 }}>🎲</button>
                        {style !== "neutral" && (
                          <button onClick={() => setStyle("neutral")} title={LL("Quitar estilo", "Remove style")} style={{ ...uiPill(true), padding: "5px 10px", fontSize: 12 }}>{curStyle.icon} {styleLabel(curStyle)} ×</button>
                        )}
                      </div>
                    </div>

                    {/* Settings */}
                    {uiSetting(LL("Modelo", "Model"), <>{curImgModel.name}{curImgModel.badge && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,.06)", color: "#8a8a9e" }}>{curImgModel.badge}</span>}</>, "imgModelCard", { full: true, onClick: () => setModelMenuOpen(modelMenuOpen === "imghero" ? false : "imghero") })}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      {uiSetting(LL("Estilo", "Style"), <>{curStyle.icon} {styleLabel(curStyle)}</>, "imgStyle")}
                      {style === "idsheet" ? uiSetting(LL("Relación de aspecto", "Aspect ratio"), LL("16:9 · fijo", "16:9 · fixed"), "imgRatioFixed", { static: true }) : uiSetting(LL("Relación de aspecto", "Aspect ratio"), ratio === "auto" ? "Auto" : ratio, "imgRatio")}
                    </div>
                    {uiPopList("imgStyle", stylesSorted.map(s => ({
                      id: s.id, icon: s.icon, label: styleLabel(s),
                      sub: s.id === "neutral" ? LL("Por defecto · tu prompt tal cual", "Default · your prompt as-is")
                        : s.id === "idsheet" ? LL("Hoja de personaje VFX 16:9 · estatura en cm · requiere fotos", "16:9 VFX character sheet · height in cm · needs photos")
                        : (s.id === "restore" || s.id === "colorize") ? LL("Requiere 1 imagen de referencia", "Needs 1 reference image") : null,
                    })), style, setStyle)}
                    {uiPopList("imgRatio", RATIOS.map(r => ({ id: r, label: r === "auto" ? "Auto" : r, icon: <RatioShape r={r} active={ratio === r} color="#e8c23a" /> })), ratio, setRatio)}
                    {style === "idsheet" && (
                      <div style={{ ...uiCard, padding: "12px 14px", marginBottom: 8, borderColor: "rgba(232,196,58,.25)" }}>
                        {uiLabel(LL("🪪 Estatura del personaje", "🪪 Character height"), "CM")}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="number" inputMode="decimal" min={40} max={260} step="0.5" value={charHeight} placeholder="170"
                            onChange={e => setCharHeight(e.target.value.replace(/[^0-9.]/g, "").slice(0, 5))}
                            style={{ flex: 1, minWidth: 0, background: "#0d0d14", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 12px", color: "#e8e8f0", fontSize: 16, fontFamily: "'JetBrains Mono',monospace", outline: "none" }} />
                          {[160, 170, 180].map(h => <button key={h} onClick={() => setCharHeight(String(h))} style={{ ...uiPill(Number(charHeight || 170) === h), padding: "8px 9px" }}>{h}</button>)}
                        </div>
                        <p style={{ fontSize: 10, color: "#6a6a82", margin: "8px 0 0", lineHeight: 1.5 }}>
                          {LL(`Se usará ${Number(charHeight) || 170} cm en la regla. Vacío = 170 cm. Formato fijo 16:9 · sube 1-14 fotos del personaje (cara, cuerpo, ropa).`, `Ruler will use ${Number(charHeight) || 170} cm. Empty = 170 cm. Fixed 16:9 · upload 1-14 photos of the character (face, body, outfit).`)}
                        </p>
                      </div>
                    )}
                    {showQuality && (
                      <>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          {uiSetting(LL("Calidad", "Quality"), imgQuality, "imgQ")}
                        </div>
                        {uiPopList("imgQ", qualities.map(q => ({ id: q, label: q, right: `⚡ ${imageCredits(curImgModel, q, refImages.length > 0 && curImgModel.maxRefs > 0, { nRefs: Math.min(refImages.length, curImgModel.maxRefs || 0), style })}` })), imgQuality, setImgQuality)}
                      </>
                    )}
                  </>
                );
              })()}

              {/* No credits — show packs for eligible plans, upgrade for others */}
              {hasPlan && ((tab === T.IMG && (profile?.credits ?? 0) < curImgCost) || (tab === T.VID && (profile?.credits ?? 0) < curVidCost)) && (() => {
                const isPackEligible = PACK_ELIGIBLE_PLANS.includes(profile?.plan);
                const isImg = tab === T.IMG;
                const imgPacks = [
                  { id: "img_s", label: "Pack S", amount: 20,  price: 5.99  },
                  { id: "img_m", label: "Pack M", amount: 50,  price: 12.99 },
                  { id: "img_l", label: "Pack L", amount: 120, price: 27.99 },
                ];
                const vidPacks = [
                  { id: "vid_s", label: "Pack S", amount: 20, price: 39.99 },
                  { id: "vid_m", label: "Pack M", amount: 30, price: 57.99 },
                  { id: "vid_l", label: "Pack L", amount: 50, price: 89.99 },
                ];
                const packs = isImg ? imgPacks : vidPacks;
                return (
                  <div style={{ padding: "16px", borderRadius: 12, background: "rgba(0,240,255,.04)", border: "1px solid rgba(0,240,255,.12)", marginBottom: 14, animation: "fadeUp .4s ease" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#e0e0f0", margin: "0 0 4px" }}>
                      {lang === "en" ? "⚡ Not enough credits" : "⚡ Sin créditos suficientes"}
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
                              <p style={{ fontSize: 15, fontWeight: 800, color: "#00f0ff", margin: "0 0 4px", fontFamily: "'JetBrains Mono',monospace" }}>+{pk.amount * (isImg ? IMG_UNIT : VID_UNIT)}</p>
                              <p style={{ fontSize: 10, color: "#8a8aaa", margin: "0 0 6px" }}>{lang === "en" ? "credits" : "créditos"}</p>
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

            </div>
          )}

          {/* ═══ MOTION CONTROL TAB ═══ */}
          {tab === T.MOT && (() => {
            const isMotionEligible = ["basic","pro","creator"].includes(profile?.plan);
            const isTestPlan = profile?.plan === "test" || !profile?.plan;
            const motionMaxDur = profile?.plan === "basic" ? 5 : profile?.plan === "pro" ? 8 : 15;
            const motionCredits = (motionVideoDuration > 10 ? 3 : 2) * VID_UNIT; // 5-10s = 120, 11-15s = 180
            const canGenMotion = isMotionEligible && motionImageUrl && motionVideoUrl && !genning && !motionUploadProgress.img && !motionUploadProgress.vid && (profile?.credits ?? 0) >= motionCredits;

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
                  const initR = await fetch("/api/upload", {
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
              // Concurrent limit check
              const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 3, creator: 4 };
              const concurrentLimit = CONCURRENT_LIMITS[profile?.plan] || 1;
              const pendingCount = gens.filter(g => g.status === "processing" && g.result_url?.includes("|") && (Date.now() - new Date(g.created_at).getTime()) < 15 * 60 * 1000).length;
              if (pendingCount >= concurrentLimit) {
                setGenError(lang === "es" ? `⏳ Tenés ${pendingCount} generación${pendingCount > 1 ? "es" : ""} en curso. Plan ${profile?.plan} permite máx ${concurrentLimit} simultánea${concurrentLimit > 1 ? "s" : ""}.` : `⏳ ${pendingCount} generation${pendingCount > 1 ? "s" : ""} in progress. Max ${concurrentLimit} for ${profile?.plan} plan.`);
                setShowConcurrentUpgrade(true);
                return;
              }
              setShowConcurrentUpgrade(false);
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
                    if (sd.status === "FAILED") { setTimeout(reloadGens, 1200); setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); setGenError((lang === "es" ? "❌ Generación fallida" : "❌ Generation failed") + (sd.error ? `: ${sd.error}` : "") + (lang === "es" ? " — Crédito devuelto." : " — Credit refunded.")); try { const u2 = await sb.getUser(session.access_token); if (u2?.id) { const p2 = await sb.getProfile(u2.id, session.access_token); if (p2) setProfile(prev => ({ ...prev, credits: p2.credits })); } } catch {} return; }
                    setGenStatus({ phase: (sd.position ?? 0) > 0 ? "queued" : "generating", position: sd.position || null, elapsed });
                    setTimeout(poll, 4000);
                  } catch { setTimeout(poll, 5000); }
                };
                setTimeout(poll, 3000);
              } catch (e) { setGenError(e.message); setGenning(false); }
            };

            const motTopUp = hasPlan && isMotionEligible && (profile?.credits ?? 0) < motionCredits;
            const motSlot = (isImg) => {
              const prev = isImg ? motionImagePreview : motionVideoPreview;
              const up = isImg ? motionUploadProgress.img : motionUploadProgress.vid;
              const ready = isImg ? motionImageUrl : motionVideoUrl;
              return (
                <label style={{ flex: 1, position: "relative", minHeight: 170, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", borderLeft: isImg ? "none" : "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
                  {prev ? (
                    <>
                      {isImg
                        ? <img src={prev} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        : <video src={prev} muted autoPlay loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                      {up && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 22, height: 22, border: "2px solid rgba(232,196,58,.3)", borderTop: "2px solid #e8c23a", borderRadius: "50%", animation: "spin .8s linear infinite", marginBottom: 4 }} />
                          <span style={{ fontSize: 10, color: "#e8c23a" }}>{LL("Subiendo...", "Uploading...")}</span>
                        </div>
                      )}
                      {!up && ready && <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(232,245,66,.9)", borderRadius: 5, padding: "2px 7px", fontSize: 10, color: "#0a0a0f", fontWeight: 700 }}>✓ {LL("Listo", "Ready")}</span>}
                      {!up && (
                        <button onClick={e => { e.preventDefault(); if (isImg) { setMotionImage(null); setMotionImageUrl(null); setMotionImagePreview(null); } else { setMotionVideo(null); setMotionVideoUrl(null); setMotionVideoPreview(null); } }} style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.7)", border: "none", color: "#fff", cursor: "pointer", fontSize: 12 }}>×</button>
                      )}
                      <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 0", fontSize: 10, textAlign: "center", background: "rgba(0,0,0,.6)", color: "#e8e8f0" }}>{isImg ? LL("Personaje", "Character") : LL("Movimiento", "Motion")}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.06)", color: "#e8c23a" }}>{LL("Requerido", "Required")}</span>
                      {uiDropIcons([isImg ? "🧍" : "🎞️"])}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0", textAlign: "center", padding: "0 8px" }}>{isImg ? LL("Tu personaje", "Your character") : LL("Video de movimiento", "Motion video")}</span>
                      <span style={{ fontSize: 10, color: "#6a6a82", marginTop: 4, textAlign: "center", padding: "0 8px" }}>{isImg ? "jpg · png · webp" : `mp4 · mov · webm · ${LL("máx", "max")} ${motionMaxDur}s`}</span>
                    </>
                  )}
                  <input type="file" accept={isImg ? "image/jpeg,image/png,image/webp" : "video/mp4,video/mov,video/webm,video/m4v"} hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadMotionFile(f, isImg); }} />
                </label>
              );
            };
            const motLabel = genning ? LL("Generando...", "Generating...")
              : (motionUploadProgress.img || motionUploadProgress.vid) ? LL("⏳ Subiendo archivos...", "⏳ Uploading files...")
              : !motionImage ? LL("Sube una imagen primero", "Upload an image first")
              : !motionVideo ? LL("Sube un video de movimiento", "Upload a motion video")
              : (!motionImageUrl || !motionVideoUrl) ? LL("Esperando upload...", "Waiting for upload...")
              : LL("🎭 Generar Motion", "🎭 Generate Motion");
            return (
              <div style={{ animation: "fadeUp .4s ease" }}>
                {videoSubTabs("motion")}
                {uiHero({ video: "motion.mp4", title: "Motion Control", name: LL("Copia el movimiento de un video a tu personaje", "Copy motion from a video onto your character"), color: "#ff6b2b", chip: `⚡ ${motionCredits}` })}
                <div style={{ position: "relative" }}>
                  {isTestPlan && uiLock("🎭", LL("Motion Control está disponible para planes Basic, Pro y Creator.", "Motion Control is available on Basic, Pro & Creator plans."), LL("Transferí movimientos reales a tus imágenes con IA.", "Transfer real movements to your images with AI."))}
                  <div style={{ opacity: isTestPlan ? 0.25 : 1, pointerEvents: isTestPlan ? "none" : "auto" }}>
                    <div style={{ ...uiCard, display: "flex", overflow: "hidden", marginBottom: 6 }}>
                      {motSlot(true)}
                      {motSlot(false)}
                    </div>
                    <p style={{ fontSize: 10, color: "#5a5a78", margin: "0 2px 10px", textAlign: "center" }}>{LL("📎 Máx 10MB por archivo · jpg, png, webp · mp4, mov, webm", "📎 Max 10MB per file · jpg, png, webp · mp4, mov, webm")}</p>
                    {motionUploadError && uiErr(motionUploadError, () => setMotionUploadError(null))}

                    {/* Prompt card */}
                    <div style={{ ...uiCard, padding: "12px 14px", marginBottom: 10 }}>
                      {uiLabel(LL("Escena (opcional)", "Scene (optional)"), `${motionPrompt.length}/500`)}
                      <textarea value={motionPrompt} onChange={e => setMotionPrompt(e.target.value)} rows={3} maxLength={500} style={uiTextarea}
                        placeholder={LL("Ej: fondo de ciudad de noche, iluminación cálida... (no describas el movimiento, el video ya lo define)", "E.g. city background at night, warm lighting... (don't describe the motion, the video defines it)")} />
                    </div>

                    {/* Settings */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      {uiSetting(LL("Orientación", "Orientation"), motionOrientation === "video" ? LL("🎬 Seguir video", "🎬 Follow video") : LL("🖼️ Seguir imagen", "🖼️ Follow image"), "motOri")}
                      {uiSetting(LL("Duración", "Duration"), motionVideoDuration > 0 ? `${motionVideoDuration.toFixed(1)}s` : LL("= tu video", "= your video"), "motDur", { static: true })}
                    </div>
                    {uiPopList("motOri", [
                      { id: "video", icon: "🎬", label: LL("Seguir video", "Follow video"), sub: LL("Mejor para baile y acciones complejas · máx 15s", "Best for dance & complex actions · max 15s") },
                      { id: "image", icon: "🖼️", label: LL("Seguir imagen", "Follow image"), sub: LL("Mejor para movimientos de cámara · máx 10s", "Best for camera moves · max 10s") },
                    ], motionOrientation, (v) => { setMotionOrientation(v); if (v === "image" && motionDur > 10) setMotionDur(10); })}
                    {uiNote(LL(`⏱ La duración es la de tu video · límite de tu plan: ${motionMaxDur}s · 5-10s = ${2 * VID_UNIT} créditos · 11-15s = ${3 * VID_UNIT}`, `⏱ Duration = your video length · plan limit: ${motionMaxDur}s · 5-10s = ${2 * VID_UNIT} credits · 11-15s = ${3 * VID_UNIT}`))}

                    {uiGenerating(T.VID, motionDur)}
                    {tab === T.MOT && uiResult(true, "Motion Control", "motion")}
                    {uiGenBar({ onClick: handleMotionGen, disabled: !canGenMotion, needTopUp: motTopUp && !genning, label: motLabel, cost: motionCredits })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Director tab */}
          {tab === T.DIR && (() => {
            const dirCredits = Math.max((dirDuration <= 5 ? 3 : dirDuration <= 10 ? 4 : 5) * VID_UNIT, 26 * dirDuration);
            const isDirEligible = ["pro","creator"].includes(profile?.plan);
            const isDirLocked = !isDirEligible;
            const primaryImage = dirImages[0];
            const canGenDir = isDirEligible && primaryImage?.url && dirPrompt.trim() && !genning && !dirUploading.img && !dirUploading.aud && (profile?.credits ?? 0) >= dirCredits;

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
                  const initR = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mime_type: mime, file_name: `dir.${isImg ? "jpg" : file.name.split(".").pop()}`, user_token: session?.access_token }) });
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
              // Concurrent limit check
              const CONCURRENT_LIMITS = { test: 1, basic: 2, pro: 3, creator: 4 };
              const concurrentLimit = CONCURRENT_LIMITS[profile?.plan] || 1;
              const pendingCount = gens.filter(g => g.status === "processing" && g.result_url?.includes("|") && (Date.now() - new Date(g.created_at).getTime()) < 15 * 60 * 1000).length;
              if (pendingCount >= concurrentLimit) {
                setGenError(lang === "es" ? `⏳ Tenés ${pendingCount} generación${pendingCount > 1 ? "es" : ""} en curso. Plan ${profile?.plan} permite máx ${concurrentLimit} simultánea${concurrentLimit > 1 ? "s" : ""}.` : `⏳ ${pendingCount} generation${pendingCount > 1 ? "s" : ""} in progress. Max ${concurrentLimit} for ${profile?.plan} plan.`);
                setShowConcurrentUpgrade(true);
                return;
              }
              setShowConcurrentUpgrade(false);
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
                      if (sd.status === "FAILED") { setTimeout(reloadGens, 1200); setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); setGenError((lang === "es" ? "❌ Generación fallida" : "❌ Generation failed") + (sd.error ? `: ${sd.error}` : "") + (lang === "es" ? " — Crédito devuelto." : " — Credit refunded.")); try { const u2 = await sb.getUser(session.access_token); if (u2?.id) { const p2 = await sb.getProfile(u2.id, session.access_token); if (p2) setProfile(prev => ({ ...prev, credits: p2.credits })); } } catch {} return; }
                      setGenStatus({ phase: (sd.position ?? 0) > 0 ? "queued" : "generating", position: sd.position || null, elapsed });
                      setTimeout(poll, 4000);
                    } catch { setTimeout(poll, 5000); }
                  };
                  setTimeout(poll, 3000);
                }
              } catch(e) { setGenError(e.message); setGenning(false); }
            };

            const dirTopUp = hasPlan && isDirEligible && (profile?.credits ?? 0) < dirCredits;
            const dirLabel = genning ? LL("Generando...", "Generating...")
              : (dirUploading.img || dirUploading.aud) ? LL("⏳ Subiendo...", "⏳ Uploading...")
              : !primaryImage ? LL("Sube una imagen primero", "Upload an image first")
              : !primaryImage.url ? LL("Esperando upload...", "Waiting for upload...")
              : !dirPrompt.trim() ? LL("Escribí una descripción", "Write a description")
              : LL("🎬 Generar Director", "🎬 Generate Director");
            return (
              <div style={{ animation: "fadeUp .4s ease" }}>
                {uiHero({ video: "director.mp4", title: "Director", name: LL("Escenas de cine con audio nativo", "Cinematic scenes with native audio"), color: "#00c8ff", chip: `⚡ ${dirCredits}` })}
                <div style={{ position: "relative" }}>
                  {isDirLocked && uiLock("🎬", LL("Director está disponible para planes Pro y Creator.", "Director is available on Pro & Creator plans."), LL("Generación cinematográfica con IA de última generación y audio nativo.", "Cinematic generation with cutting-edge AI and native audio."))}
                  <div style={{ opacity: isDirLocked ? 0.25 : 1, pointerEvents: isDirLocked ? "none" : "auto" }}>
                    {/* Mode tabs */}
                    <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: "#16161d", border: "1px solid rgba(255,255,255,.06)", marginBottom: 10 }}>
                      {[[false, LL("▥ Referencias", "▥ References")], [true, LL("▢ Frame inicial", "▢ Start frame")]].map(([v, l]) => (
                        <button key={String(v)} onClick={() => { if (v !== dirKeepFrame) { setDirKeepFrame(v); if (v) { setDirImages(prev => prev.slice(0, 1)); setDirAudios([]); } } }} style={uiModeTab(dirKeepFrame === v)}>{l}</button>
                      ))}
                    </div>

                    {uiNote(LL("⚠️ El modelo no procesa rostros de personas reales reconocibles. Usá ilustraciones, personajes animados, productos o paisajes.", "⚠️ The model can't process recognizable real people's faces. Use illustrations, animated characters, products or landscapes."), "warn")}

                    {/* Images */}
                    {uiDrop({
                      title: dirKeepFrame ? LL("Frame inicial", "Start frame") : LL("Imágenes de referencia", "Reference images"),
                      sub: dirKeepFrame ? LL("1 imagen · el video empieza exactamente con ella", "1 image · the video starts exactly on it") : LL("Hasta 9 · jpg, png, webp · usa @image1, @image2… en el prompt", "Up to 9 · jpg, png, webp · use @image1, @image2… in the prompt"),
                      icons: dirKeepFrame ? ["🏞️"] : ["🧍", "🏞️", "📦"],
                      accept: "image/jpeg,image/png,image/webp",
                      onFiles: (fs) => uploadDirFile(fs[0], true),
                      canAdd: !dirUploading.img && ((!dirKeepFrame && dirImages.length < 9) || (dirKeepFrame && dirImages.length === 0)),
                      counter: dirKeepFrame ? null : `${dirImages.length}/9`,
                      children: (dirImages.length || dirUploading.img) ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {dirImages.map((img, i) => <span key={i}>{uiThumb(img.preview, () => setDirImages(prev => prev.filter((_, j) => j !== i)), dirKeepFrame ? LL("Inicio", "Start") : `@image${i + 1}`)}</span>)}
                          {dirUploading.img && uiSpinTile()}
                        </div>
                      ) : null,
                    })}

                    {/* Audio */}
                    {!dirKeepFrame && uiDrop({
                      title: LL("Audio (opcional)", "Audio (optional)"),
                      sub: LL("Hasta 2 · mp3, wav, m4a", "Up to 2 · mp3, wav, m4a"),
                      icons: ["🔊"],
                      accept: "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac",
                      onFiles: (fs) => uploadDirFile(fs[0], false),
                      canAdd: !dirUploading.aud && dirAudios.length < 2,
                      counter: `${dirAudios.length}/2`,
                      children: (dirAudios.length || dirUploading.aud) ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {dirAudios.map((aud, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 10px", borderRadius: 9, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", maxWidth: 180 }}>
                              <span>🔊</span>
                              <span style={{ fontSize: 11, color: "#e0e0ec", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{(aud.name || "audio").slice(0, 22)}</span>
                              <button onClick={() => setDirAudios(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#8a8a9e", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
                            </div>
                          ))}
                          {dirUploading.aud && uiSpinTile(40)}
                        </div>
                      ) : null,
                    })}
                    {dirUploadError && uiErr(dirUploadError, () => setDirUploadError(null))}

                    {/* Prompt card with @image autocomplete */}
                    <div style={{ ...uiCard, padding: "12px 14px", marginBottom: 10, position: "relative" }}>
                      {uiLabel("Prompt", `${dirPrompt.length}/3500`)}
                      <textarea value={dirPrompt}
                        onChange={e => {
                          const val = e.target.value;
                          setDirPrompt(val);
                          const pos = e.target.selectionStart;
                          const match = val.slice(0, pos).match(/@image(\d*)$/);
                          if (match && dirImages.length > 0 && !dirKeepFrame) setDirMention({ query: match[1], start: pos - match[0].length });
                          else setDirMention(null);
                        }}
                        onKeyDown={e => { if (e.key === "Escape" && dirMention) { setDirMention(null); e.preventDefault(); } }}
                        onBlur={() => setTimeout(() => setDirMention(null), 150)}
                        placeholder={dirImages.length > 1
                          ? LL("Describe la escena. Escribí @image1, @image2... para referenciar tus imágenes...", "Describe the scene. Type @image1, @image2... to reference your images...")
                          : LL("Describe la escena. Escribí @image1 para referenciar tu imagen...", "Describe the scene. Type @image1 to reference your image...")}
                        rows={4} maxLength={3500} style={uiTextarea} />
                      {!dirKeepFrame && dirImages.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {dirImages.map((_, i) => <button key={i} onClick={() => setDirPrompt(p => (p ? p.trimEnd() + " " : "") + `@image${i + 1} `)} style={{ ...uiPill(false), padding: "4px 8px", fontSize: 11 }}>@image{i + 1}</button>)}
                        </div>
                      )}
                      {dirMention && dirImages.length > 0 && (() => {
                        const filtered = dirImages.map((img, i) => ({ img, num: i + 1 })).filter(({ num }) => !dirMention.query || String(num).startsWith(dirMention.query));
                        if (!filtered.length) return null;
                        const insertMention = (num) => {
                          const tag = `@image${num}`;
                          const before = dirPrompt.slice(0, dirMention.start);
                          const after = dirPrompt.slice(dirMention.start + 1 + "image".length + dirMention.query.length);
                          setDirPrompt(before + tag + (after.startsWith(" ") ? "" : " ") + after);
                          setDirMention(null);
                        };
                        return (
                          <div style={{ position: "absolute", left: 8, right: 8, top: "100%", marginTop: 4, zIndex: 50, ...uiCard, background: "#1c1c25", padding: 6, display: "flex", gap: 6, flexWrap: "wrap", boxShadow: "0 12px 30px rgba(0,0,0,.6)" }}>
                            {filtered.map(({ img, num }) => (
                              <div key={num} onMouseDown={() => insertMention(num)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 4px", borderRadius: 8, background: "rgba(232,196,58,.08)", border: "1px solid rgba(232,196,58,.25)", cursor: "pointer" }}>
                                <img src={img.preview} alt="" style={{ width: 26, height: 26, borderRadius: 5, objectFit: "cover" }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#e8c23a", fontFamily: "'JetBrains Mono',monospace" }}>@image{num}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Settings */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      {uiSetting(LL("Duración", "Duration"), `${dirDuration}s`, "dirDur")}
                      {uiSetting(LL("Relación de aspecto", "Aspect ratio"), dirAspect, "dirAspect")}
                    </div>
                    {uiPop === "dirDur" && (
                      <div style={{ ...uiCard, padding: 12, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#e8e8f0", marginBottom: 6 }}><span>{dirDuration}s</span><span style={{ color: "#e8c23a" }}>⚡ {dirCredits}</span></div>
                        <input type="range" min={5} max={15} step={1} value={dirDuration} onChange={e => setDirDuration(Number(e.target.value))} style={{ width: "100%", accentColor: "#e8f542", cursor: "pointer" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#5a5a78" }}><span>5s</span><span>10s</span><span>15s</span></div>
                        <p style={{ fontSize: 10, color: "#6a6a82", margin: "8px 0 0" }}>{LL("5s = 180 créditos · 10s = 260 · 15s = 390", "5s = 180 credits · 10s = 260 · 15s = 390")}</p>
                      </div>
                    )}
                    {uiPopList("dirAspect", ["9:16", "16:9", "1:1"].map(r => ({ id: r, label: r, icon: <RatioShape r={r} active={dirAspect === r} color="#e8c23a" /> })), dirAspect, setDirAspect)}

                    {uiGenerating(T.VID, dirDuration)}
                    {tab === T.DIR && uiResult(true, "Director", "director")}
                    {uiGenBar({ onClick: handleDirGen, disabled: !canGenDir, needTopUp: dirTopUp && !genning, label: dirLabel, cost: dirCredits })}
                  </div>
                </div>
              </div>
            );
          })()}


          {/* ── Wavespeed Img Pro (Seedream 4.5 Edit) ── */}
          {tab === T.WS_IMG && (() => {
            const canGen = !genning && !wsImgUploading && wsImgImages.length > 0 && wsImgPrompt.trim() && (profile?.credits ?? 0) >= 18;

            const uploadWsImg = async (file) => {
              if (!file) return;
              setWsImgError(null);
              if (file.type.startsWith("video/")) { setWsImgError(lang === "es" ? "Solo imágenes." : "Images only."); return; }
              if (wsImgImages.length >= 10) { setWsImgError(lang === "es" ? "Máx 10 imágenes." : "Max 10 images."); return; }
              setWsImgUploading(true);
              try {
                const dataUrl = await new Promise((res, rej) => {
                  const img = new Image();
                  img.onload = () => {
                    const MAX = 1800; let w = img.width, h = img.height;
                    if (w > MAX || h > MAX) { if (w > h) { h = Math.round((h/w)*MAX); w = MAX; } else { w = Math.round((w/h)*MAX); h = MAX; } }
                    const c = document.createElement("canvas"); c.width = w; c.height = h;
                    c.getContext("2d").drawImage(img, 0, 0, w, h);
                    res(c.toDataURL("image/jpeg", 0.88));
                  };
                  img.onerror = () => rej(new Error("Load failed"));
                  img.src = URL.createObjectURL(file);
                });
                const r = await fetch("/api/upload", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ data_url: dataUrl, user_token: session?.access_token }) });
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                setWsImgImages(prev => [...prev, { file, preview: URL.createObjectURL(file), url: d.url }]);
              } catch(e) { setWsImgError(e.message); }
              finally { setWsImgUploading(false); }
            };

            const handleWsImgGen = async () => {
              if (!canGen) return;
              setGenning(true); setGenError(null);
              setGenStatus({ phase: "queued", position: null, elapsed: 0 });
              try {
                const r = await fetch("/api/wavespeed", {
                  method: "POST", headers: {"Content-Type":"application/json"},
                  body: JSON.stringify({ action: "generate_img", prompt: wsImgPrompt.trim(), image_urls: wsImgImages.map(i => i.url), size: wsImgSize, user_token: session?.access_token }),
                });
                const data = await r.json();
                if (data.error) { setGenError(data.error); setGenning(false); return; }
                const { request_id, gen_id } = data;
                const pollStart = Date.now(); let attempts = 0;
                const poll = async () => {
                  attempts++;
                  if (attempts > 120) { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); return; }
                  try {
                    const sr = await fetch("/api/wavespeed", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "status", request_id, type: "image", user_token: session?.access_token, gen_id }) });
                    const sd = await sr.json();
                    const elapsed = Math.round((Date.now() - pollStart) / 1000);
                    if (sd.status === "COMPLETED" && sd.url) { setGenStatus({ phase: "done", position: null, elapsed }); await saveGenResult(false, { url: sd.url }); playDoneSound(); return; }
                    if (sd.status === "FAILED") { setTimeout(reloadGens, 1200); setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); setGenError((lang === "es" ? "❌ Error: " : "❌ Error: ") + (sd.error || "Failed")); try { const u2 = await sb.getUser(session.access_token); if (u2?.id) { const p2 = await sb.getProfile(u2.id, session.access_token); if (p2) setProfile(prev => ({ ...prev, credits: p2.credits })); } } catch {} return; }
                    setGenStatus({ phase: "generating", position: null, elapsed });
                    setTimeout(poll, 3000);
                  } catch { setTimeout(poll, 5000); }
                };
                setTimeout(poll, 3000);
              } catch(e) { setGenError(e.message); setGenning(false); }
            };

            const wsSizes = [["auto", "Auto"], ["2048*2048", "1:1"], ["2688*1536", "16:9"], ["1536*2688", "9:16"], ["2048*1536", "4:3"], ["1536*2048", "3:4"]];
            const wsSizeLabel = (wsSizes.find(([v]) => v === wsImgSize) || ["", wsImgSize])[1];
            const wsImgTopUp = (profile?.credits ?? 0) < 18 && !genning;
            const wsImgLabel = genning ? LL("Generando...", "Generating...")
              : wsImgUploading ? LL("⏳ Subiendo...", "⏳ Uploading...")
              : wsImgImages.length === 0 ? LL("Sube una imagen primero", "Upload an image first")
              : !wsImgPrompt.trim() ? LL("Escribí una descripción", "Write a description")
              : LL("✨ Generar", "✨ Generate");
            return (
              <div style={{ animation: "fadeUp .4s ease" }}>
                {imageSubTabs("pro")}
                {uiHero({ video: "imgpro.mp4", title: LL("Imagen Pro", "Image Pro"), name: LL("Edición avanzada · tipografía nítida · alta resolución", "Advanced editing · crisp typography · high resolution"), color: "#ffb800", chip: "⚡ 18" })}

                {uiDrop({
                  title: LL("Imágenes a editar", "Images to edit"),
                  sub: LL("Hasta 10 · jpg, png, webp", "Up to 10 · jpg, png, webp"),
                  icons: ["🧍", "🏞️", "📦"],
                  accept: "image/jpeg,image/png,image/webp",
                  multiple: true,
                  onFiles: async (fs) => { for (const f of fs.slice(0, Math.max(0, 10 - wsImgImages.length))) await uploadWsImg(f); },
                  canAdd: !wsImgUploading && wsImgImages.length < 10,
                  counter: `${wsImgImages.length}/10`,
                  children: (wsImgImages.length || wsImgUploading) ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {wsImgImages.map((img, i) => <span key={i}>{uiThumb(img.preview, () => setWsImgImages(prev => prev.filter((_, j) => j !== i)), `img ${i + 1}`)}</span>)}
                      {wsImgUploading && uiSpinTile()}
                    </div>
                  ) : null,
                })}
                {wsImgError && uiErr(wsImgError, () => setWsImgError(null))}

                {/* Prompt card */}
                <div style={{ ...uiCard, padding: "12px 14px", marginBottom: 10 }}>
                  {uiLabel(LL("Qué quieres cambiar", "What to change"), `${wsImgPrompt.length}/3500`)}
                  <textarea value={wsImgPrompt} onChange={e => setWsImgPrompt(e.target.value)} rows={4} maxLength={3500} style={uiTextarea}
                    placeholder={LL("Describe qué editar. Ej: Cambia el fondo a una ciudad de noche con neón, mantén el personaje...", "Describe what to edit. E.g. Change background to a neon night city, keep the character...")} />
                </div>

                {/* Settings */}
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {uiSetting(LL("Relación de aspecto", "Aspect ratio"), wsSizeLabel, "wsImgSize")}
                  {uiSetting(LL("Costo", "Cost"), "⚡ 18", "wsImgCost", { static: true })}
                </div>
                {uiPopList("wsImgSize", wsSizes.map(([v, r]) => ({ id: v, label: r, icon: <RatioShape r={v === "auto" ? "auto" : r} active={wsImgSize === v} color="#e8c23a" /> })), wsImgSize, setWsImgSize)}

                {uiGenerating(T.WS_IMG, 0)}
                {tab === T.WS_IMG && uiResult(false, LL("Imagen Pro", "Image Pro"), "nanobanano-img-pro")}
                {uiGenBar({ onClick: handleWsImgGen, disabled: !canGen, needTopUp: wsImgTopUp, label: wsImgLabel, cost: 18 })}
              </div>
            );
          })()}

          {/* ── Wavespeed Vid Pro (WAN 2.6 I2V Pro) ── */}
          {tab === T.WS_VID && (() => {
            const wsVidCreditTable = {
              5:  { "1080p": 2, "2k": 3, "4k": 3 },
              10: { "1080p": 3, "2k": 4, "4k": 4 },
              15: { "1080p": 3, "2k": 4, "4k": 5 },
            };
            const wsVidCredits = ((wsVidCreditTable[wsVidDuration] || wsVidCreditTable[5])[wsVidRes] ?? 2) * VID_UNIT;
            const canGen = !genning && !wsVidUploading && wsVidImage?.url && wsVidPrompt.trim() && (profile?.credits ?? 0) >= wsVidCredits;

            const uploadWsVid = async (file) => {
              if (!file) return;
              setWsVidError(null);
              if (file.type.startsWith("video/")) { setWsVidError(lang === "es" ? "Solo imágenes." : "Images only."); return; }
              setWsVidUploading(true);
              try {
                const dataUrl = await new Promise((res, rej) => {
                  const img = new Image();
                  img.onload = () => {
                    const MAX = 1800; let w = img.width, h = img.height;
                    if (w > MAX || h > MAX) { if (w > h) { h = Math.round((h/w)*MAX); w = MAX; } else { w = Math.round((w/h)*MAX); h = MAX; } }
                    const c = document.createElement("canvas"); c.width = w; c.height = h;
                    c.getContext("2d").drawImage(img, 0, 0, w, h);
                    res(c.toDataURL("image/jpeg", 0.88));
                  };
                  img.onerror = () => rej(new Error("Load failed"));
                  img.src = URL.createObjectURL(file);
                });
                const r = await fetch("/api/upload", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ data_url: dataUrl, user_token: session?.access_token }) });
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                setWsVidImage({ file, preview: URL.createObjectURL(file), url: d.url });
              } catch(e) { setWsVidError(e.message); }
              finally { setWsVidUploading(false); }
            };

            const handleWsVidGen = async () => {
              if (!canGen) return;
              setGenning(true); setGenError(null);
              setGenStatus({ phase: "queued", position: null, elapsed: 0 });
              try {
                const r = await fetch("/api/wavespeed", {
                  method: "POST", headers: {"Content-Type":"application/json"},
                  body: JSON.stringify({ action: "generate_vid", prompt: wsVidPrompt.trim(), image_url: wsVidImage.url, duration: wsVidDuration, resolution: wsVidRes, user_token: session?.access_token }),
                });
                const data = await r.json();
                if (data.error) { setGenError(data.error); setGenning(false); return; }
                const { request_id, gen_id } = data;
                const pollStart = Date.now(); let attempts = 0;
                const poll = async () => {
                  attempts++;
                  if (attempts > 150) { setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); return; }
                  try {
                    const sr = await fetch("/api/wavespeed", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "status", request_id, type: "video", user_token: session?.access_token, gen_id, credits_used: wsVidCredits }) });
                    const sd = await sr.json();
                    const elapsed = Math.round((Date.now() - pollStart) / 1000);
                    if (sd.status === "COMPLETED" && sd.url) { setGenStatus({ phase: "done", position: null, elapsed }); await saveGenResult(true, { url: sd.url }); playDoneSound(); return; }
                    if (sd.status === "FAILED") { setTimeout(reloadGens, 1200); setGenning(false); setGenStatus({ phase: "idle", position: null, elapsed: 0 }); setGenError((lang === "es" ? "❌ Error: " : "❌ Error: ") + (sd.error || "Failed")); try { const u2 = await sb.getUser(session.access_token); if (u2?.id) { const p2 = await sb.getProfile(u2.id, session.access_token); if (p2) setProfile(prev => ({ ...prev, credits: p2.credits })); } } catch {} return; }
                    setGenStatus({ phase: "generating", position: null, elapsed });
                    setTimeout(poll, 5000);
                  } catch { setTimeout(poll, 6000); }
                };
                setTimeout(poll, 5000);
              } catch(e) { setGenError(e.message); setGenning(false); }
            };

            const wsResLabel = { "1080p": "HD 1080p", "2k": "2K", "4k": "4K" };
            const wsVidTopUp = hasPlan && (profile?.credits ?? 0) < wsVidCredits && !genning;
            const wsVidCost = (d, r) => ((wsVidCreditTable[d] || wsVidCreditTable[5])[r] ?? 2) * VID_UNIT;
            const wsVidLabel = genning ? LL("Generando...", "Generating...")
              : wsVidUploading ? LL("⏳ Subiendo...", "⏳ Uploading...")
              : !wsVidImage ? LL("Sube una imagen primero", "Upload an image first")
              : !wsVidPrompt.trim() ? LL("Escribí una descripción", "Write a description")
              : LL("🌊 Generar Vid Pro", "🌊 Generate Vid Pro");
            return (
              <div style={{ animation: "fadeUp .4s ease" }}>
                {uiHero({ video: "vidpro.mp4", title: "Video Pro", name: LL("Video cinemático desde una imagen · hasta 4K", "Cinematic video from one image · up to 4K"), color: "#00c8ff", chip: `⚡ ${wsVidCredits}` })}

                {/* Start frame */}
                <div style={{ ...uiCard, marginBottom: 10, overflow: "hidden" }}>
                  <label style={{ position: "relative", minHeight: 170, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {wsVidImage ? (
                      <>
                        <img src={wsVidImage.preview} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        {wsVidUploading && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: 22, height: 22, border: "2px solid rgba(232,196,58,.3)", borderTop: "2px solid #e8c23a", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                          </div>
                        )}
                        <button onClick={e => { e.preventDefault(); setWsVidImage(null); }} style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.7)", border: "none", color: "#fff", cursor: "pointer", fontSize: 12 }}>×</button>
                        <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 0", fontSize: 10, textAlign: "center", background: "rgba(0,0,0,.6)", color: "#e8e8f0" }}>{LL("Fotograma inicial", "Start frame")}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.06)", color: "#e8c23a" }}>{LL("Requerido", "Required")}</span>
                        {uiDropIcons(["🏞️"])}
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0" }}>{LL("Fotograma inicial", "Start frame")}</span>
                        <span style={{ fontSize: 10, color: "#6a6a82", marginTop: 4 }}>jpg · png · webp</span>
                      </>
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadWsVid(f); }} />
                  </label>
                </div>
                {wsVidError && uiErr(wsVidError, () => setWsVidError(null))}

                {/* Prompt card */}
                <div style={{ ...uiCard, padding: "12px 14px", marginBottom: 10 }}>
                  {uiLabel("Prompt", `${wsVidPrompt.length}/3500`)}
                  <textarea value={wsVidPrompt} onChange={e => setWsVidPrompt(e.target.value)} rows={4} maxLength={3500} style={uiTextarea}
                    placeholder={LL("Describe el movimiento y la escena. Ej: Cámara se aleja lentamente, personaje mira hacia el horizonte, luz dorada de atardecer, cinemático...", "Describe the motion and scene. E.g. Camera slowly pulls back, character looks at the horizon, golden sunset light, cinematic...")} />
                </div>

                {/* Settings */}
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {uiSetting(LL("Duración", "Duration"), `${wsVidDuration}s`, "wsVidDur")}
                  {uiSetting(LL("Calidad", "Quality"), wsResLabel[wsVidRes] || wsVidRes, "wsVidRes")}
                </div>
                {uiPopList("wsVidDur", [5, 10, 15].map(d => ({ id: d, label: `${d}s`, right: `⚡ ${wsVidCost(d, wsVidRes)}` })), wsVidDuration, setWsVidDuration)}
                {uiPopList("wsVidRes", ["1080p", "2k", "4k"].map(r => ({ id: r, label: wsResLabel[r], right: `⚡ ${wsVidCost(wsVidDuration, r)}` })), wsVidRes, setWsVidRes)}

                {uiGenerating(T.WS_VID, wsVidDuration)}
                {tab === T.WS_VID && uiResult(true, "Video Pro", "nanobanano-vid-pro")}
                {uiGenBar({ onClick: handleWsVidGen, disabled: !canGen, needTopUp: wsVidTopUp, label: wsVidLabel, cost: wsVidCredits })}
              </div>
            );
          })()}

          {/* ── Cambio de Personaje (VID_EDIT) ── */}
          {tab === T.VID_EDIT && renderJutsuPanel()}
            </div>

          {/* ── PINNED GENERATE BUTTON (bottom of left panel) ── */}
          {(tab === T.IMG || tab === T.VID || tab === T.VID_EDIT) && (() => {
            const jobLimit = ({ test: 1, basic: 2, pro: 3, creator: 4 })[profile?.plan] || 1;
            const atLimit = activeJobs.length >= jobLimit;
            const needTopUp = hasPlan && ((tab === T.IMG && (profile?.credits ?? 0) < curImgCost) || (tab === T.VID && (profile?.credits ?? 0) < curVidCost) || (tab === T.VID_EDIT && (profile?.credits ?? 0) < curJutsuCost));
            return (
            <div style={{ padding: "12px 14px 16px", borderTop: "1px solid rgba(255,255,255,.05)", background: "#0d0d14", flexShrink: 0 }}>
              <button onClick={!hasPlan ? () => setPage(P.PLANS) : needTopUp ? () => (PACK_ELIGIBLE_PLANS.includes(profile?.plan) ? setShowTopUpMenu(true) : setPage(P.PLANS)) : handleGen} disabled={!needTopUp && hasPlan && (genBtnLocked || atLimit || (tab === T.VID && curVidBlocked) || (tab === T.VID_EDIT && curJutsuBlocked) || (!prompt.trim() && tab !== T.VID_EDIT && !NO_PROMPT_STYLES.includes(style)) || (style === "restore" || style === "colorize" ? refImages.length === 0 : false) || (tab === T.IMG && (profile?.credits ?? 0) < curImgCost) || (tab === T.VID && (profile?.credits ?? 0) < curVidCost))}
                style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700, letterSpacing: -.2, color: "#0a0a0f", background: !hasPlan ? "linear-gradient(135deg,#e8c23a,#d4a017)" : atLimit || (!prompt.trim() && tab !== T.VID_EDIT && !NO_PROMPT_STYLES.includes(style)) ? "rgba(255,255,255,.06)" : tab === T.IMG ? (maxRealism ? "linear-gradient(135deg,#ffb800,#ff8800)" : "linear-gradient(135deg,#e8d44d,#c8a800)") : "linear-gradient(135deg,#b44aff,#8a2be2)", border: "none", borderRadius: 10, cursor: (genBtnLocked && hasPlan) ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: !hasPlan ? "0 0 20px rgba(232,196,61,.3)" : atLimit || (!prompt.trim() && tab !== T.VID_EDIT && !NO_PROMPT_STYLES.includes(style)) ? "none" : tab === T.IMG ? "0 0 24px rgba(232,196,61,.35)" : "0 0 24px rgba(180,74,255,.3)", color: atLimit || (!prompt.trim() && tab !== T.VID_EDIT && !NO_PROMPT_STYLES.includes(style)) ? "#4a4a62" : "#0a0a0f" }}>
                {!hasPlan ? t("plan_for_gen") : atLimit ? (lang === "es" ? `Límite: ${jobLimit} simultánea${jobLimit > 1 ? "s" : ""} en curso` : `Limit: ${jobLimit} running`) : genBtnLocked ? t("loading") : NO_PROMPT_STYLES.includes(style) && refImages.length === 0 ? (lang === "es" ? "Sube imagen de referencia" : "Upload reference image") : (() => { const c = tab === T.IMG ? curImgCost : tab === T.VID_EDIT ? curJutsuCost : curVidCost; const have = profile?.credits ?? 0; if (tab === T.VID_EDIT && !c) return lang === "es" ? `Sube un video · desde ⚡ ${jutsuFrom}` : `Upload a video · from ⚡ ${jutsuFrom}`; const vLabel = tab === T.VID_EDIT ? (lang === "es" ? "Generar" : "Generate") : curVidModel.draft ? (lang === "es" ? "Generar borrador" : "Generate draft") : (lang === "es" ? "Generar" : "Generate"); return have < c ? (PACK_ELIGIBLE_PLANS.includes(profile?.plan) ? (lang === "es" ? `⚡ Recargar créditos · necesitas ${c}` : `⚡ Top up credits · need ${c}`) : (lang === "es" ? `Mejorar plan · necesitas ${c} créditos` : `Upgrade plan · need ${c} credits`)) : (lang === "es" ? `${tab === T.IMG ? "Generar imagen" : vLabel} · ⚡ ${c}` : `${tab === T.IMG ? "Generate image" : vLabel} · ⚡ ${c}`); })()}
              </button>
              {activeJobs.length > 0 && <div style={{ marginTop: 9, fontSize: 11, color: "#6a6a82", textAlign: "center" }}>{lang === "es" ? `${activeJobs.length}/${jobLimit} generando · puedes seguir creando` : `${activeJobs.length}/${jobLimit} generating · keep creating`}</div>}
              {genError && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 7, background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", fontSize: 11, color: "#ff4d6a", textAlign: "center" }}>
                {genError}
                {showConcurrentUpgrade && (
                  <div style={{ marginTop: 6 }}>
                    <button onClick={() => { setGenError(""); setShowConcurrentUpgrade(false); setPage(P.PLANS); }} style={{ fontSize: 11, fontWeight: 700, color: "#e8c23a", background: "rgba(232,196,58,.08)", border: "1px solid rgba(232,196,58,.2)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      {lang === "es" ? "⚡ Mejorar plan →" : "⚡ Upgrade plan →"}
                    </button>
                  </div>
                )}
              </div>}
            </div>
            );
          })()}
        </div>
        )}

        {/* ── RIGHT OUTPUT PANEL: Higgsfield-style thumbnail feed ── */}
        {isStudioTab && (
          <div style={{ flex: 1, minWidth: 0, ...(isDesk ? { height: "100%", overflowY: "auto" } : {}), padding: isDesk ? "20px 24px 40px" : "14px", background: "#0a0a0f" }}>
            {(() => {
              const wantType = (tab === T.IMG || tab === T.WS_IMG) ? "image" : "video";
              const feed = gens.filter(g => g.type === wantType && (g.status === "processing" ? (activeJobs.length === 0 && Date.now() - new Date(g.created_at).getTime() < 15 * 60 * 1000) : g.status === "failed" ? (Date.now() - new Date(g.created_at).getTime() < 7 * 24 * 3600 * 1000) : (g.status !== "dismissed" && !!g.url)));
              const tile = { position: "relative", aspectRatio: "3 / 4", borderRadius: 10, overflow: "hidden", background: "#13131a", border: "1px solid rgba(255,255,255,.05)", cursor: "pointer" };
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e2ea" }}>{wantType === "image" ? (lang === "es" ? "Tus imágenes" : "Your images") : (lang === "es" ? "Tus videos" : "Your videos")} <span style={{ fontSize: 11, color: "#4a4a62", fontWeight: 400, marginLeft: 6 }}>{feed.length}</span></p>
                    {feed.length > 0 && <button onClick={() => setTab(T.GAL)} style={{ fontSize: 11, color: "#8a8a9e", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{lang === "es" ? "Ver galería →" : "View gallery →"}</button>}
                  </div>
                  {feed.length === 0 && activeJobs.filter(j => j.type === wantType).length === 0 ? (
                    <div style={{ height: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: .35 }}>
                      <div style={{ fontSize: 44, marginBottom: 10 }}>{wantType === "image" ? "🖼️" : "🎬"}</div>
                      <p style={{ fontSize: 13, color: "#5a5a78" }}>{lang === "es" ? "Tus creaciones aparecerán aquí" : "Your creations will appear here"}</p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isDesk ? 170 : 110}px, 1fr))`, gap: 8 }}>
                      {activeJobs.filter(j => j.type === wantType).map(j => (
                        <div key={j.id} style={{ ...tile, cursor: "default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 12, border: "1px solid rgba(232,196,58,.25)" }}>
                          <div style={{ width: 22, height: 22, border: "2px solid rgba(232,196,58,.2)", borderTop: "2px solid #e8c23a", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                          <span style={{ fontSize: 10, color: "#8a8a9e" }}>{lang === "es" ? "Generando…" : "Generating…"}</span>
                          {j.prompt && <span style={{ fontSize: 9, color: "#4a4a62", textAlign: "center", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{j.prompt}</span>}
                        </div>
                      ))}
                      {feed.slice(0, visibleCount).map(g => {
                        const gi = gens.indexOf(g);
                        const ready = g.url && g.status !== "processing" && g.status !== "failed";
                        if (g.status === "failed") {
                          const isNsfw = g.fail_reason === "nsfw";
                          const chip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", color: "#e8e8f0", fontSize: 12, fontWeight: 600, width: "fit-content" };
                          return (
                            <div key={g.id || gi} style={{ ...tile, cursor: "default", background: "linear-gradient(180deg, rgba(120,40,40,.22) 0%, #16161d 28%)", display: "flex", flexDirection: "column", gap: 8, padding: 12 }} title={g.prompt || ""}>
                              <span style={chip}>{isNsfw ? "🚫 NSFW" : "⚠️ Error"}</span>
                              {g.refunded
                                ? <span style={chip}>ⓘ {lang === "es" ? "Créditos reembolsados" : "Credits refunded"}</span>
                                : <span style={{ ...chip, color: "#9a9ab0", fontWeight: 500 }}>ⓘ {lang === "es" ? "Sin reembolso" : "No refund"}</span>}
                              {g.prompt && <span style={{ fontSize: 10, color: "#5a5a72", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", marginTop: "auto" }}>{g.prompt}</span>}
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button onClick={() => deleteGenPermanent(g)} disabled={deleting} title={lang === "es" ? "Eliminar" : "Delete"} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "#e8e8f0", cursor: "pointer" }}>✕</button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={g.id || gi} onClick={() => ready && openPreview(g, gi)} style={tile}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,.05)"; }}>
                            {ready ? (
                              g.type === "image"
                                ? <img src={g.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { e.currentTarget.style.display = "none"; }} />
                                : <video src={g.url} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <div style={{ width: 20, height: 20, border: "2px solid rgba(232,196,58,.2)", borderTop: "2px solid #e8c23a", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                              </div>
                            )}
                            {favorites[g.id] && <div style={{ position: "absolute", top: 6, right: 6, fontSize: 11 }}>❤️</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {visibleCount < feed.length && <div ref={tab !== T.GAL ? gallerysentinel : undefined} style={{ height: 30 }} />}
                </>
              );
            })()}
          </div>
        )}

        {/* ── GALLERY FULLSCREEN ── */}
        {tab === T.GAL && (
          <div style={{ flex: 1, minWidth: 0, ...(isDesk ? { height: "100%" } : {}), padding: isDesk ? "24px 28px" : "14px", overflowY: "auto", background: "#0a0a0f" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e2ea" }}>{lang === "es" ? "Tu galería" : "Your gallery"} <span style={{ fontSize: 11, color: "#4a4a62", fontWeight: 400, marginLeft: 6 }}>{gens.length} {lang === "es" ? "creaciones" : "creations"}</span></p>
            </div>
            {gens.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12, opacity: .4 }}>
                <div style={{ fontSize: 48 }}>📁</div>
                <p style={{ fontSize: 13, color: "#5a5a78" }}>{lang === "es" ? "Sin creaciones aún" : "No creations yet"}</p>
              </div>
            ) : (
              <>
                <div style={{ columns: isDesk ? "4 220px" : "2 140px", gap: 8 }}>
                  {gens.filter(g => g.status !== "failed" && g.status !== "dismissed").slice(0, visibleCount).map((g, i) => (
                    <div key={g.id || i} onClick={() => openPreview(g, gens.indexOf(g))} style={{ breakInside: "avoid", marginBottom: 8, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,.05)", cursor: "pointer", transition: "opacity .15s" }} onMouseEnter={e => e.currentTarget.style.opacity = ".8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      {g.url && g.status !== "processing" ? (
                        g.type === "image" ? <img src={g.url} alt="" loading="lazy" style={{ width: "100%", display: "block" }} onError={e => { e.currentTarget.parentElement.style.display = "none"; }} /> : <video src={g.url} muted style={{ width: "100%", display: "block" }} onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }} />
                      ) : (
                        <div style={{ height: 140, background: "rgba(255,255,255,.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                          {g.status === "processing" ? <div style={{ width: 22, height: 22, border: "2px solid rgba(0,240,255,.2)", borderTop: "2px solid #00f0ff", borderRadius: "50%", animation: "spin .8s linear infinite" }} /> : (g.type === "image" ? "🖼️" : "🎬")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {visibleCount < gens.length && <div ref={gallerysentinel} style={{ height: 40 }} />}
              </>
            )}
          </div>
        )}
      </div>

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
                {previewItem.draft_id && (() => {
                    const dm = findVideoModel(previewItem.model_id || "seedance25_draft");
                    if (!dm.complete) return null;
                    const c = draftCompleteCredits(dm, previewItem.duration_sec || 5);
                    return (
                      <button onClick={() => handleDraftComplete(previewItem)} disabled={(profile?.credits ?? 0) < c}
                        style={{ flex: 1, padding: "10px", fontSize: 12, fontWeight: 800, color: "#0a0a0f", background: "#e8f542", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: (profile?.credits ?? 0) < c ? .5 : 1 }}>
                        {lang === "es" ? "GENERAR EN 1080P" : "RENDER IN 1080P"} · ⚡ {c}
                      </button>
                    );
                  })()}
                {previewItem.url && (
                  <button data-download-btn onClick={() => downloadFile(previewItem.url, `nanobanano-${previewItem.type}-${Date.now()}.${previewItem.type === "image" ? "png" : "mp4"}`)} style={{ flex: 1, padding: "10px", fontSize: 12, fontWeight: 700, color: "#06060e", background: "linear-gradient(135deg, #00f0ff, #00c8ff)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>↓ {t("download")}</button>
                )}
                <button onClick={() => setDeleteConfirm(previewItem)} title={lang === "es" ? "Eliminar" : "Delete"}
                  style={{ padding: "10px 13px", fontSize: 14, color: "#ff6b81", background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.25)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
                <button onClick={() => setPreviewItem(null)} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#5a5a70", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>{t("close")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div onClick={() => !deleting && setDeleteConfirm(null)} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: "#16161d", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 22, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.7)" }}>
            <div style={{ width: 46, height: 46, margin: "0 auto 12px", borderRadius: "50%", background: "rgba(255,77,106,.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ff6b81" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f6", margin: "0 0 6px" }}>{lang === "es" ? `¿Eliminar este ${deleteConfirm.type === "video" ? "video" : "imagen"}?` : `Delete this ${deleteConfirm.type}?`}</p>
            <p style={{ fontSize: 12, color: "#8a8a9e", margin: "0 0 18px", lineHeight: 1.5 }}>{lang === "es" ? "Se borrará permanentemente de tu galería. Esta acción no se puede deshacer." : "It will be permanently removed from your gallery. This can't be undone."}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting} style={{ flex: 1, padding: "11px", fontSize: 13, fontWeight: 600, color: "#c0c0d0", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>{lang === "es" ? "Cancelar" : "Cancel"}</button>
              <button onClick={async () => { const ok = await deleteGenPermanent(deleteConfirm); if (ok) { setDeleteConfirm(null); setPreviewItem(null); setPreviewIndex(null); } }} disabled={deleting}
                style={{ flex: 1, padding: "11px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#e5484d", border: "none", borderRadius: 10, cursor: deleting ? "wait" : "pointer", fontFamily: "inherit", opacity: deleting ? .7 : 1 }}>
                {deleting ? (lang === "es" ? "Eliminando..." : "Deleting...") : (lang === "es" ? "Eliminar" : "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <TxHistoryModal />
      <CancelModal />
      <PaymentFailedModal />
    </div>
  );
}
