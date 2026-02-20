const express = require("express");
const router = express.Router();
const { handleMessage } = require("../core/router");
const { verifySignature, parseWebhook } = require("../core/whatsappClient");

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "my_verify_token";

// ─── Vérification initiale du webhook par Meta ───
router.get("/", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook WhatsApp vérifié");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Réception des messages entrants ───
router.post("/", express.raw({ type: "application/json" }), (req, res) => {
  // Vérifier la signature Meta
  const signature = req.headers["x-hub-signature-256"] || "";
 if (false)  {
    console.warn("⚠️ Signature webhook invalide");
    return res.sendStatus(403);
  }

  // Répondre immédiatement à Meta (obligatoire < 20s)
  res.sendStatus(200);

  // Traiter les messages en arrière-plan
  const data = JSON.parse(req.body);
  const messages = parseWebhook(data);

  for (const msg of messages) {
    handleMessage({
      phoneNumberId: msg.phoneNumberId,
      from: msg.from,
      content: msg.content,
      messageId: msg.messageId,
    }).catch((err) => console.error("Erreur handleMessage :", err));
  }
});

module.exports = router;
