const axios = require("axios");
const crypto = require("crypto");
const { Merchant } = require("../models/index");

const MONEROO_API_URL = "https://api.moneroo.io/v1";

// Prix par devise (Mobile Money + Carte)
const PLAN_PRICES = {
  XOF: { starter: 15000,  pro: 35000,  business: 70000  },
  XAF: { starter: 15000,  pro: 35000,  business: 70000  },
  NGN: { starter: 10000,  pro: 25000,  business: 50000  },
  KES: { starter: 3000,   pro: 7000,   business: 14000  },
  GHS: { starter: 300,    pro: 700,    business: 1400   },
  ZAR: { starter: 500,    pro: 1200,   business: 2500   },
  CDF: { starter: 65000,  pro: 150000, business: 300000 },
  RWF: { starter: 30000,  pro: 70000,  business: 140000 },
  TZS: { starter: 60000,  pro: 140000, business: 280000 },
  UGX: { starter: 90000,  pro: 210000, business: 420000 },
  MGA: { starter: 110000, pro: 255000, business: 510000 },
  MUR: { starter: 1200,   pro: 2800,   business: 5500   },
  SCR: { starter: 350,    pro: 800,    business: 1600   },
  MRO: { starter: 9000,   pro: 21000,  business: 42000  },
  USD: { starter: 25,     pro: 55,     business: 110    },
};

// Méthodes Mobile Money par devise
const MOBILE_MONEY_METHODS = {
  XOF: ["mtn_bj", "mtn_ci", "mtn_sn", "moov_bj", "moov_tg", "wave_sn", "wave_ci", "orange_sn"],
  XAF: ["mtn_cm", "orange_cm"],
  NGN: ["mpesa_ng"],
  KES: ["mpesa_ke"],
  GHS: ["mtn_gh", "vodafone_gh"],
  ZAR: [],
  CDF: ["mpesa_cd"],
  RWF: ["mtn_rw"],
  TZS: ["mpesa_tz"],
  UGX: ["mtn_ug", "airtel_ug"],
  MGA: [],
  MUR: [],
  SCR: [],
  MRO: [],
  USD: [],
};

const PLANS = {
  starter: { label: "Starter", durationDays: 30, description: "Plan Starter — Assistant IA WhatsApp (50 produits, 500 messages/mois)" },
  pro:     { label: "Pro",     durationDays: 30, description: "Plan Pro — Assistant IA WhatsApp + relances + rapport hebdomadaire" },
  business:{ label: "Business",durationDays: 30, description: "Plan Business — Fonctionnalités complètes + support prioritaire" },
};

/**
 * Retourne le prix d'un plan selon la devise du commerçant
 */
const getPlanPrice = (plan, currency) => {
  const prices = PLAN_PRICES[currency] || PLAN_PRICES["USD"];
  return prices[plan] || prices["starter"];
};

/**
 * Crée un lien de paiement Moneroo — Mobile Money + Carte Visa/Mastercard
 */
const createSubscriptionPayment = async ({ merchantId, merchantName, merchantEmail, plan, currency }) => {
  const planInfo = PLANS[plan];
  if (!planInfo) throw new Error(`Plan invalide : ${plan}`);

  const cur = currency || "XOF";
  const amount = getPlanPrice(plan, cur);

  const parts = merchantName.trim().split(" ");
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || ".";

  // Méthodes disponibles : Mobile Money de la zone + Carte bancaire universelle
  const mobileMethods = MOBILE_MONEY_METHODS[cur] || [];
  const allMethods = [...mobileMethods, "card"]; // card = Visa/Mastercard partout

  const payload = {
    amount,
    currency: cur,
    description: planInfo.description,
    customer: {
      email: merchantEmail || "client@wazibot.com",
      first_name: firstName,
      last_name: lastName,
    },
    return_url: `${process.env.APP_BASE_URL || "https://whatsapp-commerce-1roe.onrender.com"}/subscription/callback`,
    metadata: {
      merchant_id: merchantId.toString(),
      plan,
      currency: cur,
      type: "subscription",
    },
    methods: allMethods,
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
    amount,
    currency: cur,
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
  if (!process.env.MONEROO_SECRET_KEY) return true;
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
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) throw new Error(`Commerçant introuvable : ${merchantId}`);

  const now = new Date();
  const baseDate = merchant.subscriptionExpiresAt && new Date(merchant.subscriptionExpiresAt) > now
    ? new Date(merchant.subscriptionExpiresAt)
    : now;

  const expiresAt = new Date(baseDate.getTime() + planInfo.durationDays * 24 * 60 * 60 * 1000);

  await merchant.update({ plan, isActive: true, subscriptionExpiresAt: expiresAt });

  console.log(`✅ Abonnement activé | ${merchant.name} | Plan: ${plan} | Expire: ${expiresAt.toLocaleDateString("fr-FR")}`);
  return merchant;
};

module.exports = {
  PLANS,
  PLAN_PRICES,
  getPlanPrice,
  createSubscriptionPayment,
  verifyPayment,
  verifyWebhookSignature,
  activateMerchantSubscription,
};