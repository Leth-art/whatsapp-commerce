/**
 * rateLimiter.js — Rate limiting par numéro client WhatsApp
 * Limite : 10 messages/minute par numéro
 * Stockage : Redis si dispo, sinon in-memory
 */

const RATE_LIMIT = {
  MAX_MESSAGES: 10,       // max messages autorisés
  WINDOW_SECONDS: 60,     // fenêtre de temps en secondes
  BLOCK_SECONDS: 60,      // durée de blocage si dépassé
};

// ─── Store in-memory fallback ─────────────────────────────────────────────────
const memStore = new Map(); // { phone: { count, windowStart, blocked, blockedUntil } }

const cleanMemStore = () => {
  const now = Date.now();
  for (const [key, val] of memStore.entries()) {
    if (now > val.windowStart + RATE_LIMIT.WINDOW_SECONDS * 1000 + 10000) {
      memStore.delete(key);
    }
  }
};
setInterval(cleanMemStore, 60000); // nettoyage toutes les minutes

// ─── Redis ────────────────────────────────────────────────────────────────────
let redisClient = null;
try {
  if (process.env.REDIS_URL) {
    const { createClient } = require("redis");
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.connect().catch(() => { redisClient = null; });
  }
} catch { redisClient = null; }

// ─── Logique principale ───────────────────────────────────────────────────────

/**
 * Vérifie si un numéro peut envoyer un message
 * @returns { allowed: boolean, remaining: number, retryAfter: number }
 */
const checkRateLimit = async (phoneNumber) => {
  const now = Date.now();
  const key = `rate:${phoneNumber}`;
  const blockKey = `block:${phoneNumber}`;

  if (redisClient) {
    // ── Redis ──────────────────────────────────────────────────────────────
    // Vérifier si bloqué
    const blocked = await redisClient.get(blockKey);
    if (blocked) {
      const ttl = await redisClient.ttl(blockKey);
      console.warn(`🚫 Rate limit — ${phoneNumber} bloqué encore ${ttl}s`);
      return { allowed: false, remaining: 0, retryAfter: ttl };
    }

    // Incrémenter le compteur dans la fenêtre
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, RATE_LIMIT.WINDOW_SECONDS);
    }

    if (count > RATE_LIMIT.MAX_MESSAGES) {
      // Bloquer le numéro
      await redisClient.setEx(blockKey, RATE_LIMIT.BLOCK_SECONDS, "1");
      await redisClient.del(key);
      console.warn(`🚫 Rate limit dépassé — ${phoneNumber} bloqué ${RATE_LIMIT.BLOCK_SECONDS}s`);
      return { allowed: false, remaining: 0, retryAfter: RATE_LIMIT.BLOCK_SECONDS };
    }

    const remaining = RATE_LIMIT.MAX_MESSAGES - count;
    return { allowed: true, remaining, retryAfter: 0 };

  } else {
    // ── In-memory ──────────────────────────────────────────────────────────
    let entry = memStore.get(key) || { count: 0, windowStart: now, blocked: false, blockedUntil: 0 };

    // Vérifier si bloqué
    if (entry.blocked && now < entry.blockedUntil) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      console.warn(`🚫 Rate limit — ${phoneNumber} bloqué encore ${retryAfter}s`);
      return { allowed: false, remaining: 0, retryAfter };
    }

    // Reset fenêtre si expirée
    if (now - entry.windowStart > RATE_LIMIT.WINDOW_SECONDS * 1000) {
      entry = { count: 0, windowStart: now, blocked: false, blockedUntil: 0 };
    }

    entry.count++;

    if (entry.count > RATE_LIMIT.MAX_MESSAGES) {
      entry.blocked = true;
      entry.blockedUntil = now + RATE_LIMIT.BLOCK_SECONDS * 1000;
      memStore.set(key, entry);
      console.warn(`🚫 Rate limit dépassé — ${phoneNumber} bloqué ${RATE_LIMIT.BLOCK_SECONDS}s`);
      return { allowed: false, remaining: 0, retryAfter: RATE_LIMIT.BLOCK_SECONDS };
    }

    memStore.set(key, entry);
    const remaining = RATE_LIMIT.MAX_MESSAGES - entry.count;
    return { allowed: true, remaining, retryAfter: 0 };
  }
};

/**
 * Middleware Express pour rate limiting via IP (routes API)
 */
const rateLimitMiddleware = async (req, res, next) => {
  const identifier = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const result = await checkRateLimit(`api:${identifier}`);

  if (!result.allowed) {
    return res.status(429).json({
      error: "Trop de requêtes. Réessayez dans " + result.retryAfter + " secondes.",
      retryAfter: result.retryAfter,
    });
  }

  res.setHeader("X-RateLimit-Remaining", result.remaining);
  next();
};

module.exports = { checkRateLimit, rateLimitMiddleware, RATE_LIMIT };
