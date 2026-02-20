const express = require("express");
const router = express.Router();
const Merchant = require("../models/Merchant");
const {
  PLANS,
  createSubscriptionPayment,
  verifyPayment,
  verifyWebhookSignature,
  activateMerchantSubscription,
} = require("../modules/payments");

// Liste les plans disponibles
router.get("/plans", (req, res) => {
  const plans = Object.entries(PLANS).map(([key, info]) => ({
    plan: key,
    label: info.label,
    priceFcfa: info.price,
    duration: "30 jours",
    description: info.description,
  }));
  res.json(plans);
});

// Initier un paiement d'abonnement
router.post("/initiate", async (req, res) => {
  try {
    const { merchantId, plan } = req.body;

    const merchant = await Merchant.findById(merchantId);
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });
    if (!merchant.email) return res.status(400).json({ error: "Email du commerçant requis pour le paiement." });
    if (!PLANS[plan]) return res.status(400).json({ error: `Plan invalide. Choisir parmi : ${Object.keys(PLANS).join(", ")}` });

    const result = await createSubscriptionPayment({
      merchantId: merchant._id,
      merchantName: merchant.name,
      merchantEmail: merchant.email,
      plan,
    });

    // Sauvegarder l'ID du paiement en cours
    merchant.lastPaymentId = result.paymentId;
    await merchant.save();

    res.json({
      success: true,
      checkoutUrl: result.checkoutUrl,  // ← Rediriger le commerçant ici
      paymentId: result.paymentId,
      plan,
      amount: PLANS[plan].price,
      currency: "XOF",
    });
  } catch (err) {
    res.status(502).json({ error: `Erreur Moneroo : ${err.message}` });
  }
});

// Callback après paiement (retour Moneroo)
router.get("/callback", async (req, res) => {
  const { paymentId, paymentStatus } = req.query;

  try {
    // Vérification SERVEUR — ne jamais faire confiance aux query params seuls
    const payment = await verifyPayment(paymentId);

    if (payment.status !== "success") {
      return res.status(400).json({ success: false, message: `Paiement non confirmé. Statut : ${payment.status}` });
    }

    const { merchant_id: merchantId, plan } = payment.metadata;
    if (!merchantId) return res.status(400).json({ error: "Métadonnées de paiement manquantes" });

    const merchant = await activateMerchantSubscription(merchantId, plan);

    res.json({
      success: true,
      message: `🎉 Abonnement ${plan.toUpperCase()} activé pour ${merchant.name} !`,
      merchantId,
      plan,
      expiresAt: merchant.subscriptionExpiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook Moneroo (notification automatique)
// Configurer cette URL dans votre dashboard Moneroo
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-moneroo-signature"] || "";

  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(403).json({ error: "Signature invalide" });
  }

  res.sendStatus(200); // Répondre immédiatement à Moneroo

  try {
    const data = JSON.parse(req.body);
    const { event, data: paymentData } = data;

    console.log(`🪝 Webhook Moneroo : ${event}`);

    if (event === "payment.success") {
      const { merchant_id: merchantId, plan, type } = paymentData.metadata || {};
      if (merchantId && type === "subscription") {
        await activateMerchantSubscription(merchantId, plan);
      }
    } else if (event === "payment.failed") {
      const { merchant_id: merchantId } = paymentData.metadata || {};
      console.warn(`❌ Paiement échoué | merchant: ${merchantId}`);
      // TODO Phase 3 : notifier le commerçant par WhatsApp
    }
  } catch (err) {
    console.error("Erreur traitement webhook Moneroo :", err.message);
  }
});

// Statut abonnement d'un commerçant
router.get("/status/:merchantId", async (req, res) => {
  try {
    const merchant = await Merchant.findById(req.params.merchantId);
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });

    const now = new Date();
    const expiresAt = merchant.subscriptionExpiresAt;
    const isExpired = !expiresAt || expiresAt < now;
    const daysLeft = isExpired ? 0 : Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    res.json({
      merchantId: merchant._id,
      plan: merchant.plan,
      isActive: merchant.isActive && !isExpired,
      expiresAt: expiresAt || null,
      daysLeft,
      status: isExpired ? "expired" : "active",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
