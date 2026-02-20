const fs = require("fs");
const path = require("path");

const files = {};

// ─── package.json ───
files["package.json"] = `{
  "name": "whatsapp-commerce-ia",
  "version": "1.0.0",
  "description": "SaaS Assistant IA WhatsApp Commerce",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "seed": "node seed.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "axios": "^1.7.2",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "sequelize": "^6.37.3",
    "sqlite3": "^5.1.7",
    "uuid": "^10.0.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "nodemon": "^3.1.3"
  }
}
`;

// ─── config/database.js ───
files["config/database.js"] = `const { Sequelize } = require("sequelize");
const path = require("path");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(__dirname, "../database.sqlite"),
  logging: false,
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log("✅ SQLite connecté et tables créées");
  } catch (err) {
    console.error("❌ Erreur SQLite :", err.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
`;

// ─── models/index.js ───
files["models/index.js"] = `const { sequelize } = require("../config/database");
const { DataTypes } = require("sequelize");
const { v4: uuidv4 } = require("uuid");

// ─── Merchant ───
const Merchant = sequelize.define("Merchant", {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING },
  phoneNumberId: { type: DataTypes.STRING, unique: true, allowNull: false },
  whatsappToken: { type: DataTypes.TEXT, allowNull: false },
  businessDescription: { type: DataTypes.TEXT, defaultValue: "" },
  aiPersona: { type: DataTypes.TEXT, defaultValue: "Tu es l'assistante de cette boutique." },
  welcomeMessage: { type: DataTypes.TEXT, defaultValue: "Bonjour ! Comment puis-je vous aider ?" },
  city: { type: DataTypes.STRING, defaultValue: "Lomé" },
  country: { type: DataTypes.STRING, defaultValue: "Togo" },
  currency: { type: DataTypes.STRING, defaultValue: "FCFA" },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  plan: { type: DataTypes.STRING, defaultValue: "starter" },
  subscriptionExpiresAt: { type: DataTypes.DATE },
  lastPaymentId: { type: DataTypes.STRING },
});

Merchant.prototype.isSubscriptionActive = function() {
  if (!this.subscriptionExpiresAt) return false;
  return new Date(this.subscriptionExpiresAt) > new Date();
};

// ─── Product ───
const Product = sequelize.define("Product", {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  merchantId: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, defaultValue: "" },
  price: { type: DataTypes.FLOAT, allowNull: false },
  stock: { type: DataTypes.INTEGER, defaultValue: 0 },
  category: { type: DataTypes.STRING, defaultValue: "Divers" },
  imageUrl: { type: DataTypes.STRING, defaultValue: "" },
  isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true },
});

// ─── Customer ───
const Customer = sequelize.define("Customer", {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  merchantId: { type: DataTypes.STRING, allowNull: false },
  whatsappNumber: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
  totalOrders: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalSpent: { type: DataTypes.FLOAT, defaultValue: 0 },
  lastInteraction: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  lastOrderAt: { type: DataTypes.DATE },
  tags: { type: DataTypes.TEXT, defaultValue: "[]", get() { try { return JSON.parse(this.getDataValue("tags")); } catch { return []; } }, set(v) { this.setDataValue("tags", JSON.stringify(v)); } },
  notes: { type: DataTypes.TEXT, defaultValue: "" },
});

// ─── Order ───
const Order = sequelize.define("Order", {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  orderNumber: { type: DataTypes.STRING, unique: true },
  merchantId: { type: DataTypes.STRING, allowNull: false },
  customerId: { type: DataTypes.STRING, allowNull: false },
  items: { type: DataTypes.TEXT, allowNull: false, get() { try { return JSON.parse(this.getDataValue("items")); } catch { return []; } }, set(v) { this.setDataValue("items", JSON.stringify(v)); } },
  totalAmount: { type: DataTypes.FLOAT, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: "pending" },
  deliveryAddress: { type: DataTypes.TEXT, defaultValue: "" },
  paymentMethod: { type: DataTypes.STRING, defaultValue: "mobile_money" },
  paymentStatus: { type: DataTypes.STRING, defaultValue: "pending" },
  notes: { type: DataTypes.TEXT, defaultValue: "" },
});

Order.prototype.toWhatsApp = function(currency) {
  currency = currency || "FCFA";
  const items = this.items;
  const lines = ["✅ *COMMANDE CONFIRMÉE*", "N° " + this.orderNumber, "", "*Vos articles :*"];
  items.forEach(i => lines.push("  - " + i.name + " x" + i.quantity + " - " + i.total.toLocaleString("fr-FR") + " " + currency));
  lines.push("", "Total : " + this.totalAmount.toLocaleString("fr-FR") + " " + currency, "Paiement : " + this.paymentMethod.replace("_", " "), "", "Nous vous contactons dès que votre commande est prête !");
  return lines.join("\\n");
};

Order.prototype.statusMessage = function() {
  const messages = { confirmed: "✅ Commande confirmée !", preparing: "👨‍🍳 En cours de préparation.", ready: "🎉 Prête ! Livraison en route.", delivered: "📦 Livrée. Merci !", cancelled: "❌ Annulée." };
  return (messages[this.status] || "Statut mis à jour.") + "\\n\\nN° *" + this.orderNumber + "*";
};

// ─── ConversationSession ───
const ConversationSession = sequelize.define("ConversationSession", {
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => uuidv4() },
  merchantId: { type: DataTypes.STRING, allowNull: false },
  customerId: { type: DataTypes.STRING, allowNull: false },
  messages: { type: DataTypes.TEXT, defaultValue: "[]", get() { try { return JSON.parse(this.getDataValue("messages")); } catch { return []; } }, set(v) { this.setDataValue("messages", JSON.stringify(v)); } },
  cart: { type: DataTypes.TEXT, defaultValue: "{}", get() { try { return JSON.parse(this.getDataValue("cart")); } catch { return {}; } }, set(v) { this.setDataValue("cart", JSON.stringify(v)); } },
  state: { type: DataTypes.STRING, defaultValue: "greeting" },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
});

ConversationSession.prototype.addMessage = function(role, content) {
  const messages = this.messages;
  messages.push({ role, content, timestamp: new Date().toISOString() });
  this.messages = messages.slice(-20);
};

ConversationSession.prototype.cartSummary = function(products) {
  const cart = this.cart;
  if (!cart || Object.keys(cart).length === 0) return "vide";
  const items = [];
  for (const [productId, qty] of Object.entries(cart)) {
    const product = products.find(p => p.id === productId);
    if (product) items.push(product.name + " x" + qty);
  }
  return items.join(", ") || "vide";
};

module.exports = { Merchant, Product, Customer, Order, ConversationSession };
`;

// ─── modules/crm.js ───
files["modules/crm.js"] = `const { Customer, ConversationSession } = require("../models/index");
const { v4: uuidv4 } = require("uuid");

const getOrCreateCustomer = async (merchantId, whatsappNumber) => {
  let customer = await Customer.findOne({ where: { merchantId, whatsappNumber } });
  if (!customer) {
    customer = await Customer.create({ id: uuidv4(), merchantId, whatsappNumber });
    console.log("Nouveau client : " + whatsappNumber);
  } else {
    customer.lastInteraction = new Date();
    await customer.save();
  }
  return customer;
};

const getOrCreateSession = async (merchantId, customerId) => {
  let session = await ConversationSession.findOne({ where: { merchantId, customerId, isActive: true } });
  if (!session) {
    session = await ConversationSession.create({ id: uuidv4(), merchantId, customerId, messages: [], cart: {}, state: "greeting" });
  }
  return session;
};

const updateCustomerName = async (customer, name) => {
  if (!customer.name && name) { customer.name = name; await customer.save(); }
};

const addMessageToSession = async (session, role, content) => {
  session.addMessage(role, content);
  await session.save();
};

const clearCart = async (session) => {
  session.cart = {};
  session.state = "post_order";
  await session.save();
};

module.exports = { getOrCreateCustomer, getOrCreateSession, updateCustomerName, addMessageToSession, clearCart };
`;

// ─── modules/catalog.js ───
files["modules/catalog.js"] = `const { Product } = require("../models/index");

const getAllProducts = async (merchantId, availableOnly) => {
  if (availableOnly === undefined) availableOnly = true;
  const where = { merchantId };
  if (availableOnly) { where.isAvailable = true; }
  const products = await Product.findAll({ where });
  return availableOnly ? products.filter(p => p.stock > 0) : products;
};

const deductStock = async (productId, quantity) => {
  const product = await Product.findByPk(productId);
  if (!product || product.stock < quantity) return false;
  product.stock -= quantity;
  if (product.stock === 0) product.isAvailable = false;
  await product.save();
  return true;
};

const formatCatalogForAI = async (merchantId, currency) => {
  currency = currency || "FCFA";
  const products = await getAllProducts(merchantId);
  if (!products.length) return "Aucun produit disponible pour le moment.";
  const categories = {};
  for (const p of products) {
    const cat = p.category || "Divers";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }
  const lines = ["CATALOGUE DISPONIBLE :\n"];
  for (const cat of Object.keys(categories)) {
    lines.push(cat.toUpperCase());
    for (const p of categories[cat]) {
      const stockAlert = p.stock <= 5 ? " (Stock faible: " + p.stock + ")" : "";
      lines.push("  - " + p.name + " - " + p.price.toLocaleString("fr-FR") + " " + currency + stockAlert);
      if (p.description) lines.push("    " + p.description);
    }
    lines.push("");
  }
  return lines.join("\n");
};

module.exports = { getAllProducts, deductStock, formatCatalogForAI };
`;

// ─── modules/orders.js ───
files["modules/orders.js"] = `const { Order, Product } = require("../models/index");
const { deductStock } = require("./catalog");
const { v4: uuidv4 } = require("uuid");

const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return "ORD-" + date + "-" + rand;
};

const createOrderFromCart = async (merchant, customer, cart, deliveryAddress, paymentMethod) => {
  deliveryAddress = deliveryAddress || "";
  paymentMethod = paymentMethod || "mobile_money";
  if (!cart || Object.keys(cart).length === 0) return null;
  const items = [];
  let totalAmount = 0;
  for (const [productId, qty] of Object.entries(cart)) {
    const product = await Product.findByPk(productId);
    if (!product || !product.isAvailable) continue;
    const quantity = Math.min(Number(qty), product.stock);
    const total = product.price * quantity;
    totalAmount += total;
    items.push({ productId: product.id, name: product.name, quantity, unitPrice: product.price, total });
    await deductStock(productId, quantity);
  }
  if (!items.length) return null;
  const order = await Order.create({ id: uuidv4(), orderNumber: generateOrderNumber(), merchantId: merchant.id, customerId: customer.id, items, totalAmount, deliveryAddress, paymentMethod, status: "pending" });
  customer.totalOrders += 1;
  customer.totalSpent += totalAmount;
  customer.lastOrderAt = new Date();
  await customer.save();
  return order;
};

const updateOrderStatus = async (orderId, status) => {
  const valid = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];
  if (!valid.includes(status)) throw new Error("Statut invalide : " + status);
  const order = await Order.findByPk(orderId);
  if (!order) return null;
  order.status = status;
  await order.save();
  return order;
};

const getMerchantOrders = async (merchantId, status) => {
  const where = { merchantId };
  if (status) where.status = status;
  return Order.findAll({ where, order: [["createdAt", "DESC"]] });
};

module.exports = { createOrderFromCart, updateOrderStatus, getMerchantOrders };
`;

// ─── core/aiEngine.js ───
files["core/aiEngine.js"] = `const Anthropic = require("@anthropic-ai/sdk");
const { formatCatalogForAI, getAllProducts } = require("../modules/catalog");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const buildSystemPrompt = (merchant, catalogText, customer) => {
  let customerInfo = "";
  if (customer.name) customerInfo += "Le client s'appelle " + customer.name + ". ";
  if (customer.totalOrders > 0) customerInfo += "C'est un client fidèle avec " + customer.totalOrders + " commande(s).";

  return "Tu es l'assistante virtuelle de la boutique *" + merchant.name + "* à " + merchant.city + ", " + merchant.country + ".\\n\\n" +
    (merchant.businessDescription || "") + "\\n\\n" +
    merchant.aiPersona + "\\n\\n" +
    customerInfo + "\\n\\n" +
    "---\\nCATALOGUE ACTUEL :\\n" + catalogText + "\\n---\\n\\n" +
    "RÈGLES :\\n" +
    "1. Réponds TOUJOURS en français, ton chaleureux et professionnel.\\n" +
    "2. Prix en " + merchant.currency + ".\\n" +
    "3. Pour commander, collecte : produits + quantités + adresse de livraison.\\n" +
    "4. Quand la commande est prête, ajoute EXACTEMENT cette ligne à la fin :\\n" +
    '   ACTION:CREATE_ORDER:{"items":{"productId":quantity},"address":"adresse","payment":"mobile_money"}\\n' +
    "5. Si tu détectes le prénom du client, ajoute : ACTION:UPDATE_NAME:Prénom\\n" +
    "6. Ne réponds jamais à des sujets hors commerce.\\n" +
    "7. Sois concise — messages courts et lisibles.";
};

const extractActions = (responseText) => {
  const lines = responseText.trim().split("\\n");
  const cleanLines = [];
  const actions = [];
  for (const line of lines) {
    if (line.startsWith("ACTION:CREATE_ORDER:")) {
      try { const payload = JSON.parse(line.replace("ACTION:CREATE_ORDER:", "")); actions.push({ type: "CREATE_ORDER", data: payload }); } catch {}
    } else if (line.startsWith("ACTION:UPDATE_NAME:")) {
      const name = line.replace("ACTION:UPDATE_NAME:", "").trim();
      if (name) actions.push({ type: "UPDATE_NAME", data: { name } });
    } else { cleanLines.push(line); }
  }
  return { cleanText: cleanLines.join("\\n").trim(), actions };
};

const generateAIResponse = async ({ merchant, customer, session, userMessage }) => {
  const catalogText = await formatCatalogForAI(merchant.id, merchant.currency);
  const allProducts = await getAllProducts(merchant.id);
  const systemPrompt = buildSystemPrompt(merchant, catalogText, customer);
  const messagesHistory = (session.messages || []).map(m => ({ role: m.role, content: m.content }));
  let messageContent = userMessage;
  const cart = session.cart || {};
  if (Object.keys(cart).length > 0) {
    messageContent += "\\n\\n[Panier actuel : " + session.cartSummary(allProducts) + "]";
  }
  messagesHistory.push({ role: "user", content: messageContent });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messagesHistory,
  });
  return extractActions(response.content[0].text);
};

module.exports = { generateAIResponse };
`;

// ─── core/router.js ───
files["core/router.js"] = `const { Merchant } = require("../models/index");
const { getOrCreateCustomer, getOrCreateSession, addMessageToSession, updateCustomerName, clearCart } = require("../modules/crm");
const { createOrderFromCart } = require("../modules/orders");
const { generateAIResponse } = require("./aiEngine");
const { sendText, markAsRead } = require("./whatsappClient");

const handleMessage = async ({ phoneNumberId, from, content, messageId }) => {
  const merchant = await Merchant.findOne({ where: { phoneNumberId, isActive: true } });
  if (!merchant) { console.warn("Aucun commerçant actif pour : " + phoneNumberId); return; }
  console.log("Message | Boutique: " + merchant.name + " | Client: " + from);
  if (!merchant.isSubscriptionActive()) {
    await sendText(phoneNumberId, merchant.whatsappToken, from, "Ce service est temporairement indisponible.");
    return;
  }
  const customer = await getOrCreateCustomer(merchant.id, from);
  const session = await getOrCreateSession(merchant.id, customer.id);
  await markAsRead(phoneNumberId, merchant.whatsappToken, messageId);
  await addMessageToSession(session, "user", content);
  try {
    const { cleanText, actions } = await generateAIResponse({ merchant, customer, session, userMessage: content });
    let orderSummary = null;
    for (const action of actions) {
      if (action.type === "UPDATE_NAME") await updateCustomerName(customer, action.data.name);
      if (action.type === "CREATE_ORDER") {
        const cart = action.data.items && Object.keys(action.data.items).length > 0 ? action.data.items : session.cart;
        const order = await createOrderFromCart(merchant, customer, cart, action.data.address, action.data.payment);
        if (order) { await clearCart(session); orderSummary = order.toWhatsApp(merchant.currency); console.log("Commande créée : " + order.orderNumber); }
      }
    }
    if (cleanText) { await sendText(phoneNumberId, merchant.whatsappToken, from, cleanText); await addMessageToSession(session, "assistant", cleanText); }
    if (orderSummary) { await new Promise(r => setTimeout(r, 1000)); await sendText(phoneNumberId, merchant.whatsappToken, from, orderSummary); }
  } catch (err) {
    console.error("Erreur traitement :", err.message);
    await sendText(phoneNumberId, merchant.whatsappToken, from, "Désolé, petit problème. Pouvez-vous répéter ? 🙏");
  }
};

module.exports = { handleMessage };
`;

// ─── app.js ───
files["app.js"] = `require("dotenv").config();
const express = require("express");
const { connectDB } = require("./config/database");
const webhookRouter = require("./routes/webhook");
const apiRouter = require("./routes/api");
const subscriptionsRouter = require("./routes/subscriptions");

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use((req, res, next) => {
  if ((req.originalUrl === "/webhook" || req.originalUrl === "/subscription/webhook") && req.method === "POST") return next();
  express.json()(req, res, next);
});

app.use("/webhook", webhookRouter);
app.use("/api", apiRouter);
app.use("/subscription", subscriptionsRouter);
app.get("/", (req, res) => res.json({ status: "WhatsApp Commerce IA - En ligne", version: "1.0.0" }));
app.use((err, req, res, next) => { console.error("Erreur :", err.message); res.status(500).json({ error: "Erreur interne" }); });

app.listen(PORT, () => {
  console.log("🚀 Serveur démarré sur http://localhost:" + PORT);
  console.log("📡 Webhook WhatsApp : http://localhost:" + PORT + "/webhook");
  console.log("📋 API REST : http://localhost:" + PORT + "/api");
});

module.exports = app;
`;

// ─── seed.js ───
files["seed.js"] = `require("dotenv").config();
const { connectDB } = require("./config/database");
const { Merchant, Product } = require("./models/index");
const { v4: uuidv4 } = require("uuid");

const seed = async () => {
  await connectDB();
  const existing = await Merchant.findOne({ where: { name: "Boutique Ama - Demo" } });
  if (existing) { console.log("Commerçant démo déjà existant. ID : " + existing.id); process.exit(0); }

  const merchant = await Merchant.create({
    id: uuidv4(),
    name: "Boutique Ama - Demo",
    email: "ama@boutique.tg",
    phoneNumberId: "VOTRE_PHONE_NUMBER_ID",
    whatsappToken: "VOTRE_WHATSAPP_TOKEN",
    businessDescription: "Boutique de mode à Lomé. Vêtements, chaussures et bijoux. Livraison 24h.",
    aiPersona: "Tu t'appelles Ama. Tu es chaleureuse et connais tous les produits par coeur.",
    city: "Lomé", country: "Togo", currency: "FCFA", plan: "pro",
    subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const products = [
    { name: "Robe Wax Élégante", category: "Vêtements", description: "Tissu wax africain. Tailles S-XL.", price: 15000, stock: 25 },
    { name: "Boubou Homme Premium", category: "Vêtements", description: "Brodé, pour cérémonies.", price: 22000, stock: 15 },
    { name: "T-shirt Coton Bio", category: "Vêtements", description: "100% coton bio, couleurs variées.", price: 5000, stock: 50 },
    { name: "Sandales Cuir Artisanales", category: "Chaussures", description: "Faites main, du 36 au 45.", price: 12000, stock: 20 },
    { name: "Baskets Sport", category: "Chaussures", description: "Légères et respirantes.", price: 18000, stock: 12 },
    { name: "Collier Perles Africaines", category: "Bijoux", description: "Artisanal, fait main.", price: 3500, stock: 40 },
    { name: "Bracelet Tissé", category: "Bijoux", description: "Motifs traditionnels togolais.", price: 1500, stock: 100 },
    { name: "Sac à Main Wax", category: "Accessoires", description: "Fermeture éclair, poignée cuir.", price: 9000, stock: 18 },
  ];

  for (const p of products) {
    await Product.create({ id: uuidv4(), merchantId: merchant.id, isAvailable: true, ...p });
  }

  console.log("✅ Commerçant créé : " + merchant.name);
  console.log("✅ " + products.length + " produits ajoutés");
  console.log("\\n🎯 ID Commerçant : " + merchant.id);
  process.exit(0);
};

seed().catch(err => { console.error("Erreur seed :", err); process.exit(1); });
`;

// ─── .env ───
files[".env"] = `PORT=3000
APP_BASE_URL=http://localhost:3000
WHATSAPP_API_URL=https://graph.facebook.com/v19.0
WHATSAPP_APP_SECRET=test
WHATSAPP_VERIFY_TOKEN=montoken123
ANTHROPIC_API_KEY=votre_cle_ici
ANTHROPIC_MODEL=claude-opus-4-6
MONEROO_SECRET_KEY=votre_cle_moneroo
NODE_ENV=development
`;

// ─── Créer tous les fichiers ───
let count = 0;
for (const [filePath, content] of Object.entries(files)) {
  const dir = path.dirname(filePath);
  if (dir !== "." && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log("✅ " + filePath);
  count++;
}

console.log("\n🎉 " + count + " fichiers mis à jour !");
console.log("📦 Lancez maintenant :");
console.log("   npm install");
console.log("   npm run dev");
