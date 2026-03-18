/**
 * menuBot.js — Bot WhatsApp à menus interactifs
 * Navigation par boutons et listes — zéro IA, 100% fiable
 * Activé quand BOT_MODE=menu dans .env
 */

const { sendText, sendButtons, sendList } = require("./whatsappClient");
const { getAllProducts } = require("../modules/catalog");
// createOrderFromCart remplacé par version Sequelize inline
const { clearCart } = require("../modules/crm");

// ─── États de la conversation ─────────────────────────────────────────────────
const STATES = {
  WELCOME:        "welcome",
  MAIN_MENU:      "main_menu",
  CATALOGUE:      "catalogue",
  PRODUCT_DETAIL: "product_detail",
  ADD_TO_CART:    "add_to_cart",
  CART:           "cart",
  CHECKOUT:       "checkout",
  ADDRESS:        "address",
  CONFIRM_ORDER:  "confirm_order",
  CONTACT:        "contact",
};

// ─── Handler principal ────────────────────────────────────────────────────────
const handleMenuMessage = async ({ merchant, customer, session, content, phoneNumberId }) => {
  const token = merchant.whatsappToken;
  const to = customer.whatsappNumber;
  const currency = merchant.currency || "XOF";
  const state = session.state || STATES.WELCOME;

  // Normalise le contenu
  const msg = (content || "").trim().toLowerCase();

  // Commandes globales depuis n'importe quel état
  if (["menu", "accueil", "home", "0", "retour"].includes(msg)) {
    await sendMainMenu(phoneNumberId, token, to, merchant);
    session.state = STATES.MAIN_MENU;
    await session.save();
    return;
  }

  if (["panier", "cart", "mon panier"].includes(msg) || msg === "btn_cart") {
    await showCart(phoneNumberId, token, to, session, merchant, currency);
    return;
  }

  // Router selon l'état actuel
  switch (state) {
    case STATES.WELCOME:
    case STATES.MAIN_MENU:
      await handleMainMenu(phoneNumberId, token, to, merchant, session, msg, currency);
      break;

    case STATES.CATALOGUE:
      await handleCatalogue(phoneNumberId, token, to, merchant, session, msg, currency);
      break;

    case STATES.PRODUCT_DETAIL:
      await handleProductDetail(phoneNumberId, token, to, merchant, session, msg, currency, customer);
      break;

    case STATES.CART:
      await handleCart(phoneNumberId, token, to, merchant, session, msg, currency, customer);
      break;

    case STATES.ADDRESS:
      await handleAddress(phoneNumberId, token, to, merchant, session, content, currency, customer);
      break;

    case STATES.CONFIRM_ORDER:
      await handleConfirmOrder(phoneNumberId, token, to, merchant, session, msg, currency, customer);
      break;

    case STATES.CONTACT:
      await handleContact(phoneNumberId, token, to, merchant, session, msg);
      break;

    default:
      await sendMainMenu(phoneNumberId, token, to, merchant);
      session.state = STATES.MAIN_MENU;
      await session.save();
  }
};

// ─── Menu principal ───────────────────────────────────────────────────────────
const sendMainMenu = async (phoneNumberId, token, to, merchant) => {
  const shopName = merchant.shopName || merchant.name;
  const welcome = merchant.welcomeMessage || `Bienvenue chez *${shopName}* ! 🛍️`;

  await sendButtons(phoneNumberId, token, to,
    `${welcome}\n\nQue souhaitez-vous faire ?`,
    [
      { id: "btn_catalogue", title: "🛍️ Voir le catalogue" },
      { id: "btn_cart",      title: "🛒 Mon panier" },
      { id: "btn_contact",   title: "📞 Nous contacter" },
    ],
    `🏪 ${shopName}`
  );
};

const handleMainMenu = async (phoneNumberId, token, to, merchant, session, msg, currency) => {
  if (msg === "btn_catalogue" || msg.includes("catalogue") || msg.includes("produit")) {
    await showCatalogue(phoneNumberId, token, to, merchant, session, currency);
  } else if (msg === "btn_cart" || msg.includes("panier")) {
    await showCart(phoneNumberId, token, to, session, merchant, currency);
  } else if (msg === "btn_contact" || msg.includes("contact")) {
    await sendContactInfo(phoneNumberId, token, to, merchant, session);
  } else {
    await sendMainMenu(phoneNumberId, token, to, merchant);
    session.state = STATES.MAIN_MENU;
    await session.save();
  }
};

// ─── Catalogue ────────────────────────────────────────────────────────────────
const showCatalogue = async (phoneNumberId, token, to, merchant, session, currency) => {
  const products = await getAllProducts(merchant.id);
  const available = products.filter(p => p.isAvailable && p.stock > 0);

  if (!available.length) {
    await sendButtons(phoneNumberId, token, to,
      "😔 Notre catalogue est vide pour l'instant.\nRevenez bientôt !",
      [{ id: "btn_contact", title: "📞 Nous contacter" }]
    );
    return;
  }

  // Grouper par catégorie
  const byCategory = {};
  for (const p of available) {
    const cat = p.category || "Produits";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }

  const sections = Object.entries(byCategory).map(([cat, prods]) => ({
    title: cat,
    rows: prods.slice(0, 10).map(p => ({
      id: `product_${p.id}`,
      title: p.name.slice(0, 24),
      description: `${Number(p.price).toLocaleString("fr-FR")} ${currency}${p.stock < 5 ? " · ⚠️ Stock limité" : ""}`,
    }))
  }));

  await sendList(phoneNumberId, token, to,
    `🛍️ *Notre catalogue* (${available.length} produits)\n\nChoisissez un produit pour voir les détails :`,
    "Voir les produits",
    sections.slice(0, 10) // Max 10 sections
  );

  session.state = STATES.CATALOGUE;
  await session.save();
};

const handleCatalogue = async (phoneNumberId, token, to, merchant, session, msg, currency) => {
  if (msg.startsWith("product_")) {
    const productId = msg.replace("product_", "");
    await showProductDetail(phoneNumberId, token, to, merchant, session, productId, currency);
  } else {
    await showCatalogue(phoneNumberId, token, to, merchant, session, currency);
  }
};

// ─── Détail produit ───────────────────────────────────────────────────────────
const showProductDetail = async (phoneNumberId, token, to, merchant, session, productId, currency) => {
  const products = await getAllProducts(merchant.id);
  const product = products.find(p => p.id === productId);

  if (!product) {
    await showCatalogue(phoneNumberId, token, to, merchant, session, currency);
    return;
  }

  const price = Number(product.price).toLocaleString("fr-FR");
  const desc = product.description ? `\n\n_${product.description}_` : "";
  const stock = product.stock > 0 ? `✅ En stock (${product.stock} disponibles)` : "❌ Rupture de stock";

  await sendButtons(phoneNumberId, token, to,
    `*${product.name}*${desc}\n\n💰 Prix : *${price} ${currency}*\n📦 ${stock}`,
    [
      { id: `add_${productId}`, title: "🛒 Ajouter au panier" },
      { id: "btn_catalogue",    title: "◀️ Retour catalogue" },
      { id: "btn_cart",         title: "🛒 Voir mon panier" },
    ],
    product.name
  );

  session.state = STATES.PRODUCT_DETAIL;
  session.currentProduct = productId;
  await session.save();
};

const handleProductDetail = async (phoneNumberId, token, to, merchant, session, msg, currency, customer) => {
  if (msg.startsWith("add_")) {
    const productId = msg.replace("add_", "");
    await addToCart(phoneNumberId, token, to, merchant, session, productId, currency);
  } else if (msg === "btn_catalogue") {
    await showCatalogue(phoneNumberId, token, to, merchant, session, currency);
  } else if (msg === "btn_cart") {
    await showCart(phoneNumberId, token, to, session, merchant, currency);
  } else if (session.currentProduct) {
    await showProductDetail(phoneNumberId, token, to, merchant, session, session.currentProduct, currency);
  } else {
    await showCatalogue(phoneNumberId, token, to, merchant, session, currency);
  }
};

// ─── Panier ───────────────────────────────────────────────────────────────────
const addToCart = async (phoneNumberId, token, to, merchant, session, productId, currency) => {
  const products = await getAllProducts(merchant.id);
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const cart = session.cart || {};
  cart[productId] = (cart[productId] || 0) + 1;
  session.cart = cart;
  await session.save();

  const totalItems = Object.values(cart).reduce((s, q) => s + q, 0);

  await sendButtons(phoneNumberId, token, to,
    `✅ *${product.name}* ajouté au panier !\n\n🛒 Panier : ${totalItems} article(s)`,
    [
      { id: "btn_catalogue",  title: "🛍️ Continuer achats" },
      { id: "btn_cart",       title: "🛒 Voir mon panier" },
    ]
  );

  session.state = STATES.CATALOGUE;
  await session.save();
};

const showCart = async (phoneNumberId, token, to, session, merchant, currency) => {
  const cart = session.cart || {};
  const products = await getAllProducts(merchant.id);

  if (!Object.keys(cart).length) {
    await sendButtons(phoneNumberId, token, to,
      "🛒 Votre panier est vide.\n\nAjoutez des produits depuis notre catalogue !",
      [
        { id: "btn_catalogue", title: "🛍️ Voir le catalogue" },
        { id: "btn_menu",      title: "🏠 Menu principal" },
      ]
    );
    session.state = STATES.CART;
    await session.save();
    return;
  }

  let total = 0;
  let cartText = "🛒 *Votre panier :*\n\n";
  for (const [productId, qty] of Object.entries(cart)) {
    const p = products.find(p => p.id === productId);
    if (!p) continue;
    const subtotal = p.price * qty;
    total += subtotal;
    cartText += `• ${p.name} x${qty} — ${subtotal.toLocaleString("fr-FR")} ${currency}\n`;
  }
  cartText += `\n💰 *Total : ${total.toLocaleString("fr-FR")} ${currency}*`;

  await sendButtons(phoneNumberId, token, to, cartText,
    [
      { id: "btn_checkout",   title: "✅ Commander" },
      { id: "btn_clear_cart", title: "🗑️ Vider le panier" },
      { id: "btn_catalogue",  title: "➕ Ajouter articles" },
    ]
  );

  session.state = STATES.CART;
  await session.save();
};

const handleCart = async (phoneNumberId, token, to, merchant, session, msg, currency, customer) => {
  if (msg === "btn_checkout") {
    await askForAddress(phoneNumberId, token, to, session);
  } else if (msg === "btn_clear_cart") {
    session.cart = {};
    await session.save();
    await sendText(phoneNumberId, merchant.whatsappToken, to, "🗑️ Panier vidé !");
    await sendMainMenu(phoneNumberId, merchant.whatsappToken, to, merchant);
    session.state = STATES.MAIN_MENU;
    await session.save();
  } else if (msg === "btn_catalogue") {
    await showCatalogue(phoneNumberId, merchant.whatsappToken, to, merchant, session, currency);
  } else {
    await showCart(phoneNumberId, merchant.whatsappToken, to, session, merchant, currency);
  }
};

// ─── Commande ─────────────────────────────────────────────────────────────────
const askForAddress = async (phoneNumberId, token, to, session) => {
  await sendText(phoneNumberId, token, to,
    "📍 *Livraison*\n\nVeuillez nous indiquer votre adresse de livraison :\n_(Quartier, rue, point de repère)_"
  );
  session.state = STATES.ADDRESS;
  await session.save();
};

const handleAddress = async (phoneNumberId, token, to, merchant, session, content, currency, customer) => {
  const cart = session.cart || {};
  const products = await getAllProducts(merchant.id);

  let total = 0;
  let cartText = "";
  for (const [productId, qty] of Object.entries(cart)) {
    const p = products.find(p => p.id === productId);
    if (!p) continue;
    const subtotal = p.price * qty;
    total += subtotal;
    cartText += `• ${p.name} x${qty} — ${subtotal.toLocaleString("fr-FR")} ${currency}\n`;
  }

  session.pendingAddress = content;
  await session.save();

  await sendButtons(phoneNumberId, token, to,
    `📋 *Récapitulatif de commande :*\n\n${cartText}\n💰 *Total : ${total.toLocaleString("fr-FR")} ${currency}*\n\n📍 *Livraison :* ${content}\n💳 *Paiement :* Mobile Money\n\nConfirmez-vous votre commande ?`,
    [
      { id: "btn_confirm_order",  title: "✅ Confirmer" },
      { id: "btn_cancel_order",   title: "❌ Annuler" },
    ]
  );

  session.state = STATES.CONFIRM_ORDER;
  await session.save();
};

const handleConfirmOrder = async (phoneNumberId, token, to, merchant, session, msg, currency, customer) => {
  if (msg === "btn_confirm_order") {
    const cart = session.cart || {};
    const cartMap = new Map(Object.entries(cart).map(([id, qty]) => [id, Number(qty)]));

    // Créer la commande avec Sequelize
    const { Product, Order } = require("../models/index");
    const { v4: uuidv4 } = require("uuid");

    const products = await Product.findAll({ where: { merchantId: merchant.id } });
    const items = [];
    let totalAmount = 0;

    for (const [productId, qty] of cartMap.entries()) {
      const product = products.find(p => p.id === productId);
      if (!product || !product.isAvailable) continue;
      const quantity = Math.min(Number(qty), product.stock || 999);
      const subtotal = product.price * quantity;
      totalAmount += subtotal;
      items.push({ productId: product.id, name: product.name, price: product.price, quantity, total: subtotal });
    }

    let order = null;
    if (items.length > 0) {
      const orderNumber = "WB-" + Date.now().toString().slice(-6);
      order = await Order.create({
        id: uuidv4(),
        orderNumber,
        merchantId: merchant.id,
        customerId: customer.id,
        items,
        totalAmount,
        deliveryAddress: session.pendingAddress || "",
        paymentMethod: "mobile_money",
        status: "pending",
      });
      // Mettre à jour les stats client
      await customer.update({
        totalOrders: (customer.totalOrders || 0) + 1,
        totalSpent: (customer.totalSpent || 0) + totalAmount,
        lastOrderAt: new Date(),
      });
    }

    if (order) {
      await clearCart(session);
      session.pendingAddress = null;
      session.state = STATES.MAIN_MENU;
      await session.save();

      const itemLines = items.map(i => `• ${i.name} x${i.quantity} — ${i.total.toLocaleString("fr-FR")} ${currency}`).join("\n");
      await sendText(phoneNumberId, token, to,
        `✅ *Commande confirmée !*\n\nN° *${order.orderNumber}*\n${itemLines}\n\n💰 Total : *${totalAmount.toLocaleString("fr-FR")} ${currency}*\n\nNous vous contacterons dès que votre commande est prête. Merci ! 🙏`
      );

      // Notifier le commerçant
      await notifyMerchant(merchant, order, currency);
    } else {
      await sendText(phoneNumberId, token, to, "❌ Erreur lors de la commande. Réessayez ou contactez-nous.");
    }
  } else if (msg === "btn_cancel_order") {
    await sendText(phoneNumberId, token, to, "❌ Commande annulée.");
    await sendMainMenu(phoneNumberId, token, to, merchant);
    session.state = STATES.MAIN_MENU;
    await session.save();
  } else {
    // L'utilisateur a tapé quelque chose — reaffiche le récap
    await askForAddress(phoneNumberId, token, to, session);
  }
};

// ─── Contact ──────────────────────────────────────────────────────────────────
const sendContactInfo = async (phoneNumberId, token, to, merchant, session) => {
  const phone = merchant.ownerPhone ? `📱 *Téléphone :* ${merchant.ownerPhone}` : "";
  const city = merchant.city ? `📍 *Ville :* ${merchant.city}` : "";

  await sendButtons(phoneNumberId, token, to,
    `📞 *Nous contacter*\n\n${phone}\n${city}\n\nNous répondons du lundi au samedi.`,
    [
      { id: "btn_menu", title: "🏠 Menu principal" },
      { id: "btn_catalogue", title: "🛍️ Voir catalogue" },
    ]
  );

  session.state = STATES.CONTACT;
  await session.save();
};

const handleContact = async (phoneNumberId, token, to, merchant, session, msg) => {
  await sendMainMenu(phoneNumberId, token, to, merchant);
  session.state = STATES.MAIN_MENU;
  await session.save();
};

// ─── Notifier le commerçant ───────────────────────────────────────────────────
const notifyMerchant = async (merchant, order, currency) => {
  try {
    if (!merchant.ownerPhone) return;
    const ADMIN_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ADMIN_TOKEN = process.env.WHATSAPP_TOKEN;
    if (!ADMIN_PHONE_ID || !ADMIN_TOKEN) return;

    const items = Array.isArray(order.items)
      ? order.items.map(i => `• ${i.name} x${i.quantity}`).join("\n")
      : "";

    await require("./whatsappClient").sendText(ADMIN_PHONE_ID, ADMIN_TOKEN, merchant.ownerPhone,
      `🔔 *Nouvelle commande — ${merchant.shopName || merchant.name}*\n\n` +
      `📦 N° : *${order.orderNumber}*\n${items}\n\n` +
      `💰 Total : *${order.totalAmount.toLocaleString("fr-FR")} ${currency}*\n\n` +
      `👉 Dashboard : ${process.env.APP_BASE_URL || "https://chatbot-saas-lcsl.onrender.com"}/merchant`
    );
  } catch (err) {
    console.error("Erreur notification commerçant:", err.message);
  }
};

module.exports = { handleMenuMessage };