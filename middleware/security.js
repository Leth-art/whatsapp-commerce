/**
 * security.js — Middlewares de sécurité centralisés
 * À importer dans app.js
 */

const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

// ─── 1. Helmet — Headers HTTP sécurisés ──────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // désactivé car on sert du HTML inline
  crossOriginEmbedderPolicy: false,
});

// ─── 2. Rate limiting global ──────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Réessayez dans 15 minutes." },
  skip: (req) => req.path.startsWith("/webhook"), // webhook géré séparément
});

// ─── 3. Rate limiting strict pour onboarding (anti-spam inscription) ─────────
const onboardingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // max 5 inscriptions par IP par heure
  message: { error: "Trop d'inscriptions depuis cette adresse. Réessayez dans 1 heure." },
});

// ─── 4. Rate limiting pour l'API ─────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: "Limite API dépassée. Réessayez dans 1 minute." },
});

// ─── 5. Sanitisation des inputs ───────────────────────────────────────────────
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "string") {
        // Supprime les caractères dangereux
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/javascript:/gi, "")
          .trim();
      } else if (typeof obj[key] === "object") {
        sanitize(obj[key]);
      }
    }
    return obj;
  };
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  next();
};

// ─── 6. Validation UUID ───────────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateMerchantId = (req, res, next) => {
  const id = req.params.id || req.params.merchantId || req.params.mid;
  if (id && !UUID_REGEX.test(id)) {
    return res.status(400).json({ error: "ID invalide" });
  }
  next();
};

// ─── 7. CORS sécurisé ─────────────────────────────────────────────────────────
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = [
    process.env.APP_BASE_URL,
    "https://whatsapp-commerce-1roe.onrender.com",
    "https://chatbot-saas-lcsl.onrender.com",
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
};

// ─── 8. Logger sécurité (sans données sensibles) ─────────────────────────────
const securityLogger = (req, res, next) => {
  const sensitive = ["password", "token", "key", "secret", "authorization"];
  const isSensitive = sensitive.some(s => req.path.toLowerCase().includes(s));
  if (!isSensitive) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} — IP: ${req.ip}`);
  }
  next();
};

module.exports = {
  helmetMiddleware,
  globalLimiter,
  onboardingLimiter,
  apiLimiter,
  sanitizeInput,
  validateMerchantId,
  corsMiddleware,
  securityLogger,
};