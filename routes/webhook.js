const express = require("express");
const router = express.Router();
const { handleMessage } = require("../core/router");
const { verifySignature, parseWebhook } = require("../core/whatsappClient");
const { addMessageToQueue, startWorker } = require("../core/queue");
const { checkRateLimit } = require("../middleware/rateLimiter");
const cache = require("../core/cache");

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "my_verify_token";

// ─── Démarrer le worker de traitement ─────────────────────────────────────────
startWorker(async (messageData) => {
  const { phoneNumberId, from, content, messageId, merchantId } = messageData;

  // 1. Vérifier le cache IA
  const cached = await cache.getAiResponse(merchantId || phoneNumberId, content);
  if (cached) {
    console.log(`💾 Réponse IA depuis cache pour ${from}`);
    // Utiliser la réponse cachée directement
    messageData._cachedResponse = cached;
  }

  // 2. Traiter le message
  await handleMessage({
    phoneNumberId,
    from,
    content,
    messageId,
    cachedResponse: cached || null,
  });
});

// ─── Vérification initiale du webhook par Meta ────────────────────────────────
router.get("/", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook WhatsApp vérifié");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Réception des messages entrants ──────────────────────────────────────────
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  // Vérifier la signature Meta
  const signature = req.headers["x-hub-signature-256"] || "";
  if (!verifySignature(req.body, signature)) {
    console.warn("⚠️ Signature webhook invalide");
    return res.sendStatus(403);
  }

  // Répondre immédiatement à Meta (obligatoire < 20s)
  res.sendStatus(200);

  const data = JSON.parse(req.body);
  const messages = parseWebhook(data);

  const { Merchant } = require("../models/index");

  for (const msg of messages) {
    // Rate limiting par numéro client
    const rateCheck = await checkRateLimit(msg.from);
    if (!rateCheck.allowed) {
      console.warn(`🚫 Message ignoré — ${msg.from} rate limited (retry in ${rateCheck.retryAfter}s)`);
      continue;
    }

    // Vérifier que le commerçant est actif
    const merchant = await Merchant.findOne({
      where: { phoneNumberId: msg.phoneNumberId },
      attributes: ["id", "name", "isActive"],
    }).catch(() => null);

    if (!merchant) {
      console.warn(`⚠️ Aucun commerçant trouvé pour phoneNumberId: ${msg.phoneNumberId}`);
      continue;
    }

    if (!merchant.isActive) {
      console.log(`⛔ Message ignoré — boutique suspendue : ${merchant.name}`);
      continue;
    }

    // Ajouter à la queue avec merchantId
    await addMessageToQueue({
      phoneNumberId: msg.phoneNumberId,
      from: msg.from,
      content: msg.content,
      messageId: msg.messageId,
      merchantId: merchant.id,
    });
  }
});

module.exports = router;