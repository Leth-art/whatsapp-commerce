const cron = require("node-cron");
const { Merchant, Customer, Order, ConversationSession, Product } = require("../models/index");
const { sendText } = require("../core/whatsappClient");
const { Op } = require("sequelize");
const { canUseAutoRelance, canUseWeeklyReport } = require("./planLimits");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Messages bilingues ───
const MESSAGES = {
  relanceJ3: {
    fr: (name, boutique) => `Bonjour ${name} ! 👋\n\nCela fait quelques jours qu'on ne vous a pas vu chez *${boutique}*.\n\nNos nouveaux produits vous attendent ! Tapez *catalogue* pour voir les dernières nouveautés. 🛍️`,
    en: (name, boutique) => `Hello ${name}! 👋\n\nWe haven't seen you at *${boutique}* for a few days.\n\nNew products are waiting for you! Type *catalogue* to see the latest. 🛍️`,
  },
  relanceJ7: {
    fr: (name, boutique) => `Bonjour ${name} ! 🎁\n\nVous nous manquez chez *${boutique}* !\n\nMentionnez *RETOUR* lors de votre prochaine commande pour une surprise. 😊\n\nTapez *catalogue* pour commander.`,
    en: (name, boutique) => `Hello ${name}! 🎁\n\nWe miss you at *${boutique}*!\n\nMention *BACK* on your next order for a surprise. 😊\n\nType *catalogue* to order.`,
  },
  relanceJ14: {
    fr: (name, boutique) => `${name}, on pense à vous ! 💫\n\nUne offre exclusive vous attend chez *${boutique}*.\n\nTapez *catalogue* pour découvrir nos produits. 🛒`,
    en: (name, boutique) => `${name}, we're thinking of you! 💫\n\nAn exclusive offer awaits you at *${boutique}*.\n\nType *catalogue* to discover our products. 🛒`,
  },
  rappelJ3: {
    fr: (name, plan, date) => `⚠️ *Rappel WaziBot* — Bonjour ${name} !\n\nVotre abonnement *${plan}* expire le *${date}*.\n\nRenouvelez maintenant pour ne pas interrompre vos ventes. 💳`,
    en: (name, plan, date) => `⚠️ *WaziBot Reminder* — Hello ${name}!\n\nYour *${plan}* subscription expires on *${date}*.\n\nRenew now to avoid interrupting your sales. 💳`,
  },
  rappelJ1: {
    fr: (name, plan) => `🚨 *URGENT — WaziBot* — Bonjour ${name} !\n\nVotre abonnement *${plan}* expire *demain* !\n\nRenouvelez immédiatement pour ne pas perdre vos clients. ⚡`,
    en: (name, plan) => `🚨 *URGENT — WaziBot* — Hello ${name}!\n\nYour *${plan}* subscription expires *tomorrow*!\n\nRenew immediately to keep serving your customers. ⚡`,
  },
  expire: {
    fr: (name, plan) => `🔒 *WaziBot* — Bonjour ${name},\n\nVotre abonnement *${plan}* a expiré. Votre assistant est maintenant *suspendu*.\n\nVos clients ne peuvent plus passer de commandes.\n\n✅ Réactivez maintenant via My Touchpoint :\n• Android : https://bit.ly/mytouchpoint-android\n• iOS : https://bit.ly/mytouchpoint-ios`,
    en: (name, plan) => `🔒 *WaziBot* — Hello ${name},\n\nYour *${plan}* subscription has expired. Your assistant is now *suspended*.\n\nCustomers can no longer place orders.\n\n✅ Reactivate now via My Touchpoint:\n• Android : https://bit.ly/mytouchpoint-android\n• iOS : https://bit.ly/mytouchpoint-ios`,
  },
  rapport: {
    fr: (name, date, orders, revenue, currency, newCustomers, topProduct) =>
      `📊 *Rapport WaziBot — Semaine du ${date}*\n\n🏪 *${name}*\n\n📦 Commandes : *${orders}*\n💰 Revenus : *${revenue} ${currency}*\n👥 Nouveaux clients : *${newCustomers}*\n🏆 Produit star : *${topProduct}*\n\nBonne semaine ! 💪`,
    en: (name, date, orders, revenue, currency, newCustomers, topProduct) =>
      `📊 *WaziBot Report — Week of ${date}*\n\n🏪 *${name}*\n\n📦 Orders: *${orders}*\n💰 Revenue: *${revenue} ${currency}*\n👥 New customers: *${newCustomers}*\n🏆 Top product: *${topProduct}*\n\nHave a great week! 💪`,
  },
};

const getLang = (merchant) => merchant.language || "fr";
const msg = (key, merchant, ...args) => {
  const lang = getLang(merchant);
  return MESSAGES[key]?.[lang]?.(...args) || MESSAGES[key]?.fr?.(...args) || "";
};

// ─── Relance clients inactifs ───
const relanceInactifs = async (merchant, joursInactif, msgKey) => {
  const cutoff = new Date(Date.now() - joursInactif * 24 * 60 * 60 * 1000);
  const recentCutoff = new Date(Date.now() - (joursInactif + 1) * 24 * 60 * 60 * 1000);

  const customers = await Customer.findAll({
    where: {
      merchantId: merchant.id,
      totalOrders: { [Op.gt]: 0 },
      lastInteraction: { [Op.between]: [recentCutoff, cutoff] },
    },
  });

  let count = 0;
  for (const customer of customers) {
    const name = customer.name || "cher client";
    const message = msg(msgKey, merchant, name, merchant.name);
    try {
      await sendText(merchant.phoneNumberId, merchant.whatsappToken, customer.whatsappId, message);
      count++;
      await sleep(1500);
    } catch (err) {
      console.error("Erreur relance client:", err.message);
    }
  }
  return count;
};

// ─── Notifier le commerçant ───
const notifyMerchant = async (merchant, message) => {
  try {
    const ADMIN_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ADMIN_TOKEN = process.env.WHATSAPP_TOKEN;
    if (!merchant.ownerPhone || !ADMIN_PHONE_ID || !ADMIN_TOKEN) return;
    await sendText(ADMIN_PHONE_ID, ADMIN_TOKEN, merchant.ownerPhone, message);
  } catch (err) {
    console.error("Erreur notification commerçant:", err.message);
  }
};

// ─── Top produit de la semaine ───
const getTopProduct = async (merchantId) => {
  const semaine = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const orders = await Order.findAll({
    where: { merchantId, createdAt: { [Op.gte]: semaine }, status: { [Op.ne]: "cancelled" } },
  });

  const counts = {};
  for (const order of orders) {
    const items = order.items || [];
    for (const item of items) {
      const name = item.productName || item.name || "Produit";
      counts[name] = (counts[name] || 0) + (item.quantity || 1);
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : "—";
};

const startCronJobs = () => {
  console.log("⏰ Cron jobs démarrés");

  // ─── RELANCE J+3 (10h) ───
  cron.schedule("0 10 * * *", async () => {
    const merchants = await Merchant.findAll({ where: { isActive: true } });
    for (const merchant of merchants) {
      if (!canUseAutoRelance(merchant)) continue;
      const count = await relanceInactifs(merchant, 3, "relanceJ3");
      if (count > 0) console.log(`✅ ${merchant.name}: ${count} relances J+3`);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RELANCE J+7 (10h30) ───
  cron.schedule("30 10 * * *", async () => {
    const merchants = await Merchant.findAll({ where: { isActive: true } });
    for (const merchant of merchants) {
      if (!canUseAutoRelance(merchant)) continue;
      const count = await relanceInactifs(merchant, 7, "relanceJ7");
      if (count > 0) console.log(`✅ ${merchant.name}: ${count} relances J+7`);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RELANCE J+14 (11h) ───
  cron.schedule("0 11 * * *", async () => {
    const merchants = await Merchant.findAll({ where: { isActive: true } });
    for (const merchant of merchants) {
      if (!canUseAutoRelance(merchant)) continue;
      const count = await relanceInactifs(merchant, 14, "relanceJ14");
      if (count > 0) console.log(`✅ ${merchant.name}: ${count} relances J+14`);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RAPPEL ABONNEMENT J-3 (9h) ───
  cron.schedule("0 9 * * *", async () => {
    const dans3jours = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const demain = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const merchants = await Merchant.findAll({
      where: { isActive: true, subscriptionExpiresAt: { [Op.between]: [demain, dans3jours] } },
    });
    for (const merchant of merchants) {
      const expDate = new Date(merchant.subscriptionExpiresAt).toLocaleDateString("fr-FR");
      const plan = (merchant.plan || "starter").toUpperCase();
      await notifyMerchant(merchant, msg("rappelJ3", merchant, merchant.name, plan, expDate));
      console.log(`📩 Rappel J-3 → ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RAPPEL ABONNEMENT J-1 (9h) ───
  cron.schedule("0 9 * * *", async () => {
    const demain = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const apresdemain = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const merchants = await Merchant.findAll({
      where: { isActive: true, subscriptionExpiresAt: { [Op.between]: [demain, apresdemain] } },
    });
    for (const merchant of merchants) {
      const plan = (merchant.plan || "starter").toUpperCase();
      await notifyMerchant(merchant, msg("rappelJ1", merchant, merchant.name, plan));
      console.log(`🚨 Rappel J-1 → ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });

  // ─── EXPIRATION ABONNEMENT (minuit) ───
  cron.schedule("0 0 * * *", async () => {
    const expired = await Merchant.findAll({
      where: { isActive: true, subscriptionExpiresAt: { [Op.lt]: new Date() } },
    });
    for (const merchant of expired) {
      await merchant.update({ isActive: false });
      const plan = (merchant.plan || "starter").toUpperCase();
      await notifyMerchant(merchant, msg("expire", merchant, merchant.name, plan));
      console.log(`❌ Expiré : ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RAPPORT HEBDOMADAIRE (lundi 8h) ───
  cron.schedule("0 8 * * 1", async () => {
    const merchants = await Merchant.findAll({ where: { isActive: true } });
    for (const merchant of merchants) {
      if (!canUseWeeklyReport(merchant)) continue;
      const semaine = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const orders = await Order.findAll({
        where: { merchantId: merchant.id, createdAt: { [Op.gte]: semaine } },
      });
      const newCustomers = await Customer.count({
        where: { merchantId: merchant.id, createdAt: { [Op.gte]: semaine } },
      });
      const revenue = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.totalAmount, 0);
      const topProduct = await getTopProduct(merchant.id);
      const date = semaine.toLocaleDateString("fr-FR");

      await notifyMerchant(merchant, msg("rapport", merchant,
        merchant.name, date, orders.length,
        revenue.toLocaleString("fr-FR"), merchant.currency || "FCFA",
        newCustomers, topProduct
      ));
      console.log(`📊 Rapport → ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });
};

module.exports = { startCronJobs, notifyMerchant, getTopProduct };