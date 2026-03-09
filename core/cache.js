/**
 * cache.js — Couche de cache IA
 * Utilise Redis si disponible, sinon cache in-memory.
 * Durée : 24h par défaut.
 */

const CACHE_TTL = 24 * 60 * 60; // 24 heures en secondes

// ─── Cache in-memory (fallback) ──────────────────────────────────────────────
const memoryCache = new Map();

const memoryStore = {
  get: (key) => {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    return entry.value;
  },
  set: (key, value, ttl = CACHE_TTL) => {
    memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  },
  del: (key) => memoryCache.delete(key),
  size: () => memoryCache.size,
};

// ─── Redis (si disponible) ────────────────────────────────────────────────────
let redisClient = null;

const initRedis = async () => {
  if (!process.env.REDIS_URL) return false;
  try {
    const { createClient } = require("redis");
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (err) => {
      console.warn("⚠️ Redis error, fallback in-memory:", err.message);
      redisClient = null;
    });
    await redisClient.connect();
    console.log("✅ Redis connecté");
    return true;
  } catch (err) {
    console.warn("⚠️ Redis non disponible, utilisation du cache in-memory");
    redisClient = null;
    return false;
  }
};

// ─── Interface unifiée ────────────────────────────────────────────────────────
const cache = {
  /**
   * Récupère une valeur du cache
   */
  get: async (key) => {
    if (redisClient) {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    }
    return memoryStore.get(key);
  },

  /**
   * Stocke une valeur dans le cache
   */
  set: async (key, value, ttl = CACHE_TTL) => {
    if (redisClient) {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } else {
      memoryStore.set(key, value, ttl);
    }
  },

  /**
   * Supprime une entrée du cache
   */
  del: async (key) => {
    if (redisClient) {
      await redisClient.del(key);
    } else {
      memoryStore.del(key);
    }
  },

  /**
   * Génère une clé de cache pour une réponse IA
   * Format : ai:{merchantId}:{hash_du_message}
   */
  aiKey: (merchantId, messageText) => {
    const crypto = require("crypto");
    const hash = crypto.createHash("md5").update(messageText.toLowerCase().trim()).digest("hex");
    return `ai:${merchantId}:${hash}`;
  },

  /**
   * Récupère une réponse IA cachée
   */
  getAiResponse: async (merchantId, messageText) => {
    const key = cache.aiKey(merchantId, messageText);
    const cached = await cache.get(key);
    if (cached) {
      console.log(`💾 Cache HIT — merchant:${merchantId} msg:"${messageText.substring(0, 30)}..."`);
    }
    return cached;
  },

  /**
   * Stocke une réponse IA dans le cache
   */
  setAiResponse: async (merchantId, messageText, response) => {
    const key = cache.aiKey(merchantId, messageText);
    await cache.set(key, response, CACHE_TTL);
    console.log(`💾 Cache SET — merchant:${merchantId}`);
  },

  isRedis: () => !!redisClient,
};

// Initialiser Redis au démarrage
initRedis();

module.exports = cache;
