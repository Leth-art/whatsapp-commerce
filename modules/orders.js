const { Order, Product } = require("../models/index");
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
