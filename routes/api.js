const express = require("express");
const router = express.Router();
const { Merchant, Product, Customer, Order } = require("../models/index");
// orders module replaced with inline Sequelize
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

    // Protection: ces champs ne peuvent être modifiés que via les routes admin
    // SAUF si la requête vient avec un header admin (vérifié par requireApiKey)
    const isAdminRequest = req.headers['x-admin'] === 'true';
    if (!isAdminRequest) {
      delete data.plan;
      delete data.isActive;
      delete data.subscriptionExpiresAt;
    }

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
    if (!merchant.isActive) return res.status(403).json({ error: "Compte suspendu. Renouvelez votre abonnement pour ajouter des produits." });

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
    const where = { merchantId: req.params.id };
    if (req.query.status) where.status = req.query.status;

    const orders = await Order.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: 500,
    });

    // Joindre les infos client pour chaque commande
    const { Customer } = require("../models/index");
    const ordersWithCustomer = await Promise.all(orders.map(async (o) => {
      const plain = o.toJSON();
      if (o.customerId) {
        const customer = await Customer.findByPk(o.customerId, {
          attributes: ["id", "name", "whatsappNumber"],
        });
        plain.customer = customer ? customer.toJSON() : null;
      }
      return plain;
    }));

    res.json(ordersWithCustomer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/orders/:id/status", async (req, res) => {
  try {
    const VALID_STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(", ")}` });
    }
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    await order.update({ status });
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


// ─── Routes Admin ─────────────────────────────────────────────────────────────

// Activer/renouveler abonnement
router.post("/admin/activate/:id", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });
    const { plan } = req.body;
    const validPlans = ["starter", "pro", "business"];
    const finalPlan = validPlans.includes(plan) ? plan : merchant.plan || "starter";
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await merchant.update({ plan: finalPlan, isActive: true, subscriptionExpiresAt: expiresAt, lastPaymentId: null });
    res.json({ success: true, plan: finalPlan, expiresAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Activer/désactiver boutique
router.post("/admin/toggle/:id", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });
    await merchant.update({ isActive: req.body.isActive });
    res.json({ success: true, isActive: req.body.isActive });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Supprimer une boutique
router.delete("/admin/merchants/:id", async (req, res) => {
  try {
    const { ConversationSession } = require("../models/index");
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });
    await Product.destroy({ where: { merchantId: req.params.id } });
    await Order.destroy({ where: { merchantId: req.params.id } });
    await Customer.destroy({ where: { merchantId: req.params.id } });
    await ConversationSession.destroy({ where: { merchantId: req.params.id } });
    await merchant.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Marquer comme relancé
router.post("/admin/merchants/:id/mark-reminded", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });
    try { await merchant.update({ lastRemindedAt: new Date() }); } catch {}
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Annonces ─────────────────────────────────────────────────────────────────
router.get("/announcements/active", async (req, res) => {
  try {
    const { Announcement } = require("../models/index");
    const ann = await Announcement.findOne({
      where: { isActive: true, showBanner: true },
      order: [["createdAt", "DESC"]],
    });
    if (!ann) return res.json(null);
    res.json({ id: ann.id, title: ann.title, message: ann.message, type: ann.type });
  } catch { res.json(null); }
});

router.get("/admin/announcements", async (req, res) => {
  try {
    const { Announcement } = require("../models/index");
    const anns = await Announcement.findAll({ order: [["createdAt", "DESC"]], limit: 50 });
    res.json(anns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/admin/announcements", async (req, res) => {
  try {
    const { Announcement } = require("../models/index");
    const { title, message, type, showBanner, sendEmail } = req.body;
    if (!title || !message) return res.status(400).json({ error: "Titre et message requis" });
    const ann = await Announcement.create({
      id: uuidv4(), title: title.slice(0,200), message: message.slice(0,2000),
      type: ["info","warning","promo","update"].includes(type) ? type : "info",
      showBanner: showBanner !== false, isActive: true,
    });
    let emailResult = { skipped: true };
    if (sendEmail) {
      try {
        const { sendAnnouncementEmails } = require("../modules/announcements");
        emailResult = await sendAnnouncementEmails(title, message.replace(/\n/g,"<br>"), message);
        await ann.update({ emailSent: true, emailCount: emailResult.sent || 0 });
      } catch (err) { console.error("Email error:", err.message); }
    }
    res.json({ success: true, announcement: ann, emailResult });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/announcements/:id", async (req, res) => {
  try {
    const { Announcement } = require("../models/index");
    const ann = await Announcement.findByPk(req.params.id);
    if (!ann) return res.status(404).json({ error: "Introuvable" });
    await ann.update({ isActive: req.body.isActive, showBanner: req.body.showBanner });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/admin/announcements/:id", async (req, res) => {
  try {
    const { Announcement } = require("../models/index");
    const ann = await Announcement.findByPk(req.params.id);
    if (!ann) return res.status(404).json({ error: "Introuvable" });
    await ann.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Upload image produit ─────────────────────────────────────────────────────
router.post("/merchants/:id/products/:pid/image", validateMerchantId, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "Image requise" });
    const product = await Product.findByPk(req.params.pid);
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    if (product.merchantId !== req.params.id) return res.status(403).json({ error: "Accès refusé" });

    let imageUrl = "";
    // Validate image size (max 5MB base64 ≈ 6.7MB string)
    if (imageBase64.length > 7000000) {
      return res.status(413).json({ error: "Image trop grande. Maximum 5MB." });
    }
    try {
      const cloudinary = require("cloudinary").v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      const result = await cloudinary.uploader.upload(imageBase64, {
        folder: "wazibot_products",
        transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto:good" }],
      });
      imageUrl = result.secure_url;
    } catch(e) {
      console.error("Cloudinary error:", e.message);
      imageUrl = (imageBase64.length < 500000 && imageBase64.startsWith("data:")) ? imageBase64 : "";
    }

    await product.update({ imageUrl });
    res.json({ success: true, imageUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;