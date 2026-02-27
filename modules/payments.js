const axios = require("axios");
const crypto = require("crypto");
const { Merchant } = require("../models/index");

const MONEROO_API_URL = "https://api.moneroo.io/v1";

// Prix par devise (Mobile Money + Carte)
const PLAN_PRICES = {
  XOF: { starter: 20000, pro: 40000, business: 100000 },
  XAF: { starter: 20000, pro: 40000, business: 100000 },
  GNF: { starter: 250000, pro: 500000, business: 1250000 },
  KES: { starter: 3500, pro: 7000, business: 18000 },
  MRO: { starter: 11000, pro: 22000, business: 55000 },
  NGN: { starter: 50000, pro: 100000, business: 250000 },
  RWF: { starter: 34000, pro: 68000, business: 170000 },
  TZS: { starter: 75000, pro: 150000, business: 380000 },
  UGX: { starter: 110000, pro: 220000, business: 550000 },
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
  starter: { label: "Starter", durationDays: 30, description: "Plan Starter — 15 produits, 250 conversations IA/mois" },
  pro:     { label: "Pro",     durationDays: 30, description: "Plan Pro — 50 produits, 1000 conversations IA/mois + relances + rapport" },
  business:{ label: "Business",durationDays: 30, description: "Plan Business — Produits & conversations illimités + support dédié" },
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