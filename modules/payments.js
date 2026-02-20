const axios = require("axios");
const crypto = require("crypto");
const Merchant = require("../models/Merchant");

const MONEROO_API_URL = "https://api.moneroo.io/v1";

const PLANS = {
  starter: {
    label: "Starter",
    price: 15000,
    durationDays: 30,
    description: "Plan Starter — Assistant IA WhatsApp (50 produits, 500 messages/mois)",
  },
  pro: {
    label: "Pro",
    price: 35000,
    durationDays: 30,
    description: "Plan Pro — Assistant IA WhatsApp illimité + relances + analytique",
  },
  business: {
    label: "Business",
    price: 70000,
    durationDays: 30,
    description: "Plan Business — Fonctionnalités complètes + support prioritaire",
  },
};

/**
 * Crée un lien de paiement Moneroo pour un abonnement.
 */
const createSubscriptionPayment = async ({ merchantId, merchantName, merchantEmail, plan }) => {
  const planInfo = PLANS[plan];
  if (!planInfo) throw new Error(`Plan invalide : ${plan}`);

  const parts = merchantName.trim().split(" ");
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || ".";

  const payload = {
    amount: planInfo.price,
    currency: "XOF",
    description: planInfo.description,
    customer: {
      email: merchantEmail,
      first_name: firstName,
      last_name: lastName,
    },
    return_url: `${process.env.APP_BASE_URL}/subscription/callback`,
    metadata: {
      merchant_id: merchantId.toString(),
      plan,
      type: "subscription",
    },
    methods: ["mtn_tg", "moov_tg"],
    restrict_country_code: "TG",
  };

  const response = await axios.post(`${MONEROO_API_URL}/payments/initialize`, payload, {
    headers: {
      Authorization: `Bearer ${process.env.MONEROO_SECRET_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  return {
    checkoutUrl: response.data.data.checkout_url,
    paymentId: response.data.data.id,
  };
};

/**
 * Vérifie le statut d'un paiement côté serveur Moneroo.
 */
const verifyPayment = async (paymentId) => {
  const response = await axios.get(`${MONEROO_API_URL}/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${process.env.MONEROO_SECRET_KEY}`,
      Accept: "application/json",
    },
  });

  const data = response.data.data;
  return {
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    metadata: data.metadata || {},
  };
};

/**
 * Vérifie la signature HMAC du webhook Moneroo.
 */
const verifyWebhookSignature = (rawBody, signature) => {
  if (!process.env.MONEROO_SECRET_KEY) return true; // Dev mode
  const expected = crypto
    .createHmac("sha256", process.env.MONEROO_SECRET_KEY)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

/**
 * Active ou renouvelle l'abonnement d'un commerçant.
 */
const activateMerchantSubscription = async (merchantId, plan) => {
  const planInfo = PLANS[plan] || PLANS.starter;
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error(`Commerçant introuvable : ${merchantId}`);

  const now = new Date();
  const baseDate = merchant.subscriptionExpiresAt && merchant.subscriptionExpiresAt > now
    ? merchant.subscriptionExpiresAt
    : now;

  const expiresAt = new Date(baseDate.getTime() + planInfo.durationDays * 24 * 60 * 60 * 1000);

  merchant.plan = plan;
  merchant.isActive = true;
  merchant.subscriptionExpiresAt = expiresAt;
  await merchant.save();

  console.log(`✅ Abonnement activé | ${merchant.name} | Plan: ${plan} | Expire: ${expiresAt.toLocaleDateString("fr-FR")}`);
  return merchant;
};

module.exports = {
  PLANS,
  createSubscriptionPayment,
  verifyPayment,
  verifyWebhookSignature,
  activateMerchantSubscription,
};
