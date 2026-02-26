const cron = require("node-cron");
const { Merchant, Customer, Order, ConversationSession } = require("../models/index");
const { sendText } = require("../core/whatsappClient");
const { Op } = require("sequelize");
const { canUseAutoRelance, canUseWeeklyReport } = require("./planLimits");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Envoie un message de relance aux clients inactifs
 */
const relanceInactifs = async (merchant, joursInactif, messageTemplate) => {
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
    const message = messageTemplate.replace("{name}", name).replace("{boutique}", merchant.name);
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

/**
 * Envoie un WhatsApp au commerçant
 */
const notifyMerchant = async (merchant, message) => {
  try {
    // On envoie via notre propre numéro Meta vers le numéro perso du commerçant
    const ADMIN_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ADMIN_TOKEN = process.env.WHATSAPP_TOKEN;
    if (!merchant.ownerPhone || !ADMIN_PHONE_ID || !ADMIN_TOKEN) return;
    await sendText(ADMIN_PHONE_ID, ADMIN_TOKEN, merchant.ownerPhone, message);
  } catch (err) {
    console.error("Erreur notification commerçant:", err.message);
  }
};

const startCronJobs = () => {
  console.log("⏰ Cron jobs démarrés");

  // ─── RELANCE J+7 (10h quotidien) ───
  cron.schedule("0 10 * * *", async () => {
    console.log("🔔 Relance J+7...");
    const merchants = await Merchant.findAll({ where: { isActive: true } });
    for (const merchant of merchants) {
      if (!canUseAutoRelance(merchant)) continue;
      const count = await relanceInactifs(
        merchant, 7,
        "Bonjour {name} ! 👋\n\nCela fait quelques jours qu'on ne vous a pas vu chez {boutique}.\n\nNos nouveaux produits vous attendent ! Tapez *catalogue* pour voir les dernières nouveautés. 🛍️"
      );
      if (count > 0) console.log(`✅ ${merchant.name}: ${count} relances J+7 envoyées`);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RELANCE J+14 (11h quotidien) ───
  cron.schedule("0 11 * * *", async () => {
    console.log("🔔 Relance J+14...");
    const merchants = await Merchant.findAll({ where: { isActive: true } });
    for (const merchant of merchants) {
      if (!canUseAutoRelance(merchant)) continue;
      const count = await relanceInactifs(
        merchant, 14,
        "Bonjour {name} ! 🎁\n\nVous nous manquez chez {boutique} !\n\nOffre spéciale pour votre retour : mentionnez *RETOUR* lors de votre prochaine commande pour une surprise. 😊\n\nTapez *catalogue* pour commander."
      );
      if (count > 0) console.log(`✅ ${merchant.name}: ${count} relances J+14 envoyées`);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RAPPEL ABONNEMENT J-3 (9h quotidien) ───
  cron.schedule("0 9 * * *", async () => {
    console.log("📅 Vérification abonnements J-3...");
    const dans3jours = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const demain = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const merchants = await Merchant.findAll({
      where: {
        isActive: true,
        subscriptionExpiresAt: { [Op.between]: [demain, dans3jours] },
      },
    });

    for (const merchant of merchants) {
      const expDate = new Date(merchant.subscriptionExpiresAt).toLocaleDateString("fr-FR");
      const plan = (merchant.plan || 'starter').toUpperCase();
      const message =
        `⚠️ *Rappel WaziBot* — Bonjour ${merchant.name} !\n\n` +
        `Votre abonnement *${plan}* expire le *${expDate}*.\n\n` +
        `Pour continuer à recevoir vos commandes 24h/24, renouvelez maintenant via *My Touchpoint*.\n\n` +
        `📱 *Téléchargez My Touchpoint pour payer :*\n` +
        `• Android : https://play.google.com/store/apps/details?id=com.intouch.mytouchpoint\n` +
        `• iOS : https://apps.apple.com/bf/app/mytouchpoint/id6451056179\n\n` +
        `Des questions ? Contactez-nous au +228 71 45 40 79`;

      await notifyMerchant(merchant, message);
      console.log(`📩 Rappel J-3 envoyé à ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });

  // ─── RAPPEL ABONNEMENT J-1 (9h quotidien) ───
  cron.schedule("0 9 * * *", async () => {
    const demain = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const apresdemain = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const merchants = await Merchant.findAll({
      where: {
        isActive: true,
        subscriptionExpiresAt: { [Op.between]: [demain, apresdemain] },
      },
    });

    for (const merchant of merchants) {
      const message =
        `🚨 *URGENT — WaziBot* — Bonjour ${merchant.name} !\n\n` +
        `Votre abonnement expire *demain* !\n\n` +
        `Sans renouvellement, votre assistant WhatsApp sera suspendu et vos clients ne pourront plus commander.\n\n` +
        `Renouvelez maintenant via *My Touchpoint* :\n\n` +
        `📱 *Téléchargez My Touchpoint :*\n` +
        `• Android : https://play.google.com/store/apps/details?id=com.intouch.mytouchpoint\n` +
        `• iOS : https://apps.apple.com/bf/app/mytouchpoint/id6451056179\n\n` +
        `⏰ Ne laissez pas vos clients sans réponse !`;

      await notifyMerchant(merchant, message);
      console.log(`🚨 Rappel J-1 envoyé à ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });

  // ─── FIN PÉRIODE D'ESSAI — MESSAGE MY TOUCHPOINT (8h quotidien) ───
  cron.schedule("0 8 * * *", async () => {
    console.log("🎯 Vérification fins d'essai...");
    const now = new Date();
    const dans24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Commerçants dont l'essai se termine dans les prochaines 24h
    const merchants = await Merchant.findAll({
      where: {
        isActive: true,
        plan: "starter",
        subscriptionExpiresAt: { [Op.between]: [now, dans24h] },
      },
    });

    for (const merchant of merchants) {
      const expDate = new Date(merchant.subscriptionExpiresAt).toLocaleDateString("fr-FR");
      const message =
        `⏳ *WaziBot* — Bonjour ${merchant.name} !\n\n` +
        `Votre période d'essai gratuit se termine *aujourd'hui* (${expDate}).\n\n` +
        `Pour continuer à vendre 24h/24 sans interruption, abonnez-vous maintenant.\n\n` +
        `💳 *Comment payer avec My Touchpoint :*\n` +
        `1️⃣ Téléchargez l'application\n` +
        `2️⃣ Créez votre compte\n` +
        `3️⃣ Effectuez le paiement\n\n` +
        `📱 *Téléchargez My Touchpoint :*\n` +
        `• Android : https://play.google.com/store/apps/details?id=com.intouch.mytouchpoint\n` +
        `• iOS : https://apps.apple.com/bf/app/mytouchpoint/id6451056179\n\n` +
        `Des questions ? +228 71 45 40 79 📞`;

      await notifyMerchant(merchant, message);
      console.log(`⏳ Message fin d'essai envoyé à ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });

  // ─── DÉSACTIVATION ABONNEMENTS EXPIRÉS (minuit) ───
  cron.schedule("0 0 * * *", async () => {
    console.log("🔍 Vérification abonnements expirés...");
    const expired = await Merchant.findAll({
      where: {
        isActive: true,
        subscriptionExpiresAt: { [Op.lt]: new Date() },
      },
    });

    for (const merchant of expired) {
      await merchant.update({ isActive: false });
      console.log(`❌ Abonnement expiré : ${merchant.name}`);

      // Notifier le commerçant
      const plan = (merchant.plan || 'starter').toUpperCase();
      const message =
        `🔒 *WaziBot* — Bonjour ${merchant.name},\n\n` +
        `Votre abonnement *${plan}* a expiré. Votre assistant WhatsApp est maintenant *suspendu*.\n\n` +
        `Vos clients ne peuvent plus passer de commandes.\n\n` +
        `✅ *Réactivez votre boutique maintenant via My Touchpoint :*\n\n` +
        `📱 *Téléchargez My Touchpoint :*\n` +
        `• Android : https://play.google.com/store/apps/details?id=com.intouch.mytouchpoint\n` +
        `• iOS : https://apps.apple.com/bf/app/mytouchpoint/id6451056179\n\n` +
        `Une fois le paiement effectué, votre boutique sera réactivée automatiquement. 🙏`;

      await notifyMerchant(merchant, message);
    }

    if (expired.length > 0) console.log(`❌ ${expired.length} abonnement(s) désactivé(s)`);
  }, { timezone: "Africa/Lome" });

  // ─── RAPPORT HEBDOMADAIRE (lundi 8h) ───
  cron.schedule("0 8 * * 1", async () => {
    console.log("📊 Rapport hebdomadaire...");
    const merchants = await Merchant.findAll({ where: { isActive: true } });

    for (const merchant of merchants) {
      if (!canUseWeeklyReport(merchant)) continue;

      const semaineDerniere = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const orders = await Order.findAll({
        where: { merchantId: merchant.id, createdAt: { [Op.gte]: semaineDerniere } },
      });
      const newCustomers = await Customer.count({
        where: { merchantId: merchant.id, createdAt: { [Op.gte]: semaineDerniere } },
      });
      const revenue = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.totalAmount, 0);

      const message =
        `📊 *Rapport WaziBot — Semaine du ${semaineDerniere.toLocaleDateString("fr-FR")}*\n\n` +
        `🏪 *${merchant.name}*\n\n` +
        `📦 Commandes : *${orders.length}*\n` +
        `💰 Revenus : *${revenue.toLocaleString("fr-FR")} ${merchant.currency}*\n` +
        `👥 Nouveaux clients : *${newCustomers}*\n\n` +
        `Bonne semaine ! 💪`;

      await notifyMerchant(merchant, message);
      console.log(`📊 Rapport envoyé à ${merchant.name}`);
      await sleep(2000);
    }
  }, { timezone: "Africa/Lome" });
};

module.exports = { startCronJobs };