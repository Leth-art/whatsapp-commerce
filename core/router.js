const { Merchant } = require("../models/index");
const { getOrCreateCustomer, getOrCreateSession, addMessageToSession, updateCustomerName, clearCart } = require("../modules/crm");
const { createOrderFromCart } = require("../modules/orders");
const { generateAIResponse } = require("./aiEngine");
const { sendText, markAsRead } = require("./whatsappClient");
const { canSendMessage } = require("../modules/planLimits");

/**
 * Point d'entrée principal pour chaque message WhatsApp entrant.
 */
const handleMessage = async ({ phoneNumberId, from, content, messageId }) => {
  // ─── 1. Identifier le commerçant ───
  const merchant = await Merchant.findOne({ where: { phoneNumberId, isActive: true } });
  if (!merchant) {
    console.warn("Aucun commerçant actif pour : " + phoneNumberId);
    return;
  }

  console.log("Message | Boutique: " + merchant.name + " | Client: " + from);

  // ─── 2. Vérifier l'abonnement ───
  if (!merchant.isSubscriptionActive()) {
    await sendText(phoneNumberId, merchant.whatsappToken, from,
      "Ce service est temporairement indisponible. Veuillez contacter le propriétaire de la boutique."
    );
    return;
  }

  // ─── 3. Vérifier la limite de messages du plan ───
  const messageCheck = await canSendMessage(merchant);
  if (!messageCheck.allowed) {
    console.warn(`⚠️ Limite messages atteinte pour ${merchant.name} (Plan: ${merchant.plan})`);
    await sendText(phoneNumberId, merchant.whatsappToken, from,
      "Notre assistant est temporairement indisponible. Veuillez réessayer en début de mois. 🙏"
    );
    return;
  }

  // ─── 4. Client + Session ───
  const customer = await getOrCreateCustomer(merchant.id, from);
  const session = await getOrCreateSession(merchant.id, customer.id);

  await markAsRead(phoneNumberId, merchant.whatsappToken, messageId);
  await addMessageToSession(session, "user", content);

  try {
    // ─── 5. Générer la réponse IA ───
    const { cleanText, actions } = await generateAIResponse({
      merchant,
      customer,
      session,
      userMessage: content,
    });

    // ─── 6. Exécuter les actions ───
    let orderSummary = null;

    for (const action of actions) {
      if (action.type === "UPDATE_NAME") {
        await updateCustomerName(customer, action.data.name);
      }

      if (action.type === "CREATE_ORDER") {
        const cart = action.data.items && Object.keys(action.data.items).length > 0
          ? action.data.items
          : session.cart;
        const order = await createOrderFromCart(
          merchant, customer, cart,
          action.data.address, action.data.payment
        );
        if (order) {
          await clearCart(session);
          orderSummary = order.toWhatsApp(merchant.currency);
          console.log("✅ Commande créée : " + order.orderNumber);
          notifyMerchant(merchant, order);
        }
      }
    }

    // ─── 7. Envoyer la réponse ───
    if (cleanText) {
      await sendText(phoneNumberId, merchant.whatsappToken, from, cleanText);
      await addMessageToSession(session, "assistant", cleanText);
    }

    if (orderSummary) {
      await sleep(1000);
      await sendText(phoneNumberId, merchant.whatsappToken, from, orderSummary);
    }

  } catch (err) {
    console.error("Erreur traitement :", err.message);
    await sendText(phoneNumberId, merchant.whatsappToken, from,
      "Désolé, petit problème technique. Pouvez-vous répéter ? 🙏"
    );
  }
};

const notifyMerchant = (merchant, order) => {
  const items = order.items.map(i => i.name + " x" + i.quantity).join(", ");
  console.log(
    "🔔 NOUVELLE COMMANDE — " + merchant.name + "\n" +
    "   N° : " + order.orderNumber + "\n" +
    "   Articles : " + items + "\n" +
    "   Total : " + order.totalAmount.toLocaleString("fr-FR") + " " + merchant.currency
  );
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { handleMessage };