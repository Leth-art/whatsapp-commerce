/**
 * Limites et fonctionnalités par plan
 */

const PLANS_CONFIG = {
  starter: {
    label: "Starter",
    price: 15000,
    durationDays: 30,
    limits: {
      maxProducts: 50,
      maxMessagesPerMonth: 500,
      autoRelance: false,
      weeklyReport: false,
      prioritySupport: false,
    },
  },
  pro: {
    label: "Pro",
    price: 35000,
    durationDays: 30,
    limits: {
      maxProducts: 200,
      maxMessagesPerMonth: 2000,
      autoRelance: true,
      weeklyReport: true,
      prioritySupport: false,
    },
  },
  business: {
    label: "Business",
    price: 70000,
    durationDays: 30,
    limits: {
      maxProducts: Infinity,
      maxMessagesPerMonth: Infinity,
      autoRelance: true,
      weeklyReport: true,
      prioritySupport: true,
    },
  },
};

/**
 * Retourne la config d'un plan.
 */
const getPlanConfig = (plan) => PLANS_CONFIG[plan] || PLANS_CONFIG.starter;

/**
 * Vérifie si un commerçant peut ajouter un produit.
 */
const canAddProduct = async (merchant, currentProductCount) => {
  const config = getPlanConfig(merchant.plan);
  const max = config.limits.maxProducts;
  if (currentProductCount >= max) {
    return {
      allowed: false,
      reason: `Limite atteinte. Le plan ${config.label} permet ${max} produits maximum. Passez au plan supérieur pour en ajouter plus.`,
    };
  }
  return { allowed: true };
};

/**
 * Vérifie si un commerçant peut encore envoyer des messages ce mois-ci.
 */
const canSendMessage = async (merchant) => {
  const config = getPlanConfig(merchant.plan);
  const max = config.limits.maxMessagesPerMonth;
  if (max === Infinity) return { allowed: true };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { ConversationSession } = require("../models/index");
  const { Op } = require("sequelize");

  // Compter les messages envoyés ce mois
  const sessions = await ConversationSession.findAll({
    where: {
      merchantId: merchant.id,
      updatedAt: { [Op.gte]: startOfMonth },
    },
  });

  let totalMessages = 0;
  for (const session of sessions) {
    const messages = session.messages || [];
    totalMessages += messages.filter(m => m.role === "assistant").length;
  }

  if (totalMessages >= max) {
    return {
      allowed: false,
      reason: `Limite de ${max} messages/mois atteinte pour le plan ${config.label}. Votre quota se renouvelle le 1er du mois prochain.`,
      current: totalMessages,
      max,
    };
  }

  return { allowed: true, current: totalMessages, max };
};

/**
 * Vérifie si les relances auto sont disponibles pour ce plan.
 */
const canUseAutoRelance = (merchant) => {
  const config = getPlanConfig(merchant.plan);
  return config.limits.autoRelance;
};

/**
 * Vérifie si le rapport hebdomadaire est disponible.
 */
const canUseWeeklyReport = (merchant) => {
  const config = getPlanConfig(merchant.plan);
  return config.limits.weeklyReport;
};

/**
 * Retourne un résumé du plan pour le dashboard.
 */
const getPlanSummary = (merchant, currentProductCount, currentMessages) => {
  const config = getPlanConfig(merchant.plan);
  const limits = config.limits;
  return {
    plan: merchant.plan,
    label: config.label,
    price: config.price,
    features: {
      products: {
        current: currentProductCount,
        max: limits.maxProducts === Infinity ? "Illimité" : limits.maxProducts,
        percentage: limits.maxProducts === Infinity ? 0 : Math.round((currentProductCount / limits.maxProducts) * 100),
      },
      messages: {
        current: currentMessages,
        max: limits.maxMessagesPerMonth === Infinity ? "Illimité" : limits.maxMessagesPerMonth,
        percentage: limits.maxMessagesPerMonth === Infinity ? 0 : Math.round((currentMessages / limits.maxMessagesPerMonth) * 100),
      },
      autoRelance: limits.autoRelance,
      weeklyReport: limits.weeklyReport,
      prioritySupport: limits.prioritySupport,
    },
  };
};

module.exports = {
  PLANS_CONFIG,
  getPlanConfig,
  canAddProduct,
  canSendMessage,
  canUseAutoRelance,
  canUseWeeklyReport,
  getPlanSummary,
};
