const Order = require("../models/Order");
const Product = require("../models/Product");
const { deductStock } = require("./catalog");

/**
 * Crée une commande depuis le panier de la session.
 * @param {Object} merchant
 * @param {Object} customer
 * @param {Map} cart  - Map { productId => quantity }
 * @param {string} deliveryAddress
 * @param {string} paymentMethod
 */
const createOrderFromCart = async (merchant, customer, cart, deliveryAddress = "", paymentMethod = "mobile_money") => {
  if (!cart || cart.size === 0) return null;

  const items = [];
  let totalAmount = 0;

  for (const [productId, qty] of cart.entries()) {
    const product = await Product.findById(productId);
    if (!product || !product.isAvailable) continue;

    const quantity = Math.min(qty, product.stock);
    const total = product.price * quantity;
    totalAmount += total;

    items.push({
      productId: product._id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      total,
    });

    await deductStock(productId, quantity);
  }

  if (!items.length) return null;

  const order = await Order.create({
    merchantId: merchant._id,
    customerId: customer._id,
    items,
    totalAmount,
    deliveryAddress,
    paymentMethod,
    status: "pending",
  });

  // Mettre à jour les stats client
  customer.totalOrders += 1;
  customer.totalSpent += totalAmount;
  customer.lastOrderAt = new Date();
  await customer.save();

  return order;
};

/**
 * Met à jour le statut d'une commande.
 */
const updateOrderStatus = async (orderId, status) => {
  const validStatuses = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) throw new Error(`Statut invalide : ${status}`);
  return Order.findByIdAndUpdate(orderId, { status }, { new: true });
};

/**
 * Liste les commandes d'un commerçant avec filtre optionnel.
 */
const getMerchantOrders = async (merchantId, status = null) => {
  const filter = { merchantId };
  if (status) filter.status = status;
  return Order.find(filter).sort({ createdAt: -1 }).populate("customerId", "name whatsappNumber");
};

module.exports = {
  createOrderFromCart,
  updateOrderStatus,
  getMerchantOrders,
};