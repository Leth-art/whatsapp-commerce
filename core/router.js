const { Merchant } = require("../models/index");
const { getOrCreateCustomer, getOrCreateSession, addMessageToSession, updateCustomerName, clearCart } = require("../modules/crm");
// createOrderFromCart remplacé par version Sequelize inline
const { generateAIResponse } = require("./aiEngine");
const { handleMenuMessage } = require("./menuBot");

// BOT_MODE=menu → menus interactifs | BOT_MODE=ai → IA Anthropic (défaut)
const BOT_MODE = process.env.BOT_MODE || "ai";
const { sendText, markAsRead } = require("./whatsappClient");
const { canSendMessage } = require("../modules/planLimits");

const handleMessage = async ({ phoneNumberId, from, content, messageId }) => {
  // ─── 1. Identifier le commerçant ───
  const merchant = await Merchant.findOne({ where: { phoneNumberId, isActive: true } });
  if (!merchant) {
    console.warn(`⚠️ Aucun commerçant actif pour phoneNumberId: ${phoneNumberId}`);
    return;
  }

  console.log(`📩 Message | Boutique: ${merchant.name} | Client: ${from}`);

  // ─── 2. Vérifier l'abonnement ───
  const now = new Date();
  if (merchant.subscriptionExpiresAt && new Date(merchant.subscriptionExpiresAt) < now) {
    console.warn(`❌ Abonnement expiré pour ${merchant.name}`);
    await sendText(phoneNumberId, merchant.whatsappToken, from,
      "Ce service est temporairement indisponible. Veuillez contacter le propriétaire de la boutique."
    );
    return;
  }

  // ─── 3. Vérifier la limite de messages du plan ───
  const messageCheck = await canSendMessage(merchant);
  if (!messageCheck.allowed) {
    console.warn(`⚠️ Limite messages atteinte pour ${merchant.name}`);
    await sendText(phoneNumberId, merchant.whatsappToken, from,
      `Désolé, ce service a atteint sa limite de messages ce mois-ci. Revenez le mois prochain ! 🙏`
    );
    return;
  }

  // ─── 4 & 5. Client + Session ───
  const customer = await getOrCreateCustomer(merchant.id, from);
  const session = await getOrCreateSession(merchant.id, customer.id);

  await markAsRead(phoneNumberId, merchant.whatsappToken, messageId);
  await addMessageToSession(session, "user", content);

  try {
    // ─── 6. Mode bot (menu ou IA) ───
    if (BOT_MODE === "menu") {
      await handleMenuMessage({ merchant, customer, session, content, phoneNumberId });
      return;
    }

    const { cleanText, actions } = await generateAIResponse({
      merchant, customer, session, userMessage: content,
    });

    // ─── 7. Exécuter les actions ───
    let orderSummary = null;
    for (const action of actions) {
      if (action.type === "UPDATE_NAME") {
        await updateCustomerName(customer, action.data.name);
      }
      if (action.type === "CREATE_ORDER") {
        orderSummary = await processOrder({ merchant, customer, session, actionData: action.data });
      }
    }

    // ─── 8. Envoyer la réponse ───
    if (cleanText) {
      await sendText(phoneNumberId, merchant.whatsappToken, from, cleanText);
      await addMessageToSession(session, "assistant", cleanText);
    }

    if (orderSummary) {
      await sleep(1000);
      await sendText(phoneNumberId, merchant.whatsappToken, from, orderSummary);
    }

  } catch (err) {
    console.error(`❌ Erreur traitement message :`, err.message);
    await sendText(phoneNumberId, merchant.whatsappToken, from,
      "Désolé, j'ai rencontré un petit problème. Pouvez-vous répéter s'il vous plaît ? 🙏"
    );
  }
};

const processOrder = async ({ merchant, customer, session, actionData }) => {
  const { Product, Order } = require("../models/index");
  const { v4: uuidv4 } = require("uuid");

  let cartObj = session.cart || {};
  if (actionData.items && Object.keys(actionData.items).length > 0) {
    cartObj = actionData.items;
  }

  if (!cartObj || Object.keys(cartObj).length === 0) return null;

  const products = await Product.findAll({ where: { merchantId: merchant.id } });
  const items = [];
  let totalAmount = 0;

  for (const [productId, qty] of Object.entries(cartObj)) {
    const product = products.find(p => p.id === productId);
    if (!product || !product.isAvailable) continue;
    const quantity = Math.min(Number(qty), product.stock || 999);
    const subtotal = product.price * quantity;
    totalAmount += subtotal;
    items.push({ productId: product.id, name: product.name, price: product.price, quantity, total: subtotal });
  }

  if (!items.length) return null;

  const orderNumber = "WB-" + Date.now().toString().slice(-6);
  const order = await Order.create({
    id: uuidv4(),
    orderNumber,
    merchantId: merchant.id,
    customerId: customer.id,
    items,
    totalAmount,
    deliveryAddress: actionData.address || session.pendingAddress || "",
    paymentMethod: actionData.payment || "mobile_money",
    status: "pending",
  });

  // Mettre à jour les stats client
  await customer.update({
    totalOrders: (customer.totalOrders || 0) + 1,
    totalSpent: (customer.totalSpent || 0) + totalAmount,
    lastOrderAt: new Date(),
  });

  await clearCart(session);
  console.log(`✅ Commande créée : ${orderNumber} — ${totalAmount.toLocaleString("fr-FR")} ${merchant.currency}`);
  await notifyMerchant(merchant, order);

  const itemLines = items.map(i => `• ${i.name} x${i.quantity} — ${i.total.toLocaleString("fr-FR")} ${merchant.currency}`).join("\n");
  return `✅ *Commande confirmée !*\n\nN° *${orderNumber}*\n${itemLines}\n\n💰 Total : *${totalAmount.toLocaleString("fr-FR")} ${merchant.currency}*\n\nNous vous contacterons dès que votre commande est prête. Merci ! 🙏`;
};

// ─── Notification WhatsApp au commerçant à chaque nouvelle commande ───
const notifyMerchant = async (merchant, order) => {
  try {
    if (!merchant.ownerPhone) {
      console.log(`⚠️ Pas de ownerPhone pour ${merchant.name} — notification ignorée`);
      return;
    }

    const ADMIN_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ADMIN_TOKEN = process.env.WHATSAPP_TOKEN;
    if (!ADMIN_PHONE_ID || !ADMIN_TOKEN) return;

    const items = Array.isArray(order.items)
      ? order.items.map(i => `• ${i.name} x${i.quantity} — ${(i.price * i.quantity).toLocaleString("fr-FR")} ${merchant.currency}`).join("\n")
      : "Voir le dashboard";

    const message =
      `🔔 *Nouvelle commande — ${merchant.name}* !\n\n` +
      `📦 N° : *${order.orderNumber}*\n` +
      `${items}\n\n` +
      `💰 Total : *${order.totalAmount.toLocaleString("fr-FR")} ${merchant.currency}*\n\n` +
      `Connectez-vous à votre dashboard pour confirmer :\n` +
      `${process.env.APP_BASE_URL || 'https://chatbot-saas-lcsl.onrender.com'}/merchant`;

    await sendText(ADMIN_PHONE_ID, ADMIN_TOKEN, merchant.ownerPhone, message);
    console.log(`🔔 Commerçant notifié : ${merchant.name} → ${merchant.ownerPhone}`);
  } catch (err) {
    console.error("Erreur notification commerçant:", err.message);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));



module.exports = { handleMessage };