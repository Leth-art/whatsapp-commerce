const { Product } = require("../models/index");
const { Op } = require("sequelize");

/**
 * Retourne tous les produits disponibles d'un commerçant.
 */
const getAllProducts = async (merchantId, availableOnly = true) => {
  const where = { merchantId };
  if (availableOnly) {
    where.isAvailable = true;
    where.stock = { [Op.gt]: 0 };
  }
  return Product.findAll({ where });
};

/**
 * Recherche un produit par nom ou description.
 */
const searchProducts = async (merchantId, query) => {
  return Product.findAll({
    where: {
      merchantId,
      isAvailable: true,
      [Op.or]: [
        { name: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
      ],
    },
  });
};

/**
 * Déduit le stock après une vente.
 */
const deductStock = async (productId, quantity) => {
  const product = await Product.findByPk(productId);
  if (!product || product.stock < quantity) return false;
  const newStock = product.stock - quantity;
  await product.update({
    stock: newStock,
    isAvailable: newStock > 0,
  });
  return true;
};

/**
 * Formate le catalogue en texte WhatsApp pour le contexte de l'IA.
 */
const formatCatalogForAI = async (merchantId, currency = "FCFA") => {
  const products = await getAllProducts(merchantId);
  if (!products.length) return "Aucun produit disponible pour le moment.";

  const categories = {};
  for (const p of products) {
    const cat = p.category || "Divers";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }

  const lines = ["📦 *CATALOGUE DISPONIBLE :*\n"];
  for (const [cat, items] of Object.entries(categories)) {
    lines.push(`*${cat.toUpperCase()}*`);
    for (const p of items) {
      const stockAlert = p.stock <= 5 ? ` ⚠️ Plus que ${p.stock} en stock !` : "";
      const photo = p.imageUrl ? " 📸" : "";
      lines.push(
        `  • *${p.name}*${photo} — ${p.price.toLocaleString("fr-FR")} ${currency}${stockAlert}`,
        `    ${p.description || ""}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};

module.exports = {
  getAllProducts,
  searchProducts,
  deductStock,
  formatCatalogForAI,
};