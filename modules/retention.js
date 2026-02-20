require("dotenv").config();
const cron = require("node-cron");
const { Merchant, Customer, Order } = require("../models/index");
const { sendText } = require("../core/whatsappClient");

/**
 * Messages de relance personnalisés
 */
const RELANCE_7J = (boutique) =>
  `👋 Bonjour ! Cela fait un moment qu'on ne vous a pas vu à la *${boutique}*.\n\nNos nouveaux produits vous attendent ! Tapez *catalogue* pour voir ce qu'on a pour vous aujourd'hui. 🛍️`;

const RELANCE_14J = (boutique) =>
  `🎁 Offre spéciale pour vous !\n\nLa *${boutique}* vous a réservé une surprise. Revenez nous voir et mentionnez ce message pour bénéficier d'une attention particulière ! 😊\n\nTapez *bonjour* pour commencer.`;

const RAPPORT_MERCHANT = (stats) =>
  `📊 *RAPPORT HEBDOMADAIRE — ${stats.boutique}*\n\n` +
  `📦 Nouvelles commandes : *${stats.newOrders}*\n` +
  `💰 Revenus cette semaine : *${stats.revenue.toLocaleString("fr-FR")} FCFA*\n` +
  `👥 Nouveaux clients : *${stats.newCustomers}*\n` +
  `🔔 Clients relancés : *${stats.relanced}*\n\n` +
  `Bonne semaine ! 💪`;

/**
 * Envoie une relance aux clients inactifs d'un commerçant.
 */
const relanceInactifs = async (merchant, joursInactif, messageTemplate) => {
  const cutoff = new Date(Date.now() - joursInactif * 24 * 60 * 60 * 1000);
  const recentCutoff = new Date(Date.now() - (joursInactif + 1) * 24 * 60 * 60 * 1000);

  // Clients inactifs depuis exactement X jours (±24h) avec au moins 1 commande
  const clients = await Customer.findAll({
    where: {
      merchantId: merchant.id,
      totalOrders: { [require("sequelize").Op.gt]: 0 },
    },
  });

  const ciblesFiltered = clients.filter(c => {
    const lastInteraction = new Date(c.lastInteraction);
    return lastInteraction <= cutoff && lastInteraction > recentCutoff;
  });

  let count = 0;
  for (const client of ciblesFiltered) {
    try {
      await sendText(
        merchant.phoneNumberId,
        merchant.whatsappToken,
        client.whatsappNumber,
        messageTemplate(merchant.name)
      );
      count++;
      // Délai entre chaque message pour ne pas spammer l'API
      await sleep(1500);
    } catch (err) {
      console.error(`❌ Relance échouée pour ${client.whatsappNumber} :`, err.message);
    }
  }

  if (count > 0) {
    console.log(`📨 ${count} relances envoyées pour ${merchant.name} (J+${joursInactif})`);
  }
  return count;
};

/**
 * Génère et envoie le rapport hebdomadaire au commerçant.
 */
const envoyerRapport = async (merchant) => {
  const uneSemaine = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { Op } = require("sequelize");

  const [newOrders, newCustomers, allOrders] = await Promise.all([
    Order.count({ where: { merchantId: merchant.id, createdAt: { [Op.gte]: uneSemaine } } }),
    Customer.count({ where: { merchantId: merchant.id, createdAt: { [Op.gte]: uneSemaine } } }),
    Order.findAll({ where: { merchantId: merchant.id, createdAt: { [Op.gte]: uneSemaine }, status: { [Op.ne]: "cancelled" } } }),
  ]);

  const revenue = allOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  // Compter les relances envoyées cette semaine (approximation)
  const relanced = await Customer.count({
    where: {
      merchantId: merchant.id,
      lastInteraction: { [Op.lt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      totalOrders: { [Op.gt]: 0 },
    },
  });

  const rapport = RAPPORT_MERCHANT({
    boutique: merchant.name,
    newOrders,
    revenue,
    newCustomers,
    relanced,
  });

  // Envoyer au numéro du commerçant (son propre numéro WhatsApp)
  // En prod : utiliser un champ ownerPhone dans Merchant
  // Pour l'instant on log
  console.log(`📊 Rapport ${merchant.name} :\n${rapport}`);

  // TODO : await sendText(merchant.phoneNumberId, merchant.whatsappToken, merchant.ownerPhone, rapport);
};

/**
 * Lance tous les jobs cron.
 * Appelé au démarrage de l'application.
 */
const startCronJobs = () => {
  console.log("⏰ Cron jobs démarrés");

  // ─── Relance J+7 — Tous les jours à 10h00 ───
  cron.schedule("0 10 * * *", async () => {
    console.log("🔔 Cron : relances J+7");
    try {
      const merchants = await Merchant.findAll({ where: { isActive: true } });
      for (const merchant of merchants) {
        if (merchant.isSubscriptionActive()) {
          await relanceInactifs(merchant, 7, RELANCE_7J);
        }
      }
    } catch (err) {
      console.error("❌ Erreur cron relance J+7 :", err.message);
    }
  }, { timezone: "Africa/Lome" });

  // ─── Relance J+14 — Tous les jours à 11h00 ───
  cron.schedule("0 11 * * *", async () => {
    console.log("🔔 Cron : relances J+14");
    try {
      const merchants = await Merchant.findAll({ where: { isActive: true } });
      for (const merchant of merchants) {
        if (merchant.isSubscriptionActive()) {
          await relanceInactifs(merchant, 14, RELANCE_14J);
        }
      }
    } catch (err) {
      console.error("❌ Erreur cron relance J+14 :", err.message);
    }
  }, { timezone: "Africa/Lome" });

  // ─── Rapport hebdomadaire — Chaque lundi à 8h00 ───
  cron.schedule("0 8 * * 1", async () => {
    console.log("📊 Cron : rapports hebdomadaires");
    try {
      const merchants = await Merchant.findAll({ where: { isActive: true } });
      for (const merchant of merchants) {
        if (merchant.isSubscriptionActive()) {
          await envoyerRapport(merchant);
          await sleep(2000);
        }
      }
    } catch (err) {
      console.error("❌ Erreur cron rapport :", err.message);
    }
  }, { timezone: "Africa/Lome" });

  // ─── Vérification abonnements expirés — Tous les jours à minuit ───
  cron.schedule("0 0 * * *", async () => {
    console.log("🔍 Cron : vérification abonnements");
    try {
      const { Op } = require("sequelize");
      const expired = await Merchant.findAll({
        where: {
          subscriptionExpiresAt: { [Op.lt]: new Date() },
          isActive: true,
        },
      });
      for (const merchant of expired) {
        merchant.isActive = false;
        await merchant.save();
        console.log(`⚠️ Abonnement expiré : ${merchant.name}`);
      }
      if (expired.length > 0) {
        console.log(`✅ ${expired.length} abonnement(s) désactivé(s)`);
      }
    } catch (err) {
      console.error("❌ Erreur cron abonnements :", err.message);
    }
  }, { timezone: "Africa/Lome" });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { startCronJobs, relanceInactifs, envoyerRapport };
