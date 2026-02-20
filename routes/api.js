const express = require("express");
const router = express.Router();
const { Merchant, Product, Customer, Order } = require("../models/index");
const { updateOrderStatus, getMerchantOrders } = require("../modules/orders");

router.get("/merchants", async (req, res) => {
  try {
    const merchants = await Merchant.findAll();
    res.json(merchants);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/merchants", async (req, res) => {
  try {
    const merchant = await Merchant.create(req.body);
    res.status(201).json({ success: true, merchantId: merchant.id, name: merchant.name });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Commercant introuvable" });
    res.json(merchant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/merchants/:id", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: "Commercant introuvable" });
    await merchant.update(req.body);
    res.json({ success: true, merchant });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id/stats", async (req, res) => {
  try {
    const merchantId = req.params.id;
    const totalOrders = await Order.count({ where: { merchantId } });
    const totalCustomers = await Customer.count({ where: { merchantId } });
    const pendingOrders = await Order.count({ where: { merchantId, status: "pending" } });
    const allOrders = await Order.findAll({ where: { merchantId } });
    const totalRevenue = allOrders.filter(o => o.status !== "cancelled").reduce((sum, o) => sum + o.totalAmount, 0);
    res.json({ totalOrders, totalCustomers, totalRevenue, pendingOrders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/merchants/:id/products", async (req, res) => {
  try {
    const { v4: uuidv4 } = require("uuid");
    const product = await Product.create({ ...req.body, id: uuidv4(), merchantId: req.params.id });
    res.status(201).json({ success: true, productId: product.id, name: product.name });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id/products", async (req, res) => {
  try {
    const products = await Product.findAll({ where: { merchantId: req.params.id } });
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/merchants/:mid/products/:pid", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.pid);
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    await product.update(req.body);
    res.json({ success: true, product });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete("/merchants/:mid/products/:pid", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.pid);
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    await product.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/merchants/:id/orders", async (req, res) => {
  try {
    const orders = await getMerchantOrders(req.params.id, req.query.status);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/orders/:id/status", async (req, res) => {
  try {
    const order = await updateOrderStatus(req.params.id, req.body.status);
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    res.json({ success: true, status: order.status });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get("/merchants/:id/customers", async (req, res) => {
  try {
    const customers = await Customer.findAll({ where: { merchantId: req.params.id }, order: [["lastInteraction", "DESC"]] });
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;