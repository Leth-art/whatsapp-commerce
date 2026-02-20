const fs = require("fs");
const path = require("path");

const files = {};

// ─── models/Product.js ───
files["models/Product.js"] = `const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  category: { type: String, default: "Divers" },
  imageUrl: { type: String, default: "" },
  isAvailable: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ merchantId: 1, isAvailable: 1 });

module.exports = mongoose.model("Product", productSchema);
`;

// ─── models/Customer.js ───
files["models/Customer.js"] = `const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true },
  whatsappNumber: { type: String, required: true },
  name: { type: String, default: null },
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  lastInteraction: { type: Date, default: Date.now },
  lastOrderAt: { type: Date, default: null },
  tags: { type: [String], default: [] },
  notes: { type: String, default: "" },
}, { timestamps: true });

customerSchema.index({ merchantId: 1, whatsappNumber: 1 }, { unique: true });

module.exports = mongoose.model("Customer", customerSchema);
`;

// ─── models/ConversationSession.js ───
files["models/ConversationSession.js"] = `const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"] },
  content: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  messages: { type: [messageSchema], default: [] },
  cart: { type: Map, of: Number, default: new Map() },
  state: { type: String, default: "greeting" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

sessionSchema.index({ merchantId: 1, customerId: 1, isActive: 1 });

sessionSchema.methods.addMessage = function(role, content) {
  this.messages.push({ role, content, timestamp: new Date() });
  if (this.messages.length > 20) this.messages = this.messages.slice(-20);
};

sessionSchema.methods.cartSummary = function(products) {
  if (!this.cart || this.cart.size === 0) return "vide";
  const items = [];
  for (const [productId, qty] of this.cart.entries()) {
    const product = products.find(p => p._id.toString() === productId);
    if (product) items.push(product.name + " x" + qty);
  }
  return items.join(", ") || "vide";
};

module.exports = mongoose.model("ConversationSession", sessionSchema);
`;

// ─── modules/crm.js ───
files["modules/crm.js"] = `const Customer = require("../models/Customer");
const ConversationSession = require("../models/ConversationSession");

const getOrCreateCustomer = async (merchantId, whatsappNumber) => {
  let customer = await Customer.findOneAndUpdate(
    { merchantId, whatsappNumber },
    { lastInteraction: new Date() },
    { new: true }
  );
  if (!customer) {
    customer = await Customer.create({ merchantId, whatsappNumber });
    console.log("Nouveau client : " + whatsappNumber);
  }
  return customer;
};

const getOrCreateSession = async (merchantId, customerId) => {
  let session = await ConversationSession.findOne({ merchantId, customerId, isActive: true });
  if (!session) {
    session = await ConversationSession.create({ merchantId, customerId, messages: [], cart: new Map(), state: "greeting" });
  }
  return session;
};

const updateCustomerName = async (customer, name) => {
  if (!customer.name && name) { customer.name = name; await customer.save(); }
};

const addMessageToSession = async (session, role, content) => {
  session.addMessage(role, content);
  session.markModified("messages");
  await session.save();
};

const clearCart = async (session) => {
  session.cart = new Map();
  session.state = "post_order";
  session.markModified("cart");
  await session.save();
};

module.exports = { getOrCreateCustomer, getOrCreateSession, updateCustomerName, addMessageToSession, clearCart };
`;

// ─── modules/catalog.js ───
files["modules/catalog.js"] = `const Product = require("../models/Product");

const getAllProducts = async (merchantId, availableOnly = true) => {
  const filter = { merchantId };
  if (availableOnly) { filter.isAvailable = true; filter.stock = { $gt: 0 }; }
  return Product.find(filter);
};

const deductStock = async (productId, quantity) => {
  const product = await Product.findById(productId);
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
files["modules/orders.js"] = `const Order = require("../models/Order");
const Product = require("../models/Product");
const { deductStock } = require("./catalog");

const createOrderFromCart = async (merchant, customer, cart, deliveryAddress, paymentMethod) => {
  deliveryAddress = deliveryAddress || "";
  paymentMethod = paymentMethod || "mobile_money";
  if (!cart || cart.size === 0) return null;
  const items = [];
  let totalAmount = 0;
  for (const [productId, qty] of cart.entries()) {
    const product = await Product.findById(productId);
    if (!product || !product.isAvailable) continue;
    const quantity = Math.min(qty, product.stock);
    const total = product.price * quantity;
    totalAmount += total;
    items.push({ productId: product._id, name: product.name, quantity, unitPrice: product.price, total });
    await deductStock(productId, quantity);
  }
  if (!items.length) return null;
  const order = await Order.create({ merchantId: merchant._id, customerId: customer._id, items, totalAmount, deliveryAddress, paymentMethod, status: "pending" });
  customer.totalOrders += 1;
  customer.totalSpent += totalAmount;
  customer.lastOrderAt = new Date();
  await customer.save();
  return order;
};

const updateOrderStatus = async (orderId, status) => {
  const valid = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];
  if (!valid.includes(status)) throw new Error("Statut invalide : " + status);
  return Order.findByIdAndUpdate(orderId, { status }, { new: true });
};

const getMerchantOrders = async (merchantId, status) => {
  const filter = { merchantId };
  if (status) filter.status = status;
  return Order.find(filter).sort({ createdAt: -1 }).populate("customerId", "name whatsappNumber");
};

module.exports = { createOrderFromCart, updateOrderStatus, getMerchantOrders };
`;

// ─── core/whatsappClient.js ───
files["core/whatsappClient.js"] = `const axios = require("axios");
const crypto = require("crypto");

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v19.0";

const sendText = async (phoneNumberId, token, to, message) => {
  const parts = message.length > 4000 ? [message.slice(0, 4000), message.slice(4000)] : [message];
  for (const part of parts) {
    await axios.post(WHATSAPP_API_URL + "/" + phoneNumberId + "/messages",
      { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: part } },
      { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } }
    );
  }
};

const markAsRead = async (phoneNumberId, token, messageId) => {
  await axios.post(WHATSAPP_API_URL + "/" + phoneNumberId + "/messages",
    { messaging_product: "whatsapp", status: "read", message_id: messageId },
    { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } }
  ).catch(() => {});
};

const verifySignature = (rawBody, signature) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from("sha256=" + expected), Buffer.from(signature));
};

const parseWebhook = (data) => {
  const messages = [];
  try {
    for (const entry of data.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const phoneNumberId = value.metadata && value.metadata.phone_number_id;
        for (const msg of value.messages || []) {
          let content = "";
          if (msg.type === "text") content = msg.text.body;
          else if (msg.type === "interactive") {
            const i = msg.interactive;
            content = (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || "";
          } else if (msg.type === "image") content = "[Image envoyée]";
          else if (msg.type === "audio") content = "[Message vocal non supporté]";
          if (content) messages.push({ messageId: msg.id, from: msg.from, phoneNumberId, content, type: msg.type });
        }
      }
    }
  } catch (err) { console.error("Erreur parsing webhook :", err.message); }
  return messages;
};

module.exports = { sendText, markAsRead, verifySignature, parseWebhook };
`;

// ─── routes/api.js ───
files["routes/api.js"] = `const express = require("express");
const router = express.Router();
const Merchant = require("../models/Merchant");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const { updateOrderStatus, getMerchantOrders } = require("../modules/orders");

router.post("/merchants", async (req, res) => {
  try { const m = await Merchant.create(req.body); res.status(201).json({ success: true, merchantId: m._id }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id", async (req, res) => {
  try {
    const m = await Merchant.findById(req.params.id);
    if (!m) return res.status(404).json({ error: "Introuvable" });
    res.json({ id: m._id, name: m.name, city: m.city, plan: m.plan, isActive: m.isActive, subscriptionExpiresAt: m.subscriptionExpiresAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/merchants/:id", async (req, res) => {
  try { const m = await Merchant.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json({ success: true, merchant: m }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post("/merchants/:id/products", async (req, res) => {
  try { const p = await Product.create({ ...req.body, merchantId: req.params.id }); res.status(201).json({ success: true, productId: p._id }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id/products", async (req, res) => {
  try { res.json(await Product.find({ merchantId: req.params.id })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/merchants/:mid/products/:pid", async (req, res) => {
  try { const p = await Product.findOneAndUpdate({ _id: req.params.pid, merchantId: req.params.mid }, req.body, { new: true }); res.json({ success: true, product: p }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete("/merchants/:mid/products/:pid", async (req, res) => {
  try { await Product.findOneAndDelete({ _id: req.params.pid, merchantId: req.params.mid }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/merchants/:id/orders", async (req, res) => {
  try { res.json(await getMerchantOrders(req.params.id, req.query.status)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/orders/:id/status", async (req, res) => {
  try { const o = await updateOrderStatus(req.params.id, req.body.status); res.json({ success: true, status: o.status }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id/customers", async (req, res) => {
  try { res.json(await Customer.find({ merchantId: req.params.id }).sort({ lastInteraction: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
`;

// ─── Créer tous les fichiers ───
let count = 0;
for (const [filePath, content] of Object.entries(files)) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log("✅ " + filePath);
  count++;
}

// Déplacer Order.js si mal placé
if (fs.existsSync("modules/Order.js") && !fs.existsSync("models/Order.js")) {
  fs.renameSync("modules/Order.js", "models/Order.js");
  console.log("✅ models/Order.js déplacé depuis modules/");
}

console.log("\n🎉 " + count + " fichiers créés ! Lancez maintenant : npm run dev");
