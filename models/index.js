const { sequelize } = require("../config/database");
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
  return lines.join("\n");
};

Order.prototype.statusMessage = function() {
  const messages = { confirmed: "✅ Commande confirmée !", preparing: "👨‍🍳 En cours de préparation.", ready: "🎉 Prête ! Livraison en route.", delivered: "📦 Livrée. Merci !", cancelled: "❌ Annulée." };
  return (messages[this.status] || "Statut mis à jour.") + "\n\nN° *" + this.orderNumber + "*";
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
