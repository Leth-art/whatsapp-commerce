const express = require("express");
const router = express.Router();
const { Merchant, Product, Customer, Order, Announcement } = require("../models/index");
const { updateOrderStatus, getMerchantOrders } = require("../modules/orders");
const { canAddProduct } = require("../modules/planLimits");
const { validateMerchantId } = require("../middleware/security");
const { v4: uuidv4 } = require("uuid");

// Champs autorisés pour la mise à jour d'un commerçant (whitelist)
const MERCHANT_ALLOWED_FIELDS = [
  "name", "shopName", "email", "city", "country", "currency",
  "businessDescription", "aiPersona", "welcomeMessage", "ownerPhone",
  "phoneNumberId", "whatsappToken", "plan", "isActive",
  "subscriptionExpiresAt", "siteTheme", "siteActive", "customSiteUrl",
];

// Champs autorisés pour un produit
const PRODUCT_ALLOWED_FIELDS = [
  "name", "description", "price", "stock", "category",
  "imageUrl", "isAvailable", "language",
];

const filterFields = (body, allowed) => {
  const filtered = {};
  for (const key of allowed) {
    if (body[key] !== undefined) filtered[key] = body[key];
  }
  return filtered;
};

// ─── Merchants ────────────────────────────────────────────────────────────────
router.get("/merchants", async (req, res) => {
  try {
    const merchants = await Merchant.findAll({
      attributes: { exclude: ["whatsappToken"] }, // Ne jamais exposer le token
    });
    res.json(merchants);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/merchants", async (req, res) => {
  try {
    const data = filterFields(req.body, MERCHANT_ALLOWED_FIELDS);
    const merchant = await Merchant.create(data);
    res.status(201).json({ success: true, merchantId: merchant.id, name: merchant.name });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id", validateMerchantId, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id, {
      attributes: { exclude: ["whatsappToken"] },
    });
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });
    res.json(merchant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/merchants/:id", validateMerchantId, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });

    // Whitelist des champs modifiables
    const data = filterFields(req.body, MERCHANT_ALLOWED_FIELDS);

    // Empêcher la modification de champs critiques via l'API publique
    delete data.plan;
    delete data.isActive;
    delete data.subscriptionExpiresAt;

    await merchant.update(data);
    res.json({ success: true, merchant });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id/stats", validateMerchantId, async (req, res) => {
  try {
    const merchantId = req.params.id;
    const totalOrders = await Order.count({ where: { merchantId } });
    const totalCustomers = await Customer.count({ where: { merchantId } });
    const pendingOrders = await Order.count({ where: { merchantId, status: "pending" } });
    const allOrders = await Order.findAll({ where: { merchantId } });
    const totalRevenue = allOrders
      .filter(o => o.status !== "cancelled")
      .reduce((sum, o) => sum + o.totalAmount, 0);
    res.json({ totalOrders, totalCustomers, totalRevenue, pendingOrders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Produits ─────────────────────────────────────────────────────────────────
router.post("/merchants/:id/products", validateMerchantId, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });

    const currentCount = await Product.count({ where: { merchantId: req.params.id } });
    const check = await canAddProduct(merchant, currentCount);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    const data = filterFields(req.body, PRODUCT_ALLOWED_FIELDS);
    if (!data.name || data.price === undefined) {
      return res.status(400).json({ error: "Nom et prix requis" });
    }
    data.price = Math.abs(parseFloat(data.price)) || 0;
    data.stock = Math.abs(parseInt(data.stock)) || 0;

    const product = await Product.create({ ...data, id: uuidv4(), merchantId: req.params.id });
    res.status(201).json({ success: true, productId: product.id, name: product.name });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id/products", validateMerchantId, async (req, res) => {
  try {
    const products = await Product.findAll({ where: { merchantId: req.params.id } });
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/merchants/:mid/products/:pid", validateMerchantId, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.pid);
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    // Vérifier que le produit appartient bien au commerçant
    if (product.merchantId !== req.params.mid) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    const data = filterFields(req.body, PRODUCT_ALLOWED_FIELDS);
    if (data.price !== undefined) data.price = Math.abs(parseFloat(data.price)) || 0;
    await product.update(data);
    res.json({ success: true, product });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete("/merchants/:mid/products/:pid", validateMerchantId, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.pid);
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    // Vérifier que le produit appartient bien au commerçant
    if (product.merchantId !== req.params.mid) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    await product.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Commandes ────────────────────────────────────────────────────────────────
router.get("/merchants/:id/orders", validateMerchantId, async (req, res) => {
  try {
    const orders = await getMerchantOrders(req.params.id, req.query.status);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/orders/:id/status", async (req, res) => {
  try {
    const VALID_STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(", ")}` });
    }
    const order = await updateOrderStatus(req.params.id, status);
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    res.json({ success: true, status: order.status });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── Clients ──────────────────────────────────────────────────────────────────
router.get("/merchants/:id/customers", validateMerchantId, async (req, res) => {
  try {
    const customers = await Customer.findAll({
      where: { merchantId: req.params.id },
      order: [["lastInteraction", "DESC"]],
      limit: 500, // Limite pour éviter les dumps massifs
    });
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Demande de paiement ──────────────────────────────────────────────────────
router.post("/merchants/:id/payment-request", validateMerchantId, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });

    const { plan, transactionRef, amount, currency } = req.body;

    // Validation
    const VALID_PLANS = ["starter", "pro", "business"];
    if (!VALID_PLANS.includes(plan)) {
      return res.status(400).json({ error: "Plan invalide" });
    }
    if (!transactionRef || transactionRef.length < 3) {
      return res.status(400).json({ error: "Référence transaction invalide" });
    }

    const { sendText } = require("../core/whatsappClient");
    const ADMIN_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ADMIN_TOKEN = process.env.WHATSAPP_TOKEN;
    const ADMIN_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || "22871454079";

    const message =
      `💳 *Nouvelle demande de paiement*\n\n` +
      `🏪 Boutique : *${merchant.name}*\n` +
      `📱 Tél : ${merchant.ownerPhone}\n` +
      `📧 Email : ${merchant.email || '-'}\n` +
      `📦 Plan demandé : *${plan.toUpperCase()}*\n` +
      `💰 Montant : *${amount} ${currency}*\n` +
      `🔖 Réf transaction : *${transactionRef}*\n\n` +
      `👉 Validez sur : ${process.env.APP_BASE_URL}/admin`;

    if (ADMIN_PHONE_ID && ADMIN_TOKEN) {
      await sendText(ADMIN_PHONE_ID, ADMIN_TOKEN, ADMIN_NUMBER, message).catch(() => {});
    }

    await merchant.update({
      lastPaymentId: `${plan}|${transactionRef}|${new Date().toISOString()}`
    });

    res.json({ success: true, message: "Demande enregistrée. Votre compte sera réactivé sous 24h." });
  } catch (err) {
    console.error("Erreur payment-request:", err);
    res.status(500).json({ error: err.message });
  }
});


// ─── Annonces ─────────────────────────────────────────────────────────────────

// GET public — bandeau actif
router.get("/announcements/active", async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      where: { isActive: true, showBanner: true },
      order: [["createdAt", "DESC"]],
    });
    if (!announcement) return res.json(null);
    res.json({
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      type: announcement.type,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET admin — toutes les annonces
router.get("/admin/announcements", async (req, res) => {
  try {
    const announcements = await Announcement.findAll({
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    res.json(announcements);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST admin — créer une annonce
router.post("/admin/announcements", async (req, res) => {
  try {
    const { title, message, type, showBanner, sendEmail } = req.body;
    if (!title || !message) return res.status(400).json({ error: "Titre et message requis" });

    const { v4: uuidv4 } = require("uuid");
    const announcement = await Announcement.create({
      id: uuidv4(),
      title: title.slice(0, 200),
      message: message.slice(0, 2000),
      type: ["info", "warning", "promo", "update"].includes(type) ? type : "info",
      showBanner: showBanner !== false,
      isActive: true,
    });

    let emailResult = { skipped: true };
    if (sendEmail) {
      try {
        const { sendAnnouncementEmails } = require("../modules/announcements");
        emailResult = await sendAnnouncementEmails(title, message.replace(/\n/g, "<br>"), message);
        await announcement.update({ emailSent: true, emailCount: emailResult.sent || 0 });
      } catch (err) {
        console.error("Email error:", err.message);
      }
    }

    res.json({ success: true, announcement, emailResult });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH admin — activer/désactiver
router.patch("/admin/announcements/:id", async (req, res) => {
  try {
    const ann = await Announcement.findByPk(req.params.id);
    if (!ann) return res.status(404).json({ error: "Introuvable" });
    await ann.update({ isActive: req.body.isActive, showBanner: req.body.showBanner });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE admin
router.delete("/admin/announcements/:id", async (req, res) => {
  try {
    const ann = await Announcement.findByPk(req.params.id);
    if (!ann) return res.status(404).json({ error: "Introuvable" });
    await ann.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;