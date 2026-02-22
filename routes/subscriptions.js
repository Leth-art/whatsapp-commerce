const express = require("express");
const router = express.Router();
const { Merchant } = require("../models/index");
const {
  PLANS, PLAN_PRICES, getPlanPrice,
  createSubscriptionPayment, verifyPayment,
  verifyWebhookSignature, activateMerchantSubscription,
} = require("../modules/payments");

// Liste les plans avec prix selon la devise du commerçant
router.get("/plans", async (req, res) => {
  const currency = req.query.currency || "XOF";
  const prices = PLAN_PRICES[currency] || PLAN_PRICES["USD"];
  const plans = Object.entries(PLANS).map(([key, info]) => ({
    plan: key,
    label: info.label,
    price: prices[key],
    currency,
    duration: "30 jours",
    description: info.description,
  }));
  res.json(plans);
});

// Initier un paiement — Mobile Money ou Carte
router.post("/initiate", async (req, res) => {
  try {
    const { merchantId, plan } = req.body;

    const merchant = await Merchant.findByPk(merchantId);
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });
    if (!PLANS[plan]) return res.status(400).json({ error: `Plan invalide. Choisir parmi : ${Object.keys(PLANS).join(", ")}` });

    const currency = merchant.currency || "XOF";

    const result = await createSubscriptionPayment({
      merchantId: merchant.id,
      merchantName: merchant.name,
      merchantEmail: merchant.email || "client@wazibot.com",
      plan,
      currency,
    });

    await merchant.update({ lastPaymentId: result.paymentId });

    res.json({
      success: true,
      checkoutUrl: result.checkoutUrl,
      paymentId: result.paymentId,
      plan,
      amount: result.amount,
      currency: result.currency,
      methods: "Mobile Money + Carte Visa/Mastercard",
    });
  } catch (err) {
    res.status(502).json({ error: `Erreur paiement : ${err.message}` });
  }
});

// Callback après paiement (retour Moneroo)
router.get("/callback", async (req, res) => {
  const { paymentId } = req.query;
  try {
    const payment = await verifyPayment(paymentId);
    if (payment.status !== "success") {
      return res.redirect(`/dashboard?payment=failed`);
    }
    const { merchant_id: merchantId, plan } = payment.metadata;
    if (!merchantId) return res.status(400).json({ error: "Métadonnées manquantes" });
    const merchant = await activateMerchantSubscription(merchantId, plan);
    res.redirect(`/dashboard?id=${merchantId}&payment=success&plan=${plan}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook Moneroo
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-moneroo-signature"] || "";
  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(403).json({ error: "Signature invalide" });
  }
  res.sendStatus(200);
  try {
    const data = JSON.parse(req.body);
    const { event, data: paymentData } = data;
    console.log(`🪝 Webhook Moneroo : ${event}`);
    if (event === "payment.success") {
      const { merchant_id: merchantId, plan, type } = paymentData.metadata || {};
      if (merchantId && type === "subscription") {
        await activateMerchantSubscription(merchantId, plan);
        console.log(`✅ Abonnement activé via webhook : ${merchantId} — ${plan}`);
      }
    } else if (event === "payment.failed") {
      console.warn(`❌ Paiement échoué | merchant: ${paymentData.metadata?.merchant_id}`);
    }
  } catch (err) {
    console.error("Erreur webhook Moneroo :", err.message);
  }
});

// Statut abonnement
router.get("/status/:merchantId", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.merchantId);
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });
    const now = new Date();
    const expiresAt = merchant.subscriptionExpiresAt;
    const isExpired = !expiresAt || new Date(expiresAt) < now;
    const daysLeft = isExpired ? 0 : Math.ceil((new Date(expiresAt) - now) / (1000 * 60 * 60 * 24));
    res.json({
      merchantId: merchant.id,
      plan: merchant.plan,
      isActive: merchant.isActive && !isExpired,
      expiresAt: expiresAt || null,
      daysLeft,
      status: isExpired ? "expired" : "active",
      currency: merchant.currency || "XOF",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;